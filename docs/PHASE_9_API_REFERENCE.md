# FlowPilot — Phase 9 API Reference Guide

This reference document catalogs all REST API endpoints delivered across Phase 9 (Analytics, Monitoring, Quotas, Alerts, and Recommendations) in FlowPilot.

---

## Standard Request Headers & Security
- `Authorization: Bearer <token>` or simulated session cookie (`x-user-id`, `x-workspace-id`).
- Content Type: `application/json`
- Tenant Isolation: Every endpoint enforces workspace boundaries. Requests attempting cross-workspace access without authorization return `403 Forbidden` or `404 Not Found`.

---

## 1. Analytics Subsystem (Phases 9A & 9B)

### `GET /api/v1/analytics/overview`
- **Description**: Returns workspace-level summary execution metrics (total, terminal, completed, failed, success/failure rate, mean/median/p95 latency) and duration trends.
- **Permission**: `analytics:read`
- **Query Parameters**:
  - `workspaceId` (optional, defaults to active workspace)
  - `timeWindow` (`24h` | `7d` | `30d` | `90d` | `custom`)
  - `startDate` (ISO 8601 string, required if `timeWindow=custom`)
  - `endDate` (ISO 8601 string, required if `timeWindow=custom`)
- **Response**: `{ success: true, data: ExecutionSummaryMetrics & { durationTrend: TimeSeriesResult } }`

### `GET /api/v1/analytics/workflows`
- **Description**: Returns a paginated list of workflow analytics summaries including execution counts, success rates, and mean durations.
- **Permission**: `analytics:read`
- **Query Parameters**:
  - `workspaceId`, `timeWindow`, `page`, `limit`, `search`, `sortBy` (`name` | `executions` | `successRate` | `duration`)
- **Response**: `{ success: true, data: { items: WorkflowAnalyticsSummaryItem[], pagination: PaginationMetadata } }`

### `GET /api/v1/analytics/workflows/[id]`
- **Description**: Detailed performance metrics for an individual workflow, including historical latency trends, node contribution analysis, and identified problematic nodes.
- **Permission**: `analytics:read`
- **Response**: `{ success: true, data: WorkflowPerformanceReport }`

### `GET /api/v1/analytics/workflows/[id]/executions`
- **Description**: Filtered list of historical executions for a workflow with step trace counts, status, and duration.
- **Permission**: `analytics:read`
- **Response**: `{ success: true, data: { items: ExecutionSummaryRecord[], pagination: PaginationMetadata } }`

---

## 2. Node-Level Diagnostics Subsystem (Phase 9C)

### `GET /api/v1/analytics/workflows/[id]/nodes`
- **Description**: Returns node-level performance metrics (execution counts, unique workflow runs, retry counts, timeout detection, duration contribution ratios, and bottleneck flags) across terminal workflow runs.
- **Permission**: `analytics:read`
- **Response**: `{ success: true, data: WorkflowNodeDiagnosticsResult }`

### `GET /api/v1/analytics/workflows/[id]/nodes/[nodeId]/executions`
- **Description**: Step-level execution trace history for an individual node inside a workflow.
- **Permission**: `analytics:read`
- **Response**: `{ success: true, data: { nodeId: string, traces: StepExecutionTraceDetail[] } }`

---

## 3. Monitoring & Scheduler Subsystem (Phase 9D)

### `GET /api/v1/monitoring/health`
- **Description**: Aggregated operational health dashboard metrics including active execution counts, worker heartbeat status, queue depth, and active incident tallies.
- **Permission**: `monitoring:read`
- **Response**: `{ success: true, data: MonitoringHealthOverview }`

### `GET /api/v1/monitoring/executions`
- **Description**: Real-time execution monitor with status filters (`RUNNING`, `QUEUED`, `FAILED`, `STUCK`), timeout detection, and cancellation capabilities.
- **Permission**: `monitoring:read`
- **Response**: `{ success: true, data: { items: MonitoredExecutionRecord[], pagination: PaginationMetadata } }`

### `GET /api/v1/monitoring/scheduler`
- **Description**: Scheduler health overview, active cron schedule statuses, next run times, and missed execution detection.
- **Permission**: `monitoring:read`
- **Response**: `{ success: true, data: SchedulerHealthOverview }`

---

## 4. Integrations & AI Cost Observability (Phase 9E)

### `GET /api/v1/analytics/integrations/overview`
- **Description**: Overall health metrics across inbound webhooks and outbound third-party integrations (delivery counts, success rate, error taxonomy breakdown).
- **Permission**: `analytics:read`
- **Response**: `{ success: true, data: IntegrationHealthOverview }`

### `GET /api/v1/analytics/integrations/webhooks`
- **Description**: List of inbound webhook deliveries from the rolling 500-record buffer with sanitized headers and latency stats.
- **Permission**: `analytics:read`
- **Response**: `{ success: true, data: { items: WebhookDeliveryRecord[], retentionNotice: string } }`

### `GET /api/v1/analytics/ai-usage/overview`
- **Description**: AI token accounting and estimated cost aggregations broken down by time period and provider.
- **Permission**: `analytics:read`
- **Response**: `{ success: true, data: AIUsageOverviewMetrics }`

### `GET /api/v1/analytics/ai-usage/models`
- **Description**: Usage breakdown by specific AI models, including prompt tokens, completion tokens, estimated spend, and unpriced model flags.
- **Permission**: `analytics:read`
- **Response**: `{ success: true, data: { models: AIModelUsageRecord[] } }`

---

## 5. Workspace Quotas & Alerts (Phase 9F)

### `GET /api/v1/workspaces/[id]/limits`
- **Description**: View workspace resource quotas (max workflows, monthly executions, monthly AI budget).
- **Permission**: `workspace:read`
- **Response**: `{ success: true, data: WorkspaceLimits }`

### `PUT /api/v1/workspaces/[id]/limits`
- **Description**: Configure workspace resource quotas.
- **Permission**: `workspace:manage` (OWNER/ADMIN only)
- **Body**: `{ maxWorkflows?: number, maxMonthlyExecutions?: number, maxAiCostMonthlyUsd?: number }`
- **Response**: `{ success: true, data: WorkspaceLimits }`

### `GET /api/v1/workspaces/[id]/usage`
- **Description**: Real-time quota consumption and percentage utilization.
- **Permission**: `workspace:read`
- **Response**: `{ success: true, data: WorkspaceUsageReport }`

### `GET /api/v1/alerts/rules` & `POST /api/v1/alerts/rules`
- **Description**: List and create configurable alert rules with metric criteria, thresholds, and cooldown durations.
- **Permission**: `alerts:read` (GET) / `alerts:manage` (POST)
- **Response**: `{ success: true, data: AlertRuleRecord }`

### `GET /api/v1/alerts/incidents`
- **Description**: Query active and resolved alert incidents with deduplication status.
- **Permission**: `alerts:read`
- **Response**: `{ success: true, data: { items: AlertIncidentRecord[] } }`

### `POST /api/v1/alerts/incidents/[id]/acknowledge` & `resolve`
- **Description**: Lifecycle state transitions for alert incidents.
- **Permission**: `alerts:manage` (OWNER/ADMIN only)
- **Body**: `{ notes?: string }`
- **Response**: `{ success: true, data: AlertIncidentRecord }`

---

## 6. Optimization Recommendations Engine (Phase 9G)

### `GET /api/v1/recommendations`
- **Description**: Paginated list of optimization recommendations with category, severity, status, and confidence filters.
- **Permission**: `recommendation:read`
- **Response**: `{ success: true, data: { items: OptimizationRecommendation[], pagination: PaginationMetadata } }`

### `GET /api/v1/recommendations/overview`
- **Description**: Summary metrics of recommendations (total active, critical/high/medium counts, category distribution).
- **Permission**: `recommendation:read`
- **Response**: `{ success: true, data: RecommendationOverviewMetrics }`

### `POST /api/v1/recommendations/evaluate`
- **Description**: Triggers an on-demand workspace diagnostic scan across all 8 categories with in-memory concurrency guard.
- **Permission**: `recommendation:evaluate` (OWNER/ADMIN/EDITOR)
- **Response**: `{ success: true, data: EvaluationResultSummary }`

### `GET /api/v1/recommendations/[id]`
- **Description**: Detailed recommendation payload including observed evidence trace, estimated impact, possible explanations, and disclosed limitations.
- **Permission**: `recommendation:read`
- **Response**: `{ success: true, data: OptimizationRecommendation }`

### `POST /api/v1/recommendations/[id]/view`
- **Description**: Marks recommendation status as `VIEWED`.
- **Permission**: `recommendation:read`
- **Response**: `{ success: true, data: OptimizationRecommendation }`

### `POST /api/v1/recommendations/[id]/snooze`
- **Description**: Snoozes a recommendation until a specified future ISO 8601 timestamp.
- **Permission**: `recommendation:manage` (OWNER/ADMIN only)
- **Body**: `{ until: string, reason?: string }`
- **Response**: `{ success: true, data: OptimizationRecommendation }`

### `POST /api/v1/recommendations/[id]/dismiss`
- **Description**: Dismisses a recommendation with mandatory justification.
- **Permission**: `recommendation:manage` (OWNER/ADMIN only)
- **Body**: `{ reason: 'ACCEPTED_RISK' | 'INTENDED_BEHAVIOR' | 'NOT_APPLICABLE' | 'OTHER', notes?: string }`
- **Response**: `{ success: true, data: OptimizationRecommendation }`

### `POST /api/v1/recommendations/[id]/resolve`
- **Description**: Marks a recommendation as `RESOLVED`.
- **Permission**: `recommendation:manage` (OWNER/ADMIN only)
- **Body**: `{ notes?: string }`
- **Response**: `{ success: true, data: OptimizationRecommendation }`

### `GET` & `POST /api/v1/recommendations/[id]/feedback`
- **Description**: Submit or list user helpfulness ratings (`HELPFUL`, `UNHELPFUL`, `INCORRECT`) and comments.
- **Permission**: `recommendation:read` (GET) / `recommendation:feedback` (POST)
- **Body**: `{ type: 'HELPFUL' | 'UNHELPFUL' | 'INCORRECT', comments?: string }`
- **Response**: `{ success: true, data: RecommendationFeedbackRecord }`

### `GET /api/v1/recommendations/[id]/history`
- **Description**: Immutable audit history of state transitions for a recommendation.
- **Permission**: `recommendation:read`
- **Response**: `{ success: true, data: RecommendationHistoryEntry[] }`

