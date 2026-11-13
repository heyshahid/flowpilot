# FlowPilot Sub-Workflows & Modular Composition

## 1. Overview

Sub-workflows allow users to decompose complex enterprise automations into clean, reusable modules. A parent workflow can invoke one or more child workflows, pass typed input payloads, and receive output artifacts.

---

## 2. Guardrails & Safety Architecture

```mermaid
flowchart TD
    Invoke["Sub-Workflow Node Called"] --> DepthCheck{"callStack.length >= 5?"}
    DepthCheck -- "Yes" --> MaxDepthError["Throw Max Depth Exceeded (5)"]
    DepthCheck -- "No" --> RecursionCheck{"Target in callStack?"}
    RecursionCheck -- "Yes" --> CircularError["Throw Circular Recursion Error"]
    RecursionCheck -- "No" --> EnqueueChild["Enqueue Child Workflow Execution"]
    EnqueueChild --> WaitChild["Await Child Execution Completion"]
    WaitChild --> Aggregate["Aggregate Child Outputs & Traces"]
```

### 1. Depth Caps (`MAX_SUBWORKFLOW_DEPTH = 5`)
- Any workflow chain nested deeper than 5 calls is immediately halted with a descriptive runtime error.

### 2. Circular Recursion Prevention
- An immutable ancestor call stack array (`$callStack: string[]`) is propagated across execution boundaries.
- If a workflow attempts to invoke itself directly or indirectly via any ancestor currently in its call stack, the driver throws `Circular workflow recursion detected: wf_A -> wf_B -> wf_A` before enqueuing.

### 3. Context & Trace Aggregation
- Child execution IDs are tracked in the parent trace record.
- Node runtime driver: `src/core/runtime/drivers/subWorkflow.ts`.
- The parent node returns:
  ```json
  {
    "childExecutionId": "exec_sub_xyz",
    "status": "completed",
    "outputs": { ... },
    "durationMs": 420
  }
  ```
