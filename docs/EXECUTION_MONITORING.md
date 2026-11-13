# FlowPilot Execution Monitoring Architecture

## 1. Overview & Objectives

The Execution Monitoring subsystem provides FlowPilot administrators and operators with a centralized, real-time operational dashboard at `/monitoring`. It monitors workflow executions across all lifecycle stages—active, waiting, queued, completed, failed, cancelled, and timed-out.

### Core Architecture Principles
1. **Source of Truth:** All execution records originate directly from persisted state in `executionStore.json`. No artificial mock counts or synthetic state overrides are reported.
2. **Lifecycle State Categorization:**
   * **Active Executions:** Composed of `RUNNING` (active CPU execution), `VALIDATING` (graph topological checks), `QUEUED` (waiting in FIFO worker queue), and `WAITING` (delayed by Delay / Wait Until nodes).
   * **Terminal Executions:** Finalized executions (`COMPLETED`, `FAILED`, `CANCELLED`).
3. **Automated Incident & Anomaly Flagging:**
   * **Timeouts:** Regex-detected via `/(timeout|timed out|504|ETIMEDOUT|gateway timeout)/i` in root error strings, step trace errors, or executions exceeding the 60,000ms safety cap.
   * **Stuck Executions:** Active executions residing in `RUNNING`, `VALIDATING`, or `WAITING` states for $>15$ minutes without status progression.
4. **Data Sanitization & Payload Protection:** Strict redaction of input payloads, output records, bearer tokens, and credentials from monitoring feeds.

---

## 2. Server-Side Filtering & Pagination

The execution monitoring service supports multi-dimensional server-side filtering:

| Filter Parameter | Options / Type | Description |
| :--- | :--- | :--- |
| `workspaceId` | string (UUID/slug) | Mandatory tenant boundary. Excludes all executions outside caller's workspace. |
| `workflowId` | string | Filters executions belonging to a specific workflow definition. |
| `status` | `ALL`, `ACTIVE`, `TERMINAL`, `RUNNING`, `QUEUED`, `WAITING`, `COMPLETED`, `FAILED`, `CANCELLED`, `TIMEOUT`, `STUCK` | Selects exact or grouped execution lifecycle states. |
| `triggerType` | `trigger.webhook`, `trigger.schedule`, `trigger.manual` | Filters by initiating trigger adapter. |
| `startDate` / `endDate` | ISO 8601 strings | Filters execution initiation timestamp range. |
| `minDurationMs` / `maxDurationMs` | integer | Filters executions by measured latency thresholds. |
| `search` | string | Free-text search matching execution ID, workflow name, or trigger type. |
| `offset` / `limit` | integers | Safe paginated querying (default `limit: 20`, maximum `limit: 100`). |

---

## 3. Live Polling & Concurrency Controls

FlowPilot implements a resilient, controlled polling architecture:
* **Configurable Cadence:** Operators can select between `5s`, `10s`, `30s`, `60s`, or manual on-demand refresh.
* **Page Visibility Awareness:** Automatically pauses polling when the browser tab is hidden or minimized (`document.visibilityState === 'hidden'`) to eliminate redundant server load.
* **In-Flight Cancellation:** Uses `AbortController` to abort previous in-flight HTTP requests before initiating a new poll tick, preventing race conditions and overlapping requests.
* **Last Updated Indicator:** Displays the exact timestamp of the last successful synchronization.
