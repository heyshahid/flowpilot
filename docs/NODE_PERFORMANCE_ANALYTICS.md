# FlowPilot Node Performance Analytics Architecture

## 1. Overview & Objectives

Node Performance Analytics provides granular, trace-level observability for individual nodes within FlowPilot automated workflows. While workflow-level analytics aggregate entire executions into holistic duration and success metrics, Node Performance Analytics decomposes workflows into constituent task blocks to diagnose exact points of latency, failure clusters, retry exhaustion, and timeouts.

### Core Principles
1. **Trace-Backed Ground Truth:** All node metrics originate directly from raw `execution.steps` (`StepExecutionRecord`) persisted in `executionStore.json`. No synthetically fabricated metrics or static approximations are returned.
2. **Execution Attempts vs. Unique Workflow Runs:** Accurately distinguishes `totalExecutionAttempts` (the sum of all loop iterations and retries) from `uniqueWorkflowExecutions` (the count of distinct workflow runs containing the node).
3. **Statistical Latency Distribution:** Measures both mean duration ($\mu$) and median ($p50$) duration, alongside minimum and maximum durations to surface latency skew, outliers, and cold starts.
4. **Data Sanitization & Payload Redaction:** Sensitive node inputs, credentials, API payloads, and response bodies are strictly omitted from client responses.

---

## 2. Metric Specifications & Calculation Logic

| Metric Field | Definition | Mathematical Formula / Source |
| :--- | :--- | :--- |
| `executionCount` / `totalExecutionAttempts` | Total number of times this node attempted execution across all sampled workflow runs. | $N_{attempts} = \sum \text{attempts}(node)$ |
| `uniqueWorkflowExecutions` | Distinct workflow executions that reached and evaluated this node. | $N_{unique} = \left\vert \{ \text{execution.id} \mid node \in \text{execution.steps} \} \right\vert$ |
| `successCount` | Successful terminal attempts (`COMPLETED`). | $N_{success} = \sum (\text{step.status} == \text{'COMPLETED'})$ |
| `failureCount` | Failed terminal attempts (`FAILED`). | $N_{failure} = \sum (\text{step.status} == \text{'FAILED'})$ |
| `skippedCount` | Branch bypasses where node was evaluated but not invoked (`SKIPPED`). | $N_{skipped} = \sum (\text{step.status} == \text{'SKIPPED'})$ |
| `failureRatePercent` | Proportion of non-skipped attempts that resulted in failure. | $\frac{N_{failure}}{N_{success} + N_{failure}} \times 100\%$ (Returns `0` when no failures, `null` when $N = 0$). |
| `meanDurationMs` | Arithmetic average execution latency across non-skipped attempts. | $\mu_{node} = \frac{\sum \text{durationMs}}{N_{invoked}}$ |
| `medianDurationMs` | 50th percentile ($p50$) latency of sorted node durations. | Middle element (or average of two middle elements). |
| `minDurationMs` / `maxDurationMs` | Extremes of observed node durations. | $\min(\text{durations}), \max(\text{durations})$ |
| `durationContributionRatio` | Ratio of node mean duration to total workflow mean duration. | $\frac{\mu_{node}}{\mu_{workflow}}$ (Preserves unclamped ratios $>1.0$ in loops/parallel branches). |
| `totalRetryCount` | Cumulative retry attempts triggered by retry policies. | $\sum \text{step.retryCount}$ |
| `timeoutCount` | Failures caused by network timeouts, gateway timeouts (504), or execution limits. | Regex detection: `/(timeout|timed out|504|ETIMEDOUT|gateway timeout)/i` |
| `errorCategories` | Categorized tally of error messages. | Aggregated by root classification (e.g., `Timeout / Network Latency`, `HTTP 5xx Server Error`). |

---

## 3. Handling Complex Topologies

### A. Loops and Iterators
When a workflow iterates over collections (e.g., iterating through 100 CRM records), a single workflow run generates 100 step traces for that node:
* `totalExecutionAttempts`: `100`
* `uniqueWorkflowExecutions`: `1`
* `durationContributionRatio`: Node duration can naturally exceed $100\%$ ($>1.0$) of the parent workflow baseline duration if multiple iterations are summed. FlowPilot **never clamps** this ratio to an artificial $100\%$, preserving mathematical fidelity.

### B. Parallel Branches
When branches run concurrently, the sum of node durations across branches can exceed the wall-clock execution time of the workflow. The bottleneck analyzer retains the true duration ratio $\frac{\mu_{node}}{\mu_{workflow}}$ without truncating, allowing operators to accurately spot intensive branches.

### C. Skipped Branches
Nodes on unselected IF/ELSE or Switch branches register status `SKIPPED` with `durationMs = 0`. Skipped steps are accounted for in `skippedCount` and excluded from `failureRatePercent` and latency averages to prevent skewing operational metrics.

---

## 4. API Endpoints

### 1. `GET /api/v1/analytics/workflows/[id]/nodes`
* **Query Parameters:** `workspaceId` (required), `timeRange` (`24h`, `7d`, `30d`, `all`), `startDate`, `endDate`.
* **Tenant Isolation:** Enforces workspace boundaries. Returns HTTP 404 if the workflow does not belong to the authorized workspace.
* **Response:**
  ```json
  {
    "success": true,
    "workspaceId": "ws_default",
    "data": {
      "workflowId": "wf_lead_qualification",
      "workflowName": "Inbound Lead Qualification & VIP Routing",
      "totalExecutionsSampled": 6,
      "nodeDiagnostics": [
        {
          "nodeId": "node_email_vip",
          "nodeName": "Notify Senior Account Exec",
          "nodeType": "action.sendEmail",
          "totalExecutionAttempts": 6,
          "uniqueWorkflowExecutions": 6,
          "successCount": 2,
          "failureCount": 0,
          "skippedCount": 4,
          "failureRatePercent": 0,
          "meanDurationMs": 4.17,
          "medianDurationMs": 0,
          "minDurationMs": 0,
          "maxDurationMs": 23,
          "durationContributionRatio": 0.3475,
          "totalRetryCount": 0,
          "timeoutCount": 0,
          "errorCategories": {},
          "sampleSizeAdequate": true,
          "diagnosticStatus": "HEALTHY",
          "diagnosticReasons": ["Operating normally: Duration contribution (34.8%) and failure rate (0%) within thresholds."],
          "evidenceLevel": "MODERATE",
          "warnings": { "highDuration": false, "highFailureRate": false },
          "recentTraces": [ ... ]
        }
      ],
      "recommendations": []
    }
  }
  ```

### 2. `GET /api/v1/analytics/workflows/[id]/nodes/[nodeId]/executions`
* **Query Parameters:** `workspaceId` (required), `limit` (default 20, max 100), `offset` (default 0), `status`.
* **Payload Redaction:** Inputs, outputs, and authorization tokens are redacted.
