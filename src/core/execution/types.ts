export type WorkflowExecutionStatus =
  | 'QUEUED'
  | 'VALIDATING'
  | 'RUNNING'
  | 'WAITING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type NodeExecutionStatus =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'WAITING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'CANCELLED';

export interface StateTransition<TStatus> {
  from: TStatus;
  to: TStatus;
  timestamp: string;
  reason?: string;
}

export interface StepExecutionRecord {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  status: NodeExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
  attempts: number;
  retryCount: number;
}

export interface WorkflowExecutionRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowExecutionStatus;
  trigger: {
    type: string;
    payload: Record<string, unknown>;
    timestamp: string;
  };
  startedAt: string;
  completedAt?: string;
  durationMs: number;
  traces: StepExecutionRecord[];
  error?: string;
  stateHistory: Array<{
    status: WorkflowExecutionStatus;
    timestamp: string;
    reason?: string;
  }>;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionFilter {
  workflowId?: string;
  status?: WorkflowExecutionStatus;
  search?: string;
  limit?: number;
  offset?: number;
}
