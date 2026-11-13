import { WorkflowExecutionStatus } from '../execution/types';
import { ScheduleConfig, ScheduleStatus } from '../scheduler/types';

export type WorkerHealthStatus = 'HEALTHY' | 'STALE' | 'OFFLINE';

export interface WorkerInstanceRecord {
  id: string;
  name: string;
  type: 'standalone_in_process' | 'embedded' | 'distributed_worker';
  status: WorkerHealthStatus;
  lastHeartbeatAt: string;
  startedAt: string;
  activeJobsCount: number;
  queuedJobsCount: number;
  maxConcurrency: number;
  uptimeSeconds: number;
  memoryUsageMb: number;
  pid: number;
  nodeVersion: string;
  isStale: boolean;
  metadata?: Record<string, unknown>;
}

export interface QueueObservabilityMetric {
  queueDepth: number;
  activeConcurrency: number;
  maxConcurrency: number;
  utilizationPercent: number;
  isSaturated: boolean;
  isQueueAvailable: boolean;
  mode: 'in_process_fifo' | 'external_broker_unavailable';
}

export type OperationalIncidentType =
  | 'REPEATED_WORKFLOW_FAILURES'
  | 'EXECUTION_TIMEOUT'
  | 'STUCK_EXECUTION'
  | 'MISSED_SCHEDULE'
  | 'REPEATED_SCHEDULE_FAILURES'
  | 'WORKER_STALE_OR_OFFLINE';

export type OperationalIncidentSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface OperationalIncident {
  id: string;
  dedupKey: string;
  type: OperationalIncidentType;
  severity: OperationalIncidentSeverity;
  title: string;
  message: string;
  targetType: 'workflow' | 'schedule' | 'execution' | 'worker' | 'system';
  targetId: string;
  targetName: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  resolved: boolean;
  affectedExecutionIds?: string[];
  metrics?: Record<string, number | string | boolean>;
}

export interface MonitoredExecutionItem {
  id: string;
  workflowId: string;
  workflowName: string;
  workspaceId: string;
  status: WorkflowExecutionStatus;
  triggerType: string;
  startedAt: string;
  completedAt?: string;
  updatedAt?: string;
  durationMs: number;
  retryCount: number;
  maxRetries: number;
  isTimedOut: boolean;
  isStuck: boolean;
  errorSummary?: string;
  totalStepsCount: number;
  completedStepsCount: number;
  failedStepsCount: number;
}

export interface ExecutionMonitoringFilter {
  workspaceId?: string;
  workflowId?: string;
  status?: WorkflowExecutionStatus | 'ACTIVE' | 'TERMINAL' | 'TIMEOUT' | 'STUCK' | 'ALL';
  triggerType?: string;
  startDate?: string;
  endDate?: string;
  minDurationMs?: number;
  maxDurationMs?: number;
  search?: string;
  offset?: number;
  limit?: number;
}

export interface ExecutionMonitoringSummary {
  totalExecutions: number;
  activeCount: number;
  runningCount: number;
  queuedCount: number;
  waitingCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
  timeoutCount: number;
  stuckCount: number;
  successRatePercent: number | null;
  averageDurationMs: number | null;
}

export interface MonitoredScheduleItem {
  id: string;
  workflowId: string;
  workflowName: string;
  workspaceId: string;
  name: string;
  type: 'cron' | 'interval' | 'one_time';
  cronExpression?: string;
  intervalMinutes?: number;
  timezone?: string;
  status: ScheduleStatus;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  catchUpMissed: boolean;
  isMissed: boolean;
  missedLapseMs?: number;
  lastExecutionStatus?: WorkflowExecutionStatus | 'UNKNOWN';
  lastExecutionDurationMs?: number;
  recentSuccessRatePercent?: number | null;
  updatedAt: string;
}

export interface UpcomingScheduledRun {
  scheduleId: string;
  scheduleName: string;
  workflowId: string;
  workflowName: string;
  scheduledAt: string;
  countdownSeconds: number;
  type: 'cron' | 'interval' | 'one_time';
}

export interface SchedulerHealthSummary {
  totalSchedules: number;
  activeCount: number;
  pausedOrDisabledCount: number;
  completedCount: number;
  missedSchedulesCount: number;
  upcomingRunsCount: number;
  schedulesWithRecentFailuresCount: number;
  upcomingQueue: UpcomingScheduledRun[];
}

export interface MonitoringOverviewData {
  workspaceId: string;
  timestamp: string;
  executionSummary: ExecutionMonitoringSummary;
  schedulerHealth: SchedulerHealthSummary;
  workerHealth: {
    workers: WorkerInstanceRecord[];
    primaryWorker: WorkerInstanceRecord | null;
    queueMetrics: QueueObservabilityMetric;
  };
  alertsSummary: {
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    activeIncidents: OperationalIncident[];
  };
}
