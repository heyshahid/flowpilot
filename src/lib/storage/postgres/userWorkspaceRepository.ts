import { PrismaClient } from '@prisma/client';
import { UserRecord, WorkspaceRecord, MembershipRecord } from '../../../core/auth/types';
import { getPrismaClient } from './db';

export class PostgresUserWorkspaceRepository {
  private client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client || getPrismaClient();
  }

  // --- Users ---

  public async getUserById(id: string): Promise<UserRecord | null> {
    if (!id || typeof id !== 'string' || id.trim().length === 0) return null;
    const row = await (this.client as any).user.findUnique({ where: { id: id.trim() } });
    if (!row) return null;
    return this.mapUser(row);
  }

  public async getUserByEmail(email: string): Promise<UserRecord | null> {
    if (!email || typeof email !== 'string' || email.trim().length === 0) return null;
    const row = await (this.client as any).user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!row) return null;
    return this.mapUser(row);
  }

  public async upsertUser(user: UserRecord): Promise<UserRecord> {
    const row = await (this.client as any).user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl || null,
        createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
        updatedAt: new Date(),
      },
      update: {
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl || null,
        updatedAt: new Date(),
      },
    });
    return this.mapUser(row);
  }

  // --- Workspaces ---

  public async getWorkspaceById(id: string): Promise<WorkspaceRecord | null> {
    if (!id || typeof id !== 'string' || id.trim().length === 0) return null;
    const row = await (this.client as any).workspace.findUnique({ where: { id: id.trim() } });
    if (!row) return null;
    return this.mapWorkspace(row);
  }

  public async getWorkspaceBySlug(slug: string): Promise<WorkspaceRecord | null> {
    if (!slug || typeof slug !== 'string' || slug.trim().length === 0) return null;
    const row = await (this.client as any).workspace.findUnique({ where: { slug: slug.trim() } });
    if (!row) return null;
    return this.mapWorkspace(row);
  }

  /**
   * Retrieves workspace ownership and archived state.
   */
  public async getWorkspaceOwnership(
    workspaceId: string
  ): Promise<{ ownerId: string; isArchived: boolean } | null> {
    if (!workspaceId || typeof workspaceId !== 'string' || workspaceId.trim().length === 0) {
      return null;
    }
    const row = await (this.client as any).workspace.findUnique({
      where: { id: workspaceId.trim() },
      select: { ownerId: true, isArchived: true },
    });
    if (!row) return null;
    return { ownerId: row.ownerId, isArchived: !!row.isArchived };
  }

  /**
   * Resolves the default active owned workspace for a user using deterministic ordering:
   * 1. Only active owned workspaces (isArchived === false).
   * 2. Primary order: createdAt ASC.
   * 3. Secondary tie-breaker: id ASC.
   */
  public async getDefaultActiveWorkspace(ownerId: string): Promise<WorkspaceRecord | null> {
    if (!ownerId || typeof ownerId !== 'string' || ownerId.trim().length === 0) {
      return null;
    }
    const row = await (this.client as any).workspace.findFirst({
      where: {
        ownerId: ownerId.trim(),
        isArchived: false,
      },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });
    if (!row) return null;
    return this.mapWorkspace(row);
  }

  /**
   * Validates workspace existence, non-archived status, and active user membership.
   */
  public async validateWorkspaceAccess(
    workspaceId: string,
    userId: string
  ): Promise<{ hasAccess: boolean; role?: string; status?: string; isArchived?: boolean; reason?: string }> {
    if (!workspaceId || !userId) {
      return { hasAccess: false, reason: 'INVALID_PARAMETERS' };
    }

    const ws = await this.getWorkspaceOwnership(workspaceId);
    if (!ws) {
      return { hasAccess: false, reason: 'WORKSPACE_NOT_FOUND' };
    }
    if (ws.isArchived) {
      return { hasAccess: false, isArchived: true, reason: 'WORKSPACE_ARCHIVED' };
    }

    const mem = await this.getMembership(workspaceId, userId);
    if (!mem) {
      return { hasAccess: false, reason: 'MEMBERSHIP_NOT_FOUND' };
    }

    const isActive = typeof mem.status === 'string' && mem.status.toLowerCase() === 'active';
    if (!isActive) {
      return {
        hasAccess: false,
        role: mem.role,
        status: mem.status,
        isArchived: false,
        reason: 'MEMBERSHIP_NOT_ACTIVE',
      };
    }

    return {
      hasAccess: true,
      role: mem.role,
      status: mem.status,
      isArchived: false,
    };
  }

  public async upsertWorkspace(workspace: WorkspaceRecord): Promise<WorkspaceRecord> {
    const row = await (this.client as any).workspace.upsert({
      where: { id: workspace.id },
      create: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        ownerId: workspace.ownerId,
        isArchived: workspace.isArchived || false,
        createdAt: workspace.createdAt ? new Date(workspace.createdAt) : new Date(),
        updatedAt: new Date(),
      },
      update: {
        name: workspace.name,
        slug: workspace.slug,
        ownerId: workspace.ownerId,
        isArchived: workspace.isArchived || false,
        updatedAt: new Date(),
      },
    });
    return this.mapWorkspace(row);
  }

  // --- Memberships ---

  public async getMembership(workspaceId: string, userId: string): Promise<MembershipRecord | null> {
    if (!workspaceId || !userId) return null;
    const row = await (this.client as any).membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspaceId.trim(),
          userId: userId.trim(),
        },
      },
    });
    if (!row) return null;
    return this.mapMembership(row);
  }

  public async upsertMembership(membership: MembershipRecord): Promise<MembershipRecord> {
    const id = membership.id || `mem_${membership.workspaceId}_${membership.userId}`;
    const row = await (this.client as any).membership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: membership.workspaceId,
          userId: membership.userId,
        },
      },
      create: {
        id,
        workspaceId: membership.workspaceId,
        userId: membership.userId,
        role: membership.role as any,
        status: membership.status || 'active',
        createdAt: membership.joinedAt ? new Date(membership.joinedAt) : new Date(),
        lastActiveAt: membership.lastActiveAt ? new Date(membership.lastActiveAt) : null,
      },
      update: {
        role: membership.role as any,
        status: membership.status || 'active',
        lastActiveAt: membership.lastActiveAt ? new Date(membership.lastActiveAt) : null,
      },
    });
    return this.mapMembership(row);
  }

  private mapUser(row: any): UserRecord {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatarUrl || undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapWorkspace(row: any): WorkspaceRecord {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.name + ' workspace',
      plan: 'pro',
      ownerId: row.ownerId,
      isArchived: row.isArchived,
      settings: {
        allowMemberInvitations: true,
        defaultMemberRole: 'VIEWER',
        enforceExecutionLimits: true,
        retentionDays: 30,
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapMembership(row: any): MembershipRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      role: row.role,
      status: row.status,
      joinedAt: row.createdAt.toISOString(),
      lastActiveAt: row.lastActiveAt ? row.lastActiveAt.toISOString() : undefined,
    };
  }
}

export const userWorkspaceRepository = new PostgresUserWorkspaceRepository();
