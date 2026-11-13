import { NextRequest } from 'next/server';
import { AuthContext, Permission, UserRole } from './types';
import { userStore } from '../../lib/storage/userStore';
import { workspaceStore } from '../../lib/storage/workspaceStore';
import { membershipStore } from '../../lib/storage/membershipStore';
import { RBACManager } from './rbac';

export class AuthContextManager {
  /**
   * Resolves authentication context from request headers, cookies or query parameters.
   * Default fallback to 'usr_owner' and 'ws_default' for developer testing.
   */
  public static async resolve(req?: NextRequest): Promise<AuthContext> {
    let userId = 'usr_owner';
    let workspaceId = 'ws_default';

    if (req) {
      // 1. Headers
      const headerUser = req.headers.get('x-user-id');
      const headerWorkspace = req.headers.get('x-workspace-id');

      if (headerUser) userId = headerUser;
      if (headerWorkspace) workspaceId = headerWorkspace;

      // 2. Query params fallback
      const url = new URL(req.url);
      const queryUser = url.searchParams.get('userId');
      const queryWorkspace = url.searchParams.get('workspaceId');

      if (!headerUser && queryUser) userId = queryUser;
      if (!headerWorkspace && queryWorkspace) workspaceId = queryWorkspace;

      // 3. Cookies fallback
      const cookieWorkspace = req.cookies.get('fp_active_workspace')?.value;
      const cookieUser = req.cookies.get('fp_active_user')?.value;

      if (!headerWorkspace && !queryWorkspace && cookieWorkspace) workspaceId = cookieWorkspace;
      if (!headerUser && !queryUser && cookieUser) userId = cookieUser;
    }

    const user = userStore.getById(userId);
    if (!user) {
      throw new Error(`Unauthorized: User "${userId}" not found.`);
    }

    const workspace = workspaceStore.getById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace "${workspaceId}" not found.`);
    }

    if (workspace.isArchived) {
      throw new Error(`Workspace "${workspaceId}" is archived. Contact owner to restore.`);
    }

    let membership = membershipStore.getMembership(workspaceId, userId);
    if (!membership) {
      // If user is workspace owner but missing membership record, self-heal
      if (workspace.ownerId === userId) {
        membership = membershipStore.addMember({
          workspaceId,
          userId,
          role: 'OWNER',
          status: 'active',
        });
      } else {
        throw new Error(`Forbidden: User "${userId}" is not a member of workspace "${workspaceId}".`);
      }
    }

    if (membership.status !== 'active') {
      throw new Error(`Forbidden: User membership in workspace "${workspaceId}" is suspended.`);
    }

    // Update last activity
    membershipStore.recordActivity(workspaceId, userId);

    return {
      user,
      workspace,
      membership,
      role: membership.role,
    };
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
   */
  public static async enforceWorkspaceIsolation(
    req: NextRequest,
    targetWorkspaceId: string,
    permission?: Permission
  ): Promise<AuthContext> {
    const ctx = await this.resolve(req);

    if (ctx.workspace.id !== targetWorkspaceId) {
      throw new Error(
        `Cross-workspace access violation: Active workspace "${ctx.workspace.id}" does not match target resource workspace "${targetWorkspaceId}".`
      );
    }

    if (permission) {
      RBACManager.assertPermission(ctx.role, permission);
    }

    return ctx;
  }
}
