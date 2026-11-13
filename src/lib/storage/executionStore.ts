import fs from 'fs';
import path from 'path';
import {
  ExecutionFilter,
  StepExecutionRecord,
  WorkflowExecutionRecord,
  WorkflowExecutionStatus,
} from '../../core/execution/types';

const STORAGE_KEY = 'flowpilot_executions_v1';
const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'executions.json');

export const SEED_EXECUTIONS: WorkflowExecutionRecord[] = [
  {
    id: 'exec_8fa1b920',
    workflowId: 'wf_lead_qualification',
    workflowName: 'Inbound Lead Qualification & VIP Routing',
    status: 'COMPLETED',
    trigger: {
      type: 'trigger.webhook',
      payload: {
        lead: { name: 'Sarah Connor', email: 'sarah@cyberdyne.org', budget: 50000 },
      },
      timestamp: new Date(Date.now() - 720000).toISOString(),
    },
    startedAt: new Date(Date.now() - 720000).toISOString(),
    completedAt: new Date(Date.now() - 719962).toISOString(),
    durationMs: 38,
    retryCount: 0,
    maxRetries: 3,
    stateHistory: [
      { status: 'QUEUED', timestamp: new Date(Date.now() - 720000).toISOString() },
      { status: 'VALIDATING', timestamp: new Date(Date.now() - 719998).toISOString() },
      { status: 'RUNNING', timestamp: new Date(Date.now() - 719995).toISOString() },
      { status: 'COMPLETED', timestamp: new Date(Date.now() - 719962).toISOString() },
    ],
    traces: [
      {
        nodeId: 'node_webhook',
        nodeType: 'trigger.webhook',
        nodeName: 'Inbound Webhook',
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 719995).toISOString(),
        completedAt: new Date(Date.now() - 719990).toISOString(),
        durationMs: 5,
        attempts: 1,
        retryCount: 0,
        input: { method: 'POST' },
        output: { webhookReceived: true, payload: { budget: 50000 } },
      },
      {
        nodeId: 'node_filter_budget',
        nodeType: 'logic.ifElse',
        nodeName: 'Check Budget >= $10k',
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 719990).toISOString(),
        completedAt: new Date(Date.now() - 719985).toISOString(),
        durationMs: 5,
        attempts: 1,
        retryCount: 0,
        input: { field: 50000, operator: 'greater_than', value: '9999' },
        output: { result: true, branch: 'true' },
      },
      {
        nodeId: 'node_email_vip',
        nodeType: 'action.sendEmail',
        nodeName: 'Notify Senior Account Exec',
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 719985).toISOString(),
        completedAt: new Date(Date.now() - 719962).toISOString(),
        durationMs: 23,
        attempts: 1,
        retryCount: 0,
        input: { to: 'sales-leads@acme.corp', subject: '🔥 VIP Lead Alert: Cyberdyne' },
        output: { delivered: true, messageId: 'msg_9821_vip' },
      },
      {
        nodeId: 'node_nurture',
        nodeType: 'data.transform',
        nodeName: 'Route to Self-Serve Nurture',
        status: 'SKIPPED',
        durationMs: 0,
        attempts: 0,
        retryCount: 0,
        input: {},
        output: {},
      },
    ],
    createdAt: new Date(Date.now() - 720000).toISOString(),
    updatedAt: new Date(Date.now() - 719962).toISOString(),
  },
  {
    id: 'exec_72cd49e1',
    workflowId: 'wf_order_enrichment',
    workflowName: 'Customer Order Enrichment API',
    status: 'COMPLETED',
    trigger: {
      type: 'trigger.webhook',
      payload: { orderId: 'ord_9182', total: 420.5 },
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: new Date(Date.now() - 3599946).toISOString(),
    durationMs: 54,
    retryCount: 0,
    maxRetries: 3,
    stateHistory: [
      { status: 'QUEUED', timestamp: new Date(Date.now() - 3600000).toISOString() },
      { status: 'VALIDATING', timestamp: new Date(Date.now() - 3599998).toISOString() },
      { status: 'RUNNING', timestamp: new Date(Date.now() - 3599995).toISOString() },
      { status: 'COMPLETED', timestamp: new Date(Date.now() - 3599946).toISOString() },
    ],
    traces: [
      {
        nodeId: 'node_order_trigger',
        nodeType: 'trigger.webhook',
        nodeName: 'New Order Received',
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 3599995).toISOString(),
        completedAt: new Date(Date.now() - 3599990).toISOString(),
        durationMs: 5,
        attempts: 1,
        retryCount: 0,
        input: {},
        output: { orderId: 'ord_9182' },
      },
    ],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3599946).toISOString(),
  },
];

export class ExecutionStore {
  private inMemoryExecutions: Map<string, WorkflowExecutionRecord> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // 1. Try reading from filesystem if server-side
    if (typeof window === 'undefined') {
      try {
        if (fs.existsSync(DATA_FILE)) {
          const raw = fs.readFileSync(DATA_FILE, 'utf-8');
          const list: WorkflowExecutionRecord[] = JSON.parse(raw);
          for (const item of list) {
            this.inMemoryExecutions.set(item.id, item);
          }
          return;
        }
      } catch {
        // Fallback to seeds
      }
    } else {
      // 2. Client-side localStorage check
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const list: WorkflowExecutionRecord[] = JSON.parse(raw);
          for (const item of list) {
            this.inMemoryExecutions.set(item.id, item);
          }
          return;
        }
      } catch {
        // Fallback
      }
    }

    // Default: seed executions
    for (const seed of SEED_EXECUTIONS) {
      this.inMemoryExecutions.set(seed.id, seed);
    }
    this.persist();
  }

  private persist(): void {
    const list = Array.from(this.inMemoryExecutions.values());

    if (typeof window === 'undefined') {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
      } catch {
        // Disk write failed, memory retained
      }
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch {
        // Storage quota or restricted
      }
    }
  }

  public async create(record: WorkflowExecutionRecord): Promise<WorkflowExecutionRecord> {
    this.inMemoryExecutions.set(record.id, record);
    this.persist();
    return record;
  }

  public async getById(id: string): Promise<WorkflowExecutionRecord | null> {
    return this.inMemoryExecutions.get(id) || null;
  }

  public async update(
    id: string,
    updates: Partial<WorkflowExecutionRecord>
  ): Promise<WorkflowExecutionRecord> {
    const existing = this.inMemoryExecutions.get(id);
    if (!existing) {
      throw new Error(`Execution record "${id}" not found.`);
    }

    const updated: WorkflowExecutionRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.inMemoryExecutions.set(id, updated);
    this.persist();
    return updated;
  }

  public async list(filter?: ExecutionFilter): Promise<{
    items: WorkflowExecutionRecord[];
    total: number;
  }> {
    let list = Array.from(this.inMemoryExecutions.values());

    // Sort by startedAt descending (most recent first)
    list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    if (filter?.workspaceId) {
      list = list.filter((r) => (r.workspaceId || 'ws_default') === filter.workspaceId);
    }

    if (filter?.workflowId) {
      list = list.filter((r) => r.workflowId === filter.workflowId);
    }

    if (filter?.status) {
      list = list.filter((r) => r.status === filter.status);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.workflowName.toLowerCase().includes(q) ||
          r.trigger.type.toLowerCase().includes(q)
      );
    }

    const total = list.length;
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 50;

    const items = list.slice(offset, offset + limit);
    return { items, total };
  }

  public async delete(id: string): Promise<boolean> {
    const deleted = this.inMemoryExecutions.delete(id);
    if (deleted) {
      this.persist();
    }
    return deleted;
  }
}

// Global Execution Store singleton
export const executionStore = new ExecutionStore();

