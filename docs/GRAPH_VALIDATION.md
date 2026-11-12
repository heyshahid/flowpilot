# FlowPilot — Graph Validation Engine Specification

> **Module:** Canvas & Workflow Graph Integrity Engine  
> **Source of Truth:** `src/core/validation/graphValidator.ts`  
> **Integration:** Real-time canvas linter and save gatekeeper  

---

## 1. Overview

The **Graph Validation Engine** performs static analysis on the workflow graph prior to saving or execution. It prevents broken graphs, infinite loops, and malformed configurations from being committed to the database.

---

## 2. Validation Rule Catalog

| Rule Code | Severity | Description |
| :--- | :--- | :--- |
| `MISSING_TRIGGER` | Error | Workflow must contain at least one Trigger node (`trigger.manual`, `trigger.webhook`, etc.). |
| `MULTIPLE_TRIGGERS` | Warning | Informs the user when multiple triggers exist (each trigger acts as an independent entry point). |
| `UNKNOWN_NODE_TYPE`| Error | Intercepts unregistered or corrupt node types. |
| `INVALID_CONFIG` | Error | Evaluates node parameters against the Zod schema defined in the Central Registry. |
| `CYCLIC_DEPENDENCY`| Error | Runs Kahn’s topological sort algorithm to detect closed cycles and circular loops. |
| `ORPHAN_EDGE_SOURCE`| Error | Detects edges whose source node no longer exists. |
| `ORPHAN_EDGE_TARGET`| Error | Detects edges whose target node no longer exists. |
| `DISCONNECTED_NODE`| Warning | Warns when non-trigger nodes have no incoming connection (they will never receive execution data). |
| `INCOMPLETE_BRANCH`| Warning | Warns if an `If/Else` node is missing a connection on either its `TRUE` or `FALSE` output handle. |

---

## 3. Connection-Time Guards (`isValidConnection`)

In addition to whole-graph validation, the canvas enforces connection guards in real time:
- **Self-Loop Prevention:** Rejects dragging a connection line from a node back to itself.
- **Trigger Target Guard:** Rejects connecting an edge into a Trigger node (Triggers have no inputs).
- **Duplicate Connection Guard:** Rejects creating redundant parallel edges between the exact same handles.
