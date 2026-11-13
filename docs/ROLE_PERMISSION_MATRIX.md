# FlowPilot Role & Permission Matrix (RBAC)

FlowPilot implements granular Role-Based Access Control (RBAC) enforced at the API route and business logic layers. Frontend controls adapt dynamically based on the active user's permissions, but authorization is strictly verified server-side.

## 1. Role Definitions

- **OWNER**: Full administrative control over the workspace, billing tier, member management, credential decryption, and ownership transfer.
- **ADMIN**: Operational management of workflows, schedules, credentials, and teammates. Cannot delete the workspace or initiate ownership transfer.
- **EDITOR**: Can build, configure, execute, and duplicate workflows. Can create schedules. Cannot manage team memberships or decrypt raw credentials.
- **VIEWER**: Strict read-only observer. Can inspect workflows, execution history, and audit logs. Cannot execute workflows or modify data.

---

## 2. Granular Permissions Matrix

| Permission Key | Description | OWNER | ADMIN | EDITOR | VIEWER |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `workspace:read` | View workspace metadata & configuration | ✅ | ✅ | ✅ | ✅ |
| `workspace:update` | Update workspace name, description, policies | ✅ | ✅ | ❌ | ❌ |
| `workspace:delete` | Archive / delete workspace | ✅ | ❌ | ❌ | ❌ |
| `workspace:transfer_ownership` | Transfer full ownership to another member | ✅ | ❌ | ❌ | ❌ |
| `member:read` | View team members and pending invites | ✅ | ✅ | ✅ | ✅ |
| `member:invite` | Send email invitations to new teammates | ✅ | ✅ | ❌ | ❌ |
| `member:update_role` | Change member role (abides by hierarchy) | ✅ | ✅* | ❌ | ❌ |
| `member:remove` | Remove teammate or revoke invitation | ✅ | ✅* | ❌ | ❌ |
| `member:suspend` | Suspend active member's access | ✅ | ✅* | ❌ | ❌ |
| `workflow:read` | View workflow canvas, nodes, and edges | ✅ | ✅ | ✅ | ✅ |
| `workflow:create` | Create new workflows from scratch / templates | ✅ | ✅ | ✅ | ❌ |
| `workflow:update` | Modify workflow graph (optimistic locking) | ✅ | ✅ | ✅ | ❌ |
| `workflow:delete` | Delete workflows from workspace | ✅ | ✅ | ❌ | ❌ |
| `workflow:execute` | Manually trigger or execute workflows | ✅ | ✅ | ✅ | ❌ |
| `workflow:duplicate` | Clone workflow within workspace | ✅ | ✅ | ✅ | ❌ |
| `credential:read` | View masked previews & connection status | ✅ | ✅ | ✅ | ✅ |
| `credential:create` | Add new encrypted credentials to vault | ✅ | ✅ | ❌ | ❌ |
| `credential:update` | Update or rotate credential configurations | ✅ | ✅ | ❌ | ❌ |
| `credential:delete` | Revoke credentials from vault | ✅ | ✅ | ❌ | ❌ |
| `credential:decrypt` | Decrypt raw plaintext secrets (GCM) | ✅ | ❌ | ❌ | ❌ |
| `integration:read` | Browse connected integrations & health | ✅ | ✅ | ✅ | ✅ |
| `integration:manage` | Configure or test third-party integrations | ✅ | ✅ | ❌ | ❌ |
| `schedule:read` | Inspect cron schedules & next run times | ✅ | ✅ | ✅ | ✅ |
| `schedule:manage` | Create, pause, resume, or delete schedules | ✅ | ✅ | ✅ | ❌ |
| `webhook:read` | Inspect webhook URLs & delivery metrics | ✅ | ✅ | ✅ | ✅ |
| `webhook:manage` | Create, rotate secret, or configure webhooks | ✅ | ✅ | ❌ | ❌ |
| `audit:read` | Access immutable security audit trails | ✅ | ✅ | ✅ | ✅ |

*\*Note: Admins cannot modify or remove members whose role is OWNER, nor can Admins grant the OWNER role.*

---

## 3. Privilege Escalation & Safety Rules

1. **Hierarchy Guard:** An actor cannot modify or delete a member whose role hierarchy is equal to or higher than their own (except OWNER).
2. **Last Owner Guard:** A workspace must always retain at least one active `OWNER`. If an owner attempts to delete their membership or demote themselves, the system halts with: `Cannot remove the last workspace owner. Transfer workspace ownership first.`
3. **Optimistic Locking:** Concurrent edits by multiple collaborators on the same workflow graph verify `expectedVersion`. If another user saved changes in the interim, the update returns `HTTP 409 Conflict`.
