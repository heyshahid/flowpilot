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
