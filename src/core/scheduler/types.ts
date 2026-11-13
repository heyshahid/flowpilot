export type ScheduleType = 'cron' | 'one_time' | 'interval';

export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'error';

export interface ScheduleConfig {
  id: string;
  workflowId: string;
  workflowName: string;
  workspaceId?: string;
  name: string;
  description?: string;
  type: ScheduleType;
  cronExpression?: string; // e.g. "0 9 * * 1-5" or "@daily"
  intervalMinutes?: number; // e.g. 15 for every 15 minutes
  targetDateTime?: string; // ISO 8601 string for one_time
  timezone: string; // e.g. "UTC", "America/New_York"
  status: ScheduleStatus;
  inputPayload?: Record<string, unknown>;
  nextRunAt?: string;
  lastRunAt?: string;
  lastExecutionId?: string;
  runCount: number;
  maxRuns?: number; // Optional execution cap
  catchUpMissed: boolean; // True to trigger immediately if scheduled run was missed during downtime
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleTickResult {
  checkedCount: number;
  triggeredCount: number;
  triggeredScheduleIds: string[];
  executionIds: string[];
}
