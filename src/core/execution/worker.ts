import { executionStore } from '../../lib/storage/executionStore';
import { workflowStore } from '../../lib/storage/workflowStore';
import { resolveExpressions } from '../engine/expressionResolver';
import { nodeRuntimeRegistry } from '../runtime/nodeRuntimeRegistry';
import { NodeExecutionContext } from '../runtime/types';
import { maskSensitiveData } from '../security/masking';
import { WorkflowGraph, WorkflowNode } from '../types/workflow';
import { ExecutionPlanner } from './planner';
import { ExecutionStateManager } from './stateManager';
import {
  NodeExecutionStatus,
  StepExecutionRecord,
  WorkflowExecutionRecord,
  WorkflowExecutionStatus,
} from './types';

export interface WorkerJob {
  executionId: string;
  workflowId: string;
  payload: Record<string, unknown>;
  signal: AbortSignal;
}

export class ExecutionWorker {
  /**
   * Executes a queued workflow job to completion or failure.
   */
  public async processJob(job: WorkerJob): Promise<WorkflowExecutionRecord> {
    const { executionId, workflowId, payload, signal } = job;
    const startTime = Date.now();

    // 1. Fetch current execution record
    let record = await executionStore.getById(executionId);
    if (!record) {
      throw new Error(`Execution record "${executionId}" does not exist.`);
    }

    const stateHistory = [...record.stateHistory];
    const updateStatus = async (
      newStatus: WorkflowExecutionStatus,
      reason?: string
    ): Promise<void> => {
      ExecutionStateManager.validateWorkflowTransition(record!.status, newStatus, executionId);
      record!.status = newStatus;
      stateHistory.push({
        status: newStatus,
        timestamp: new Date().toISOString(),
        reason,
      });
      record = await executionStore.update(executionId, {
        status: newStatus,
        stateHistory,
        updatedAt: new Date().toISOString(),
      });
    };

    try {
      // 2. Transition QUEUED -> VALIDATING
      await updateStatus('VALIDATING', 'Analyzing and compiling graph topology');

      if (signal.aborted) {
        await updateStatus('CANCELLED', 'Aborted prior to graph planning');
        return record;
      }

      // 3. Retrieve Workflow Graph
      const workflow = workflowStore.getById(workflowId);
      if (!workflow) {
        throw new Error(`Workflow with ID "${workflowId}" was not found.`);
      }

      // 4. Generate Execution Plan (Topological DAG, stages, cycles check)
      const plan = ExecutionPlanner.plan(workflow);

      // 5. Transition VALIDATING -> RUNNING
      await updateStatus('RUNNING', 'Starting stage-by-stage node execution');

      const traces: StepExecutionRecord[] = [];
      const stepsContext: Record<
        string,
        {
          status: NodeExecutionStatus;
          output: Record<string, unknown>;
          durationMs: number;
        }
      > = {};

      const skippedNodeIds = new Set<string>();

      // Initialize all nodes as PENDING in traces
      for (const node of plan.orderedNodes) {
        traces.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.name,
          status: 'PENDING',
          durationMs: 0,
          attempts: 0,
          retryCount: 0,
          input: {},
          output: {},
        });
      }

      let workflowError: string | undefined;

      // 6. Stage-by-Stage DAG Execution Loop
      for (let stageIdx = 0; stageIdx < plan.stages.length; stageIdx++) {
        if (signal.aborted) {
          workflowError = 'Execution cancelled by user.';
          break;
        }

        const stage = plan.stages[stageIdx];

        // Execute all independent nodes within the current stage in parallel
        await Promise.all(
          stage.map(async (node) => {
            if (workflowError && !node.config?.continueOnError) {
              return;
            }

            const trace = traces.find((t) => t.nodeId === node.id)!;

            // Check if node was marked SKIPPED by upstream condition
            if (skippedNodeIds.has(node.id)) {
              ExecutionStateManager.validateNodeTransition(trace.status, 'SKIPPED', node.id);
              trace.status = 'SKIPPED';
              trace.completedAt = new Date().toISOString();
              return;
            }

            // Check cancellation signal
            if (signal.aborted) {
              ExecutionStateManager.validateNodeTransition(trace.status, 'CANCELLED', node.id);
              trace.status = 'CANCELLED';
              return;
            }

            // Node transition: PENDING -> READY -> RUNNING
            ExecutionStateManager.validateNodeTransition(trace.status, 'READY', node.id);
            trace.status = 'READY';
            ExecutionStateManager.validateNodeTransition(trace.status, 'RUNNING', node.id);
            trace.status = 'RUNNING';
            trace.startedAt = new Date().toISOString();
            const stepStart = Date.now();
            trace.attempts = 1;

            const nodeContext: NodeExecutionContext = {
              executionId,
              workflowId,
              node,
              trigger: record!.trigger,
              steps: stepsContext,
              signal,
            };

            try {
              // Context for expression resolution
              const resolverContext = {
                executionId,
                workflowId,
                trigger: record!.trigger,
                steps: Object.fromEntries(
                  Object.entries(stepsContext).map(([k, v]) => [
                    k,
                    {
                      status: v.status.toLowerCase() as any,
                      output: v.output,
                      durationMs: v.durationMs,
                    },
                  ])
                ),
                skippedNodeIds,
              };

              // Resolve dynamic templated expressions (e.g. {{ $trigger.payload.foo }})
              const resolvedConfig = resolveExpressions(
                node.config || {},
                resolverContext
              ) as Record<string, unknown>;

              trace.input = maskSensitiveData(resolvedConfig);

              // Retrieve runtime driver and execute
              const driver = nodeRuntimeRegistry.getDriver(node.type);
              const output = await driver(nodeContext, resolvedConfig);

              const duration = Date.now() - stepStart;
              trace.durationMs = duration;
              trace.completedAt = new Date().toISOString();
              ExecutionStateManager.validateNodeTransition(trace.status, 'COMPLETED', node.id);
              trace.status = 'COMPLETED';
              trace.output = maskSensitiveData(output);

              stepsContext[node.id] = {
                status: 'COMPLETED',
                output,
                durationMs: duration,
              };

              // Branching logic: if logic.ifElse, evaluate branch route and propagate skips
              if (node.type === 'logic.ifElse' || node.category === 'logic') {
                const activeBranch =
                  output.branch === 'false' || output.result === false ? 'false' : 'true';

                const newlySkipped = ExecutionPlanner.calculateSkippedNodes(
                  node.id,
                  activeBranch,
                  plan.adjacencyList,
                  plan.predecessors,
                  skippedNodeIds
                );

                for (const id of newlySkipped) {
                  skippedNodeIds.add(id);
                }
              }
            } catch (err: unknown) {
              const duration = Date.now() - stepStart;
              trace.durationMs = duration;
              trace.completedAt = new Date().toISOString();
              const errMsg = err instanceof Error ? err.message : String(err);
              trace.error = errMsg;

              if (signal.aborted) {
                ExecutionStateManager.validateNodeTransition(trace.status, 'CANCELLED', node.id);
                trace.status = 'CANCELLED';
              } else {
                ExecutionStateManager.validateNodeTransition(trace.status, 'FAILED', node.id);
                trace.status = 'FAILED';

                stepsContext[node.id] = {
                  status: 'FAILED',
                  output: { error: errMsg },
                  durationMs: duration,
                };

                const continueOnError = Boolean(node.config?.continueOnError);
                if (!continueOnError) {
                  workflowError = `Node "${node.name}" (${node.id}) failed: ${errMsg}`;
                }
              }
            }
          })
        );

        if (workflowError) {
          break;
        }
      }

      const totalDuration = Date.now() - startTime;
      const completedAt = new Date().toISOString();

      // 7. Final Workflow State Determination
      if (signal.aborted) {
        await updateStatus('CANCELLED', 'Workflow execution was cancelled by user');
        record = await executionStore.update(executionId, {
          durationMs: totalDuration,
          completedAt,
          traces,
          error: 'Execution cancelled',
        });
      } else if (workflowError) {
        await updateStatus('FAILED', workflowError);
        record = await executionStore.update(executionId, {
          durationMs: totalDuration,
          completedAt,
          traces,
          error: workflowError,
        });

        // Update workflow error counters
        workflow.executionCount = (workflow.executionCount || 0) + 1;
        workflow.failureCount = (workflow.failureCount || 0) + 1;
        workflow.lastExecutedAt = completedAt;
        workflowStore.save(workflow);
      } else {
        await updateStatus('COMPLETED', 'All workflow nodes executed successfully');
        record = await executionStore.update(executionId, {
          durationMs: totalDuration,
          completedAt,
          traces,
        });

        // Update workflow success counters
        workflow.executionCount = (workflow.executionCount || 0) + 1;
        workflow.successCount = (workflow.successCount || 0) + 1;
        workflow.lastExecutedAt = completedAt;
        workflowStore.save(workflow);
      }

      return record;
    } catch (err: unknown) {
      const totalDuration = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);

      if (record!.status !== 'CANCELLED' && record!.status !== 'FAILED') {
        try {
          await updateStatus('FAILED', errMsg);
        } catch {
          // ignore state transition error during failure unwinding
        }
      }

      record = await executionStore.update(executionId, {
        durationMs: totalDuration,
        completedAt: new Date().toISOString(),
        error: errMsg,
      });

      return record;
    }
  }
}

export const executionWorker = new ExecutionWorker();
