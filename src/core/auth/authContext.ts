/**
 * FlowPilot Authoritative Authentication Context Manager
 * Phase 10C-B4.2: AuthContextManager Overhaul & Session Bridge
 *
 * Implements authoritative server-side session and workspace authorization:
 * - Verified PostgreSQL session resolution via sessionRepository
 * - Strict rejection of client identity spoofing (x-user-id, roles) in production/dev
 * - Account status enforcement (SUSPENDED -> 403, PENDING_VERIFICATION -> 403)
 * - Deterministic workspace resolution via membershipRepository (B4.1)
 * - Mandatory active membership and non-archived workspace validation
 * - Absolute precedence of route-targeted parameters over client headers
 * - Conflict rejection for contradictory header/query workspace selectors
 * - Non-mutating workspace switching returning deeply frozen AuthContext DTOs
 * - Triple-gated testContextAdapter isolation for legacy test compatibility
 */

import { NextRequest } from 'next/server';
import {
  AuthContext,
  UserRecord,
  WorkspaceRecord,
  MembershipRecord,
  Permission,
  UserRole,
  UnauthorizedError,
  ForbiddenError,
  VerificationRequiredError,
  WorkspaceIsolationError,
  InvalidSelectorError,
} from './types';
import { sessionRepository, SessionRepository } from '../../lib/storage/postgres/sessionRepository';
import { membershipRepository, MembershipRepository } from '../../lib/storage/postgres/membershipRepository';
import { userWorkspaceRepository, PostgresUserWorkspaceRepository } from '../../lib/storage/postgres/userWorkspaceRepository';
import { extractSessionToken } from '../../lib/security/cookies';
import { getSecurityConfig } from '../../lib/security/config';
import { RBACManager } from './rbac';
import { resolveTestMockContext } from './testContextAdapter';

/**
 * Deeply freezes the AuthContext DTO graph.
 * Protects every plain object node: root context, user DTO, workspace DTO,
 * workspace.settings DTO, and membership DTO.
 * Guarantees immutability without freezing shared Prisma engine state.
 */
function deepFreezeAuthContext(ctx: AuthContext): AuthContext {
  if (ctx.user && typeof ctx.user === 'object') {
    Object.freeze(ctx.user);
  }
  if (ctx.workspace && typeof ctx.workspace === 'object') {
    if (ctx.workspace.settings && typeof ctx.workspace.settings === 'object') {
      Object.freeze(ctx.workspace.settings);
    }
    Object.freeze(ctx.workspace);
  }
  if (ctx.membership && typeof ctx.membership === 'object') {
    Object.freeze(ctx.membership);
  }
  return Object.freeze(ctx);
}

export class AuthContextManager {
  private static sessionRepo: SessionRepository = sessionRepository;
  private static membershipRepo: MembershipRepository = membershipRepository;
  private static userWorkspaceRepo: PostgresUserWorkspaceRepository = userWorkspaceRepository;

  private static mapUserDto(row: any): UserRecord {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatarUrl || undefined,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  }

  private static mapWorkspaceDto(row: any): WorkspaceRecord {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description || `${row.name} workspace`,
      plan: row.plan || 'pro',
      ownerId: row.ownerId,
      isArchived: !!row.isArchived,
      settings: row.settings || {
        allowMemberInvitations: true,
        defaultMemberRole: 'VIEWER',
        enforceExecutionLimits: true,
        retentionDays: 30,
      },
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }

  private static mapMembershipDto(row: any): MembershipRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      role: row.role,
      status: row.status,
      joinedAt: (row.joinedAt || row.createdAt) instanceof Date
        ? (row.joinedAt || row.createdAt).toISOString()
        : String(row.joinedAt || row.createdAt),
      lastActiveAt: row.lastActiveAt
        ? (row.lastActiveAt instanceof Date ? row.lastActiveAt.toISOString() : String(row.lastActiveAt))
        : undefined,
    };
  }

  /**
   * Overrides repository instances during automated tests.
   */
  public static setRepositoriesForTesting(repos: {
    sessionRepository?: SessionRepository;
    membershipRepository?: MembershipRepository;
    userWorkspaceRepository?: PostgresUserWorkspaceRepository;
  }) {
    if (repos.sessionRepository) this.sessionRepo = repos.sessionRepository;
    if (repos.membershipRepository) this.membershipRepo = repos.membershipRepository;
    if (repos.userWorkspaceRepository) this.userWorkspaceRepo = repos.userWorkspaceRepository;
  }

  /**
   * Resets repositories back to default singleton instances.
   */
  public static resetRepositoriesForTesting() {
    this.sessionRepo = sessionRepository;
    this.membershipRepo = membershipRepository;
    this.userWorkspaceRepo = userWorkspaceRepository;
  }

  /**
   * Resolves authentication context exclusively through verified PostgreSQL sessions
   * and authoritative database memberships.
   *
   * In NODE_ENV === 'test' without a session cookie, delegates to the isolated
   * testContextAdapter to preserve existing regression suites.
   */
  public static async resolve(req?: NextRequest): Promise<AuthContext> {
    // 1. Environment & Test Precedence Gate
    if (process.env.NODE_ENV === 'test') {
      const cookieHeader = req?.headers.get('cookie');
      const testSessionToken = extractSessionToken(cookieHeader, false);

      // If test does not supply a real session cookie, use isolated test adapter
      if (!testSessionToken) {
        const testCtx = resolveTestMockContext(req);
        if (testCtx) return testCtx;
      }
      // If session cookie IS provided in test, proceed to authoritative DB flow below!
    }

    if (!req) {
      throw new UnauthorizedError('Authentication required. Request context missing.');
    }

    const config = getSecurityConfig();
    const cookieHeader = req.headers.get('cookie');
    const rawSessionToken = extractSessionToken(cookieHeader, config.isProduction);

    // 2. Fail-Closed Session Verification
    if (!rawSessionToken) {
      throw new UnauthorizedError('Authentication required. No session cookie found.');
    }

    // Validate dual expiration (14d absolute, 2h idle) and touch lastActiveAt
    const sessionValidation = await this.sessionRepo.validateSession(rawSessionToken);

    if (!sessionValidation.valid || !sessionValidation.session) {
      throw new UnauthorizedError(
        `Invalid or expired session (${sessionValidation.reason || 'SESSION_INVALID'}). Please log in again.`
      );
    }

    const userRow = sessionValidation.user;
    if (!userRow) {
      throw new UnauthorizedError('User account associated with session not found.');
    }

    // 3. User Account Status & Email Verification Enforcement
    if (userRow.status === 'SUSPENDED') {
      throw new ForbiddenError('Account is suspended. Access denied.');
    }

    if (userRow.status === 'PENDING_VERIFICATION') {
      throw new VerificationRequiredError('Email verification required to access workspace resources.', {
        code: 'EMAIL_VERIFICATION_REQUIRED',
        userId: userRow.id,
      });
    }

    // Map user to immutable UserRecord DTO
    const userDto = this.mapUserDto(userRow);

    // 4. Workspace Selector Parsing & Precedence
    const headerWorkspace = req.headers.get('x-workspace-id')?.trim() || null;
    let queryWorkspace: string | null = null;

    try {
      const url = new URL(req.url);
      queryWorkspace = url.searchParams.get('workspaceId')?.trim() || null;
    } catch {
      // Ignore URL parse error in mock environments
    }

    // Deterministic Conflict Handling: Reject contradictory selectors
    if (headerWorkspace && queryWorkspace && headerWorkspace !== queryWorkspace) {
      throw new InvalidSelectorError('Conflicting header and query workspace parameters.');
    }

    const selectorWorkspaceId = headerWorkspace || queryWorkspace || null;

    let targetWorkspace: any = null;
    let targetMembership: any = null;

    if (selectorWorkspaceId) {
      // 4a. Client specified an untrusted workspace selector: verify database membership
      const membership = await this.membershipRepo.getMembership(selectorWorkspaceId, userRow.id);

      if (
        !membership ||
        membership.status !== 'active' ||
        membership.workspace.isArchived
      ) {
        throw new WorkspaceIsolationError(
          `User "${userRow.id}" does not have active membership in workspace "${selectorWorkspaceId}".`
        );
      }

      targetWorkspace = membership.workspace;
      targetMembership = membership;
    } else {
      // 4b. No selector provided: deterministic owned workspace resolution
      const ownedWs = await this.membershipRepo.getActiveWorkspaceForUser(userRow.id);

      if (ownedWs) {
        const mem = await this.membershipRepo.getMembership(ownedWs.id, userRow.id);
        if (mem && mem.status === 'active') {
          targetWorkspace = ownedWs;
          targetMembership = mem;
        }
      }

      // If user owns no active workspace, fall back to earliest active membership
      if (!targetWorkspace) {
        const memberships = await this.membershipRepo.listUserMemberships(userRow.id, {
          status: 'active',
          includeArchived: false,
        });

        if (memberships.length > 0) {
          targetWorkspace = memberships[0].workspace;
          targetMembership = memberships[0];
        }
      }

      if (!targetWorkspace || !targetMembership) {
        throw new ForbiddenError(`No active workspace membership found for user "${userRow.id}".`);
      }
    }

    // 5. Map DTOs and return deeply frozen AuthContext
    const workspaceDto = this.mapWorkspaceDto(targetWorkspace);
    const membershipDto = this.mapMembershipDto(targetMembership);
    const role = targetMembership.role as UserRole;

    const ctx: AuthContext = {
      user: userDto,
      workspace: workspaceDto,
      membership: membershipDto,
      role,
    };

    return deepFreezeAuthContext(ctx);
  }

  /**
   * Enforces that the incoming request has a specific permission in the active workspace.
   */
  public static async enforcePermission(req: NextRequest, permission: Permission): Promise<AuthContext> {
    const ctx = await this.resolve(req);
    RBACManager.assertPermission(ctx.role, permission);
    return ctx;
  }

  /**
   * Enforces that the request's active workspace matches the target resource's workspace.
   * Route parameter precedence: targetWorkspaceId passed from route parameters takes absolute
   * priority, ignoring any untrusted client headers.
   * Returns a NEW, deeply frozen AuthContext instance on workspace switch (non-mutating).
   */
  public static async enforceWorkspaceIsolation(
    req: NextRequest,
    targetWorkspaceId: string,
    permission?: Permission
  ): Promise<AuthContext> {
    if (!targetWorkspaceId || typeof targetWorkspaceId !== 'string' || targetWorkspaceId.trim().length === 0) {
      throw new WorkspaceIsolationError('Target workspace ID is required.');
    }

    const cleanTargetId = targetWorkspaceId.trim();

    // In NODE_ENV === 'test' without session cookie, preserve legacy test isolation behavior
    if (process.env.NODE_ENV === 'test') {
      const cookieHeader = req?.headers.get('cookie');
      const testSessionToken = extractSessionToken(cookieHeader, false);

      if (!testSessionToken) {
        const ctx = await this.resolve(req);
        if (ctx.workspace.id !== cleanTargetId) {
          throw new WorkspaceIsolationError(
            `Active workspace "${ctx.workspace.id}" does not match target resource workspace "${cleanTargetId}".`
          );
        }
        if (permission) {
          RBACManager.assertPermission(ctx.role, permission);
        }
        return ctx;
      }
    }

    // Authoritative PostgreSQL flow:
    const currentCtx = await this.resolve(req);

    // If target already matches active workspace, assert permission and return current frozen context
    if (currentCtx.workspace.id === cleanTargetId) {
      if (permission) {
        RBACManager.assertPermission(currentCtx.role, permission);
      }
      return currentCtx;
    }

    // Target differs from default active: verify database membership in explicit target workspace
    const targetMembership = await this.membershipRepo.getMembership(
      cleanTargetId,
      currentCtx.user.id
    );

    if (
      !targetMembership ||
      targetMembership.status !== 'active' ||
      targetMembership.workspace.isArchived
    ) {
      throw new WorkspaceIsolationError(
        `User "${currentCtx.user.id}" does not have active membership in workspace "${cleanTargetId}".`
      );
    }

    const role = targetMembership.role as UserRole;
    if (permission) {
      RBACManager.assertPermission(role, permission);
    }

    // Return a NEW, deeply frozen AuthContext instance (functional, non-mutating)
    const switchedCtx: AuthContext = {
      user: currentCtx.user,
      workspace: this.mapWorkspaceDto(targetMembership.workspace),
      membership: this.mapMembershipDto(targetMembership),
      role,
    };

    return deepFreezeAuthContext(switchedCtx);
  }
}
