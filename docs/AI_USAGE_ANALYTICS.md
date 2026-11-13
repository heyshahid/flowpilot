# FlowPilot AI Usage Analytics

## 1. Executive Architectural Overview

FlowPilot's **AI Usage Analytics Service** (`src/core/analytics/aiUsageAnalyticsService.ts`) provides full token observability and execution latency metrics across all AI-driven platform operations, including:
* Natural Language to Workflow Generation (`generate_workflow`)
* Workflow Graph Explanation (`explain_workflow`)
* AI Error Diagnostics Assistant (`error_assistant`)
* Graph Topology Optimization (`optimize_workflow`)
* Copilot & Studio Interactive Chat (`chat`)
* AI Transform Node Executions (`node_execution`)

---

## 2. Telemetry Schema & Persistence

Every AI invocation executed through FlowPilot is recorded in the platform's immutable log store (`.data/ai_usage.json` via `AIUsageStore`):

```typescript
export interface AIUsageLogEntry {
  id: string;
  provider: AIProviderId; // 'openai' | 'anthropic' | 'gemini' | 'groq' | 'mock'
  model: string;          // e.g., 'gpt-4o-mini', 'gemini-2.0-flash'
  operation: 'generate_workflow' | 'explain_workflow' | 'error_assistant' | 'optimize_workflow' | 'chat' | 'node_execution';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  durationMs: number;
  timestamp: string;      // ISO 8601 UTC timestamp
  workspaceId: string;    // Multi-tenant scoping identifier
}
```

---

## 3. Metrics Aggregation & Statistical Formulas

### A. Token Volume
* **Total Prompt Tokens**: $\sum \text{promptTokens}$
* **Total Completion Tokens**: $\sum \text{completionTokens}$
* **Total Tokens**: $\sum (\text{promptTokens} + \text{completionTokens})$

### B. Latency Distributions
* **Average Latency**: $\mu = \frac{1}{N} \sum_{i=1}^N \text{durationMs}_i$
* **Median Latency ($p50$)**:
  * For odd $N$: value at index $\frac{N-1}{2}$ of sorted latencies.
  * For even $N$: $\frac{\text{latencies}[\frac{N}{2}-1] + \text{latencies}[\frac{N}{2}]}{2}$.

### C. Time-Series Aggregation with $[start, end)$ Intervals
To avoid double-counting or ambiguity across temporal boundaries, time-series points are bucketed into clean, discrete half-open intervals $[t_{\text{start}}, t_{\text{end}})$:
* **Hourly Bucketing**: `YYYY-MM-DDTHH:00:00.000Z`
* **Daily Bucketing**: `YYYY-MM-DDT00:00:00.000Z`

Each bucket aggregates `requestCount`, `promptTokens`, `completionTokens`, `totalTokens`, and `estimatedCostUsd`.

---

## 4. Provider & Model Breakdown

The engine groups telemetry records across two primary dimensions:
1. **By Provider**:
   * OpenAI, Google Gemini, Anthropic, Groq, FlowPilot Local Mock.
   * Tracks total requests, prompt tokens, completion tokens, average latency, and estimated cost.
2. **By Model**:
   * Per-model granularity (e.g. `gpt-4o-mini`, `gpt-4o`, `gemini-2.0-flash`, `gemini-1.5-pro`, `claude-3-5-sonnet-latest`).
   * Displays active pricing version (e.g. `2026-Q1`) and per-million token rates ($/1M input, $/1M output).

---

## 5. REST APIs for AI Usage Analytics

All endpoints enforce tenant authorization via `AuthContextManager.resolve(req)` and role-based permissions (`workflow:read`):
* **`GET /api/v1/analytics/ai-usage/overview`**: Holistic workspace token volume, latency, cost estimates, and advisory disclaimers.
* **`GET /api/v1/analytics/ai-usage/providers`**: Provider-level volume, latency, and cost breakdown.
* **`GET /api/v1/analytics/ai-usage/models`**: Model-level volume, token rates, pricing versions, and estimated cost (supports optional `?provider=` filter).
* **`GET /api/v1/analytics/ai-usage/trends`**: Time-series points bucketed by `day` or `hour` with optional `startDate` and `endDate` parameters.

