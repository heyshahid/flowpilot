# FlowPilot Advanced Logic & Data Nodes

## 1. Overview

Phase 6 introduces enterprise control-flow primitives to the FlowPilot execution graph:
1. **Delay (`logic.delay`)**
2. **Wait Until (`logic.waitUntil`)**
3. **Loop / Iterator (`logic.loop` / `data.loop`)**
4. **Switch / Multi-Condition Branching (`logic.switch` / `logic.advancedCondition`)**
5. **Merge / Branch Join (`logic.merge`)**

---

## 2. Node Specifications

### 2.1 Delay Node (`logic.delay`)
- **Driver**: `src/core/runtime/drivers/delay.ts`
- **Configuration**:
  - `duration`: Numeric duration.
  - `unit`: `'seconds' | 'minutes' | 'hours' | 'days'`.
- **Behavior**:
  - Automatically converts all durations into milliseconds.
  - Enforces hard ceiling of 30 days (2,592,000,000 ms) to prevent infinite or runaway delays.
  - Performs non-blocking asynchronous sleeping with `AbortSignal` listener for cancellation.

### 2.2 Wait Until Node (`logic.waitUntil`)
- **Driver**: `src/core/runtime/drivers/waitUntil.ts`
- **Configuration**:
  - `targetTimestamp`: ISO 8601 string or dynamic expression (e.g. `{{$trigger.body.scheduled_at}}`).
- **Behavior**:
  - Validates date validity. If the target timestamp is already in the past, it resolves immediately with status `already_passed`.
  - Calculates remaining milliseconds, enforcing the 30-day safety cap.

### 2.3 Loop Node (`logic.loop`)
- **Driver**: `src/core/runtime/drivers/loop.ts`
- **Configuration**:
  - `items`: Target array or iterable expression (e.g. `{{$node.fetchRecords.records}}`).
  - `maxIterations`: Safety threshold (default: 100, max: 1000).
  - `batchSize`: Parallel chunk processing size (default: 1).
- **Execution Metadata**:
  - Each item iteration injects contextual variables:
    - `index`: 0-based iteration index.
    - `isFirst`: boolean.
    - `isLast`: boolean.
    - `item`: current element payload.
    - `total`: total items count.

### 2.4 Switch / Advanced Branching (`logic.switch`)
- **Driver**: `src/core/runtime/drivers/advancedCondition.ts`
- **Configuration**:
  - `mode`: `'rules' | 'switch'`.
  - In `rules` mode: Evaluates compound conditions with nested AND/OR operators: `equals`, `not_equals`, `contains`, `greater_than`, `less_than`, `is_empty`, `regex`.
  - In `switch` mode: Matches an expression against multiple cases (`case_1`, `case_2`, etc.) and falls back to `default`.
- **Dynamic Branch Routing**: The worker routes downstream nodes via custom output handles matching the branch result.

### 2.5 Merge Node (`logic.merge`)
- **Driver**: `src/core/runtime/drivers/merge.ts`
- **Configuration**:
  - `mode`: `'wait_all' | 'wait_any' | 'pass_through'`.
- **Topological DAG Resilience**:
  - Works with `ExecutionPlanner`'s skip propagation.
  - Downstream merge nodes are only marked skipped if *all* parent predecessors were skipped (`allParentsSkipped = true`).
  - Aggregates payload results from all completed ancestor branches.
