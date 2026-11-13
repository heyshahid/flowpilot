import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { InvitationRecord, UserRole } from '../../core/auth/types';
import { membershipStore } from './membershipStore';
import { userStore } from './userStore';
import { workspaceStore } from './workspaceStore';
import { RBACManager } from '../../core/auth/rbac';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'invitations.json');

export class InvitationStore {
  private invitations: Map<string, InvitationRecord> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (typeof window === 'undefined') {
      try {
        if (fs.existsSync(DATA_FILE)) {
          const raw = fs.readFileSync(DATA_FILE, 'utf-8');
          const list: InvitationRecord[] = JSON.parse(raw);
          for (const inv of list) {
            this.invitations.set(inv.id, inv);
          }
        }
      } catch {
        // Fallback
      }
    }

    if (this.invitations.size === 0) {
      // Seed a pending invitation for demonstration
      const rawToken = 'inv_demo_token_david_miller_12345';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const seedInvite: InvitationRecord = {
        id: 'inv_seed_david',
        workspaceId: 'ws_default',
        workspaceName: 'Acme Production Workspace',
        email: 'david.miller@acme.corp',
        role: 'EDITOR',
        tokenHash,
        status: 'pending',
        invitedBy: 'usr_owner',
        invitedByName: 'Shahid Akram',
        expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      };
      this.invitations.set(seedInvite.id, seedInvite);
      this.persist();
    }
  }

  private persist(): void {
    if (typeof window === 'undefined') {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        // Never persist rawToken, only tokenHash
        const sanitized = Array.from(this.invitations.values()).map((inv) => {
          const { rawToken, ...rest } = inv;
          return rest;
        });
        fs.writeFileSync(DATA_FILE, JSON.stringify(sanitized, null, 2), 'utf-8');
      } catch {
        // In-memory retains
      }
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  public getById(id: string): InvitationRecord | null {
    return this.invitations.get(id) || null;
  }

  public getByToken(rawToken: string): InvitationRecord | null {
    const hash = this.hashToken(rawToken);
    for (const inv of this.invitations.values()) {
      if (inv.tokenHash === hash) {
        // Refresh expiration status if past date
        if (inv.status === 'pending' && new Date(inv.expiresAt).getTime() < Date.now()) {
          inv.status = 'expired';
          this.persist();
        }
        return inv;
      }
    }
    return null;
  }

  public listByWorkspace(workspaceId: string): InvitationRecord[] {
    const list: InvitationRecord[] = [];
    const now = Date.now();
    for (const inv of this.invitations.values()) {
      if (inv.workspaceId === workspaceId) {
        if (inv.status === 'pending' && new Date(inv.expiresAt).getTime() < now) {
          inv.status = 'expired';
        }
        list.push(inv);
      }
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public createInvitation(params: {
    workspaceId: string;
    email: string;
    role: UserRole;
    actorUserId: string;
    expiresInHours?: number;
  }): { invitation: InvitationRecord; rawToken: string } {
    const ws = workspaceStore.getById(params.workspaceId);
    if (!ws) throw new Error(`Workspace "${params.workspaceId}" not found.`);

    // Check actor permission
    const actorMembership = membershipStore.getMembership(params.workspaceId, params.actorUserId);
    if (!actorMembership || actorMembership.status !== 'active') {
      throw new Error('Unauthorized: You must be an active member of this workspace to invite teammates.');
    }
    RBACManager.assertPermission(actorMembership.role, 'member:invite');

    if (actorMembership.role !== 'OWNER' && params.role === 'OWNER') {
      throw new Error('Forbidden: Only the workspace owner can invite new owners.');
    }

    const email = params.email.toLowerCase().trim();

    // Check if target is already an active member
    const existingUser = userStore.getByEmail(email);
    if (existingUser) {
      const existingMem = membershipStore.getMembership(params.workspaceId, existingUser.id);
      if (existingMem && existingMem.status === 'active') {
        throw new Error(`User with email "${email}" is already an active member of this workspace.`);
      }
    }

    // Check for existing pending invitation
    for (const inv of this.invitations.values()) {
      if (inv.workspaceId === params.workspaceId && inv.email === email && inv.status === 'pending') {
        if (new Date(inv.expiresAt).getTime() > Date.now()) {
          throw new Error(`An active pending invitation already exists for "${email}". Resend or revoke it.`);
        } else {
          inv.status = 'expired';
        }
      }
    }

    const rawToken = `fp_inv_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = this.hashToken(rawToken);
    const hours = params.expiresInHours || 168; // Default 7 days
    const expiresAt = new Date(Date.now() + hours * 3600000).toISOString();

    const actorUser = userStore.getById(params.actorUserId);

    const id = `inv_${Math.random().toString(36).substring(2, 9)}`;
    const invitation: InvitationRecord = {
      id,
      workspaceId: params.workspaceId,
      workspaceName: ws.name,
      email,
      role: params.role,
      tokenHash,
      rawToken, // Returned in memory for email dispatch / copy link
      status: 'pending',
      invitedBy: params.actorUserId,
      invitedByName: actorUser?.name || 'Workspace Administrator',
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    this.invitations.set(id, invitation);
    this.persist();

    return { invitation, rawToken };
  }

  public acceptInvitation(rawToken: string, userId: string): { success: boolean; workspaceId: string; role: UserRole } {
    const inv = this.getByToken(rawToken);
    if (!inv) {
      throw new Error('Invalid invitation token or invitation not found.');
    }

    if (inv.status === 'expired' || new Date(inv.expiresAt).getTime() < Date.now()) {
      inv.status = 'expired';
      this.persist();
      throw new Error('This invitation has expired. Please ask an administrator to send a new invitation.');
    }

    if (inv.status === 'revoked') {
      throw new Error('This invitation has been revoked by an administrator.');
    }

    if (inv.status === 'accepted') {
      throw new Error('This invitation has already been accepted.');
    }

    const user = userStore.getById(userId);
    if (!user) {
      throw new Error(`User record "${userId}" not found.`);
    }

    // Verify email matches (allow case-insensitive)
    if (user.email.toLowerCase() !== inv.email.toLowerCase()) {
      throw new Error(
        `Email mismatch: This invitation was issued to "${inv.email}", but your logged in account is "${user.email}".`
      );
    }

    // Add membership
    membershipStore.addMember({
      workspaceId: inv.workspaceId,
      userId,
      role: inv.role,
      status: 'active',
    });

    inv.status = 'accepted';
    inv.acceptedAt = new Date().toISOString();
    this.persist();

    return { success: true, workspaceId: inv.workspaceId, role: inv.role };
  }

  public revokeInvitation(invitationId: string, actorUserId: string): InvitationRecord {
    const inv = this.getById(invitationId);
    if (!inv) throw new Error('Invitation not found.');

    const actorMembership = membershipStore.getMembership(inv.workspaceId, actorUserId);
    if (!actorMembership || actorMembership.status !== 'active') {
      throw new Error('Unauthorized: You must be an active member to revoke invitations.');
    }
    RBACManager.assertPermission(actorMembership.role, 'member:remove');

    inv.status = 'revoked';
    this.persist();
    return inv;
  }

  public resendInvitation(
    invitationId: string,
    actorUserId: string,
    expiresInHours = 168
  ): { invitation: InvitationRecord; rawToken: string } {
    const inv = this.getById(invitationId);
    if (!inv) throw new Error('Invitation not found.');

    const actorMembership = membershipStore.getMembership(inv.workspaceId, actorUserId);
    if (!actorMembership || actorMembership.status !== 'active') {
      throw new Error('Unauthorized: You must be an active member to resend invitations.');
    }
    RBACManager.assertPermission(actorMembership.role, 'member:invite');

    const rawToken = `fp_inv_${crypto.randomBytes(32).toString('hex')}`;
    inv.tokenHash = this.hashToken(rawToken);
    inv.status = 'pending';
    inv.expiresAt = new Date(Date.now() + expiresInHours * 3600000).toISOString();
    inv.createdAt = new Date().toISOString();
    inv.rawToken = rawToken;

    this.persist();
    return { invitation: inv, rawToken };
  }
}

export const invitationStore = new InvitationStore();
