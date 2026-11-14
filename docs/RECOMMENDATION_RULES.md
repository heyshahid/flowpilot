# FlowPilot — Optimization Recommendation Rules Catalogue

This document details all 24 diagnostic rules implemented in the **FlowPilot Optimization Recommendations Engine (Phase 9G)** across 8 distinct operational categories.

---

## Category 1: Workflow Performance (`WORKFLOW_PERFORMANCE`)

### 1. `PERF_SLOW_WORKFLOW_P95`
- **Name**: High P95 Execution Latency
- **Description**: Identifies workflows whose 95th percentile execution duration exceeds 30,000ms and median duration exceeds 10,000ms.
- **Severity**: `HIGH`
- **Initial Thresholds**:
  - `p95DurationMsThreshold`: 30,000ms
  - `medianDurationMsThreshold`: 10,000ms
  - `minSamples`: 5 terminal executions
- **Evidence Required**:
  - `p95DurationMs` (observed vs 30.0s threshold)
  - `medianDurationMs` (observed vs 10.0s threshold)
- **Standard Limitations**:
  - Long durations may stem from external API rate-limiting or intentional sleep/delay nodes.
- **Data Limitations**:
  - Derived from terminal executions within the bounded 500-execution buffer.
- **Suggested Actions**: Inspect slow external requests, configure asynchronous worker queues, or adjust timeout thresholds.

### 2. `PERF_DURATION_DRIFT`
- **Name**: Workflow Latency Drift Over Baseline
- **Description**: Detects workflows whose recent 5-run average execution duration has drifted > 50% higher than their historical 30-day baseline.
- **Severity**: `MEDIUM`
- **Initial Thresholds**:
  - `driftPercentage`: 50.0%
  - `recentRunCount`: 5
  - `baselineMinRuns`: 10
- **Evidence Required**:
  - `recentAvgDurationMs` vs `baselineAvgDurationMs`
  - `driftPercentage`
- **Standard Limitations**:
  - Payload size variations across business cycles can inflate execution duration without code regression.
- **Data Limitations**:
  - Requires at least 10 baseline executions and 5 recent runs.
- **Suggested Actions**: Audit recent payload size increases, compare node trace latencies, or optimize payload transformation logic.

### 3. `PERF_POTENTIAL_PARALLELIZATION`
- **Name**: Sequential Execution of Independent Tasks
- **Description**: Identifies sequences of 2 or more remote HTTP or AI steps running linearly without explicit data dependencies.
- **Severity**: `LOW`
- **Initial Thresholds**:
  - `minSequentialSteps`: 2
- **Evidence Required**:
  - `candidateParallelEdges`: number of linear edges connecting independent remote nodes
  - `explicitDataDependencies`: static verification confirming absence of upstream variable interpolation
- **Standard Limitations**:
  - Graph topology alone cannot prove execution independence. If steps rely on external side-effects, implicit database state, or provider rate limits, sequential execution must be preserved.
- **Data Limitations**:
  - Inferred from workflow node connectivity and absence of inter-step variable references.
- **Suggested Actions**: Open the visual builder to branch independent steps into parallel execution paths if ordering is non-critical.

---

## Category 2: Node Optimization (`NODE_OPTIMIZATION`)

### 4. `NODE_DISPROPORTIONATE_DURATION`
- **Name**: Disproportionate Node Duration Bottleneck
- **Description**: Flags individual nodes consuming >= 40% of the entire workflow mean duration.
- **Severity**: `HIGH`
- **Initial Thresholds**:
  - `durationContributionRatio`: >= 0.40
  - `minSamples`: 5 executions
- **Evidence Required**:
  - `durationContributionRatio`: % of workflow duration
  - `nodeMeanDurationMs`: absolute duration in ms
- **Standard Limitations**:
  - Nodes handling complex AI transformations or large file transfers inherently dominate workflow runtime.
- **Data Limitations**:
  - Derived from step execution traces in terminal runs.
- **Suggested Actions**: Review timeouts, enable response streaming, or optimize downstream batch parameters.

### 5. `NODE_EXCESSIVE_RETRIES`
- **Name**: Excessive Node Retry Activity
- **Description**: Highlights nodes triggering repeated retries (> 30% retry rate), signaling flaky network destinations or intermittent exceptions.
- **Severity**: `HIGH`
- **Initial Thresholds**:
  - `retryRate`: >= 0.30
  - `minSamples`: 5 executions
- **Evidence Required**:
  - `retryRate`: % of executions requiring retries
- **Standard Limitations**:
  - Automatic retries prevent hard failures but increase overall latency.
- **Data Limitations**:
  - Measured from recorded step execution attempt counters.
- **Suggested Actions**: Review backoff intervals, verify destination endpoint health, or add circuit breakers.

### 6. `NODE_FREQUENT_TIMEOUTS`
- **Name**: Frequent Node Execution Timeouts
- **Description**: Identifies nodes exceeding execution timeouts in >= 15% of recorded runs.
- **Severity**: `CRITICAL`
- **Initial Thresholds**:
  - `timeoutRate`: >= 0.15
  - `minSamples`: 5 executions
- **Evidence Required**:
  - `timeoutRate`: percentage of runs resulting in timeout errors
- **Standard Limitations**:
  - Upstream network congestion can temporarily trigger false-positive timeout clusters.
- **Data Limitations**:
  - Detected via structured error status codes and timeout exception messages.
- **Suggested Actions**: Increase node timeout limit or implement an asynchronous polling pattern.

---

## Category 3: Workflow Reliability (`RELIABILITY`)

### 7. `REL_HIGH_FAILURE_RATE`
- **Name**: High Workflow Failure Rate
- **Description**: Detects workflows with an overall failure rate >= 20% across terminal runs.
- **Severity**: `CRITICAL`
- **Initial Thresholds**:
  - `failureRateThreshold`: 0.20
  - `minSamples`: 5 terminal executions
- **Evidence Required**:
  - `failureRate`: observed terminal failure percentage
- **Standard Limitations**:
  - Intentional validation rejections (4xx client responses) may appear as failures if unclassified.
- **Suggested Actions**: Inspect execution logs, check schema validation, and configure fallback paths.

### 8. `REL_PERSISTENT_CRITICAL_INCIDENTS`
- **Name**: Recurring Critical Incidents
- **Description**: Highlights workflows experiencing repeated critical or high-severity incidents within the active window.
- **Severity**: `CRITICAL`
- **Initial Thresholds**:
  - `incidentCount`: >= 3
- **Evidence Required**:
  - `incidentCount`: number of open or acknowledged incidents
- **Suggested Actions**: Investigate underlying alert triggers, review recent credential or environment changes.

### 9. `REL_UNRELIABLE_TRIGGER`
- **Name**: High Trigger Failure or Drop Rate
- **Description**: Identifies triggers failing to initiate executions reliably due to malformed payloads or rejected handshakes.
- **Severity**: `HIGH`
- **Initial Thresholds**:
  - `failureRate`: >= 0.25
  - `minSamples`: 5 runs
- **Suggested Actions**: Audit trigger authorization headers and verify upstream sender configuration.

---

## Category 4: Integration Health (`INTEGRATION`)

### 10. `INT_UNHEALTHY_INTEGRATION_RATE`
- **Name**: High Integration Delivery Failure Rate
- **Description**: Warns when an external integration adapter experiences >= 25% delivery error rate across recent deliveries.
- **Severity**: `HIGH`
- **Initial Thresholds**:
  - `failureRate`: >= 0.25
  - `minDeliveries`: 5
- **Suggested Actions**: Test connection in the Integrations hub, check remote service status, and inspect payload schemas.

### 11. `INT_EXPIRED_CREDENTIALS`
- **Name**: Expired or Expiring Credential Secret
- **Description**: Flags credentials that have passed their expiration date or will expire within 7 days.
- **Severity**: `CRITICAL`
- **Initial Thresholds**:
  - `leadTimeDays`: 7 days
- **Suggested Actions**: Rotate API keys, refresh OAuth tokens, or update credential secrets.

### 12. `INT_AUTH_FAILURE_PATTERN`
- **Name**: Recurring 401/403 Authentication Failures
- **Description**: Identifies integration endpoints experiencing repeated authentication or authorization rejections.
- **Severity**: `CRITICAL`
- **Initial Thresholds**:
  - `authFailureCount`: >= 3
- **Suggested Actions**: Verify API tokens, scopes, and IP allowlist configurations with the third-party provider.

---

## Category 5: AI Cost & Efficiency (`AI_COST`)

### 13. `AI_EXPENSIVE_MODEL_DOMINANCE`
- **Name**: Opportunity for Cost-Optimized AI Model
- **Description**: Highlights workflows using premium Tier 1 models (e.g. GPT-4o, Claude 3.5 Sonnet) for routine extraction or summarization tasks.
- **Severity**: `MEDIUM`
- **Initial Thresholds**:
  - `premiumSpendRatio`: >= 0.60
  - `minInvocations`: 10
- **Suggested Actions**: Benchmark prompt performance against lighter models (e.g. GPT-4o-mini, Claude 3.5 Haiku) for non-reasoning tasks.

### 14. `AI_HIGH_TOKEN_USAGE_PROMPT`
- **Name**: High Token Consumption per Invocation
- **Description**: Flags AI nodes with average prompt token sizes exceeding 4,000 tokens per call.
- **Severity**: `MEDIUM`
- **Initial Thresholds**:
  - `avgPromptTokens`: >= 4,000
  - `minInvocations`: 10
- **Suggested Actions**: Implement prompt truncation, trim injected historical message buffers, or extract relevant schema fields before calling LLMs.

### 15. `AI_UNPRICED_MODELS_DETECTED`
- **Name**: Unpriced AI Model Activity
- **Description**: Alerts administrators when AI invocations run against models without verified pricing definitions in the local pricing catalogue.
- **Severity**: `LOW`
- **Suggested Actions**: Register pricing entries in the workspace AI configuration to maintain accurate cost observability.

---

## Category 6: Scheduling Optimization (`SCHEDULING`)

### 16. `SCHED_OFF_PEAK_OPPORTUNITY`
- **Name**: Schedule Clustering on Exact Hour
- **Description**: Flags multiple heavy schedules clustered exactly at `:00` minute marks, causing worker queue contention.
- **Severity**: `LOW`
- **Initial Thresholds**:
  - `clusteredJobs`: >= 3
- **Suggested Actions**: Introduce cron minute offsets (e.g. `*/15` or `:07`) to distribute queue load evenly.

### 17. `SCHED_HIGH_FREQUENCY_POLLING`
- **Name**: High-Frequency Schedule Polling
- **Description**: Detects cron schedules running more frequently than every 2 minutes without incoming data changes.
- **Severity**: `MEDIUM`
- **Suggested Actions**: Convert to event-driven webhooks or relax the polling interval to 5–15 minutes.

### 18. `SCHED_MISSED_EXECUTIONS`
- **Name**: Repeated Missed Scheduled Runs
- **Description**: Highlights schedules that have missed >= 3 scheduled intervals due to scheduler downtime or worker starvation.
- **Severity**: `HIGH`
- **Suggested Actions**: Review worker capacity, inspect scheduler service logs, and enable catch-up execution.

---

## Category 7: Workspace Resource Quotas (`RESOURCE_USAGE`)

### 19. `QUOTA_APPROACHING_CEILING_WORKFLOWS`
- **Name**: Approaching Workspace Workflow Ceiling
- **Description**: Workspace has reached >= 80% of its active workflow allocation.
- **Severity**: `MEDIUM`

### 20. `QUOTA_APPROACHING_CEILING_EXECUTIONS`
- **Name**: Approaching Monthly Execution Ceiling
- **Description**: Monthly workflow execution volume has reached >= 80% of the workspace threshold.
- **Severity**: `HIGH`

### 21. `QUOTA_APPROACHING_CEILING_AI_COST`
- **Name**: Approaching Estimated AI Budget Ceiling
- **Description**: Monthly estimated AI spending has reached >= 80% of configured monthly budget limit.
- **Severity**: `HIGH`

---

## Category 8: Workflow Architecture (`WORKFLOW_ARCHITECTURE`)

### 22. `ARCH_UNHANDLED_ERROR_PATH`
- **Name**: Missing Error Fallback Path on Remote Node
- **Description**: Flags critical external service calls (HTTP request, AI inference, Database query) that lack a connected error branch (`onError`, `error`, `failure`).
- **Severity**: `MEDIUM`
- **Initial Thresholds**:
  - `unhandledCriticalNodeCount`: >= 1
- **Evidence Required**:
  - `unhandledNode`: Node name and identifier
  - `configuredErrorBranch`: Verified absence of error handle connections
- **Standard Limitations**:
  - Static graph analysis; does not verify whether downstream nodes contain try/catch scripting logic.
- **Data Limitations**:
  - Strictly distinguishes actual error ports (`error`, `onError`, `failure`) from ordinary conditional `false` or `else` decision branches.
- **Suggested Actions**: Connect the node's `onError` port to a fallback notification or retry handler in the visual builder.

### 23. `ARCH_HIGH_FANOUT_WITHOUT_BATCHING`
- **Name**: High Graph Fan-Out Without Throttling
- **Description**: Detects workflow triggers connecting directly to > 10 parallel outgoing branches, risking queue starvation and downstream rate limits.
- **Severity**: `LOW`
- **Initial Thresholds**:
  - `triggerOutgoingEdges`: > 10
- **Evidence Required**:
  - `triggerOutgoingEdges`: Number of parallel edges originating from the trigger
- **Standard Limitations**:
  - Certain fan-out patterns are intentional; evaluate downstream service capacity.
- **Suggested Actions**: Group parallel tasks into batches or use queue-driven fan-out to prevent concurrent load spikes.

### 24. `ARCH_UNBOUNDED_LOOP_RISK`
- **Name**: Unbounded Loop Node Configuration
- **Description**: Highlights loop or while constructs lacking an explicit maximum iteration ceiling (`maxIterations`).
- **Severity**: `HIGH`
- **Initial Thresholds**:
  - `maxIterations`: Missing or undefined
- **Evidence Required**:
  - `maxIterations`: Observed configuration status
- **Standard Limitations**:
  - Workflow execution engine enforces a global execution timeout, but unbounded loops degrade performance until timeout.
- **Suggested Actions**: Configure an explicit maximum iteration limit (e.g. 50 or 100) on the loop node in the builder.
