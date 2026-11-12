# FlowPilot — Workflow Graph Schema Specification

> **Module:** Visual Workflow Graph Representation  
> **Standard:** Directed Acyclic Graph (DAG) Serialization Format  
> **Version:** 1.0.0  

---

## 1. Graph Entity Overview

Every workflow in FlowPilot is modeled as a Directed Acyclic Graph $G = (V, E)$, serialized into a standard JSON schema:

```json
{
  "id": "wf_lead_qualification",
  "name": "Inbound Lead Qualification & VIP Routing",
  "description": "Ingests webhook leads, checks budget threshold, and notifies VIP sales reps.",
  "status": "active",
  "nodes": [ ... ],
  "edges": [ ... ],
  "createdAt": "2026-11-12T16:00:00.000Z",
  "updatedAt": "2026-11-12T17:30:00.000Z"
}
```

---

## 2. Node Schema (`WorkflowNode`)

```typescript
export interface WorkflowNode<TConfig = Record<string, unknown>> {
  id: string;               // Unique string identifier (e.g. "node_webhook_a1b2")
  type: string;             // Type key registered in Central Node Registry (e.g. "trigger.webhook")
  category: 'trigger' | 'action' | 'logic' | 'data' | 'ai';
  name: string;             // User-editable display name
  description?: string;     // Contextual documentation
  config: TConfig;          // Node parameters validated via Zod schema
  position?: {              // 2D coordinates on the canvas
    x: number;
    y: number;
  };
}
```

---

## 3. Edge Schema (`WorkflowEdge`)

Connections link output ports (sources) to input ports (targets):

```typescript
export interface WorkflowEdge {
  id: string;               // Unique edge identifier (e.g. "e_node1_node2")
  source: string;           // Source Node ID
  target: string;           // Target Node ID
  sourceHandle?: string;    // Output port handle ID (e.g. "true", "false", "default")
  targetHandle?: string;    // Input port handle ID (default: "default")
}
```

### 3.1 Handle Routing for Conditional Nodes
For branching nodes like `logic.ifElse`:
- `sourceHandle: "true"` — Downstream nodes traversed when the boolean condition evaluates to true.
- `sourceHandle: "false"` — Downstream nodes traversed when the boolean condition evaluates to false.

---

## 4. Connection Rules & Invariants

The Graph Validation Engine enforces the following strict invariants:
1. **No Self-Connections:** An edge cannot have `source === target`.
2. **No Duplicate Connections:** Multiple edges between the same source handle and target handle are rejected.
3. **Trigger Input Restriction:** Nodes of category `trigger` cannot serve as the `target` of any edge.
4. **Acyclicity:** Cycles are detected via Kahn's algorithm and rejected.
