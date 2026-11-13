# FlowPilot Workspace Architecture & Isolation

## 1. Multi-Tenant Workspace Hierarchy

FlowPilot introduces full workspace isolation to transition from an individual-developer tool to a multi-tenant enterprise workflow platform. Every resource belongs to a specific workspace and cannot be accessed or executed across workspace boundaries.

```
                    ┌─────────────────────────┐
                    │      FlowPilot SaaS     │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         ▼                                               ▼
┌───────────────────────────────┐       ┌───────────────────────────────┐
│  Acme Production Workspace    │       │     Staging & QA Labs         │
│  ID: ws_default (Plan: Pro)   │       │  ID: ws_staging (Plan: Free)  │
├───────────────────────────────┤       ├───────────────────────────────┤
│ • Workflows & Versions        │       │ • Workflows & Versions        │
│ • Execution Traces & Queues   │       │ • Execution Traces & Queues   │
│ • AES-256-GCM Credentials     │       │ • AES-256-GCM Credentials     │
│ • Webhook Ingestion Endpoints │       │ • Webhook Ingestion Endpoints │
│ • Cron & Recurring Schedules  │       │ • Cron & Recurring Schedules  │
│ • AI Conversations & Usage    │       │ • AI Conversations & Usage    │
│ • Immutable Audit Logs        │       │ • Immutable Audit Logs        │
└───────────────────────────────┘       └───────────────────────────────┘
```

## 2. Resource Scoping Matrix

| Resource Type | Scope Identifier | Enforced Store | Cross-Workspace Access Policy |
| :--- | :--- | :--- | :--- |
| **Workflows** | `workspaceId` | `WorkflowStore` | Strict 404 / 403. Cannot view or execute workflows outside workspace. |
| **Workflow Versions** | `workspaceId` | `VersionStore` | Versions are bound to the parent workflow's workspace. |
| **Executions** | `workspaceId` | `ExecutionStore` | Execution traces, inputs, and outputs are isolated. |
| **Credentials** | `workspaceId` | `CredentialStore` | Encrypted secrets are scoped to workspace. Non-members cannot decrypt. |
| **Webhooks** | `workspaceId` | `WebhookStore` | Ingestion tokens and signing secrets are workspace-specific. |
| **Schedules** | `workspaceId` | `ScheduleStore` | Cron triggers only dispatch workflows within the same workspace. |
| **AI Conversations** | `workspaceId` | `AIConversationStore` | Conversational history and generated proposals are private to workspace. |
| **AI Token Usage** | `workspaceId` | `AIUsageStore` | Token quotas and USD costs are accounted per workspace. |
| **Audit Logs** | `workspaceId` | `AuditLogStore` | Audit trails are tamper-resistant and scoped per workspace. |

## 3. Context Resolution & Switching

1. **Resolution Priority:**
   - Explicit HTTP Header: `x-workspace-id`
   - URL Query Parameter: `?workspaceId=ws_...`
   - Persistent Browser Cookie: `fp_active_workspace=ws_...`
   - Default Fallback: `ws_default`

2. **Backend Guard:**
   - Every API endpoint invokes `AuthContextManager.enforceWorkspaceIsolation(req, targetWorkspaceId, requiredPermission)`.
   - Cross-workspace requests return `403 Forbidden` with `Cross-workspace access violation`.
