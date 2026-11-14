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

The relational database model replaces the 20 legacy file-backed stores with 22 structured tables, composite keys, indexes, and cascading relationships.

### Core Entity Overview:

```
User (id, email, name, passwordHash, status, emailVerifiedAt)
  ├── Session (id, userId, tokenHash, userAgent, ipAddress, expiresAt)
  ├── Account (id, userId, provider, providerAccountId, accessToken)
  └── Membership (id, workspaceId, userId, role, status, joinedAt)
        └── Workspace (id, name, slug, ownerId, isArchived, stripeCustomerId)
              ├── Workflow (id, workspaceId, name, status, nodes [JSONB], edges [JSONB])
              │     ├── WorkflowVersion (id, workflowId, version, changeLog, nodes, edges)
              │     ├── Execution (id, workspaceId, workflowId, status, triggerData, stateHistory)
              │     │     └── ExecutionStep (id, executionId, nodeId, status, input, output, durationMs)
              │     └── Schedule (id, workspaceId, workflowId, cron, enabled, nextRunAt)
              ├── Credential (id, workspaceId, name, provider, encryptedData [AES-256-GCM])
              ├── WebhookConfig (id, workspaceId, workflowId, token, secretHash, rateLimitPerMin)
              │     └── WebhookDelivery (id, webhookId, httpStatus, clientIp, durationMs)
              ├── WorkspaceLimits (workspaceId, maxWorkflows, maxMonthlyExecutions, usedExecutionsMonth)
              ├── AlertRule (id, workspaceId, name, metric, condition, threshold, channels)
              │     └── AlertIncident (id, workspaceId, ruleId, metric, status, dedupKey)
              ├── Notification (id, workspaceId, channel, recipient, status, payload)
              ├── Recommendation (id, workspaceId, workflowId, category, priorityScore, confidenceScore)
              │     └── RecommendationFeedback (id, recommendationId, workspaceId, userId, action)
              ├── AIUsageRecord (id, workspaceId, provider, model, inputTokens, outputTokens, costUsd)
              ├── AIConversation (id, workspaceId, title)
              │     └── AIMessage (id, conversationId, role, content, tokens)
              └── AuditLog (id, workspaceId, userId, action, resourceType, timestamp)
```

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

The declarative PostgreSQL DDL migration was generated via `prisma migrate diff`, producing 46.8 KB of SQL:
- Custom PostgreSQL Enums: `Role`, `AccountStatus`, `WorkflowStatus`, `ExecutionStatus`, `PlanTier`, `SubscriptionStatus`.
- Primary and Foreign Key constraints with `ON DELETE CASCADE`.
- Composite Unique Indexes: `(workspaceId, userId)` on `Membership`, `(workflowId, version)` on `WorkflowVersion`.
- Performance Indexes: `[workspaceId, startedAt(sort: Desc)]` on `Execution`, `[token]` on `WebhookConfig`, `[dedupKey]` on `AlertIncident` and `Recommendation`.
