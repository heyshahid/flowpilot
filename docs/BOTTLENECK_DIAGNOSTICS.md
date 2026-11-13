# FlowPilot Bottleneck Diagnostics & Optimization Advisory System

## 1. Diagnostic Policy & Classification Matrix

FlowPilot adopts an objective, evidence-driven diagnostic policy. Nodes are independently evaluated across performance latency and operational reliability dimensions.

### Safeguard: Minimum Sample Size Threshold ($N \ge 5$)
To prevent premature or misleading alerts caused by initial runs or intermittent network blips:
* **Strict Gate:** If `uniqueWorkflowExecutions < 5`, the node diagnostic status is strictly designated as **`INSUFFICIENT_DATA`**.
* Both `highDuration` and `highFailureRate` warnings are **suppressed** (`false`), and advisory recommendations are withheld until at least 5 workflow execution runs have been recorded.

### Independent Threshold Evaluation
1. **Latency Threshold (`highDuration`):**
   * Triggered when $\frac{\mu_{node}}{\mu_{workflow}} > 0.40$ (Node consumes more than $40\%$ of total workflow duration).
2. **Reliability Threshold (`highFailureRate`):**
   * Triggered when `failureRatePercent` $> 15.0\%$.

### Diagnostic Status States

| Status | Condition ($N \ge 5$) | Description | Badge Styling |
| :--- | :--- | :--- | :--- |
| **`HEALTHY`** | Duration $\le 40\%$ AND Failure $\le 15\%$ | Performing within standard operational limits. | Emerald Badge |
| **`SLOW`** | Duration $> 40\%$ AND Failure $\le 15\%$ | Primary latency bottleneck. Consumes disproportionate workflow execution time. | Amber Badge |
| **`UNRELIABLE`** | Duration $\le 40\%$ AND Failure $> 15\%$ | Reliability bottleneck. High error rate degrading pipeline success. | Rose Badge |
| **`NEEDS_ATTENTION`** | Duration $> 40\%$ AND Failure $> 15\%$ | Critical hotspot. Both severe latency drain and excessive failure frequency. | Violet / Crimson Badge |
| **`INSUFFICIENT_DATA`** | $N < 5$ | Fewer than 5 execution samples observed. Status withheld to prevent false alarms. | Slate Badge |
| **`UNAVAILABLE`** | Missing trace data | Execution data missing or unrecorded for this node. | Slate Border |

---

## 2. Evidence-Based Optimization Recommendations

FlowPilot provides deterministic, heuristic rules to identify root causes and generate structured, actionable recommendations. 

> [!IMPORTANT]
> **Advisory-Only Boundary:** Recommendations are strictly advisory. FlowPilot **never automatically alters, mutates, or modifies** workflow definitions or node configurations without explicit human action.

### Recommendation Structure
Each recommendation delivers:
* `id`: Unique identifier (e.g., `rec_timeout_node_http_crm_1700000000`).
* `ruleId`: Deterministic rule identifier (`REC_NETWORK_LATENCY`, `REC_SLOW_AI_INFERENCE`, `REC_EXCESSIVE_RETRIES`, `REC_HIGH_FAILURE_RATE`, `REC_STORAGE_FAILURE`).
* `severity`: `'CRITICAL' | 'WARNING' | 'INFO'`.
* `evidenceLevel`:
  * **`STRONG`**: Supported by $N \ge 20$ executions.
  * **`MODERATE`**: Supported by $5 \le N < 20$ executions.
  * **`SUGGESTION`**: General pattern match.
* `title`: Clear summary of the operational issue.
* `description`: Contextual explanation citing exact observed measurements vs. policy thresholds.
* `supportingMeasurements`: Sample size, measured node duration, workflow duration, contribution ratio, failure rate, and retry/timeout count.
* `suggestedActions`: List of concrete steps the operator can take to resolve the bottleneck.
* `sampleExecutionIds`: Up to 5 specific execution IDs exhibiting the issue for audit and debugging.

---

## 3. Diagnostic Rules & Root Cause Detection

### 1. `REC_NETWORK_LATENCY` (Network Latency & Timeouts)
* **Trigger:** Node has observed timeouts (`timeoutCount > 0`) or is an HTTP/Webhook node with duration share $> 40\%$.
* **Suggested Actions:**
  * Configure connection and socket timeouts with granular limits.
  * Implement an exponential backoff retry policy for transient 504/gateway errors.
  * Review remote service response latency and optimize endpoint payload sizes.

### 2. `REC_SLOW_AI_INFERENCE` (Slow AI Inference Hotspot)
* **Trigger:** AI/LLM node (`ai.generateText`, `ai.extractData`, `ai.summarize`) accounting for $> 40\%$ of workflow duration.
* **Suggested Actions:**
  * Switch to high-throughput flash or mini models for classification and extraction.
  * Decrease `max_tokens` or refine system prompts to shorten completion lengths.
  * Enable response caching for deterministic prompts.

### 3. `REC_EXCESSIVE_RETRIES` (Retry Thrashing)
* **Trigger:** Cumulative retries $\ge 3$ with failure rate $> 15\%$.
* **Suggested Actions:**
  * Add jitter to retry intervals to prevent stampeding herd failures.
  * Review authentication tokens, payload schemas, and upstream rate limits.
  * Inspect error categories in the trace drawer to separate transient from permanent errors.

### 4. `REC_HIGH_FAILURE_RATE` (Unreliable Execution Hotspot)
* **Trigger:** Node failure rate exceeds $15\%$ with $N \ge 5$.
* **Suggested Actions:**
  * Check input validation upstream before feeding data to this node.
  * Review recent error traces to identify schema mismatches or unhandled edge cases.
  * Insert a fallback branch or circuit breaker to keep the workflow resilient.

### 5. `REC_STORAGE_FAILURE` (Database / Storage Bottlenecks)
* **Trigger:** Error categories indicate database or persistence connection errors.
* **Suggested Actions:**
  * Verify database connection pool limits and idle timeout configurations.
  * Review indexing on queried columns.
  * Consider batching individual database write operations.
