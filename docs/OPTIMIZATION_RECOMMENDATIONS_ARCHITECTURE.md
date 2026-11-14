# FlowPilot — Optimization Recommendations Architecture (Phase 9G)

## 1. Executive Summary

FlowPilot Phase 9G introduces the **Optimization Recommendations Engine**, an evidence-based diagnostic system that transforms operational telemetry, execution traces, node bottlenecks, integration delivery patterns, schedule intervals, and AI token expenditures into actionable, prioritized suggestions.

### Core Guiding Principles
- **Strictly Advisory-Only**: Recommendations provide human-in-the-loop insights with clear action links and inspection steps. FlowPilot **never** alters, rewires, or deletes workflows, credentials, or schedules automatically.
- **Traceable Real Telemetry**: Every recommendation links directly to concrete, observable metrics (duration, error rates, retry counts, token logs). No fabricated or theoretical issues are synthesized.
- **Decoupled Scoring**: Priority (Severity + Frequency + Impact) is mathematically independent of Confidence (Sample Size + Data Completeness + Temporal Consistency).
- **Graceful Neutral State**: When workflows run within normal operating thresholds, the system presents:  
  `"No optimization recommendations have been identified from the available data."`  
  It explicitly refrains from claiming workflows operate with "optimal parameters".

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PERSISTED TELEMETRY                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  WorkflowStore  │  │ ExecutionStore  │  │     ScheduleStore &         │  │
│  │ (Canvas Graphs) │  │(Terminal Traces)│  │     CredentialStore         │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘  │
│           │                    │                          │                 │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌──────────────┴──────────────┐  │
│  │  AIUsageStore   │  │  WebhookStore   │  │   WorkspaceLimitsStore      │  │
│  │ (Provider Logs) │  │(Deliveries 500) │  │    (Resource Quotas)        │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘  │
└───────────┼────────────────────┼──────────────────────────┼─────────────────┘
            ▼                    ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RECOMMENDATION ENGINE CORE SERVICE                       │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 1. In-Memory Process Concurrency Lock (Single-Process Guard)          │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 2. Eight Diagnostic Evaluators                                        │  │
│  │    • Workflow Performance (P95 tail latency, drift, parallelization)  │  │
│  │    • Node Optimization (bottleneck duration, retries, timeouts)       │  │
│  │    • Workflow Reliability (failure rates, incidents, triggers)        │  │
│  │    • Integration Health (failure rates, expired creds, auth errors)   │  │
│  │    • AI Cost & Efficiency (expensive models, token prompts, unpriced) │  │
│  │    • Scheduling Optimization (off-peak, over-polling, missed runs)    │  │
│  │    • Workspace Resource Quotas (approaching 80%+ limits)              │  │
│  │    • Workflow Architecture (missing error paths, fan-out, loops)      │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 3. Deterministic Scorer (Priority 10-100, Confidence 25-100)          │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 4. Deduplicator & Regeneration Manager (In-Place Update & Recurrence) │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STORAGE & AUDIT TRAIL                               │
│  ┌───────────────────────────────┐     ┌─────────────────────────────────┐  │
│  │ .data/recommendations.json    │     │ .data/recommendation_history.   │  │
│  │ (Active & Inactive Records)   │     │ json (Immutable Audit Log)      │  │
│  └───────────────────────────────┘     └─────────────────────────────────┘  │
│  ┌───────────────────────────────┐     ┌─────────────────────────────────┐  │
│  │ .data/recommendation_         │     │ AuditLogStore                   │  │
│  │ feedback.json                 │     │ (resourceType: recommendation)  │  │
│  └───────────────────────────────┘     └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Modules & Responsibilities

| Module | File Path | Primary Function |
| :--- | :--- | :--- |
| **Types & Domain** | `src/core/recommendations/types.ts` | Complete Zod schemas, TypeScript types, lifecycle states, diagnostic metrics, and payload formats. |
| **Rules Catalogue** | `src/core/recommendations/recommendationDefinitions.ts` | 24 concrete diagnostic rules across all 8 categories with initial thresholds, heuristics, and limitations. |
| **Deterministic Scorer** | `src/core/recommendations/recommendationScoring.ts` | Two-factor scoring engine separating Priority (10-100) from Confidence (25-100). |
| **Deduplicator** | `src/core/recommendations/recommendationDeduplication.ts` | Generates deterministic deduplication keys, updates active records in-place, and enforces regeneration safeguards. |
| **Evaluation Engine** | `src/core/recommendations/recommendationEngine.ts` | Evaluates workspace resources with in-memory single-process execution locking. |
| **Service Layer** | `src/core/recommendations/recommendationService.ts` | High-level querying, filtering, state transitions, user feedback, and audit logging. |
| **Storage Engine** | `src/lib/storage/recommendationStore.ts` | Multi-file JSON persistence (`recommendations.json`, `recommendation_history.json`). |
| **Feedback Store** | `src/lib/storage/recommendationFeedbackStore.ts` | Captures user helpfulness ratings and qualitative feedback without altering telemetry. |
| **Dashboard UI** | `src/app/(dashboard)/recommendations/page.tsx` | Overview KPI cards, 8-category tabs, severity/status filters, deep-dive modal with evidence trace. |

---

## 4. Engineering Safeguards & Limitations

1. **Advisory-Only Policy**: Recommendations only display deep-links (`/builder/:id`, `/integrations`, `/schedules`, `/settings/usage`) or guidance checklists. No automated state mutation occurs.
2. **Data Bounding**:
   - Executions are limited to the most recent 500 records per workspace.
   - Inbound webhook deliveries are bounded to the 500-record rolling buffer.
   - AI cost calculations only evaluate models with verified pricing in `AIPricingManager`; unpriced models are explicitly isolated and reported under rule `AI_UNPRICED_MODELS_DETECTED`.
3. **Single-Process Concurrency**:
   - The in-memory lock `RecommendationEngine.activeEvaluations` prevents duplicate concurrent evaluations on the same node.
   - It is explicitly documented that this does not constitute distributed locking across horizontal replicas.
4. **Error Port Semantics vs Conditional Branches**:
   - Workflow architecture analysis checks genuine error ports (`error`, `onError`, `failure`) and explicitly excludes normal conditional decision paths (`false`, `else`, `default`).
5. **Parallelization Uncertainty**:
   - Graph topology alone cannot guarantee task independence. Recommendations check for explicit node data references (`{{steps.node...}}`) and prominently label potential candidates as `[Candidate - Requires Verification]` with explicit caveats regarding side effects and external state.

