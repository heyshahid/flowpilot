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
    const row = await (this.client as any).user.findUnique({ where: { id } });
    if (!row) return null;
    return this.mapUser(row);
  }

  public async getUserByEmail(email: string): Promise<UserRecord | null> {
    const row = await (this.client as any).user.findUnique({ where: { email } });
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
    const row = await (this.client as any).workspace.findUnique({ where: { id } });
    if (!row) return null;
    return this.mapWorkspace(row);
  }

  public async getWorkspaceBySlug(slug: string): Promise<WorkspaceRecord | null> {
    const row = await (this.client as any).workspace.findUnique({ where: { slug } });
    if (!row) return null;
    return this.mapWorkspace(row);
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
    const row = await (this.client as any).membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
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
