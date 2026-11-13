# FlowPilot Workspace Usage Analytics Architecture

**Milestone:** Phase 9F — Module 9F-A  
**Target:** Holistic Workspace Resource Tracking and Telemetry  
**Route:** `/settings/usage`  
**Endpoint:** `GET /api/v1/workspaces/[id]/usage`, `GET /api/v1/workspaces/[id]/usage/trends`  

---

### 1. Architectural Overview

The Workspace Usage Analytics system aggregates actual, persisted platform activity across all core subsystems without duplicating records or fabricating estimates:

```
+---------------------------------------------------------------------------------+
|                                 WORKSPACE SCOPE                                 |
|                                                                                 |
|  [ Workflows ] -------------------> WorkflowStore (total, active, paused, draft)|
|  [ Executions ] ------------------> ExecutionStore (runs, terminal, peak conc) |
|  [ Schedules ] -------------------> ScheduleStore (active, paused, completed)   |
|  [ AI Tokens & Cost ] ------------> AIUsageStore + AIPricingManager (versioned) |
|  [ Integration Telemetry ] -------> IntegrationHealthService + WebhookStore     |
|  [ Credential Vault ] ------------> CredentialStore (valid, untested, invalid)  |
|                                         |                                       |
|                                         v                                       |
|                            [ UsageService Aggregate ]                           |
|                                         |                                       |
|                  +----------------------+----------------------+                |
|                  |                                             |                |
|                  v                                             v                |
|         [ Usage Summary KPI ]                      [ Time-Series Trends ]       |
+---------------------------------------------------------------------------------+
```

---

### 2. Time-Window Bucketing & Period Granularity

The usage analytics service supports dynamic time filtering:
* **`7d`**: Rolling 7-day window.
* **`30d`**: Rolling 30-day standard operating window (default).
* **`90d`**: Rolling quarterly audit window.
* **`custom`**: User-specified `from` and `to` ISO timestamps.

Time intervals are half-open `[from, to)` to guarantee strict non-overlapping mathematical aggregation.

---

### 3. Subsystem Aggregation Dimensions

#### Workflows Breakdown
* **Total Workflows**: Total workflows belonging to the workspace.
* **Active Workflows**: Workflows currently deployed and actively listening for triggers.
* **Paused Workflows**: Temporarily disabled workflows.
* **Draft Workflows**: Workflows under visual authoring in the builder.

#### Executions Telemetry
* **Total Runs**: Executions initiated within the selected time window.
* **Terminal Runs**: Sum of `COMPLETED` and `FAILED` executions.
* **Failure Rate**: Calculated strictly as $\frac{\text{failed}}{\text{completed} + \text{failed}} \times 100\%$. If zero terminal runs exist, returns `null` to avoid misleading zero percent metrics.
* **Concurrency Peak**: Overlapping execution intervals computed by tracking simultaneous active run deltas across time.

#### Schedules
* **Active Schedules**: Workflows with active cron or interval triggers.
* **Paused Schedules**: Deactivated schedules.
* **Completed Schedules**: One-time schedules that have finished execution.

#### AI Usage & Versioned Pricing
* **Total AI Requests**: Count of invocations logged to `AIUsageStore`.
* **Prompt & Completion Tokens**: Exact token counters from provider response traces.
* **Estimated Cost (USD)**: Calculated dynamically using `AIPricingManager` based on model version, token rates, and execution timestamp. Unpriced requests are explicitly counted and disclosed.

#### Integration Operations
* **Total Operations**: Aggregated count of inbound webhook requests and outbound integration steps.
* **Webhook Deliveries**: Inbound HTTP payloads ingested via `WebhookStore`.
* **Configured Credentials**: Active connection keys stored in the AES-256-GCM encrypted vault.

---

### 4. REST API Specification

#### `GET /api/v1/workspaces/[id]/usage`
* **RBAC Requirement**: `usage:read`
* **Query Parameters**:
  * `timeWindow`: `'7d' | '30d' | '90d' | 'custom'`
  * `from`: ISO start timestamp (optional)
  * `to`: ISO end timestamp (optional)
* **Response**: Returns `WorkspaceUsageSummary` object containing aggregated KPIs and live limit comparisons.

#### `GET /api/v1/workspaces/[id]/usage/trends`
* **RBAC Requirement**: `usage:read`
* **Query Parameters**:
  * `days`: number of days (default: 30)
* **Response**: Daily time-series array of `UsageTrendPoint` objects with execution counts, AI tokens, AI costs, and integration operations.
