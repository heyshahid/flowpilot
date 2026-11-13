import fs from 'fs';
import path from 'path';
import { AlertRule } from '@/core/alerts/types';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'alert_rules.json');

export const SEED_ALERT_RULES: AlertRule[] = [
  {
    id: 'rule_exec_failure_high',
    workspaceId: 'ws_default',
    name: 'High Workflow Failure Rate',
    description: 'Triggers when workflow execution failure rate exceeds 25% over the evaluation window',
    category: 'EXECUTION',
    metric: 'failure_rate',
    operator: 'gte',
    threshold: 25.0,
    evaluationWindowMinutes: 60,
    cooldownMinutes: 30,
    severity: 'CRITICAL',
    enabled: true,
    channels: ['in_app'],
    createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 20).toISOString(),
    createdBy: 'usr_owner',
  },
  {
    id: 'rule_ai_cost_spike',
    workspaceId: 'ws_default',
    name: 'Monthly AI Cost Quota Warning',
    description: 'Alerts when monthly AI cost reaches or exceeds $20.00 USD',
    category: 'AI_USAGE',
    metric: 'monthly_cost_usd',
    operator: 'gte',
    threshold: 20.0,
    evaluationWindowMinutes: 1440,
    cooldownMinutes: 360,
    severity: 'WARNING',
    enabled: true,
    channels: ['in_app'],
    createdAt: new Date(Date.now() - 86400000 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 18).toISOString(),
    createdBy: 'usr_owner',
  },
  {
    id: 'rule_schedule_missed',
    workspaceId: 'ws_default',
    name: 'Missed Workflow Schedules Alert',
    description: 'Fires when 1 or more scheduled runs miss their target execution window',
    category: 'SCHEDULING',
    metric: 'missed_schedules',
    operator: 'gte',
    threshold: 1,
    evaluationWindowMinutes: 15,
    cooldownMinutes: 15,
    severity: 'WARNING',
    enabled: true,
    channels: ['in_app'],
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    createdBy: 'usr_admin',
  },
  {
    id: 'rule_integration_failures',
    workspaceId: 'ws_default',
    name: 'Integration & Webhook Error Rate Spikes',
    description: 'Alerts when third-party integration failure rate exceeds 20%',
    category: 'INTEGRATION',
    metric: 'integration_failure_rate',
    operator: 'gte',
    threshold: 20.0,
    evaluationWindowMinutes: 60,
    cooldownMinutes: 60,
    severity: 'CRITICAL',
    enabled: true,
    channels: ['in_app'],
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    createdBy: 'usr_admin',
  },
  {
    id: 'rule_staging_exec_fail',
    workspaceId: 'ws_staging',
    name: 'Staging Failures Alert',
    description: 'Alerts on failures in staging environment',
    category: 'EXECUTION',
    metric: 'failure_rate',
    operator: 'gte',
    threshold: 50.0,
    evaluationWindowMinutes: 60,
    cooldownMinutes: 60,
    severity: 'WARNING',
    enabled: true,
    channels: ['in_app'],
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    createdBy: 'usr_admin',
  },
];

export class AlertRuleStore {
  private cache: Map<string, AlertRule> = new Map();
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
        const data: AlertRule[] = JSON.parse(raw);
        for (const rule of data) {
          this.cache.set(rule.id, rule);
        }
      } else {
        for (const rule of SEED_ALERT_RULES) {
          this.cache.set(rule.id, rule);
        }
        this.persist();
      }
    } catch {
      for (const rule of SEED_ALERT_RULES) {
        this.cache.set(rule.id, rule);
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
      console.error('[AlertRuleStore] Failed to persist data:', err);
    }
  }

  public list(workspaceId: string, filter?: { category?: string; enabled?: boolean }): AlertRule[] {
    this.ensureInitialized();
    return Array.from(this.cache.values())
      .filter((r) => r.workspaceId === workspaceId)
      .filter((r) => (filter?.category ? r.category === filter.category : true))
      .filter((r) => (filter?.enabled !== undefined ? r.enabled === filter.enabled : true))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getById(id: string, workspaceId?: string): AlertRule | null {
    this.ensureInitialized();
    const rule = this.cache.get(id);
    if (!rule) return null;
    if (workspaceId && rule.workspaceId !== workspaceId) return null;
    return rule;
  }

  public create(
    params: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>
  ): AlertRule {
    this.ensureInitialized();
    const id = `rule_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const rule: AlertRule = {
      ...params,
      id,
      channels: params.channels?.length ? params.channels : ['in_app'],
      evaluationWindowMinutes: params.evaluationWindowMinutes || 15,
      cooldownMinutes: params.cooldownMinutes || 15,
      severity: params.severity || 'WARNING',
      enabled: params.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.cache.set(id, rule);
    this.persist();
    return rule;
  }

  public update(
    id: string,
    updates: Partial<Omit<AlertRule, 'id' | 'workspaceId' | 'createdAt'>>,
    workspaceId?: string
  ): AlertRule | null {
    this.ensureInitialized();
    const rule = this.getById(id, workspaceId);
    if (!rule) return null;

    const updated: AlertRule = {
      ...rule,
      ...updates,
      id: rule.id,
      workspaceId: rule.workspaceId,
      createdAt: rule.createdAt,
      updatedAt: new Date().toISOString(),
    };

    this.cache.set(id, updated);
    this.persist();
    return updated;
  }

  public delete(id: string, workspaceId?: string): boolean {
    this.ensureInitialized();
    const rule = this.getById(id, workspaceId);
    if (!rule) return false;

    this.cache.delete(id);
    this.persist();
    return true;
  }
}

export const alertRuleStore = new AlertRuleStore();

