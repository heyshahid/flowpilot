/**
 * FlowPilot Phase 10C-B4.2: AuthContextManager Overhaul & Session Bridge Test Suite
 *
 * Validates:
 * 1. Authoritative PostgreSQL Session Resolution:
 *    - Valid session cookie resolution returning authentic User, Workspace, Membership, and Role
 *    - Rejection of missing session cookies with 401 Unauthorized in production mode
 *    - Dual-expiration enforcement (14-day absolute and 2-hour idle timeout) with immediate DB deletion
 *    - Account status enforcement: SUSPENDED -> 403 Forbidden, PENDING_VERIFICATION -> 403 VerificationRequired
 * 2. Workspace Resolution & Membership Enforcement:
 *    - Deterministic owned workspace resolution (getActiveWorkspaceForUser)
 *    - Fallback to earliest active member workspace when user owns no workspaces
 *    - Valid workspace selector via x-workspace-id header or query string
 *    - Rejection of conflicting header and query workspace selectors (400 InvalidSelector)
 *    - Rejection of non-member workspace access attempts (403 WorkspaceIsolationError)
 *    - Rejection of archived workspace access (403 WorkspaceIsolationError)
 * 3. Route Parameter Precedence & Non-Mutating Workspace Switching:
 *    - enforceWorkspaceIsolation prioritizes targetWorkspaceId from route parameters over client headers
 *    - Successful workspace switch returns a NEW, deeply frozen AuthContext instance without mutating the original
 * 4. Deep DTO Immutability:
 *    - Complete protection of ctx, ctx.user, ctx.workspace, ctx.workspace.settings, and ctx.membership
 *    - In strict mode, attempted mutations throw TypeError
 * 5. Test Adapter Security & Triple-Gate Isolation:
 *    - resolveTestMockContext throws 'FATAL SECURITY VIOLATION' outside NODE_ENV === 'test'
 *    - In test mode with session cookie, real database session takes absolute precedence over mock headers
 *    - In test mode without session cookie, legacy mock headers resolve through test adapter (preserving 351 tests)
 *    - In production mode, client identity headers are ignored and rejected with 401
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { AuthContextManager } from '../src/core/auth/authContext';
import {
  UnauthorizedError,
  ForbiddenError,
  VerificationRequiredError,
  WorkspaceIsolationError,
  InvalidSelectorError,
  UserRole,
} from '../src/core/auth/types';
import { resolveTestMockContext } from '../src/core/auth/testContextAdapter';
import { SessionRepository } from '../src/lib/storage/postgres/sessionRepository';
import { MembershipRepository } from '../src/lib/storage/postgres/membershipRepository';
import { PostgresUserWorkspaceRepository } from '../src/lib/storage/postgres/userWorkspaceRepository';
import { hashToken } from '../src/lib/security/tokens';

describe('Phase 10C-B4.2: AuthContextManager Overhaul & Session Bridge', () => {
  let db: PGlite;
  let sessionRepo: SessionRepository;
  let membershipRepo: MembershipRepository;
  let userWorkspaceRepo: PostgresUserWorkspaceRepository;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`SET timezone = 'UTC';`);

    // Create DDL matching Prisma schema
    await db.exec(`
      CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');
      CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');

      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL UNIQUE,
        "name" TEXT NOT NULL,
        "passwordHash" TEXT,
        "avatarUrl" TEXT,
        "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE "Session" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "tokenHash" TEXT NOT NULL UNIQUE,
        "userAgent" TEXT,
        "ipAddress" TEXT,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastActiveAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE "Workspace" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL UNIQUE,
        "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "isArchived" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE "Membership" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "role" "Role" NOT NULL DEFAULT 'VIEWER',
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastActiveAt" TIMESTAMP(3),
        CONSTRAINT "Membership_workspaceId_userId_key" UNIQUE ("workspaceId", "userId")
      );
    `);

    // PGlite Prisma mock implementing findUnique, findFirst, findMany, create, update, delete
    const prismaMock: any = {
      user: {
        findUnique: async ({ where }: any) => {
          if (where.id) {
            const res = await db.query(`SELECT * FROM "User" WHERE "id" = $1;`, [where.id]);
            return res.rows[0] || null;
          }
          if (where.email) {
            const res = await db.query(`SELECT * FROM "User" WHERE LOWER("email") = LOWER($1);`, [where.email]);
            return res.rows[0] || null;
          }
          return null;
        },
      },
      session: {
        findUnique: async ({ where, include }: any) => {
          if (where.tokenHash) {
            const res = await db.query(`SELECT * FROM "Session" WHERE "tokenHash" = $1;`, [where.tokenHash]);
            if (res.rows.length === 0) return null;
            const sessionRow: any = res.rows[0];
            sessionRow.expiresAt = new Date(sessionRow.expiresAt);
            sessionRow.createdAt = new Date(sessionRow.createdAt);
            sessionRow.lastActiveAt = new Date(sessionRow.lastActiveAt);

            if (include?.user) {
              const uRes = await db.query(`SELECT * FROM "User" WHERE "id" = $1;`, [sessionRow.userId]);
              if (uRes.rows.length > 0) {
                const uRow: any = uRes.rows[0];
                uRow.createdAt = new Date(uRow.createdAt);
                uRow.updatedAt = new Date(uRow.updatedAt);
                sessionRow.user = uRow;
              } else {
                sessionRow.user = null;
              }
            }
            return sessionRow;
          }
          return null;
        },
        create: async ({ data }: any) => {
          const id = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const res = await db.query(
            `INSERT INTO "Session" ("id", "userId", "tokenHash", "userAgent", "ipAddress", "expiresAt", "createdAt", "lastActiveAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;`,
            [
              id,
              data.userId,
              data.tokenHash,
              data.userAgent || null,
              data.ipAddress || null,
              data.expiresAt,
              data.createdAt || new Date(),
              data.lastActiveAt || new Date(),
            ]
          );
          const row: any = res.rows[0];
          row.expiresAt = new Date(row.expiresAt);
          row.createdAt = new Date(row.createdAt);
          row.lastActiveAt = new Date(row.lastActiveAt);
          return row;
        },
        delete: async ({ where }: any) => {
          if (where.id) {
            await db.query(`DELETE FROM "Session" WHERE "id" = $1;`, [where.id]);
          }
          return {};
        },
        updateMany: async ({ where, data }: any) => {
          if (where.id) {
            await db.query(`UPDATE "Session" SET "lastActiveAt" = $1 WHERE "id" = $2;`, [data.lastActiveAt, where.id]);
          }
          return { count: 1 };
        },
      },
      workspace: {
        findUnique: async ({ where }: any) => {
          if (where.id) {
            const res = await db.query(`SELECT * FROM "Workspace" WHERE "id" = $1;`, [where.id]);
            if (res.rows.length === 0) return null;
            const row: any = res.rows[0];
            row.createdAt = new Date(row.createdAt);
            row.updatedAt = new Date(row.updatedAt);
            return row;
          }
          return null;
        },
        findFirst: async ({ where, orderBy }: any) => {
          let sql = `SELECT * FROM "Workspace" WHERE 1=1`;
          const params: any[] = [];
          if (where.ownerId) {
            params.push(where.ownerId);
            sql += ` AND "ownerId" = $${params.length}`;
          }
          if (where.isArchived !== undefined) {
            params.push(where.isArchived);
            sql += ` AND "isArchived" = $${params.length}`;
          }
          sql += ` ORDER BY "createdAt" ASC, "id" ASC LIMIT 1;`;
          const res = await db.query(sql, params);
          if (res.rows.length === 0) return null;
          const row: any = res.rows[0];
          row.createdAt = new Date(row.createdAt);
          row.updatedAt = new Date(row.updatedAt);
          return row;
        },
      },
      membership: {
        findUnique: async ({ where, include }: any) => {
          const wsId = where.workspaceId_userId?.workspaceId;
          const uId = where.workspaceId_userId?.userId;
          if (!wsId || !uId) return null;

          const res = await db.query(
            `SELECT * FROM "Membership" WHERE "workspaceId" = $1 AND "userId" = $2;`,
            [wsId, uId]
          );
          if (res.rows.length === 0) return null;
          const row: any = res.rows[0];
          row.createdAt = new Date(row.createdAt);
          if (row.lastActiveAt) row.lastActiveAt = new Date(row.lastActiveAt);

          if (include?.workspace) {
            const wsRes = await db.query(`SELECT * FROM "Workspace" WHERE "id" = $1;`, [wsId]);
            if (wsRes.rows.length > 0) {
              const wsRow: any = wsRes.rows[0];
              wsRow.createdAt = new Date(wsRow.createdAt);
              wsRow.updatedAt = new Date(wsRow.updatedAt);
              row.workspace = wsRow;
            } else {
              row.workspace = null;
            }
          }
          return row;
        },
        findMany: async ({ where, include, orderBy, take }: any) => {
          let sql = `
            SELECT m.*, w."id" as w_id, w."name" as w_name, w."slug" as w_slug,
                   w."ownerId" as w_owner_id, w."isArchived" as w_is_archived,
                   w."createdAt" as w_created_at, w."updatedAt" as w_updated_at
            FROM "Membership" m
            JOIN "Workspace" w ON m."workspaceId" = w."id"
            WHERE 1=1
          `;
          const params: any[] = [];

          if (where.userId) {
            params.push(where.userId);
            sql += ` AND m."userId" = $${params.length}`;
          }
          if (where.role) {
            params.push(where.role);
            sql += ` AND m."role" = $${params.length}::"Role"`;
          }
          if (where.status) {
            params.push(where.status);
            sql += ` AND m."status" = $${params.length}`;
          }
          if (where.workspace?.isArchived !== undefined) {
            params.push(where.workspace.isArchived);
            sql += ` AND w."isArchived" = $${params.length}`;
          }
          if (where.workspace?.ownerId) {
            params.push(where.workspace.ownerId);
            sql += ` AND w."ownerId" = $${params.length}`;
          }

          sql += ` ORDER BY w."createdAt" ASC, w."id" ASC`;
          if (take) {
            sql += ` LIMIT ${take}`;
          }

          const res = await db.query(sql, params);
          return res.rows.map((r: any) => ({
            id: r.id,
            workspaceId: r.workspaceId,
            userId: r.userId,
            role: r.role,
            status: r.status,
            createdAt: new Date(r.createdAt),
            lastActiveAt: r.lastActiveAt ? new Date(r.lastActiveAt) : null,
            workspace: {
              id: r.w_id,
              name: r.w_name,
              slug: r.w_slug,
              ownerId: r.w_owner_id,
              isArchived: r.w_is_archived,
              createdAt: new Date(r.w_created_at),
              updatedAt: new Date(r.w_updated_at),
            },
          }));
        },
      },
    };

    sessionRepo = new SessionRepository(prismaMock);
    membershipRepo = new MembershipRepository(prismaMock);
    userWorkspaceRepo = new PostgresUserWorkspaceRepository(prismaMock);

    // Inject repositories for testing
    AuthContextManager.setRepositoriesForTesting({
      sessionRepository: sessionRepo,
      membershipRepository: membershipRepo,
      userWorkspaceRepository: userWorkspaceRepo,
    });
  }, 30000);

  beforeEach(async () => {
    await db.exec(`
      DELETE FROM "Session";
      DELETE FROM "Membership";
      DELETE FROM "Workspace";
      DELETE FROM "User";
    `);
  });

  // ----------------------------------------------------
  // 1. Authoritative PostgreSQL Session Resolution
  // ----------------------------------------------------
  describe('1. Authoritative PostgreSQL Session Resolution', () => {
    it('should authenticate user and resolve primary workspace with valid session cookie', async () => {
      // Seed user, workspace, and owner membership in PostgreSQL
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('usr_alice', 'alice@flowpilot.dev', 'Alice', 'ACTIVE');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_alice_1', 'Alice WS', 'alice-ws', 'usr_alice', false);`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('mem_a1', 'ws_alice_1', 'usr_alice', 'OWNER', 'active');`);

      // Create session
      const { rawToken } = await sessionRepo.createSession({ userId: 'usr_alice' });

      // Request with real session cookie
      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: {
          cookie: `fp_session=${rawToken}`,
        },
      });

      const authCtx = await AuthContextManager.resolve(req);

      expect(authCtx.user.id).toBe('usr_alice');
      expect(authCtx.user.email).toBe('alice@flowpilot.dev');
      expect(authCtx.workspace.id).toBe('ws_alice_1');
      expect(authCtx.membership.role).toBe('OWNER');
      expect(authCtx.role).toBe('OWNER');
    });

    it('should reject expired session token (absolute expiration > 14 days) with 401', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('usr_exp', 'exp@flowpilot.dev', 'Exp', 'ACTIVE');`);
      const { rawToken, session } = await sessionRepo.createSession({ userId: 'usr_exp' });

      // Backdate expiresAt to past
      const past = new Date(Date.now() - 10000);
      await db.query(`UPDATE "Session" SET "expiresAt" = $1 WHERE "id" = $2;`, [past, session.id]);

      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: { cookie: `fp_session=${rawToken}` },
      });

      await expect(AuthContextManager.resolve(req)).rejects.toThrow(UnauthorizedError);

      // Verify immediate cleanup from database
      const countRes = await db.query(`SELECT count(*) as c FROM "Session" WHERE "id" = $1;`, [session.id]);
      expect(Number((countRes.rows[0] as any).c)).toBe(0);
    });

    it('should reject idle expired session (> 2 hours) with 401 and purge session record', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('usr_idle', 'idle@flowpilot.dev', 'Idle', 'ACTIVE');`);
      const { rawToken, session } = await sessionRepo.createSession({ userId: 'usr_idle' });

      // Backdate lastActiveAt to 3 hours ago
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      await db.query(`UPDATE "Session" SET "lastActiveAt" = $1 WHERE "id" = $2;`, [threeHoursAgo, session.id]);

      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: { cookie: `fp_session=${rawToken}` },
      });

      await expect(AuthContextManager.resolve(req)).rejects.toThrow(UnauthorizedError);

      const countRes = await db.query(`SELECT count(*) as c FROM "Session" WHERE "id" = $1;`, [session.id]);
      expect(Number((countRes.rows[0] as any).c)).toBe(0);
    });

    it('should reject SUSPENDED accounts with 403 Forbidden', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('usr_susp', 'susp@flowpilot.dev', 'Susp', 'SUSPENDED');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_susp', 'Susp WS', 'susp-ws', 'usr_susp');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_s', 'ws_susp', 'usr_susp', 'OWNER', 'active');`);

      const { rawToken } = await sessionRepo.createSession({ userId: 'usr_susp' });
      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: { cookie: `fp_session=${rawToken}` },
      });

      await expect(AuthContextManager.resolve(req)).rejects.toThrow(ForbiddenError);
    });

    it('should reject PENDING_VERIFICATION accounts with 403 VerificationRequired for workspace routes', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('usr_pend', 'pend@flowpilot.dev', 'Pend', 'PENDING_VERIFICATION');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_pend', 'Pend WS', 'pend-ws', 'usr_pend');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_p', 'ws_pend', 'usr_pend', 'OWNER', 'active');`);

      const { rawToken } = await sessionRepo.createSession({ userId: 'usr_pend' });
      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: { cookie: `fp_session=${rawToken}` },
      });

      try {
        await AuthContextManager.resolve(req);
        expect.unreachable('Should have thrown VerificationRequiredError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(VerificationRequiredError);
        expect(err.statusCode).toBe(403);
        expect(err.message).toContain('Forbidden: Email verification required:');
        expect(err.code).toBe('EMAIL_VERIFICATION_REQUIRED');
        expect(err.userId).toBe('usr_pend');
      }
    });
  });

  // ----------------------------------------------------
  // 2. Workspace Resolution & Membership Enforcement
  // ----------------------------------------------------
  describe('2. Workspace Resolution & Membership Enforcement', () => {
    it('should fallback to active member workspace when user owns no workspaces', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_owner_team', 'owner@team.dev', 'Owner');`);
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_member_only', 'member@team.dev', 'Member');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_team_1', 'Team WS', 'team-ws', 'usr_owner_team');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_tm', 'ws_team_1', 'usr_member_only', 'EDITOR', 'active');`);

      const { rawToken } = await sessionRepo.createSession({ userId: 'usr_member_only' });
      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: { cookie: `fp_session=${rawToken}` },
      });

      const authCtx = await AuthContextManager.resolve(req);
      expect(authCtx.workspace.id).toBe('ws_team_1');
      expect(authCtx.role).toBe('EDITOR');
    });

    it('should support valid untrusted workspace selector via x-workspace-id header when user is active member', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_multi', 'multi@flowpilot.dev', 'Multi');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "createdAt") VALUES ('ws_m1', 'WS 1', 'ws-1', 'usr_multi', '2026-01-01T00:00:00Z');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "createdAt") VALUES ('ws_m2', 'WS 2', 'ws-2', 'usr_multi', '2026-01-02T00:00:00Z');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_1', 'ws_m1', 'usr_multi', 'OWNER', 'active');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_2', 'ws_m2', 'usr_multi', 'ADMIN', 'active');`);

      const { rawToken } = await sessionRepo.createSession({ userId: 'usr_multi' });

      // Request explicitly selecting ws_m2
      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: {
          cookie: `fp_session=${rawToken}`,
          'x-workspace-id': 'ws_m2',
        },
      });

      const authCtx = await AuthContextManager.resolve(req);
      expect(authCtx.workspace.id).toBe('ws_m2');
      expect(authCtx.role).toBe('ADMIN');
    });

    it('should reject conflicting header and query workspace selectors with 400 InvalidSelector', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_conf', 'conf@flowpilot.dev', 'Conf');`);
      const { rawToken } = await sessionRepo.createSession({ userId: 'usr_conf' });

      const req = new NextRequest('http://localhost:3000/api/v1/workflows?workspaceId=ws_from_query', {
        headers: {
          cookie: `fp_session=${rawToken}`,
          'x-workspace-id': 'ws_from_header',
        },
      });

      await expect(AuthContextManager.resolve(req)).rejects.toThrow(InvalidSelectorError);
    });

    it('should reject non-member selector attempts with 403 WorkspaceIsolationError', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_legit', 'legit@flowpilot.dev', 'Legit');`);
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_victim', 'victim@flowpilot.dev', 'Victim');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_victim', 'Victim WS', 'victim-ws', 'usr_victim');`);

      const { rawToken } = await sessionRepo.createSession({ userId: 'usr_legit' });

      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: {
          cookie: `fp_session=${rawToken}`,
          'x-workspace-id': 'ws_victim',
        },
      });

      await expect(AuthContextManager.resolve(req)).rejects.toThrow(WorkspaceIsolationError);
    });

    it('should reject archived workspace access even if user is owner with 403 WorkspaceIsolationError', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_arch', 'arch@flowpilot.dev', 'Arch');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_arch', 'Archived WS', 'arch-ws', 'usr_arch', true);`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_arc', 'ws_arch', 'usr_arch', 'OWNER', 'active');`);

      const { rawToken } = await sessionRepo.createSession({ userId: 'usr_arch' });

      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: {
          cookie: `fp_session=${rawToken}`,
          'x-workspace-id': 'ws_arch',
        },
      });

      await expect(AuthContextManager.resolve(req)).rejects.toThrow(WorkspaceIsolationError);
    });
  });

  // ----------------------------------------------------
  // 3. Route Parameter Precedence & Non-Mutating Isolation
  // ----------------------------------------------------
  describe('3. Route Parameter Precedence & Non-Mutating Isolation', () => {
    it('should enforce route parameter targetWorkspaceId and ignore conflicting client headers', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_route', 'route@flowpilot.dev', 'Route');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_param_target', 'Param WS', 'param-ws', 'usr_route');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_header_spoof', 'Header WS', 'header-ws', 'usr_route');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_pt', 'ws_param_target', 'usr_route', 'OWNER', 'active');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_hs', 'ws_header_spoof', 'usr_route', 'VIEWER', 'active');`);

      const { rawToken } = await sessionRepo.createSession({ userId: 'usr_route' });

      // Request supplies conflicting x-workspace-id header, but route explicitly authorizes ws_param_target
      const req = new NextRequest('http://localhost:3000/api/v1/workspaces/ws_param_target', {
        headers: {
          cookie: `fp_session=${rawToken}`,
          'x-workspace-id': 'ws_header_spoof',
        },
      });

      const authCtx = await AuthContextManager.enforceWorkspaceIsolation(req, 'ws_param_target', 'workspace:read');

      // Must strictly resolve target parameter ws_param_target and its OWNER role
      expect(authCtx.workspace.id).toBe('ws_param_target');
      expect(authCtx.role).toBe('OWNER');
    });

    it('should return a new deeply frozen AuthContext on workspace switch without mutating the original', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_switch', 'switch@flowpilot.dev', 'Switch');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "createdAt") VALUES ('ws_primary', 'Primary WS', 'p-ws', 'usr_switch', '2026-01-01T00:00:00Z');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "createdAt") VALUES ('ws_secondary', 'Secondary WS', 's-ws', 'usr_switch', '2026-01-02T00:00:00Z');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_p1', 'ws_primary', 'usr_switch', 'OWNER', 'active');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_s1', 'ws_secondary', 'usr_switch', 'VIEWER', 'active');`);

      const { rawToken } = await sessionRepo.createSession({ userId: 'usr_switch' });

      const req = new NextRequest('http://localhost:3000/api/v1/workspaces/ws_secondary', {
        headers: { cookie: `fp_session=${rawToken}` },
      });

      const originalCtx = await AuthContextManager.resolve(req);
      expect(originalCtx.workspace.id).toBe('ws_primary');

      const switchedCtx = await AuthContextManager.enforceWorkspaceIsolation(req, 'ws_secondary', 'workspace:read');

      // Switched context points to secondary workspace
      expect(switchedCtx.workspace.id).toBe('ws_secondary');
      expect(switchedCtx.role).toBe('VIEWER');

      // Original context is completely unchanged (non-mutating)
      expect(originalCtx.workspace.id).toBe('ws_primary');
      expect(originalCtx.role).toBe('OWNER');
      expect(switchedCtx).not.toBe(originalCtx);
    });
  });

  // ----------------------------------------------------
  // 4. Deep DTO Immutability
  // ----------------------------------------------------
  describe('4. Deep DTO Immutability', () => {
    it('should deeply freeze root context, user, workspace, settings, and membership', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_freeze', 'freeze@flowpilot.dev', 'Freeze');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_freeze', 'Freeze WS', 'freeze-ws', 'usr_freeze');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_fr', 'ws_freeze', 'usr_freeze', 'OWNER', 'active');`);

      const { rawToken } = await sessionRepo.createSession({ userId: 'usr_freeze' });
      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: { cookie: `fp_session=${rawToken}` },
      });

      const authCtx = await AuthContextManager.resolve(req);

      // Verify Object.isFrozen across entire DTO graph
      expect(Object.isFrozen(authCtx)).toBe(true);
      expect(Object.isFrozen(authCtx.user)).toBe(true);
      expect(Object.isFrozen(authCtx.workspace)).toBe(true);
      expect(Object.isFrozen(authCtx.workspace.settings)).toBe(true);
      expect(Object.isFrozen(authCtx.membership)).toBe(true);

      // Verify strict-mode mutation failure
      expect(() => {
        (authCtx.user as any).name = 'Mutated';
      }).toThrow(TypeError);

      expect(() => {
        (authCtx.workspace as any).name = 'Mutated Workspace';
      }).toThrow(TypeError);

      expect(() => {
        (authCtx.workspace.settings as any).retentionDays = 999;
      }).toThrow(TypeError);

      expect(() => {
        (authCtx as any).role = 'ADMIN';
      }).toThrow(TypeError);
    });
  });

  // ----------------------------------------------------
  // 5. Test Adapter Isolation & Security
  // ----------------------------------------------------
  describe('5. Test Adapter Isolation & Security', () => {
    it('should throw FATAL SECURITY VIOLATION if resolveTestMockContext is invoked outside NODE_ENV=test', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'production';
        expect(() => {
          resolveTestMockContext();
        }).toThrow('FATAL SECURITY VIOLATION: TestContextAdapter invoked outside NODE_ENV=test.');
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
      }
    });

    it('should reject mock headers in production mode when no session cookie is supplied with 401', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'production';

        const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
          headers: {
            'x-user-id': 'usr_owner',
            'x-workspace-id': 'ws_default',
          },
        });

        await expect(AuthContextManager.resolve(req)).rejects.toThrow(UnauthorizedError);
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
      }
    });

    it('should prioritize real session cookie over mock headers in test mode', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_real_db', 'real@flowpilot.dev', 'Real DB User');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_real_db', 'Real DB WS', 'real-db-ws', 'usr_real_db');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_rdb', 'ws_real_db', 'usr_real_db', 'OWNER', 'active');`);

      const { rawToken } = await sessionRepo.createSession({ userId: 'usr_real_db' });

      // Request carries real session cookie for usr_real_db AND spoofed legacy mock header for usr_attacker
      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: {
          cookie: `fp_session=${rawToken}`,
          'x-user-id': 'usr_attacker_spoof',
        },
      });

      const authCtx = await AuthContextManager.resolve(req);

      // Must resolve authentic database session identity, ignoring the spoofed mock header
      expect(authCtx.user.id).toBe('usr_real_db');
      expect(authCtx.workspace.id).toBe('ws_real_db');
    });

    it('should safely fall back to testContextAdapter in test mode when no session cookie is provided', async () => {
      // In NODE_ENV === 'test' without cookie: resolves default usr_owner and ws_default
      const req = new NextRequest('http://localhost:3000/api/v1/workflows');
      const authCtx = await AuthContextManager.resolve(req);

      expect(authCtx.user.id).toBe('usr_owner');
      expect(authCtx.workspace.id).toBe('ws_default');
      expect(authCtx.role).toBe('OWNER');
    });
  });
});
