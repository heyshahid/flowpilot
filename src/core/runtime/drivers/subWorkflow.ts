import { NodeDriver } from '../types';
import { workflowStore } from '../../../lib/storage/workflowStore';
import { executionQueue } from '../../execution/queue';

const MAX_SUBWORKFLOW_DEPTH = 5;

export const subWorkflowDriver: NodeDriver = async (context, resolvedConfig) => {
  const subWorkflowId = String(resolvedConfig.subWorkflowId || '').trim();

  if (!subWorkflowId) {
    throw new Error('Sub-Workflow node requires a valid "subWorkflowId" parameter.');
  }

  // 1. Circular reference & recursion protection
  const callStack: string[] = Array.isArray((context.trigger.payload as any)?.$callStack)
    ? [...((context.trigger.payload as any).$callStack as string[])]
    : [context.workflowId];

  if (callStack.includes(subWorkflowId)) {
    throw new Error(
      `Circular workflow recursion detected: "${[...callStack, subWorkflowId].join(' -> ')}".`
    );
  }

  // 2. Verify existence of target sub-workflow
  const targetWorkflow = workflowStore.getById(subWorkflowId);
  if (!targetWorkflow) {
    throw new Error(`Target sub-workflow "${subWorkflowId}" does not exist in workspace.`);
  }

  // 3. Enforce maximum nesting depth
  if (callStack.length >= MAX_SUBWORKFLOW_DEPTH) {
    throw new Error(
      `Maximum sub-workflow nesting depth limit of ${MAX_SUBWORKFLOW_DEPTH} exceeded.`
    );
  }

  const newCallStack = [...callStack, subWorkflowId];
  const inputData =
    typeof resolvedConfig.inputData === 'object' && resolvedConfig.inputData !== null
      ? resolvedConfig.inputData
      : {};

  const childPayload = {
    ...inputData,
    $callStack: newCallStack,
    $parentExecutionId: context.executionId,
    $parentWorkflowId: context.workflowId,
    $depth: newCallStack.length,
  };

  // 4. Enqueue child workflow execution
  const childExecution = await executionQueue.enqueue(subWorkflowId, childPayload);

  const waitForCompletion = resolvedConfig.waitForCompletion !== false;
  const timeoutMs = Number(resolvedConfig.timeoutMs || 15000);

  if (!waitForCompletion) {
    return {
      subWorkflowId,
      subWorkflowName: targetWorkflow.name,
      childExecutionId: childExecution.id,
      status: 'QUEUED',
      asyncTriggered: true,
      timestamp: new Date().toISOString(),
    };
  }

  // 5. Wait for child execution to finish and capture output
  const completedChild = await executionQueue.waitForExecution(childExecution.id, timeoutMs);

  if (completedChild.status === 'FAILED') {
    throw new Error(
      `Child workflow "${targetWorkflow.name}" (${childExecution.id}) failed: ${
        completedChild.error || 'Unknown child error'
      }`
    );
  }

  return {
    subWorkflowId,
    subWorkflowName: targetWorkflow.name,
    childExecutionId: childExecution.id,
    status: completedChild.status,
    durationMs: completedChild.durationMs,
    stepCount: completedChild.traces.length,
    traces: completedChild.traces.map((t) => ({
      nodeId: t.nodeId,
      status: t.status,
      output: t.output,
    })),
    completed: true,
  };
};
