import { Permission, UserRole } from './types';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  OWNER: [
    'workspace:read',
    'workspace:update',
    'workspace:delete',
    'workspace:transfer_ownership',
    'member:read',
    'member:invite',
    'member:update_role',
    'member:remove',
    'member:suspend',
    'workflow:read',
    'workflow:create',
    'workflow:update',
    'workflow:delete',
    'workflow:execute',
    'workflow:duplicate',
    'credential:read',
    'credential:create',
    'credential:update',
    'credential:delete',
    'credential:decrypt',
    'integration:read',
    'integration:manage',
    'schedule:read',
    'schedule:manage',
    'webhook:read',
    'webhook:manage',
    'audit:read',
  ],
  ADMIN: [
    'workspace:read',
    'workspace:update',
    'member:read',
    'member:invite',
    'member:update_role',
    'member:remove',
    'member:suspend',
    'workflow:read',
    'workflow:create',
    'workflow:update',
    'workflow:delete',
    'workflow:execute',
    'workflow:duplicate',
    'credential:read',
    'credential:create',
    'credential:update',
    'credential:delete',
    'integration:read',
    'integration:manage',
    'schedule:read',
    'schedule:manage',
    'webhook:read',
    'webhook:manage',
    'audit:read',
  ],
  EDITOR: [
    'workspace:read',
    'member:read',
    'workflow:read',
    'workflow:create',
    'workflow:update',
    'workflow:execute',
    'workflow:duplicate',
    'credential:read',
    'integration:read',
    'schedule:read',
    'schedule:manage',
    'webhook:read',
    'audit:read',
  ],
  VIEWER: [
    'workspace:read',
    'member:read',
    'workflow:read',
    'credential:read',
    'integration:read',
    'schedule:read',
    'webhook:read',
    'audit:read',
  ],
};

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

export class RBACManager {
  /**
   * Checks whether a role is granted a specific permission.
   */
  public static hasPermission(role: UserRole, permission: Permission): boolean {
    const list = ROLE_PERMISSIONS[role];
    if (!list) return false;
    return list.includes(permission);
  }

  /**
   * Throws an error if the role lacks the required permission.
   */
  public static assertPermission(role: UserRole, permission: Permission): void {
    if (!this.hasPermission(role, permission)) {
      throw new Error(`Forbidden: Role "${role}" lacks permission "${permission}".`);
    }
  }

  /**
   * Evaluates if actorRole can modify targetRole (e.g., ADMIN cannot demote OWNER).
   */
  public static canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
    if (actorRole === 'OWNER') return true;
    if (actorRole === 'ADMIN') {
      return ROLE_HIERARCHY[targetRole] < ROLE_HIERARCHY['ADMIN'];
    }
    return false;
  }
}
