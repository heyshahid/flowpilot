'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Check, Settings, Users, Building2, Shield } from 'lucide-react';
import { WorkspaceRecord, UserRole } from '@/core/auth/types';

interface WorkspaceSelectorProps {
  collapsed?: boolean;
}

export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({ collapsed }) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceRecord | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('OWNER');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch('/api/v1/users/me');
      const data = await res.json();
      if (data.success) {
        setActiveWorkspace(data.workspace);
        setWorkspaces(data.availableWorkspaces || []);
        setCurrentUserRole(data.role);
      }
    } catch {
      // Fallback
    }
  };

  const handleSwitchWorkspace = (wsId: string) => {
    document.cookie = `fp_active_workspace=${wsId}; path=/; max-age=2592000; SameSite=Lax`;
    setIsOpen(false);
    window.location.reload();
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;

    setIsCreating(true);
    try {
      const res = await fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newWsName.trim(),
          description: newWsDesc.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setNewWsName('');
        setNewWsDesc('');
        handleSwitchWorkspace(data.workspace.id);
      }
    } catch (err) {
      console.error('Failed to create workspace', err);
    } finally {
      setIsCreating(false);
    }
  };

  if (collapsed) {
    return (
      <div className="p-2 border-b border-slate-100 flex justify-center">
        <button
          onClick={() => setIsOpen(!isOpen)}
          title={activeWorkspace?.name || 'Workspace'}
          className="h-10 w-10 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs"
        >
          {activeWorkspace?.name.substring(0, 2).toUpperCase() || 'WS'}
        </button>
      </div>
    );
  }

  return (
    <div className="relative px-3 py-2 border-b border-slate-100">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100/80 transition-all border border-slate-200/70 text-left group"
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="h-8 w-8 shrink-0 rounded-md bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-sm">
            {activeWorkspace?.name.substring(0, 2).toUpperCase() || 'FP'}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-xs font-semibold text-slate-800 truncate leading-tight group-hover:text-blue-600 transition-colors">
              {activeWorkspace?.name || 'Select Workspace'}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-medium text-slate-400 capitalize">
                {activeWorkspace?.plan || 'Pro'}
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-blue-100 text-blue-700 uppercase">
                {currentUserRole}
              </span>
            </div>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 shrink-0 transition-transform duration-200" />
      </button>

      {/* Workspace Menu Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-3 right-3 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 divide-y divide-slate-100 overflow-hidden">
            {/* Workspaces List */}
            <div className="max-h-56 overflow-y-auto py-1">
              <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Workspaces ({workspaces.length})
              </div>
              {workspaces.map((ws) => {
                const isSelected = ws.id === activeWorkspace?.id;
                return (
                  <button
                    key={ws.id}
                    onClick={() => handleSwitchWorkspace(ws.id)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="h-6 w-6 rounded bg-slate-100 text-slate-700 font-semibold text-[10px] flex items-center justify-center shrink-0">
                        {ws.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col truncate">
                        <span className={`truncate ${isSelected ? 'font-bold text-blue-600' : 'text-slate-700 font-medium'}`}>
                          {ws.name}
                        </span>
                        <span className="text-[10px] text-slate-400 capitalize">{ws.plan} plan</span>
                      </div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div className="py-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowCreateModal(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50/60 font-medium transition-colors text-left"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Workspace</span>
              </button>
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push('/team');
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 font-medium transition-colors text-left"
              >
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>Manage Team & Members</span>
              </button>
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push('/settings/workspace');
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 font-medium transition-colors text-left"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                <span>Workspace Settings</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create Workspace Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">Create New Workspace</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWorkspace} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Workspace Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Marketing, Analytics Lab"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="What is this workspace used for?"
                  value={newWsDesc}
                  onChange={(e) => setNewWsDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-lg flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 leading-relaxed">
                  Workspaces provide complete data isolation. Workflows, credentials, webhooks, and executions are never shared across workspaces.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newWsName.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
                >
                  {isCreating ? 'Creating...' : 'Create Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
