# FlowPilot — Recommendation Scoring Methodology (Phase 9G)

## 1. Principles of Decoupled Scoring

FlowPilot decouples **Priority Score** (how urgently a recommendation warrants attention) from **Confidence Score** (how reliable and comprehensive the underlying evidence is).

```
   ┌────────────────────────────────┐         ┌────────────────────────────────┐
   │         PRIORITY SCORE         │         │        CONFIDENCE SCORE        │
   │           [10 - 100]           │         │           [25 - 100]           │
   ├────────────────────────────────┤         ├────────────────────────────────┤
   │  Base Severity     (10 - 40)   │         │  Sample Size Adequacy (10 - 40)│
   │  Frequency Factor  (0 - 30)    │         │  Data Completeness    (15 - 30)│
   │  Impact Magnitude  (0 - 30)    │         │  Temporal Consistency (0 - 30) │
   └────────────────────────────────┘         └────────────────────────────────┘
```

A recommendation can have **Critical Priority** (e.g. 85/100) with **Medium Confidence** (e.g. 55/100) if a severe issue occurred only twice in a newly launched workflow. Conversely, a minor efficiency recommendation can have **Low Priority** (e.g. 30/100) with **High Confidence** (e.g. 95/100) based on thousands of consistent executions.

---

## 2. Priority Scoring Formula

The priority score represents urgency and potential operational harm:

$$\text{Priority Score} = \text{Base Severity} + \text{Frequency Factor} + \text{Impact Factor}$$

### Component 1: Base Severity ($S_{\text{base}}$)
Fixed value based on default rule severity:
- `CRITICAL`: 40 points
- `HIGH`: 30 points
- `MEDIUM`: 20 points
- `LOW`: 10 points

### Component 2: Frequency Factor ($F$)
Calculated from recurrence rate or ratio of affected entities:
$$F = \min(30, \text{round}(r_{\text{affected}} \times 30))$$
Where $r_{\text{affected}} \in [0.0, 1.0]$. For discrete event counts:
- 1 occurrence: 10 points
- 2 occurrences: 20 points
- $\ge 3$ occurrences: 30 points

### Component 3: Impact Magnitude ($I$)
Represents potential blast radius or resource degradation:
$$I = \min(30, \text{round}(r_{\text{impact}} \times 30))$$
- Quotas: percentage of ceiling reached ($80\% \to 24\text{ pts}$, $100\% \to 30\text{ pts}$).
- Latency Bottlenecks: node contribution ratio ($40\% \to 12\text{ pts}$, $80\% \to 24\text{ pts}$).
- Default fallback for discrete events: 10 points.

### Final Range & Tiers
- **Score Range**: Guaranteed $10 \le \text{Priority Score} \le 100$
- **Tiers**:
  - `CRITICAL`: 80 – 100
  - `HIGH`: 60 – 79
  - `MEDIUM`: 40 – 59
  - `LOW`: 10 – 39

---

## 3. Confidence Scoring Formula

The confidence score reflects statistical validity and evidence depth:

$$\text{Confidence Score} = C_{\text{sample}} + C_{\text{completeness}} + C_{\text{consistency}}$$

### Component 1: Sample Size Adequacy ($C_{\text{sample}}$)
- $N < 3$ runs / samples: **10 points** (insufficient statistical depth)
- $3 \le N < 5$ runs: **25 points** (emerging trend)
- $N \ge 5$ runs: **40 points** (statistically adequate sample)

### Component 2: Telemetry Completeness ($C_{\text{completeness}}$)
- Full step-level traces and timing available: **30 points**
- Workflow terminal status without node traces: **20 points**
- Aggregated or rolling buffer window: **15 points**

### Component 3: Temporal Consistency ($C_{\text{consistency}}$)
- Multi-run sustained pattern across distinct executions: **30 points**
- Intermittent or isolated single-execution occurrence: **0 points**

### Final Range & Confidence Tiers
- **Score Range**: Guaranteed $25 \le \text{Confidence Score} \le 100$
- **Tiers**:
  - `HIGH`: 80 – 100
  - `MEDIUM`: 50 – 79
  - `LOW`: 25 – 49
