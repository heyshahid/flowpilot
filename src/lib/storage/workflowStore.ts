import { WorkflowGraph, WorkflowNode, WorkflowEdge } from '../../core/types/workflow';

export type WorkflowStatus = 'active' | 'draft' | 'paused';

export interface WorkflowRecord extends WorkflowGraph {
  description: string;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  executionCount: number;
  successCount: number;
  failureCount: number;
  lastExecutedAt?: string;
  workspaceId?: string;
  version?: number;
  createdBy?: string;
  createdByName?: string;
  lastModifiedBy?: string;
  lastModifiedByName?: string;
}

const STORAGE_KEY = 'flowpilot_workflows_v1';

export const SEED_WORKFLOWS: WorkflowRecord[] = [
  {
    id: 'wf_lead_qualification',
    name: 'Inbound Lead Qualification & VIP Routing',
    description: 'Ingests webhook leads, checks budget threshold, and notifies VIP sales reps.',
    status: 'active',
    workspaceId: 'ws_default',
    version: 1,
    createdBy: 'usr_owner',
    createdByName: 'Shahid Akram',
    lastModifiedBy: 'usr_owner',
    lastModifiedByName: 'Shahid Akram',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    executionCount: 142,
    successCount: 139,
    failureCount: 3,
    lastExecutedAt: new Date(Date.now() - 1800000).toISOString(),
    nodes: [
      {
        id: 'node_webhook',
        type: 'trigger.webhook',
        category: 'trigger',
        name: 'Inbound Webhook',
        description: 'Receives POST payload from contact form',
        config: { httpMethod: 'POST', responseStatusCode: 200 },
        position: { x: 100, y: 150 },
      },
      {
        id: 'node_filter_budget',
        type: 'logic.ifElse',
        category: 'logic',
        name: 'Check Budget >= $10k',
        description: 'Routes high-budget leads to VIP reps',
        config: {
          field: '{{ $trigger.payload.budget }}',
          operator: 'greater_than',
          value: '9999',
        },
        position: { x: 420, y: 150 },
      },
      {
        id: 'node_email_vip',
        type: 'action.sendEmail',
        category: 'action',
        name: 'Notify Senior Account Exec',
        description: 'Sends instant email alert for high-value deal',
        config: {
          to: 'sales-leads@acme.corp',
          subject: '🔥 VIP Lead Alert: {{ $trigger.payload.company }}',
          content: 'New enterprise lead submitted with budget: {{ $trigger.payload.budget }}',
        },
        position: { x: 780, y: 60 },
      },
      {
        id: 'node_nurture',
        type: 'data.transform',
        category: 'data',
        name: 'Route to Self-Serve Nurture',
        description: 'Tags lead for automated email sequence',
        config: { tier: 'Standard Nurture', priority: 'Normal' },
        position: { x: 780, y: 260 },
      },
    ],
    edges: [
      { id: 'e1', source: 'node_webhook', target: 'node_filter_budget' },
      { id: 'e2', source: 'node_filter_budget', target: 'node_email_vip', sourceHandle: 'true' },
      { id: 'e3', source: 'node_filter_budget', target: 'node_nurture', sourceHandle: 'false' },
    ],
  },
  {
    id: 'wf_order_enrichment',
    name: 'Customer Order Enrichment API',
    description: 'Fetches CRM profile for new purchase events and syncs delivery status.',
    status: 'draft',
    workspaceId: 'ws_default',
    version: 1,
    createdBy: 'usr_owner',
    createdByName: 'Shahid Akram',
    lastModifiedBy: 'usr_owner',
    lastModifiedByName: 'Shahid Akram',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    executionCount: 28,
    successCount: 28,
    failureCount: 0,
    lastExecutedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    nodes: [
      {
        id: 'node_order_trigger',
        type: 'trigger.webhook',
        category: 'trigger',
        name: 'New Order Received',
        description: 'Triggered when customer completes checkout',
        config: { httpMethod: 'POST' },
        position: { x: 100, y: 150 },
      },
      {
        id: 'node_crm_lookup',
        type: 'action.httpRequest',
        category: 'action',
        name: 'Fetch CRM Customer ID',
        description: 'GET request to internal customer API',
        config: {
          url: 'https://api.crm.example.com/v1/customers/{{ $trigger.payload.customerId }}',
          method: 'GET',
        },
        position: { x: 440, y: 150 },
      },
      {
        id: 'node_transform_order',
        type: 'data.transform',
        category: 'data',
        name: 'Format Shipping Payload',
        description: 'Prepares structured order manifest',
        config: { status: 'READY_TO_DISPATCH', priority: 'High' },
        position: { x: 780, y: 150 },
      },
    ],
    edges: [
      { id: 'e1', source: 'node_order_trigger', target: 'node_crm_lookup' },
      { id: 'e2', source: 'node_crm_lookup', target: 'node_transform_order' },
    ],
  },
  {
    id: 'wf_crm_sync',
    name: 'Home-grown CRM System',
    description: 'Universal Webhook → HTTP GET Record → Branch on Expression → Send Email / Slack Notification.',
    status: 'active',
    workspaceId: 'ws_default',
    version: 1,
    createdBy: 'usr_owner',
    createdByName: 'Shahid Akram',
    lastModifiedBy: 'usr_owner',
    lastModifiedByName: 'Shahid Akram',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    executionCount: 89,
    successCount: 89,
    failureCount: 0,
    lastExecutedAt: new Date(Date.now() - 900000).toISOString(),
    nodes: [
      {
        id: 'node_trigger_webhook',
        type: 'trigger.webhook',
        category: 'trigger',
        name: 'Universal Webhook',
        description: 'Universal Webhook - Webh...',
        config: { httpMethod: 'POST', responseStatusCode: 200 },
        position: { x: 350, y: 50 },
      },
      {
        id: 'node_get_record',
        type: 'action.httpRequest',
        category: 'action',
        name: 'Get Record',
        description: 'HTTP - GET Request',
        config: {
          url: 'https://api.github.com/users/octocat',
          method: 'GET',
        },
        position: { x: 350, y: 190 },
      },
      {
        id: 'node_check_record',
        type: 'logic.ifElse',
        category: 'logic',
        name: 'Check if record exists',
        description: 'Branch - Branch on Express',
        config: {
          field: '{{ $steps.node_get_record.output.status }}',
          operator: 'equals',
          value: '200',
        },
        position: { x: 350, y: 330 },
      },
      {
        id: 'node_send_email',
        type: 'action.sendEmail',
        category: 'action',
        name: 'Send Email',
        description: 'Update Existing Record Notification',
        config: {
          to: 'crm-sync@flowpilot.io',
          subject: '✅ CRM Record Verified: {{ $steps.node_get_record.output.data.login }}',
          content: 'Record exists in database with status 200. Dispatching automated sync update.',
        },
        position: { x: 160, y: 470 },
      },
      {
        id: 'node_send_notification',
        type: 'action.slack',
        category: 'action',
        name: 'Send Notification',
        description: 'Create Record / Missing Alert',
        config: {
          channel: '#crm-alerts',
          message: '⚠️ Record not found in upstream CRM. Initiating fallback create workflow.',
        },
        position: { x: 540, y: 470 },
      },
    ],
    edges: [
      { id: 'e1', source: 'node_trigger_webhook', target: 'node_get_record' },
      { id: 'e2', source: 'node_get_record', target: 'node_check_record' },
      { id: 'e3', source: 'node_check_record', target: 'node_send_email', sourceHandle: 'true' },
      { id: 'e4', source: 'node_check_record', target: 'node_send_notification', sourceHandle: 'false' },
    ],
  },
];

class WorkflowStore {
  private inMemoryWorkflows: WorkflowRecord[] = [...SEED_WORKFLOWS];

  private isClient(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  public getAll(workspaceId?: string): WorkflowRecord[] {
    let list: WorkflowRecord[];
    if (!this.isClient()) {
      list = this.inMemoryWorkflows;
    } else {
      try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_WORKFLOWS));
          list = SEED_WORKFLOWS;
        } else {
          list = JSON.parse(data) as WorkflowRecord[];
        }
      } catch {
        list = this.inMemoryWorkflows;
      }
    }

    if (workspaceId) {
      return list.filter((w) => (w.workspaceId || 'ws_default') === workspaceId);
    }
    return list;
  }

  public getById(id: string, workspaceId?: string): WorkflowRecord | null {
    const list = this.getAll();
    const wf = list.find((w) => w.id === id) || null;
    if (wf && workspaceId && (wf.workspaceId || 'ws_default') !== workspaceId) {
      return null;
    }
    return wf;
  }

  public save(
    workflow: WorkflowRecord,
    options?: {
      expectedVersion?: number;
      actor?: { id: string; name: string };
      workspaceId?: string;
    }
  ): WorkflowRecord {
    const list = this.getAll();
    const index = list.findIndex((w) => w.id === workflow.id);
    const existing = index >= 0 ? list[index] : null;

    // Check workspace isolation if provided
    if (options?.workspaceId && existing) {
      const existingWs = existing.workspaceId || 'ws_default';
      if (existingWs !== options.workspaceId) {
        throw new Error(`Cross-workspace access denied: Workflow "${workflow.id}" belongs to "${existingWs}".`);
      }
    }

    // Optimistic locking conflict check
    if (options?.expectedVersion !== undefined && existing && existing.version !== undefined) {
      if (existing.version !== options.expectedVersion) {
        throw new Error(
          `Conflict: Workflow was updated by another user (current version: ${existing.version}, expected: ${options.expectedVersion}). Please reload the workflow.`
        );
      }
    }

    const nextVersion = (existing?.version || 1) + 1;
    const now = new Date().toISOString();

    const updated: WorkflowRecord = {
      ...workflow,
      workspaceId: workflow.workspaceId || existing?.workspaceId || options?.workspaceId || 'ws_default',
      version: nextVersion,
      createdBy: workflow.createdBy || existing?.createdBy || options?.actor?.id || 'usr_owner',
      createdByName: workflow.createdByName || existing?.createdByName || options?.actor?.name || 'Shahid Akram',
      lastModifiedBy: options?.actor?.id || workflow.lastModifiedBy || 'usr_owner',
      lastModifiedByName: options?.actor?.name || workflow.lastModifiedByName || 'Shahid Akram',
      updatedAt: now,
    };

    let nextList: WorkflowRecord[];
    if (index >= 0) {
      nextList = [...list];
      nextList[index] = updated;
    } else {
      nextList = [updated, ...list];
    }

    this.persist(nextList);
    return updated;
  }

  public create(params: {
    name: string;
    description?: string;
    triggerType?: string;
    workspaceId?: string;
    actor?: { id: string; name: string };
  }): WorkflowRecord {
    const id = `wf_${Math.random().toString(36).substring(2, 9)}`;
    const triggerType = params.triggerType || 'trigger.webhook';

    const initialNodes: WorkflowNode[] = [
      {
        id: `node_start_${Math.random().toString(36).substring(2, 6)}`,
        type: triggerType,
        category: 'trigger',
        name: triggerType === 'trigger.webhook' ? 'Webhook Inbound' : 'Manual Run',
        description: 'Entry point for workflow triggers',
        config: triggerType === 'trigger.webhook' ? { httpMethod: 'POST', responseStatusCode: 200 } : {},
        position: { x: 120, y: 150 },
      },
    ];

    const newWorkflow: WorkflowRecord = {
      id,
      name: params.name.trim() || 'Untitled Workflow',
      description: params.description?.trim() || '',
      status: 'draft',
      workspaceId: params.workspaceId || 'ws_default',
      version: 1,
      createdBy: params.actor?.id || 'usr_owner',
      createdByName: params.actor?.name || 'Shahid Akram',
      lastModifiedBy: params.actor?.id || 'usr_owner',
      lastModifiedByName: params.actor?.name || 'Shahid Akram',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      nodes: initialNodes,
      edges: [],
    };

    const list = this.getAll();
    this.persist([newWorkflow, ...list]);
    return newWorkflow;
  }

  public duplicate(
    id: string,
    options?: { workspaceId?: string; actor?: { id: string; name: string } }
  ): WorkflowRecord | null {
    const original = this.getById(id, options?.workspaceId);
    if (!original) return null;

    const copyId = `wf_${Math.random().toString(36).substring(2, 9)}`;
    const copy: WorkflowRecord = {
      ...original,
      id: copyId,
      name: `${original.name} (Copy)`,
      status: 'draft',
      workspaceId: options?.workspaceId || original.workspaceId || 'ws_default',
      version: 1,
      createdBy: options?.actor?.id || 'usr_owner',
      createdByName: options?.actor?.name || 'Shahid Akram',
      lastModifiedBy: options?.actor?.id || 'usr_owner',
      lastModifiedByName: options?.actor?.name || 'Shahid Akram',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      lastExecutedAt: undefined,
    };

    const list = this.getAll();
    this.persist([copy, ...list]);
    return copy;
  }

  public transferOwnership(
    id: string,
    newOwnerId: string,
    newOwnerName: string,
    workspaceId?: string
  ): WorkflowRecord {
    const original = this.getById(id, workspaceId);
    if (!original) {
      throw new Error(`Workflow "${id}" not found.`);
    }

    original.createdBy = newOwnerId;
    original.createdByName = newOwnerName;
    original.updatedAt = new Date().toISOString();

    return this.save(original);
  }

  public rename(id: string, newName: string): WorkflowRecord | null {
    const original = this.getById(id);
    if (!original) return null;

    const updated: WorkflowRecord = {
      ...original,
      name: newName.trim(),
      updatedAt: new Date().toISOString(),
    };

    return this.save(updated);
  }

  public toggleStatus(id: string): WorkflowRecord | null {
    const original = this.getById(id);
    if (!original) return null;

    const nextStatus: WorkflowStatus = original.status === 'active' ? 'draft' : 'active';
    const updated: WorkflowRecord = {
      ...original,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };

    return this.save(updated);
  }

  public delete(id: string, workspaceId?: string): boolean {
    const list = this.getAll();
    const target = list.find((w) => w.id === id);
    if (!target) return false;

    if (workspaceId && (target.workspaceId || 'ws_default') !== workspaceId) {
      throw new Error(`Cross-workspace delete denied: Workflow belongs to "${target.workspaceId}".`);
    }

    const filtered = list.filter((w) => w.id !== id);
    this.persist(filtered);
    return true;
  }

  public getDashboardStats(workspaceId?: string) {
    const list = this.getAll(workspaceId);
    const totalWorkflows = list.length;
    const activeWorkflows = list.filter((w) => w.status === 'active').length;
    const successfulRuns = list.reduce((acc, curr) => acc + (curr.successCount || 0), 0);
    const failedRuns = list.reduce((acc, curr) => acc + (curr.failureCount || 0), 0);

    return {
      totalWorkflows,
      activeWorkflows,
      successfulRuns,
      failedRuns,
    };
  }

  private persist(list: WorkflowRecord[]) {
    this.inMemoryWorkflows = list;
    if (this.isClient()) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (e) {
        console.error('Failed to persist to localStorage', e);
      }
    }
  }
}

export const workflowStore = new WorkflowStore();

