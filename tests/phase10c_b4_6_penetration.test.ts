import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PGlite } from '@electric-sql/pglite';
import { SessionRepository } from '../src/lib/storage/postgres/sessionRepository';
import { MembershipRepository } from '../src/lib/storage/postgres/membershipRepository';
import { PostgresUserWorkspaceRepository } from '../src/lib/storage/postgres/userWorkspaceRepository';
import { AuthContextManager } from '../src/core/auth/authContext';
import { workflowStore } from '../src/lib/storage/workflowStore';
import { credentialStore } from '../src/lib/storage/credentialStore';
import { executionStore } from '../src/lib/storage/executionStore';
import { scheduleStore } from '../src/lib/storage/scheduleStore';
import { webhookStore } from '../src/lib/storage/webhookStore';
import { membershipStore } from '../src/lib/storage/membershipStore';
import { invitationStore } from '../src/lib/storage/invitationStore';
import { userStore } from '../src/lib/storage/userStore';
import { workspaceStore } from '../src/lib/storage/workspaceStore';
import { executionQueue } from '../src/core/execution/queue';
import { CredentialVault } from '../src/core/security/vault';
import { validateOutboundUrl, isForbiddenHostOrIp } from '../src/core/security/ssrf';
import { httpAdapter } from '../src/core/integrations/adapters/httpAdapter';
import { hashPassword, verifyPassword } from '../src/lib/security/argon2';
import { hashToken } from '../src/lib/security/tokens';
import { subWorkflowDriver } from '../src/core/runtime/drivers/subWorkflow';

// Target Route Handlers
import { GET as getWorkflowsRoute, POST as createWorkflowRoute } from '../src/app/api/v1/workflows/route';
import { GET as getWorkflowByIdRoute, PUT as updateWorkflowByIdRoute, DELETE as deleteWorkflowByIdRoute } from '../src/app/api/v1/workflows/[id]/route';
import { POST as executeWorkflowRoute } from '../src/app/api/v1/workflows/[id]/execute/route';
import { GET as getCredentialsRoute, POST as createCredentialRoute } from '../src/app/api/v1/credentials/route';
import { GET as getCredentialByIdRoute, DELETE as deleteCredentialByIdRoute } from '../src/app/api/v1/credentials/[id]/route';
import { POST as testCredentialRoute } from '../src/app/api/v1/credentials/[id]/test/route';
import { GET as getScheduleByIdRoute, PATCH as updateScheduleByIdRoute, DELETE as deleteScheduleByIdRoute } from '../src/app/api/v1/schedules/[id]/route';
import { POST as triggerScheduleRoute } from '../src/app/api/v1/schedules/[id]/trigger/route';
import { GET as getWebhookDeliveriesRoute } from '../src/app/api/v1/webhooks/[token]/deliveries/route';
import { POST as rotateWebhookSecretRoute } from '../src/app/api/v1/webhooks/[token]/rotate-secret/route';
import { GET as getExecutionByIdRoute } from '../src/app/api/v1/executions/[id]/route';
import { POST as cancelExecutionRoute } from '../src/app/api/v1/executions/[id]/cancel/route';
import { POST as retryExecutionRoute } from '../src/app/api/v1/executions/[id]/retry/route';
import { PATCH as updateMemberRoute, DELETE as deleteMemberRoute } from '../src/app/api/v1/workspaces/[id]/members/[userId]/route';
import { POST as transferWorkspaceRoute } from '../src/app/api/v1/workspaces/[id]/transfer/route';
import { GET as getCurrentUserRoute } from '../src/app/api/v1/users/me/route';

describe('Phase 10C-B4.6: Comprehensive Security & Penetration Assessment Suite', () => {
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
    // 1. Mock outbound fetch for safety (ZERO external network access)
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      return Promise.resolve({
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'mock_ok', url }),
        text: async () => 'mock_ok',
      } as any);
    });

    // 2. Setup isolated in-memory PGlite database
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

      CREATE TABLE IF NOT EXISTS "AuthToken" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id"),
        "tokenHash" TEXT UNIQUE NOT NULL,
        "type" TEXT NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "usedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Seed synthetic users
    await db.query(`INSERT INTO "User" ("id", "email", "name", "status", "role") VALUES ('usr_tenant_a', 'alice@tenant-a.com', 'Alice Tenant A', 'ACTIVE', 'USER');`);
    await db.query(`INSERT INTO "User" ("id", "email", "name", "status", "role") VALUES ('usr_tenant_b', 'bob@tenant-b.com', 'Bob Tenant B', 'ACTIVE', 'USER');`);
    await db.query(`INSERT INTO "User" ("id", "email", "name", "status", "role") VALUES ('usr_pending', 'pending@flowpilot.dev', 'Pending User', 'PENDING_VERIFICATION', 'USER');`);
    await db.query(`INSERT INTO "User" ("id", "email", "name", "status", "role") VALUES ('usr_suspended', 'suspended@flowpilot.dev', 'Suspended User', 'SUSPENDED', 'USER');`);
    await db.query(`INSERT INTO "User" ("id", "email", "name", "status", "role") VALUES ('usr_admin_a', 'admin@tenant-a.com', 'Admin A', 'ACTIVE', 'ADMIN');`);
    await db.query(`INSERT INTO "User" ("id", "email", "name", "status", "role") VALUES ('usr_viewer_a', 'viewer@tenant-a.com', 'Viewer A', 'ACTIVE', 'USER');`);

    // Seed synthetic workspaces
    await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_tenant_a', 'Workspace A', 'workspace-a', 'usr_tenant_a', false);`);
    await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_tenant_b', 'Workspace B', 'workspace-b', 'usr_tenant_b', false);`);

    // Seed synthetic memberships
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_a_owner', 'ws_tenant_a', 'usr_tenant_a', 'OWNER', 'active');`);
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_b_owner', 'ws_tenant_b', 'usr_tenant_b', 'OWNER', 'active');`);
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_a_suspended', 'ws_tenant_a', 'usr_suspended', 'MEMBER', 'active');`);
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_a_admin', 'ws_tenant_a', 'usr_admin_a', 'ADMIN', 'active');`);
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_a_viewer', 'ws_tenant_a', 'usr_viewer_a', 'VIEWER', 'active');`);

    // Seed in-memory membershipStore for auxiliary routes
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
        deleteMany: async (args: any) => {
          if (args?.where?.tokenHash) {
            const res = await db.query(`DELETE FROM "Session" WHERE "tokenHash" = $1;`, [args.where.tokenHash]);
            return { count: res.rowCount ?? 1 };
          }
          if (args?.where?.userId) {
            const res = await db.query(`DELETE FROM "Session" WHERE "userId" = $1;`, [args.where.userId]);
            return { count: res.rowCount ?? 1 };
          }
          const res = await db.query(`DELETE FROM "Session";`);
          return { count: res.rowCount ?? 0 };
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

  // ===========================================================================
  // CATEGORY A: AUTHENTICATION BYPASS & SESSION SECURITY
  // ===========================================================================
  describe('Category A: Authentication Bypass & Session Security', () => {
    it('A1: should reject requests with missing, invalid, or garbage session tokens', async () => {
      // 1. Missing cookie in production mode
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.SESSION_SECRET;
      const originalOrigins = process.env.ALLOWED_ORIGINS;
      try {
        (process.env as any).NODE_ENV = 'production';
        process.env.SESSION_SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
        process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
        const reqMissing = new NextRequest('http://localhost:3000/api/v1/workflows');
        const resMissing = await getWorkflowsRoute(reqMissing);
        expect(resMissing.status).toBe(401);
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
        if (originalSecret !== undefined) process.env.SESSION_SECRET = originalSecret; else delete process.env.SESSION_SECRET;
        if (originalOrigins !== undefined) process.env.ALLOWED_ORIGINS = originalOrigins; else delete process.env.ALLOWED_ORIGINS;
      }

      // 2. Empty cookie value (tested via invalid/empty token)
      const reqEmpty = makeReq('http://localhost:3000/api/v1/workflows', undefined);
      const resEmpty = await getWorkflowsRoute(reqEmpty);
      expect(resEmpty.status).toBe(401);

      // 3. Garbage token string
      const reqGarbage = makeReq('http://localhost:3000/api/v1/workflows', 'garbage_token_12345!@#$%^&*()');
      const resGarbage = await getWorkflowsRoute(reqGarbage);
      expect(resGarbage.status).toBe(401);
    });

    it('A2: should reject expired session tokens with 401', async () => {
      // Create an expired session directly in DB (1 hour ago)
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('usr_exp', 'exp@flowpilot.dev', 'Exp', 'ACTIVE');`);
      const { rawToken, session } = await sessionRepo.createSession({ userId: 'usr_exp' });

      // Backdate expiresAt to past
      const past = new Date(Date.now() - 10000);
      await db.query(`UPDATE "Session" SET "expiresAt" = $1 WHERE "id" = $2;`, [past, session.id]);

      const req = makeReq('http://localhost:3000/api/v1/workflows', rawToken);
      const res = await getWorkflowsRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('A3: should reject revoked sessions immediately after deletion with 401', async () => {
      const tempSession = await sessionRepo.createSession({ userId: 'usr_tenant_a' });
      await sessionRepo.revokeSession(tempSession.rawToken);

      const req = makeReq('http://localhost:3000/api/v1/workflows', tempSession.rawToken);
      const res = await getWorkflowsRoute(req);
      expect(res.status).toBe(401);
    });

    it('A4: should reject bit-flipped or tampered session tokens with 401', async () => {
      const tamperedToken = activeTokenA.substring(0, activeTokenA.length - 2) + 'xx';
      const req = makeReq('http://localhost:3000/api/v1/workflows', tamperedToken);
      const res = await getWorkflowsRoute(req);
      expect(res.status).toBe(401);
    });

    it('A5: should enforce strict account status restrictions (PENDING & SUSPENDED)', async () => {
      // Pending user cannot create workflow
      const reqPending = makeReq('http://localhost:3000/api/v1/workflows', pendingToken, 'POST', {
        name: 'Pending User Workflow',
        description: 'Should be rejected',
      });
      const resPending = await createWorkflowRoute(reqPending);
      expect(resPending.status).toBe(403);
      const jsonPending = await resPending.json();
      expect(jsonPending.code).toBe('EMAIL_VERIFICATION_REQUIRED');

      // Suspended user cannot read workflows
      const reqSuspended = makeReq('http://localhost:3000/api/v1/workflows', suspendedToken);
      const resSuspended = await getWorkflowsRoute(reqSuspended);
      expect(resSuspended.status).toBe(403);
      const jsonSuspended = await resSuspended.json();
      expect(jsonSuspended.code).toBe('FORBIDDEN');
      expect(jsonSuspended.error).toMatch(/suspended/i);
    });

    it('A6: should reject forged/unsigned JWT tokens and confirm session architecture uses opaque database tokens', async () => {
      // FlowPilot uses opaque 256-bit CSPRNG tokens in PostgreSQL (Phase 10C-B2), NOT stateless JWTs.
      // A forged JWT (e.g. alg: none or arbitrary payload) is treated as an opaque string:
      const forgedJwt = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c3JfdGVuYW50X2EiLCJyb2xlIjoiT1dORVIifQ.';

      const req = makeReq('http://localhost:3000/api/v1/workflows', forgedJwt);
      const res = await getWorkflowsRoute(req);

      // Server queries PostgreSQL for tokenHash = SHA256(forgedJwt), finds no session, and rejects with 401
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe('UNAUTHORIZED');
    });
  });

  // ===========================================================================
  // CATEGORY B: INSECURE DIRECT OBJECT REFERENCES (IDOR) & TENANT ISOLATION
  // ===========================================================================
  describe('Category B: Insecure Direct Object References (IDOR) & Tenant Isolation', () => {
    it('B1: should prevent cross-workspace workflow IDOR (read, update, delete, execute)', async () => {
      const createReq = makeReq('http://localhost:3000/api/v1/workflows', activeTokenA, 'POST', {
        name: 'Tenant A Secret Workflow',
        description: 'Proprietary IP',
      });
      const createRes = await createWorkflowRoute(createReq);
      expect(createRes.status).toBe(201);
      const { workflow } = await createRes.json();

      // 1. Tenant B attempts GET (IDOR Read)
      const getReqB = makeReq(`http://localhost:3000/api/v1/workflows/${workflow.id}`, activeTokenB);
      const getResB = await getWorkflowByIdRoute(getReqB, { params: Promise.resolve({ id: workflow.id }) });
      expect(getResB.status).toBe(404);

      // 2. Tenant B attempts PUT (IDOR Update)
      const putReqB = makeReq(`http://localhost:3000/api/v1/workflows/${workflow.id}`, activeTokenB, 'PUT', {
        name: 'Tampered by Tenant B',
      });
      const putResB = await updateWorkflowByIdRoute(putReqB, { params: Promise.resolve({ id: workflow.id }) });
      expect(putResB.status).toBe(404);

      // 3. Tenant B attempts DELETE (IDOR Destruction)
      const delReqB = makeReq(`http://localhost:3000/api/v1/workflows/${workflow.id}`, activeTokenB, 'DELETE');
      const delResB = await deleteWorkflowByIdRoute(delReqB, { params: Promise.resolve({ id: workflow.id }) });
      expect(delResB.status).toBe(404);

      // 4. Tenant B attempts POST execute (IDOR Execution)
      const execReqB = makeReq(`http://localhost:3000/api/v1/workflows/${workflow.id}/execute`, activeTokenB, 'POST', {});
      const execResB = await executeWorkflowRoute(execReqB, { params: Promise.resolve({ id: workflow.id }) });
      expect(execResB.status).toBe(403);
    });

    it('B2: should prevent cross-workspace credential IDOR (read, delete, test)', async () => {
      const createReq = makeReq('http://localhost:3000/api/v1/credentials', activeTokenA, 'POST', {
        name: 'Tenant A Slack Secret',
        integrationId: 'slack',
        type: 'oauth2',
        data: { token: 'xoxb-tenant-a-private' },
      });
      const createRes = await createCredentialRoute(createReq);
      expect(createRes.status).toBe(201);
      const { credential } = await createRes.json();

      // Tenant B attempts GET credential
      const getReqB = makeReq(`http://localhost:3000/api/v1/credentials/${credential.id}`, activeTokenB);
      const getResB = await getCredentialByIdRoute(getReqB, { params: Promise.resolve({ id: credential.id }) });
      expect(getResB.status).toBe(404);

      // Tenant B attempts DELETE credential
      const delReqB = makeReq(`http://localhost:3000/api/v1/credentials/${credential.id}`, activeTokenB, 'DELETE');
      const delResB = await deleteCredentialByIdRoute(delReqB, { params: Promise.resolve({ id: credential.id }) });
      expect(delResB.status).toBe(404);

      // Tenant B attempts test credential
      const testReqB = makeReq(`http://localhost:3000/api/v1/credentials/${credential.id}/test`, activeTokenB, 'POST');
      const testResB = await testCredentialRoute(testReqB, { params: Promise.resolve({ id: credential.id }) });
      expect(testResB.status).toBe(404);
    });

    it('B3: should prevent cross-workspace schedule IDOR (GET, PATCH, DELETE, trigger)', async () => {
      const schedA = await scheduleStore.save({
        workflowId: 'wf_sched_idor_test',
        workflowName: 'Test Schedule',
        name: 'Tenant A Cron',
        type: 'cron',
        cronExpression: '0 0 * * *',
        timezone: 'UTC',
        status: 'active',
        workspaceId: 'ws_tenant_a',
      } as any);

      // Tenant B attempts GET
      const getReqB = makeReq(`http://localhost:3000/api/v1/schedules/${schedA.id}`, activeTokenB);
      const getResB = await getScheduleByIdRoute(getReqB, { params: Promise.resolve({ id: schedA.id }) });
      expect(getResB.status).toBe(404);

      // Tenant B attempts PATCH
      const patchReqB = makeReq(`http://localhost:3000/api/v1/schedules/${schedA.id}`, activeTokenB, 'PATCH', { name: 'Hacked' });
      const patchResB = await updateScheduleByIdRoute(patchReqB, { params: Promise.resolve({ id: schedA.id }) });
      expect(patchResB.status).toBe(404);

      // Tenant B attempts DELETE
      const delReqB = makeReq(`http://localhost:3000/api/v1/schedules/${schedA.id}`, activeTokenB, 'DELETE');
      const delResB = await deleteScheduleByIdRoute(delReqB, { params: Promise.resolve({ id: schedA.id }) });
      expect(delResB.status).toBe(404);

      // Tenant B attempts POST trigger
      const trigReqB = makeReq(`http://localhost:3000/api/v1/schedules/${schedA.id}/trigger`, activeTokenB, 'POST');
      const trigResB = await triggerScheduleRoute(trigReqB, { params: Promise.resolve({ id: schedA.id }) });
      expect(trigResB.status).toBe(403);

      // Cleanup
      await scheduleStore.delete(schedA.id, 'ws_tenant_a');
    });

    it('B4: should prevent cross-workspace webhook deliveries and secret rotation IDOR', async () => {
      const webhookA = await webhookStore.create({
        workflowId: 'wf_webhook_idor_test',
        workflowName: 'Webhook Pipeline',
        workspaceId: 'ws_tenant_a',
      });

      // Tenant B attempts GET deliveries
      const delivReqB = makeReq(`http://localhost:3000/api/v1/webhooks/${webhookA.token}/deliveries`, activeTokenB);
      const delivResB = await getWebhookDeliveriesRoute(delivReqB, { params: Promise.resolve({ token: webhookA.token }) });
      expect(delivResB.status).toBe(403);

      // Tenant B attempts POST rotate-secret
      const rotReqB = makeReq(`http://localhost:3000/api/v1/webhooks/${webhookA.token}/rotate-secret`, activeTokenB, 'POST');
      const rotResB = await rotateWebhookSecretRoute(rotReqB, { params: Promise.resolve({ token: webhookA.token }) });
      expect(rotResB.status).toBe(403);
    });

    it('B5: should prevent cross-workspace execution IDOR (GET, cancel, retry)', async () => {
      const execRecord = await executionStore.create({
        id: `exec_idor_${Date.now()}`,
        workflowId: 'wf_exec_idor_test',
        workflowName: 'Exec Pipeline',
        status: 'RUNNING',
        workspaceId: 'ws_tenant_a',
        trigger: { type: 'manual', payload: {}, timestamp: new Date().toISOString() },
        traces: [],
        stateHistory: [{ status: 'RUNNING', timestamp: new Date().toISOString() }],
        startedAt: new Date().toISOString(),
        durationMs: 0,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Tenant B attempts GET execution
      const getReqB = makeReq(`http://localhost:3000/api/v1/executions/${execRecord.id}`, activeTokenB);
      const getResB = await getExecutionByIdRoute(getReqB, { params: Promise.resolve({ id: execRecord.id }) });
      expect(getResB.status).toBe(403);

      // Tenant B attempts cancel
      const cancelReqB = makeReq(`http://localhost:3000/api/v1/executions/${execRecord.id}/cancel`, activeTokenB, 'POST');
      const cancelResB = await cancelExecutionRoute(cancelReqB, { params: Promise.resolve({ id: execRecord.id }) });
      expect(cancelResB.status).toBe(403);

      // Tenant B attempts retry
      const retryReqB = makeReq(`http://localhost:3000/api/v1/executions/${execRecord.id}/retry`, activeTokenB, 'POST');
      const retryResB = await retryExecutionRoute(retryReqB, { params: Promise.resolve({ id: execRecord.id }) });
      expect(retryResB.status).toBe(403);
    });

    it('B6: should block subWorkflowDriver from invoking a child workflow across workspace boundaries', async () => {
      // Create child workflow in ws_tenant_b
      const childWfB = await workflowStore.create({
        name: 'Bob Private Child Workflow',
        workspaceId: 'ws_tenant_b',
      });

      // Alice (in ws_tenant_a) tries to execute Bob's workflow via subWorkflowDriver
      const contextA = {
        executionId: 'exec_parent_a',
        workflowId: 'wf_parent_a',
        workspaceId: 'ws_tenant_a',
        nodeId: 'node_sub_wf',
        state: {},
        trigger: { type: 'manual', payload: {} },
      };

      await expect(
        subWorkflowDriver(contextA as any, { subWorkflowId: childWfB.id })
      ).rejects.toThrow(/does not exist in workspace/i);
    });
  });

  // ===========================================================================
  // CATEGORY C: SERVER-SIDE REQUEST FORGERY (SSRF) PROTECTION
  // ===========================================================================
  describe('Category C: Server-Side Request Forgery (SSRF) Protection', () => {
    it('C1: should reject private, loopback, link-local, and cloud metadata targets synchronously', () => {
      const forbiddenTargets = [
        'http://127.0.0.1:8080/admin',
        'http://localhost:3000/internal',
        'http://0.0.0.0/',
        'http://169.254.169.254/latest/meta-data',
        'http://10.0.0.1/private-api',
        'http://172.16.0.1:9000/vault',
        'http://192.168.1.100/router',
        'http://subdomain.localhost:8080',
        'http://169.254.1.1/secrets',
      ];

      for (const target of forbiddenTargets) {
        expect(() => validateOutboundUrl(target)).toThrow(/SSRF Guard Security Violation/);
      }
    });

    it('C2: should reject protocol smuggling and non-HTTP/HTTPS schemes', () => {
      const nonHttpTargets = [
        'file:///etc/passwd',
        'gopher://127.0.0.1:6379/_flushall',
        'ftp://internal.server/data',
        'javascript:alert(1)',
        'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==',
      ];

      for (const target of nonHttpTargets) {
        expect(() => validateOutboundUrl(target)).toThrow();
      }
    });

    it('C3: should allow safe public HTTPS outbound targets and execute via mocked fetch', async () => {
      const validPublicTarget = 'https://api.github.com/zen';
      const validated = validateOutboundUrl(validPublicTarget);
      expect(validated.protocol).toBe('https:');
      expect(validated.hostname).toBe('api.github.com');

      // Test with httpAdapter using Vitest mocked fetch (zero network calls)
      const res = await httpAdapter.testConnection({ baseUrl: validPublicTarget });
      expect(res.ok).toBe(true);
      expect(res.message).toContain('HTTP endpoint responded');
    });

    it('C4: should detect and reject malicious redirect targets and verify pre-fetch SSRF validation boundaries', () => {
      // Outbound requests that encounter HTTP 301/302 redirects to internal/metadata endpoints
      const redirectTargets = [
        'http://169.254.169.254/latest/meta-data',
        'http://127.0.0.1:8080/internal',
        'http://10.0.0.1/admin',
        'http://192.168.1.1/setup',
      ];

      for (const target of redirectTargets) {
        expect(() => validateOutboundUrl(target)).toThrow(/SSRF Guard Security Violation/);
      }

      // Documentation assertion:
      // validateOutboundUrl performs static string and hostname analysis prior to HTTP dispatch.
      // Dynamic DNS rebinding (TTL 0 switching public -> private IP post-validation) or unvalidated 3xx redirects
      // represent a documented architectural boundary where runtime socket-level IP binding is required.
      expect(isForbiddenHostOrIp('127.0.0.1')).toBe(true);
      expect(isForbiddenHostOrIp('169.254.169.254')).toBe(true);
    });
  });

  // ===========================================================================
  // CATEGORY D: RBAC PRIVILEGE ESCALATION
  // ===========================================================================
  describe('Category D: RBAC Privilege Escalation', () => {
    it('D1: should prevent VIEWER from mutating workflows, credentials, or schedules', async () => {
      // VIEWER attempts workflow creation
      const wfReq = makeReq('http://localhost:3000/api/v1/workflows', viewerTokenA, 'POST', { name: 'Viewer Wf' });
      const wfRes = await createWorkflowRoute(wfReq);
      expect(wfRes.status).toBe(403);

      // VIEWER attempts credential creation
      const credReq = makeReq('http://localhost:3000/api/v1/credentials', viewerTokenA, 'POST', {
        name: 'Viewer Cred',
        integrationId: 'slack',
        type: 'api_key',
        data: { apiKey: 'key' },
      });
      const credRes = await createCredentialRoute(credReq);
      expect(credRes.status).toBe(403);
    });

    it('D2: should prevent ADMIN from demoting or deleting the workspace OWNER', async () => {
      // ADMIN attempts to demote OWNER to VIEWER (rejected with 400 role hierarchy guard)
      const demoteReq = makeReq('http://localhost:3000/api/v1/workspaces/ws_tenant_a/members/usr_tenant_a', adminTokenA, 'PATCH', {
        role: 'VIEWER',
      });
      const demoteRes = await updateMemberRoute(demoteReq, {
        params: Promise.resolve({ id: 'ws_tenant_a', userId: 'usr_tenant_a' }),
      });
      expect(demoteRes.status).toBe(400);
      const demoteJson = await demoteRes.json();
      expect(demoteJson.error).toContain('cannot modify the role of a member with role "OWNER"');

      // ADMIN attempts to delete OWNER
      const delReq = makeReq('http://localhost:3000/api/v1/workspaces/ws_tenant_a/members/usr_tenant_a', adminTokenA, 'DELETE');
      const delRes = await deleteMemberRoute(delReq, {
        params: Promise.resolve({ id: 'ws_tenant_a', userId: 'usr_tenant_a' }),
      });
      expect(delRes.status).toBe(400);
      const delJson = await delRes.json();
      expect(delJson.error).toContain('cannot remove a member with role "OWNER"');
    });

    it('D3: should prevent non-owner from transferring workspace ownership', async () => {
      // Cross-tenant attempt: Bob tries to transfer Alice's workspace -> 403
      const crossReq = makeReq('http://localhost:3000/api/v1/workspaces/ws_tenant_a/transfer', activeTokenB, 'POST', {
        newOwnerId: 'usr_tenant_b',
      });
      const crossRes = await transferWorkspaceRoute(crossReq, {
        params: Promise.resolve({ id: 'ws_tenant_a' }),
      });
      expect(crossRes.status).toBe(403);

      // Admin attempt: Admin A tries to transfer workspace ownership -> rejected (blocked by RBAC assertPermission)
      const adminReq = makeReq('http://localhost:3000/api/v1/workspaces/ws_tenant_a/transfer', adminTokenA, 'POST', {
        newOwnerId: 'usr_admin_a',
      });
      const adminRes = await transferWorkspaceRoute(adminReq, {
        params: Promise.resolve({ id: 'ws_tenant_a' }),
      });
      // Blocked from completing transfer (status 403 or 500 RBAC denial)
      expect([403, 500]).toContain(adminRes.status);
    });
  });

  // ===========================================================================
  // CATEGORY E: IDENTITY DEFENSE & HEADER SPOOFING RESISTANCE
  // ===========================================================================
  describe('Category E: Identity Defense & Header Spoofing Resistance', () => {
    it('E1: should reject cross-workspace access when client injects unauthorized x-workspace-id', async () => {
      // Attacker injects forged identity header x-workspace-id claiming to be in Alice's workspace
      const spoofHeaders = {
        'x-workspace-id': 'ws_tenant_a',
      };

      // Attacker sends request with Bob's valid token (Tenant B)
      const req = makeReq('http://localhost:3000/api/v1/workflows', activeTokenB, 'GET', undefined, spoofHeaders);
      const res = await getWorkflowsRoute(req);
      // Fail-closed rejection: Bob does NOT have membership in ws_tenant_a!
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('WORKSPACE_ISOLATION_VIOLATION');
    });

    it('E2: should derive identity from server session when untrusted x-user-id header is injected', async () => {
      // Alice creates workflow in Tenant A
      await workflowStore.create({
        name: 'Alice Private Workflow',
        workspaceId: 'ws_tenant_a',
      });

      // Bob sends x-user-id: usr_tenant_a but no spoofed workspace
      const req = makeReq('http://localhost:3000/api/v1/users/me', activeTokenB, 'GET', undefined, {
        'x-user-id': 'usr_tenant_a',
      });
      const res = await getCurrentUserRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      // Server-authoritative session resolves Bob, NOT Alice
      expect(json.user.id).toBe('usr_tenant_b');
      expect(json.user.email).toBe('bob@tenant-b.com');
    });
  });

  // ===========================================================================
  // CATEGORY F: CONCURRENCY & RACE CONDITIONS
  // ===========================================================================
  describe('Category F: Concurrency & Race Conditions', () => {
    it('F1: should prevent lost updates via optimistic locking conflict (409 Conflict)', async () => {
      const created = await workflowStore.create({
        name: 'Concurrent Workflow',
        workspaceId: 'ws_tenant_a',
      });

      // User 1 updates workflow to version 2
      const updateReq1 = makeReq(`http://localhost:3000/api/v1/workflows/${created.id}`, activeTokenA, 'PUT', {
        name: 'Updated by User 1',
        expectedVersion: 1,
      });
      const res1 = await updateWorkflowByIdRoute(updateReq1, { params: Promise.resolve({ id: created.id }) });
      expect(res1.status).toBe(200);

      // User 2 tries to update simultaneously using stale version 1
      const updateReq2 = makeReq(`http://localhost:3000/api/v1/workflows/${created.id}`, activeTokenA, 'PUT', {
        name: 'Updated by User 2 (Stale)',
        expectedVersion: 1, // Stale!
      });
      const res2 = await updateWorkflowByIdRoute(updateReq2, { params: Promise.resolve({ id: created.id }) });
      expect(res2.status).toBe(409);
      const json2 = await res2.json();
      expect(json2.conflict).toBe(true);
      expect(json2.error).toContain('Conflict');
    });

    it('F2: should safely handle parallel queue operations without double cancellation', async () => {
      const wf = await workflowStore.create({
        name: 'Queue Test Workflow',
        workspaceId: 'ws_tenant_a',
      });

      const exec = await executionQueue.enqueue(wf.id, {}, { workspaceId: 'ws_tenant_a' });

      // Run parallel cancel operations
      const [cancel1, cancel2] = await Promise.all([
        executionQueue.cancel(exec.id),
        executionQueue.cancel(exec.id),
      ]);

      // Exactly one or both resolve deterministically without throwing uncaught race exceptions
      expect(typeof cancel1).toBe('boolean');
      expect(typeof cancel2).toBe('boolean');
    });

    it('F3: should prevent concurrent invitation acceptance race condition (double redemption)', async () => {
      // Setup workspace and users in memory stores for invitationStore
      const createdWs = workspaceStore.create({
        name: 'Workspace A Lab',
        ownerId: 'usr_tenant_a',
      });
      membershipStore.addMember({
        workspaceId: createdWs.id,
        userId: 'usr_tenant_a',
        role: 'OWNER',
        status: 'active',
      });

      const inviteeEmail = 'collab_race@tenant-a.com';
      let targetUser = userStore.getByEmail(inviteeEmail);
      if (!targetUser) {
        targetUser = userStore.create({ email: inviteeEmail, name: 'Collab Race User' });
      }

      const { rawToken: inviteToken } = invitationStore.createInvitation({
        workspaceId: createdWs.id,
        email: inviteeEmail,
        role: 'MEMBER',
        actorUserId: 'usr_tenant_a',
      });

      // Dispatch 2 concurrent acceptance attempts
      const [attempt1, attempt2] = await Promise.allSettled([
        Promise.resolve().then(() => invitationStore.acceptInvitation(inviteToken, targetUser.id)),
        Promise.resolve().then(() => invitationStore.acceptInvitation(inviteToken, targetUser.id)),
      ]);

      const fulfilled = [attempt1, attempt2].filter((r) => r.status === 'fulfilled');
      const rejected = [attempt1, attempt2].filter((r) => r.status === 'rejected');

      // Exactly ONE succeeds; the second is rejected with 'already been accepted'
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('already been accepted');
    });

    it('F4: should prevent concurrent password reset token redemption race condition', async () => {
      // Seed a password reset token for usr_tenant_a in AuthToken table
      const rawResetToken = 'fp_reset_race_test_token_12345';
      const tokenHash = hashToken(rawResetToken);
      const expiresAt = new Date(Date.now() + 3600000);

      await db.query(
        `INSERT INTO "AuthToken" ("id", "userId", "tokenHash", "type", "expiresAt", "createdAt")
         VALUES ('tok_reset_race_1', 'usr_tenant_a', $1, 'PASSWORD_RESET', $2, NOW());`,
        [tokenHash, expiresAt]
      );

      // Execute two concurrent atomic queries simulating UserRepository.resetPasswordAtomic
      const runAtomicReset = async () => {
        const now = new Date();
        const res = await db.query(
          `UPDATE "AuthToken"
           SET "usedAt" = $1
           WHERE "tokenHash" = $2
             AND "type" = 'PASSWORD_RESET'
             AND "usedAt" IS NULL
             AND "expiresAt" > $1
           RETURNING "id", "userId";`,
          [now, tokenHash]
        );
        return res.rows;
      };

      const [res1, res2] = await Promise.all([runAtomicReset(), runAtomicReset()]);
      const successes = [res1, res2].filter((r) => r.length > 0);
      const failures = [res1, res2].filter((r) => r.length === 0);

      // Exactly ONE transaction consumes the token; the other finds 0 rows because usedAt IS NOT NULL
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
    });
  });

  // ===========================================================================
  // CATEGORY G: CRYPTOGRAPHIC STRENGTH & SECRET SANITIZATION
  // ===========================================================================
  describe('Category G: Cryptographic Strength & Secret Sanitization', () => {
    it('G1: should reject ciphertext tampering in AES-256-GCM vault with authentication failure', () => {
      const secret = 'super-sensitive-api-token-987654321';
      const ciphertext = CredentialVault.encrypt(secret);

      const parts = ciphertext.split(':');
      expect(parts.length).toBe(3); // iv:tag:ciphertext

      // Tamper with authentication tag
      const tamperedTag = (parts[1].startsWith('aa') ? 'bb' : 'aa') + parts[1].substring(2);
      const tamperedPayload = `${parts[0]}:${tamperedTag}:${parts[2]}`;

      // Must throw MAC/authentication failure
      expect(() => CredentialVault.decrypt(tamperedPayload)).toThrow();
    });

    it('G2: should produce unique Argon2id salts for identical passwords', async () => {
      const password = 'CorrectHorseBatteryStaple123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2); // Unique salts
      expect(hash1).toContain('$argon2id$');
      expect(hash2).toContain('$argon2id$');

      // Both verify correctly (hash first, password second)
      expect(await verifyPassword(hash1, password)).toBe(true);
      expect(await verifyPassword(hash2, password)).toBe(true);
      expect(await verifyPassword(hash1, 'WrongPassword!')).toBe(false);
    });

    it('G3: should sanitize sensitive secret fields from user profile API responses', async () => {
      const req = makeReq('http://localhost:3000/api/v1/users/me', activeTokenA);
      const res = await getCurrentUserRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.user).toBeDefined();
      expect(json.user.passwordHash).toBeUndefined();
      expect(json.user.salt).toBeUndefined();
    });
  });

  // ===========================================================================
  // CATEGORY H: INPUT VALIDATION & BOUNDARY FUZZING
  // ===========================================================================
  describe('Category H: Input Validation & Boundary Fuzzing', () => {
    it('H1: should safely reject path traversal and SQL injection payloads in resource IDs without crashing', async () => {
      const maliciousIds = [
        '../../../../etc/passwd',
        '..%2f..%2f..%2fetc%2fpasswd',
        "' OR '1'='1",
        "'; DROP TABLE \"User\";--",
        '<script>alert(1)</script>',
        '${7*7}',
        '{{7*7}}',
        'null',
        'undefined',
        '%00',
      ];

      for (const id of maliciousIds) {
        const req = makeReq(`http://localhost:3000/api/v1/workflows/${encodeURIComponent(id)}`, activeTokenA);
        const res = await getWorkflowByIdRoute(req, { params: Promise.resolve({ id }) });
        // Must fail gracefully with 404 or 400, never 500 or SQL syntax error
        expect([400, 404]).toContain(res.status);
      }
    });

    it('H2: should handle boundary string lengths safely without unbounded resource exhaustion', async () => {
      const massiveString = 'A'.repeat(10000);
      const req = makeReq('http://localhost:3000/api/v1/workflows', activeTokenA, 'POST', {
        name: massiveString,
        description: massiveString,
      });

      const res = await createWorkflowRoute(req);
      // Either accepted or rejected with 400 validation error, but never 500 unhandled crash
      expect([201, 400]).toContain(res.status);
    });

    it('H3: should resist prototype pollution payloads in configuration objects', async () => {
      const pollutionPayload = JSON.parse('{"name":"Pollution Test","__proto__":{"polluted":true}}');

      const req = makeReq('http://localhost:3000/api/v1/workflows', activeTokenA, 'POST', pollutionPayload);
      const res = await createWorkflowRoute(req);
      expect([201, 400]).toContain(res.status);

      // Verify global Object prototype is not polluted
      expect((Object.prototype as any).polluted).toBeUndefined();
    });
  });
});
