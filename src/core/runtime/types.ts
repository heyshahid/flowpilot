import { NodeExecutionStatus } from '../execution/types';
import { WorkflowNode } from '../types/workflow';

export interface NodeExecutionContext {
  executionId: string;
  workflowId: string;
  node: WorkflowNode;
  trigger: {
    type: string;
    payload: Record<string, unknown>;
    timestamp: string;
  };
  steps: Record<
    string,
    {
      status: NodeExecutionStatus;
      output: Record<string, unknown>;
      durationMs: number;
    }
  >;
  signal?: AbortSignal;
}

export type NodeDriver = (
  context: NodeExecutionContext,
  resolvedConfig: Record<string, unknown>
) => Promise<Record<string, unknown>>;

