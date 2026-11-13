# FlowPilot Worker Observability & Queue Architecture

## 1. Architectural Baseline: Standalone In-Process Worker

FlowPilot operates on a **Single-Node Standalone Architecture**:
* **Execution Queue:** In-memory FIFO queue managed by `ExecutionQueue` (`src/core/execution/queue.ts`) with a concurrency cap of `maxConcurrency = 5`.
* **Execution Worker:** In-process task processor (`ExecutionWorker` in `src/core/execution/worker.ts`) executing workflows within the Next.js runtime process.
* **Non-Simulated Constraint:** FlowPilot **does not fabricate** multiple distributed cluster nodes or pretend an external message broker (such as Redis Streams, Celery, or RabbitMQ) is present when running standalone.

---

## 2. Heartbeat Instrumentation & Health Evaluation

FlowPilot instruments genuine, persistent worker heartbeats stored in `.data/workers.json`:

### Health State Transitions

| Status | Heartbeat Age ($\Delta t$) | Description | Badge Color |
| :--- | :--- | :--- | :--- |
| **`HEALTHY`** | $\Delta t \le 30\,\text{seconds}$ | Worker actively pulsing, responding to scheduler ticks and processing jobs. | Emerald (Pulse) |
| **`STALE`** | $30\,\text{s} < \Delta t \le 90\,\text{seconds}$ | Delayed heartbeat. Worker process may be experiencing CPU throttling or event-loop lag. | Amber |
| **`OFFLINE`** | $\Delta t > 90\,\text{seconds}$ | No heartbeat received for over 90 seconds. Worker process assumed terminated or crashed. | Rose |

### Emitted Worker Metrics
* `id`: Unique identifier (e.g., `worker_standalone_primary`).
* `type`: `'standalone_in_process'`.
* `lastHeartbeatAt`: ISO 8601 timestamp.
* `startedAt`: Worker initialization timestamp.
* `activeJobsCount`: Number of currently running jobs (`running.size`).
* `queuedJobsCount`: Number of waiting jobs in FIFO queue (`queue.length`).
* `maxConcurrency`: Concurrency limit (`5`).
* `uptimeSeconds`: Process uptime via `process.uptime()`.
* `memoryUsageMb`: Process heap memory usage in megabytes (`process.memoryUsage().heapUsed`).
* `pid`: Process identifier.
* `nodeVersion`: Node runtime version.

---

## 3. Queue Saturation Observability

The monitoring dashboard displays:
* **Saturation Bar:** Percentage of active concurrency slots utilized ($\frac{\text{activeConcurrency}}{\text{maxConcurrency}} \times 100\%$).
* **Queue Depth:** Total count of pending executions waiting for a concurrency slot.
* **Saturation State:** Flags `isSaturated = true` when active concurrency reaches $100\%$.
