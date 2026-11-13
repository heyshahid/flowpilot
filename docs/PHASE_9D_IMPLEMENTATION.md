# FlowPilot Phase 9D Implementation Documentation

## Execution Monitoring & Scheduler Health

### 1. Overview
Phase 9D delivers a centralized operational observability and scheduler health monitoring system at `/monitoring`. All metrics derive exclusively from actual persisted execution and schedule records (`executionStore.json`, `schedules.json`, `workers.json`).

---

## 2. Key Modules Implemented

### A. Data Types & Interfaces (`src/core/monitoring/types.ts`)
* `WorkerInstanceRecord`: Worker metadata, health status (`HEALTHY`, `STALE`, `OFFLINE`), uptime, memory usage, PID, queue depth, active concurrency.
* `QueueObservabilityMetric`: Concurrency utilization, queue depth, saturation state.
* `OperationalIncident`: Deduplicated operational alert with severity (`CRITICAL`, `WARNING`, `INFO`), occurrence count, and audit execution IDs.
* `MonitoredExecutionItem`: Sanitized execution summary with timeout/stuck indicators and step progress.
* `MonitoredScheduleItem`: Schedule health, cadence, missed run flags, lapse duration, and last execution correlation.
* `UpcomingScheduledRun`: Upcoming run queue with live countdown timers.

### B. Worker Heartbeat Engine (`src/core/monitoring/workerHeartbeat.ts`)
* Implements genuine worker heartbeat persistence in `.data/workers.json` via `WorkerStore`.
* Dynamically evaluates worker status against current timestamp (`HEALTHY` $\le 30$s, `STALE` $30-90$s, `OFFLINE` $>90$s).
* Tracks real queue depth and running concurrency from `ExecutionQueue`.

### C. Execution Monitor (`src/core/monitoring/executionMonitor.ts`)
* Evaluates active executions (`RUNNING`, `VALIDATING`, `QUEUED`, `WAITING`) vs. terminal executions (`COMPLETED`, `FAILED`, `CANCELLED`).
* Regex-based timeout detection (`timeout`, `504`, `ETIMEDOUT`) and execution limit detection ($>60$s duration).
* Stuck execution detection ($>15$ minutes in active state without progress).
* Sanitizes error strings and strips sensitive inputs, outputs, credentials, and bearer tokens.

### D. Scheduler Monitor (`src/core/monitoring/schedulerMonitor.ts`)
* Queries persisted schedule records from `scheduleStore`.
* Identifies missed schedules when `nextRunAt < now - 60s` and no corresponding execution was recorded.
* Builds upcoming execution queue with real countdown seconds.
* Correlates schedules with execution records to compute recent success rates and last terminal statuses.

### E. Operational Alert Detector (`src/core/monitoring/alertDetector.ts`)
* Evaluates 5 incident categories: repeated workflow failures ($3+$ consecutive failures), execution timeouts, stuck executions, missed schedules, and worker offline/stale states.
* Enforces deterministic deduplication via `dedupKey` to prevent alert spam for ongoing incidents.

### F. REST API Endpoints
* `GET /api/v1/monitoring/overview`: High-level monitoring summary across all modules.
* `GET /api/v1/monitoring/executions`: Paginated, multi-filter execution feed.
* `GET /api/v1/monitoring/schedules`: Scheduler health and upcoming queue.
* `GET /api/v1/monitoring/workers` & `POST`: Worker heartbeat and queue metrics.
* `GET /api/v1/monitoring/alerts`: Deduplicated operational alerts.
* All routes enforce tenant isolation (`AuthContextManager.resolve`) and return HTTP 404 for unauthorized cross-workspace queries.

### G. User Interface Components
* `src/app/(dashboard)/monitoring/page.tsx`: Main dashboard with live polling controls (5s, 10s, 30s, 60s, or manual) and page visibility awareness.
* `MonitoringSummaryCards.tsx`: Top KPI summary cards.
* `LiveExecutionTable.tsx`: Filterable execution feed with live status badges.
* `SchedulerHealthCard.tsx`: Active/missed schedules and upcoming queue.
* `WorkerHealthCard.tsx`: Worker heartbeat card with memory, uptime, and queue metrics.
* `OperationalAlertsPanel.tsx`: Deduplicated incident cards.
* `AppSidebar.tsx`: Added `Monitoring` navigation item with "Live" badge.

