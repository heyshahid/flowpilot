import { scheduleStore } from '../../lib/storage/scheduleStore';
import { executionStore } from '../../lib/storage/executionStore';
import { ScheduleConfig } from '../scheduler/types';
import {
  MonitoredScheduleItem,
  SchedulerHealthSummary,
  UpcomingScheduledRun,
} from './types';

const MISSED_GRACE_PERIOD_MS = 60 * 1000; // 60s grace period before classifying as missed

export class SchedulerMonitor {
  private static instance: SchedulerMonitor;

  public static getInstance(): SchedulerMonitor {
    if (!SchedulerMonitor.instance) {
      SchedulerMonitor.instance = new SchedulerMonitor();
    }
    return SchedulerMonitor.instance;
  }

  public isScheduleMissed(schedule: ScheduleConfig, asOfDate: Date = new Date()): boolean {
    if (schedule.status !== 'active' || !schedule.nextRunAt) {
      return false;
    }

    const nextRunTime = new Date(schedule.nextRunAt).getTime();
    const thresholdTime = asOfDate.getTime() - MISSED_GRACE_PERIOD_MS;

    if (nextRunTime >= thresholdTime) {
      return false;
    }

    // If lastRunAt is missing or occurred before the nextRunAt timestamp, it was missed
    if (!schedule.lastRunAt) {
      return true;
    }

    const lastRunTime = new Date(schedule.lastRunAt).getTime();
    return lastRunTime < nextRunTime;
  }

  public async getSchedulerHealth(
    workspaceId: string = 'ws_default',
    asOfDate: Date = new Date()
  ): Promise<{
    schedules: MonitoredScheduleItem[];
    summary: SchedulerHealthSummary;
  }> {
    const rawSchedules = await scheduleStore.list({ workspaceId });
    const monitoredItems: MonitoredScheduleItem[] = [];

    let activeCount = 0;
    let pausedOrDisabledCount = 0;
    let completedCount = 0;
    let missedCount = 0;
    let schedulesWithRecentFailuresCount = 0;
    const upcomingList: UpcomingScheduledRun[] = [];

    // Preload recent executions in workspace to correlate execution health
    const executionsRes = await executionStore.list({ workspaceId, limit: 1000 });
    const executions = executionsRes.items;

    for (const schedule of rawSchedules) {
      const isMissed = this.isScheduleMissed(schedule, asOfDate);
      let missedLapseMs: number | undefined;

      if (isMissed && schedule.nextRunAt) {
        missedLapseMs = asOfDate.getTime() - new Date(schedule.nextRunAt).getTime();
      }

      if (schedule.status === 'active') {
        activeCount++;
      } else if (schedule.status === 'completed') {
        completedCount++;
      } else {
        pausedOrDisabledCount++;
      }

      if (isMissed) {
        missedCount++;
      }

      // Collect upcoming runs
      if (schedule.status === 'active' && schedule.nextRunAt) {
        const nextTime = new Date(schedule.nextRunAt).getTime();
        if (nextTime > asOfDate.getTime()) {
          const countdownSeconds = Math.max(
            0,
            Math.floor((nextTime - asOfDate.getTime()) / 1000)
          );
          upcomingList.push({
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            workflowId: schedule.workflowId,
            workflowName: schedule.workflowName,
            scheduledAt: schedule.nextRunAt,
            countdownSeconds,
            type: schedule.type,
          });
        }
      }

      // Correlate with executions
      let lastExecutionStatus: MonitoredScheduleItem['lastExecutionStatus'] = 'UNKNOWN';
      let lastExecutionDurationMs: number | undefined;

      // Check explicit lastExecutionId first
      if (schedule.lastExecutionId) {
        const lastExec = executions.find((e) => e.id === schedule.lastExecutionId);
        if (lastExec) {
          lastExecutionStatus = lastExec.status;
          lastExecutionDurationMs = lastExec.durationMs;
        }
      }

      // Fallback: search recent executions linked by $schedule.id
      const linkedExecutions = executions.filter(
        (e) =>
          (e.trigger?.payload as any)?.$schedule?.id === schedule.id ||
          e.workflowId === schedule.workflowId
      );

      let recentSuccessRatePercent: number | null = null;
      if (linkedExecutions.length > 0) {
        const completedLinked = linkedExecutions.filter((e) => e.status === 'COMPLETED').length;
        const failedLinked = linkedExecutions.filter((e) => e.status === 'FAILED').length;
        const totalEvaluated = completedLinked + failedLinked;

        if (totalEvaluated > 0) {
          recentSuccessRatePercent =
            Math.round((completedLinked / totalEvaluated) * 1000) / 10;
        }

        if (lastExecutionStatus === 'UNKNOWN' && linkedExecutions[0]) {
          lastExecutionStatus = linkedExecutions[0].status;
          lastExecutionDurationMs = linkedExecutions[0].durationMs;
        }

        if (failedLinked > 0 && (recentSuccessRatePercent ?? 100) < 70) {
          schedulesWithRecentFailuresCount++;
        }
      }

      monitoredItems.push({
        id: schedule.id,
        workflowId: schedule.workflowId,
        workflowName: schedule.workflowName,
        workspaceId: schedule.workspaceId || 'ws_default',
        name: schedule.name,
        type: schedule.type,
        cronExpression: schedule.cronExpression,
        intervalMinutes: schedule.intervalMinutes,
        timezone: schedule.timezone || 'UTC',
        status: schedule.status,
        lastRunAt: schedule.lastRunAt,
        nextRunAt: schedule.nextRunAt,
        runCount: schedule.runCount,
        catchUpMissed: !!schedule.catchUpMissed,
        isMissed,
        missedLapseMs,
        lastExecutionStatus,
        lastExecutionDurationMs,
        recentSuccessRatePercent,
        updatedAt: schedule.updatedAt,
      });
    }

    // Sort upcoming runs chronologically
    upcomingList.sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );

    const summary: SchedulerHealthSummary = {
      totalSchedules: rawSchedules.length,
      activeCount,
      pausedOrDisabledCount,
      completedCount,
      missedSchedulesCount: missedCount,
      upcomingRunsCount: upcomingList.length,
      schedulesWithRecentFailuresCount,
      upcomingQueue: upcomingList.slice(0, 10), // Next 10 runs
    };

    return {
      schedules: monitoredItems,
      summary,
    };
  }
}

export const schedulerMonitor = SchedulerMonitor.getInstance();

