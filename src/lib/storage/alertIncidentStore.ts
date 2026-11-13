import fs from 'fs';
import path from 'path';
import { AlertIncident, IncidentStatus, AlertCategory } from '@/core/alerts/types';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'alert_incidents.json');

export const SEED_ALERT_INCIDENTS: AlertIncident[] = [
  {
    id: 'inc_seed_001',
    workspaceId: 'ws_default',
    ruleId: 'rule_exec_failure_high',
    ruleName: 'High Workflow Failure Rate',
    category: 'EXECUTION',
    severity: 'CRITICAL',
    status: 'ACKNOWLEDGED',
    dedupKey: 'inc_ws_default_rule_exec_failure_high',
    metric: 'failure_rate',
    currentValue: 33.3,
    threshold: 25.0,
    message: 'Workflow failure rate reached 33.3% (threshold: >= 25.0%)',
    targetType: 'workspace',
    triggeredAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    acknowledgedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    acknowledgedBy: 'usr_admin',
    occurrenceCount: 2,
    lastSeenAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'inc_seed_002',
    workspaceId: 'ws_default',
    ruleId: 'rule_ai_cost_spike',
    ruleName: 'Monthly AI Cost Quota Warning',
    category: 'AI_USAGE',
    severity: 'WARNING',
    status: 'TRIGGERED',
    dedupKey: 'inc_ws_default_rule_ai_cost_spike',
    metric: 'monthly_cost_usd',
    currentValue: 22.45,
    threshold: 20.0,
    message: 'Estimated AI cost reached $22.45 USD (threshold: >= $20.00 USD)',
    targetType: 'workspace',
    triggeredAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    occurrenceCount: 1,
    lastSeenAt: new Date(Date.now() - 3600000 * 1).toISOString(),
  },
];

export class AlertIncidentStore {
  private cache: Map<string, AlertIncident> = new Map();
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
        const data: AlertIncident[] = JSON.parse(raw);
        for (const inc of data) {
          this.cache.set(inc.id, inc);
        }
      } else {
        for (const inc of SEED_ALERT_INCIDENTS) {
          this.cache.set(inc.id, inc);
        }
        this.persist();
      }
    } catch {
      for (const inc of SEED_ALERT_INCIDENTS) {
        this.cache.set(inc.id, inc);
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
      console.error('[AlertIncidentStore] Failed to persist data:', err);
    }
  }

  public list(
    workspaceId: string,
    filter?: {
      status?: IncidentStatus;
      category?: AlertCategory;
      ruleId?: string;
      limit?: number;
      offset?: number;
    }
  ): { items: AlertIncident[]; total: number } {
    this.ensureInitialized();
    const all = Array.from(this.cache.values())
      .filter((inc) => inc.workspaceId === workspaceId)
      .filter((inc) => (filter?.status ? inc.status === filter.status : true))
      .filter((inc) => (filter?.category ? inc.category === filter.category : true))
      .filter((inc) => (filter?.ruleId ? inc.ruleId === filter.ruleId : true))
      .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

    const total = all.length;
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 50;
    const items = all.slice(offset, offset + limit);

    return { items, total };
  }

  public getById(id: string, workspaceId?: string): AlertIncident | null {
    this.ensureInitialized();
    const inc = this.cache.get(id);
    if (!inc) return null;
    if (workspaceId && inc.workspaceId !== workspaceId) return null;
    return inc;
  }

  public getActiveByDedupKey(dedupKey: string): AlertIncident | null {
    this.ensureInitialized();
    for (const inc of this.cache.values()) {
      if (inc.dedupKey === dedupKey && inc.status !== 'RESOLVED') {
        return inc;
      }
    }
    return null;
  }

  public createOrUpdateIncident(params: {
    workspaceId: string;
    ruleId: string;
    ruleName: string;
    category: AlertCategory;
    severity: AlertIncident['severity'];
    dedupKey: string;
    metric: AlertIncident['metric'];
    currentValue: number;
    threshold: number;
    message: string;
    targetType?: AlertIncident['targetType'];
    targetId?: string;
    targetName?: string;
  }): { incident: AlertIncident; isNew: boolean } {
    this.ensureInitialized();
    const existing = this.getActiveByDedupKey(params.dedupKey);

    const now = new Date().toISOString();

    if (existing) {
      // Update existing incident
      existing.occurrenceCount += 1;
      existing.lastSeenAt = now;
      existing.currentValue = params.currentValue;
      existing.message = params.message;
      this.cache.set(existing.id, existing);
      this.persist();
      return { incident: existing, isNew: false };
    }

    const id = `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const incident: AlertIncident = {
      ...params,
      id,
      status: 'TRIGGERED',
      triggeredAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
    };

    this.cache.set(id, incident);
    this.persist();
    return { incident, isNew: true };
  }

  public acknowledge(
    id: string,
    actorId: string,
    workspaceId?: string
  ): AlertIncident | null {
    this.ensureInitialized();
    const inc = this.getById(id, workspaceId);
    if (!inc) return null;

    if (inc.status === 'RESOLVED') {
      return inc;
    }

    inc.status = 'ACKNOWLEDGED';
    inc.acknowledgedAt = new Date().toISOString();
    inc.acknowledgedBy = actorId;

    this.cache.set(id, inc);
    this.persist();
    return inc;
  }

  public resolve(
    id: string,
    actorId: string,
    resolutionNotes?: string,
    workspaceId?: string
  ): AlertIncident | null {
    this.ensureInitialized();
    const inc = this.getById(id, workspaceId);
    if (!inc) return null;

    inc.status = 'RESOLVED';
    inc.resolvedAt = new Date().toISOString();
    inc.resolvedBy = actorId;
    if (resolutionNotes) {
      inc.resolutionNotes = resolutionNotes;
    }

    this.cache.set(id, inc);
    this.persist();
    return inc;
  }
}

export const alertIncidentStore = new AlertIncidentStore();

