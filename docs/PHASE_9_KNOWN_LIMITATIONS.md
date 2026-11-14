# FlowPilot — Phase 9 Known Technical Limitations & Operational Boundaries

This document records the verified engineering boundaries, persistence characteristics, and single-instance trade-offs across **Phase 9: Analytics, Monitoring, and Optimization**.

These limitations are architectural characteristics of the development milestone and are scheduled for distributed hardening in **Phase 10**.

---

## 1. Single-Process In-Memory Concurrency & Locks

- **Limitation**: Concurrency guards—such as `RecommendationEngine.activeEvaluations` and in-flight alert evaluation sets—operate purely within the memory heap of a single Node.js runtime process.
- **Impact**: In a multi-instance containerized or auto-scaling cluster, two different instances could evaluate the same workspace simultaneously if not coordinated externally.
- **Phase 10 Hardening Target**: Implement a distributed locking mechanism (e.g. Redis Redlock or database advisory locks).

---

## 2. File-Backed JSON Persistence

- **Limitation**: Telemetry and operational state are persisted across multi-file JSON stores in `.data/*.json` (e.g., `recommendations.json`, `alert_incidents.json`, `workspace_limits.json`).
- **Impact**: While atomic file writes (`fs.writeFileSync`) and in-memory caches protect local consistency and survive process restarts, high-throughput concurrent writes from independent operating system processes could result in race conditions.
- **Phase 10 Hardening Target**: Migrate operational state stores to PostgreSQL / Supabase with database-level ACID transactions and row-level locking.

---

## 3. Rolling Telemetry Buffer Limits

- **Limitation**:
  - `ExecutionStore`: Query listings default to a bounded window of the 500 most recent executions per workspace.
  - `WebhookStore`: Inbound delivery history is maintained in a 500-record rolling circular buffer. Older delivery logs are pruned.
- **Impact**: Long-term historical trend analysis spanning months or years is not retained in local JSON files.
- **Phase 10 Hardening Target**: Offload raw execution traces and delivery logs to an append-only time-series data warehouse (e.g. ClickHouse or TimescaleDB).

---

## 4. Single-Node In-Process Worker & Scheduler

- **Limitation**: The worker heartbeat and FIFO task queue in `monitoringService` reflect single-instance local worker loops.
- **Impact**: Reporting healthy worker status confirms that the local Node.js event loop is operational and heartbeating, but does not represent distributed worker queue health across multiple worker pods.
- **Phase 10 Hardening Target**: Introduce BullMQ / Celery / Temporal queue workers with dedicated distributed queue telemetry.

---

## 5. AI Cost Estimation vs Vendor Invoicing

- **Limitation**: AI usage calculations reflect standard published provider API token prices configured in `AIPricingManager`.
- **Impact**: Estimated costs do not account for negotiated enterprise volume discounts, prompt caching rebates, batch API discounts, or unpriced newly released models (which are flagged as unpriced rather than assumed zero). They are advisory estimates, not confirmed provider invoices.

---

## 6. Static Graph Analysis & Parallelization Uncertainty

- **Limitation**: Category 8 and Category 1 architecture evaluators inspect canvas edge topology and search for explicit variable interpolations (`steps.<nodeId>`).
- **Impact**: Graph topology alone cannot detect hidden temporal couplings, external database row locks, or remote rate limits. Candidates are therefore prominently marked with `[Candidate - Requires Verification]` and mandate developer inspection before workflow modification.

