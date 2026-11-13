import { executionStore } from '../../lib/storage/executionStore';
import { WorkflowExecutionRecord, WorkflowExecutionStatus } from '../execution/types';
import {
  ExecutionMonitoringFilter,
  ExecutionMonitoringSummary,
  MonitoredExecutionItem,
} from './types';

const TIMEOUT_REGEX = /(timeout|timed out|504|ETIMEDOUT|gateway timeout)/i;
const STUCK_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes without progress

export class ExecutionMonitor {
  private static instance: ExecutionMonitor;

  public static getInstance(): ExecutionMonitor {
    if (!ExecutionMonitor.instance) {
      ExecutionMonitor.instance = new ExecutionMonitor();
    }
    return ExecutionMonitor.instance;
  }

  public isExecutionTimedOut(record: WorkflowExecutionRecord): boolean {
    if (record.error && TIMEOUT_REGEX.test(record.error)) {
      return true;
    }
    if (record.traces && Array.isArray(record.traces)) {
      for (const step of record.traces) {
        if (step.error && TIMEOUT_REGEX.test(step.error)) {
          return true;
        }
      }
    }
    // Execution limit threshold (e.g. 60,000ms execution cap with failed status)
    if (record.status === 'FAILED' && record.durationMs >= 60000) {
      return true;
    }
    return false;
  }

  public isExecutionStuck(record: WorkflowExecutionRecord, asOfDate: Date = new Date()): boolean {
    const activeStatuses: WorkflowExecutionStatus[] = ['RUNNING', 'WAITING', 'VALIDATING'];
    if (!activeStatuses.includes(record.status)) {
      return false;
    }

    const lastActivity = new Date(record.updatedAt || record.startedAt).getTime();
    const elapsed = asOfDate.getTime() - lastActivity;
    return elapsed >= STUCK_THRESHOLD_MS;
  }

  public sanitizeError(error?: string): string | undefined {
    if (!error) return undefined;
    // Strip sensitive tokens, bearer headers or secrets
    let sanitized = error.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
    sanitized = sanitized.replace(/(whsec|fpsec|sk_live|sk_test)_[a-zA-Z0-9]+/gi, '[REDACTED_SECRET]');
    // Truncate to clean summary length
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 197) + '...';
    }
    return sanitized;
  }

  public toMonitoredItem(
    record: WorkflowExecutionRecord,
    asOfDate: Date = new Date()
  ): MonitoredExecutionItem {
    const isTimedOut = this.isExecutionTimedOut(record);
    const isStuck = this.isExecutionStuck(record, asOfDate);

    const traces = record.traces || [];
    const totalStepsCount = traces.length;
    const completedStepsCount = traces.filter((t) => t.status === 'COMPLETED').length;
    const failedStepsCount = traces.filter((t) => t.status === 'FAILED').length;

    return {
      id: record.id,
      workflowId: record.workflowId,
      workflowName: record.workflowName || 'Untitled Workflow',
      workspaceId: record.workspaceId || 'ws_default',
      status: record.status,
      triggerType: record.trigger?.type || 'manual',
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      updatedAt: record.updatedAt,
      durationMs: record.durationMs || 0,
      retryCount: record.retryCount || 0,
      maxRetries: record.maxRetries || 3,
      isTimedOut,
      isStuck,
      errorSummary: this.sanitizeError(record.error),
      totalStepsCount,
      completedStepsCount,
      failedStepsCount,
    };
  }

  public async getExecutions(filter: ExecutionMonitoringFilter = {}): Promise<{
    items: MonitoredExecutionItem[];
    total: number;
    summary: ExecutionMonitoringSummary;
  }> {
    const rawResult = await executionStore.list({
      workspaceId: filter.workspaceId,
      workflowId: filter.workflowId,
      search: filter.search,
      offset: 0,
      limit: 10000, // Load all within workspace to filter accurately
    });

    const now = new Date();
    let records = rawResult.items;

    // Apply Workspace filter strictly
    if (filter.workspaceId) {
      records = records.filter((r) => (r.workspaceId || 'ws_default') === filter.workspaceId);
    }

    // Apply Workflow filter
    if (filter.workflowId) {
      records = records.filter((r) => r.workflowId === filter.workflowId);
    }

    // Apply Trigger Type filter
    if (filter.triggerType) {
      records = records.filter((r) => (r.trigger?.type || 'manual') === filter.triggerType);
    }

    // Apply Date Range filter
    if (filter.startDate) {
      const s = new Date(filter.startDate).getTime();
      records = records.filter((r) => new Date(r.startedAt).getTime() >= s);
    }
    if (filter.endDate) {
      const e = new Date(filter.endDate).getTime();
      records = records.filter((r) => new Date(r.startedAt).getTime() <= e);
    }

    // Apply Duration filters
    if (filter.minDurationMs !== undefined) {
      records = records.filter((r) => (r.durationMs || 0) >= filter.minDurationMs!);
    }
    if (filter.maxDurationMs !== undefined) {
      records = records.filter((r) => (r.durationMs || 0) <= filter.maxDurationMs!);
    }

    // Compute Summary across all matched records in workspace/date window
    const summary = this.computeSummary(records, now);

    // Apply Status filter
    if (filter.status && filter.status !== 'ALL') {
      if (filter.status === 'ACTIVE') {
        records = records.filter((r) =>
          ['RUNNING', 'QUEUED', 'WAITING', 'VALIDATING'].includes(r.status)
        );
      } else if (filter.status === 'TERMINAL') {
        records = records.filter((r) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(r.status));
      } else if (filter.status === 'TIMEOUT') {
        records = records.filter((r) => this.isExecutionTimedOut(r));
      } else if (filter.status === 'STUCK') {
        records = records.filter((r) => this.isExecutionStuck(r, now));
      } else {
        records = records.filter((r) => r.status === filter.status);
      }
    }

    const total = records.length;
    const offset = filter.offset || 0;
    const limit = Math.min(100, filter.limit || 20);

    const paginated = records.slice(offset, offset + limit);
    const items = paginated.map((r) => this.toMonitoredItem(r, now));

    return {
      items,
      total,
      summary,
    };
  }

  public computeSummary(
    records: WorkflowExecutionRecord[],
    asOfDate: Date = new Date()
  ): ExecutionMonitoringSummary {
    let runningCount = 0;
    let queuedCount = 0;
    let waitingCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let cancelledCount = 0;
    let timeoutCount = 0;
    let stuckCount = 0;
    let totalTerminalDuration = 0;
    let terminalCount = 0;

    for (const r of records) {
      if (r.status === 'RUNNING' || r.status === 'VALIDATING') {
        runningCount++;
      } else if (r.status === 'QUEUED') {
        queuedCount++;
      } else if (r.status === 'WAITING') {
        waitingCount++;
      } else if (r.status === 'COMPLETED') {
        completedCount++;
        terminalCount++;
        totalTerminalDuration += r.durationMs || 0;
      } else if (r.status === 'FAILED') {
        failedCount++;
        terminalCount++;
        totalTerminalDuration += r.durationMs || 0;
      } else if (r.status === 'CANCELLED') {
        cancelledCount++;
        terminalCount++;
        totalTerminalDuration += r.durationMs || 0;
      }

      if (this.isExecutionTimedOut(r)) {
        timeoutCount++;
      }
      if (this.isExecutionStuck(r, asOfDate)) {
        stuckCount++;
      }
    }

    const evaluatedTerminal = completedCount + failedCount;
    const successRatePercent =
      evaluatedTerminal > 0
        ? Math.round((completedCount / evaluatedTerminal) * 1000) / 10
        : null;

    const averageDurationMs =
      terminalCount > 0 ? Math.round((totalTerminalDuration / terminalCount) * 10) / 10 : null;

    return {
      totalExecutions: records.length,
      activeCount: runningCount + queuedCount + waitingCount,
      runningCount,
      queuedCount,
      waitingCount,
      completedCount,
      failedCount,
      cancelledCount,
      timeoutCount,
      stuckCount,
      successRatePercent,
      averageDurationMs,
    };
  }
}

export const executionMonitor = ExecutionMonitor.getInstance();

