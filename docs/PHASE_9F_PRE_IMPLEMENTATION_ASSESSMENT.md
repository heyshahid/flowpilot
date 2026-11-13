# FlowPilot Phase 9F: Pre-Implementation Assessment
## Workspace Usage, Quotas & Configurable Alerts System Architecture

**Author:** Antigravity Engineering  
**Milestone:** Phase 9F Pre-Implementation Assessment  
**Date:** November 13, 2026  
**Status:** Approved for Implementation  

---

### 1. Executive Summary

Phase 9F expands FlowPilot's observability platform from historical analytics (Phases 9A-9C), real-time runtime monitoring (Phase 9D), and integration & AI cost tracking (Phase 9E) into proactive workspace governance:
1. **Workspace Usage Analytics**: Aggregating real persistent consumption across workflows, executions, active schedules, AI token/cost usage, and integration operations.
2. **Configurable Workspace Limits & Quotas**: Administrator-defined resource policies with explicit multi-tier threshold evaluation (`NORMAL`, `WARNING`, `CRITICAL`, `LIMIT_REACHED`) without arbitrary subscription lock-ins.
3. **Configurable Alert Rules & Evaluation Engine**: Flexible rule definition across 5 operational categories with deduplication, cooldown guards, and deterministic incident lifecycle management (`TRIGGERED` → `ACKNOWLEDGED` → `RESOLVED`).
4. **Notification Dispatch & Delivery Audit**: In-app notifications with delivery telemetry, channel metadata, and failure tracking.

---

### 2. Audit of Existing Persistent Data Sources

The implementation strictly grounds all metrics in the existing persistent stores without fabricating usage or creating duplicate storage records:

| Resource Dimension | Underlying Store | Existing Fields & Methods | Assessment / Enhancements for 9F |
| :--- | :--- | :--- | :--- |
| **Workflows** | `WorkflowStore` (`src/lib/storage/workflowStore.ts`) | `getAll(workspaceId)`, `getById()`, `status` ('active' \| 'draft' \| 'paused') | Real count of total and active workflows per workspace. |
| **Executions** | `ExecutionStore` (`src/lib/storage/executionStore.ts`) | `list({ workspaceId, limit: 1000 })`, status, startedAt, durationMs | Filter executions by time window (7d, 30d, 90d, custom) to measure throughput and failure rates. |
| **Schedules** | `ScheduleStore` (`src/lib/storage/scheduleStore.ts`) | `list({ workspaceId, status })` | Measure active vs. paused schedules per workspace. |
| **AI Usage & Cost** | `AIUsageStore` (`src/lib/storage/aiUsageStore.ts`) & `AIPricingManager` | `getRawLogs(workspaceId)`, tokens, durationMs, versioned pricing | Aggregate actual prompt/completion tokens, total requests, and estimated USD cost. Missing pricing flagged as unpriced. |
| **Integration Ops** | `IntegrationHealthService` (`src/core/analytics/integrationHealthService.ts`) & `WebhookStore` | `getWorkspaceOperations(workspaceId)`, webhooks + step traces | Aggregate total inbound webhooks and outbound integration step executions. |
| **Credentials** | `CredentialStore` (`src/lib/storage/credentialStore.ts`) | `list({ workspaceId })`, status ('valid' \| 'invalid' \| 'untested') | Count configured credentials and health distribution per workspace. |

---

### 3. Missing Measurements & Architectural Safeguards

1. **No Artificial Plan Enforcement**: FlowPilot workspaces contain a `plan` field, but limits must never be hardcoded to fixed tiers. Each workspace maintains an admin-configurable `WorkspaceLimits` record.
2. **No Destructive Action on Limit Reached**: When a limit is reached or exceeded, FlowPilot flags the state as `LIMIT_REACHED` or `CRITICAL` and alerts administrators. It never silently deletes, pauses, or damages user workflows.
3. **Evaluation Idempotency & Cooldown**: The rule evaluation engine computes deterministic deduplication keys (`dedupKey = hash(workspaceId + ruleId + targetId + metric)`) and respects a configurable cooldown window (e.g. 15 to 1440 minutes) to prevent notification storms.
4. **Notification Telemetry**: External delivery providers (email, webhook, Slack) are audited. When no external provider is configured or fails, in-app notifications are persisted with explicit `FAILED` or `NOT_CONFIGURED` status rather than claiming false success.
5. **Multi-Tenant Security & Isolation**: All endpoints verify workspace boundaries via `AuthContextManager.resolve(req)` and enforce fine-grained RBAC permissions. Cross-tenant access triggers 404/403 responses.

---

### 4. Proposed Architecture & Component Design

```
+-----------------------------------------------------------------------------------+
|                                 FLOWPILOT CORE                                    |
|                                                                                   |
|  [ UsageService ] <---+--- WorkflowStore (workflows count & status)               |
|                       +--- ExecutionStore (executions & concurrency)             |
|                       +--- ScheduleStore (active schedules)                       |
|                       +--- AIUsageStore + PricingManager (tokens & cost)          |
|                       +--- IntegrationHealthService + WebhookStore (ops)          |
|                       +--- CredentialStore (credentials count & health)           |
|                               |                                                   |
|                               v                                                   |
|                     [ WorkspaceLimitsStore ]                                      |
|                 (Admin-configurable thresholds)                                   |
|                               |                                                   |
|                               v                                                   |
|                     [ AlertRuleEngine ]                                           |
|       (Evaluates rules, calculates thresholds, enforces cooldown)                 |
|                               |                                                   |
|                 +-------------+-------------+                                     |
|                 |                           |                                     |
|                 v                           v                                     |
|      [ AlertIncidentStore ]       [ NotificationStore ]                           |
|      (Incident Lifecycle:         (In-app notifications,                          |
|       TRIGGERED -> ACKNOWLEDGED    delivery audit logs)                           |
|       -> RESOLVED)                          |                                     |
|                 |                           |                                     |
|                 +-------------+-------------+                                     |
|                               v                                                   |
|                     [ AuditLogStore ]                                             |
|        (Audit trail for limits, rules, and incident changes)                      |
+-----------------------------------------------------------------------------------+
```

---

### 5. Implementation Roadmap

1. **RBAC & Authorization Matrix Extension**:
   - Add `usage:read`, `quota:read`, `quota:manage`, `alert:read`, `alert:manage`.
2. **Domain Models & Contracts**:
   - `src/core/usage/types.ts` & `src/core/alerts/types.ts`.
3. **Storage Implementations**:
   - `WorkspaceLimitsStore`, `AlertRuleStore`, `AlertIncidentStore`, `NotificationStore`.
4. **Core Services**:
   - `UsageService`, `AlertRuleEngine`, `NotificationService`.
5. **REST API Endpoints**:
   - 15 workspace-scoped endpoints with RBAC checks and validation.
6. **Frontend User Interfaces**:
   - `/settings/usage` (Usage metrics, gauges, limit configuration).
   - `/alerts` (Alert rule management, active incidents, notification history).
7. **Comprehensive Automated Test Suite**:
   - `tests/phase9f_workspace_usage_alerts.test.ts`.
8. **Verification & Delivery Documentation**:
   - 6 architecture/guide documents and `PHASE_9F_VERIFICATION_REPORT.md`.

