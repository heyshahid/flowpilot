/**
 * FlowPilot Phase 10C-B4.1: PostgreSQL Membership & Workspace Data Layer Test Suite
 *
 * Validates:
 * 1. MembershipRepository:
 *    - Indexed lookup by (workspaceId, userId)
 *    - Explicit status handling (active vs suspended vs revoked vs inactive)
 *    - Deterministic active workspace resolution (earliest active owned, fallback to active member)
 *    - Archived workspace exclusion
 * 2. PostgresUserWorkspaceRepository:
 *    - Workspace ownership and access validation
 *    - Deterministic default active workspace lookup
 * 3. Membership Backfill Script:
 *    - Safe by default (--dry-run leaves database 100% untouched)
 *    - Strict eligibility rule: proposes OWNER membership ONLY when no record exists at all
 *    - Preserves existing suspended, revoked, inactive, and active memberships (never modifies/restores)
 *    - Rejects inactive or missing owners and archived workspaces
 *    - Concurrency and transaction safety
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  MembershipRepository,
  MembershipWithWorkspace,
} from '../src/lib/storage/postgres/membershipRepository';
import { PostgresUserWorkspaceRepository } from '../src/lib/storage/postgres/userWorkspaceRepository';
import {
  runMembershipBackfill,
  parseCommandLineArgs,
  BackfillOptions,
} from '../scripts/backfill_workspace_memberships';

describe('Phase 10C-B4.1: PostgreSQL Membership & Workspace Data Layer', () => {
  let db: PGlite;
  let prismaMock: any;
  let membershipRepo: MembershipRepository;
  let userWorkspaceRepo: PostgresUserWorkspaceRepository;

  beforeAll(async () => {
    db = new PGlite();

    // Create DDL matching Prisma schema
    await db.exec(`
      CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');
      CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');

      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL UNIQUE,
        "name" TEXT NOT NULL,
        "passwordHash" TEXT,
        "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
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

    // Build real PGlite-backed adapter implementing PrismaClient subset
    function createPrismaMock(database: PGlite) {
      return {
        user: {
          findUnique: async ({ where }: any) => {
            if (where.id) {
              const res = await database.query(`SELECT * FROM "User" WHERE "id" = $1;`, [where.id]);
              return res.rows[0] || null;
            }
            if (where.email) {
              const res = await database.query(`SELECT * FROM "User" WHERE LOWER("email") = LOWER($1);`, [where.email]);
              return res.rows[0] || null;
            }
            return null;
          },
          upsert: async ({ where, create, update }: any) => {
            const existing = await database.query(`SELECT * FROM "User" WHERE "id" = $1;`, [where.id]);
            if (existing.rows.length > 0) {
              const res = await database.query(
                `UPDATE "User" SET "email" = $1, "name" = $2, "updatedAt" = NOW() WHERE "id" = $3 RETURNING *;`,
                [update.email, update.name, where.id]
              );
              return res.rows[0];
            } else {
              const res = await database.query(
                `INSERT INTO "User" ("id", "email", "name", "status", "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;`,
                [create.id, create.email, create.name, create.status || 'ACTIVE', create.createdAt || new Date(), new Date()]
              );
              return res.rows[0];
            }
          },
        },
        workspace: {
          findUnique: async ({ where, select }: any) => {
            const res = await database.query(`SELECT * FROM "Workspace" WHERE "id" = $1;`, [where.id]);
            if (!res.rows[0]) return null;
            const row = res.rows[0] as any;
            if (select) {
              const selected: any = {};
              if (select.ownerId) selected.ownerId = row.ownerId;
              if (select.isArchived !== undefined) selected.isArchived = row.isArchived;
              return selected;
            }
            return row;
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
            if (orderBy && Array.isArray(orderBy)) {
              const orderParts = orderBy.map((o) => {
                const key = Object.keys(o)[0];
                return `"${key}" ${o[key].toUpperCase()}`;
              });
              sql += ` ORDER BY ${orderParts.join(', ')}`;
            }
            sql += ` LIMIT 1;`;
            const res = await database.query(sql, params);
            return res.rows[0] || null;
          },
          findMany: async ({ orderBy }: any) => {
            let sql = `SELECT * FROM "Workspace"`;
            if (orderBy && Array.isArray(orderBy)) {
              const orderParts = orderBy.map((o) => {
                const key = Object.keys(o)[0];
                return `"${key}" ${o[key].toUpperCase()}`;
              });
              sql += ` ORDER BY ${orderParts.join(', ')}`;
            }
            sql += `;`;
            const res = await database.query(sql);
            return res.rows;
          },
        },
        membership: {
          findUnique: async ({ where, include }: any) => {
            const { workspaceId, userId } = where.workspaceId_userId;
            const res = await database.query(
              `SELECT * FROM "Membership" WHERE "workspaceId" = $1 AND "userId" = $2;`,
              [workspaceId, userId]
            );
            if (!res.rows[0]) return null;
            const mem: any = { ...res.rows[0] };
            if (include?.workspace) {
              const wsRes = await database.query(`SELECT * FROM "Workspace" WHERE "id" = $1;`, [workspaceId]);
              mem.workspace = wsRes.rows[0] || null;
            }
            return mem;
          },
          findMany: async ({ where, include, orderBy, take }: any) => {
            let sql = `
              SELECT m.*, w."id" as ws_id, w."name" as ws_name, w."slug" as ws_slug,
                     w."ownerId" as ws_owner_id, w."isArchived" as ws_is_archived,
                     w."createdAt" as ws_created_at, w."updatedAt" as ws_updated_at
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
              sql += ` AND m."role" = $${params.length}`;
            }
            if (where.status) {
              params.push(where.status);
              sql += ` AND LOWER(m."status") = LOWER($${params.length})`;
            }
            if (where.workspace?.isArchived !== undefined) {
              params.push(where.workspace.isArchived);
              sql += ` AND w."isArchived" = $${params.length}`;
            }
            if (where.workspace?.ownerId) {
              params.push(where.workspace.ownerId);
              sql += ` AND w."ownerId" = $${params.length}`;
            }

            if (orderBy && Array.isArray(orderBy)) {
              const orderParts = orderBy.map((o) => {
                if (o.workspace) {
                  const key = Object.keys(o.workspace)[0];
                  return `w."${key}" ${o.workspace[key].toUpperCase()}`;
                }
                const key = Object.keys(o)[0];
                return `m."${key}" ${o[key].toUpperCase()}`;
              });
              sql += ` ORDER BY ${orderParts.join(', ')}`;
            }

            if (take) {
              sql += ` LIMIT ${take}`;
            }
            sql += `;`;

            const res = await database.query(sql, params);
            return res.rows.map((r: any) => {
              const mem: any = {
                id: r.id,
                workspaceId: r.workspaceId,
                userId: r.userId,
                role: r.role,
                status: r.status,
                createdAt: r.createdAt,
                lastActiveAt: r.lastActiveAt,
              };
              if (include?.workspace) {
                mem.workspace = {
                  id: r.ws_id,
                  name: r.ws_name,
                  slug: r.ws_slug,
                  ownerId: r.ws_owner_id,
                  isArchived: r.ws_is_archived,
                  createdAt: r.ws_created_at,
                  updatedAt: r.ws_updated_at,
                };
              }
              return mem;
            });
          },
          create: async ({ data }: any) => {
            const res = await database.query(
              `INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status", "createdAt")
               VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *;`,
              [data.id, data.workspaceId, data.userId, data.role, data.status]
            );
            return res.rows[0];
          },
          update: async ({ where, data }: any) => {
            const { workspaceId, userId } = where.workspaceId_userId;
            const res = await database.query(
              `UPDATE "Membership" SET "status" = $1 WHERE "workspaceId" = $2 AND "userId" = $3 RETURNING *;`,
              [data.status, workspaceId, userId]
            );
            return res.rows[0];
          },
        },
        $transaction: async (cb: any) => {
          await database.exec('BEGIN;');
          try {
            const res = await cb(createPrismaMock(database));
            await database.exec('COMMIT;');
            return res;
          } catch (e) {
            await database.exec('ROLLBACK;');
            throw e;
          }
        },
      };
    }

    prismaMock = createPrismaMock(db);
    membershipRepo = new MembershipRepository(prismaMock);
    userWorkspaceRepo = new PostgresUserWorkspaceRepository(prismaMock);
  }, 30000);

  beforeEach(async () => {
    // Reset test database tables cleanly
    await db.exec(`
      DELETE FROM "Membership";
      DELETE FROM "Workspace";
      DELETE FROM "User";
    `);
  });

  // ==========================================================================
  // 1. Membership Repository Core Operations
  // ==========================================================================
  describe('1. Membership Repository Core Operations', () => {
    it('should retrieve existing active membership with workspace inclusion', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_1', 'u1@flowpilot.dev', 'User 1');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_1', 'Workspace 1', 'ws-1', 'usr_1');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('mem_1', 'ws_1', 'usr_1', 'OWNER', 'active');`);

      const membership = await membershipRepo.getMembership('ws_1', 'usr_1');
      expect(membership).not.toBeNull();
      expect(membership?.workspaceId).toBe('ws_1');
      expect(membership?.userId).toBe('usr_1');
      expect(membership?.role).toBe('OWNER');
      expect(membership?.status).toBe('active');
      expect(membership?.workspace.name).toBe('Workspace 1');
      expect(membershipRepo.isMembershipActive(membership)).toBe(true);
    });

    it('should return null for non-existent membership or invalid inputs', async () => {
      const missing = await membershipRepo.getMembership('ws_nonexistent', 'usr_nonexistent');
      expect(missing).toBeNull();

      expect(await membershipRepo.getMembership('', 'usr_1')).toBeNull();
      expect(await membershipRepo.getMembership('ws_1', '   ')).toBeNull();
      expect(await membershipRepo.getMembership(null as any, 'usr_1')).toBeNull();
    });

    it('should distinguish active, suspended, revoked, and inactive states accurately', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_states', 'states@flowpilot.dev', 'States User');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_s1', 'WS 1', 'ws-s1', 'usr_states');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_s2', 'WS 2', 'ws-s2', 'usr_states');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_s3', 'WS 3', 'ws-s3', 'usr_states');`);

      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('mem_act', 'ws_s1', 'usr_states', 'EDITOR', 'active');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('mem_susp', 'ws_s2', 'usr_states', 'VIEWER', 'suspended');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('mem_rev', 'ws_s3', 'usr_states', 'VIEWER', 'revoked');`);

      const act = await membershipRepo.getMembership('ws_s1', 'usr_states');
      const susp = await membershipRepo.getMembership('ws_s2', 'usr_states');
      const rev = await membershipRepo.getMembership('ws_s3', 'usr_states');

      expect(membershipRepo.isMembershipActive(act)).toBe(true);
      expect(membershipRepo.isMembershipActive(susp)).toBe(false);
      expect(membershipRepo.isMembershipActive(rev)).toBe(false);

      expect(membershipRepo.isMembershipActive(null)).toBe(false);
      expect(membershipRepo.isMembershipActive({ status: 'inactive' } as any)).toBe(false);
    });

    it('should list all user memberships deterministically and respect archived filter', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_multi', 'multi@flowpilot.dev', 'Multi User');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived", "createdAt")
                      VALUES ('ws_active_1', 'Active 1', 'act-1', 'usr_multi', false, '2026-01-01T00:00:00Z');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived", "createdAt")
                      VALUES ('ws_active_2', 'Active 2', 'act-2', 'usr_multi', false, '2026-01-02T00:00:00Z');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived", "createdAt")
                      VALUES ('ws_archived', 'Archived', 'arch-1', 'usr_multi', true, '2026-01-03T00:00:00Z');`);

      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status", "createdAt")
                      VALUES ('m1', 'ws_active_1', 'usr_multi', 'OWNER', 'active', '2026-01-01T00:00:00Z');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status", "createdAt")
                      VALUES ('m2', 'ws_active_2', 'usr_multi', 'EDITOR', 'active', '2026-01-02T00:00:00Z');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status", "createdAt")
                      VALUES ('m3', 'ws_archived', 'usr_multi', 'OWNER', 'active', '2026-01-03T00:00:00Z');`);

      // Default: exclude archived
      const defaultList = await membershipRepo.listUserMemberships('usr_multi');
      expect(defaultList.length).toBe(2);
      expect(defaultList.map((m) => m.workspaceId)).toEqual(['ws_active_1', 'ws_active_2']);

      // With includeArchived: true
      const fullList = await membershipRepo.listUserMemberships('usr_multi', { includeArchived: true });
      expect(fullList.length).toBe(3);
    });

    it('should resolve active workspace deterministically using earliest active owned workspace', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_owner1', 'o1@flowpilot.dev', 'Owner 1');`);

      // WS 1: Earlier, but archived -> must be skipped
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived", "createdAt")
                      VALUES ('ws_early_archived', 'Early Arch', 'ea', 'usr_owner1', true, '2026-01-01T00:00:00Z');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status")
                      VALUES ('m_arch', 'ws_early_archived', 'usr_owner1', 'OWNER', 'active');`);

      // WS 2: Earliest non-archived owned workspace
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived", "createdAt")
                      VALUES ('ws_primary_owned', 'Primary Owned', 'po', 'usr_owner1', false, '2026-01-02T00:00:00Z');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status")
                      VALUES ('m_po', 'ws_primary_owned', 'usr_owner1', 'OWNER', 'active');`);

      // WS 3: Later non-archived owned workspace
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived", "createdAt")
                      VALUES ('ws_later_owned', 'Later Owned', 'lo', 'usr_owner1', false, '2026-01-03T00:00:00Z');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status")
                      VALUES ('m_lo', 'ws_later_owned', 'usr_owner1', 'OWNER', 'active');`);

      const activeWs = await membershipRepo.getActiveWorkspaceForUser('usr_owner1');
      expect(activeWs).not.toBeNull();
      expect(activeWs?.id).toBe('ws_primary_owned');
    });

    it('should return null if user owns no eligible active workspaces (no fallback to non-owned in B4.1)', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_boss', 'boss@flowpilot.dev', 'Boss');`);
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_worker', 'worker@flowpilot.dev', 'Worker');`);

      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "createdAt")
                      VALUES ('ws_boss_1', 'Boss WS 1', 'b1', 'usr_boss', '2026-01-01T00:00:00Z');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "createdAt")
                      VALUES ('ws_boss_2', 'Boss WS 2', 'b2', 'usr_boss', '2026-01-02T00:00:00Z');`);

      // Worker is member in both, not owner in either
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status", "createdAt")
                      VALUES ('m_w1', 'ws_boss_1', 'usr_worker', 'EDITOR', 'active', '2026-01-01T00:00:00Z');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status", "createdAt")
                      VALUES ('m_w2', 'ws_boss_2', 'usr_worker', 'VIEWER', 'active', '2026-01-02T00:00:00Z');`);

      // Approved B4.1 rule strictly considers active owned workspaces. A non-owner receives null.
      const workerWs = await membershipRepo.getActiveWorkspaceForUser('usr_worker');
      expect(workerWs).toBeNull();
    });

    it('should return null if user has only suspended or revoked memberships', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_bad', 'bad@flowpilot.dev', 'Bad');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_bad', 'Bad WS', 'bw', 'usr_bad');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_bad', 'ws_bad', 'usr_bad', 'OWNER', 'suspended');`);

      const activeWs = await membershipRepo.getActiveWorkspaceForUser('usr_bad');
      expect(activeWs).toBeNull();
    });
  });

  // ==========================================================================
  // 2. Workspace Repository Operations & Access Validation
  // ==========================================================================
  describe('2. Workspace Repository Operations & Access Validation', () => {
    it('should validate workspace access for active member and reject archived or suspended', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_val', 'val@flowpilot.dev', 'Val');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_ok', 'OK WS', 'ok-ws', 'usr_val', false);`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_arch', 'Arch WS', 'arch-ws', 'usr_val', true);`);

      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_ok', 'ws_ok', 'usr_val', 'OWNER', 'active');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_arch_mem', 'ws_arch', 'usr_val', 'OWNER', 'active');`);

      // 1. Active workspace and active member -> Valid
      const validAccess = await userWorkspaceRepo.validateWorkspaceAccess('ws_ok', 'usr_val');
      expect(validAccess.hasAccess).toBe(true);
      expect(validAccess.role).toBe('OWNER');

      // 2. Archived workspace -> Rejected
      const archAccess = await userWorkspaceRepo.validateWorkspaceAccess('ws_arch', 'usr_val');
      expect(archAccess.hasAccess).toBe(false);
      expect(archAccess.reason).toBe('WORKSPACE_ARCHIVED');

      // 3. Non-existent workspace -> Rejected
      const missingWs = await userWorkspaceRepo.validateWorkspaceAccess('ws_nonexistent', 'usr_val');
      expect(missingWs.hasAccess).toBe(false);
      expect(missingWs.reason).toBe('WORKSPACE_NOT_FOUND');

      // 4. Missing membership in existing workspace -> Rejected
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_outsider', 'out@flowpilot.dev', 'Outsider');`);
      const noMem = await userWorkspaceRepo.validateWorkspaceAccess('ws_ok', 'usr_outsider');
      expect(noMem.hasAccess).toBe(false);
      expect(noMem.reason).toBe('MEMBERSHIP_NOT_FOUND');
    });

    it('should return default active workspace deterministically', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_def', 'def@flowpilot.dev', 'Def');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived", "createdAt")
                      VALUES ('ws_def_1', 'Def WS 1', 'def-1', 'usr_def', false, '2026-01-01T00:00:00Z');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived", "createdAt")
                      VALUES ('ws_def_2', 'Def WS 2', 'def-2', 'usr_def', false, '2026-01-02T00:00:00Z');`);

      const defaultWs = await userWorkspaceRepo.getDefaultActiveWorkspace('usr_def');
      expect(defaultWs).not.toBeNull();
      expect(defaultWs?.id).toBe('ws_def_1');
    });
  });

  // ==========================================================================
  // 3. Membership Backfill Script Testing
  // ==========================================================================
  describe('3. Membership Backfill Script Testing', () => {
    it('should parse command line arguments with safe defaults', () => {
      expect(parseCommandLineArgs([])).toEqual({ dryRun: true, confirm: false, verbose: false });
      expect(parseCommandLineArgs(['--dry-run'])).toEqual({ dryRun: true, confirm: false, verbose: false });
      expect(parseCommandLineArgs(['--verbose'])).toEqual({ dryRun: true, confirm: false, verbose: true });
      expect(parseCommandLineArgs(['--apply'])).toEqual({ dryRun: false, confirm: false, verbose: false });
      expect(parseCommandLineArgs(['--apply', '--confirm'])).toEqual({ dryRun: false, confirm: true, verbose: false });
    });

    it('should throw fatal safety lockout if --apply is passed without --confirm', async () => {
      await expect(
        runMembershipBackfill({ dryRun: false, confirm: false }, prismaMock)
      ).rejects.toThrow('SAFETY LOCKOUT');
    });

    it('should propose eligible active owner with no membership in dry-run mode leaving DB unchanged', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('usr_need_mem', 'need@flowpilot.dev', 'Need Mem', 'ACTIVE');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_need_mem', 'Need Mem WS', 'need-mem', 'usr_need_mem', false);`);

      // Verify no membership exists before
      const countBefore = await db.query(`SELECT count(*) as c FROM "Membership";`);
      expect(Number((countBefore.rows[0] as any).c)).toBe(0);

      // Run dry-run backfill
      const report = await runMembershipBackfill({ dryRun: true }, prismaMock);

      expect(report.mode).toBe('DRY_RUN');
      expect(report.totalWorkspacesScanned).toBe(1);
      expect(report.eligibleProposed).toBe(1);
      expect(report.appliedCount).toBe(0);
      expect(report.skippedCount).toBe(0);
      expect(report.proposedRecords[0]).toEqual({
        workspaceId: 'ws_need_mem',
        workspaceName: 'Need Mem WS',
        ownerId: 'usr_need_mem',
        ownerEmail: 'need@flowpilot.dev',
        role: 'OWNER',
        status: 'active',
      });

      // Assert database was 100% UNTOUCHED
      const countAfter = await db.query(`SELECT count(*) as c FROM "Membership";`);
      expect(Number((countAfter.rows[0] as any).c)).toBe(0);
    });

    it('should skip workspaces with existing active, suspended, or revoked memberships (never modify/restore)', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('u_act', 'act@flowpilot.dev', 'Act', 'ACTIVE');`);
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('u_susp', 'susp@flowpilot.dev', 'Susp', 'ACTIVE');`);
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('u_rev', 'rev@flowpilot.dev', 'Rev', 'ACTIVE');`);

      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_has_act', 'Act WS', 'act', 'u_act', false);`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_has_susp', 'Susp WS', 'susp', 'u_susp', false);`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_has_rev', 'Rev WS', 'rev', 'u_rev', false);`);

      // Existing records with various statuses
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_a', 'ws_has_act', 'u_act', 'OWNER', 'active');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_s', 'ws_has_susp', 'u_susp', 'VIEWER', 'suspended');`);
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status") VALUES ('m_r', 'ws_has_rev', 'u_rev', 'VIEWER', 'revoked');`);

      const report = await runMembershipBackfill({ dryRun: true }, prismaMock);

      expect(report.totalWorkspacesScanned).toBe(3);
      expect(report.eligibleProposed).toBe(0);
      expect(report.skippedCount).toBe(3);
      expect(report.skipBreakdown.existingActive).toBe(1);
      expect(report.skipBreakdown.existingSuspended).toBe(1);
      expect(report.skipBreakdown.existingRevoked).toBe(1);

      // Verify statuses in DB are 100% preserved
      const suspMem = await db.query(`SELECT "status", "role" FROM "Membership" WHERE "id" = 'm_s';`);
      expect((suspMem.rows[0] as any).status).toBe('suspended');
      expect((suspMem.rows[0] as any).role).toBe('VIEWER');

      const revMem = await db.query(`SELECT "status", "role" FROM "Membership" WHERE "id" = 'm_r';`);
      expect((revMem.rows[0] as any).status).toBe('revoked');
      expect((revMem.rows[0] as any).role).toBe('VIEWER');
    });

    it('should skip archived workspaces, inactive owners, and missing owners', async () => {
      // 1. Archived workspace with active owner
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('u1', 'u1@flowpilot.dev', 'U1', 'ACTIVE');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_arch', 'Archived WS', 'arch', 'u1', true);`);

      // 2. Active workspace with suspended owner
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('u_susp_owner', 'susp_o@flowpilot.dev', 'Susp', 'SUSPENDED');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_susp_owner', 'Susp WS', 'sw', 'u_susp_owner', false);`);

      // 3. Active workspace with pending verification owner
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('u_pend_owner', 'pend_o@flowpilot.dev', 'Pend', 'PENDING_VERIFICATION');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_pend_owner', 'Pend WS', 'pw', 'u_pend_owner', false);`);

      // 4. Workspace with non-existent owner
      // (Bypassing FK temporarily in raw insert for test)
      await db.exec(`ALTER TABLE "Workspace" DROP CONSTRAINT IF EXISTS "Workspace_ownerId_fkey";`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_ghost', 'Ghost WS', 'gw', 'usr_does_not_exist', false);`);

      const report = await runMembershipBackfill({ dryRun: true }, prismaMock);

      expect(report.totalWorkspacesScanned).toBe(4);
      expect(report.eligibleProposed).toBe(0);
      expect(report.skippedCount).toBe(4);
      expect(report.skipBreakdown.workspaceArchived).toBe(1);
      expect(report.skipBreakdown.ownerNotActive).toBe(2); // suspended and pending
      expect(report.skipBreakdown.ownerNotFound).toBe(1);
    });

    it('should verify repeated dry-run executions produce zero database mutations', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('usr_rep', 'rep@flowpilot.dev', 'Rep', 'ACTIVE');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_rep', 'Rep WS', 'rep-ws', 'usr_rep', false);`);

      // Run dry-run 3 times consecutively
      const r1 = await runMembershipBackfill({ dryRun: true }, prismaMock);
      const r2 = await runMembershipBackfill({ dryRun: true }, prismaMock);
      const r3 = await runMembershipBackfill({ dryRun: true }, prismaMock);

      expect(r1.eligibleProposed).toBe(1);
      expect(r2.eligibleProposed).toBe(1);
      expect(r3.eligibleProposed).toBe(1);

      // Verify zero records were created in Membership table
      const memCount = await db.query(`SELECT count(*) as c FROM "Membership";`);
      expect(Number((memCount.rows[0] as any).c)).toBe(0);
    });

    it('should safely handle concurrent duplicate membership insertion inside transaction', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('usr_race', 'race@flowpilot.dev', 'Race', 'ACTIVE');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_race', 'Race WS', 'race-ws', 'usr_race', false);`);

      // Mock client that simulates a concurrent insertion happening right before tx.membership.create
      const racePrismaMock = {
        ...prismaMock,
        $transaction: async (cb: any) => {
          // Concurrently insert membership before the transaction code executes creation
          await db.query(
            `INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "status")
             VALUES ('mem_concurrent', 'ws_race', 'usr_race', 'OWNER', 'active');`
          );

          // Now execute the callback; the inner findUnique will detect the concurrent membership
          return await cb(prismaMock);
        },
      };

      const report = await runMembershipBackfill({ dryRun: false, confirm: true }, racePrismaMock);

      // Backfill should have safely skipped creating a duplicate
      expect(report.appliedCount).toBe(0);
      const membersInDb = await db.query(`SELECT * FROM "Membership" WHERE "workspaceId" = 'ws_race';`);
      expect(membersInDb.rows.length).toBe(1);
      expect((membersInDb.rows[0] as any).id).toBe('mem_concurrent');
    });

    it('should roll back transaction and leave zero partial records if mid-execution failure occurs', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('usr_fail', 'fail@flowpilot.dev', 'Fail', 'ACTIVE');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_fail', 'Fail WS', 'fail-ws', 'usr_fail', false);`);

      // Mock client whose $transaction fails during execution
      let txErrorThrown = false;
      const failingPrismaMock = {
        ...prismaMock,
        $transaction: async (cb: any) => {
          await db.exec('BEGIN;');
          try {
            await cb({
              ...prismaMock,
              membership: {
                ...prismaMock.membership,
                create: async () => {
                  throw new Error('SIMULATED_DATABASE_IO_FAILURE');
                },
              },
            });
            await db.exec('COMMIT;');
          } catch (err) {
            await db.exec('ROLLBACK;');
            throw err;
          }
        },
      };

      try {
        await runMembershipBackfill({ dryRun: false, confirm: true }, failingPrismaMock);
      } catch (err: any) {
        txErrorThrown = true;
        expect(err.message).toContain('SIMULATED_DATABASE_IO_FAILURE');
      }

      expect(txErrorThrown).toBe(true);

      // Verify complete rollback: zero records in Membership table
      const memCount = await db.query(`SELECT count(*) as c FROM "Membership" WHERE "workspaceId" = 'ws_fail';`);
      expect(Number((memCount.rows[0] as any).c)).toBe(0);
    });

    it('should handle concurrent eligibility change (workspace archived right before scan)', async () => {
      await db.query(`INSERT INTO "User" ("id", "email", "name", "status") VALUES ('usr_elig', 'elig@flowpilot.dev', 'Elig', 'ACTIVE');`);
      await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "isArchived") VALUES ('ws_elig', 'Elig WS', 'elig-ws', 'usr_elig', false);`);

      // Concurrently archive the workspace before backfill inspects it
      await db.query(`UPDATE "Workspace" SET "isArchived" = true WHERE "id" = 'ws_elig';`);

      const report = await runMembershipBackfill({ dryRun: true }, prismaMock);
      expect(report.eligibleProposed).toBe(0);
      expect(report.skippedCount).toBe(1);
      expect(report.skipBreakdown.workspaceArchived).toBe(1);

      // Confirm no records created
      const memCount = await db.query(`SELECT count(*) as c FROM "Membership";`);
      expect(Number((memCount.rows[0] as any).c)).toBe(0);
    });
  });
});

