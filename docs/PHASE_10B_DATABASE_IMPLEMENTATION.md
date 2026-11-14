# FlowPilot Phase 10B: Database Implementation & Storage Abstraction Reference

**Milestone:** Phase 10B — PostgreSQL Database Foundation & Storage Migration  
**Repository:** `flowpilot`  
**Active Branch:** `v1-development`  
**Date:** November 14, 2026  
**Status:** **Implemented & Verified in Controlled Development Environment**  

---

## 1. Executive Summary

Phase 10B introduces a production-ready relational database foundation powered by **PostgreSQL 16** and **Prisma ORM**, establishing strict multi-tenant isolation, ACID transaction safety, foreign-key cascade consistency, and comprehensive schema migrations.

The implementation preserves 100% of FlowPilot's completed features and contracts (Phases 1–9), verified by a clean **250/250 test pass rate** (240 regression tests + 10 new PostgreSQL database tests) and a successful production build across all **107 routes**.

---

## 2. Relational Schema Architecture (`prisma/schema.prisma`)

The relational database model replaces the legacy file-backed stores with **25 structured models**, **6 enums**, **25 primary keys**, **28 foreign-key relations**, **13 unique constraints**, and **37 performance/foreign-key indexes**.

### 2.1 Complete Model Inventory (25 Models)

1. **`User`**: Account identity, email, authentication credentials (`passwordHash`), avatar, verification status, and timestamps.
2. **`Session`**: Session state, hashed session token (`tokenHash`), client metadata (IP address, user agent), and expiration.
3. **`Account`**: OAuth provider links (GitHub, Google, custom OIDC) with provider account IDs and access tokens.
4. **`Workspace`**: Multi-tenant isolation container with unique slug, owner reference, archive flag, and Stripe customer link.
5. **`Membership`**: Relates Users to Workspaces with role-based permissions (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`) and composite unique key.
6. **`Invitation`**: Pending workspace invitation tokens, invited email, role assignment, expiration, and acceptance state.
7. **`Workflow`**: Canvas automation definition, workspace scoping, draft/active status, node/edge definitions in native JSONB, execution counters.
8. **`WorkflowVersion`**: Immutable historical workflow version snapshots, version numbers, change logs, and canvas topologies.
9. **`Execution`**: Workflow run instances, lifecycle status (`QUEUED` to `COMPLETED`/`FAILED`), trigger metadata, state transitions.
10. **`ExecutionStep`**: Granular node-level execution traces, input/output data, execution status, and duration metrics.
11. **`WebhookConfig`**: Inbound webhook endpoints, unique URL tokens, SHA-256 HMAC secret hashes, and rate limit definitions.
12. **`WebhookDelivery`**: Audit history of webhook delivery attempts, client IP, response status, payloads, and latency.
13. **`Schedule`**: Workflow cron timers, schedule intervals, enabled status, next run timestamps, and timezone configurations.
14. **`Credential`**: Encrypted third-party integration secrets (`encryptedData` using AES-256-GCM), workspace isolation, and status.
15. **`Subscription`**: Commercial billing state, plan tiers (`FREE`, `PRO`, `TEAM`, `ENTERPRISE`), subscription lifecycle, and Stripe subscription IDs.
16. **`WorkspaceLimits`**: Quota enforcement parameters (max workflows, monthly executions, execution concurrency, retention periods).
17. **`AlertRule`**: Proactive anomaly detection rules, metric targets (failure rate, execution duration, cost), threshold conditions, channels.
18. **`AlertIncident`**: Triggered anomaly events, severity levels, deduplication keys, acknowledgment state, and resolution metadata.
19. **`Notification`**: Dispatched notification messages across email, Slack, and webhook channels with delivery state.
20. **`Recommendation`**: Evidence-based optimization suggestions across the 8 Phase 9G categories, priority/confidence scores, deduplication keys.
21. **`RecommendationFeedback`**: User feedback records (`HELPFUL`, `NOT_HELPFUL`, `INACCURATE`) for recommendation calibration.
22. **`AIUsageRecord`**: Token tracking and expenditure records per model/provider with millicent cost precision.
23. **`AIConversation`**: Thread sessions for the AI workflow assistant and conversational canvas interactions.
24. **`AIMessage`**: Individual user, assistant, and system dialogue messages within assistant conversations.
25. **`AuditLog`**: Tamper-evident operational audit trail recording security events, tenancy changes, and critical resource modifications.

### 2.2 Complete Enum Inventory (6 Enums)

1. **`Role`**: `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`
2. **`AccountStatus`**: `ACTIVE`, `SUSPENDED`, `PENDING_VERIFICATION`
3. **`WorkflowStatus`**: `active`, `draft`, `paused`
4. **`ExecutionStatus`**: `QUEUED`, `VALIDATING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`
5. **`PlanTier`**: `FREE`, `PRO`, `TEAM`, `ENTERPRISE`
6. **`SubscriptionStatus`**: `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `UNPAID`

### 2.3 Constraint & Index Inventory

- **Primary Keys (25):** Every model defines a unique `@id` (cuid or text uuid).
- **Foreign Keys (28):** 28 `@relation` definitions linking child entities to parents, with `onDelete: Cascade` on multi-tenant workspace children.
- **Unique Constraints (13 Total):**
  - Scalar Unique (`@unique`):
    1. `User.email`
    2. `Session.tokenHash`
    3. `Workspace.slug`
    4. `Workspace.stripeCustomerId`
    5. `Invitation.token`
    6. `WebhookConfig.token`
    7. `Subscription.workspaceId`
    8. `Subscription.stripeSubscriptionId`
    9. `WorkspaceLimits.workspaceId`
    10. `Recommendation.dedupKey`
  - Composite Unique (`@@unique`):
    11. `Account(provider, providerAccountId)`
    12. `Membership(workspaceId, userId)`
    13. `WorkflowVersion(workflowId, version)`
- **Indexes (37 Total):** 37 explicit `@@index` directives covering foreign-key lookup paths, tenancy filters (`workspaceId`), sort columns (e.g. `[workspaceId, startedAt(sort: Desc)]`), and deduplication keys.

---

## 3. Storage Abstraction & Repository Pattern

To separate database operations from workflow DAG execution logic and prevent uncontrolled dual writes, FlowPilot introduces a clean repository layer:

### 3.1 Architecture Components (`src/lib/storage/postgres/`):
- `db.ts`: Global singleton database client with `withTenantScope` utility guaranteeing workspace scoping.
- `workflowRepository.ts`: Implements `WorkflowRepository` with workspace-scoped queries, versioning, and dashboard statistics.
- `executionRepository.ts`: Implements `ExecutionRepository` with transaction-safe step trace recording and status transitions.
- `userWorkspaceRepository.ts`: Implements user lookup, workspace tenancy, and composite membership management.

### 3.2 Single Source of Truth Enforcement
In accordance with the conditional approval directive, FlowPilot avoids uncontrolled simultaneous writes to JSON and PostgreSQL:
- **Baseline Stage (Current):** File-backed storage operates as the active source of truth; PostgreSQL repositories operate as the validated target layer.
- **Cutover Stage:** An explicit configuration toggle (`FLOWPILOT_STORAGE_ENGINE=postgres`) activates PostgreSQL as the sole primary storage engine, retaining `.data/` as an immutable snapshot.

---

## 4. Initial Schema Migration (`prisma/migrations/0_init/migration.sql`)

The declarative PostgreSQL DDL migration was generated via `prisma migrate diff`, producing 46.8 KB of clean SQL:
- Custom PostgreSQL Enums: `Role`, `AccountStatus`, `WorkflowStatus`, `ExecutionStatus`, `PlanTier`, `SubscriptionStatus`.
- Primary and Foreign Key constraints with `ON DELETE CASCADE`.
- Composite Unique Indexes: `(workspaceId, userId)` on `Membership`, `(workflowId, version)` on `WorkflowVersion`.
- Performance Indexes: `[workspaceId, startedAt(sort: Desc)]` on `Execution`, `[token]` on `WebhookConfig`, `[dedupKey]` on `AlertIncident` and `Recommendation`.
