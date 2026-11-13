import { scheduleStore } from '../../lib/storage/scheduleStore';
import { executionQueue } from '../execution/queue';
import { ScheduleConfig, ScheduleTickResult } from './types';

export class SchedulerEngine {
  private isRunning = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private inFlightSchedules = new Set<string>();
  private tickIntervalMs: number;

  constructor(tickIntervalMs: number = 10000) {
    this.tickIntervalMs = tickIntervalMs;
  }

  /**
   * Starts the automatic polling background timer.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Immediately run a startup catch-up tick
    this.tick().catch(() => {});

    this.intervalTimer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[SchedulerEngine] Tick evaluation error:', err);
      });
    }, this.tickIntervalMs);
  }

  /**
   * Stops the background polling loop.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /**
   * Evaluates and executes due schedules at `asOfDate`.
   * Publicly accessible for deterministic testing and manual triggers.
   */
  public async tick(asOfDate: Date = new Date()): Promise<ScheduleTickResult> {
    const dueSchedules = await scheduleStore.getDueSchedules(asOfDate);
    const triggeredScheduleIds: string[] = [];
    const executionIds: string[] = [];

    for (const schedule of dueSchedules) {
      // Duplicate prevention lock
      if (this.inFlightSchedules.has(schedule.id)) {
        continue;
      }

      this.inFlightSchedules.add(schedule.id);

      try {
        const execution = await this.triggerSchedule(schedule, asOfDate);
        if (execution) {
          triggeredScheduleIds.push(schedule.id);
          executionIds.push(execution.id);
        }
      } catch (err) {
        console.error(`[SchedulerEngine] Failed to trigger schedule "${schedule.id}":`, err);
      } finally {
        this.inFlightSchedules.delete(schedule.id);
      }
    }

    return {
      checkedCount: dueSchedules.length,
      triggeredCount: triggeredScheduleIds.length,
      triggeredScheduleIds,
      executionIds,
    };
  }

  /**
   * Dispatches a single schedule immediately.
   */
  public async triggerSchedule(
    schedule: ScheduleConfig,
    runTime: Date = new Date()
  ) {
    const payload = {
      ...(schedule.inputPayload || {}),
      $schedule: {
        id: schedule.id,
        name: schedule.name,
        type: schedule.type,
        scheduledAt: schedule.nextRunAt || runTime.toISOString(),
        triggeredAt: runTime.toISOString(),
      },
    };

    // Enqueue in FlowPilot Execution Queue
    const execution = await executionQueue.enqueue(schedule.workflowId, payload);

    // Record run and advance nextRunAt in storage
    await scheduleStore.recordRun(schedule.id, execution.id, runTime);

    return execution;
  }
}

export const schedulerEngine = new SchedulerEngine();
