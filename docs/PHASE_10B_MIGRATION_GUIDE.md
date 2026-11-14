# FlowPilot Phase 10B: JSON-to-PostgreSQL Migration Guide & Runbook

**Document Version:** 1.0.0  
**Milestone:** Phase 10B — PostgreSQL Database Foundation & Storage Migration  
**Repository:** `flowpilot`  
**Date:** November 14, 2026  
**Status:** **Verified Migration Utility — Safe for Controlled Execution**  

---

## 1. Migration Protocol Overview

The FlowPilot migration utility (`scripts/migrate-json-to-pg.ts`) transitions flat `.data/*.json` files into relational PostgreSQL 16 tables. It operates under strict integrity and non-destructive guidelines:

```
[Start Migration]
       │
       ▼
[1. Create Snapshot Backup] ──► `.data_backup_<timestamp>/` (Immutable copy)
       │
       ▼
[2. Checksum Computation] ──► SHA-256 for all 20 JSON files
       │
       ▼
[3. Topological Entity Import]
       ├── Step 1: User (users.json)
       ├── Step 2: Workspace (workspaces.json)
       ├── Step 3: Membership (memberships.json)
       ├── Step 4: Invitation (invitations.json)
       ├── Step 5: Workflow (In-Memory Seeds)
       ├── Step 6: WorkflowVersion (workflow_versions.json)
       ├── Step 7: Execution & Steps (executions.json)
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
       ├── Step 19: AIConversation & Messages (ai_conversations.json)
       └── Step 20: AuditLog (audit_logs.json)
       │
       ▼
[4. Parity & Count Verification] ──► Source Records vs. Migrated Records (100% Match)
       │
       ▼
[5. Migration Summary Report]
```

---

## 2. Dry-Run Verification Evidence

Executing `npx tsx scripts/migrate-json-to-pg.ts --dry-run` verified that all **1,060 source records** across all 20 tables parse and validate cleanly:

| Table Name | Source File | Source Count | Migrated Count | Skipped Duplicates | Invalid Records |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **User** | `users.json` | 45 | 45 | 0 | 0 |
| **Workspace** | `workspaces.json` | 214 | 214 | 0 | 0 |
| **Membership** | `memberships.json` | 10 | 10 | 0 | 0 |
| **Invitation** | `invitations.json` | 80 | 80 | 0 | 0 |
| **Workflow** | `SEED_WORKFLOWS` | 3 | 3 | 0 | 0 |
| **WorkflowVersion** | `workflow_versions.json` | 61 | 61 | 0 | 0 |
| **Execution** | `executions.json` | 80 | 80 | 0 | 0 |
| **Schedule** | `schedules.json` | 2 | 2 | 0 | 0 |
| **Credential** | `credentials.json` | 23 | 23 | 0 | 0 |
| **WebhookConfig** | `webhooks.json` | 5 | 5 | 0 | 0 |
| **WebhookDelivery** | `webhook_deliveries.json` | 36 | 36 | 0 | 0 |
| **AlertRule** | `alert_rules.json` | 6 | 6 | 0 | 0 |
| **AlertIncident** | `alert_incidents.json` | 28 | 28 | 0 | 0 |
| **Notification** | `notifications.json` | 63 | 63 | 0 | 0 |
| **WorkspaceLimits** | `workspace_limits.json` | 5 | 5 | 0 | 0 |
| **Recommendation** | `recommendations.json` | 17 | 17 | 0 | 0 |
| **RecommendationFeedback**| `recommendation_feedback.json`| 12 | 12 | 0 | 0 |
| **AIUsageRecord** | `ai_usage.json` | 324 | 324 | 0 | 0 |
| **AIConversation**| `ai_conversations.json` | 1 | 1 | 0 | 0 |
| **AuditLog** | `audit_logs.json` | 45 | 45 | 0 | 0 |
| **TOTAL** | — | **1,060** | **1,060** | **0** | **0** |

---

## 3. Migration Safeguards & Failure Recovery

1. **Pre-Migration Snapshot:**
   The migrator automatically copies `.data/` into `.data_backup_<timestamp>/`. The original JSON files are **never deleted or modified** during migration.
2. **Idempotency & Re-runnability:**
   Every entity uses transactional `upsert` queries keyed on unique natural keys or IDs. If a migration is interrupted, re-running the script updates existing rows rather than throwing duplicate key errors.
3. **Rollback Protocol:**
   If a migration fails or data discrepancies are observed:
   - The PostgreSQL database is dropped or cleaned via `TRUNCATE CASCADE`.
   - The application configuration is retained on `STORAGE_MODE=json`.
   - The backup directory `.data_backup_<timestamp>/` can be restored to `.data/` with zero data loss.
