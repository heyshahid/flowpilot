'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  Play,
  RotateCw,
  Search,
  XCircle,
  Ban,
  Filter,
  Eye,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ExecutionConsoleDrawer } from '@/components/canvas/ExecutionConsoleDrawer';
import { WorkflowExecutionRecord, WorkflowExecutionStatus } from '@/core/execution/types';

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<WorkflowExecutionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchExecutions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const res = await fetch(`/api/v1/executions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setExecutions(data.executions || []);
      }
    } catch (err) {
      console.error('Failed to load executions:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  const handleOpenExecution = (id: string) => {
    setSelectedExecutionId(id);
    setIsConsoleOpen(true);
  };

  const getStatusBadge = (status: WorkflowExecutionStatus) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            COMPLETED
          </span>
        );
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
            <RotateCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            RUNNING
          </span>
        );
      case 'VALIDATING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <RotateCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
            VALIDATING
          </span>
        );
      case 'QUEUED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            QUEUED
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            FAILED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <Ban className="w-3.5 h-3.5 text-slate-500" />
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {status}
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
            Execution History & Logs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Real-time step traces, execution duration, and audit logs recorded by the background execution engine.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchExecutions}
          isLoading={loading}
          icon={<RotateCw className="w-3.5 h-3.5 text-slate-500" />}
        >
          Refresh
        </Button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {['ALL', 'COMPLETED', 'FAILED', 'RUNNING', 'QUEUED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                statusFilter === st
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search execution ID or workflow..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* Executions Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Execution ID</th>
              <th className="py-3 px-4">Workflow</th>
              <th className="py-3 px-4">Trigger</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4">Steps</th>
              <th className="py-3 px-4">Started At</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {executions.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-xs text-slate-400">
                  No executions found matching your filters.
                </td>
              </tr>
            )}

            {executions.map((run) => (
              <tr
                key={run.id}
                onClick={() => handleOpenExecution(run.id)}
                className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
              >
                <td className="py-3 px-4 font-mono text-xs text-blue-600 font-semibold">
                  {run.id}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-900 text-xs">
                  {run.workflowName}
                </td>
                <td className="py-3 px-4 text-xs text-slate-600">
                  {run.trigger.type}
                </td>
                <td className="py-3 px-4">
                  {getStatusBadge(run.status)}
                </td>
                <td className="py-3 px-4 text-xs text-slate-500 font-mono">
                  {run.durationMs}ms
                </td>
                <td className="py-3 px-4 text-xs text-slate-500">
                  {run.traces?.length || 0} nodes
                </td>
                <td className="py-3 px-4 text-xs text-slate-400">
                  {new Date(run.startedAt).toLocaleString()}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenExecution(run.id);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent group-hover:border-slate-200"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Inspect</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Slide-over Inspection Console Drawer */}
      <ExecutionConsoleDrawer
        isOpen={isConsoleOpen}
        onClose={() => setIsConsoleOpen(false)}
        executionId={selectedExecutionId}
      />
    </div>
  );
}
