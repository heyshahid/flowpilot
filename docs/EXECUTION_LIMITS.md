# FlowPilot Execution Quotas, Timeouts & Safety Guardrails

## 1. Overview

To protect backend workers from infinite recursion, catastrophic backoff loops, denial-of-service, and resource exhaustion, FlowPilot enforces strict execution limits at both graph validation time and runtime execution.

---

## 2. Enforced Quotas & Limits

| Guardrail | Threshold | Enforcing Module | Action on Breach |
| :--- | :--- | :--- | :--- |
| **Max Total Execution Duration** | `60,000 ms` (60s) | `ExecutionWorker` (`worker.ts`) | Halted with `Execution timed out` error |
| **Max Node Graph Size** | `500 nodes` | `ExecutionWorker` / `ExecutionPlanner` | Workflow execution rejected |
| **Max Sub-Workflow Depth** | `5 levels` | `subWorkflowDriver` (`subWorkflow.ts`) | Aborted with `MAX_SUBWORKFLOW_DEPTH_EXCEEDED` |
| **Circular Recursion** | Call stack ancestry | `subWorkflowDriver` (`subWorkflow.ts`) | Aborted with `Circular workflow recursion detected` |
| **Max Loop Iterations** | `100` (default), `1,000` (hard cap) | `loopDriver` (`loop.ts`) | Terminated at cap with warning in execution logs |
| **Max Delay / Wait Until** | `30 days` (2,592,000,000 ms) | `delayDriver` / `waitUntilDriver` | Clamped to 30 days max ceiling |
| **Per-Node Step Timeout** | `15,000 ms` (15s) | `NodeRuntimeRegistry` | Aborted via `AbortController` signal |
| **Retry Max Attempts** | `3 attempts` | `ExecutionWorker` (`worker.ts`) | Exponential backoff (`500ms * 2^attempt`) |
| **SSRF Target Protection** | Private/Loopback IPs blocked | `HttpAdapter` (`httpAdapter.ts`) | Request rejected before TCP socket creation |

---

## 3. Graceful Abort Handling

All asynchronous nodes (`logic.delay`, `logic.waitUntil`, `action.httpRequest`, `action.subWorkflow`) accept an `AbortSignal`. If a user triggers execution cancellation via `POST /api/v1/executions/:id/cancel` or a global execution timeout occurs:
1. Active timer handles (`setTimeout`) are cleared immediately.
2. In-flight HTTP fetch connections are aborted via `controller.abort()`.
3. The execution record is persisted with status `cancelled` and an audit reason log.

---

## 4. Current Platform Boundaries & Roadmap Evolution

### A. 60-Second Total Execution Timeout
- **Current Constraint:** Synchronous and background executions are currently capped at 60 seconds (`MAX_EXECUTION_DURATION_MS = 60000`). This ensures worker processes remain responsive, prevent memory leaks, and do not hold zombie Node.js event loops.
- **Durable Execution Roadmap:** Long-running workflows (e.g. waiting days between steps or orchestrating large multi-hour batch runs) will transition to checkpointed durable state machines (similar to Temporal / Inngest / Redis BullMQ). This allows workflows to sleep to disk and resume on worker wake-up without holding memory.

### B. 30-Day Delay Cap
- **Current Constraint:** The `logic.delay` and `logic.waitUntil` drivers enforce a maximum duration of 30 days (`2,592,000,000 ms`). Any delay exceeding this cap is clamped with an operational warning.

### C. Multi-Worker Clustered Locking & Schedule Claiming
- **Current Architecture:** FlowPilot currently uses an in-process concurrency lock (`isTickRunning`) and file-backed JSON store (`.data/schedules.json`) tailored for single-instance container deployments.
- **Production Clustered Recommendation:** When deploying multiple horizontal worker instances behind a load balancer, schedule claiming and locking must transition to shared durable storage using PostgreSQL row-level locks (`SELECT * FROM schedules WHERE next_run_at <= NOW() FOR UPDATE SKIP LOCKED`) or Redis distributed locks (Redlock) to guarantee strictly-once atomic job dispatching.
