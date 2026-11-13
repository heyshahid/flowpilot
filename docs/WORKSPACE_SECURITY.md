# FlowPilot Workspace Security & Multi-Tenancy Hardening

This document outlines the defense-in-depth principles protecting FlowPilot workspaces against cross-tenant data leakage, privilege escalation, and credential exposure.

## 1. Multi-Tenant Boundary Isolation

1. **Storage Segregation:**
   - Resources (workflows, credentials, webhooks, schedules, executions, and versions) maintain an explicit `workspaceId` foreign key.
   - All store `list` and `getById` operations require `workspaceId` and reject mismatched access requests.

2. **Backend Interceptor Guard (`AuthContextManager`):**
   - Frontends only present UI options, but every API route enforces `enforceWorkspaceIsolation(req, targetWorkspaceId, requiredPermission)`.
   - Cross-workspace queries return an explicit `403 Forbidden` error:
     `Cross-workspace access violation: Active workspace "ws_1" does not match target resource workspace "ws_2".`

## 2. Privilege Escalation Prevention

1. **Role Hierarchy:**
   - Hierarchy ranks: `OWNER (4) > ADMIN (3) > EDITOR (2) > VIEWER (1)`.
   - An actor with role `ADMIN` cannot grant `OWNER` role to anyone.
   - An actor with role `ADMIN` cannot demote or remove an `OWNER`.

2. **Last Owner Protection:**
   - Workspaces must never be left ownerless.
   - Deleting the last owner or demoting the last owner throws:
     `Cannot remove the last workspace owner. Transfer workspace ownership first.`

3. **Ownership Transfer Integrity:**
   - Only the currently authenticated `OWNER` can initiate ownership transfer.
   - The target user must already be an active, verified member of the workspace.
   - Once transferred, the previous owner is safely transitioned to `ADMIN`, and the event is written to the audit log.

## 3. Cryptographic Token Protection

- **Invitation Tokens:** 32-byte cryptographic random strings (`crypto.randomBytes(32)`).
- **At-Rest Hashing:** Tokens are hashed with SHA-256 before storage in `.data/invitations.json`.
- **Identity Binding:** Acceptance verifies that the claimant's account email matches the invitation record.

## 4. Credential Vault Isolation

- Credentials stored in `.data/credentials.json` are encrypted using AES-256-GCM with a 96-bit random IV and 128-bit authentication tag.
- Only users with role `OWNER` or permission `credential:decrypt` can decrypt raw secrets.
- Workflow execution records only contain sanitized outputs and masked representations.
