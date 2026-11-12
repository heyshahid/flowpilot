# FlowPilot — Node Catalog & Configuration Specifications

> **Module:** Standard Node Library  
> **Schema Standard:** Zod Validation + JSON Schema Exporter  
> **Scope:** Core MVP Nodes (Phase 1 Baseline)  

---

## 1. Node Taxonomy & Architecture

Every node in FlowPilot belongs to one of 5 distinct categories:
1. **Triggers:** Entry point of the workflow graph (e.g. Webhook, Manual, Schedule). Exactly one trigger is active per workflow instance.
2. **Actions:** Side-effect performing nodes (e.g. HTTP Request, Send Email, Database Operation).
3. **Logic:** Flow-control nodes that branch, loop, or gate execution (e.g. If/Else, Switch, Filter, Delay).
4. **Data:** Transformation and data restructuring nodes (e.g. JSON Parser, Variable Setter, Text Formatter).
5. **AI:** LLM-powered cognitive nodes (e.g. Prompt Completion, Text Classification, Data Extractor).

---

## 2. Core MVP Node Specifications

### 2.1 Manual Trigger (`trigger.manual`)
- **Category:** Trigger
- **Purpose:** Allows instant on-demand workflow testing from the FlowPilot UI with custom test payload.
- **Input Handles:** None
- **Output Handles:** `default`
- **Configuration Schema:**
```typescript
export const ManualTriggerConfigSchema = z.object({
  samplePayload: z.record(z.unknown()).default({}),
  description: z.string().optional(),
});
```
- **Output Data Structure:**
```json
{
  "triggeredBy": "user@example.com",
  "timestamp": "2026-11-12T16:45:00.000Z",
  "payload": { "testKey": "testValue" }
}
```

---

### 2.2 Webhook Trigger (`trigger.webhook`)
- **Category:** Trigger
- **Purpose:** Exposes a secure HTTP endpoint to receive incoming webhooks from external services (Stripe, GitHub, Typeform, Shopify).
- **Input Handles:** None
- **Output Handles:** `default`
- **Configuration Schema:**
```typescript
export const WebhookTriggerConfigSchema = z.object({
  httpMethod: z.enum(['POST', 'GET', 'ANY']).default('POST'),
  secretHeaderName: z.string().optional(), // e.g. 'x-webhook-secret'
  responseStatusCode: z.number().int().default(200),
  responseBody: z.string().default('{"success": true}'),
});
```
- **Output Data Structure:**
```json
{
  "headers": {
    "content-type": "application/json",
    "x-signature": "sha256=abcdef..."
  },
  "query": { "source": "landing_page" },
  "body": {
    "lead_name": "Sarah Connor",
    "lead_email": "sarah@cyberdyne.com",
    "budget": 50000
  }
}
```

---

### 2.3 HTTP Request Action (`action.httpRequest`)
- **Category:** Action
- **Purpose:** Makes an outbound REST/GraphQL HTTP call with SSRF protection, custom headers, query params, and body.
- **Input Handles:** `default`
- **Output Handles:** `default`
- **Configuration Schema:**
```typescript
export const HttpRequestConfigSchema = z.object({
  url: z.string().url('Must be a valid HTTP/HTTPS URL'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  headers: z.record(z.string()).default({}),
  queryParams: z.record(z.string()).default({}),
  bodyType: z.enum(['none', 'json', 'form', 'raw']).default('json'),
  bodyContent: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(60000).default(30000),
  retryOnFailure: z.boolean().default(true),
  continueOnError: z.boolean().default(false),
});
```
- **Output Data Structure:**
```json
{
  "status": 200,
  "statusText": "OK",
  "headers": { "content-type": "application/json" },
  "data": {
    "id": 1042,
    "created": true
  },
  "durationMs": 182
}
```

---

### 2.4 If / Else Condition (`logic.ifElse`)
- **Category:** Logic
- **Purpose:** Evaluates boolean rules against incoming data and routes execution to either the `true` or `false` branch.
- **Input Handles:** `default`
- **Output Handles:** 
  - `true` (Condition met)
  - `false` (Condition failed)
- **Configuration Schema:**
```typescript
export const ConditionRuleSchema = z.object({
  field: z.string(), // e.g. "{{ $trigger.body.budget }}"
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'greater_than',
    'less_than',
    'is_empty',
    'is_not_empty'
  ]),
  value: z.string(),
});

export const IfElseConfigSchema = z.object({
  logicalOperator: z.enum(['AND', 'OR']).default('AND'),
  rules: z.array(ConditionRuleSchema).min(1),
});
```
- **Output Data Structure:**
```json
{
  "result": true,
  "matchedRules": 1,
  "totalRules": 1
}
```

---

### 2.5 Send Email Action (`action.sendEmail`)
- **Category:** Action
- **Purpose:** Sends transactional emails via SMTP or API providers (Resend, SendGrid) with HTML or Markdown content.
- **Input Handles:** `default`
- **Output Handles:** `default`
- **Configuration Schema:**
```typescript
export const SendEmailConfigSchema = z.object({
  credentialId: z.string().optional(), // Reference to encrypted SMTP credentials
  to: z.string().min(1, 'Recipient email is required'),
  subject: z.string().min(1, 'Subject is required'),
  bodyType: z.enum(['text', 'html']).default('html'),
  content: z.string().min(1, 'Email body is required'),
  fromName: z.string().default('FlowPilot Automation'),
});
```
- **Output Data Structure:**
```json
{
  "messageId": "<msg_123456@smtp.provider.com>",
  "sent": true,
  "recipient": "sarah@cyberdyne.com",
  "timestamp": "2026-11-12T16:45:02.100Z"
}
```

---

### 2.6 Data Transformer (`data.transform`)
- **Category:** Data
- **Purpose:** Sets, formats, renames, and maps variables from previous steps into a clean JSON structure.
- **Input Handles:** `default`
- **Output Handles:** `default`
- **Configuration Schema:**
```typescript
export const DataTransformConfigSchema = z.object({
  assignments: z.array(z.object({
    key: z.string().min(1),
    valueExpression: z.string(), // e.g. "{{ $steps.http.data.name | uppercase }}"
  })),
});
```

---

### 2.7 AI Text Generator (`ai.textGeneration`)
- **Category:** AI
- **Purpose:** Prompts an LLM (Gemini / OpenAI / Anthropic) to summarize, draft emails, classify sentiment, or extract structured JSON.
- **Input Handles:** `default`
- **Output Handles:** `default`
- **Configuration Schema:**
```typescript
export const AiTextGenConfigSchema = z.object({
  model: z.string().default('gemini-2.5-flash'),
  systemPrompt: z.string().default('You are an expert business assistant.'),
  userPrompt: z.string().min(1),
  temperature: z.number().min(0).max(1).default(0.7),
  jsonMode: z.boolean().default(false),
});
```
