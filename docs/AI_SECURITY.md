# FlowPilot AI Security, Rate Limiting & Safety Controls

## 1. Threat Model & Safeguards

As FlowPilot connects to external Large Language Models, strict security boundaries are enforced to protect user workflows, external credentials, and backend execution environments.

---

## 2. Security Boundaries & Protections

### A. Zero Secret Exposure
- API Keys, bearer tokens, passwords, and webhook secrets are never sent to external LLMs.
- `BaseAIProvider.redactSecrets()` uses pattern matchers to replace:
  - `Bearer <token>` -> `Bearer [REDACTED_TOKEN]`
  - `api_key: "..."` -> `api_key: "[REDACTED_API_KEY]"`
  - `password: "..."` -> `password: "[REDACTED_PASSWORD]"`
  - Slack bot tokens (`xoxb-...`) -> `[REDACTED_SLACK_TOKEN]`
  - Webhook signing secrets (`fpsec_...`) -> `[REDACTED_WEBHOOK_SECRET]`
- Provider API keys stored in `CredentialVault` are encrypted with AES-256-GCM.

### B. Untrusted Output & Prompt Injection Resistance
- **No Direct Execution:** AI-generated graphs are never automatically executed or activated upon generation.
- **Explicit User Review:** Every generated workflow requires human review in the visual preview before saving or activating.
- **Zod & DAG Guardrails:** Raw AI output is passed through Zod schema validation (`configSchema.safeParse`) and Kahn DAG topological sorting (`validateWorkflowGraph`). Hallucinated node types or cyclic structures are rejected immediately.

### C. Rate Limiting & Request Ceilings
- Per-request timeouts (45 seconds) backed by native `AbortController`.
- Maximum token limits (2,500 max output tokens for workflow generation).
- Single-workspace isolation: conversation history stored in `.data/ai_conversations.json` is scoped by `workspaceId`.

