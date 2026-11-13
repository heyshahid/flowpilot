'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Shield,
  Save,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  Archive,
  Crown,
  Users,
} from 'lucide-react';
import { WorkspaceRecord, UserRole } from '@/core/auth/types';
import { MemberWithUser } from '@/lib/storage/membershipStore';
import { Button } from '@/components/ui/Button';

export default function WorkspaceSettingsPage() {
  const [workspace, setWorkspace] = useState<WorkspaceRecord | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('OWNER');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [allowInvitations, setAllowInvitations] = useState(true);
  const [defaultRole, setDefaultRole] = useState<UserRole>('EDITOR');
  const [enforceLimits, setEnforceLimits] = useState(true);

  // Ownership transfer state
  const [selectedNewOwnerId, setSelectedNewOwnerId] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);

  useEffect(() => {
    fetchWorkspaceData();
  }, []);

  const fetchWorkspaceData = async () => {
    setIsLoading(true);
    try {
      const meRes = await fetch('/api/v1/users/me');
      const meData = await meRes.json();
      if (meData.success) {
        setWorkspace(meData.workspace);
        setCurrentUserRole(meData.role);
        setCurrentUserId(meData.user.id);
        setName(meData.workspace.name);
        setDescription(meData.workspace.description || '');
        setAllowInvitations(meData.workspace.settings?.allowMemberInvitations ?? true);
        setDefaultRole(meData.workspace.settings?.defaultMemberRole || 'EDITOR');
        setEnforceLimits(meData.workspace.settings?.enforceExecutionLimits ?? true);

        // Fetch workspace members for ownership transfer picker
        const memRes = await fetch(`/api/v1/workspaces/${meData.workspace.id}/members`);
        const memData = await memRes.json();
        if (memData.success) {
          setMembers(memData.members.filter((m: MemberWithUser) => m.userId !== meData.user.id));
        }
      }
    } catch {
      setErrorMessage('Failed to load workspace configuration.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace) return;
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          settings: {
            allowMemberInvitations: allowInvitations,
            defaultMemberRole: defaultRole,
            enforceExecutionLimits: enforceLimits,
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setErrorMessage(data.error || 'Failed to update workspace.');
      }
    } catch {
      setErrorMessage('Network error while saving settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!workspace || !selectedNewOwnerId) return;
    const targetMember = members.find((m) => m.userId === selectedNewOwnerId);
    if (!confirm(`Are you absolutely sure you want to transfer ownership of "${workspace.name}" to ${targetMember?.user?.name || selectedNewOwnerId}? You will become an ADMIN.`)) {
      return;
    }

    setIsTransferring(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId: selectedNewOwnerId }),
      });

      const data = await res.json();
      if (data.success) {
        setTransferSuccess(true);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setErrorMessage(data.error || 'Failed to transfer ownership.');
      }
    } catch {
      setErrorMessage('Network error while transferring ownership.');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleArchiveWorkspace = async () => {
    if (!workspace) return;
    if (!confirm(`Are you sure you want to archive "${workspace.name}"? Members will no longer be able to run or edit workflows.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        window.location.href = '/';
      } else {
        alert(data.error);
      }
    } catch {
      alert('Failed to archive workspace.');
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-slate-400">
        Loading workspace settings...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Workspace Settings
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure workspace profile, member collaboration defaults, and access controls.
        </p>
      </div>

      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>Workspace settings updated successfully!</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-sm text-red-800">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* General Settings Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <Building2 className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-slate-900 text-base">Workspace Profile</h2>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Workspace Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={currentUserRole === 'VIEWER'}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Workspace ID
              </label>
              <input
                type="text"
                readOnly
                value={workspace?.id || ''}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={currentUserRole === 'VIEWER'}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Collaboration & Policies
            </h3>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200/80">
              <div>
                <div className="text-xs font-semibold text-slate-800">
                  Allow Team Invitations
                </div>
                <div className="text-[11px] text-slate-500">
                  Enable Admins and Owners to invite external collaborators by email.
                </div>
              </div>
              <input
                type="checkbox"
                checked={allowInvitations}
                onChange={(e) => setAllowInvitations(e.target.checked)}
                disabled={currentUserRole === 'VIEWER'}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200/80">
              <div>
                <div className="text-xs font-semibold text-slate-800">
                  Enforce Execution Concurrency Limits
                </div>
                <div className="text-[11px] text-slate-500">
                  Throttle parallel background workflow runs according to plan limits.
                </div>
              </div>
              <input
                type="checkbox"
                checked={enforceLimits}
                onChange={(e) => setEnforceLimits(e.target.checked)}
                disabled={currentUserRole === 'VIEWER'}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </div>
          </div>

          {['OWNER', 'ADMIN'].includes(currentUserRole) && (
            <div className="flex justify-end pt-2">
              <Button type="submit" isLoading={isSaving} className="flex items-center gap-2">
                <Save className="w-4 h-4" />
                Save Changes
              </Button>
            </div>
          )}
        </form>
      </div>

      {/* Ownership Transfer Card (OWNER Only) */}
      {currentUserRole === 'OWNER' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Crown className="w-5 h-5 text-amber-600" />
            <h2 className="font-bold text-slate-900 text-base">Transfer Workspace Ownership</h2>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Transfer full administrative ownership of this workspace to another active member. You will automatically retain <strong>ADMIN</strong> privileges.
          </p>

          {transferSuccess ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-semibold">
              Ownership transferred! Reloading workspace context...
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <select
                value={selectedNewOwnerId}
                onChange={(e) => setSelectedNewOwnerId(e.target.value)}
                className="w-full sm:w-80 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              >
                <option value="">Select an active team member...</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user?.name || m.userId} ({m.role} - {m.user?.email})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleTransferOwnership}
                disabled={!selectedNewOwnerId || isTransferring}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                {isTransferring ? 'Transferring...' : 'Transfer Ownership'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Danger Zone: Archive */}
      {currentUserRole === 'OWNER' && (
        <div className="bg-rose-50/60 rounded-xl border border-rose-200 p-6 space-y-3">
          <div className="flex items-center gap-2 text-rose-900 font-bold text-base">
            <Archive className="w-5 h-5 text-rose-600" />
            Danger Zone
          </div>
          <p className="text-xs text-rose-700 leading-relaxed">
            Archiving this workspace will freeze all workflow triggers, pause active cron schedules, and revoke member access.
          </p>
          <button
            onClick={handleArchiveWorkspace}
            className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
          >
            Archive This Workspace
          </button>
        </div>
      )}
    </div>
  );
}
