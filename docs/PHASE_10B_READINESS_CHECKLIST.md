# FlowPilot Phase 10B: Database & Persistent Storage Readiness Checklist

**Document Version:** 1.0.0  
**Milestone Target:** Phase 10B — Database & Persistent Storage  
**Repository:** `flowpilot`  
**Active Branch:** `v1-development`  
**Date:** November 14, 2026  
**Status:** **Prerequisite Checklist — Awaiting Formal Approval to Begin Phase 10B**  

---

## 1. Confirmed Engineering Findings (Audited Facts)

- [x] **Next.js Version Discrepancy Resolved:**
  - `package.json` specifies `"next": "^15.1.7"` (semver constraint).
  - `package-lock.json` and `node_modules/next/package.json` resolve to **`15.5.29`** (actual compiled runtime).
  - Discrepancy reconciled: Both reports referenced valid points; `15.5.29` is the active engine.
- [x] **Storage Mechanism Audit:**
  - Exactly 19 of 20 storage modules in `src/lib/storage/` rely on flat `.data/*.json` files using synchronous `fs.writeFileSync`.
  - Exactly 1 store (`workflowStore.ts`) uses an in-memory array with optional client `localStorage` fallback; server-side workflow changes are lost on process reboot.
  - Zero ACID transaction guarantees, no foreign-key cascades, no connection pooling, and severe risk of JSON file corruption during concurrent operations.
- [x] **Execution & Queue Audit:**
  - `src/core/execution/queue.ts` uses an in-memory FIFO queue (`queue: string[]`) and `running: Set<string>`.
  - Queued executions are wiped out on server reboot or deployment.
  - In serverless hosting (e.g. Vercel), background promises freeze or terminate when HTTP responses finish.
- [x] **Scheduler Health Audit:**
  - `SchedulerEngine` runs on a single-node `setInterval` timer with an in-memory lock set (`inFlightSchedules`).
  - Deploying multiple server containers causes duplicate cron job execution across nodes.
- [x] **Authentication Audit:**
  - `AuthContextManager.resolve()` trusts incoming client headers (`x-user-id`, `x-workspace-id`) with fallback to `usr_owner` and `ws_default`.
  - Susceptible to direct header impersonation; no password hashing, salt, or session token verification in place.
- [x] **Integration Adapters Audit:**
  - Google Sheets, Slack, and Telegram adapters validate credentials or syntax, but their action execution returns mock payloads rather than calling live provider REST APIs.
- [x] **Regression Test Baseline:**
  - Complete 16 test suites passing (240/240 tests) with 0 failures, 107 production routes.

---

## 2. Proposed Architecture Decisions (Under Review)

- [ ] **ADR-001 (Relational Database & ORM):**
  - **Proposed:** PostgreSQL 16 with Prisma ORM.
  - **Status:** Recommended by engineering team. Awaiting owner sign-off.
- [ ] **ADR-002 (Distributed Queue & Worker):**
  - **Proposed:** Redis 7.2 with BullMQ for asynchronous DAG execution.
  - **Status:** Recommended. Awaiting owner sign-off.
- [ ] **ADR-003 (Distributed Scheduling & Locking):**
  - **Proposed:** BullMQ Repeatable Jobs with Redis Redlock / distributed locks.
  - **Status:** Recommended. Awaiting owner sign-off.
- [ ] **ADR-004 (Authentication & Session Strategy):**
  - **Proposed:** Custom database-backed session table with Argon2id password hashing and `__Host-` HTTP-only cookies.
  - **Status:** Recommended. Awaiting owner sign-off.
- [ ] **ADR-005 (Commercial Billing Gateway):**
  - **Proposed:** Stripe Billing (or Merchant of Record such as LemonSqueezy/Paddle) via an abstract billing adapter interface.
  - **Status:** Pending commercial business evaluation.

---

## 3. Unresolved Decisions (Must Be Resolved Before Public Launch)

- [ ] **Business Jurisdiction & Legal Entity:**
  - Decision required on country of incorporation to determine direct Stripe eligibility vs. Merchant of Record (LemonSqueezy/Paddle).
- [ ] **Target Cloud Hosting Provider:**
  - Decision required between managed container PaaS (Railway / Render) vs. enterprise cloud (AWS ECS Fargate / GCP Cloud Run).
- [ ] **Commercial Subscription Pricing & Allowances:**
  - Final price points and quota thresholds for Free, Pro, Team, and Enterprise tiers must be finalized before Phase 10F.
- [ ] **Transactional Email Provider:**
  - Selection between Resend, SendGrid, Postmark, or AWS SES for customer verification emails and alert delivery.

---

## 4. External Dependencies

- [ ] **Managed PostgreSQL Database Instance:**
  - A provisioned PostgreSQL 16 database connection string (`DATABASE_URL` and `DIRECT_URL`) for migration testing.
- [ ] **Managed Redis Instance:**
  - A provisioned Redis connection string (`REDIS_URL`) for queue testing.
- [ ] **Master Vault Encryption Key:**
  - 32-byte cryptographically secure random string (`FLOWPILOT_ENCRYPTION_KEY`) for credential vault encryption.
- [ ] **Domain & SSL Certificate:**
  - Production domain DNS control for Cloudflare SSL termination (deferred to Phase 10I).

---

## 5. Security & Data Integrity Risks

- [ ] **JSON Data Loss During Migration:**
  - *Mitigation:* Mandatory automated backup of `.data/` directory to `.data_backup_<timestamp>/` before executing schema migrations.
- [ ] **Cross-Tenant Data Leakage:**
  - *Mitigation:* Enforce `workspaceId` foreign keys on all multi-tenant tables; prepare PostgreSQL Row-Level Security (RLS) policies.
- [ ] **Credential Compromise:**
  - *Mitigation:* AES-256-GCM encrypted credentials in `credentialStore.json` must be migrated with their encryption envelopes preserved; no plaintext storage.
- [ ] **Breaking Existing Test Suites:**
  - *Mitigation:* Introduce a dual-persistence repository layer during Phase 10B so that existing tests continue to pass 240/240 without mocking regressions.

---

## 6. Implementation Prerequisites for Phase 10B

Before executing any Phase 10B code:
1. [ ] Project Owner approval of `docs/PHASE_10_PRODUCTION_ARCHITECTURE.md`.
2. [ ] Project Owner approval of this readiness checklist.
3. [ ] Provisioning of a PostgreSQL 16 local or staging connection string in `.env.local`.
4. [ ] Installation of `@prisma/client` and `prisma` CLI as dev dependencies.
5. [ ] Creation of pre-migration backup of existing `.data/` directory.
6. [ ] Implementation of `scripts/migrate-json-to-pg.ts` with checksum parity verification.
7. [ ] Verification that all 240 tests pass before and after Phase 10B database integration.
