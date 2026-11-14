# FlowPilot Phase 10B: JSON-to-PostgreSQL Migration Guide & Runbook

**Document Version:** 1.1.0  
**Milestone:** Phase 10B — PostgreSQL Database Foundation & Storage Migration  
**Repository:** `flowpilot`  
**Date:** November 14, 2026  
**Status:** **Verified Migration Utility — Safe for Controlled Execution**  

---

## 1. Migration Protocol Overview

The FlowPilot migration utility (`scripts/migrate-json-to-pg.ts`) transitions flat `.data/*.json` files into relational PostgreSQL 16 tables. It operates under strict integrity, idempotency, and non-destructive guidelines:

```
[Start Migration]
       │
       ▼
[1. Create Snapshot Backup] ──► `.data_backup_<timestamp>/` (Immutable copy)
       │
       ▼
[2. Checksum Computation] ──► SHA-256 for all 21 JSON files
       │
       ▼
[3. Topological Entity Import]
       ├── Step 1: User (users.json)
       ├── Step 2: Workspace (workspaces.json)
       ├── Step 3: Membership (memberships.json)
       ├── Step 4: Invitation (invitations.json)
       ├── Step 5: Workflow (SEED_WORKFLOWS / workflows)
       ├── Step 6: WorkflowVersion (workflow_versions.json)
       ├── Step 7: Execution & ExecutionStep (executions.json)
       ├── Step 8: Schedule (schedules.json)
       ├── Step 9: Credential (credentials.json)
       ├── Step 10: WebhookConfig (webhooks.json)
       ├── Step 11: WebhookDelivery (webhook_deliveries.json)
       ├── Step 12: AlertRule (alert_rules.json)
       ├── Step 13: AlertIncident (alert_incidents.json)
       ├── Step 14: Notification (notifications.json)
       ├── Step 15: WorkspaceLimits (workspace_limits.json)
       ├── Step 16: Recommendation (recommendations.json)
       ├── Step 17: RecommendationFeedback (recommendation_feedback.json)
       ├── Step 18: AIUsageRecord (ai_usage.json)
       ├── Step 19: AIConversation & AIMessage (ai_conversations.json)
       └── Step 20: AuditLog (audit_logs.json)
       │
       ▼
[4. Parity & Count Verification] ──► Source Records vs. Migrated Records (100% Match)
       │
       ▼
[5. Migration Summary Report]
```

---

## 2. Store-by-Store Validation Table (Actual Counts)

Executing `npx tsx scripts/migrate-json-to-pg.ts --dry-run` verified that all **899 primary source records** across the 20 migration entities parse, map, and validate cleanly with **0 invalid records**, **0 unmapped fields**, and **0 dropped rows**:

| # | Source Store / File | Source Count | Target Model | Migrated Count | Invalid Records | Unmapped Fields | Relational Constraint Validation | Source SHA-256 Checksum |
| :-: | :--- | :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| 1 | `users.json` | 47 | `User` | 47 | 0 | 0 | Root entity; unique email enforced | `eadab4e3a9437c3ce9d5847863afb54050cc9a4adc9e226a89e2c853eb532d5a` |
| 2 | `workspaces.json` | 5 | `Workspace` | 5 | 0 | 0 | Validated `ownerId` references `User(id)` | `6b68c561b97c564fd688becaebec229c09853aaf54b17cd2bf99ec50643dc556` |
| 3 | `memberships.json` | 16 | `Membership` | 16 | 0 | 0 | Validated `(workspaceId, userId)` composite unique key | `5621af0b003b2b412c63ba4b2c129658afe4d54f2d29e71fdda6dad10e05cfd3` |
| 4 | `invitations.json` | 84 | `Invitation` | 84 | 0 | 0 | Validated `workspaceId` foreign key; token unique | `bc9b5faf6ec62f14662beadcf5f35f5512ce050a2d5b4c8788af3ea6a3b4cdd0` |
| 5 | `SEED_WORKFLOWS` | 3 | `Workflow` | 3 | 0 | 0 | Validated `workspaceId` foreign key; JSONB nodes/edges | *(In-code seed definition)* |
| 6 | `workflow_versions.json` | 63 | `WorkflowVersion` | 63 | 0 | 0 | Validated `workflowId` FK; `(workflowId, version)` unique | `2c6abf582e8b3f214233c1aae4c072690a8edb48a0b8db53d86d8a8f50b48c54` |
| 7 | `executions.json` | 81 | `Execution` & `ExecutionStep` | 81 | 0 | 0 | Validated `workflowId` and `workspaceId` FKs; traces mapped | `a7adee8837294722d95c3a488cf60cd45966fc8fc073df7cd4abf6063418f7d6` |
| 8 | `schedules.json` | 2 | `Schedule` | 2 | 0 | 0 | Validated `workflowId` and `workspaceId` FKs | `bd448620753746e7d2919890f664633e8d9bc5813e5a1e19198f420fe0d38155` |
| 9 | `credentials.json` | 25 | `Credential` | 25 | 0 | 0 | AES-256-GCM ciphertext preserved verbatim | `1c497dea3b2db0009b56a42daca708c52f875254a0d855830b200dc4dbe62c67` |
| 10 | `webhooks.json` | 5 | `WebhookConfig` | 5 | 0 | 0 | Validated `workflowId` FK; token unique | `b862a2a313d2e423261bcac383caedc0093136e584538ec4804e2e596790b7c8` |
| 11 | `webhook_deliveries.json` | 39 | `WebhookDelivery` | 39 | 0 | 0 | Validated `webhookId` foreign key cascade | `be3823513101053fed9a1d3c9700657eb475567bdab5b6f98fc97f13d3b3852d` |
| 12 | `alert_rules.json` | 6 | `AlertRule` | 6 | 0 | 0 | Validated `workspaceId` foreign key | `1ed1b3039e2efc0905abccc9df12ee427caeb1e9ec2384938f5320d11acc3dba` |
| 13 | `alert_incidents.json` | 31 | `AlertIncident` | 31 | 0 | 0 | Validated `ruleId` and `workspaceId` FKs; dedupKey indexed | `4bc7881e09441de5aef77040cb09965058ea2ab50fd7ed1f648021392f034d47` |
| 14 | `notifications.json` | 69 | `Notification` | 69 | 0 | 0 | Validated `workspaceId` foreign key | `a09a18abe0428f88936395ef717324a093c321c033df8d2d8e7f448063e7363e` |
| 15 | `workspace_limits.json` | 5 | `WorkspaceLimits` | 5 | 0 | 0 | Validated `workspaceId` unique foreign key | `6a9b9fe4ed07f93a45beedcd8e9cf75b805dc6a27f6f4d7de950912c502f1371` |
| 16 | `recommendations.json` | 17 | `Recommendation` | 17 | 0 | 0 | Validated `workspaceId` FK; dedupKey unique | `c7393d808add9c779705bbf4bc5ff178f7492ecbb106d23457d8b2c55394bc3c` |
| 17 | `recommendation_feedback.json` | 13 | `RecommendationFeedback` | 13 | 0 | 0 | Validated `recommendationId` and `workspaceId` FKs | `ac353461eee2bf37d2454551c36be8ab641ca5e0d4a0515c927fa4ad1ed5a21e` |
| 18 | `ai_usage.json` | 338 | `AIUsageRecord` | 338 | 0 | 0 | Validated `workspaceId` foreign key; millicents verified | `fe4b791f0f16c44934d15cd7145d12882c919450922768bd07938f61354f5ba4` |
| 19 | `ai_conversations.json` | 1 | `AIConversation` & `AIMessage` | 1 | 0 | 0 | Validated `workspaceId` FK; messages normalized | `2ed6180dce7f8e0aefda59f3bb062922d6c543d352e18eea716cf800e65a76b0` |
| 20 | `audit_logs.json` | 49 | `AuditLog` | 49 | 0 | 0 | Validated `workspaceId` foreign key; immutable events | `a0e0a9cc829b84fb6c8ed257678e824607ed94ec80b92b2318c2bb30824adf5a` |
| **TOTAL** | — | **899** | — | **899** | **0** | **0** | **All 20 Entities 100% Relational Parity** | — |

### 2.1 Auxiliary Files & Deferred Runtime State

Beyond the 20 primary migration stores, `.data/` contains two auxiliary files:
1. **`recommendation_history.json` (33 records, SHA-256: `b52f9914019f9330e5bd232f0c324fe578eafe3249837ad9f8eaeae21b52bd4d`):** Contains historical lifecycle events for recommendations (`FEEDBACK_ADDED`, `DISMISSED`, `SNOOZED`, `REGENERATED`). In Phase 10B, these actions are captured in `RecommendationFeedback` and `Recommendation` timestamps; consolidation into the unified `AuditLog` table will occur during Phase 10C/10E.
2. **`workers.json` (1 record, SHA-256: `bef6e13d24c5bd5efbcaf259392d4c03d5ddf6b75cbe28c748b2944afc8875bf`):** Contains transient heartbeat metadata for the Phase 9B single-node in-process worker process. This runtime state is deliberately excluded from persistent schema tables and will be managed in Redis/BullMQ during Phase 10D (ADR-002: Distributed Execution Queue).

---

## 3. Field-Level Transformations & Security

### 3.1 Credential Encryption Preservation
- FlowPilot credentials stored in `credentials.json` are encrypted using **AES-256-GCM** with authentication tags (`iv:authTag:ciphertext`).
- The migration utility **never decrypts** or logs credentials during ETL; the raw ciphertext is copied directly into `Credential.encryptedData`.
- Encryption key integrity is maintained without exposing plain secrets to migration scripts, database query logs, or memory dumps.

### 3.2 Key Field Renames & Normalizations
- `invitations.json`: Field `token` / `tokenHash` mapped directly to `Invitation.token`.
- `workflow_versions.json`: Field `versionNumber` mapped to `WorkflowVersion.version`; `changeSummary` mapped to `changeLog`.
- `schedules.json`: Field `cronExpression` mapped to `Schedule.cron`.
- `executions.json`: Execution step traces embedded within JSON array are normalized into distinct rows in the `ExecutionStep` table with foreign keys to `Execution(id)`.

---

## 4. Migration Safeguards & Failure Recovery

1. **Pre-Migration Snapshot:**
   The migrator automatically copies `.data/` into `.data_backup_<timestamp>/`. The original JSON files are **never deleted or modified** during migration.
2. **Idempotency & Re-runnability:**
   Every entity uses transactional `upsert` queries keyed on unique natural keys or IDs. If a migration is interrupted, re-running the script updates existing rows rather than throwing duplicate key errors.
3. **Rollback Protocol:**
   If a migration fails or data discrepancies are observed:
   - The PostgreSQL database is cleaned via `TRUNCATE CASCADE`.
   - The application configuration is retained on `STORAGE_MODE=json`.
   - The backup directory `.data_backup_<timestamp>/` can be restored to `.data/` with zero data loss.
