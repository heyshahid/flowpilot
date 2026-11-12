import { executionStore } from '../../lib/storage/executionStore';
import { workflowStore } from '../../lib/storage/workflowStore';
import { RetryManager } from './retryManager';
import { ExecutionStateManager } from './stateManager';
import { WorkflowExecutionRecord } from './types';
import { executionWorker } from './worker';

export interface QueueOptions {
  maxConcurrency?: number;
}

export class ExecutionQueue {
  private queue: string[] = []; // List of queued executionIds
  private running = new Set<string>(); // List of currently executing executionIds
  private abortControllers = new Map<string, AbortController>();
  private maxConcurrency: number;
  private isProcessing = false;

  constructor(options: QueueOptions = {}) {
    this.maxConcurrency = options.maxConcurrency || 5;
  }

  /**
   * Enqueues a workflow for execution.
   * Immediately records execution with status QUEUED and returns the record.
   */
  public async enqueue(
    workflowId: string,
    payload: Record<string, unknown> = {},
    options: { maxRetries?: number } = {}
  ): Promise<WorkflowExecutionRecord> {
    const workflow = workflowStore.getById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow with ID "${workflowId}" does not exist.`);
    }

    const executionId = `exec_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    const record: WorkflowExecutionRecord = {
      id: executionId,
      workflowId,
      workflowName: workflow.name,
      status: 'QUEUED',
      trigger: {
        type: workflow.nodes.find((n) => n.category === 'trigger')?.type || 'trigger.manual',
        payload,
        timestamp: now,
      },
      startedAt: now,
      durationMs: 0,
      traces: [],
      stateHistory: [
        {
          status: 'QUEUED',
          timestamp: now,
          reason: 'Job enqueued into background worker queue',
        },
      ],
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      createdAt: now,
      updatedAt: now,
    };

    await executionStore.create(record);

    this.queue.push(executionId);
    this.scheduleProcess();

    return record;
  }

  /**
   * Cancels a running or queued execution immediately.
   */
  public async cancel(executionId: string): Promise<boolean> {
    const record = await executionStore.getById(executionId);
    if (!record) {
      return false;
    }

    if (ExecutionStateManager.isTerminalWorkflowStatus(record.status)) {
      return false; // Already finished or cancelled
    }

    // 1. If currently running, trigger its AbortController
    const controller = this.abortControllers.get(executionId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(executionId);
    }

    // 2. If sitting in queue, remove it
    this.queue = this.queue.filter((id) => id !== executionId);

    // 3. Mark as CANCELLED in storage
    const stateHistory = [
      ...record.stateHistory,
      {
        status: 'CANCELLED' as const,
        timestamp: new Date().toISOString(),
        reason: 'Execution cancelled via API/Queue control',
      },
    ];

    await executionStore.update(executionId, {
      status: 'CANCELLED',
      stateHistory,
      completedAt: new Date().toISOString(),
      error: 'Execution cancelled by user request',
    });

    this.running.delete(executionId);
    this.scheduleProcess();
    return true;
  }

  /**
   * Retries an eligible failed or cancelled execution.
   */
  public async retry(executionId: string): Promise<WorkflowExecutionRecord> {
    const record = await executionStore.getById(executionId);
    if (!record) {
      throw new Error(`Execution record "${executionId}" not found.`);
    }

    if (!RetryManager.isEligibleForRetry(record)) {
      throw new Error(
        `Execution "${executionId}" is not eligible for retry. Current status: ${record.status}, Retries: ${record.retryCount}/${record.maxRetries}.`
      );
    }

    const nextRetryCount = record.retryCount + 1;
    const now = new Date().toISOString();

    const stateHistory = [
      ...record.stateHistory,
      {
        status: 'QUEUED' as const,
        timestamp: now,
        reason: `Re-queued for retry attempt #${nextRetryCount}`,
      },
    ];

    const updated = await executionStore.update(executionId, {
      status: 'QUEUED',
      retryCount: nextRetryCount,
      startedAt: now,
      completedAt: undefined,
      error: undefined,
      durationMs: 0,
      stateHistory,
    });

    this.queue.push(executionId);
    this.scheduleProcess();

    return updated;
  }

  /**
   * Internal scheduler loop for processing queued tasks.
   */
  private scheduleProcess(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;

    // Run tick asynchronously
    setTimeout(async () => {
      try {
        await this.processNext();
      } finally {
        this.isProcessing = false;
        if (this.queue.length > 0 && this.running.size < this.maxConcurrency) {
          this.scheduleProcess();
        }
      }
    }, 0);
  }

  private async processNext(): Promise<void> {
    while (this.queue.length > 0 && this.running.size < this.maxConcurrency) {
      const executionId = this.queue.shift();
      if (!executionId) break;

      const record = await executionStore.getById(executionId);
      if (!record || record.status === 'CANCELLED') {
        continue;
      }

      this.running.add(executionId);
      const controller = new AbortController();
      this.abortControllers.set(executionId, controller);

      // Execute worker asynchronously
      executionWorker
        .processJob({
          executionId,
          workflowId: record.workflowId,
          payload: record.trigger.payload,
          signal: controller.signal,
        })
        .finally(() => {
          this.running.delete(executionId);
          this.abortControllers.delete(executionId);
          this.scheduleProcess();
        });
    }
  }

  /**
   * Helper to wait until a specific execution reaches a terminal status (for tests & synchronous callers).
   */
  public async waitForExecution(
    executionId: string,
    timeoutMs: number = 10000
  ): Promise<WorkflowExecutionRecord> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const record = await executionStore.getById(executionId);
      if (record && ExecutionStateManager.isTerminalWorkflowStatus(record.status)) {
        return record;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const finalRecord = await executionStore.getById(executionId);
    if (!finalRecord) {
      throw new Error(`Execution "${executionId}" not found during wait.`);
    }
    return finalRecord;
  }
}

// Global execution queue singleton
export const executionQueue = new ExecutionQueue();

