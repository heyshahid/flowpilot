# FlowPilot Notification & Delivery Telemetry Architecture

**Milestone:** Phase 9F — Module 9F-D  
**Target:** Multi-Channel Notification Dispatch, In-App Center & Delivery Telemetry  
**Route:** `/alerts` (Notifications tab)  
**Endpoints:** `/api/v1/alerts/notifications`  

---

### 1. Architectural Principles

1. **Delivery Truthfulness**:
   * Notifications dispatched to `in_app` are persisted to `NotificationStore` with status `DELIVERED`.
   * Outbound notifications for external channels (`email`, `webhook`, `slack`) are audited honestly. If an external gateway or webhook destination is unconfigured, status is recorded explicitly as `NOT_CONFIGURED` with a descriptive message rather than claiming false success.
2. **Secret Redaction**:
   * Outgoing webhook URLs, API keys, and authorization headers are never stored in plain text or rendered in user notifications.
3. **In-App Notification Center**:
   * Read and unread status tracking.
   * "Mark All as Read" capabilities.
   * Filtering by channel and unread state.

---

### 2. Notification Data Model

```typescript
export interface AlertNotification {
  id: string;
  workspaceId: string;
  incidentId: string;
  ruleId: string;
  channel: 'in_app' | 'email' | 'webhook' | 'slack';
  recipient?: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  deliveryStatus: 'DELIVERED' | 'FAILED' | 'NOT_CONFIGURED' | 'PENDING';
  deliveryError?: string;
  read: boolean;
  createdAt: string;
}
```

---

### 3. REST API Specification

#### `GET /api/v1/alerts/notifications`
* **RBAC Requirement**: `alert:read`
* **Query Parameters**: `channel`, `unreadOnly`, `limit`, `offset`.
* **Response**: List of notification records, total count, and unread counter.

#### `PATCH /api/v1/alerts/notifications`
* **RBAC Requirement**: `alert:read`
* **Body**: `{ "id": "notif_123" }` to mark single notification as read, or `{ "markAllRead": true }` to mark all workspace notifications as read.
