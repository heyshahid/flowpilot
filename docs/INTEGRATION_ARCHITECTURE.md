# FlowPilot Integration Architecture

## 1. Overview
FlowPilot's integration layer decouples third-party service contracts from the workflow runtime. Every service connector implements the standard `IntegrationAdapter` interface, which defines two key methods:
1. `testConnection(credentials)`: Validates credentials and verifies network reachability before saving.
2. `executeAction(actionId, params, credentials)`: Invokes service-specific functionality with validated schemas.

## 2. Component Diagram

```
                 ┌──────────────────────────────────────────────┐
                 │          Central Integration Registry        │
                 └──────────────────────┬───────────────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
┌────────────────────┐       ┌────────────────────┐       ┌────────────────────┐
│    HttpAdapter     │       │    SmtpAdapter     │       │  GoogleSheetsAdapter│
│ (Outbound + SSRF)  │       │ (TLS/Mailgun/etc.) │       │  (OAuth2 & Sheets) │
└────────────────────┘       └────────────────────┘       └────────────────────┘
           │                            │                            │
           ▼                            ▼                            ▼
┌────────────────────┐       ┌────────────────────┐       ┌────────────────────┐
│    SlackAdapter    │       │  TelegramAdapter   │       │   WebhookManager   │
│ (Bot API xoxb-...) │       │ (Bot API / Chat)   │       │ (HMAC-SHA256 Token)│
└────────────────────┘       └────────────────────┘       └────────────────────┘
```

## 3. Security Principles
1. **Isolated Keyrings:** Credentials never travel in workflow JSON graphs. Workflows only reference abstract IDs (e.g. `credentialId: "cred_sample_smtp"`).
2. **Zero-Trust Network Interceptor:** All outbound sockets created by `HttpAdapter` and `WebhookManager` pass through `validateOutboundUrl()`.
3. **No Dynamic Code Evaluation:** Templated variables (`{{ $steps.foo.output.bar }}`) are resolved through an AST-based tokenizer, completely eliminating `eval()` and `Function()`.
