import fs from 'fs';
import path from 'path';
import { MembershipRecord, UserRole, MembershipStatus, UserRecord } from '../../core/auth/types';
import { userStore } from './userStore';
import { RBACManager } from '../../core/auth/rbac';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'memberships.json');

export interface MemberWithUser extends MembershipRecord {
  user: UserRecord | null;
}

export const SEED_MEMBERSHIPS: MembershipRecord[] = [
  {
    id: 'mem_ws_def_owner',
    workspaceId: 'ws_default',
    userId: 'usr_owner',
    role: 'OWNER',
    status: 'active',
    joinedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    lastActiveAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'mem_ws_def_admin',
    workspaceId: 'ws_default',
    userId: 'usr_admin',
    role: 'ADMIN',
    status: 'active',
    joinedAt: new Date(Date.now() - 86400000 * 25).toISOString(),
    lastActiveAt: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
  {
    id: 'mem_ws_def_editor',
    workspaceId: 'ws_default',
    userId: 'usr_editor',
    role: 'EDITOR',
    status: 'active',
    joinedAt: new Date(Date.now() - 86400000 * 15).toISOString(),
    lastActiveAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'mem_ws_def_viewer',
    workspaceId: 'ws_default',
    userId: 'usr_viewer',
    role: 'VIEWER',
    status: 'active',
    joinedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    lastActiveAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'mem_ws_stg_owner',
    workspaceId: 'ws_staging',
    userId: 'usr_owner',
    role: 'OWNER',
    status: 'active',
    joinedAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    lastActiveAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'mem_ws_stg_editor',
    workspaceId: 'ws_staging',
    userId: 'usr_editor',
    role: 'ADMIN',
    status: 'active',
    joinedAt: new Date(Date.now() - 86400000 * 12).toISOString(),
    lastActiveAt: new Date(Date.now() - 3600000 * 8).toISOString(),
  },
];

export class MembershipStore {
  private memberships: Map<string, MembershipRecord> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (typeof window === 'undefined') {
      try {
        if (fs.existsSync(DATA_FILE)) {
          const raw = fs.readFileSync(DATA_FILE, 'utf-8');
          const list: MembershipRecord[] = JSON.parse(raw);
          for (const m of list) {
            this.memberships.set(m.id, m);
          }
        }
      } catch {
        // Fallback
      }
    }

    if (this.memberships.size === 0) {
      for (const m of SEED_MEMBERSHIPS) {
        this.memberships.set(m.id, m);
      }
      this.persist();
    }
  }

  private persist(): void {
    if (typeof window === 'undefined') {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(this.memberships.values()), null, 2), 'utf-8');
      } catch {
        // In-memory retains
      }
    }
  }

  public getMembership(workspaceId: string, userId: string): MembershipRecord | null {
    for (const m of this.memberships.values()) {
      if (m.workspaceId === workspaceId && m.userId === userId) {
        return m;
      }
    }
    return null;
  }

  public listByWorkspace(workspaceId: string): MembershipRecord[] {
    const list: MembershipRecord[] = [];
    for (const m of this.memberships.values()) {
      if (m.workspaceId === workspaceId) {
        list.push(m);
      }
    }
    return list;
  }

  public listByUser(userId: string): MembershipRecord[] {
    const list: MembershipRecord[] = [];
    for (const m of this.memberships.values()) {
      if (m.userId === userId && m.status === 'active') {
        list.push(m);
      }
    }
    return list;
  }

  public listWithUserDetails(workspaceId: string): MemberWithUser[] {
    const list = this.listByWorkspace(workspaceId);
    return list.map((m) => ({
      ...m,
      user: userStore.getById(m.userId),
    }));
  }

  public addMember(params: {
    workspaceId: string;
    userId: string;
    role: UserRole;
    status?: MembershipStatus;
  }): MembershipRecord {
    const existing = this.getMembership(params.workspaceId, params.userId);
    if (existing) {
      if (existing.status === 'suspended') {
        existing.status = 'active';
        existing.role = params.role;
        this.persist();
        return existing;
      }
      throw new Error(`User "${params.userId}" is already a member of workspace "${params.workspaceId}".`);
    }

    const id = `mem_${Math.random().toString(36).substring(2, 9)}`;
    const record: MembershipRecord = {
      id,
      workspaceId: params.workspaceId,
      userId: params.userId,
      role: params.role,
      status: params.status || 'active',
      joinedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    this.memberships.set(id, record);
    this.persist();
    return record;
  }

  public updateRole(
    workspaceId: string,
    targetUserId: string,
    newRole: UserRole,
    actorUserId: string
  ): MembershipRecord {
    const actorMembership = this.getMembership(workspaceId, actorUserId);
    if (!actorMembership || actorMembership.status !== 'active') {
      throw new Error('Unauthorized: Actor is not an active member of this workspace.');
    }

    RBACManager.assertPermission(actorMembership.role, 'member:update_role');

    const targetMembership = this.getMembership(workspaceId, targetUserId);
    if (!targetMembership) {
      throw new Error(`Target member not found in workspace.`);
    }

    // Role hierarchy check
    if (!RBACManager.canManageRole(actorMembership.role, targetMembership.role)) {
      throw new Error(`Forbidden: You cannot modify the role of a member with role "${targetMembership.role}".`);
    }

    // Privilege escalation check: cannot promote higher than or equal to own level (unless OWNER)
    if (actorMembership.role !== 'OWNER' && newRole === 'OWNER') {
      throw new Error('Forbidden: Only the workspace owner can assign the OWNER role.');
    }

    // Last owner check
    if (targetMembership.role === 'OWNER' && newRole !== 'OWNER') {
      const activeOwners = this.listByWorkspace(workspaceId).filter(
        (m) => m.role === 'OWNER' && m.status === 'active' && m.userId !== targetUserId
      );
      if (activeOwners.length === 0) {
        throw new Error('Cannot demote the last workspace owner. Transfer workspace ownership first.');
      }
    }

    targetMembership.role = newRole;
    this.persist();
    return targetMembership;
  }

  public updateStatus(
    workspaceId: string,
    targetUserId: string,
    newStatus: MembershipStatus,
    actorUserId: string
  ): MembershipRecord {
    const actorMembership = this.getMembership(workspaceId, actorUserId);
    if (!actorMembership || actorMembership.status !== 'active') {
      throw new Error('Unauthorized: Actor is not an active member of this workspace.');
    }

    RBACManager.assertPermission(actorMembership.role, 'member:suspend');

    const targetMembership = this.getMembership(workspaceId, targetUserId);
    if (!targetMembership) {
      throw new Error(`Target member not found in workspace.`);
    }

    if (targetMembership.role === 'OWNER' && newStatus === 'suspended') {
      throw new Error('Cannot suspend a workspace owner.');
    }

    targetMembership.status = newStatus;
    this.persist();
    return targetMembership;
  }

  public removeMember(workspaceId: string, targetUserId: string, actorUserId: string): boolean {
    const actorMembership = this.getMembership(workspaceId, actorUserId);
    if (!actorMembership || actorMembership.status !== 'active') {
      throw new Error('Unauthorized: Actor is not an active member of this workspace.');
    }

    RBACManager.assertPermission(actorMembership.role, 'member:remove');

    const targetMembership = this.getMembership(workspaceId, targetUserId);
    if (!targetMembership) {
      throw new Error(`Target member not found in workspace.`);
    }

    // Role hierarchy check
    if (actorUserId !== targetUserId && !RBACManager.canManageRole(actorMembership.role, targetMembership.role)) {
      throw new Error(`Forbidden: You cannot remove a member with role "${targetMembership.role}".`);
    }

    // Prevent removing last owner
    if (targetMembership.role === 'OWNER') {
      const activeOwners = this.listByWorkspace(workspaceId).filter(
        (m) => m.role === 'OWNER' && m.status === 'active' && m.userId !== targetUserId
      );
      if (activeOwners.length === 0) {
        throw new Error('Cannot remove the last workspace owner. Transfer workspace ownership first.');
      }
    }

    this.memberships.delete(targetMembership.id);
    this.persist();
    return true;
  }

  public recordActivity(workspaceId: string, userId: string): void {
    const mem = this.getMembership(workspaceId, userId);
    if (mem) {
      mem.lastActiveAt = new Date().toISOString();
      this.persist();
    }
  }
}

export const membershipStore = new MembershipStore();
