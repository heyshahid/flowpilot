# FlowPilot Backend Workflow Execution Engine Architecture

## 1. Overview
The FlowPilot Backend Workflow Execution Engine transforms declarative visual workflow DAGs into robust, asynchronous, background-executable jobs. The engine operates independently of the client interface and guarantees that a workflow is never marked successful until every required node has completed with verified output.

---

## 2. Core Execution Lifecycle

### 2.1 Workflow Lifecycle States
A workflow execution transitions through the following formal states:
```
           ┌───────────┐
           │  QUEUED   │
           └─────┬─────┘
                 │
                 ▼
           ┌───────────┐
           │ VALIDATING│
           └─────┬─────┘
                 │
                 ▼
           ┌───────────┐
     ┌────►│  RUNNING  ├─────┐
     │     └─────┬─────┘     │
     │           │           │
┌────┴────┐      ▼           ▼
│ WAITING │ ┌─────────┐ ┌─────────┐
└─────────┘ │COMPLETED│ │ FAILED  │
            └─────────┘ └─────────┘
                 ▲           ▲
                 │           │
                 └─── CANCELLED
```

- **QUEUED:** Job accepted by the API, assigned a unique ID, and placed into the background queue.
- **VALIDATING:** The engine analyzes the workflow topology, checks node requirements, and builds the multi-stage execution plan.
- **RUNNING:** Stages and independent node drivers are executing.
- **WAITING:** The workflow is awaiting an external event, webhook response, or delay timer.
- **COMPLETED:** Terminal state. All reachable nodes executed successfully.
- **FAILED:** Terminal state. A node produced an unhandled error and `continueOnError` was false.
- **CANCELLED:** Terminal state. Aborted mid-flight via user signal.

### 2.2 Node Lifecycle States
Each individual node in the execution plan transitions through:
- **PENDING:** Scheduled for execution.
- **READY:** All prerequisite parent nodes have completed successfully.
- **RUNNING:** Active driver is executing.
- **WAITING:** Paused for delay or asynchronous callback.
- **COMPLETED:** Driver finished execution with valid output.
- **FAILED:** Driver raised an uncaught exception.
- **SKIPPED:** Bypassed due to conditional branch routing (e.g. false branch of an If/Else node).
- **CANCELLED:** Aborted due to workflow cancellation.

---

## 3. Graph Execution Planner & Dependency Resolution
The `ExecutionPlanner` parses the visual graph using Kahn's topological sort:
1. Validates presence of at least one trigger node.
2. Intercepts and rejects cyclic loops (`ExecutionPlanningError`).
3. Groups independent nodes into concurrent **Execution Stages**.
4. Provides branch resolution (`calculateSkippedNodes`): when a conditional node (e.g. `logic.ifElse`) evaluates to `true`, the `false` handle's subtree is automatically marked `SKIPPED`.

---

## 4. Zero-Trust Security & SSRF Protection
The `action.httpRequest` node implements Zero-Trust network validation via `validateOutboundUrl`:
- Blocks all loopback addresses (`localhost`, `127.0.0.1`, `::1`).
- Blocks private IPv4 RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- Blocks link-local and cloud metadata addresses (`169.254.169.254` across AWS, GCP, Azure, DigitalOcean).
- Blocks non-HTTP/HTTPS protocols (`file://`, `ftp://`, `gopher://`).
- Automatically masks sensitive keys (`Authorization`, `password`, `token`, `secret`, `apiKey`) in logged step traces using `maskSensitiveData`.

---

## 5. Built-in Runtime Drivers
| Driver Type | Key Features |
| :--- | :--- |
| `trigger.manual` | Custom variable injection into downstream context. |
| `trigger.webhook` | Inbound payload capture with HTTP method and header passing. |
| `action.httpRequest` | Real HTTP client (`fetch`), SSRF guard, timeout abort, header masking. |
| `logic.ifElse` | Condition evaluation (`equals`, `contains`, `greater_than`, `is_empty`) with dual-branch routing. |
| `data.transform` | Safe transformations: JSON parse/stringify, case conversion, field extraction. |
| `action.sendEmail` | Transactional email delivery adapter with recipient validation and message tracking. |
| `action.sendNotification` | Multi-channel in-app and external notification dispatcher. |
| `ai.textGeneration` | Prompt completion engine with token and model tracking. |
| `logic.delay` | Precise delay timer with graceful `AbortSignal` cancellation support. |

---

## 6. Durable Job Queue & Worker System
- **ExecutionQueue:** Thread-safe, durable in-memory queue backed by filesystem storage (`.data/executions.json`).
- **Concurrency Control:** Configurable worker concurrency limits (default 5 concurrent executions).
- **Graceful Cancellation:** Active executions maintain an `AbortController` map. Calling `/api/v1/executions/:id/cancel` halts in-flight HTTP requests and timers immediately.
- **Retry Manager:** Exponential backoff calculation with jitter for resilient automated recovery.

