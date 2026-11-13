# FlowPilot Phase 9C Implementation Documentation

## Node-Level Bottleneck Analysis & Optimization Diagnostics

### 1. Architectural Summary
Phase 9C builds upon the Phase 9A analytical data layer and Phase 9B dashboard components to deliver comprehensive node-level performance diagnostics, latency distributions, failure root cause classification, and evidence-backed advisory optimization recommendations.

---

## 2. Key Modules Implemented

### A. Data Types & Interfaces (`src/core/analytics/types.ts`)
* `DiagnosticStatus`: `'HEALTHY' | 'SLOW' | 'UNRELIABLE' | 'NEEDS_ATTENTION' | 'INSUFFICIENT_DATA' | 'UNAVAILABLE'`.
* `RecommendationEvidenceLevel`: `'STRONG' | 'MODERATE' | 'SUGGESTION'`.
* `OptimizationRecommendation`: Actionable advisory recommendation with measurement thresholds, suggested steps, and sample execution traces.
* `NodeExecutionTraceDetail`: Sanitized node step execution record (inputs/outputs stripped).
* `NodePerformanceMetric` Extensions:
  * `totalExecutionAttempts`: Cumulative executions across iterations and retries.
  * `uniqueWorkflowExecutions`: Distinct workflow executions containing the node.
  * `minDurationMs`, `maxDurationMs`, `medianDurationMs`: Statistical distribution metrics.
  * `timeoutCount`: Regex detection of network, 504, and socket timeouts.
  * `errorCategories`: Categorized error tallies.
  * `diagnosticStatus`, `diagnosticReasons`, `evidenceLevel`: Structured assessment results.
  * `recentTraces`: Recent execution traces for instant drill-down.

### B. Diagnostic & Recommendation Engine (`src/core/analytics/bottleneckAnalyzer.ts`)
* **`BottleneckAnalyzer.analyze`**: Aggregates raw step traces from executions, calculates metrics, enforces sample size minimum ($N \ge 5$), determines independent warning flags (`highDuration` for $>40\%$ and `highFailureRate` for $>15\%$), and assigns diagnostic statuses.
* **`BottleneckAnalyzer.generateRecommendations`**: Evaluates diagnostic metrics across 5 deterministic rules (`REC_NETWORK_LATENCY`, `REC_SLOW_AI_INFERENCE`, `REC_EXCESSIVE_RETRIES`, `REC_HIGH_FAILURE_RATE`, `REC_STORAGE_FAILURE`), attaches measured values vs thresholds, and tags up to 5 affected execution IDs.
* **`BottleneckAnalyzer.diagnoseWorkflow`**: Combines node metrics, sample sizes, and recommendations into a unified diagnostic bundle.

### C. Analytics Service Facade (`src/core/analytics/analyticsService.ts`)
* **`getWorkflowNodeDiagnostics(workflowId, options)`**: Queries workflow executions and runs the bottleneck diagnostic engine.
* **`getWorkflowPerformance(workflowId, options)`**: Updated to include recommendations array alongside workflow statistics.

### D. Server-Side REST APIs
* **`GET /api/v1/analytics/workflows/[id]/nodes`**: Workspace-scoped endpoint returning node metrics and optimization recommendations. Returns HTTP 404 for workflows outside the active workspace.
* **`GET /api/v1/analytics/workflows/[id]/nodes/[nodeId]/executions`**: Paginated, sensitive-payload-redacted execution trace history for an individual node.

### E. User Interface Components
* **`NodePerformanceTable.tsx`**: Full-featured diagnostic table showing node latency, duration share, failure rate, retries, timeouts, and status badges. Includes expandable drawer revealing diagnostic reasons, error category distribution, and recent trace links.
* **`OptimizationRecommendationsPanel.tsx`**: Advisory recommendations panel displaying issue summary, evidence level, supporting measurements, suggested actions, and affected execution trace IDs.
* **`src/app/(dashboard)/analytics/workflows/[id]/page.tsx`**: Integrated both components into the workflow analytics detail view.

---

## 3. Verification & Compliance
* **Vitest Test Suite:** 159 tests passing across 11 test suites (`tests/phase9c_bottleneck_analysis.test.ts` passed 14/14 tests).
* **Next.js 15 Production Build:** 0 errors, 37 static pages generated, 66 total routes registered.
* **Tenant Isolation:** Enforced on all routes; cross-workspace queries return HTTP 404 Not Found without leaking workflow existence.
* **Zero Automated Modifications:** Recommendations strictly advisory.
