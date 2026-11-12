import {
  ExecutionResult,
  StepExecutionTrace,
  WorkflowExecutionContext,
  WorkflowGraph,
  WorkflowNode,
} from '../types/workflow';
import { compileGraphTopology } from './topologicalSort';
import { resolveExpressions } from './expressionResolver';

export type NodeHandler = (params: {
  node: WorkflowNode;
  resolvedConfig: Record<string, unknown>;
  context: WorkflowExecutionContext;
}) => Promise<Record<string, unknown>>;

export class FlowPilotExecutor {
  private handlers = new Map<string, NodeHandler>();

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * Register a custom driver for a specific node type.
   */
  public registerHandler(nodeType: string, handler: NodeHandler): void {
    this.handlers.set(nodeType, handler);
  }

  /**
   * Executes a workflow graph given an initial trigger payload.
   */
  public async execute(
    graph: WorkflowGraph,
    triggerPayload: Record<string, unknown> = {},
    options: { executionId?: string } = {}
  ): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const executionId = options.executionId || `exec_${Math.random().toString(36).substring(2, 10)}`;

    const topology = compileGraphTopology(graph);
    const traces: StepExecutionTrace[] = [];

    const context: WorkflowExecutionContext = {
      executionId,
      workflowId: graph.id,
      trigger: {
        type: graph.nodes.find((n) => n.category === 'trigger')?.type || 'trigger.manual',
        payload: triggerPayload,
        timestamp: startedAt,
      },
      steps: {},
      skippedNodeIds: new Set<string>(),
    };

    let executionError: string | undefined;

    for (const node of topology.orderedNodes) {
      // Check if this node was skipped due to conditional branching
      if (context.skippedNodeIds.has(node.id)) {
        traces.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.name,
          status: 'skipped',
          startedAt: new Date().toISOString(),
          durationMs: 0,
          input: {},
          output: {},
        });
        continue;
      }

      const stepStart = Date.now();
      const stepStartedAt = new Date().toISOString();

      try {
        // Resolve dynamic expressions in node configuration
        const resolvedConfig = resolveExpressions(node.config, context) as Record<string, unknown>;

        // Execute node driver
        const handler = this.handlers.get(node.type);
        let output: Record<string, unknown> = {};

        if (handler) {
          output = await handler({ node, resolvedConfig, context });
        } else {
          // Default pass-through behavior if no custom driver registered
          output = { ...resolvedConfig, _executed: true };
        }

        const durationMs = Date.now() - stepStart;

        // Record in context
        context.steps[node.id] = {
          status: 'completed',
          output,
          durationMs,
        };

        traces.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.name,
          status: 'completed',
          startedAt: stepStartedAt,
          completedAt: new Date().toISOString(),
          durationMs,
          input: resolvedConfig,
          output,
        });

        // Handle Branching logic for If/Else
        if (node.type === 'logic.ifElse') {
          const conditionPassed = Boolean(output.result);
          const outgoingEdges = topology.adjacencyList.get(node.id) || [];

          for (const edge of outgoingEdges) {
            // If condition true, skip false branch; if false, skip true branch
            if (conditionPassed && edge.sourceHandle === 'false') {
              this.markSubtreeSkipped(edge.targetId, topology.adjacencyList, context.skippedNodeIds);
            } else if (!conditionPassed && edge.sourceHandle === 'true') {
              this.markSubtreeSkipped(edge.targetId, topology.adjacencyList, context.skippedNodeIds);
            }
          }
        }
      } catch (err: unknown) {
        const durationMs = Date.now() - stepStart;
        const errorMessage = err instanceof Error ? err.message : String(err);
        executionError = errorMessage;

        context.steps[node.id] = {
          status: 'failed',
          output: { error: errorMessage },
          durationMs,
        };

        traces.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.name,
          status: 'failed',
          startedAt: stepStartedAt,
          completedAt: new Date().toISOString(),
          durationMs,
          input: (node.config as Record<string, unknown>) || {},
          output: {},
          error: errorMessage,
        });

        // Stop execution on failure unless node is configured to continue
        const continueOnError = Boolean((node.config as Record<string, unknown>)?.continueOnError);
        if (!continueOnError) {
          break;
        }
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    return {
      executionId,
      workflowId: graph.id,
      status: executionError ? 'failed' : 'completed',
      startedAt,
      completedAt,
      durationMs,
      traces,
      error: executionError,
    };
  }

  /**
   * Recursively marks downstream nodes as skipped when a conditional branch is not taken.
   */
  private markSubtreeSkipped(
    startNodeId: string,
    adjacencyList: Map<string, Array<{ targetId: string; sourceHandle?: string }>>,
    skippedSet: Set<string>
  ): void {
    skippedSet.add(startNodeId);
    const children = adjacencyList.get(startNodeId) || [];
    for (const child of children) {
      if (!skippedSet.has(child.targetId)) {
        this.markSubtreeSkipped(child.targetId, adjacencyList, skippedSet);
      }
    }
  }

  /**
   * Default built-in drivers for foundational MVP nodes.
   */
  private registerDefaultHandlers(): void {
    // 1. Manual Trigger
    this.registerHandler('trigger.manual', async ({ context }) => {
      return { triggered: true, payload: context.trigger.payload };
    });

    // 2. Webhook Trigger
    this.registerHandler('trigger.webhook', async ({ context }) => {
      return { webhookReceived: true, data: context.trigger.payload };
    });

    // 3. If/Else Logic Node
    this.registerHandler('logic.ifElse', async ({ resolvedConfig }) => {
      const field = resolvedConfig.field;
      const operator = String(resolvedConfig.operator || 'equals');
      const targetValue = resolvedConfig.value;

      let result = false;
      switch (operator) {
        case 'equals':
          result = String(field) === String(targetValue);
          break;
        case 'not_equals':
          result = String(field) !== String(targetValue);
          break;
        case 'contains':
          result = String(field).toLowerCase().includes(String(targetValue).toLowerCase());
          break;
        case 'greater_than':
          result = Number(field) > Number(targetValue);
          break;
        case 'less_than':
          result = Number(field) < Number(targetValue);
          break;
        case 'is_empty':
          result = field === undefined || field === null || field === '';
          break;
        case 'is_not_empty':
          result = field !== undefined && field !== null && field !== '';
          break;
        default:
          result = String(field) === String(targetValue);
      }

      return { result, field, operator, targetValue };
    });

    // 4. Data Transform Node
    this.registerHandler('data.transform', async ({ resolvedConfig }) => {
      return { transformed: true, data: resolvedConfig.data || resolvedConfig };
    });
  }
}

