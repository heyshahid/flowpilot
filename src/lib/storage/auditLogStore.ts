import fs from 'fs';
import path from 'path';

export type AuditResourceType =
  | 'workspace'
  | 'member'
  | 'workflow'
  | 'credential'
  | 'integration'
  | 'schedule'
  | 'invitation'
  | 'webhook'
  | 'security'
  | 'quota'
  | 'alert';

export interface AuditLogRecord {
  id: string;
  workspaceId: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  action: string;
  resourceType: AuditResourceType;
  resourceId: string;
  resourceName?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  timestamp: string;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'audit_logs.json');

export const SEED_AUDIT_LOGS: AuditLogRecord[] = [
  {
    id: 'aud_seed_001',
    workspaceId: 'ws_default',
    actorId: 'usr_owner',
    actorName: 'Shahid Akram',
    actorEmail: 'shd.13021990@gmail.com',
    action: 'workspace.created',
    resourceType: 'workspace',
    resourceId: 'ws_default',
    resourceName: 'Acme Production Workspace',
    metadata: { plan: 'pro', isolation: 'enforced' },
    ipAddress: '192.168.1.1',
    timestamp: new Date(Date.now() - 86400000 * 30).toISOString(),
  },
  {
    id: 'aud_seed_002',
    workspaceId: 'ws_default',
    actorId: 'usr_owner',
    actorName: 'Shahid Akram',
    actorEmail: 'shd.13021990@gmail.com',
    action: 'member.invited',
    resourceType: 'invitation',
    resourceId: 'inv_seed_sarah',
    resourceName: 'Sarah Connor',
    metadata: { role: 'ADMIN', email: 'sarah@cyberdyne.org' },
    ipAddress: '192.168.1.1',
    timestamp: new Date(Date.now() - 86400000 * 25).toISOString(),
  },
  {
    id: 'aud_seed_003',
    workspaceId: 'ws_default',
    actorId: 'usr_admin',
    actorName: 'Sarah Connor',
    actorEmail: 'sarah@cyberdyne.org',
    action: 'credential.created',
    resourceType: 'credential',
    resourceId: 'cred_sample_slack',
    resourceName: 'FlowPilot Alerts Slack Bot',
    metadata: { type: 'bearer_token', integrationId: 'slack' },
    ipAddress: '10.0.0.42',
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'aud_seed_004',
    workspaceId: 'ws_default',
    actorId: 'usr_editor',
    actorName: 'Alex Rivera',
    actorEmail: 'alex.rivera@dev.io',
    action: 'workflow.created',
    resourceType: 'workflow',
    resourceId: 'wf_lead_qualification',
    resourceName: 'Inbound Lead Qualification & VIP Routing',
    metadata: { triggerType: 'trigger.webhook', nodeCount: 4 },
    ipAddress: '10.0.0.88',
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'aud_seed_005',
    workspaceId: 'ws_default',
    actorId: 'usr_owner',
    actorName: 'Shahid Akram',
    actorEmail: 'shd.13021990@gmail.com',
    action: 'member.invited',
    resourceType: 'invitation',
    resourceId: 'inv_seed_david',
    resourceName: 'David Miller',
    metadata: { role: 'EDITOR', email: 'david.miller@acme.corp' },
    ipAddress: '192.168.1.1',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
  },
];

export class AuditLogStore {
  private logs: AuditLogRecord[] = [];

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (typeof window === 'undefined') {
      try {
        if (fs.existsSync(DATA_FILE)) {
          const raw = fs.readFileSync(DATA_FILE, 'utf-8');
          this.logs = JSON.parse(raw);
        }
      } catch {
        // Fallback
      }
    }

    if (this.logs.length === 0) {
      this.logs = [...SEED_AUDIT_LOGS];
      this.persist();
    }
  }

  private persist(): void {
    if (typeof window === 'undefined') {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        // Keep up to 1000 events
        const trimmed = this.logs.slice(0, 1000);
        fs.writeFileSync(DATA_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
      } catch {
        // In-memory retains
      }
    }
  }

  /**
   * Sanitizes sensitive fields like passwords, secrets, tokens from metadata.
   */
  private sanitizeMetadata(data?: Record<string, any>): Record<string, any> | undefined {
    if (!data) return undefined;
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('secret') ||
        lower.includes('token') ||
        lower.includes('password') ||
        lower.includes('key') ||
        lower.includes('auth')
      ) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  public log(event: Omit<AuditLogRecord, 'id' | 'timestamp'>): AuditLogRecord {
    const id = `aud_${Math.random().toString(36).substring(2, 10)}`;
    const record: AuditLogRecord = {
      ...event,
      id,
      metadata: this.sanitizeMetadata(event.metadata),
      timestamp: new Date().toISOString(),
    };

    this.logs.unshift(record);
    if (this.logs.length > 1000) {
      this.logs.pop();
    }

    this.persist();
    return record;
  }

  public list(
    workspaceId: string,
    options?: {
      resourceType?: AuditResourceType;
      actorId?: string;
      limit?: number;
    }
  ): AuditLogRecord[] {
    let results = this.logs.filter((l) => l.workspaceId === workspaceId);

    if (options?.resourceType) {
      results = results.filter((l) => l.resourceType === options.resourceType);
    }
    if (options?.actorId) {
      results = results.filter((l) => l.actorId === options.actorId);
    }

    const limit = options?.limit || 50;
    return results.slice(0, limit);
  }

  public getRecentActivity(workspaceId: string, limit = 10): AuditLogRecord[] {
    return this.list(workspaceId, { limit });
  }
}

export const auditLogStore = new AuditLogStore();
