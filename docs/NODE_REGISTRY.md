# FlowPilot — Centralized Node Registry Specification

> **Module:** Standard Node Library  
> **Source of Truth:** `src/core/registry/nodeRegistry.ts`  
> **Registry Size:** 15 Standard Nodes across 5 Categories  

---

## 1. Registry Architecture

The node registry provides a single source of truth for:
1. **The Node Library Palette** (draggables, search, icons).
2. **The Canvas Node Cards** (handles, category badges, inline action controls).
3. **The Node Inspector** (dynamic form schemas, input validation).
4. **The Graph Validation Engine** (schema enforcement).

```typescript
export interface NodeDefinition<TConfig> {
  type: string;
  displayName: string;
  description: string;
  category: 'trigger' | 'action' | 'logic' | 'data' | 'ai';
  icon: string;
  version: number;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  defaultConfig: TConfig;
  configSchema: z.ZodSchema<TConfig>;
  validate(config: unknown): { isValid: boolean; errors: string[] };
}
```

---

## 2. Catalog of Standard Nodes

### A. TRIGGERS
| Type | Display Name | Inputs | Outputs | Description |
| :--- | :--- | :--- | :--- | :--- |
| `trigger.manual` | Manual Trigger | None | `default` | On-demand test execution with custom variables. |
| `trigger.webhook` | Webhook Trigger | None | `default` | Inbound HTTP POST/GET listener for external events. |
| `trigger.schedule` | Scheduled Trigger | None | `default` | Cron-based time schedule triggering. |

### B. ACTIONS
| Type | Display Name | Inputs | Outputs | Description |
| :--- | :--- | :--- | :--- | :--- |
| `action.httpRequest` | HTTP Request | `default` | `default` | Outbound REST client with SSRF firewall protection. |
| `action.sendEmail` | Send Email | `default` | `default` | Transactional email delivery via SMTP or Resend. |
| `action.sendNotification`| Send Notification | `default` | `default` | In-app alerts or team messaging webhook notifications. |

### C. LOGIC
| Type | Display Name | Inputs | Outputs | Description |
| :--- | :--- | :--- | :--- | :--- |
| `logic.ifElse` | If / Else Branch | `default` | `true`, `false` | Conditional rule evaluator with dual branch routing. |
| `logic.filter` | Filter | `default` | `default` | Payload gatekeeper halting execution if rules fail. |
| `logic.merge` | Merge | `default` | `default` | Fan-in synchronization joining multiple branches. |

### D. DATA
| Type | Display Name | Inputs | Outputs | Description |
| :--- | :--- | :--- | :--- | :--- |
| `data.setVariable` | Set Variable | `default` | `default` | Creates or updates variables in the workflow context. |
| `data.transform` | Data Transform | `default` | `default` | Formats, trims, converts case, or serializes JSON. |
| `data.jsonParser` | JSON Parser | `default` | `default` | Parses JSON strings into structured objects. |

### E. AI
| Type | Display Name | Inputs | Outputs | Description |
| :--- | :--- | :--- | :--- | :--- |
| `ai.textGeneration` | AI Text Generator | `default` | `default` | LLM prompt completion (Gemini 2.5 Flash / GPT-4o Mini). |
| `ai.classification` | AI Classification | `default` | `default` | Categorizes text into predefined intent/topic buckets. |
| `ai.summarization` | AI Summarization | `default` | `default` | Summarizes lengthy transcripts, notes, or tickets. |

