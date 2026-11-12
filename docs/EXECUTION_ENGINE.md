# FlowPilot — Execution Engine Specification & Runtime Model

> **Module:** Core Execution Engine  
> **Environment:** Node.js 18+ (Pure TypeScript runtime)  
> **Testing Harness:** Vitest unit & integration tests  
> **Status:** Specification & Reference Implementation (Phase 1)  

---

## 1. Overview & Execution Philosophy

The **FlowPilot Execution Engine** is a deterministic, event-driven runtime responsible for compiling a visual workflow DAG into a safe, traceable execution plan. 

### Core Tenet: True Decoupling
Visual nodes and canvas edges are merely **declarative metadata**. The execution engine runs independently of the browser DOM or React component lifecycle. A workflow can be executed via:
1. Direct backend API call (`/api/v1/workflows/:id/execute`).
2. Webhook trigger (`/api/v1/webhooks/:token`).
3. Scheduled cron daemon.
4. CLI or automated Vitest test suite.

---

## 2. Graph Compilation & Execution Algorithm

```mermaid
flowchart TD
    Start([Workflow Trigger Ingestion]) --> ValidateGraph[1. Graph Topology Validation]
    ValidateGraph --> CheckCycles{Cycle Detected?}
    CheckCycles -- Yes --> TerminateCyclic[Abort: CyclicDependencyError]
    CheckCycles -- No --> TopoSort[2. Topological Sort: Kahn's Algorithm]
    TopoSort --> InitContext[3. Initialize Immutable State Context]
    InitContext --> LoopNodes[4. Process Next Ready Node]
    
    subgraph NodeExecutionSandbox [Node Sandbox Pipeline]
        LoopNodes --> CheckSkipped{Parent Branch Skipped?}
        CheckSkipped -- Yes --> MarkSkipped[Mark Node: SKIPPED]
        CheckSkipped -- No --> ResolveExpressions[Resolve Expressions: {{ $steps.node.val }}]
        ResolveExpressions --> SSRFCheck{Is Outbound HTTP?}
        SSRFCheck -- Yes --> ValidateIP[SSRF Safe Interceptor]
        ValidateIP -- Unsafe --> ThrowSecurity[Abort: SSRFProtectionViolation]
        ValidateIP -- Safe --> ExecuteDriver[Execute Node Driver]
        SSRFCheck -- No --> ExecuteDriver
        ExecuteDriver --> CaptureOutput[Capture Output & Duration]
    end
    
    MarkSkipped --> CheckMoreNodes{More Ready Nodes?}
    CaptureOutput --> CheckMoreNodes
    CheckMoreNodes -- Yes --> LoopNodes
    CheckMoreNodes -- No --> Finalize[5. Save Execution Trace & Complete]
    Finalize --> End([Execution Completed])
```

### 2.1 Cycle Detection & Topological Sorting
The engine applies **Kahn’s Algorithm** on the directed graph $G = (V, E)$:
1. Calculate the in-degree (number of incoming directed edges) for each node $v \in V$.
2. Initialize queue $Q$ with all nodes having in-degree 0 (Triggers).
3. While $Q$ is not empty:
   - Dequeue $u$.
   - Append $u$ to sorted list $L$.
   - For each outgoing edge $(u, v) \in E$:
     - Decrement in-degree of $v$.
     - If in-degree of $v$ becomes 0, enqueue $v$.
4. If length of $L \neq |V|$, a cycle exists in the graph. The engine throws `CyclicWorkflowError` and prevents execution.

---

## 3. Runtime Context & Expression Evaluator

Every execution maintains an isolated, append-only **ExecutionContext**:

```typescript
export interface WorkflowExecutionContext {
  executionId: string;
  workflowId: string;
  trigger: {
    type: string;
    timestamp: string;
    payload: Record<string, unknown>; // e.g. body, query, headers
  };
  steps: Record<string, {
    status: 'completed' | 'failed' | 'skipped';
    output: Record<string, unknown>;
    durationMs: number;
  }>;
  env: Record<string, string>; // Whitelisted runtime variables
}
```

### 3.1 Expression Syntax & Resolution
Node configurations can reference outputs of previous steps using double curly-brace syntax:
- `{{ $trigger.body.customer_email }}`
- `{{ $steps.http_enrichment.data.company_name }}`
- `{{ $steps.formatter.clean_phone }}`

The engine parses expressions with safe AST traversal (no `eval()` or `Function()` constructor), guaranteeing complete protection against arbitrary code execution.

---

## 4. Branching & Conditional Evaluation

For **Logic Nodes** (such as `logic.ifElse` or `logic.switch`):
- An If/Else node possesses two distinct output handles: `true` and `false`.
- The engine evaluates rules based on operators:
  - `equals`, `not_equals`
  - `contains`, `not_contains`
  - `greater_than`, `less_than`
  - `is_empty`, `is_not_empty`
  - `regex_match`
- If condition evaluates to `true`:
  - Outgoing edges from handle `true` are traversed normally.
  - Outgoing edges from handle `false` have their downstream subtrees flagged as `SKIPPED`.

---

## 5. Security Architecture & SSRF Guard

Outbound HTTP requests (e.g. `action.httpRequest`) can be exploited to probe internal microservices, AWS EC2 metadata (`169.254.169.254`), or Kubernetes cluster services (`10.96.0.1`).

FlowPilot enforces a mandatory **SSRF Firewall**:

```typescript
// IP Blocklist Ranges
const FORBIDDEN_RANGES = [
  '0.0.0.0/8',          // Current network
  '10.0.0.0/8',         // Private IPv4 (RFC 1918)
  '127.0.0.0/8',        // Loopback IPv4
  '169.254.0.0/16',     // Link-local / Cloud metadata (AWS, GCP, Azure)
  '172.16.0.0/12',      // Private IPv4 (RFC 1918)
  '192.168.0.0/16',     // Private IPv4 (RFC 1918)
  '::1/128',            // IPv6 Loopback
  'fc00::/7',           // IPv6 Unique Local
  'fe80::/10',          // IPv6 Link-Local
];
```

### Resolution Rules:
1. URL hostname is resolved to IP addresses via DNS query before establishing socket connection.
2. If resolved IP matches any `FORBIDDEN_RANGES` or cloud metadata IP, request is terminated with `SSRFProtectionViolationException`.
3. Disallowed protocols: Only `http:` and `https:` are permitted. `file:`, `ftp:`, `data:`, `gopher:` are strictly rejected.
4. HTTP Redirects: Redirect URLs (`301`, `302`) are re-validated through the same SSRF guard to prevent DNS rebinding or redirect bypass attacks.

---

## 6. Retry & Resilience Mechanism

Nodes can declare retry policies in their configuration:

```typescript
export interface RetryPolicy {
  maxAttempts: number;      // 1 to 5 (default: 1)
  backoffFactor: number;   // default: 2
  initialDelayMs: number;  // default: 1000 ms
  maxDelayMs: number;      // default: 30000 ms
}
```

If an error is transient (e.g., HTTP 429 Too Many Requests, HTTP 503 Service Unavailable, or socket timeouts):
$$\text{delay} = \min(\text{initialDelayMs} \times \text{backoffFactor}^{\text{attempt} - 1}, \text{maxDelayMs})$$

---

## 7. Execution Trace & Audit Log Record

Upon completing a step, the engine emits a structured telemetry trace:

```json
{
  "executionId": "exec_8f91b72a",
  "nodeId": "http_lead_enrich",
  "nodeType": "action.httpRequest",
  "status": "completed",
  "startedAt": "2026-11-12T16:40:00.120Z",
  "durationMs": 342,
  "input": {
    "url": "https://api.hunter.io/v2/email-verifier",
    "params": { "email": "lead@acme.com" }
  },
  "output": {
    "status": 200,
    "body": { "deliverable": true, "score": 98 }
  },
  "error": null
}
```
Sensitive header values (`Authorization`, `X-Api-Key`, `Cookie`) are automatically masked with `[REDACTED]` prior to persistence.
