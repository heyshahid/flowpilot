# FlowPilot Audit Logging Architecture

## 1. Overview & Tamper-Resistance

The FlowPilot audit system creates an append-only, immutable record of critical administrative and data-mutation events within a workspace. Audit records are isolated per workspace and are viewable by any authorized member via the `/audit-logs` dashboard.

```
[ Actor Performs Action ] ──► [ Interceptor Captures Event ]
                                       │
                                       ▼
                       [ Redact Passwords / Tokens / Secrets ]
                                       │
                                       ▼
                       [ Immutable Append to .data/audit_logs.json ]
                                       │
                                       ▼
                       [ Viewable at GET /api/v1/workspaces/{id}/audit-logs ]
```

## 2. Event Types & Triggers

| Event Key | Trigger Context | Monitored Metadata |
| :--- | :--- | :--- |
| `workspace.created` | New workspace initialized | Workspace name, tier plan |
| `workspace.updated` | Settings / policies changed | Updated fields |
| `workspace.archived` | Workspace put in cold storage | Archived timestamp |
| `workspace.ownership_transferred` | Primary owner role handed over | Previous owner, new owner email |
| `member.invited` | Teammate invited by email | Target email, assigned role |
| `member.accepted` | User joins workspace via token | User ID, role, invitation ID |
| `member.role_changed` | User promoted / demoted | Target user, new role |
| `member.removed` | Member deleted from team | Target user ID |
| `member.suspended` | Member access frozen | Status: suspended |
| `workflow.created` | New DAG pipeline saved | Workflow ID, trigger type |
| `workflow.updated` | Canvas nodes/edges edited | New version number |
| `workflow.deleted` | Workflow deleted from workspace | Target workflow ID & name |
| `credential.created` | Integration API key saved | Integration ID, masked preview |
| `credential.revoked` | Key deleted from vault | Credential ID & name |
| `schedule.created` | Cron job registered | Workflow ID, cron expression |
| `webhook.created` | Production webhook created | Endpoint token, auth type |

## 3. Data Sanitization & Secret Redaction

Audit log records must never leak secrets, passwords, or authentication tokens into logs or client views.

FlowPilot automatically enforces a recursive sanitizer before any event is written to storage:
- Any key matching `secret`, `token`, `password`, `key`, or `auth` is replaced with `[REDACTED]`.
- IP addresses, user IDs, and timestamps are preserved for forensics without exposing raw authentication payloads.
