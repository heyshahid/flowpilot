# FlowPilot — Recommendation Security & RBAC (Phase 9G)

## 1. Role-Based Access Control (RBAC) Matrix

Recommendations integrate directly with FlowPilot's multi-tenant RBAC system. Four explicit permissions govern the module:

1. `recommendation:read`: View overview metrics, list recommendations, and inspect evidence details.
2. `recommendation:evaluate`: Trigger on-demand workspace diagnostic evaluations.
3. `recommendation:manage`: Transition lifecycle states (dismiss, snooze, resolve).
4. `recommendation:feedback`: Submit helpfulness feedback and qualitative comments.

### Permission Mapping by Role

| Permission | OWNER | ADMIN | EDITOR | VIEWER |
| :--- | :---: | :---: | :---: | :---: |
| `recommendation:read` | ✅ | ✅ | ✅ | ✅ |
| `recommendation:evaluate` | ✅ | ✅ | ✅ | ❌ |
| `recommendation:manage` | ✅ | ✅ | ❌ | ❌ |
| `recommendation:feedback` | ✅ | ✅ | ✅ | ❌ |

---

## 2. Multi-Tenant Workspace Isolation

- Recommendations are strictly partitioned by `workspaceId`.
- API endpoints authenticate requests and filter store queries using `req.workspaceId`.
- Cross-workspace queries return `403 Forbidden` or empty results.
- In-memory evaluation locks (`RecommendationEngine.activeEvaluations`) are scoped per workspace (`ws_...`).

---

## 3. Sensitive Data Redaction & Privacy

To protect customer secrets and sensitive operational variables:
- **Redacted Fields**: API tokens, authorization headers, passwords, bearer credentials, and private keys are never stored in `evidence` or `description`.
- **Payload Truncation**: Evidence values are truncated to 500 characters and sanitized before persistence.
- **Audit Logging**: All lifecycle transitions and manual evaluation triggers emit audit logs to `auditLogStore` with `resourceType: 'recommendation'`. Actor ID, IP address, and changed parameters are logged with sensitive fields redacted.

