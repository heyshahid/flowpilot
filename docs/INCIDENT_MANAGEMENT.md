# FlowPilot Operational Incident Management

**Milestone:** Phase 9F — Module 9F-C  
**Target:** Incident Lifecycle State Machine, Deduplication & Triage  
**Route:** `/alerts` (Active Incidents tab)  
**Endpoints:** `/api/v1/alerts/incidents`, `/api/v1/alerts/incidents/[id]/acknowledge`, `/api/v1/alerts/incidents/[id]/resolve`  

---

### 1. Incident Lifecycle State Machine

Operational incidents progress through a deterministic three-phase lifecycle:

```
+-------------+         acknowledge()          +------------------+
|  TRIGGERED  | -----------------------------> |   ACKNOWLEDGED   |
+-------------+                                +------------------+
       |                                                 |
       |                   resolve()                     |
       +-------------------------------------------------+
                               |
                               v
                       +---------------+
                       |   RESOLVED    |
                       +---------------+
```

1. **`TRIGGERED`**:
   * Initial state when an enabled alert rule condition evaluates to true.
   * Notifications are dispatched to all configured channels.
   * If re-triggered before acknowledgment or resolution, the existing incident's `occurrenceCount` and `lastSeenAt` are updated without spawning duplicate entries.

2. **`ACKNOWLEDGED`**:
   * Indicates that an operator or administrator is actively investigating the issue.
   * Records `acknowledgedAt` timestamp and `acknowledgedBy` actor ID.
   * Deduplication prevents re-alerting while acknowledged.

3. **`RESOLVED`**:
   * Terminal state indicating the condition has cleared or remediation was completed.
   * Records `resolvedAt`, `resolvedBy`, and optional remediation notes.
   * If the condition occurs again in the future after cooldown, a new incident cycle begins.

---

### 2. REST API Specification

#### `GET /api/v1/alerts/incidents`
* **RBAC Requirement**: `alert:read`
* **Filters**: `status`, `category`, `ruleId`, `limit`, `offset`.
* **Response**: List of incidents with total count.

#### `POST /api/v1/alerts/incidents/[id]/acknowledge`
* **RBAC Requirement**: `alert:manage`
* **Audit Event**: `alert.incident_acknowledged` logged to `AuditLogStore`.

#### `POST /api/v1/alerts/incidents/[id]/resolve`
* **RBAC Requirement**: `alert:manage`
* **Request Body**: `{ "notes": "Remediated connection failure" }`
* **Audit Event**: `alert.incident_resolved` logged to `AuditLogStore`.
