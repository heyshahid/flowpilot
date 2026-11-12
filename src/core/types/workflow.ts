export type NodeCategory = 'trigger' | 'action' | 'logic' | 'data' | 'ai';

export type StandardNodeType =
  | 'trigger.manual'
  | 'trigger.webhook'
  | 'trigger.schedule'
  | 'action.httpRequest'
  | 'action.sendEmail'
  | 'action.databaseQuery'
  | 'logic.ifElse'
  | 'logic.switch'
  | 'logic.delay'
  | 'data.transform'
  | 'ai.textGeneration';

export interface WorkflowNode<TConfig = Record<string, unknown>> {
  id: string;
  type: StandardNodeType | string;
  category: NodeCategory;
  name: string;
  description?: string;
  config: TConfig;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string; // e.g. 'true' | 'false' | 'default'
  targetHandle?: string;
}

export interface WorkflowGraph {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface StepExecutionTrace {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  status: StepStatus;
  startedAt: string;
  completedAt?: string;
  durationMs: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
}

export interface WorkflowExecutionContext {
  executionId: string;
  workflowId: string;
  trigger: {
    type: string;
    payload: Record<string, unknown>;
    timestamp: string;
  };
  steps: Record<string, {
    status: StepStatus;
    output: Record<string, unknown>;
    durationMs: number;
  }>;
  skippedNodeIds: Set<string>;
}

export interface ExecutionResult {
  executionId: string;
  workflowId: string;
  status: 'completed' | 'failed';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  traces: StepExecutionTrace[];
  error?: string;
}
