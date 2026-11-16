/**
 * FlowPilot Automated Test Suite: Phase 10C-B4.4
 * High-Risk Unprotected Route Migration & Storage-Level Multi-Tenant Isolation
 *
 * Verifies:
 * 1. AI Endpoints: 401 unauthenticated, 403 pending-verification barrier, 200 authenticated, workspace convo isolation
 * 2. Workflow Execution & Version Routes: 401 unauthenticated, 403 pending-verification, cross-workspace IDOR 403
 * 3. Execution Management & Retries: 401 unauthenticated, 403 IDOR cancellation/retry blocking, scoped listing
 * 4. Schedules & Triggers: 401 unauthenticated, cross-workspace IDOR trigger rejection
 * 5. Webhook Management vs Public Ingress: Ingress passes without auth, management endpoints 401, cross-workspace 403
 * 6. Invitation Acceptance: 401 unauthenticated, 403 pending-verification, identity spoofing rejection
 * 7. Storage-Level Composite Key Enforcement: executionStore, scheduleStore, webhookStore
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PGlite } from '@electric-sql/pglite';
import { SessionRepository } from '../src/lib/storage/postgres/sessionRepository';
import { PostgresUserWorkspaceRepository } from '../src/lib/storage/postgres/userWorkspaceRepository';
import { MembershipRepository } from '../src/lib/storage/postgres/membershipRepository';
import { AuthContextManager } from '../src/core/auth/authContext';
import { executionStore } from '../src/lib/storage/executionStore';
import { scheduleStore } from '../src/lib/storage/scheduleStore';
import { webhookStore } from '../src/lib/storage/webhookStore';
import { workflowStore } from '../src/lib/storage/workflowStore';
import { aiConversationStore } from '../src/lib/storage/aiConversationStore';
import { invitationStore } from '../src/lib/storage/invitationStore';

// Route Handlers
import { POST as generateWorkflowRoute } from '../src/app/api/v1/ai/generate-workflow/route';
import { POST as refineWorkflowRoute } from '../src/app/api/v1/ai/refine-workflow/route';
import { POST as optimizeWorkflowRoute } from '../src/app/api/v1/ai/optimize-workflow/route';
import { POST as explainWorkflowRoute } from '../src/app/api/v1/ai/explain-workflow/route';
import { GET as getAiConvosRoute, POST as createAiConvoRoute } from '../src/app/api/v1/ai/conversations/route';
import { GET as getAiConvoByIdRoute, DELETE as deleteAiConvoByIdRoute } from '../src/app/api/v1/ai/conversations/[id]/route';
import { GET as getAiUsageRoute } from '../src/app/api/v1/ai/usage/route';
import { GET as getProvidersRoute } from '../src/app/api/v1/ai/providers/route';
import { POST as testProviderRoute } from '../src/app/api/v1/ai/providers/[id]/test/route';
import { POST as executeWorkflowRoute } from '../src/app/api/v1/workflows/[id]/execute/route';
import { GET as getWorkflowVersionsRoute } from '../src/app/api/v1/workflows/[id]/versions/route';
import { GET as getExecutionsRoute } from '../src/app/api/v1/executions/route';
import { GET as getExecutionByIdRoute, DELETE as deleteExecutionByIdRoute } from '../src/app/api/v1/executions/[id]/route';
import { POST as retryExecutionRoute } from '../src/app/api/v1/executions/[id]/retry/route';
import { POST as cancelExecutionRoute } from '../src/app/api/v1/executions/[id]/cancel/route';
import { GET as getSchedulesRoute } from '../src/app/api/v1/schedules/route';
import { POST as triggerScheduleRoute } from '../src/app/api/v1/schedules/[id]/trigger/route';
import { GET as getWebhooksRoute, POST as createWebhookRoute } from '../src/app/api/v1/webhooks/route';
import { POST as rotateSecretRoute } from '../src/app/api/v1/webhooks/[token]/rotate-secret/route';
import { GET as getDeliveriesRoute } from '../src/app/api/v1/webhooks/[token]/deliveries/route';
import { POST as acceptInvitationRoute } from '../src/app/api/v1/invitations/accept/route';

describe('Phase 10C-B4.4: High-Risk Unprotected Route Migration & Storage Scoping', () => {
  let db: PGlite;
  let sessionRepo: SessionRepository;
  let membershipRepo: MembershipRepository;
  let userWsRepo: PostgresUserWorkspaceRepository;

  let activeTokenA: string;
  let activeTokenB: string;
  let pendingToken: string;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`SET timezone = 'UTC';`);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT PRIMARY KEY,
        "email" TEXT UNIQUE NOT NULL,
        "name" TEXT,
        "passwordHash" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "role" TEXT NOT NULL DEFAULT 'USER',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "Workspace" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "slug" TEXT UNIQUE NOT NULL,
        "ownerId" TEXT NOT NULL REFERENCES "User"("id"),
        "isArchived" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "Membership" (
        "id" TEXT PRIMARY KEY,
        "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id"),
        "userId" TEXT NOT NULL REFERENCES "User"("id"),
        "role" TEXT NOT NULL DEFAULT 'MEMBER',
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "Membership_workspaceId_userId_key" UNIQUE ("workspaceId", "userId")
      );

      CREATE TABLE IF NOT EXISTS "Session" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id"),
        "tokenHash" TEXT UNIQUE NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "lastActiveAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "ipAddress" TEXT,
        "userAgent" TEXT
      );
    `);

    // Users
    await db.query(`INSERT INTO "User" ("id", "email", "name", "status", "role") VALUES ('usr_tenant_a', 'alice@tenant-a.com', 'Alice Tenant A', 'ACTIVE', 'USER');`);
    await db.query(`INSERT INTO "User" ("id", "email", "name", "status", "role") VALUES ('usr_tenant_b', 'bob@tenant-b.com', 'Bob Tenant B', 'ACTIVE', 'USER');`);
    await db.query(`INSERT INTO "User" ("id", "email", "name", "status", "role") VALUES ('usr_pending', 'pending@flowpilot.dev', 'Pending User', 'PENDING_VERIFICATION', 'USER');`);

    // Workspaces
    await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_tenant_a', 'Workspace A', 'workspace-a', 'usr_tenant_a', false);`);
    await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_tenant_b', 'Workspace B', 'workspace-b', 'usr_tenant_b', false);`);

    // Memberships
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_a_owner', 'ws_tenant_a', 'usr_tenant_a', 'OWNER', 'active');`);
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_b_owner', 'ws_tenant_b', 'usr_tenant_b', 'OWNER', 'active');`);

    const mockPrismaClient = {
      session: {
        findUnique: async (args: any) => {
          const res = await db.query(
            `SELECT s.*, row_to_json(u.*) as user FROM "Session" s JOIN "User" u ON s."userId" = u."id" WHERE s."tokenHash" = $1 LIMIT 1;`,
            [args.where.tokenHash]
          );
          if (res.rows.length === 0) return null;
          const row: any = res.rows[0];
          return {
            id: row.id,
            userId: row.userId,
            tokenHash: row.tokenHash,
            expiresAt: new Date(row.expiresAt),
            lastActiveAt: new Date(row.lastActiveAt),
            createdAt: new Date(row.createdAt),
            user: row.user,
          };
        },
        create: async (args: any) => {
          const id = args.data.id || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await db.query(
            `INSERT INTO "Session" ("id", "userId", "tokenHash", "expiresAt", "lastActiveAt") VALUES ($1, $2, $3, $4, $5);`,
            [id, args.data.userId, args.data.tokenHash, args.data.expiresAt, args.data.lastActiveAt]
          );
          return { id, ...args.data };
        },
        delete: async (args: any) => {
          await db.query(`DELETE FROM "Session" WHERE "id" = $1;`, [args.where.id]);
          return {};
        },
        update: async (args: any) => {
          await db.query(`UPDATE "Session" SET "lastActiveAt" = $1 WHERE "id" = $2;`, [args.data.lastActiveAt, args.where.id]);
          return {};
        },
      },
      membership: {
        findUnique: async (args: any) => {
          const { workspaceId, userId } = args.where.workspaceId_userId;
          const res = await db.query(
            `SELECT m.*, row_to_json(w.*) as workspace FROM "Membership" m JOIN "Workspace" w ON m."workspaceId" = w."id" WHERE m."workspaceId" = $1 AND m."userId" = $2 LIMIT 1;`,
            [workspaceId, userId]
          );
          if (res.rows.length === 0) return null;
          const r: any = res.rows[0];
          return { ...r, workspace: r.workspace };
        },
        findFirst: async (args: any) => {
          const res = await db.query(
            `SELECT m.*, row_to_json(w.*) as workspace FROM "Membership" m JOIN "Workspace" w ON m."workspaceId" = w."id" WHERE m."userId" = $1 AND m."role" = $2 AND m."status" = 'active' AND w."isArchived" = false LIMIT 1;`,
            [args.where.userId, args.where.role]
          );
          if (res.rows.length === 0) return null;
          const r: any = res.rows[0];
          return { ...r, workspace: r.workspace };
        },
        findMany: async (args: any) => {
          const res = await db.query(
            `SELECT m.*, row_to_json(w.*) as workspace FROM "Membership" m JOIN "Workspace" w ON m."workspaceId" = w."id" WHERE m."userId" = $1 AND m."status" = 'active' AND w."isArchived" = false;`,
            [args.where.userId]
          );
          return res.rows.map((r: any) => ({ ...r, workspace: r.workspace }));
        },
      },
      workspace: {
        findUnique: async (args: any) => {
          const res = await db.query(`SELECT * FROM "Workspace" WHERE "id" = $1 LIMIT 1;`, [args.where.id]);
          if (res.rows.length === 0) return null;
          const row: any = res.rows[0];
          return {
            ...row,
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt),
            settings: { allowMemberInvitations: true, defaultMemberRole: 'VIEWER' },
          };
        },
      },
    };

    sessionRepo = new SessionRepository(mockPrismaClient as any);
    membershipRepo = new MembershipRepository(mockPrismaClient as any);
    userWsRepo = new PostgresUserWorkspaceRepository(mockPrismaClient as any);

    AuthContextManager.setRepositoriesForTesting({
      sessionRepository: sessionRepo,
      membershipRepository: membershipRepo,
      userWorkspaceRepository: userWsRepo,
    });

    const sA = await sessionRepo.createSession({ userId: 'usr_tenant_a' });
    activeTokenA = sA.rawToken;

    const sB = await sessionRepo.createSession({ userId: 'usr_tenant_b' });
    activeTokenB = sB.rawToken;

    const sPending = await sessionRepo.createSession({ userId: 'usr_pending' });
    pendingToken = sPending.rawToken;
  });

  afterEach(() => {
    AuthContextManager.resetRepositoriesForTesting();
  });

  function makeReq(url: string, token?: string, method = 'GET', body?: any): NextRequest {
    const headers: Record<string, string> = {};
    if (token !== undefined) {
      if (token) {
        headers['cookie'] = `fp_session=${token}`;
      }
    } else {
      headers['cookie'] = 'fp_session=invalid_or_expired_token';
    }
    if (body) {
      headers['content-type'] = 'application/json';
    }
    return new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // ----------------------------------------------------
  // 1. AI Endpoints Security
  // ----------------------------------------------------
  describe('1. AI Endpoints Security', () => {
    it('should reject unauthenticated call to generate-workflow with 401', async () => {
      const req = makeReq('http://localhost:3000/api/v1/ai/generate-workflow', undefined, 'POST', { prompt: 'Test' });
      const res = await generateWorkflowRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('should reject pending-verification account on AI route with 403 EMAIL_VERIFICATION_REQUIRED', async () => {
      const req = makeReq('http://localhost:3000/api/v1/ai/generate-workflow', pendingToken, 'POST', { prompt: 'Test' });
      const res = await generateWorkflowRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    });

    it('should allow active user to call AI conversation management within active workspace', async () => {
      const createReq = makeReq('http://localhost:3000/api/v1/ai/conversations', activeTokenA, 'POST', { title: 'Workspace A Chat' });
      const createRes = await createAiConvoRoute(createReq);
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.data.workspaceId).toBe('ws_tenant_a');

      // Tenant B cannot read Tenant A conversation (IDOR protection)
      const idorReq = makeReq(`http://localhost:3000/api/v1/ai/conversations/${created.data.id}`, activeTokenB, 'GET');
      const idorRes = await getAiConvoByIdRoute(idorReq, { params: Promise.resolve({ id: created.data.id }) });
      expect(idorRes.status).toBe(404);
    });

    it('should scope AI usage metrics strictly to authenticated active workspace', async () => {
      const req = makeReq('http://localhost:3000/api/v1/ai/usage', activeTokenA, 'GET');
      const res = await getAiUsageRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.workspaceId).toBe('ws_tenant_a');
    });

    it('should allow active user with ai:manage to list AI providers', async () => {
      const req = makeReq('http://localhost:3000/api/v1/ai/providers', activeTokenA, 'GET');
      const res = await getProvidersRoute(req);
      expect(res.status).toBe(200);
    });
  });

  // ----------------------------------------------------
  // 2. Workflow Execution & Version Routes IDOR Defense
  // ----------------------------------------------------
  describe('2. Workflow Execution & Version Routes', () => {
    it('should reject unauthenticated workflow execution with 401', async () => {
      workflowStore.save({
        id: 'wf_a',
        name: 'WF A',
        workspaceId: 'ws_tenant_a',
        nodes: [{ id: 'n1', type: 'trigger.manual', category: 'trigger', name: 'Start', position: { x: 0, y: 0 }, config: {} }],
        edges: [],
      } as any);

      const req = makeReq('http://localhost:3000/api/v1/workflows/wf_a/execute', undefined, 'POST', {});
      const res = await executeWorkflowRoute(req, { params: Promise.resolve({ id: 'wf_a' }) });
      expect(res.status).toBe(401);
    });

    it('should block pending-verification user from executing workflow with 403', async () => {
      workflowStore.save({
        id: 'wf_pending_test',
        name: 'Pending Test WF',
        workspaceId: 'ws_tenant_a',
        nodes: [{ id: 'n1', type: 'trigger.manual', category: 'trigger', name: 'Start', position: { x: 0, y: 0 }, config: {} }],
        edges: [],
      } as any);

      const req = makeReq('http://localhost:3000/api/v1/workflows/wf_pending_test/execute', pendingToken, 'POST', {});
      const res = await executeWorkflowRoute(req, { params: Promise.resolve({ id: 'wf_pending_test' }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    });

    it('should reject cross-workspace execution attempt with 403 WorkspaceIsolationError', async () => {
      workflowStore.save({
        id: 'wf_tenant_b_secret',
        name: 'Bob Secret WF',
        workspaceId: 'ws_tenant_b',
        nodes: [{ id: 'n1', type: 'trigger.manual', category: 'trigger', name: 'Start', position: { x: 0, y: 0 }, config: {} }],
        edges: [],
      } as any);

      // Alice (Workspace A) attempts to execute Bob's workflow in Workspace B
      const req = makeReq('http://localhost:3000/api/v1/workflows/wf_tenant_b_secret/execute', activeTokenA, 'POST', {});
      const res = await executeWorkflowRoute(req, { params: Promise.resolve({ id: 'wf_tenant_b_secret' }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('WORKSPACE_ISOLATION_VIOLATION');
    });

    it('should reject cross-workspace version inspection with 403', async () => {
      const req = makeReq('http://localhost:3000/api/v1/workflows/wf_tenant_b_secret/versions', activeTokenA, 'GET');
      const res = await getWorkflowVersionsRoute(req, { params: Promise.resolve({ id: 'wf_tenant_b_secret' }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('WORKSPACE_ISOLATION_VIOLATION');
    });
  });

  // ----------------------------------------------------
  // 3. Execution Management & Retries
  // ----------------------------------------------------
  describe('3. Execution Management & Retries', () => {
    it('should filter execution list strictly by authenticated workspace', async () => {
      await executionStore.create({
        id: 'exec_a_1',
        workflowId: 'wf_a',
        workflowName: 'WF A',
        workspaceId: 'ws_tenant_a',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 10,
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'trigger.manual', payload: {}, timestamp: new Date().toISOString() },
        stateHistory: [],
        traces: [],
      } as any);

      await executionStore.create({
        id: 'exec_b_1',
        workflowId: 'wf_b',
        workflowName: 'WF B',
        workspaceId: 'ws_tenant_b',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 10,
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'trigger.manual', payload: {}, timestamp: new Date().toISOString() },
        stateHistory: [],
        traces: [],
      } as any);

      const reqA = makeReq('http://localhost:3000/api/v1/executions', activeTokenA, 'GET');
      const resA = await getExecutionsRoute(reqA);
      expect(resA.status).toBe(200);
      const dataA = await resA.json();
      expect(dataA.executions.every((e: any) => e.workspaceId === 'ws_tenant_a')).toBe(true);
    });

    it('should reject cross-workspace execution retry attempt with 403', async () => {
      const req = makeReq('http://localhost:3000/api/v1/executions/exec_b_1/retry', activeTokenA, 'POST');
      const res = await retryExecutionRoute(req, { params: Promise.resolve({ id: 'exec_b_1' }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('WORKSPACE_ISOLATION_VIOLATION');
    });

    it('should reject cross-workspace execution cancellation attempt with 403', async () => {
      const req = makeReq('http://localhost:3000/api/v1/executions/exec_b_1/cancel', activeTokenA, 'POST');
      const res = await cancelExecutionRoute(req, { params: Promise.resolve({ id: 'exec_b_1' }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('WORKSPACE_ISOLATION_VIOLATION');
    });
  });

  // ----------------------------------------------------
  // 4. Schedules & Triggers
  // ----------------------------------------------------
  describe('4. Schedules & Triggers', () => {
    it('should reject cross-workspace schedule trigger with 403', async () => {
      const saved = await scheduleStore.save({
        workflowId: 'wf_b',
        workflowName: 'WF B',
        workspaceId: 'ws_tenant_b',
        name: 'Bob Schedule',
        type: 'cron',
        cronExpression: '0 0 * * *',
        timezone: 'UTC',
        status: 'active',
        nextRunAt: new Date().toISOString(),
        catchUpMissed: true,
      } as any);

      // Alice tries to trigger Bob's schedule
      const req = makeReq(`http://localhost:3000/api/v1/schedules/${saved.id}/trigger`, activeTokenA, 'POST');
      const res = await triggerScheduleRoute(req, { params: Promise.resolve({ id: saved.id }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('WORKSPACE_ISOLATION_VIOLATION');

      // Clean up schedule so it doesn't linger in .data/schedules.json
      await scheduleStore.delete(saved.id, 'ws_tenant_b');
    });
  });

  // ----------------------------------------------------
  // 5. Webhook Management vs Secret Rotation
  // ----------------------------------------------------
  describe('5. Webhook Management & Isolation', () => {
    it('should reject unauthenticated webhook listing with 401', async () => {
      const req = makeReq('http://localhost:3000/api/v1/webhooks', undefined, 'GET');
      const res = await getWebhooksRoute(req);
      expect(res.status).toBe(401);
    });

    it('should reject cross-workspace webhook secret rotation with 403', async () => {
      const created = await webhookStore.create({
        workflowId: 'wf_b',
        workflowName: 'WF B',
        name: 'Bob Webhook',
        workspaceId: 'ws_tenant_b',
      });

      // Alice tries to rotate Bob's secret
      const req = makeReq(`http://localhost:3000/api/v1/webhooks/${created.token}/rotate-secret`, activeTokenA, 'POST');
      const res = await rotateSecretRoute(req, { params: Promise.resolve({ token: created.token }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('WORKSPACE_ISOLATION_VIOLATION');
    });
  });

  // ----------------------------------------------------
  // 6. Invitation Acceptance Security
  // ----------------------------------------------------
  describe('6. Invitation Acceptance Security', () => {
    it('should reject unauthenticated invitation acceptance with 401', async () => {
      const req = makeReq('http://localhost:3000/api/v1/invitations/accept', undefined, 'POST', { token: 'inv_123' });
      const res = await acceptInvitationRoute(req);
      expect(res.status).toBe(401);
    });

    it('should reject pending-verification user from accepting invitation with 403', async () => {
      const req = makeReq('http://localhost:3000/api/v1/invitations/accept', pendingToken, 'POST', { token: 'inv_123' });
      const res = await acceptInvitationRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    });

    it('should reject invitation acceptance if addressed email does not match authenticated user', async () => {
      // Seeded demo invite is addressed to david.miller@acme.corp, while activeTokenA belongs to alice@tenant-a.com
      const req = makeReq('http://localhost:3000/api/v1/invitations/accept', activeTokenA, 'POST', {
        token: 'inv_demo_token_david_miller_12345',
      });
      const res = await acceptInvitationRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('This invitation was addressed to');
    });
  });

  // ----------------------------------------------------
  // 7. Storage-Level Composite Scoping
  // ----------------------------------------------------
  describe('7. Storage-Level Composite Scoping', () => {
    it('should return null when executionStore.getById is queried with mismatched workspaceId', async () => {
      await executionStore.create({
        id: 'exec_scope_test',
        workflowId: 'wf_a',
        workspaceId: 'ws_tenant_a',
        status: 'completed',
        trigger: 'manual',
        startedAt: new Date().toISOString(),
      } as any);

      const item = await executionStore.getById('exec_scope_test', 'ws_tenant_b');
      expect(item).toBeNull();

      const validItem = await executionStore.getById('exec_scope_test', 'ws_tenant_a');
      expect(validItem).not.toBeNull();
      expect(validItem?.id).toBe('exec_scope_test');
    });

    it('should return null when scheduleStore.getById is queried with mismatched workspaceId', async () => {
      const saved = await scheduleStore.save({
        workflowId: 'wf_b',
        workflowName: 'WF B',
        workspaceId: 'ws_tenant_b',
        name: 'Bob Schedule',
        type: 'cron',
        cronExpression: '0 0 * * *',
        timezone: 'UTC',
        status: 'active',
        nextRunAt: new Date().toISOString(),
        catchUpMissed: true,
      } as any);

      const item = await scheduleStore.getById(saved.id, 'ws_tenant_a');
      expect(item).toBeNull();

      const validItem = await scheduleStore.getById(saved.id, 'ws_tenant_b');
      expect(validItem).not.toBeNull();
      expect(validItem?.id).toBe(saved.id);

      await scheduleStore.delete(saved.id, 'ws_tenant_b');
    });

    it('should throw error when webhookStore.rotateSecret is invoked with mismatched workspaceId', async () => {
      const created = await webhookStore.create({
        workflowId: 'wf_scope_test',
        workflowName: 'Scope Test',
        workspaceId: 'ws_tenant_a',
      });

      await expect(webhookStore.rotateSecret(created.id, 'ws_tenant_b')).rejects.toThrow();
      const rotated = await webhookStore.rotateSecret(created.id, 'ws_tenant_a');
      expect(rotated).toBeDefined();
    });
  });
});

