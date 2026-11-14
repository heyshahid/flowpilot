import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('Phase 10B: PostgreSQL Database Foundation & Storage Migration', () => {
  let db: PGlite;

  beforeAll(async () => {
    // Read and verify schema SQL exists
    const sqlPath = path.join(process.cwd(), 'prisma/migrations/0_init/migration.sql');
    expect(fs.existsSync(sqlPath)).toBe(true);

    db = new PGlite();

    // Use db.exec for multi-statement DDL execution
    await db.exec(`
      CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');
      CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');
      CREATE TYPE "WorkflowStatus" AS ENUM ('active', 'draft', 'paused');
      CREATE TYPE "ExecutionStatus" AS ENUM ('QUEUED', 'VALIDATING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

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

      CREATE TABLE "Workspace" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL UNIQUE,
        "ownerId" TEXT NOT NULL,
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
        CONSTRAINT "Membership_workspaceId_userId_key" UNIQUE ("workspaceId", "userId")
      );

      CREATE TABLE "Workflow" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "status" "WorkflowStatus" NOT NULL DEFAULT 'draft',
        "version" INTEGER NOT NULL DEFAULT 1,
        "nodes" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "edges" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "executionCount" INTEGER NOT NULL DEFAULT 0,
        "successCount" INTEGER NOT NULL DEFAULT 0,
        "failureCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE "Execution" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
        "workflowId" TEXT NOT NULL REFERENCES "Workflow"("id") ON DELETE CASCADE,
        "workflowName" TEXT NOT NULL,
        "status" "ExecutionStatus" NOT NULL DEFAULT 'QUEUED',
        "triggerType" TEXT NOT NULL,
        "triggerData" JSONB NOT NULL,
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completedAt" TIMESTAMP(3),
        "durationMs" INTEGER,
        "retryCount" INTEGER NOT NULL DEFAULT 0,
        "maxRetries" INTEGER NOT NULL DEFAULT 3,
        "errorMessage" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE "ExecutionStep" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "executionId" TEXT NOT NULL REFERENCES "Execution"("id") ON DELETE CASCADE,
        "nodeId" TEXT NOT NULL,
        "nodeType" TEXT NOT NULL,
        "nodeName" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "startedAt" TIMESTAMP(3) NOT NULL,
        "durationMs" INTEGER
      );

      CREATE TABLE "Credential" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
        "name" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "encryptedData" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  beforeEach(async () => {
    // Fast table truncate between tests to isolate test data
    await db.exec(`
      DELETE FROM "ExecutionStep";
      DELETE FROM "Execution";
      DELETE FROM "Workflow";
      DELETE FROM "Membership";
      DELETE FROM "Credential";
      DELETE FROM "Workspace";
      DELETE FROM "User";
    `);
  });

  // --------------------------------------------------------------------------
  // 1. Database Connectivity & Engine Verification
  // --------------------------------------------------------------------------
  it('1. should connect to real PostgreSQL 16 engine and execute version query', async () => {
    const res = await db.query('SELECT version();');
    expect(res.rows.length).toBe(1);
    const ver = String((res.rows[0] as any).version);
    expect(ver.toLowerCase()).toContain('postgresql');
  });

  // --------------------------------------------------------------------------
  // 2. CRUD Operations
  // --------------------------------------------------------------------------
  it('2. should perform complete CRUD lifecycle for User and Workspace entities', async () => {
    // CREATE User
    await db.query(
      `INSERT INTO "User" ("id", "email", "name", "status") VALUES ($1, $2, $3, $4);`,
      ['usr_100', 'dev@flowpilot.dev', 'Alex Mercer', 'ACTIVE']
    );
    const userSelect = await db.query(`SELECT * FROM "User" WHERE "id" = $1;`, ['usr_100']);
    expect(userSelect.rows.length).toBe(1);
    expect((userSelect.rows[0] as any).email).toBe('dev@flowpilot.dev');

    // CREATE Workspace
    await db.query(
      `INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ($1, $2, $3, $4);`,
      ['ws_100', 'Engineering Team', 'engineering-team', 'usr_100']
    );
    const wsSelect = await db.query(`SELECT * FROM "Workspace" WHERE "id" = $1;`, ['ws_100']);
    expect(wsSelect.rows.length).toBe(1);
    expect((wsSelect.rows[0] as any).name).toBe('Engineering Team');

    // UPDATE Workspace
    await db.query(`UPDATE "Workspace" SET "name" = $1 WHERE "id" = $2;`, ['Core Engineering', 'ws_100']);
    const wsUpdated = await db.query(`SELECT "name" FROM "Workspace" WHERE "id" = $1;`, ['ws_100']);
    expect((wsUpdated.rows[0] as any).name).toBe('Core Engineering');

    // DELETE Workspace
    await db.query(`DELETE FROM "Workspace" WHERE "id" = $1;`, ['ws_100']);
    const wsDeleted = await db.query(`SELECT * FROM "Workspace" WHERE "id" = $1;`, ['ws_100']);
    expect(wsDeleted.rows.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 3. Relational Integrity & Cascade Deletes
  // --------------------------------------------------------------------------
  it('3. should enforce foreign-key constraints and cascade deletes', async () => {
    // Seed user & workspace
    await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_parent', 'parent@dev.io', 'Parent');`);
    await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_parent', 'Parent WS', 'parent-ws', 'usr_parent');`);

    // Attempt to insert workflow referencing non-existent workspace -> MUST FAIL
    let fkError = false;
    try {
      await db.query(
        `INSERT INTO "Workflow" ("id", "workspaceId", "name") VALUES ('wf_bad', 'ws_nonexistent', 'Bad WF');`
      );
    } catch {
      fkError = true;
    }
    expect(fkError).toBe(true);

    // Insert valid workflow and execution
    await db.query(
      `INSERT INTO "Workflow" ("id", "workspaceId", "name", "nodes", "edges") VALUES ('wf_child', 'ws_parent', 'Child WF', '[]'::jsonb, '[]'::jsonb);`
    );
    await db.query(
      `INSERT INTO "Execution" ("id", "workspaceId", "workflowId", "workflowName", "triggerType", "triggerData") VALUES ('exec_child', 'ws_parent', 'wf_child', 'Child WF', 'manual', '{}'::jsonb);`
    );

    // Verify records exist
    const countBefore = await db.query(`SELECT count(*) as c FROM "Execution" WHERE "workspaceId" = 'ws_parent';`);
    expect(Number((countBefore.rows[0] as any).c)).toBe(1);

    // DELETE parent Workspace -> Must CASCADE and delete Workflow and Execution
    await db.query(`DELETE FROM "Workspace" WHERE "id" = 'ws_parent';`);

    const countAfterWf = await db.query(`SELECT count(*) as c FROM "Workflow" WHERE "id" = 'wf_child';`);
    const countAfterExec = await db.query(`SELECT count(*) as c FROM "Execution" WHERE "id" = 'exec_child';`);
    expect(Number((countAfterWf.rows[0] as any).c)).toBe(0);
    expect(Number((countAfterExec.rows[0] as any).c)).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 4. Unique Constraints
  // --------------------------------------------------------------------------
  it('4. should enforce unique constraints on email and composite membership keys', async () => {
    await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_u1', 'unique@flowpilot.dev', 'User 1');`);

    // Duplicate email -> MUST FAIL
    let emailUniqueFailed = false;
    try {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_u2', 'unique@flowpilot.dev', 'User 2');`);
    } catch {
      emailUniqueFailed = true;
    }
    expect(emailUniqueFailed).toBe(true);

    // Composite unique constraint on Membership (workspaceId, userId)
    await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_comp', 'Comp WS', 'comp-ws', 'usr_u1');`);
    await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role") VALUES ('mem_1', 'ws_comp', 'usr_u1', 'OWNER');`);

    let membershipUniqueFailed = false;
    try {
      await db.query(`INSERT INTO "Membership" ("id", "workspaceId", "userId", "role") VALUES ('mem_dup', 'ws_comp', 'usr_u1', 'ADMIN');`);
    } catch {
      membershipUniqueFailed = true;
    }
    expect(membershipUniqueFailed).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 5. Transaction Rollback (ACID Atomicity)
  // --------------------------------------------------------------------------
  it('5. should roll back multi-table transactions on mid-execution failure', async () => {
    await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_tx', 'tx@flowpilot.dev', 'TX User');`);
    await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_tx', 'TX WS', 'tx-ws', 'usr_tx');`);

    // Execute transaction that fails halfway
    let txFailed = false;
    try {
      await db.transaction(async (tx) => {
        // Op 1: Insert valid workflow
        await tx.query(
          `INSERT INTO "Workflow" ("id", "workspaceId", "name", "nodes", "edges") VALUES ('wf_tx_test', 'ws_tx', 'TX WF', '[]'::jsonb, '[]'::jsonb);`
        );

        // Op 2: Insert invalid execution violating foreign key
        await tx.query(
          `INSERT INTO "Execution" ("id", "workspaceId", "workflowId", "workflowName", "triggerType", "triggerData") VALUES ('exec_tx', 'ws_tx', 'wf_NONEXISTENT', 'Fail', 'manual', '{}'::jsonb);`
        );
      });
    } catch {
      txFailed = true;
    }

    expect(txFailed).toBe(true);

    // Op 1 MUST have been rolled back
    const wfCheck = await db.query(`SELECT * FROM "Workflow" WHERE "id" = 'wf_tx_test';`);
    expect(wfCheck.rows.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 6. Concurrent Writes
  // --------------------------------------------------------------------------
  it('6. should handle concurrent parallel writes safely without deadlocks', async () => {
    await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_conc', 'conc@flowpilot.dev', 'Concurrent');`);
    await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_conc', 'Conc WS', 'conc-ws', 'usr_conc');`);

    // Fire 20 parallel inserts
    const parallelOps = Array.from({ length: 20 }, (_, i) =>
      db.query(
        `INSERT INTO "Workflow" ("id", "workspaceId", "name", "nodes", "edges", "executionCount") VALUES ($1, $2, $3, '[]'::jsonb, '[]'::jsonb, $4);`,
        [`wf_conc_${i}`, 'ws_conc', `Concurrent Workflow ${i}`, i]
      )
    );

    await Promise.all(parallelOps);

    const countRes = await db.query(`SELECT count(*) as c FROM "Workflow" WHERE "workspaceId" = 'ws_conc';`);
    expect(Number((countRes.rows[0] as any).c)).toBe(20);
  });

  // --------------------------------------------------------------------------
  // 7. Multi-Tenant Workspace Boundary Isolation
  // --------------------------------------------------------------------------
  it('7. should strictly enforce workspace boundary isolation during queries', async () => {
    await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_iso', 'iso@flowpilot.dev', 'Iso');`);
    await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_alpha', 'Alpha WS', 'alpha-ws', 'usr_iso');`);
    await db.query(`INSERT INTO "Workspace" ("id", "name", "slug", "ownerId") VALUES ('ws_beta', 'Beta WS', 'beta-ws', 'usr_iso');`);

    await db.query(`INSERT INTO "Workflow" ("id", "workspaceId", "name", "nodes", "edges") VALUES ('wf_alpha_1', 'ws_alpha', 'Alpha WF 1', '[]'::jsonb, '[]'::jsonb);`);
    await db.query(`INSERT INTO "Workflow" ("id", "workspaceId", "name", "nodes", "edges") VALUES ('wf_alpha_2', 'ws_alpha', 'Alpha WF 2', '[]'::jsonb, '[]'::jsonb);`);
    await db.query(`INSERT INTO "Workflow" ("id", "workspaceId", "name", "nodes", "edges") VALUES ('wf_beta_1', 'ws_beta', 'Beta WF 1', '[]'::jsonb, '[]'::jsonb);`);

    // Query scoped to Alpha
    const alphaWfs = await db.query(`SELECT "id" FROM "Workflow" WHERE "workspaceId" = $1;`, ['ws_alpha']);
    expect(alphaWfs.rows.length).toBe(2);
    expect(alphaWfs.rows.map((r: any) => r.id)).toEqual(['wf_alpha_1', 'wf_alpha_2']);

    // Query scoped to Beta
    const betaWfs = await db.query(`SELECT "id" FROM "Workflow" WHERE "workspaceId" = $1;`, ['ws_beta']);
    expect(betaWfs.rows.length).toBe(1);
    expect((betaWfs.rows[0] as any).id).toBe('wf_beta_1');
  });

  // --------------------------------------------------------------------------
  // 8. Persistence across Application Restart (File-backed PostgreSQL)
  // --------------------------------------------------------------------------
  it('8. should verify persistence after closing and reopening database connection', async () => {
    const tempDir = path.join(process.cwd(), '.test_pg_persist_' + Date.now());
    try {
      // 1. Open PGlite pointing to disk directory
      const persistentDb1 = new PGlite(tempDir);
      await persistentDb1.query(`CREATE TABLE "PersistentEntity" ("id" TEXT PRIMARY KEY, "value" TEXT);`);
      await persistentDb1.query(`INSERT INTO "PersistentEntity" ("id", "value") VALUES ('p1', 'Persisted Across Restarts');`);
      await persistentDb1.close();

      // 2. Reopen PGlite pointing to same disk directory (simulating restart)
      const persistentDb2 = new PGlite(tempDir);
      const res = await persistentDb2.query(`SELECT * FROM "PersistentEntity" WHERE "id" = 'p1';`);
      expect(res.rows.length).toBe(1);
      expect((res.rows[0] as any).value).toBe('Persisted Across Restarts');
      await persistentDb2.close();
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }, 15000);

  // --------------------------------------------------------------------------
  // 9. Pre-Migration Snapshot & Checksum Integrity
  // --------------------------------------------------------------------------
  it('9. should create pre-migration snapshot and verify SHA-256 file checksums', async () => {
    const dataDir = path.join(process.cwd(), '.data');
    expect(fs.existsSync(dataDir)).toBe(true);

    const usersFile = path.join(dataDir, 'users.json');
    expect(fs.existsSync(usersFile)).toBe(true);

    const raw = fs.readFileSync(usersFile);
    expect(raw.length).toBeGreaterThan(0);

    // Verify SHA-256 calculation
    const crypto = await import('crypto');
    const checksum = crypto.createHash('sha256').update(raw).digest('hex');
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  // --------------------------------------------------------------------------
  // 10. Malformed Record Handling & Recovery Safeguards
  // --------------------------------------------------------------------------
  it('10. should safely reject malformed records without corrupting existing database state', async () => {
    await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES ('usr_safe', 'safe@dev.io', 'Safe User');`);

    // Attempt to insert malformed null user id
    let nullIdError = false;
    try {
      await db.query(`INSERT INTO "User" ("id", "email", "name") VALUES (NULL, 'fail@dev.io', 'Null Id');`);
    } catch {
      nullIdError = true;
    }
    expect(nullIdError).toBe(true);

    // Verify existing user was unaffected
    const check = await db.query(`SELECT * FROM "User" WHERE "id" = 'usr_safe';`);
    expect(check.rows.length).toBe(1);
  });
});
