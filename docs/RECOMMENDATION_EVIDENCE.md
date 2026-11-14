# FlowPilot — Recommendation Evidence Tracing & Limitations (Phase 9G)

## 1. Evidence Grounding & Traceability

Every recommendation produced by FlowPilot contains structured, auditable evidence grounded in real storage records:

```typescript
export interface RecommendationEvidence {
  metricName: string;
  observedValue: number | string;
  comparisonValue?: number | string;
  sampleSize: number;
  measurementPeriod: {
    from: string; // ISO 8601
    to: string;   // ISO 8601
  };
  sourceService:
    | 'AnalyticsService'
    | 'BottleneckAnalyzer'
    | 'ExecutionStore'
    | 'AIUsageStore'
    | 'WebhookStore'
    | 'CredentialStore'
    | 'ScheduleStore'
    | 'UsageService'
    | 'WorkflowStore';
  unit?: string;
  relevantIds?: string[];
}
```

### Traceability Guarantee
- Recommendations never make assertions without citing the source service and measurement period.
- For node-level findings, the specific node identifier is included in `relevantIds`.
- For workflow drift, both historical baseline and recent window values are explicitly stated.

---

## 2. Distinction: Observed Evidence vs. Estimated Impact vs. Explanations

To ensure transparency, FlowPilot strictly segregates three levels of information:

| Level | Definition | Example in UI |
| :--- | :--- | :--- |
| **Observed Evidence** | Empirically measured facts recorded in database stores. | `p95DurationMs: 34,200ms across 42 runs in past 30 days.` |
| **Estimated Impact** | Theoretical projected benefit if recommended action is taken. Explicitly tagged with `isEstimated: true`. | `Projected savings: ~30% reduction in workflow execution time.` |
| **Possible Explanations** | Engineering hypotheses explaining why the metric occurred. | `Slow response times may stem from remote rate limits or unindexed database queries.` |

---

## 3. Disclosed Data Limitations

Every recommendation surfaces relevant system limitations to prevent misinterpretation:

1. **Bounded Buffer Limits**:
   - `ExecutionStore`: Bounded to the most recent 500 executions per workspace.
   - `WebhookStore`: Inbound delivery telemetry reflects the 500-record rolling buffer. Older deliveries are pruned.
2. **AI Cost Estimation**:
   - AI cost analytics reflect published standard API rates in `AIPricingManager`. They do not represent official vendor invoices and omit unpriced or custom enterprise discount models.
3. **Graph Topology Uncertainty**:
   - For parallelization suggestions, static graph analysis confirms absence of explicit variable dependencies (`{{steps.node...}}`), but cannot prove independence from shared external databases, external state mutations, or remote API concurrency limits.
4. **Single-Process Concurrency**:
   - The engine concurrency lock is an in-memory process guard. In a multi-node horizontal deployment, evaluations run independently per node.
