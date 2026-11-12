# FlowPilot — Phase 5: Core Integrations & Production Webhooks

## Executive Summary
Phase 5 transforms FlowPilot into a production-grade external automation platform. Workflows are no longer confined to internal data transformations; they connect with real-world webhooks, transactional email gateways (SMTP), modern chat protocols (Slack, Telegram), cloud spreadsheets (Google Sheets), and arbitrary outbound HTTP APIs protected by Zero-Trust network firewalls.

All credentials and API tokens are secured with authenticated AES-256-GCM encryption in an isolated vault, ensuring zero plain-text leaks to browser runtimes, client DOM, or standard logs.

---

## 1. Architectural Highlights

### 1.1 AES-256-GCM Encrypted Credential Vault
- **Master Key Derivation:** SHA-256 digest of `FLOWPILOT_ENCRYPTION_KEY`.
- **Authenticated Cipher:** `aes-256-gcm` utilizing standard 96-bit random Initialization Vectors (IV) and 128-bit integrity authentication tags.
- **Payload Format:** `iv:tag:ciphertext` stored in secure data volumes.
- **Client Sanitization:** When listing credentials via `/api/v1/credentials`, raw ciphertexts are completely stripped server-side. The client receives only a safe `maskedPreview` (e.g. `xox••••••••1234`), providing cryptographic zero-leakage guarantees.

### 1.2 Production Inbound Webhook System
- **Unguessable Tokens:** 192-bit cryptographic entropy (`whk_...`).
- **Cryptographic HMAC-SHA256:** Verified against incoming raw request body using `crypto.timingSafeEqual` to eliminate timing attacks. Supports `X-FlowPilot-Signature` and standard `X-Hub-Signature-256`.
- **Replay Protection:** Rejects payloads older than 300 seconds using signed timestamp verification (`X-FlowPilot-Timestamp`).
- **Sliding-Window Rate Limiting:** Enforces maximum request limits per token per minute to protect upstream workflow execution.
- **Payload Boundary:** Rejects requests exceeding 1MB (413 Payload Too Large).

### 1.3 Outbound Zero-Trust Network Firewalls (SSRF Guard)
- All external HTTP calls and webhook dispatches validate candidate target URLs against strict IP address blocklists.
- Rejects loopback addresses (`127.0.0.1`, `localhost`, `::1`), private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and cloud instance metadata addresses (`169.254.169.254`).

---

## 2. Supported Core Integrations

| Integration | Type | Auth Protocol | Actions / Triggers Supported |
| :--- | :--- | :--- | :--- |
| **Production Webhooks** | Trigger | Unguessable Token / HMAC-SHA256 | Inbound event ingestion, payload routing, status audit |
| **HTTP / REST API** | Action | Bearer Token, Basic Auth, API Key | Outbound GET, POST, PUT, PATCH, DELETE with SSRF Guard |
| **Transactional Email** | Action | SMTP / TLS Handshake | Dynamic recipient templating, HTML body, message tracking |
| **Google Sheets** | Action | OAuth 2.0 / Bearer | `readRows`, `appendRow`, `updateRow` |
| **Slack** | Action | Bot User Token (`xoxb-...`) | `sendMessage` to targeted channels or users |
| **Telegram** | Action | Bot API Token (`<botId>:<hash>`) | `sendMessage` to channels or chat groups |

---

## 3. Verified Canonical Workflow Execution
The canonical workflow demonstrated in the Phase 4 and Phase 5 architecture was executed end-to-end:

```
[Universal Webhook] 
       ↓
[Get Record (HTTP GET Request)] 
       ↓
[Check if record exists (Branch on Expression)]
       ↓ (TRUE)                           ↓ (FALSE)
[Send Email (Update Notification)]     [Send Notification (Slack Alert)]
       [COMPLETED]                               [SKIPPED]
```

### Verified Execution Trace (`exec_ozw1adon`):
- **Status:** `COMPLETED`
- **Total Duration:** 606ms
- **Step 1 (Universal Webhook):** Ingested JSON webhook payload in 0ms.
- **Step 2 (Get Record):** Outbound GET to GitHub API completed in 598ms with HTTP 200 OK.
- **Step 3 (Check if record exists):** Evaluated `{{ $steps.node_get_record.output.status }} == 200` to `true`.
- **Step 4 (Send Email):** Dispatched email to `crm-sync@flowpilot.io` with subject `✅ CRM Record Verified: octocat` in 1ms.
- **Step 5 (Send Notification):** Correctly marked `SKIPPED` via topological execution planner.

---

## 4. Verification Evidence & Test Summary
- **Total Vitest Tests:** **53 / 53 passed (100%)**
- **Test Suites:**
  - `tests/phase5_integrations.test.ts` (17 tests passed)
  - `tests/phase4_execution.test.ts` (15 tests passed)
  - `tests/phase3_builder.test.ts` (7 tests passed)
  - `tests/ui_store.test.ts` (8 tests passed)
  - `tests/engine.test.ts` (6 tests passed)
- **Production Build:** `next build` compiled with 0 errors across 15 static and dynamic routes.
