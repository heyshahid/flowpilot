# FlowPilot Production Webhook Security

## 1. Threat Model & Mitigations

| Threat | Attack Vector | FlowPilot Mitigation |
| :--- | :--- | :--- |
| **Tampered Payloads** | Man-in-the-middle modifying request body | Cryptographic HMAC-SHA256 signature verification over raw bytes |
| **Timing Attacks** | Measuring byte comparison response time | `crypto.timingSafeEqual` over fixed-length binary buffers |
| **Replay Attacks** | Capturing and resending valid payloads later | Timestamp verification (`X-FlowPilot-Timestamp`) within 300s window |
| **Denial of Service** | Flooding webhook URLs with high-volume traffic | Sliding-window in-memory rate limiter per token |
| **Memory Exhaustion** | Sending gigabyte-sized JSON payloads | 1MB payload ceiling enforced before JSON parsing |
| **Internal Scanning** | Forcing outbound webhooks to internal IPs | Zero-Trust SSRF IP filter rejecting RFC 1918 and metadata endpoints |

## 2. Inbound Webhook Headers
When publishing webhooks to FlowPilot:
```http
POST /api/v1/webhooks/whk_48a9f029b9e14a89bc213890 HTTP/1.1
Host: flowpilot.company.com
Content-Type: application/json
X-FlowPilot-Signature: sha256=a1b2c3d4e5f6...
X-FlowPilot-Timestamp: 1731435375
Content-Length: 124

{"event": "lead.created", "company": "Acme Corp", "budget": 50000}
```

## 3. Secret Rotation
Webhook HMAC signing secrets can be rotated with zero downtime using `POST /api/v1/webhooks/{token}/rotate-secret`.
