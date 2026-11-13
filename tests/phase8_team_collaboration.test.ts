import { describe, it, expect, beforeEach } from 'vitest';
import { workspaceStore } from '../src/lib/storage/workspaceStore';
import { membershipStore } from '../src/lib/storage/membershipStore';
import { userStore } from '../src/lib/storage/userStore';
import { invitationStore } from '../src/lib/storage/invitationStore';
import { workflowStore } from '../src/lib/storage/workflowStore';
import { credentialStore } from '../src/lib/storage/credentialStore';
import { auditLogStore } from '../src/lib/storage/auditLogStore';
import { RBACManager } from '../src/core/auth/rbac';

describe('Phase 8: Team Management, Workspaces & Collaboration', () => {
  const testWorkspaceId = 'ws_phase8_test';
  const ownerUserId = 'usr_owner'; // Shahid Akram
  const adminUserId = 'usr_admin'; // Sarah Connor
  const editorUserId = 'usr_editor'; // Alex Rivera
  const viewerUserId = 'usr_viewer'; // Elena Rostova

  beforeEach(() => {
    // Ensure clean test workspace exists
    try {
      const existing = workspaceStore.getById(testWorkspaceId);
      if (!existing) {
        workspaceStore.create({
          name: 'Phase 8 Test Lab',
          slug: 'phase8-test-lab',
          description: 'Dedicated workspace for multi-user integration tests',
          ownerId: ownerUserId,
          plan: 'pro',
        });
      }
    } catch {
      // workspace already exists
    }
  });

  describe('1. Workspace Architecture & Multi-Tenant Isolation', () => {
    it('should create and retrieve a workspace with owner metadata and settings', () => {
      const ws = workspaceStore.create({
        name: 'Enterprise Marketing Hub',
        slug: 'enterprise-marketing-hub',
        description: 'Marketing automation and social outreach pipelines',
        ownerId: ownerUserId,
        plan: 'enterprise',
      });

      expect(ws.id).toMatch(/^ws_/);
      expect(ws.name).toBe('Enterprise Marketing Hub');
      expect(ws.ownerId).toBe(ownerUserId);
      expect(ws.plan).toBe('enterprise');
      expect(ws.settings.allowMemberInvitations).toBe(true);

      const retrieved = workspaceStore.getById(ws.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Enterprise Marketing Hub');
    });

    it('should isolate workflows between different workspaces', () => {
      // Create a workflow in ws_default
      const wf1 = workflowStore.create({
        name: 'Default Workspace Lead Pipeline',
        workspaceId: 'ws_default',
        actor: { id: ownerUserId, name: 'Shahid Akram' },
      });

      // Create a workflow in ws_staging
      const wf2 = workflowStore.create({
        name: 'Staging Sandbox Benchmark',
        workspaceId: 'ws_staging',
        actor: { id: editorUserId, name: 'Alex Rivera' },
      });

      // Listing workflows for ws_default must not leak ws_staging workflows
      const defaultWorkflows = workflowStore.getAll('ws_default');
      const stagingWorkflows = workflowStore.getAll('ws_staging');

      expect(defaultWorkflows.some((w) => w.id === wf1.id)).toBe(true);
      expect(defaultWorkflows.some((w) => w.id === wf2.id)).toBe(false);

      expect(stagingWorkflows.some((w) => w.id === wf2.id)).toBe(true);
      expect(stagingWorkflows.some((w) => w.id === wf1.id)).toBe(false);

      // Fetching wf2 under ws_default context must return null
      expect(workflowStore.getById(wf2.id, 'ws_default')).toBeNull();
    });

    it('should archive and restore a workspace', () => {
      const ws = workspaceStore.create({
        name: 'Temporary Project Workspace',
        ownerId: ownerUserId,
      });

      const archived = workspaceStore.archive(ws.id);
      expect(archived.isArchived).toBe(true);
      expect(workspaceStore.list(false).some((w) => w.id === ws.id)).toBe(false);

      const restored = workspaceStore.restore(ws.id);
      expect(restored.isArchived).toBe(false);
      expect(workspaceStore.list(false).some((w) => w.id === ws.id)).toBe(true);
    });
  });

  describe('2. Team Invitations & Token Security', () => {
    const uniqueEmail = `collab.${Date.now()}.${Math.random().toString(36).substring(2, 6)}@partner.com`;

    it('should generate an unguessable invitation token and securely store its SHA-256 hash', () => {
      const { invitation, rawToken } = invitationStore.createInvitation({
        workspaceId: 'ws_default',
        email: uniqueEmail,
        role: 'EDITOR',
        actorUserId: ownerUserId,
      });

      expect(rawToken).toMatch(/^fp_inv_[a-f0-9]{64}$/);
      expect(invitation.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(invitation.status).toBe('pending');
      expect(invitation.email).toBe(uniqueEmail);
      expect(invitation.role).toBe('EDITOR');

      // Stored record in invitations list must NOT expose rawToken
      const stored = invitationStore.getById(invitation.id);
      expect(stored?.tokenHash).toBe(invitation.tokenHash);
    });

    it('should prevent duplicate active pending invitations for the same email in the same workspace', () => {
      expect(() => {
        invitationStore.createInvitation({
          workspaceId: 'ws_default',
          email: uniqueEmail,
          role: 'VIEWER',
          actorUserId: ownerUserId,
        });
      }).toThrow(/active pending invitation already exists/);
    });

    it('should successfully accept an invitation and assign the invited role', () => {
      const testEmail = `engineer.${Date.now()}@devcorp.com`;
      const { rawToken } = invitationStore.createInvitation({
        workspaceId: 'ws_default',
        email: testEmail,
        role: 'EDITOR',
        actorUserId: ownerUserId,
      });

      // Register matching user
      const newUser = userStore.create({
        name: 'DevCorp Engineer',
        email: testEmail,
      });

      const result = invitationStore.acceptInvitation(rawToken, newUser.id);
      expect(result.success).toBe(true);
      expect(result.workspaceId).toBe('ws_default');
      expect(result.role).toBe('EDITOR');

      // Verify membership record exists
      const mem = membershipStore.getMembership('ws_default', newUser.id);
      expect(mem).toBeDefined();
      expect(mem?.role).toBe('EDITOR');
      expect(mem?.status).toBe('active');
    });

    it('should reject invitation acceptance if the authenticated user email does not match', () => {
      const targetEmail = `audit.${Date.now()}@security.org`;
      const { rawToken } = invitationStore.createInvitation({
        workspaceId: 'ws_default',
        email: targetEmail,
        role: 'VIEWER',
        actorUserId: ownerUserId,
      });

      // Try to accept with Sarah Connor's account (different email)
      expect(() => {
        invitationStore.acceptInvitation(rawToken, adminUserId);
      }).toThrow(/Email mismatch/);
    });

    it('should allow revoking and resending pending invitations', () => {
      const email = `temp.${Date.now()}@testing.io`;
      const { invitation, rawToken: token1 } = invitationStore.createInvitation({
        workspaceId: 'ws_default',
        email,
        role: 'VIEWER',
        actorUserId: ownerUserId,
      });

      // Revoke
      const revoked = invitationStore.revokeInvitation(invitation.id, ownerUserId);
      expect(revoked.status).toBe('revoked');

      // Token 1 should no longer be acceptable
      const user = userStore.create({ name: 'Temp User', email });
      expect(() => {
        invitationStore.acceptInvitation(token1, user.id);
      }).toThrow(/revoked/);

      // Resend
      const { invitation: resent, rawToken: token2 } = invitationStore.resendInvitation(invitation.id, ownerUserId);
      expect(resent.status).toBe('pending');
      expect(token2).not.toBe(token1);

      // Token 2 should accept successfully
      const acceptResult = invitationStore.acceptInvitation(token2, user.id);
      expect(acceptResult.success).toBe(true);
    });
  });

  describe('3. Role-Based Access Control (RBAC) & Hierarchy', () => {
    it('should enforce correct permissions across all four roles', () => {
      // OWNER has full privileges
      expect(RBACManager.hasPermission('OWNER', 'workspace:transfer_ownership')).toBe(true);
      expect(RBACManager.hasPermission('OWNER', 'workspace:delete')).toBe(true);
      expect(RBACManager.hasPermission('OWNER', 'credential:decrypt')).toBe(true);
      expect(RBACManager.hasPermission('OWNER', 'member:remove')).toBe(true);

      // ADMIN has management privileges but cannot delete or transfer workspace
      expect(RBACManager.hasPermission('ADMIN', 'workspace:update')).toBe(true);
      expect(RBACManager.hasPermission('ADMIN', 'member:invite')).toBe(true);
      expect(RBACManager.hasPermission('ADMIN', 'workflow:create')).toBe(true);
      expect(RBACManager.hasPermission('ADMIN', 'workspace:delete')).toBe(false);
      expect(RBACManager.hasPermission('ADMIN', 'workspace:transfer_ownership')).toBe(false);

      // EDITOR can create, edit, execute workflows and view credentials, but cannot manage team or workspace
      expect(RBACManager.hasPermission('EDITOR', 'workflow:create')).toBe(true);
      expect(RBACManager.hasPermission('EDITOR', 'workflow:execute')).toBe(true);
      expect(RBACManager.hasPermission('EDITOR', 'member:invite')).toBe(false);
      expect(RBACManager.hasPermission('EDITOR', 'workspace:update')).toBe(false);
      expect(RBACManager.hasPermission('EDITOR', 'credential:decrypt')).toBe(false);

      // VIEWER has strictly read-only access
      expect(RBACManager.hasPermission('VIEWER', 'workflow:read')).toBe(true);
      expect(RBACManager.hasPermission('VIEWER', 'audit:read')).toBe(true);
      expect(RBACManager.hasPermission('VIEWER', 'workflow:create')).toBe(false);
      expect(RBACManager.hasPermission('VIEWER', 'workflow:execute')).toBe(false);
      expect(RBACManager.hasPermission('VIEWER', 'credential:create')).toBe(false);
    });

    it('should prevent privilege escalation (ADMIN cannot grant OWNER role)', () => {
      expect(() => {
        membershipStore.updateRole('ws_default', viewerUserId, 'OWNER', adminUserId);
      }).toThrow(/Only the workspace owner can assign the OWNER role/);
    });

    it('should prevent an ADMIN from demoting or removing the OWNER', () => {
      expect(() => {
        membershipStore.updateRole('ws_default', ownerUserId, 'VIEWER', adminUserId);
      }).toThrow(/You cannot modify the role/);

      expect(() => {
        membershipStore.removeMember('ws_default', ownerUserId, adminUserId);
      }).toThrow(/You cannot remove a member with role/);
    });

    it('should protect against removing or demoting the last workspace owner', () => {
      expect(() => {
        membershipStore.removeMember('ws_default', ownerUserId, ownerUserId);
      }).toThrow(/Cannot remove the last workspace owner/);

      expect(() => {
        membershipStore.updateRole('ws_default', ownerUserId, 'EDITOR', ownerUserId);
      }).toThrow(/Cannot demote the last workspace owner/);
    });
  });

  describe('4. Workflow Collaboration & Optimistic Locking', () => {
    it('should track workflow creator, last editor, and increment version numbers', () => {
      const wf = workflowStore.create({
        name: 'Collaborative Multi-Editor Flow',
        workspaceId: 'ws_default',
        actor: { id: editorUserId, name: 'Alex Rivera' },
      });

      expect(wf.version).toBe(1);
      expect(wf.createdBy).toBe(editorUserId);
      expect(wf.createdByName).toBe('Alex Rivera');

      // Update by another teammate (Sarah Connor)
      const updated = workflowStore.save(
        { ...wf, name: 'Collaborative Flow (Refined by Sarah)' },
        {
          expectedVersion: 1,
          actor: { id: adminUserId, name: 'Sarah Connor' },
          workspaceId: 'ws_default',
        }
      );

      expect(updated.version).toBe(2);
      expect(updated.createdBy).toBe(editorUserId); // Creator remains untouched
      expect(updated.lastModifiedBy).toBe(adminUserId);
      expect(updated.lastModifiedByName).toBe('Sarah Connor');
    });

    it('should detect concurrent edit conflicts and throw an error when expectedVersion is stale', () => {
      const wf = workflowStore.create({
        name: 'Race Condition Test Flow',
        workspaceId: 'ws_default',
      });

      // User A loads version 1 and saves -> bumps to version 2
      workflowStore.save(
        { ...wf, description: 'User A edits' },
        { expectedVersion: 1, workspaceId: 'ws_default' }
      );

      // User B tries to save with stale expectedVersion 1 -> must conflict!
      expect(() => {
        workflowStore.save(
          { ...wf, description: 'User B simultaneous edit' },
          { expectedVersion: 1, workspaceId: 'ws_default' }
        );
      }).toThrow(/Conflict: Workflow was updated by another user/);
    });

    it('should duplicate a workflow within the same workspace resetting version to 1', () => {
      const source = workflowStore.create({
        name: 'Master Dispatch Template',
        workspaceId: 'ws_default',
      });

      const copy = workflowStore.duplicate(source.id, {
        workspaceId: 'ws_default',
        actor: { id: editorUserId, name: 'Alex Rivera' },
      });

      expect(copy).toBeDefined();
      expect(copy?.id).not.toBe(source.id);
      expect(copy?.name).toBe('Master Dispatch Template (Copy)');
      expect(copy?.version).toBe(1);
      expect(copy?.createdBy).toBe(editorUserId);
    });

    it('should transfer workflow ownership within a workspace', () => {
      const wf = workflowStore.create({
        name: 'Orphaned Task Workflow',
        workspaceId: 'ws_default',
        actor: { id: editorUserId, name: 'Alex Rivera' },
      });

      const transferred = workflowStore.transferOwnership(
        wf.id,
        adminUserId,
        'Sarah Connor',
        'ws_default'
      );

      expect(transferred.createdBy).toBe(adminUserId);
      expect(transferred.createdByName).toBe('Sarah Connor');
    });
  });

  describe('5. Credential Security & Role Restrictions', () => {
    it('should prevent non-owners from decrypting raw credential secrets', async () => {
      const cred = await credentialStore.save({
        name: 'Production Stripe Webhook Secret Key',
        integrationId: 'http',
        type: 'api_key',
        data: { apiKey: 'live_secret_key_never_leak_998811' },
        workspaceId: 'ws_default',
        createdBy: ownerUserId,
      });

      // Allowed for OWNER
      const decrypted = await credentialStore.getDecryptedData<{ apiKey: string }>(cred.id, {
        workspaceId: 'ws_default',
        allowDecrypt: true,
      });
      expect(decrypted?.apiKey).toBe('live_secret_key_never_leak_998811');

      // Blocked when allowDecrypt is false (e.g. VIEWER or unauthorized actor)
      await expect(
        credentialStore.getDecryptedData(cred.id, {
          workspaceId: 'ws_default',
          allowDecrypt: false,
        })
      ).rejects.toThrow(/Unauthorized: Role lacks permission to decrypt credential secrets/);
    });
  });

  describe('6. Immutable Audit Logging & Secret Sanitization', () => {
    it('should record audit events and automatically redact sensitive tokens/passwords from metadata', () => {
      const log = auditLogStore.log({
        workspaceId: 'ws_default',
        actorId: adminUserId,
        actorName: 'Sarah Connor',
        actorEmail: 'sarah@cyberdyne.org',
        action: 'credential.created',
        resourceType: 'credential',
        resourceId: 'cred_audit_test',
        resourceName: 'Custom API Key',
        metadata: {
          token: 'sk-secret-token-12345',
          password: 'super_secret_db_password',
          safeField: 'Europe-West1 Deployment',
        },
      });

      expect(log.id).toMatch(/^aud_/);
      expect(log.metadata?.token).toBe('[REDACTED]');
      expect(log.metadata?.password).toBe('[REDACTED]');
      expect(log.metadata?.safeField).toBe('Europe-West1 Deployment');

      // Query audit logs
      const results = auditLogStore.list('ws_default', { resourceType: 'credential' });
      expect(results.some((l) => l.id === log.id)).toBe(true);
    });
  });

  describe('7. Workspace Ownership Transfer', () => {
    it('should atomically transfer workspace ownership from current owner to an active member', () => {
      const testWs = workspaceStore.create({
        name: 'Ownership Transfer Benchmark Workspace',
        ownerId: ownerUserId,
      });

      // Add Sarah Connor as member
      membershipStore.addMember({
        workspaceId: testWs.id,
        userId: adminUserId,
        role: 'ADMIN',
      });

      // Transfer ownership to Sarah
      const transferred = workspaceStore.transferOwnership(testWs.id, adminUserId, ownerUserId);
      expect(transferred.ownerId).toBe(adminUserId);

      // Non-owner trying to transfer must fail
      expect(() => {
        workspaceStore.transferOwnership(testWs.id, editorUserId, ownerUserId);
      }).toThrow(/Only the current workspace owner can transfer ownership/);
    });
  });
});
