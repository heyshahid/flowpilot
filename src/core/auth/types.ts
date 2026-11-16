export type UserRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';

export type Permission =
  // Workspace permissions
  | 'workspace:read'
  | 'workspace:update'
  | 'workspace:delete'
  | 'workspace:transfer_ownership'
  // Member & invitation permissions
  | 'member:read'
  | 'member:invite'
  | 'member:update_role'
  | 'member:remove'
  | 'member:suspend'
  // Workflow permissions
  | 'workflow:read'
  | 'workflow:create'
  | 'workflow:update'
  | 'workflow:delete'
  | 'workflow:execute'
  | 'workflow:duplicate'
  // Credential & Integration permissions
  | 'credential:read'
  | 'credential:create'
  | 'credential:update'
  | 'credential:delete'
  | 'credential:decrypt'
  | 'integration:read'
  | 'integration:manage'
  // Scheduling & Webhooks
  | 'schedule:read'
  | 'schedule:manage'
  | 'webhook:read'
  | 'webhook:manage'
  // Audit logging & Analytics
  | 'audit:read'
  // Workspace Usage & Quotas (Phase 9F)
  | 'usage:read'
  | 'quota:read'
  | 'quota:manage'
  // Alert Rules & Incidents (Phase 9F)
  | 'alert:read'
  | 'alert:manage'
  // Optimization Recommendations Engine (Phase 9G)
  | 'recommendation:read'
  | 'recommendation:evaluate'
  | 'recommendation:manage'
  | 'recommendation:feedback';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface WorkspaceSettings {
  allowMemberInvitations: boolean;
  defaultMemberRole: UserRole;
  enforceExecutionLimits: boolean;
  retentionDays: number;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  description: string;
  plan: 'starter' | 'pro' | 'enterprise';
  ownerId: string;
  isArchived: boolean;
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
}

export type MembershipStatus = 'active' | 'suspended';

export interface MembershipRecord {
  id: string;
  workspaceId: string;
  userId: string;
  role: UserRole;
  status: MembershipStatus;
  joinedAt: string;
  lastActiveAt?: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface InvitationRecord {
  id: string;
  workspaceId: string;
  workspaceName?: string;
  email: string;
  role: UserRole;
  tokenHash: string;
  rawToken?: string; // Only populated at creation time for display/email
  status: InvitationStatus;
  invitedBy: string;
  invitedByName?: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
}

export interface AuthContext {
  user: UserRecord;
  workspace: WorkspaceRecord;
  membership: MembershipRecord;
  role: UserRole;
}

// ----------------------------------------------------
// Standardized Security Errors
// ----------------------------------------------------

export class AuthError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;

  constructor(message: string, statusCode = 401, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message: string, code = 'UNAUTHORIZED') {
    const formatted = message.startsWith('Unauthorized:')
      ? message
      : `Unauthorized: ${message}`;
    super(formatted, 401, code);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AuthError {
  constructor(message: string, code = 'FORBIDDEN') {
    const formatted = message.startsWith('Forbidden:')
      ? message
      : `Forbidden: ${message}`;
    super(formatted, 403, code);
    this.name = 'ForbiddenError';
  }
}

export class VerificationRequiredError extends AuthError {
  public readonly userId?: string;

  constructor(message: string, options?: { code?: string; userId?: string }) {
    const formatted = message.startsWith('Forbidden:')
      ? message
      : `Forbidden: Email verification required: ${message}`;
    super(formatted, 403, options?.code || 'EMAIL_VERIFICATION_REQUIRED');
    this.name = 'VerificationRequiredError';
    this.userId = options?.userId;
  }
}

export class WorkspaceIsolationError extends AuthError {
  constructor(message: string, code = 'WORKSPACE_ISOLATION_VIOLATION') {
    const formatted = message.startsWith('Forbidden:')
      ? message
      : `Forbidden: Cross-workspace access violation: ${message}`;
    super(formatted, 403, code);
    this.name = 'WorkspaceIsolationError';
  }
}

export class WorkspaceNotFoundError extends AuthError {
  constructor(message: string, code = 'WORKSPACE_NOT_FOUND') {
    const formatted = message.includes('not found')
      ? message
      : `Workspace not found: ${message}`;
    super(formatted, 404, code);
    this.name = 'WorkspaceNotFoundError';
  }
}

export class InvalidSelectorError extends AuthError {
  constructor(message: string, code = 'INVALID_WORKSPACE_SELECTOR') {
    super(`Invalid workspace selector: ${message}`, 400, code);
    this.name = 'InvalidSelectorError';
  }
}
