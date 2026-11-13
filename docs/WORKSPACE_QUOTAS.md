# FlowPilot Workspace Resource Limits & Quotas

**Milestone:** Phase 9F — Module 9F-B  
**Target:** Administrator-Configurable Resource Ceilings & Threshold Evaluation  
**Route:** `/settings/usage`  
**Endpoint:** `GET /api/v1/workspaces/[id]/limits`, `PUT /api/v1/workspaces/[id]/limits`  

---

### 1. Philosophy & Safeguards

FlowPilot workspace quotas provide administrative control over infrastructure resource consumption without artificial commercial plan lock-in or destructive actions:

1. **No Artificial Plan Enforcement**: Workspaces are not restricted by hardcoded subscription templates. Limits are explicitly configured by organization administrators.
2. **Non-Destructive Enforcement**: Reaching or exceeding a limit never deletes, uninstalls, pauses, or damages user workflows.
3. **Multi-Tier Status States**:
   * **`NORMAL`**: Consumption is below 80% of configured ceiling.
   * **`WARNING`**: Consumption has reached between 80% and 99% of ceiling.
   * **`CRITICAL`**: Consumption is at exactly 100% of ceiling.
   * **`LIMIT_REACHED`**: Consumption has exceeded 100% of ceiling.
   * **`UNLIMITED`**: No limit configured (ceiling is null or 0).
4. **Audit Trail**: Every change to workspace resource quotas is recorded in the append-only `AuditLogStore` with actor information and timestamp.

---

### 2. Configurable Quota Dimensions

| Metric Key | Display Name | Unit | Default Behavior |
| :--- | :--- | :--- | :--- |
| `maxWorkflows` | Total Workflows | workflows | Null (Unlimited) |
| `maxMonthlyExecutions` | Monthly Executions | runs | Null (Unlimited) |
| `maxConcurrentExecutions` | Concurrent Runs | concurrent | Null (Unlimited) |
| `maxActiveSchedules` | Active Schedules | schedules | Null (Unlimited) |
| `maxAiTokensMonthly` | Monthly AI Tokens | tokens | Null (Unlimited) |
| `maxAiCostMonthlyUsd` | Monthly AI Cost | USD ($) | Null (Unlimited) |
| `maxMonthlyIntegrationOps` | Monthly Integration Ops | operations | Null (Unlimited) |

---

### 3. REST API Specification

#### `GET /api/v1/workspaces/[id]/limits`
* **RBAC Requirement**: `quota:read`
* **Response**:
```json
{
  "success": true,
  "data": {
    "workspaceId": "ws_default",
    "maxWorkflows": 50,
    "maxMonthlyExecutions": 5000,
    "maxConcurrentExecutions": 5,
    "maxActiveSchedules": 10,
    "maxAiTokensMonthly": 500000,
    "maxAiCostMonthlyUsd": 25.0,
    "maxMonthlyIntegrationOps": 10000,
    "updatedAt": "2026-11-13T10:00:00.000Z",
    "updatedBy": "usr_owner"
  }
}
```

#### `PUT /api/v1/workspaces/[id]/limits`
* **RBAC Requirement**: `quota:manage` (OWNER, ADMIN)
* **Request Body**:
```json
{
  "maxWorkflows": 60,
  "maxMonthlyExecutions": 6000,
  "maxAiCostMonthlyUsd": 30.0
}
```
* **Audit Action**: `quota.updated` logged with actor context.
