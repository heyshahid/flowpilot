/**
 * FlowPilot Isolated Test Context Adapter
 * Phase 10C-B4.2: AuthContextManager Overhaul & Session Bridge
 *
 * Strictly isolated adapter for backward compatibility with existing tests
 * (Phase 3 through Phase 9). Provides mock header/in-memory store resolution
 * exclusively during `NODE_ENV === 'test'` when no session cookie is present.
 *
 * FATAL SECURITY RULE:
 * This adapter must NEVER be invoked outside NODE_ENV === 'test'.
 */

import { NextRequest } from 'next/server';
import { AuthContext, UnauthorizedError, ForbiddenError, VerificationRequiredError } from './types';
import { userStore } from '../../lib/storage/userStore';
import { workspaceStore } from '../../lib/storage/workspaceStore';
import { membershipStore } from '../../lib/storage/membershipStore';

/**
 * Resolves a mock AuthContext for legacy tests in NODE_ENV === 'test'.
 * Throws a fatal security exception if invoked in production or development.
 */
export function resolveTestMockContext(req?: NextRequest): AuthContext | null {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('FATAL SECURITY VIOLATION: TestContextAdapter invoked outside NODE_ENV=test.');
  }

  let userId = 'usr_owner';
  let workspaceId = 'ws_default';

  if (req) {
    // 1. Headers
    const headerUser = req.headers.get('x-user-id');
    const headerWorkspace = req.headers.get('x-workspace-id');

    if (headerUser) userId = headerUser;
    if (headerWorkspace) workspaceId = headerWorkspace;

    // 2. Query params fallback
    try {
      const url = new URL(req.url);
      const queryUser = url.searchParams.get('userId');
      const queryWorkspace = url.searchParams.get('workspaceId');

      if (!headerUser && queryUser) userId = queryUser;
      if (!headerWorkspace && queryWorkspace) workspaceId = queryWorkspace;
    } catch {
      // In tests where req.url is not a full URL
    }

    // 3. Cookies fallback
    const cookieWorkspace = req.cookies?.get('fp_active_workspace')?.value;
    const cookieUser = req.cookies?.get('fp_active_user')?.value;

    if (!headerWorkspace && cookieWorkspace) workspaceId = cookieWorkspace;
    if (!headerUser && cookieUser) userId = cookieUser;
  }

  const user = userStore.getById(userId);
  if (!user) {
    throw new UnauthorizedError(`User "${userId}" not found.`);
  }

  // Pending-verification accounts are strictly barred from workspace access
  if ((user as any).status === 'PENDING_VERIFICATION') {
    throw new VerificationRequiredError('Email verification required to access workspace resources.', {
      code: 'EMAIL_VERIFICATION_REQUIRED',
      userId: user.id,
    });
  }

  const workspace = workspaceStore.getById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace "${workspaceId}" not found.`);
  }

  if (workspace.isArchived) {
    throw new ForbiddenError(`Workspace "${workspaceId}" is archived. Contact owner to restore.`);
  }

  let membership = membershipStore.getMembership(workspaceId, userId);
  if (!membership) {
    // Legacy test mock self-heal for workspace owner
    if (workspace.ownerId === userId) {
      membership = membershipStore.addMember({
        workspaceId,
        userId,
        role: 'OWNER',
        status: 'active',
      });
    } else {
      throw new ForbiddenError(`User "${userId}" is not a member of workspace "${workspaceId}".`);
    }
  }

  if (membership.status !== 'active') {
    throw new ForbiddenError(`User membership in workspace "${workspaceId}" is suspended.`);
  }

  // Update last activity
  membershipStore.recordActivity(workspaceId, userId);

  const ctx: AuthContext = {
    user: { ...user },
    workspace: {
      ...workspace,
      settings: workspace.settings ? { ...workspace.settings } : {
        allowMemberInvitations: true,
        defaultMemberRole: 'VIEWER',
        enforceExecutionLimits: true,
        retentionDays: 30,
      },
    },
    membership: { ...membership },
    role: membership.role,
  };

  // Deeply freeze DTO graph
  if (ctx.user) Object.freeze(ctx.user);
  if (ctx.workspace) {
    if (ctx.workspace.settings) Object.freeze(ctx.workspace.settings);
    Object.freeze(ctx.workspace);
  }
  if (ctx.membership) Object.freeze(ctx.membership);

  return Object.freeze(ctx);
}

