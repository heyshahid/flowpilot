'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { workflowStore, WorkflowRecord, WorkflowStatus } from '@/lib/storage/workflowStore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { CreateWorkflowModal } from '@/components/workflows/CreateWorkflowModal';
import { formatDate } from '@/lib/utils';
import {
  GitBranch,
  Plus,
  PlayCircle,
  Copy,
  Edit2,
  Trash2,
  Power,
  Layers,
  Clock,
  LayoutGrid,
  List,
  MoreVertical,
} from 'lucide-react';

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WorkflowStatus>('all');
  const [sortBy, setSortBy] = useState<'updated' | 'name' | 'runs'>('updated');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<WorkflowRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<WorkflowRecord | null>(null);

  const loadWorkflows = () => {
    setWorkflows(workflowStore.getAll());
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  // Filter & Sort
  const filteredWorkflows = workflows
    .filter((wf) => {
      const matchesSearch =
        wf.name.toLowerCase().includes(search.toLowerCase()) ||
        wf.description.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || wf.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'runs') return (b.executionCount || 0) - (a.executionCount || 0);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  // Action Handlers
  const handleToggleStatus = (id: string) => {
    workflowStore.toggleStatus(id);
    loadWorkflows();
  };

  const handleDuplicate = (id: string) => {
    workflowStore.duplicate(id);
    loadWorkflows();
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    workflowStore.rename(renameTarget.id, renameValue.trim());
    setRenameTarget(null);
    loadWorkflows();
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    workflowStore.delete(deleteTarget.id);
    setDeleteTarget(null);
    loadWorkflows();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Automations & Workflows
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your visual DAG pipelines, triggers, and execution schedules.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setIsCreateOpen(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          Create Workflow
        </Button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex flex-1 items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search workflows by title or description..."
            className="w-full sm:max-w-md"
          />

          {/* Status Filter */}
          <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
            {(['all', 'active', 'draft'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 rounded-md transition-all capitalize ${
                  statusFilter === status
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Sort & View Mode Controls */}
        <div className="flex items-center gap-2.5">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="updated">Recently Updated</option>
            <option value="name">Alphabetical (A-Z)</option>
            <option value="runs">Most Executions</option>
          </select>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Grid vs List vs Empty */}
      {filteredWorkflows.length === 0 ? (
        <EmptyState
          icon={<GitBranch className="w-6 h-6" />}
          title={search ? 'No matching workflows found' : 'No workflows yet'}
          description={
            search
              ? `No workflows matched "${search}". Try adjusting your query or filter.`
              : 'Create your first automated workflow to connect webhooks, logic, and APIs.'
          }
          actionLabel={search ? 'Clear Search' : 'Create Workflow'}
          onAction={() => {
            if (search) {
              setSearch('');
              setStatusFilter('all');
            } else {
              setIsCreateOpen(true);
            }
          }}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredWorkflows.map((wf) => (
            <div
              key={wf.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs hover:shadow-md hover:border-slate-300 transition-all group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <Badge variant={wf.status} size="sm">
                    {wf.status.toUpperCase()}
                  </Badge>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleToggleStatus(wf.id)}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      title={wf.status === 'active' ? 'Pause workflow' : 'Activate workflow'}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDuplicate(wf.id)}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      title="Duplicate workflow"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setRenameTarget(wf);
                        setRenameValue(wf.name);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      title="Rename workflow"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(wf)}
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                      title="Delete workflow"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <Link
                  href={`/builder/${wf.id}`}
                  className="font-bold text-base text-slate-900 hover:text-blue-600 transition-colors line-clamp-1"
                >
                  {wf.name}
                </Link>
                <p className="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  {wf.description || 'No description provided.'}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" />
                    {wf.nodes.length} nodes
                  </span>
                  <span>•</span>
                  <span>{wf.executionCount || 0} runs</span>
                </div>

                <Link href={`/builder/${wf.id}`}>
                  <Button variant="ghost" size="sm" icon={<PlayCircle className="w-3.5 h-3.5 text-blue-600" />}>
                    Open
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Workflow</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Topology</th>
                <th className="py-3.5 px-4">Executions</th>
                <th className="py-3.5 px-4">Last Updated</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWorkflows.map((wf) => (
                <tr key={wf.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <Link
                      href={`/builder/${wf.id}`}
                      className="font-bold text-sm text-slate-900 hover:text-blue-600 transition-colors"
                    >
                      {wf.name}
                    </Link>
                    <p className="text-xs text-slate-500 truncate max-w-sm">
                      {wf.description || 'No description.'}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={wf.status} size="sm">
                      {wf.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    <span className="font-semibold">{wf.nodes.length}</span> nodes, {wf.edges.length} edges
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    <span className="font-semibold text-emerald-600">{wf.successCount || 0}</span> / {wf.executionCount || 0}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-400">
                    {formatDate(wf.updatedAt)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Link href={`/builder/${wf.id}`}>
                        <Button variant="outline" size="sm">
                          Edit Canvas
                        </Button>
                      </Link>
                      <button
                        onClick={() => handleDuplicate(wf.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(wf)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rename Modal */}
      <Modal
        isOpen={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Rename Workflow"
        description="Update the display title of this automation pipeline."
      >
        <form onSubmit={handleRenameSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              New Name
            </label>
            <input
              type="text"
              required
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Name
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Workflow?"
        description={`Are you sure you want to permanently delete "${deleteTarget?.name}"? This action cannot be undone.`}
      >
        <div className="flex items-center justify-end gap-2.5 pt-3">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteConfirm}>
            Yes, Delete Permanently
          </Button>
        </div>
      </Modal>

      {/* Create Modal */}
      <CreateWorkflowModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => loadWorkflows()}
      />
    </div>
  );
}

