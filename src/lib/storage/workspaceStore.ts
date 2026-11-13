import fs from 'fs';
import path from 'path';
import { WorkspaceRecord } from '../../core/auth/types';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'workspaces.json');

export const SEED_WORKSPACES: WorkspaceRecord[] = [
  {
    id: 'ws_default',
    name: 'Acme Production Workspace',
    slug: 'acme-production',
    description: 'Primary production workspace for marketing, CRM, and automated dispatch.',
    plan: 'pro',
    ownerId: 'usr_owner',
    isArchived: false,
    settings: {
      allowMemberInvitations: true,
      defaultMemberRole: 'EDITOR',
      enforceExecutionLimits: true,
      retentionDays: 90,
    },
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: 'ws_staging',
    name: 'Staging & QA Labs',
    slug: 'staging-qa',
    description: 'Isolated testing environment for pre-flight automation workflows and sandbox runs.',
    plan: 'starter',
    ownerId: 'usr_owner',
    isArchived: false,
    settings: {
      allowMemberInvitations: true,
      defaultMemberRole: 'EDITOR',
      enforceExecutionLimits: false,
      retentionDays: 30,
    },
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
];

export class WorkspaceStore {
  private workspaces: Map<string, WorkspaceRecord> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (typeof window === 'undefined') {
      try {
        if (fs.existsSync(DATA_FILE)) {
          const raw = fs.readFileSync(DATA_FILE, 'utf-8');
          const list: WorkspaceRecord[] = JSON.parse(raw);
          for (const w of list) {
            this.workspaces.set(w.id, w);
          }
        }
      } catch {
        // Fallback
      }
    }

    if (this.workspaces.size === 0) {
      for (const w of SEED_WORKSPACES) {
        this.workspaces.set(w.id, w);
      }
      this.persist();
    }
  }

  private persist(): void {
    if (typeof window === 'undefined') {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(this.workspaces.values()), null, 2), 'utf-8');
      } catch {
        // In-memory retains
      }
    }
  }

  public getById(id: string): WorkspaceRecord | null {
    return this.workspaces.get(id) || null;
  }

  public getBySlug(slug: string): WorkspaceRecord | null {
    for (const w of this.workspaces.values()) {
      if (w.slug.toLowerCase() === slug.toLowerCase()) {
        return w;
      }
    }
    return null;
  }

  public list(includeArchived = false): WorkspaceRecord[] {
    const all = Array.from(this.workspaces.values());
    if (includeArchived) return all;
    return all.filter((w) => !w.isArchived);
  }

  public create(params: {
    name: string;
    slug?: string;
    description?: string;
    ownerId: string;
    plan?: WorkspaceRecord['plan'];
    settings?: Partial<WorkspaceRecord['settings']>;
  }): WorkspaceRecord {
    const id = `ws_${Math.random().toString(36).substring(2, 9)}`;
    const slugBase = (params.slug || params.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${slugBase}-${Math.random().toString(36).substring(2, 5)}`;

    const workspace: WorkspaceRecord = {
      id,
      name: params.name.trim(),
      slug,
      description: params.description?.trim() || '',
      plan: params.plan || 'starter',
      ownerId: params.ownerId,
      isArchived: false,
      settings: {
        allowMemberInvitations: params.settings?.allowMemberInvitations ?? true,
        defaultMemberRole: params.settings?.defaultMemberRole || 'EDITOR',
        enforceExecutionLimits: params.settings?.enforceExecutionLimits ?? true,
        retentionDays: params.settings?.retentionDays ?? 60,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.workspaces.set(id, workspace);
    this.persist();
    return workspace;
  }

  public update(
    id: string,
    params: Partial<Pick<WorkspaceRecord, 'name' | 'description' | 'plan' | 'settings'>>
  ): WorkspaceRecord {
    const ws = this.workspaces.get(id);
    if (!ws) {
      throw new Error(`Workspace "${id}" not found.`);
    }

    if (params.name) ws.name = params.name.trim();
    if (params.description !== undefined) ws.description = params.description.trim();
    if (params.plan) ws.plan = params.plan;
    if (params.settings) {
      ws.settings = { ...ws.settings, ...params.settings };
    }
    ws.updatedAt = new Date().toISOString();

    this.persist();
    return ws;
  }

  public transferOwnership(workspaceId: string, newOwnerId: string, currentOwnerId: string): WorkspaceRecord {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) {
      throw new Error(`Workspace "${workspaceId}" not found.`);
    }

    if (ws.ownerId !== currentOwnerId) {
      throw new Error('Unauthorized: Only the current workspace owner can transfer ownership.');
    }

    if (newOwnerId === currentOwnerId) {
      throw new Error('Invalid transfer: Target user is already the workspace owner.');
    }

    ws.ownerId = newOwnerId;
    ws.updatedAt = new Date().toISOString();
    this.persist();
    return ws;
  }

  public archive(id: string): WorkspaceRecord {
    const ws = this.workspaces.get(id);
    if (!ws) {
      throw new Error(`Workspace "${id}" not found.`);
    }
    ws.isArchived = true;
    ws.updatedAt = new Date().toISOString();
    this.persist();
    return ws;
  }

  public restore(id: string): WorkspaceRecord {
    const ws = this.workspaces.get(id);
    if (!ws) {
      throw new Error(`Workspace "${id}" not found.`);
    }
    ws.isArchived = false;
    ws.updatedAt = new Date().toISOString();
    this.persist();
    return ws;
  }
}

export const workspaceStore = new WorkspaceStore();
