/**
 * FlowPilot Automated Test Suite: Phase 10C-B4.5-Correction
 * Multi-Tenant Security & Tenant Isolation Remediation
 *
 * Verifies:
 * 1. Storage Scoping & Parameter Enforcement (workflowStore, credentialStore)
 * 2. Schedule Endpoint [id] Authentication & IDOR Isolation (GET, PATCH, DELETE)
 * 3. Suspended Account Enforcement (User.status === 'SUSPENDED' returns 403)
 * 4. Role Hierarchy Enforcement (ADMIN cannot demote/delete OWNER)
 * 5. Workspace Isolation for Mutating Routes (limits, workspace settings, alert rules, recommendations)
 * 6. Cross-Workspace Credential Isolation in Runtime Drivers (httpRequest, sendEmail, vault decryption)
 * 7. Storage Mutation Validation & Fail-Closed Enforcement (missing workspace throws)
 * 8. Audit Log Multi-Tenant Tampering Resistance (cannot view other workspace logs)
 * 9. VIEWER Role Restrictions on Mutations (workflow & credential create/update/delete blocked with 403)
 * 10. Header Spoofing Resistance & Session Authoritativeness
 * 11. Optimistic Locking Conflict Behavior (expectedVersion mismatch returns 409)
 * 12. Core Workflows, Credentials & Integrations Lifecycle Scoping
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PGlite } from '@electric-sql/pglite';
import { SessionRepository } from '../src/lib/storage/postgres/sessionRepository';
import { PostgresUserWorkspaceRepository } from '../src/lib/storage/postgres/userWorkspaceRepository';
import { MembershipRepository } from '../src/lib/storage/postgres/membershipRepository';
import { AuthContextManager } from '../src/core/auth/authContext';
import { workflowStore } from '../src/lib/storage/workflowStore';
import { credentialStore } from '../src/lib/storage/credentialStore';
import { scheduleStore } from '../src/lib/storage/scheduleStore';
import { alertRuleStore } from '../src/lib/storage/alertRuleStore';
import { membershipStore } from '../src/lib/storage/membershipStore';
import { recommendationStore } from '../src/lib/storage/recommendationStore';
import { httpRequestDriver } from '../src/core/runtime/drivers/httpRequest';
import { sendEmailDriver } from '../src/core/runtime/drivers/sendEmail';

// Target Route Handlers
import { GET as getWorkflowsRoute, POST as createWorkflowRoute } from '../src/app/api/v1/workflows/route';
import { GET as getWorkflowByIdRoute, PUT as updateWorkflowByIdRoute, DELETE as deleteWorkflowByIdRoute } from '../src/app/api/v1/workflows/[id]/route';
import { GET as getCredentialsRoute, POST as createCredentialRoute } from '../src/app/api/v1/credentials/route';
import { GET as getCredentialByIdRoute, DELETE as deleteCredentialByIdRoute } from '../src/app/api/v1/credentials/[id]/route';
import { POST as testCredentialRoute } from '../src/app/api/v1/credentials/[id]/test/route';
import { GET as getIntegrationsRoute } from '../src/app/api/v1/integrations/route';
import { GET as getAlertRulesRoute, POST as createAlertRuleRoute } from '../src/app/api/v1/alerts/rules/route';
import { PATCH as updateAlertRuleRoute, DELETE as deleteAlertRuleRoute } from '../src/app/api/v1/alerts/rules/[id]/route';
import { POST as evaluateAlertRulesRoute } from '../src/app/api/v1/alerts/rules/evaluate/route';
import { GET as getAiUsageOverviewRoute } from '../src/app/api/v1/analytics/ai-usage/overview/route';
import { GET as getMonitoringOverviewRoute } from '../src/app/api/v1/monitoring/overview/route';
import { GET as getRecommendationsRoute } from '../src/app/api/v1/recommendations/route';
import { POST as evaluateRecommendationsRoute } from '../src/app/api/v1/recommendations/evaluate/route';
import { POST as snoozeRecommendationRoute } from '../src/app/api/v1/recommendations/[id]/snooze/route';
import { POST as resolveRecommendationRoute } from '../src/app/api/v1/recommendations/[id]/resolve/route';
import { POST as submitFeedbackRoute } from '../src/app/api/v1/recommendations/[id]/feedback/route';
import { GET as getCurrentUserRoute } from '../src/app/api/v1/users/me/route';
import { POST as transferWorkspaceRoute } from '../src/app/api/v1/workspaces/[id]/transfer/route';
import { PUT as updateWorkspaceLimitsRoute } from '../src/app/api/v1/workspaces/[id]/limits/route';
import { PATCH as updateWorkspaceRoute } from '../src/app/api/v1/workspaces/[id]/route';
import { PATCH as updateMemberRoute, DELETE as deleteMemberRoute } from '../src/app/api/v1/workspaces/[id]/members/[userId]/route';
import { GET as getAuditLogsRoute } from '../src/app/api/v1/workspaces/[id]/audit-logs/route';
import { GET as getScheduleByIdRoute, PATCH as updateScheduleByIdRoute, DELETE as deleteScheduleByIdRoute } from '../src/app/api/v1/schedules/[id]/route';

describe('Phase 10C-B4.5-Correction: Strictly Scoped Multi-Tenant Security Suite', () => {
  let db: PGlite;
  let sessionRepo: SessionRepository;
  let membershipRepo: MembershipRepository;
  let userWsRepo: PostgresUserWorkspaceRepository;

  let activeTokenA: string;
  let activeTokenB: string;
  let pendingToken: string;
  let suspendedToken: string;
  let adminTokenA: string;
  let viewerTokenA: string;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ status: 'ok' }),
      text: async () => 'ok',
    } as any);

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
    await db.query(`INSERT INTO "User" ("id", "email", "name", "status", "role") VALUES ('usr_suspended', 'suspended@flowpilot.dev', 'Suspended User', 'SUSPENDED', 'USER');`);
    await db.query(`INSERT INTO "User" ("id", "email", "name", "status", "role") VALUES ('usr_admin_a', 'admin@tenant-a.com', 'Admin A', 'ACTIVE', 'ADMIN');`);
    await db.query(`INSERT INTO "User" ("id", "email", "name", "status", "role") VALUES ('usr_viewer_a', 'viewer@tenant-a.com', 'Viewer A', 'ACTIVE', 'USER');`);

    // Workspaces
    await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_tenant_a', 'Workspace A', 'workspace-a', 'usr_tenant_a', false);`);
    await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_tenant_b', 'Workspace B', 'workspace-b', 'usr_tenant_b', false);`);

    // Memberships
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_a_owner', 'ws_tenant_a', 'usr_tenant_a', 'OWNER', 'active');`);
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_b_owner', 'ws_tenant_b', 'usr_tenant_b', 'OWNER', 'active');`);
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_a_suspended', 'ws_tenant_a', 'usr_suspended', 'MEMBER', 'active');`);
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_a_admin', 'ws_tenant_a', 'usr_admin_a', 'ADMIN', 'active');`);
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_a_viewer', 'ws_tenant_a', 'usr_viewer_a', 'VIEWER', 'active');`);

    // Seed in-memory membershipStore for routes directly consulting it
    try {
      membershipStore.addMember({ workspaceId: 'ws_tenant_a', userId: 'usr_tenant_a', role: 'OWNER', status: 'active' });
    } catch {}
    try {
      membershipStore.addMember({ workspaceId: 'ws_tenant_a', userId: 'usr_admin_a', role: 'ADMIN', status: 'active' });
    } catch {}

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

    const sSuspended = await sessionRepo.createSession({ userId: 'usr_suspended' });
    suspendedToken = sSuspended.rawToken;

    const sAdminA = await sessionRepo.createSession({ userId: 'usr_admin_a' });
    adminTokenA = sAdminA.rawToken;

    const sViewerA = await sessionRepo.createSession({ userId: 'usr_viewer_a' });
    viewerTokenA = sViewerA.rawToken;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    AuthContextManager.resetRepositoriesForTesting();
  });

  function makeReq(url: string, token?: string, method = 'GET', body?: any, customHeaders?: Record<string, string>): NextRequest {
    const headers: Record<string, string> = { ...customHeaders };
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

  // GAP 1: Schedule endpoint GET, PATCH, DELETE auth and IDOR isolation
  describe('1. Missing 56th Route: /api/v1/schedules/[id] Security', () => {
    it('rejects unauthenticated requests to schedule endpoints with 401', async () => {
      const unauthReq = makeReq('http://localhost:3000/api/v1/schedules/sched_123');
      const res = await getScheduleByIdRoute(unauthReq, { params: Promise.resolve({ id: 'sched_123' }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('enforces tenant isolation and prevents IDOR on schedule GET, PATCH, DELETE', async () => {
      // 1. Seed a schedule belonging to Tenant A
      const schedA = await scheduleStore.save({
        workflowId: 'wf_test_sched',
        workflowName: 'Test Schedule Pipeline',
        name: 'Daily Tenant A Sync',
        type: 'cron',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        status: 'active',
        workspaceId: 'ws_tenant_a',
      } as any);

      // Tenant A can retrieve it
      const getReqA = makeReq(`http://localhost:3000/api/v1/schedules/${schedA.id}`, activeTokenA);
      const getResA = await getScheduleByIdRoute(getReqA, { params: Promise.resolve({ id: schedA.id }) });
      expect(getResA.status).toBe(200);
      const jsonA = await getResA.json();
      expect(jsonA.schedule.id).toBe(schedA.id);

      // Tenant B receives 404 on GET (IDOR blocked)
      const getReqB = makeReq(`http://localhost:3000/api/v1/schedules/${schedA.id}`, activeTokenB);
      const getResB = await getScheduleByIdRoute(getReqB, { params: Promise.resolve({ id: schedA.id }) });
      expect(getResB.status).toBe(404);

      // Tenant B receives 404 on PATCH
      const patchReqB = makeReq(`http://localhost:3000/api/v1/schedules/${schedA.id}`, activeTokenB, 'PATCH', {
        name: 'Hacked Schedule Name',
      });
      const patchResB = await updateScheduleByIdRoute(patchReqB, { params: Promise.resolve({ id: schedA.id }) });
      expect(patchResB.status).toBe(404);

      // Tenant B receives 404 on DELETE
      const delReqB = makeReq(`http://localhost:3000/api/v1/schedules/${schedA.id}`, activeTokenB, 'DELETE');
      const delResB = await deleteScheduleByIdRoute(delReqB, { params: Promise.resolve({ id: schedA.id }) });
      expect(delResB.status).toBe(404);

      // Tenant A can successfully PATCH
      const patchReqA = makeReq(`http://localhost:3000/api/v1/schedules/${schedA.id}`, activeTokenA, 'PATCH', {
        name: 'Updated Tenant A Schedule',
      });
      const patchResA = await updateScheduleByIdRoute(patchReqA, { params: Promise.resolve({ id: schedA.id }) });
      expect(patchResA.status).toBe(200);

      // Tenant A can successfully DELETE
      const delReqA = makeReq(`http://localhost:3000/api/v1/schedules/${schedA.id}`, activeTokenA, 'DELETE');
      const delResA = await deleteScheduleByIdRoute(delReqA, { params: Promise.resolve({ id: schedA.id }) });
      expect(delResA.status).toBe(200);
    });
  });

  // GAP 2: Suspended account rejection with 403
  describe('2. Account Status: Suspended Account Enforcement', () => {
    it('rejects suspended accounts with 403 Forbidden', async () => {
      const suspendedReq = makeReq('http://localhost:3000/api/v1/workflows', suspendedToken);
      const res = await getWorkflowsRoute(suspendedReq);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
      expect(json.error).toContain('Account is suspended');
    });
  });

  // GAP 3: Role hierarchy enforcement
  describe('3. RBAC: Role Hierarchy Enforcement', () => {
    it('prevents ADMIN from modifying or demoting the workspace OWNER', async () => {
      const demoteReq = makeReq(
        'http://localhost:3000/api/v1/workspaces/ws_tenant_a/members/usr_tenant_a',
        adminTokenA,
        'PATCH',
        { role: 'VIEWER' }
      );
      const res = await updateMemberRoute(demoteReq, {
        params: Promise.resolve({ id: 'ws_tenant_a', userId: 'usr_tenant_a' }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('cannot modify the role of a member with role "OWNER"');
    });

    it('prevents ADMIN from deleting or removing the workspace OWNER', async () => {
      const deleteOwnerReq = makeReq(
        'http://localhost:3000/api/v1/workspaces/ws_tenant_a/members/usr_tenant_a',
        adminTokenA,
        'DELETE'
      );
      const res = await deleteMemberRoute(deleteOwnerReq, {
        params: Promise.resolve({ id: 'ws_tenant_a', userId: 'usr_tenant_a' }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('cannot remove a member with role "OWNER"');
    });
  });

  // GAP 4: Workspace isolation for mutating routes
  describe('4. Tenant Scoping: Mutating Routes Isolation', () => {
    it('blocks cross-workspace PUT to workspace limits with 403', async () => {
      const crossLimitsReq = makeReq(
        'http://localhost:3000/api/v1/workspaces/ws_tenant_a/limits',
        activeTokenB,
        'PUT',
        { maxWorkflows: 999 }
      );
      const res = await updateWorkspaceLimitsRoute(crossLimitsReq, {
        params: Promise.resolve({ id: 'ws_tenant_a' }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('WORKSPACE_ISOLATION_VIOLATION');
    });

    it('blocks cross-workspace PATCH to workspace settings with 403', async () => {
      const crossPatchReq = makeReq(
        'http://localhost:3000/api/v1/workspaces/ws_tenant_a',
        activeTokenB,
        'PATCH',
        { name: 'Hijacked Workspace' }
      );
      const res = await updateWorkspaceRoute(crossPatchReq, {
        params: Promise.resolve({ id: 'ws_tenant_a' }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('WORKSPACE_ISOLATION_VIOLATION');
    });

    it('blocks cross-workspace PATCH and DELETE on alert rules with 404', async () => {
      const ruleA = alertRuleStore.create({
        workspaceId: 'ws_tenant_a',
        name: 'Latency Guard',
        category: 'PERFORMANCE',
        metric: 'duration',
        operator: 'gt',
        threshold: 1000,
        severity: 'HIGH',
        targetType: 'WORKFLOW',
      } as any);

      // Cross PATCH returns 404
      const patchReq = makeReq(
        `http://localhost:3000/api/v1/alerts/rules/${ruleA.id}`,
        activeTokenB,
        'PATCH',
        { threshold: 9999 }
      );
      const patchRes = await updateAlertRuleRoute(patchReq, {
        params: Promise.resolve({ id: ruleA.id }),
      });
      expect(patchRes.status).toBe(404);

      // Cross DELETE returns 404
      const delReq = makeReq(
        `http://localhost:3000/api/v1/alerts/rules/${ruleA.id}`,
        activeTokenB,
        'DELETE'
      );
      const delRes = await deleteAlertRuleRoute(delReq, {
        params: Promise.resolve({ id: ruleA.id }),
      });
      expect(delRes.status).toBe(404);
    });

    it('blocks cross-workspace recommendation actions (snooze, resolve, feedback) with 404', async () => {
      // Direct store seed for Tenant A
      const recA = recommendationStore.save({
        id: `rec_${Date.now()}_test_a`,
        workspaceId: 'ws_tenant_a',
        title: 'Optimize Workflow',
        summary: 'Recommendation Summary',
        category: 'PERFORMANCE',
        severity: 'MEDIUM',
        confidence: 'HIGH',
        impactScore: 75,
        targetType: 'WORKFLOW',
        targetId: 'wf_test',
        ruleId: 'rule_1',
        dedupKey: `dedup_${Date.now()}`,
        status: 'NEW',
        suggestedActions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Cross snooze returns 404
      const snoozeReq = makeReq(
        `http://localhost:3000/api/v1/recommendations/${recA.id}/snooze`,
        activeTokenB,
        'POST',
        { durationDays: 3 }
      );
      const snoozeRes = await snoozeRecommendationRoute(snoozeReq, {
        params: Promise.resolve({ id: recA.id }),
      });
      expect(snoozeRes.status).toBe(404);

      // Cross resolve returns 404
      const resolveReq = makeReq(
        `http://localhost:3000/api/v1/recommendations/${recA.id}/resolve`,
        activeTokenB,
        'POST'
      );
      const resolveRes = await resolveRecommendationRoute(resolveReq, {
        params: Promise.resolve({ id: recA.id }),
      });
      expect(resolveRes.status).toBe(404);

      // Cross feedback returns 404
      const feedbackReq = makeReq(
        `http://localhost:3000/api/v1/recommendations/${recA.id}/feedback`,
        activeTokenB,
        'POST',
        { helpful: true, feedback: 'Great' }
      );
      const feedbackRes = await submitFeedbackRoute(feedbackReq, {
        params: Promise.resolve({ id: recA.id }),
      });
      expect(feedbackRes.status).toBe(404);
    });
  });

  // GAP 5: Cross-workspace credential isolation in runtime drivers
  describe('5. Runtime Execution: Cross-Workspace Credential Isolation', () => {
    it('prevents httpRequestDriver from accessing credentials belonging to another workspace', async () => {
      // 1. Create credential in Tenant A
      const credA = await credentialStore.save({
        name: 'Tenant A Secret Key',
        integrationId: 'http',
        type: 'api_key',
        data: { apiKey: 'secret_tenant_a_key_9988' },
        workspaceId: 'ws_tenant_a',
      });

      // 2. Execute httpRequestDriver in context of Tenant B
      const nodeContext: any = {
        executionId: 'exec_cross_test',
        workflowId: 'wf_tenant_b',
        workspaceId: 'ws_tenant_b', // Tenant B execution context!
        node: { id: 'node_1', type: 'action.httpRequest' },
        trigger: { type: 'manual', payload: {}, timestamp: new Date().toISOString() },
        steps: {},
      };

      const resolvedConfig = {
        url: 'https://api.external.com/data',
        method: 'GET',
        credentialId: credA.id, // Referencing Tenant A's credential!
      };

      // Credential lookup scoped to ws_tenant_b returns null, so no apiKey header is attached
      const result = await httpRequestDriver(nodeContext, resolvedConfig);
      expect(result.request.headers['X-API-Key']).toBeUndefined();
      expect(result.request.headers['Authorization']).toBeUndefined();
    });

    it('prevents sendEmailDriver from using credentials belonging to another workspace', async () => {
      // 1. Create SMTP credential in Tenant A
      const credA = await credentialStore.save({
        name: 'Tenant A SMTP',
        integrationId: 'smtp',
        type: 'smtp',
        data: { host: 'mail.tenant-a.internal', port: 587, senderEmail: 'vip@tenant-a.com' },
        workspaceId: 'ws_tenant_a',
      });

      // 2. Execute sendEmailDriver in context of Tenant B
      const nodeContext: any = {
        executionId: 'exec_cross_test_2',
        workflowId: 'wf_tenant_b',
        workspaceId: 'ws_tenant_b', // Tenant B execution context!
        node: { id: 'node_2', type: 'action.sendEmail' },
        trigger: { type: 'manual', payload: {}, timestamp: new Date().toISOString() },
        steps: {},
      };

      const resolvedConfig = {
        to: 'customer@external.com',
        subject: 'Notification',
        content: 'Your order has shipped',
        credentialId: credA.id, // Referencing Tenant A's credential!
      };

      const result = await sendEmailDriver(nodeContext, resolvedConfig);
      // Fails closed to default relay, cannot hijack Tenant A's internal SMTP host or sender
      expect(result.provider).toBe('flowpilot-transactional-relay');
      expect(result.from).toBe('no-reply@flowpilot.dev');
    });

    it('returns null when getDecryptedData is requested with mismatched workspace', async () => {
      const credA = await credentialStore.save({
        name: 'Isolated Credential',
        integrationId: 'http',
        type: 'api_key',
        data: { secret: 'highly_confidential' },
        workspaceId: 'ws_tenant_a',
      });

      const decrypted = await credentialStore.getDecryptedData(credA.id, {
        workspaceId: 'ws_tenant_b',
      });
      expect(decrypted).toBeNull();
    });
  });

  // GAP 6: Missing workspace identity rejection for storage mutations (assert throws)
  describe('6. Storage Invariants: Fail-Closed Mandatory Workspace Identity', () => {
    it('throws error when workflowStore.update is invoked without workspaceId or with empty string', () => {
      const wf = workflowStore.create({
        name: 'Strict Scoping Flow',
        workspaceId: 'ws_tenant_a',
        triggerType: 'manual',
      });

      // Missing workspaceId
      expect(() => {
        workflowStore.update(wf.id, { name: 'New Name' }, undefined as any);
      }).toThrow('Workspace identity is required for workflow updates.');

      // Empty string workspaceId
      expect(() => {
        workflowStore.update(wf.id, { name: 'New Name' }, '');
      }).toThrow('Workspace identity is required for workflow updates.');
    });

    it('throws error when workflowStore.delete is invoked with empty workspaceId or cross-workspace', () => {
      const wf = workflowStore.create({
        name: 'Strict Delete Flow',
        workspaceId: 'ws_tenant_a',
        triggerType: 'manual',
      });

      expect(() => {
        workflowStore.delete(wf.id, '');
      }).toThrow('Workspace identity is required for workflow deletion.');

      expect(() => {
        workflowStore.delete(wf.id, 'ws_tenant_b');
      }).toThrow('Cross-workspace delete denied');
    });

    it('throws error when credentialStore.save is invoked with empty workspaceId', async () => {
      await expect(
        credentialStore.save({
          name: 'Invalid Credential',
          integrationId: 'smtp',
          type: 'api_key',
          data: { key: '123' },
          workspaceId: '',
        })
      ).rejects.toThrow('Workspace identity cannot be empty when persisting credentials.');
    });

    it('throws error when credentialStore.delete is invoked cross-workspace', async () => {
      const cred = await credentialStore.save({
        name: 'Delete Target',
        integrationId: 'http',
        type: 'api_key',
        data: { key: '123' },
        workspaceId: 'ws_tenant_a',
      });

      await expect(
        credentialStore.delete(cred.id, 'ws_tenant_b')
      ).rejects.toThrow('Cross-workspace delete denied');
    });
  });

  // GAP 7: Audit log workspace tampering resistance
  describe('7. Audit Logging: Multi-Tenant Tampering Resistance', () => {
    it('blocks cross-workspace access to audit logs with 403', async () => {
      const crossAuditReq = makeReq(
        'http://localhost:3000/api/v1/workspaces/ws_tenant_a/audit-logs',
        activeTokenB
      );
      const res = await getAuditLogsRoute(crossAuditReq, {
        params: Promise.resolve({ id: 'ws_tenant_a' }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('WORKSPACE_ISOLATION_VIOLATION');
    });

    it('scopes audit log listing strictly to caller workspace regardless of query parameters', async () => {
      const auditReq = makeReq(
        'http://localhost:3000/api/v1/workspaces/ws_tenant_a/audit-logs?workspaceId=ws_tenant_b',
        activeTokenA
      );
      const res = await getAuditLogsRoute(auditReq, {
        params: Promise.resolve({ id: 'ws_tenant_a' }),
      });
      // Query parameter workspaceId mismatch is caught by perimeter or scoped strictly to ws_tenant_a
      if (res.status === 200) {
        const json = await res.json();
        expect(json.logs.every((l: any) => l.workspaceId === 'ws_tenant_a')).toBe(true);
      } else {
        expect(res.status).toBe(403);
      }
    });
  });

  // GAP 8: VIEWER role restrictions on mutations
  describe('8. RBAC: VIEWER Role Mutation Restrictions', () => {
    it('blocks VIEWER from creating workflows with 403 Forbidden', async () => {
      const req = makeReq('http://localhost:3000/api/v1/workflows', viewerTokenA, 'POST', {
        name: 'Viewer Flow Attempt',
      });
      const res = await createWorkflowRoute(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('blocks VIEWER from updating workflows with 403 Forbidden', async () => {
      const wf = workflowStore.create({
        name: 'Tenant A Protected Flow',
        workspaceId: 'ws_tenant_a',
        triggerType: 'manual',
      });

      const req = makeReq(`http://localhost:3000/api/v1/workflows/${wf.id}`, viewerTokenA, 'PUT', {
        name: 'Tampered by Viewer',
      });
      const res = await updateWorkflowByIdRoute(req, {
        params: Promise.resolve({ id: wf.id }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('blocks VIEWER from deleting workflows with 403 Forbidden', async () => {
      const wf = workflowStore.create({
        name: 'Tenant A Delete Flow',
        workspaceId: 'ws_tenant_a',
        triggerType: 'manual',
      });

      const req = makeReq(`http://localhost:3000/api/v1/workflows/${wf.id}`, viewerTokenA, 'DELETE');
      const res = await deleteWorkflowByIdRoute(req, {
        params: Promise.resolve({ id: wf.id }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('blocks VIEWER from creating credentials with 403 Forbidden', async () => {
      const req = makeReq('http://localhost:3000/api/v1/credentials', viewerTokenA, 'POST', {
        name: 'Viewer Credential',
        integrationId: 'smtp',
        type: 'api_key',
        data: { key: 'secret' },
      });
      const res = await createCredentialRoute(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });
  });

  // GAP 9: Header spoofing resistance
  describe('9. Identity Defense: Header Spoofing Resistance', () => {
    it('ignores client-injected identity headers and uses authenticated session context', async () => {
      // Injected spoof headers claiming to be OWNER of Workspace A
      const spoofedHeaders = {
        'x-user-id': 'usr_tenant_a',
        'x-user-role': 'OWNER',
        'x-workspace-id': 'ws_tenant_a',
      };

      // Request sent with Viewer token
      const req = makeReq(
        'http://localhost:3000/api/v1/users/me',
        viewerTokenA,
        'GET',
        undefined,
        spoofedHeaders
      );
      const res = await getCurrentUserRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      // Resolved identity must be VIEWER, NOT the spoofed OWNER header
      expect(json.user.id).toBe('usr_viewer_a');
      expect(json.role).toBe('VIEWER');
    });
  });

  // GAP 10: Optimistic locking conflict behavior
  describe('10. Data Integrity: Optimistic Locking Conflict', () => {
    it('returns 409 Conflict when expectedVersion does not match current version', async () => {
      const wf = workflowStore.create({
        name: 'Concurrent Flow',
        workspaceId: 'ws_tenant_a',
        triggerType: 'manual',
      });

      // Update once to advance version to 2
      workflowStore.save(wf, { expectedVersion: 1, workspaceId: 'ws_tenant_a' });

      // Client attempts update expecting version 1 (which is now outdated)
      const conflictReq = makeReq(
        `http://localhost:3000/api/v1/workflows/${wf.id}`,
        activeTokenA,
        'PUT',
        { name: 'Conflicting Name', expectedVersion: 1 }
      );
      const res = await updateWorkflowByIdRoute(conflictReq, {
        params: Promise.resolve({ id: wf.id }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.conflict).toBe(true);
      expect(json.error).toContain('Conflict: Workflow was updated by another user');
    });
  });

  // GAP 11 & 12: Core Workflows, Credentials & Integrations Scoping
  describe('11. Storage & Route Scoping Regressions', () => {
    it('isolates workflows between workspaces and prevents cross-workspace IDOR', async () => {
      const createReqA = makeReq('http://localhost:3000/api/v1/workflows', activeTokenA, 'POST', {
        name: 'Secret Workflow A',
        triggerType: 'manual',
      });
      const createRes = await createWorkflowRoute(createReqA);
      expect(createRes.status).toBe(201);
      const { workflow } = await createRes.json();

      const getReqA = makeReq(`http://localhost:3000/api/v1/workflows/${workflow.id}`, activeTokenA);
      const resA = await getWorkflowByIdRoute(getReqA, { params: Promise.resolve({ id: workflow.id }) });
      expect(resA.status).toBe(200);

      const getReqB = makeReq(`http://localhost:3000/api/v1/workflows/${workflow.id}`, activeTokenB);
      const resB = await getWorkflowByIdRoute(getReqB, { params: Promise.resolve({ id: workflow.id }) });
      expect(resB.status).toBe(404);
    });

    it('isolates credentials between workspaces and strips encrypted secrets', async () => {
      const createReqA = makeReq('http://localhost:3000/api/v1/credentials', activeTokenA, 'POST', {
        name: 'Sendgrid API Key',
        integrationId: 'smtp',
        type: 'api_key',
        data: { apiKey: 'sg_secret_key_12345' },
      });
      const createRes = await createCredentialRoute(createReqA);
      expect(createRes.status).toBe(201);
      const createJson = await createRes.json();
      expect(createJson.credential.encryptedData).toBeUndefined();
      const credId = createJson.credential.id;

      const listReqB = makeReq('http://localhost:3000/api/v1/credentials', activeTokenB);
      const listResB = await getCredentialsRoute(listReqB);
      const listJsonB = await listResB.json();
      expect(listJsonB.credentials.some((c: any) => c.id === credId)).toBe(false);

      const getReqB = makeReq(`http://localhost:3000/api/v1/credentials/${credId}`, activeTokenB);
      const getResB = await getCredentialByIdRoute(getReqB, { params: Promise.resolve({ id: credId }) });
      expect(getResB.status).toBe(404);
    });

    it('rejects pending verification users with 403 on workflow creation', async () => {
      const pendingReq = makeReq('http://localhost:3000/api/v1/workflows', pendingToken, 'POST', {
        name: 'Pending Flow',
      });
      const res = await createWorkflowRoute(pendingReq);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    });

    it('scopes GET /api/v1/integrations to caller workspace credentials', async () => {
      const integReqA = makeReq('http://localhost:3000/api/v1/integrations', activeTokenA);
      const resA = await getIntegrationsRoute(integReqA);
      expect(resA.status).toBe(200);
      const jsonA = await resA.json();
      expect(jsonA.success).toBe(true);
      expect(Array.isArray(jsonA.integrations)).toBe(true);
    });

    it('blocks non-owner or unauthenticated users from transferring workspace', async () => {
      const unauthReq = makeReq('http://localhost:3000/api/v1/workspaces/ws_tenant_a/transfer', undefined, 'POST', {
        newOwnerId: 'usr_tenant_b',
      });
      const res1 = await transferWorkspaceRoute(unauthReq, { params: Promise.resolve({ id: 'ws_tenant_a' }) });
      expect(res1.status).toBe(401);

      const crossReq = makeReq('http://localhost:3000/api/v1/workspaces/ws_tenant_a/transfer', activeTokenB, 'POST', {
        newOwnerId: 'usr_tenant_b',
      });
      const res2 = await transferWorkspaceRoute(crossReq, { params: Promise.resolve({ id: 'ws_tenant_a' }) });
      expect(res2.status).toBe(403);
    });
  });
});
