# FlowPilot: Canonical Metric Definitions & Mathematical Foundations

## 1. Overview
FlowPilot Analytics enforces strict mathematical integrity across all aggregated telemetry. Every metric adheres to explicit sample size thresholds, zero-division safeguards, and zero-fabrication rules.

---

## 2. Execution Metrics

### 2.1. Success Rate
Calculated strictly over **terminal executions** ($N_{\text{COMPLETED}} + N_{\text{FAILED}}$).
$$
\text{Success Rate} = \frac{N_{\text{COMPLETED}}}{N_{\text{COMPLETED}} + N_{\text{FAILED}}} \times 100
$$

* **Terminal Boundary:** In-flight executions (`RUNNING`, `QUEUED`, `WAITING`, `VALIDATING`) and `CANCELLED` executions are excluded from the denominator.
* **Division-by-Zero Protection:** When $N_{\text{COMPLETED}} + N_{\text{FAILED}} = 0$, the metric returns:
  ```json
  {
    "value": null,
    "formatted": "N/A",
    "sampleSize": 0,
    "isAvailable": false,
    "notes": "No terminal executions in query period"
  }
  ```

### 2.2. Failure Rate
Calculated strictly over terminal executions:
$$
\text{Failure Rate} = \frac{N_{\text{FAILED}}}{N_{\text{COMPLETED}} + N_{\text{FAILED}}} \times 100
$$

---

## 3. Duration & Latency Metrics

### 3.1. Valid Duration Filtering
Durations are filtered to include only finite, non-negative numbers ($d \ge 0$). Invalid, NaN, and negative timestamps are dropped prior to computation.

### 3.2. Mean Duration (Arithmetic Average)
$$
\mu = \frac{1}{N} \sum_{i=1}^{N} d_i
$$

### 3.3. Median Duration ($p50$)
Computed over ascending-sorted durations $S = [d_1, d_2, \dots, d_N]$:
* **Odd $N$:**
  $$
  \text{Median} = S\left[\left\lfloor \frac{N}{2} \right\rfloor\right]
  $$
* **Even $N$:**
  $$
  \text{Median} = \frac{S\left[\frac{N}{2} - 1\right] + S\left[\frac{N}{2}\right]}{2}
  $$

### 3.4. 95th Percentile Duration ($p95$)
Calculated via the nearest-rank method:
$$
\text{Index} = \min\left(\max\left(0, \left\lceil 0.95 \times N \right\rceil - 1\right), N - 1\right)
$$
$$
p95 = S[\text{Index}]
$$

---

## 4. Node Bottleneck Analysis & Statistical Safeguards

To prevent misleading alerts on sparse data, bottleneck detection enforces three strict rules:

### 4.1. Minimum Sample Size Safeguard
* **Condition:** A node must have executed at least **5 times** ($N_{\text{node}} \ge 5$).
* If $N < 5$, `sampleSizeAdequate` is `false`, and no performance warnings (`highDuration`, `highFailureRate`) will fire.

### 4.2. Independent Warning Conditions
* **Duration Warning (`highDuration`):**
  $$
  \text{Duration Ratio} = \frac{\mu_{\text{node}}}{\mu_{\text{workflow}}} > 0.40 \quad (40\%)
  $$
  *(Note: In parallel branches or retry loops, duration ratio may naturally exceed $1.0$ (100%), which is handled gracefully without artificial clamping).*
* **Failure Warning (`highFailureRate`):**
  $$
  \text{Failure Rate} = \frac{N_{\text{FAILED, node}}}{N_{\text{node}}} \times 100 > 15.0\%
  $$

### 4.3. Bottleneck Ranking Score (Sorting Only)
Used strictly as an internal sorting metric to order problematic nodes descending (never displayed as a confidence percentage):
$$
\text{Score} = 0.6 \times \min(\text{Duration Ratio}, 3.0) + 0.4 \times \left(\frac{\text{Failure Rate}}{100}\right)
$$

---

## 5. Time-Series Boundary Specification

All time-series intervals use the standard mathematical boundary rule:
$$
[t_{\text{start}}, t_{\text{end}}) \quad (\text{inclusive start, exclusive end})
$$
* An execution starting at exactly $t_{\text{start}}$ is included in the bucket.
* An execution starting at exactly $t_{\text{end}}$ is excluded from the bucket and counted in the subsequent bucket.
* Any intervals with zero activity are **zero-filled** (`total: 0, completed: 0, failed: 0, meanDurationMs: null`) so that chart visualizations render unbroken, continuous timelines.

---

## 6. AI Pricing & Cost Accounting

Costs are computed dynamically per log entry against the pricing registry active at the timestamp the call occurred (`asOfDate`):
$$
\text{Cost} = \left(\text{Prompt Tokens} \times \frac{\text{Input Price}}{1,000,000}\right) + \left(\text{Completion Tokens} \times \frac{\text{Output Price}}{1,000,000}\right)
$$

* If an AI model tier is missing from the pricing registry, estimated cost returns `costUsd: null` with `isAvailable: false`. Cost is **never fabricated or assumed to be zero**.
