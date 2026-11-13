'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  MoreVertical,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Trash2,
  RefreshCw,
  Crown,
  KeyRound,
  Eye,
  Edit3,
} from 'lucide-react';
import { MemberWithUser } from '@/lib/storage/membershipStore';
import { InvitationRecord, UserRole } from '@/core/auth/types';
import { Button } from '@/components/ui/Button';

export default function TeamManagementPage() {
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('OWNER');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('ws_default');
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');
  const [isLoading, setIsLoading] = useState(true);

  // Invite modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('EDITOR');
  const [inviteExpiryHours, setInviteExpiryHours] = useState(168);
  const [isInviting, setIsInviting] = useState(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Role edit modal state
  const [editingMember, setEditingMember] = useState<MemberWithUser | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<UserRole>('EDITOR');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchTeamData();
  }, []);

  const fetchTeamData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const meRes = await fetch('/api/v1/users/me');
      const meData = await meRes.json();
      if (meData.success) {
        setCurrentUserId(meData.user.id);
        setCurrentUserRole(meData.role);
        setActiveWorkspaceId(meData.workspace.id);

        const [membersRes, invitesRes] = await Promise.all([
          fetch(`/api/v1/workspaces/${meData.workspace.id}/members`),
          fetch(`/api/v1/workspaces/${meData.workspace.id}/invitations`),
        ]);

        const membersData = await membersRes.json();
        const invitesData = await invitesRes.json();

        if (membersData.success) setMembers(membersData.members);
        if (invitesData.success) setInvitations(invitesData.invitations);
      }
    } catch (err) {
      setErrorMessage('Failed to load team data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          expiresInHours: inviteExpiryHours,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setGeneratedInviteUrl(data.inviteUrl);
        setInvitations([data.invitation, ...invitations]);
      } else {
        setErrorMessage(data.error || 'Failed to send invitation.');
      }
    } catch {
      setErrorMessage('Network error while creating invitation.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!editingMember) return;
    setIsUpdatingRole(true);
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/v1/workspaces/${activeWorkspaceId}/members/${editingMember.userId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: selectedNewRole }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setMembers(
          members.map((m) =>
            m.userId === editingMember.userId ? { ...m, role: selectedNewRole } : m
          )
        );
        setEditingMember(null);
      } else {
        setErrorMessage(data.error || 'Failed to change role.');
      }
    } catch {
      setErrorMessage('Network error while updating role.');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from this workspace?`)) return;
    try {
      const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/members/${userId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setMembers(members.filter((m) => m.userId !== userId));
      } else {
        alert(data.error || 'Failed to remove member.');
      }
    } catch {
      alert('Network error while removing member.');
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!confirm('Revoke this pending invitation?')) return;
    try {
      const res = await fetch(
        `/api/v1/workspaces/${activeWorkspaceId}/invitations/${invitationId}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (data.success) {
        setInvitations(
          invitations.map((i) => (i.id === invitationId ? { ...i, status: 'revoked' } : i))
        );
      }
    } catch {
      alert('Failed to revoke invitation.');
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    try {
      const res = await fetch(
        `/api/v1/workspaces/${activeWorkspaceId}/invitations/${invitationId}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (data.success) {
        alert(`Invitation resent! Link: ${data.inviteUrl}`);
        fetchTeamData();
      }
    } catch {
      alert('Failed to resend invitation.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'OWNER':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Crown className="w-3 h-3 text-amber-600" />
            OWNER
          </span>
        );
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <Shield className="w-3 h-3 text-blue-600" />
            ADMIN
          </span>
        );
      case 'EDITOR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <Edit3 className="w-3 h-3 text-emerald-600" />
            EDITOR
          </span>
        );
      case 'VIEWER':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <Eye className="w-3 h-3 text-slate-500" />
            VIEWER
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Team & Members
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage workspace teammates, role-based access permissions, and pending invitations.
          </p>
        </div>

        {['OWNER', 'ADMIN'].includes(currentUserRole) && (
          <Button
            onClick={() => {
              setGeneratedInviteUrl(null);
              setInviteEmail('');
              setIsInviteModalOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Invite Member
          </Button>
        )}
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 pb-3 px-2 text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'members'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          Active Members ({members.length})
        </button>
        <button
          onClick={() => setActiveTab('invitations')}
          className={`flex items-center gap-2 pb-3 px-2 text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'invitations'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Mail className="w-4 h-4" />
          Pending Invitations ({invitations.filter((i) => i.status === 'pending').length})
        </button>
      </div>

      {/* Members Table */}
      {activeTab === 'members' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">User</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Joined</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Loading team members...
                    </td>
                  </tr>
                ) : members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      No members found in this workspace.
                    </td>
                  </tr>
                ) : (
                  members.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <img
                            src={
                              m.user?.avatarUrl ||
                              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop'
                            }
                            alt={m.user?.name || 'User'}
                            className="w-9 h-9 rounded-full object-cover border border-slate-200"
                          />
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              {m.user?.name || 'Unknown User'}
                              {m.userId === currentUserId && (
                                <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">{m.user?.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">{getRoleBadge(m.role)}</td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            m.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              m.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          {m.status.toUpperCase()}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {new Date(m.joinedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      <td className="py-3.5 px-6 text-right">
                        {['OWNER', 'ADMIN'].includes(currentUserRole) &&
                          m.role !== 'OWNER' && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditingMember(m);
                                  setSelectedNewRole(m.role);
                                }}
                                className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-md transition-colors"
                              >
                                Change Role
                              </button>
                              <button
                                onClick={() => handleRemoveMember(m.userId, m.user?.name || 'Member')}
                                className="p-1 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                                title="Remove member"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invitations Table */}
      {activeTab === 'invitations' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Invited Email</th>
                  <th className="py-3.5 px-4">Assigned Role</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Expires</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      No invitations found.
                    </td>
                  </tr>
                ) : (
                  invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-6 font-medium text-slate-800 flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>{inv.email}</span>
                      </td>

                      <td className="py-3.5 px-4">{getRoleBadge(inv.role)}</td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            inv.status === 'accepted'
                              ? 'bg-emerald-50 text-emerald-700'
                              : inv.status === 'pending'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {inv.status.toUpperCase()}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </td>

                      <td className="py-3.5 px-6 text-right">
                        {inv.status === 'pending' && ['OWNER', 'ADMIN'].includes(currentUserRole) && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleResendInvitation(inv.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Resend
                            </button>
                            <button
                              onClick={() => handleRevokeInvitation(inv.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            >
                              Revoke
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Role Permission Matrix Card */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-5">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
          Role Permissions Overview
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center gap-1.5 font-bold text-amber-800 mb-1">
              <Crown className="w-3.5 h-3.5 text-amber-600" />
              OWNER
            </div>
            <p className="text-slate-500 leading-relaxed">
              Full workspace control, billing settings, credentials vault decryption, and ownership transfer.
            </p>
          </div>

          <div className="p-3 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center gap-1.5 font-bold text-blue-800 mb-1">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              ADMIN
            </div>
            <p className="text-slate-500 leading-relaxed">
              Manage workspace settings, invite/remove members, manage credentials, and modify all workflows.
            </p>
          </div>

          <div className="p-3 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center gap-1.5 font-bold text-emerald-800 mb-1">
              <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
              EDITOR
            </div>
            <p className="text-slate-500 leading-relaxed">
              Create, edit, and execute workflows. Create and manage schedules. Cannot manage team or raw secrets.
            </p>
          </div>

          <div className="p-3 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 mb-1">
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              VIEWER
            </div>
            <p className="text-slate-500 leading-relaxed">
              Read-only view of workflows, executions, and audit logs. Cannot modify or execute any workflows.
            </p>
          </div>
        </div>
      </div>

      {/* Invite Member Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">Invite New Teammate</h3>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {!generatedInviteUrl ? (
              <form onSubmit={handleSendInvite} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assign Role *
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="VIEWER">Viewer (Read-only workflow & execution inspection)</option>
                    <option value="EDITOR">Editor (Can build, edit, and run workflows)</option>
                    <option value="ADMIN">Admin (Full workflow, integration, and team management)</option>
                    {currentUserRole === 'OWNER' && <option value="OWNER">Owner (Co-owner of workspace)</option>}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Invitation Expiry
                  </label>
                  <select
                    value={inviteExpiryHours}
                    onChange={(e) => setInviteExpiryHours(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value={24}>24 Hours</option>
                    <option value={72}>3 Days</option>
                    <option value={168}>7 Days (Default)</option>
                    <option value={720}>30 Days</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <Button type="submit" isLoading={isInviting}>
                    Send Invitation
                  </Button>
                </div>
              </form>
            ) : (
              <div className="p-6 space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">
                      Invitation Created Successfully!
                    </h4>
                    <p className="text-xs text-emerald-700 mt-1">
                      A cryptographically secure token was generated for{' '}
                      <strong>{inviteEmail}</strong> as <strong>{inviteRole}</strong>.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Direct Invitation URL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedInviteUrl}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-700"
                    />
                    <button
                      onClick={() => copyToClipboard(generatedInviteUrl)}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copySuccess ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={() => setIsInviteModalOpen(false)}>Done</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Role Change Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">
                Change Role for {editingMember.user?.name}
              </h3>
              <button
                onClick={() => setEditingMember(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select New Role
                </label>
                <select
                  value={selectedNewRole}
                  onChange={(e) => setSelectedNewRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="VIEWER">Viewer (Read-only)</option>
                  <option value="EDITOR">Editor (Can build & execute workflows)</option>
                  <option value="ADMIN">Admin (Can manage workflows & team)</option>
                  {currentUserRole === 'OWNER' && <option value="OWNER">Owner (Full co-ownership)</option>}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <Button onClick={handleUpdateRole} isLoading={isUpdatingRole}>
                  Confirm Role Change
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
