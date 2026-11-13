import fs from 'fs';
import path from 'path';
import { ScheduleConfig, ScheduleStatus } from '../../core/scheduler/types';
import { CronParser } from '../../core/scheduler/cronParser';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'schedules.json');

export const SEED_SCHEDULES: ScheduleConfig[] = [
  {
    id: 'sched_daily_crm_sync',
    workflowId: 'wf_crm_sync',
    workflowName: 'Home-grown CRM System',
    name: 'Daily Morning CRM Lead Sync',
    description: 'Runs daily at 9:00 AM UTC to sync new enterprise leads into CRM.',
    type: 'cron',
    cronExpression: '0 9 * * *',
    timezone: 'UTC',
    status: 'active',
    inputPayload: { triggerSource: 'scheduled_daily_cron', batchLimit: 50 },
    nextRunAt: new Date(Date.now() + 3600000 * 5).toISOString(),
    lastRunAt: new Date(Date.now() - 86400000).toISOString(),
    runCount: 24,
    catchUpMissed: true,
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'sched_hourly_order_enrichment',
    workflowId: 'wf_order_enrichment',
    workflowName: 'Customer Order Enrichment API',
    name: 'Hourly Order Reconciliation',
    description: 'Polls external e-commerce transactions every hour.',
    type: 'cron',
    cronExpression: '0 * * * *',
    timezone: 'UTC',
    status: 'active',
    inputPayload: { reconcileStatus: 'PENDING' },
    nextRunAt: new Date(Date.now() + 1800000).toISOString(),
    lastRunAt: new Date(Date.now() - 1800000).toISOString(),
    runCount: 180,
    catchUpMissed: false,
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

export class ScheduleStore {
  private inMemorySchedules = new Map<string, ScheduleConfig>();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (typeof window === 'undefined') {
      try {
        if (fs.existsSync(DATA_FILE)) {
          const raw = fs.readFileSync(DATA_FILE, 'utf-8');
          const list: ScheduleConfig[] = JSON.parse(raw);
          for (const item of list) {
            this.inMemorySchedules.set(item.id, item);
          }
          return;
        }
      } catch {
        // Fallback to seeds
      }
    }

    for (const seed of SEED_SCHEDULES) {
      this.inMemorySchedules.set(seed.id, seed);
    }
    this.persist();
  }

  private persist(): void {
    if (typeof window === 'undefined') {
      try {
        const list = Array.from(this.inMemorySchedules.values());
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
      } catch {
        // Retain in memory
      }
    }
  }

  /**
   * Calculates the next run time according to schedule type & expression.
   */
  public calculateNextRun(schedule: Partial<ScheduleConfig>, fromDate: Date = new Date()): string | undefined {
    if (schedule.type === 'one_time') {
      return schedule.targetDateTime;
    }

    if (schedule.type === 'cron' && schedule.cronExpression) {
      try {
        const nextDate = CronParser.getNextRun(schedule.cronExpression, fromDate, schedule.timezone || 'UTC');
        return nextDate.toISOString();
      } catch {
        return undefined;
      }
    }

    if (schedule.type === 'interval' && schedule.intervalMinutes) {
      const nextDate = new Date(fromDate.getTime() + schedule.intervalMinutes * 60 * 1000);
      return nextDate.toISOString();
    }

    return undefined;
  }

  public async save(params: Omit<ScheduleConfig, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>): Promise<ScheduleConfig> {
    const id = `sched_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    const nextRunAt = params.nextRunAt || this.calculateNextRun(params);

    const record: ScheduleConfig = {
      ...params,
      id,
      runCount: 0,
      nextRunAt,
      createdAt: now,
      updatedAt: now,
    };

    this.inMemorySchedules.set(id, record);
    this.persist();
    return record;
  }

  public async getById(id: string): Promise<ScheduleConfig | null> {
    return this.inMemorySchedules.get(id) || null;
  }

  public async list(filter?: { workflowId?: string; status?: ScheduleStatus; workspaceId?: string }): Promise<ScheduleConfig[]> {
    let list = Array.from(this.inMemorySchedules.values());
    if (filter?.workspaceId) {
      list = list.filter((s) => (s.workspaceId || 'ws_default') === filter.workspaceId);
    }
    if (filter?.workflowId) {
      list = list.filter((s) => s.workflowId === filter.workflowId);
    }
    if (filter?.status) {
      list = list.filter((s) => s.status === filter.status);
    }
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public async update(id: string, updates: Partial<ScheduleConfig>): Promise<ScheduleConfig | null> {
    const existing = this.inMemorySchedules.get(id);
    if (!existing) return null;

    const updated: ScheduleConfig = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // If cron or interval was updated, re-calculate nextRunAt
    if (updates.cronExpression || updates.intervalMinutes || updates.type || updates.timezone) {
      updated.nextRunAt = this.calculateNextRun(updated);
    }

    this.inMemorySchedules.set(id, updated);
    this.persist();
    return updated;
  }

  public async delete(id: string): Promise<boolean> {
    const deleted = this.inMemorySchedules.delete(id);
    if (deleted) this.persist();
    return deleted;
  }

  /**
   * Returns all active schedules whose `nextRunAt` timestamp has arrived (is <= asOfDate).
   */
  public async getDueSchedules(asOfDate: Date = new Date()): Promise<ScheduleConfig[]> {
    const asOfIso = asOfDate.toISOString();
    const active = await this.list({ status: 'active' });
    return active.filter((s) => s.nextRunAt && s.nextRunAt <= asOfIso);
  }

  /**
   * Advances the schedule's run counter, sets lastRunAt & calculates nextRunAt.
   */
  public async recordRun(id: string, executionId: string, runTime: Date = new Date()): Promise<ScheduleConfig | null> {
    const schedule = this.inMemorySchedules.get(id);
    if (!schedule) return null;

    const runCount = schedule.runCount + 1;
    let status = schedule.status;

    // Check if one_time or maxRuns reached
    if (schedule.type === 'one_time' || (schedule.maxRuns && runCount >= schedule.maxRuns)) {
      status = 'completed';
    }

    const nextRunAt = status === 'completed' ? undefined : this.calculateNextRun(schedule, runTime);

    const updated: ScheduleConfig = {
      ...schedule,
      runCount,
      status,
      lastRunAt: runTime.toISOString(),
      lastExecutionId: executionId,
      nextRunAt,
      updatedAt: new Date().toISOString(),
    };

    this.inMemorySchedules.set(id, updated);
    this.persist();
    return updated;
  }
}

export const scheduleStore = new ScheduleStore();
