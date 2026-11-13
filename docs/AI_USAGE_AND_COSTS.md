# FlowPilot AI Token Usage & Cost Management

## 1. Overview

FlowPilot tracks every AI request, model invocation, input/output token count, and dollar cost in `.data/ai_usage.json` via `AIUsageStore`.

---

## 2. Metrics & Accounting Architecture

Every call to `WorkflowGenerator`, `WorkflowExplainer`, `ErrorAssistant`, or `WorkflowOptimizer` logs an `AIUsageLogEntry`:

```typescript
interface AIUsageLogEntry {
  id: string;               // Unique log ID
  provider: AIProviderId;   // 'openai' | 'anthropic' | 'gemini' | 'mock'
  model: string;            // Model identifier (e.g. 'gpt-4o-mini')
  operation: 'generate_workflow' | 'explain_workflow' | 'error_assistant' | 'optimize_workflow' | 'chat';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  durationMs: number;
  timestamp: string;
  workspaceId: string;
}
```

---

## 3. Real-Time Analytics API

- **Endpoint:** `GET /api/v1/ai/usage?workspaceId=ws_default`
- **Output:**
  - `totalRequests`: Cumulative number of AI calls.
  - `totalPromptTokens`: Cumulative input tokens.
  - `totalCompletionTokens`: Cumulative output tokens.
  - `totalCostUsd`: Accurate cost in USD based on model pricing.
  - `byProvider`: Cost and request distribution per provider.
  - `byModel`: Cost and request distribution per model.
  - `recentLogs`: Last 20 operation traces.
