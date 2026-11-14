import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { SEED_WORKFLOWS } from '../src/lib/storage/workflowStore';

export interface MigrationOptions {
  dataDir?: string;
  backupDir?: string;
  dryRun?: boolean;
  verbose?: boolean;
  client?: PrismaClient;
}

export interface TableMigrationResult {
  tableName: string;
  sourceCount: number;
  migratedCount: number;
  skippedDuplicates: number;
  invalidCount: number;
  errors: string[];
  sourceChecksum: string;
}

export interface MigrationSummary {
  timestamp: string;
  durationMs: number;
  totalSourceRecords: number;
  totalMigratedRecords: number;
  totalSkippedDuplicates: number;
  totalInvalidRecords: number;
  backupPath?: string;
  results: Record<string, TableMigrationResult>;
  success: boolean;
}

export class JsonToPgMigrator {
  private dataDir: string;
  private backupDir: string;
  private dryRun: boolean;
  private verbose: boolean;
  private client: PrismaClient;

  constructor(options: MigrationOptions = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), '.data');
    this.backupDir = options.backupDir || path.join(process.cwd(), `.data_backup_${Date.now()}`);
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.client = options.client || new PrismaClient();
  }

  /**
   * Creates a pre-migration snapshot of the source data directory.
   */
  public createSnapshot(): string {
    if (!fs.existsSync(this.dataDir)) {
      throw new Error(`Source data directory "${this.dataDir}" does not exist.`);
    }

    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    const files = fs.readdirSync(this.dataDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const src = path.join(this.dataDir, file);
        const dest = path.join(this.backupDir, file);
        fs.copyFileSync(src, dest);
      }
    }

    return this.backupDir;
  }

  /**
   * Computes sha256 checksum of a file.
   */
  public computeFileChecksum(filePath: string): string {
    if (!fs.existsSync(filePath)) return 'FILE_NOT_FOUND';
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private readJson<T>(filename: string): T[] {
    const fullPath = path.join(this.dataDir, filename);
    if (!fs.existsSync(fullPath)) return [];
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err: any) {
      throw new Error(`Failed to parse "${filename}": ${err.message}`);
    }
  }

  /**
   * Executes the full migration following strict foreign-key dependency ordering.
   */
  public async migrate(): Promise<MigrationSummary> {
    const start = Date.now();
    let backupPath: string | undefined;

    if (!this.dryRun) {
      backupPath = this.createSnapshot();
    }

    const results: Record<string, TableMigrationResult> = {};
    let totalSource = 0;
    let totalMigrated = 0;
    let totalSkipped = 0;
    let totalInvalid = 0;
    let hasFailure = false;

    // Ordered sequence to respect foreign keys
    const migrationSteps = [
      { name: 'User', file: 'users.json', fn: () => this.migrateUsers() },
      { name: 'Workspace', file: 'workspaces.json', fn: () => this.migrateWorkspaces() },
      { name: 'Membership', file: 'memberships.json', fn: () => this.migrateMemberships() },
      { name: 'Invitation', file: 'invitations.json', fn: () => this.migrateInvitations() },
      { name: 'Workflow', file: 'seed_workflows', fn: () => this.migrateWorkflows() },
      { name: 'WorkflowVersion', file: 'workflow_versions.json', fn: () => this.migrateWorkflowVersions() },
      { name: 'Execution', file: 'executions.json', fn: () => this.migrateExecutions() },
      { name: 'Schedule', file: 'schedules.json', fn: () => this.migrateSchedules() },
      { name: 'Credential', file: 'credentials.json', fn: () => this.migrateCredentials() },
      { name: 'WebhookConfig', file: 'webhooks.json', fn: () => this.migrateWebhooks() },
      { name: 'WebhookDelivery', file: 'webhook_deliveries.json', fn: () => this.migrateWebhookDeliveries() },
      { name: 'AlertRule', file: 'alert_rules.json', fn: () => this.migrateAlertRules() },
      { name: 'AlertIncident', file: 'alert_incidents.json', fn: () => this.migrateAlertIncidents() },
      { name: 'Notification', file: 'notifications.json', fn: () => this.migrateNotifications() },
      { name: 'WorkspaceLimits', file: 'workspace_limits.json', fn: () => this.migrateWorkspaceLimits() },
      { name: 'Recommendation', file: 'recommendations.json', fn: () => this.migrateRecommendations() },
      { name: 'RecommendationFeedback', file: 'recommendation_feedback.json', fn: () => this.migrateRecommendationFeedback() },
      { name: 'AIUsageRecord', file: 'ai_usage.json', fn: () => this.migrateAIUsage() },
      { name: 'AIConversation', file: 'ai_conversations.json', fn: () => this.migrateAIConversations() },
      { name: 'AuditLog', file: 'audit_logs.json', fn: () => this.migrateAuditLogs() },
    ];

    for (const step of migrationSteps) {
      try {
        const res = await step.fn();
        results[step.name] = res;
        totalSource += res.sourceCount;
        totalMigrated += res.migratedCount;
        totalSkipped += res.skippedDuplicates;
        totalInvalid += res.invalidCount;
        if (res.invalidCount > 0 || res.errors.length > 0) {
          hasFailure = true;
        }
      } catch (err: any) {
        hasFailure = true;
        results[step.name] = {
          tableName: step.name,
          sourceCount: 0,
          migratedCount: 0,
          skippedDuplicates: 0,
          invalidCount: 1,
          errors: [err.message],
          sourceChecksum: 'ERROR',
        };
      }
    }

    return {
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      totalSourceRecords: totalSource,
      totalMigratedRecords: totalMigrated,
      totalSkippedDuplicates: totalSkipped,
      totalInvalidRecords: totalInvalid,
      backupPath,
      results,
      success: !hasFailure,
    };
  }

  // --- Step 1: Users ---
  private async migrateUsers(): Promise<TableMigrationResult> {
    const file = 'users.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    const seenEmails = new Set<string>();
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const u of records) {
      if (!u.id || !u.email || !u.name) {
        invalid++;
        errors.push(`Invalid User record missing required fields: id=${u.id}`);
        continue;
      }

      if (seenEmails.has(u.email.toLowerCase())) {
        skipped++;
        continue;
      }
      seenEmails.add(u.email.toLowerCase());

      if (!this.dryRun) {
        await (this.client as any).user.upsert({
          where: { id: u.id },
          create: {
            id: u.id,
            email: u.email.toLowerCase(),
            name: u.name,
            avatarUrl: u.avatarUrl || null,
            createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
            updatedAt: new Date(),
          },
          update: {
            email: u.email.toLowerCase(),
            name: u.name,
            avatarUrl: u.avatarUrl || null,
          },
        });
      }
      migrated++;
    }

    return { tableName: 'User', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 2: Workspaces ---
  private async migrateWorkspaces(): Promise<TableMigrationResult> {
    const file = 'workspaces.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    const seenSlugs = new Set<string>();
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const w of records) {
      if (!w.id || !w.name) {
        invalid++;
        errors.push(`Invalid Workspace record missing id or name: ${w.id}`);
        continue;
      }

      let slug = w.slug || w.id.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      if (seenSlugs.has(slug)) {
        slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
      }
      seenSlugs.add(slug);

      if (!this.dryRun) {
        await (this.client as any).workspace.upsert({
          where: { id: w.id },
          create: {
            id: w.id,
            name: w.name,
            slug,
            ownerId: w.ownerId || 'usr_owner',
            isArchived: Boolean(w.isArchived),
            createdAt: w.createdAt ? new Date(w.createdAt) : new Date(),
            updatedAt: w.updatedAt ? new Date(w.updatedAt) : new Date(),
          },
          update: {
            name: w.name,
            slug,
            ownerId: w.ownerId || 'usr_owner',
            isArchived: Boolean(w.isArchived),
          },
        });
      }
      migrated++;
    }

    return { tableName: 'Workspace', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 3: Memberships ---
  private async migrateMemberships(): Promise<TableMigrationResult> {
    const file = 'memberships.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    const seen = new Set<string>();
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const m of records) {
      if (!m.workspaceId || !m.userId) {
        invalid++;
        errors.push(`Invalid Membership missing workspaceId or userId`);
        continue;
      }

      const key = `${m.workspaceId}:${m.userId}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);

      if (!this.dryRun) {
        try {
          await (this.client as any).membership.upsert({
            where: { workspaceId_userId: { workspaceId: m.workspaceId, userId: m.userId } },
            create: {
              id: m.id || `mem_${m.workspaceId}_${m.userId}`,
              workspaceId: m.workspaceId,
              userId: m.userId,
              role: (m.role as any) || 'VIEWER',
              status: m.status || 'active',
              createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
              lastActiveAt: m.lastActiveAt ? new Date(m.lastActiveAt) : null,
            },
            update: {
              role: (m.role as any) || 'VIEWER',
              status: m.status || 'active',
            },
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`Membership insert failed (${key}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'Membership', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 4: Invitations ---
  private async migrateInvitations(): Promise<TableMigrationResult> {
    const file = 'invitations.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const inv of records) {
      const token = inv.token || inv.tokenHash || inv.id;
      if (!inv.id || !inv.workspaceId || !inv.email || !token) {
        invalid++;
        errors.push(`Invalid Invitation missing required fields: ${inv.id}`);
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).invitation.upsert({
            where: { token },
            create: {
              id: inv.id,
              workspaceId: inv.workspaceId,
              email: inv.email,
              role: (inv.role as any) || 'VIEWER',
              token,
              invitedById: inv.invitedBy || 'usr_owner',
              expiresAt: inv.expiresAt ? new Date(inv.expiresAt) : new Date(Date.now() + 86400000 * 7),
              status: inv.status || 'pending',
              createdAt: inv.createdAt ? new Date(inv.createdAt) : new Date(),
            },
            update: {
              status: inv.status || 'pending',
            },
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`Invitation insert failed: ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'Invitation', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 5: Workflows ---
  private async migrateWorkflows(): Promise<TableMigrationResult> {
    const records = SEED_WORKFLOWS;
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const wf of records) {
      if (!wf.id || !wf.name) {
        invalid++;
        errors.push(`Invalid Workflow missing id or name: ${wf.id}`);
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).workflow.upsert({
            where: { id: wf.id },
            create: {
              id: wf.id,
              workspaceId: wf.workspaceId || 'ws_default',
              name: wf.name,
              description: wf.description || null,
              status: (wf.status as any) || 'active',
              version: wf.version || 1,
              nodes: wf.nodes as any,
              edges: wf.edges as any,
              viewport: (wf as any).viewport || null,
              executionCount: wf.executionCount || 0,
              successCount: wf.successCount || 0,
              failureCount: wf.failureCount || 0,
              lastExecutedAt: wf.lastExecutedAt ? new Date(wf.lastExecutedAt) : null,
              createdBy: wf.createdBy || null,
              lastModifiedBy: wf.lastModifiedBy || null,
              createdAt: wf.createdAt ? new Date(wf.createdAt) : new Date(),
              updatedAt: wf.updatedAt ? new Date(wf.updatedAt) : new Date(),
            },
            update: {
              name: wf.name,
              description: wf.description || null,
              status: (wf.status as any) || 'active',
              nodes: wf.nodes as any,
              edges: wf.edges as any,
            },
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`Workflow insert failed (${wf.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'Workflow', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: 'IN_MEMORY_SEEDS' };
  }

  // --- Step 6: Workflow Versions ---
  private async migrateWorkflowVersions(): Promise<TableMigrationResult> {
    const file = 'workflow_versions.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const v of records) {
      const version = v.version !== undefined ? v.version : v.versionNumber;
      if (!v.id || !v.workflowId || version === undefined) {
        invalid++;
        errors.push(`Invalid WorkflowVersion record: ${v.id}`);
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).workflowVersion.upsert({
            where: { workflowId_version: { workflowId: v.workflowId, version } },
            create: {
              id: v.id,
              workflowId: v.workflowId,
              version,
              name: v.name || 'Version snapshot',
              description: v.description || null,
              nodes: v.nodes || [],
              edges: v.edges || [],
              createdBy: v.createdBy || null,
              changeLog: v.changeLog || v.changeSummary || null,
              createdAt: v.createdAt ? new Date(v.createdAt) : new Date(),
            },
            update: {
              name: v.name || 'Version snapshot',
            },
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`WorkflowVersion insert failed (${v.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'WorkflowVersion', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 7: Executions ---
  private async migrateExecutions(): Promise<TableMigrationResult> {
    const file = 'executions.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const ex of records) {
      if (!ex.id || !ex.workflowId) {
        invalid++;
        errors.push(`Invalid Execution record missing id or workflowId`);
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).execution.upsert({
            where: { id: ex.id },
            create: {
              id: ex.id,
              workspaceId: ex.workspaceId || 'ws_default',
              workflowId: ex.workflowId,
              workflowName: ex.workflowName || 'Workflow Execution',
              status: ex.status || 'COMPLETED',
              triggerType: ex.trigger?.type || 'trigger.manual',
              triggerData: ex.trigger || {},
              startedAt: ex.startedAt ? new Date(ex.startedAt) : new Date(),
              completedAt: ex.completedAt ? new Date(ex.completedAt) : null,
              durationMs: ex.durationMs || null,
              retryCount: ex.retryCount || 0,
              maxRetries: ex.maxRetries || 3,
              errorMessage: ex.errorMessage || null,
              stateHistory: ex.stateHistory || [],
              createdAt: ex.startedAt ? new Date(ex.startedAt) : new Date(),
              updatedAt: ex.completedAt ? new Date(ex.completedAt) : new Date(),
              steps: {
                create: (ex.traces || []).map((t: any) => ({
                  id: `${ex.id}_${t.nodeId}_${t.attempts || 1}`,
                  nodeId: t.nodeId,
                  nodeType: t.nodeType || 'node',
                  nodeName: t.nodeName || 'Node',
                  status: t.status || 'COMPLETED',
                  startedAt: t.startedAt ? new Date(t.startedAt) : new Date(),
                  completedAt: t.completedAt ? new Date(t.completedAt) : null,
                  durationMs: t.durationMs || null,
                  attempts: t.attempts || 1,
                  retryCount: t.retryCount || 0,
                  input: t.input || null,
                  output: t.output || null,
                  error: t.error || null,
                })),
              },
            },
            update: {
              status: ex.status || 'COMPLETED',
            },
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`Execution insert failed (${ex.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'Execution', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 8: Schedules ---
  private async migrateSchedules(): Promise<TableMigrationResult> {
    const file = 'schedules.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const sc of records) {
      const cron = sc.cron || sc.cronExpression;
      if (!sc.id || !sc.workflowId || !cron) {
        invalid++;
        errors.push(`Invalid Schedule record missing required fields: ${sc.id}`);
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).schedule.upsert({
            where: { id: sc.id },
            create: {
              id: sc.id,
              workspaceId: sc.workspaceId || 'ws_default',
              workflowId: sc.workflowId,
              cron,
              timezone: sc.timezone || 'UTC',
              enabled: sc.enabled !== false && sc.status !== 'paused',
              lastRunAt: sc.lastRunAt ? new Date(sc.lastRunAt) : null,
              nextRunAt: sc.nextRunAt ? new Date(sc.nextRunAt) : new Date(),
              inputPayload: sc.inputPayload || null,
              createdAt: sc.createdAt ? new Date(sc.createdAt) : new Date(),
              updatedAt: new Date(),
            },
            update: {
              cron,
              enabled: sc.enabled !== false && sc.status !== 'paused',
              nextRunAt: sc.nextRunAt ? new Date(sc.nextRunAt) : new Date(),
            },
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`Schedule insert failed (${sc.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'Schedule', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 9: Credentials ---
  private async migrateCredentials(): Promise<TableMigrationResult> {
    const file = 'credentials.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const c of records) {
      const provider = c.provider || c.integrationId || c.type || (c.name && c.name.toLowerCase().includes('sendgrid') ? 'smtp' : (c.maskedPreview?.host ? 'smtp' : 'custom'));
      if (!c.id || !provider) {
        invalid++;
        errors.push(`Invalid Credential missing id or provider: ${c.id}`);
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).credential.upsert({
            where: { id: c.id },
            create: {
              id: c.id,
              workspaceId: c.workspaceId || 'ws_default',
              name: c.name || provider,
              provider,
              encryptedData: c.encryptedData || 'ENCRYPTED_VAULT_PLACEHOLDER',
              status: c.status || 'active',
              lastVerifiedAt: c.lastVerifiedAt ? new Date(c.lastVerifiedAt) : null,
              createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
              updatedAt: new Date(),
            },
            update: {
              status: c.status || 'active',
            },
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`Credential insert failed (${c.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'Credential', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 10: WebhookConfigs ---
  private async migrateWebhooks(): Promise<TableMigrationResult> {
    const file = 'webhooks.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const w of records) {
      if (!w.id || !w.token || !w.workflowId) {
        invalid++;
        errors.push(`Invalid WebhookConfig missing token or workflowId`);
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).webhookConfig.upsert({
            where: { token: w.token },
            create: {
              id: w.id,
              workspaceId: w.workspaceId || 'ws_default',
              workflowId: w.workflowId,
              name: w.name || 'Webhook',
              token: w.token,
              secretHash: w.secretHash || w.secret || 'HASHED_SECRET',
              status: w.status || 'active',
              allowedMethods: w.allowedMethods || ['POST'],
              authType: w.authType || 'hmac_sha256',
              rateLimitPerMin: w.rateLimitPerMin || 60,
              replayToleranceSec: w.replayToleranceSec || 300,
              deliveryCount: w.deliveryCount || 0,
              lastDeliveredAt: w.lastDeliveredAt ? new Date(w.lastDeliveredAt) : null,
              createdAt: w.createdAt ? new Date(w.createdAt) : new Date(),
              updatedAt: new Date(),
            },
            update: {
              status: w.status || 'active',
            },
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`WebhookConfig insert failed (${w.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'WebhookConfig', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 11: Webhook Deliveries ---
  private async migrateWebhookDeliveries(): Promise<TableMigrationResult> {
    const file = 'webhook_deliveries.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const d of records) {
      if (!d.id || !d.webhookId) {
        invalid++;
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).webhookDelivery.upsert({
            where: { id: d.id },
            create: {
              id: d.id,
              webhookId: d.webhookId,
              workflowId: d.workflowId || 'wf_unknown',
              executionId: d.executionId || null,
              status: d.status || 'ACCEPTED',
              httpStatus: d.httpStatus || 200,
              requestMethod: d.requestMethod || 'POST',
              headers: d.headers || {},
              clientIp: d.clientIp || '127.0.0.1',
              payloadPreview: d.payloadPreview || '',
              durationMs: d.durationMs || 0,
              errorReason: d.errorReason || null,
              createdAt: d.timestamp ? new Date(d.timestamp) : new Date(),
            },
            update: {},
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`WebhookDelivery insert failed (${d.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'WebhookDelivery', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 12: Alert Rules ---
  private async migrateAlertRules(): Promise<TableMigrationResult> {
    const file = 'alert_rules.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const r of records) {
      if (!r.id || !r.name || !r.metric) {
        invalid++;
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).alertRule.upsert({
            where: { id: r.id },
            create: {
              id: r.id,
              workspaceId: r.workspaceId || 'ws_default',
              name: r.name,
              metric: r.metric,
              condition: r.condition || 'gt',
              threshold: Number(r.threshold || 0),
              windowSec: Number(r.windowSec || 300),
              cooldownMin: Number(r.cooldownMin || 15),
              channels: r.channels || [],
              enabled: r.enabled !== false,
              createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
              updatedAt: new Date(),
            },
            update: {
              enabled: r.enabled !== false,
            },
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`AlertRule insert failed (${r.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'AlertRule', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 13: Alert Incidents ---
  private async migrateAlertIncidents(): Promise<TableMigrationResult> {
    const file = 'alert_incidents.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const inc of records) {
      if (!inc.id || !inc.ruleId) {
        invalid++;
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).alertIncident.upsert({
            where: { id: inc.id },
            create: {
              id: inc.id,
              workspaceId: inc.workspaceId || 'ws_default',
              ruleId: inc.ruleId,
              ruleName: inc.ruleName || 'Incident',
              metric: inc.metric || 'failure_rate',
              triggerValue: Number(inc.triggerValue || 0),
              threshold: Number(inc.threshold || 0),
              status: inc.status || 'OPEN',
              dedupKey: inc.dedupKey || inc.id,
              occurrences: Number(inc.occurrences || 1),
              startedAt: inc.startedAt ? new Date(inc.startedAt) : new Date(),
              acknowledgedAt: inc.acknowledgedAt ? new Date(inc.acknowledgedAt) : null,
              acknowledgedBy: inc.acknowledgedBy || null,
              resolvedAt: inc.resolvedAt ? new Date(inc.resolvedAt) : null,
              resolvedBy: inc.resolvedBy || null,
            },
            update: {
              status: inc.status || 'OPEN',
            },
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`AlertIncident insert failed (${inc.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'AlertIncident', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 14: Notifications ---
  private async migrateNotifications(): Promise<TableMigrationResult> {
    const file = 'notifications.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const n of records) {
      if (!n.id || !n.channel) {
        invalid++;
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).notification.upsert({
            where: { id: n.id },
            create: {
              id: n.id,
              workspaceId: n.workspaceId || 'ws_default',
              incidentId: n.incidentId || null,
              channel: n.channel,
              recipient: n.recipient || 'system',
              status: n.status || 'SENT',
              payload: n.payload || {},
              createdAt: n.timestamp ? new Date(n.timestamp) : new Date(),
            },
            update: {},
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`Notification insert failed (${n.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'Notification', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 15: Workspace Limits ---
  private async migrateWorkspaceLimits(): Promise<TableMigrationResult> {
    const file = 'workspace_limits.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const l of records) {
      if (!l.workspaceId) {
        invalid++;
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).workspaceLimits.upsert({
            where: { workspaceId: l.workspaceId },
            create: {
              id: l.id || `lim_${l.workspaceId}`,
              workspaceId: l.workspaceId,
              maxWorkflows: l.maxWorkflows || 5,
              maxMonthlyExecutions: l.maxMonthlyExecutions || 1000,
              maxAiTokensPerMonth: l.maxAiTokensPerMonth || 50000,
              maxTeamMembers: l.maxTeamMembers || 2,
              maxActiveSchedules: l.maxActiveSchedules || 3,
              usedWorkflows: l.usedWorkflows || 0,
              usedExecutionsMonth: l.usedExecutionsMonth || 0,
              usedAiTokensMonth: l.usedAiTokensMonth || 0,
              usedTeamMembers: l.usedTeamMembers || 1,
              resetDate: l.resetDate ? new Date(l.resetDate) : new Date(Date.now() + 86400000 * 30),
              updatedAt: new Date(),
            },
            update: {
              usedWorkflows: l.usedWorkflows || 0,
              usedExecutionsMonth: l.usedExecutionsMonth || 0,
            },
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`WorkspaceLimits insert failed (${l.workspaceId}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'WorkspaceLimits', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 16: Recommendations ---
  private async migrateRecommendations(): Promise<TableMigrationResult> {
    const file = 'recommendations.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const r of records) {
      if (!r.id || !r.title) {
        invalid++;
        continue;
      }

      const dedupKey = r.dedupKey || `${r.workspaceId || 'ws_default'}_${r.workflowId || 'wf'}_${r.diagnosticRuleId || r.id}`;

      if (!this.dryRun) {
        try {
          await (this.client as any).recommendation.upsert({
            where: { dedupKey },
            create: {
              id: r.id,
              workspaceId: r.workspaceId || 'ws_default',
              workflowId: r.workflowId || 'wf_lead_qualification',
              category: r.category || 'WORKFLOW_EFFICIENCY',
              diagnosticRuleId: r.diagnosticRuleId || 'RULE_EFF_01',
              title: r.title,
              impactDescription: r.impactDescription || '',
              remediation: r.remediation || '',
              priorityScore: Number(r.priorityScore || 50),
              confidenceScore: Number(r.confidenceScore || 75),
              evidence: r.evidence || {},
              status: r.status || 'ACTIVE',
              dedupKey,
              createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
              updatedAt: new Date(),
            },
            update: {
              status: r.status || 'ACTIVE',
            },
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`Recommendation insert failed (${r.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'Recommendation', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 17: Recommendation Feedback ---
  private async migrateRecommendationFeedback(): Promise<TableMigrationResult> {
    const file = 'recommendation_feedback.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const fb of records) {
      if (!fb.id || !fb.recommendationId) {
        invalid++;
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).recommendationFeedback.upsert({
            where: { id: fb.id },
            create: {
              id: fb.id,
              recommendationId: fb.recommendationId,
              workspaceId: fb.workspaceId || 'ws_default',
              userId: fb.userId || 'usr_owner',
              action: fb.action || 'APPLIED',
              comment: fb.comment || null,
              createdAt: fb.createdAt ? new Date(fb.createdAt) : new Date(),
            },
            update: {},
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`RecommendationFeedback insert failed (${fb.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'RecommendationFeedback', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 18: AI Usage ---
  private async migrateAIUsage(): Promise<TableMigrationResult> {
    const file = 'ai_usage.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const u of records) {
      if (!u.id || !u.provider || !u.model) {
        invalid++;
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).aIUsageRecord.upsert({
            where: { id: u.id },
            create: {
              id: u.id,
              workspaceId: u.workspaceId || 'ws_default',
              workflowId: u.workflowId || null,
              nodeId: u.nodeId || null,
              provider: u.provider,
              model: u.model,
              inputTokens: Number(u.inputTokens || 0),
              outputTokens: Number(u.outputTokens || 0),
              costUsd: Number(u.costUsd || 0),
              timestamp: u.timestamp ? new Date(u.timestamp) : new Date(),
            },
            update: {},
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`AIUsageRecord insert failed (${u.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'AIUsageRecord', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 19: AI Conversations ---
  private async migrateAIConversations(): Promise<TableMigrationResult> {
    const file = 'ai_conversations.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const conv of records) {
      if (!conv.id) {
        invalid++;
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).aIConversation.upsert({
            where: { id: conv.id },
            create: {
              id: conv.id,
              workspaceId: conv.workspaceId || 'ws_default',
              workflowId: conv.workflowId || null,
              title: conv.title || 'Conversation',
              createdAt: conv.createdAt ? new Date(conv.createdAt) : new Date(),
              updatedAt: conv.updatedAt ? new Date(conv.updatedAt) : new Date(),
              messages: {
                create: (conv.messages || []).map((m: any, idx: number) => ({
                  id: `${conv.id}_msg_${idx}`,
                  role: m.role || 'user',
                  content: m.content || '',
                  tokens: m.tokens || null,
                  model: m.model || null,
                  createdAt: m.timestamp ? new Date(m.timestamp) : new Date(),
                })),
              },
            },
            update: {},
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`AIConversation insert failed (${conv.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'AIConversation', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }

  // --- Step 20: Audit Logs ---
  private async migrateAuditLogs(): Promise<TableMigrationResult> {
    const file = 'audit_logs.json';
    const checksum = this.computeFileChecksum(path.join(this.dataDir, file));
    const records = this.readJson<any>(file);
    let migrated = 0;
    let skipped = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const log of records) {
      if (!log.id || !log.action) {
        invalid++;
        continue;
      }

      if (!this.dryRun) {
        try {
          await (this.client as any).auditLog.upsert({
            where: { id: log.id },
            create: {
              id: log.id,
              workspaceId: log.workspaceId || 'ws_default',
              userId: log.userId || null,
              action: log.action,
              resourceType: log.resourceType || 'system',
              resourceId: log.resourceId || null,
              details: log.details || null,
              ipAddress: log.ipAddress || null,
              userAgent: log.userAgent || null,
              timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
            },
            update: {},
          });
          migrated++;
        } catch (e: any) {
          invalid++;
          errors.push(`AuditLog insert failed (${log.id}): ${e.message}`);
        }
      } else {
        migrated++;
      }
    }

    return { tableName: 'AuditLog', sourceCount: records.length, migratedCount: migrated, skippedDuplicates: skipped, invalidCount: invalid, errors, sourceChecksum: checksum };
  }
}

// CLI runner if executed directly
if (process.argv[1] && process.argv[1].endsWith('migrate-json-to-pg.ts')) {
  const migrator = new JsonToPgMigrator({
    dryRun: process.argv.includes('--dry-run'),
    verbose: process.argv.includes('--verbose'),
  });

  console.log('🚀 Starting FlowPilot JSON to PostgreSQL migration...');
  migrator
    .migrate()
    .then((summary) => {
      console.log('\n📊 Migration Summary:');
      console.log(`- Success: ${summary.success ? '✅ YES' : '❌ NO'}`);
      console.log(`- Duration: ${summary.durationMs}ms`);
      console.log(`- Total Source Records: ${summary.totalSourceRecords}`);
      console.log(`- Total Migrated Records: ${summary.totalMigratedRecords}`);
      console.log(`- Skipped Duplicates: ${summary.totalSkippedDuplicates}`);
      console.log(`- Invalid Records: ${summary.totalInvalidRecords}`);
      if (summary.backupPath) console.log(`- Backup Snapshot: ${summary.backupPath}`);

      console.log('\nTable Breakdown:');
      for (const [table, res] of Object.entries(summary.results)) {
        console.log(`  ${table.padEnd(25)} Source: ${String(res.sourceCount).padEnd(5)} Migrated: ${String(res.migratedCount).padEnd(5)} Invalid: ${res.invalidCount}`);
      }
    })
    .catch((err) => {
      console.error('Fatal migration error:', err);
      process.exit(1);
    });
}
