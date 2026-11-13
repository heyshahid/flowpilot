import fs from 'fs';
import path from 'path';
import { WorkspaceLimits } from '@/core/usage/types';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'workspace_limits.json');

export const SEED_WORKSPACE_LIMITS: WorkspaceLimits[] = [
  {
    workspaceId: 'ws_default',
    maxWorkflows: 50,
    maxMonthlyExecutions: 5000,
    maxConcurrentExecutions: 5,
    maxActiveSchedules: 10,
    maxAiTokensMonthly: 500000,
    maxAiCostMonthlyUsd: 25.0,
    maxMonthlyIntegrationOps: 10000,
    updatedAt: new Date(Date.now() - 86400000 * 15).toISOString(),
    updatedBy: 'usr_owner',
  },
  {
    workspaceId: 'ws_staging',
    maxWorkflows: 15,
    maxMonthlyExecutions: 1000,
    maxConcurrentExecutions: 2,
    maxActiveSchedules: 3,
    maxAiTokensMonthly: 100000,
    maxAiCostMonthlyUsd: 10.0,
    maxMonthlyIntegrationOps: 2000,
    updatedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    updatedBy: 'usr_admin',
  },
];

export class WorkspaceLimitsStore {
  private cache: Map<string, WorkspaceLimits> = new Map();
  private initialized = false;

  constructor() {
    this.ensureInitialized();
  }

  private ensureInitialized(): void {
    if (this.initialized) return;

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const data: WorkspaceLimits[] = JSON.parse(raw);
        for (const limit of data) {
          this.cache.set(limit.workspaceId, limit);
        }
      } else {
        for (const limit of SEED_WORKSPACE_LIMITS) {
          this.cache.set(limit.workspaceId, limit);
        }
        this.persist();
      }
    } catch {
      for (const limit of SEED_WORKSPACE_LIMITS) {
        this.cache.set(limit.workspaceId, limit);
      }
    }

    this.initialized = true;
  }

  private persist(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = Array.from(this.cache.values());
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[WorkspaceLimitsStore] Failed to persist data:', err);
    }
  }

  public getByWorkspaceId(workspaceId: string): WorkspaceLimits | null {
    this.ensureInitialized();
    return this.cache.get(workspaceId) || null;
  }

  public getOrCreate(workspaceId: string): WorkspaceLimits {
    this.ensureInitialized();
    const existing = this.cache.get(workspaceId);
    if (existing) return existing;

    const newLimit: WorkspaceLimits = {
      workspaceId,
      maxWorkflows: null,
      maxMonthlyExecutions: null,
      maxConcurrentExecutions: null,
      maxActiveSchedules: null,
      maxAiTokensMonthly: null,
      maxAiCostMonthlyUsd: null,
      maxMonthlyIntegrationOps: null,
      updatedAt: new Date().toISOString(),
    };

    this.cache.set(workspaceId, newLimit);
    this.persist();
    return newLimit;
  }

  public setLimits(
    workspaceId: string,
    updates: Partial<Omit<WorkspaceLimits, 'workspaceId' | 'updatedAt'>>,
    actorId?: string
  ): WorkspaceLimits {
    this.ensureInitialized();
    const existing = this.getOrCreate(workspaceId);

    const updated: WorkspaceLimits = {
      ...existing,
      ...updates,
      workspaceId,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId || existing.updatedBy,
    };

    this.cache.set(workspaceId, updated);
    this.persist();
    return updated;
  }
}

export const workspaceLimitsStore = new WorkspaceLimitsStore();

