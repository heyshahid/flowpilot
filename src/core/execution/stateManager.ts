import { NodeExecutionStatus, WorkflowExecutionStatus } from './types';

export class InvalidStateTransitionError extends Error {
  constructor(message: string) {
    super(`[StateTransitionViolation] ${message}`);
    this.name = 'InvalidStateTransitionError';
  }
}

// Immutable Workflow Transition Graph
const WORKFLOW_TRANSITION_MAP: Record<WorkflowExecutionStatus, WorkflowExecutionStatus[]> = {
  QUEUED: ['VALIDATING', 'CANCELLED'],
  VALIDATING: ['RUNNING', 'FAILED', 'CANCELLED'],
  RUNNING: ['WAITING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  WAITING: ['RUNNING', 'FAILED', 'CANCELLED'],
  COMPLETED: [], // Terminal
  FAILED: [],    // Terminal
  CANCELLED: [], // Terminal
};

// Immutable Node Transition Graph
const NODE_TRANSITION_MAP: Record<NodeExecutionStatus, NodeExecutionStatus[]> = {
  PENDING: ['READY', 'SKIPPED', 'CANCELLED'],
  READY: ['RUNNING', 'CANCELLED'],
  RUNNING: ['WAITING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  WAITING: ['RUNNING', 'FAILED', 'CANCELLED'],
  COMPLETED: [], // Terminal
  FAILED: [],    // Terminal
  SKIPPED: [],   // Terminal
  CANCELLED: [], // Terminal
};

export class ExecutionStateManager {
  /**
   * Checks if a workflow transition is permitted.
   */
  public static canTransitionWorkflow(
    from: WorkflowExecutionStatus,
    to: WorkflowExecutionStatus
  ): boolean {
    if (from === to) return true;
    const allowed = WORKFLOW_TRANSITION_MAP[from] || [];
    return allowed.includes(to);
  }

  /**
   * Enforces that a workflow transition is valid, throwing an error if illegal.
   */
  public static validateWorkflowTransition(
    from: WorkflowExecutionStatus,
    to: WorkflowExecutionStatus,
    executionId?: string
  ): void {
    if (!this.canTransitionWorkflow(from, to)) {
      const contextStr = executionId ? ` for execution "${executionId}"` : '';
      throw new InvalidStateTransitionError(
        `Illegal workflow state transition from "${from}" to "${to}"${contextStr}. Terminal states cannot be altered.`
      );
    }
  }

  /**
   * Checks if a node transition is permitted.
   */
  public static canTransitionNode(
    from: NodeExecutionStatus,
    to: NodeExecutionStatus
  ): boolean {
    if (from === to) return true;
    const allowed = NODE_TRANSITION_MAP[from] || [];
    return allowed.includes(to);
  }

  /**
   * Enforces that a node transition is valid, throwing an error if illegal.
   */
  public static validateNodeTransition(
    from: NodeExecutionStatus,
    to: NodeExecutionStatus,
    nodeId?: string
  ): void {
    if (!this.canTransitionNode(from, to)) {
      const contextStr = nodeId ? ` for node "${nodeId}"` : '';
      throw new InvalidStateTransitionError(
        `Illegal node state transition from "${from}" to "${to}"${contextStr}.`
      );
    }
  }

  /**
   * Returns true if the status is a terminal execution state.
   */
  public static isTerminalWorkflowStatus(status: WorkflowExecutionStatus): boolean {
    return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
  }

  /**
   * Returns true if the status is a terminal node state.
   */
  public static isTerminalNodeStatus(status: NodeExecutionStatus): boolean {
    return (
      status === 'COMPLETED' ||
      status === 'FAILED' ||
      status === 'SKIPPED' ||
      status === 'CANCELLED'
    );
  }
}

