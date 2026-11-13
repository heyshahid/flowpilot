'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { WorkflowVersion } from '@/core/versioning/types';
import { Button } from '@/components/ui/Button';
import {
  History,
  X,
  RotateCcw,
  Plus,
  CheckCircle2,
  Clock,
  Layers,
  FileText,
  User,
} from 'lucide-react';

interface VersionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  onRestore: (restoredNodes: any[], restoredEdges: any[]) => void;
}

export function VersionHistoryDrawer({
  isOpen,
  onClose,
  workflowId,
  onRestore,
}: VersionHistoryDrawerProps) {
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
  const [changeSummary, setChangeSummary] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    if (!workflowId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/workflows/${workflowId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch (err) {
      console.error('Failed to load workflow versions:', err);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
    }
  }, [isOpen, fetchVersions]);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const res = await fetch(`/api/v1/workflows/${workflowId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeSummary: changeSummary.trim() || 'Manual revision snapshot',
          isPublished: true,
          createdBy: 'Shahid Akram',
        }),
      });
      if (res.ok) {
        setIsSnapshotOpen(false);
        setChangeSummary('');
        await fetchVersions();
      }
    } catch (err) {
      console.error('Failed to create snapshot:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestoreVersion = async (version: WorkflowVersion) => {
    if (!confirm(`Restore workflow to Version ${version.versionNumber}? Any unsaved canvas changes will be overwritten.`)) {
      return;
    }

    setRestoringId(version.id);
    try {
      const res = await fetch(
        `/api/v1/workflows/${workflowId}/versions/${version.id}/restore`,
        { method: 'POST' }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.workflow) {
          onRestore(data.workflow.nodes, data.workflow.edges);
          onClose();
        }
      }
    } catch (err) {
      console.error('Failed to restore version:', err);
    } finally {
      setRestoringId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl border-l border-slate-200">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 bg-slate-50">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-600" />
          <h2 className="font-bold text-sm text-slate-900">Version History & Snapshots</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSnapshotOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Snapshot</span>
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Snapshot Form */}
      {isSnapshotOpen && (
        <form onSubmit={handleCreateSnapshot} className="p-4 border-b border-indigo-100 bg-indigo-50/50 space-y-2">
          <label className="block text-xs font-semibold text-slate-700">Snapshot Description</label>
          <input
            type="text"
            required
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="e.g. Added delay node and slack fallback notification"
            className="w-full px-3 py-1.5 text-xs bg-white rounded-lg border border-indigo-200 focus:outline-hidden focus:border-indigo-500"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsSnapshotOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={isCreating}>
              {isCreating ? 'Saving...' : 'Save Version'}
            </Button>
          </div>
        </form>
      )}

      {/* Version List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="text-center py-8 text-xs text-slate-400">Loading version snapshots...</div>
        )}

        {!loading && versions.length === 0 && (
          <div className="text-center py-8 text-xs text-slate-400">
            No versions saved yet. Click "Snapshot" to save this state.
          </div>
        )}

        {versions.map((ver, idx) => (
          <div
            key={ver.id}
            className={`p-3.5 rounded-xl border transition-all ${
              idx === 0
                ? 'bg-slate-50/80 border-indigo-200 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-900">
                    Version {ver.versionNumber}
                  </span>
                  {idx === 0 && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      CURRENT
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1 font-medium">
                  {ver.changeSummary || 'Snapshot'}
                </p>
              </div>

              {idx !== 0 && (
                <button
                  onClick={() => handleRestoreVersion(ver)}
                  disabled={restoringId === ver.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
                >
                  <RotateCcw
                    className={`w-3.5 h-3.5 ${
                      restoringId === ver.id ? 'animate-spin text-blue-600' : ''
                    }`}
                  />
                  <span>Restore</span>
                </button>
              )}
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {ver.nodeCount} nodes • {ver.edgeCount} edges
              </span>
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3" />
                {new Date(ver.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
