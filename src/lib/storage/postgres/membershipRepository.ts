/**
 * FlowPilot Membership Storage Repository (PostgreSQL)
 * Phase 10C-B4.1: PostgreSQL Membership & Workspace Data Layer
 *
 * Implements authoritative database-level membership operations:
 * - Indexed lookup by (workspaceId, userId)
 * - User membership listing with active/archived workspace scoping
 * - Deterministic active workspace resolution (earliest active owned, fallback to active member)
 * - Explicit distinction between active, suspended, revoked, and inactive states
 * - Zero automatic creation, restoration, or request-context assumptions
 */

import { PrismaClient, Membership, Workspace, Role } from '@prisma/client';
import { prisma as defaultPrisma } from './db';

export type MembershipStatus = 'active' | 'suspended' | 'revoked' | 'inactive';

export interface MembershipWithWorkspace extends Membership {
  workspace: Workspace;
}

export interface ListUserMembershipsOptions {
  status?: string;
  includeArchived?: boolean;
}

export interface CreateMembershipParams {
  workspaceId: string;
  userId: string;
  role?: Role;
  status?: string;
}

export class MembershipRepository {
  constructor(private client: PrismaClient = defaultPrisma) {}

  /**
   * Validates string identifiers to prevent malformed queries.
   */
  private isValidId(id: unknown): id is string {
    return typeof id === 'string' && id.trim().length > 0;
  }

  /**
   * Helper to determine whether a membership record is active.
   * Strictly returns false for null, suspended, revoked, inactive, or any non-active status.
   */
  public isMembershipActive(membership: Membership | null | undefined): boolean {
    if (!membership) return false;
    return typeof membership.status === 'string' && membership.status.trim().toLowerCase() === 'active';
  }

  /**
   * Retrieves a single membership by workspaceId and userId.
   * Queries the indexed unique constraint (workspaceId, userId).
   * Returns null if not found or if parameters are invalid.
   */
  public async getMembership(
    workspaceId: string,
    userId: string
  ): Promise<MembershipWithWorkspace | null> {
    if (!this.isValidId(workspaceId) || !this.isValidId(userId)) {
      return null;
    }

    try {
      const membership = await (this.client as any).membership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: workspaceId.trim(),
            userId: userId.trim(),
          },
        },
        include: {
          workspace: true,
        },
      });

      return membership || null;
    } catch (error) {
      console.error(`[MembershipRepository.getMembership] Database error for ws=${workspaceId}, usr=${userId}:`, error);
      throw error;
    }
  }

  /**
   * Lists all memberships for a given user, optionally filtered by status and archived state.
   * Queries indexed @@index([userId]).
   * Orders deterministically: createdAt ASC, id ASC.
   */
  public async listUserMemberships(
    userId: string,
    options?: ListUserMembershipsOptions
  ): Promise<MembershipWithWorkspace[]> {
    if (!this.isValidId(userId)) {
      return [];
    }

    try {
      const whereClause: any = {
        userId: userId.trim(),
      };

      if (options?.status) {
        whereClause.status = options.status.trim().toLowerCase();
      }

      if (!options?.includeArchived) {
        whereClause.workspace = {
          isArchived: false,
        };
      }

      return await (this.client as any).membership.findMany({
        where: whereClause,
        include: {
          workspace: true,
        },
        orderBy: [
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      });
    } catch (error) {
      console.error(`[MembershipRepository.listUserMemberships] Database error for usr=${userId}:`, error);
      throw error;
    }
  }

  /**
   * Resolves the primary active workspace for a user using the approved deterministic selection rule:
   * 1. Primary Preference: Earliest active owned workspace (where user is owner, workspace not archived,
   *    and user has an active OWNER membership). Ordered by workspace.createdAt ASC, workspace.id ASC.
   * 2. Fallback: If no owned workspace has an active OWNER membership, find the earliest workspace
   *    where the user has ANY active membership (status = 'active', workspace.isArchived = false).
   *    Ordered by membership.createdAt ASC, membership.workspaceId ASC.
   * 3. Excludes archived workspaces and non-active memberships.
   * 4. Returns null if user has no eligible active memberships.
   */
  public async getActiveWorkspaceForUser(userId: string): Promise<Workspace | null> {
    if (!this.isValidId(userId)) {
      return null;
    }

    const cleanUserId = userId.trim();

    try {
      // 1. Primary Preference: Earliest active owned workspace with active OWNER membership
      const ownedMemberships = await (this.client as any).membership.findMany({
        where: {
          userId: cleanUserId,
          role: 'OWNER',
          status: 'active',
          workspace: {
            ownerId: cleanUserId,
            isArchived: false,
          },
        },
        include: {
          workspace: true,
        },
        orderBy: [
          { workspace: { createdAt: 'asc' } },
          { workspace: { id: 'asc' } },
        ],
        take: 1,
      });

      if (ownedMemberships.length > 0 && ownedMemberships[0].workspace) {
        return ownedMemberships[0].workspace;
      }

      // 2. Fallback: Earliest workspace where user has ANY active membership
      const anyActiveMemberships = await (this.client as any).membership.findMany({
        where: {
          userId: cleanUserId,
          status: 'active',
          workspace: {
            isArchived: false,
          },
        },
        include: {
          workspace: true,
        },
        orderBy: [
          { createdAt: 'asc' },
          { workspaceId: 'asc' },
        ],
        take: 1,
      });

      if (anyActiveMemberships.length > 0 && anyActiveMemberships[0].workspace) {
        return anyActiveMemberships[0].workspace;
      }

      return null;
    } catch (error) {
      console.error(`[MembershipRepository.getActiveWorkspaceForUser] Database error for usr=${userId}:`, error);
      throw error;
    }
  }

  /**
   * Explicitly creates a new membership.
   * Never called automatically or silently.
   */
  public async createMembership(params: CreateMembershipParams): Promise<Membership> {
    if (!this.isValidId(params.workspaceId) || !this.isValidId(params.userId)) {
      throw new Error('MembershipRepository.createMembership: workspaceId and userId are required.');
    }

    const cleanWorkspaceId = params.workspaceId.trim();
    const cleanUserId = params.userId.trim();
    const id = `mem_${cleanWorkspaceId}_${cleanUserId}`;

    return await (this.client as any).membership.create({
      data: {
        id,
        workspaceId: cleanWorkspaceId,
        userId: cleanUserId,
        role: params.role || 'VIEWER',
        status: params.status ? params.status.trim().toLowerCase() : 'active',
      },
    });
  }

  /**
   * Updates status of an existing membership (e.g. active, suspended, revoked).
   */
  public async updateMembershipStatus(
    workspaceId: string,
    userId: string,
    status: MembershipStatus | string
  ): Promise<Membership> {
    if (!this.isValidId(workspaceId) || !this.isValidId(userId)) {
      throw new Error('MembershipRepository.updateMembershipStatus: workspaceId and userId are required.');
    }

    return await (this.client as any).membership.update({
      where: {
        workspaceId_userId: {
          workspaceId: workspaceId.trim(),
          userId: userId.trim(),
        },
      },
      data: {
        status: status.trim().toLowerCase(),
      },
    });
  }
}

export const membershipRepository = new MembershipRepository();
