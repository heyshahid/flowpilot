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
  | 'audit:read';

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
