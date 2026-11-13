import React, { useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Filter,
  Layers,
  PauseCircle,
  RefreshCw,
  Search,
  Timer,
  XCircle,
} from 'lucide-react';
import { MonitoredExecutionItem } from '@/core/monitoring/types';

interface LiveExecutionTableProps {
  items: MonitoredExecutionItem[];
  total: number;
  offset: number;
  limit: number;
  onPageChange: (newOffset: number) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  triggerType: string;
  onTriggerChange: (trigger: string) => void;
  isLoading?: boolean;
}

export const LiveExecutionTable: React.FC<LiveExecutionTableProps> = ({
  items,
  total,
  offset,
  limit,
  onPageChange,
  selectedStatus,
  onStatusChange,
  searchQuery,
  onSearchChange,
  triggerType,
  onTriggerChange,
  isLoading,
}) => {
  const statusOptions = [
    { label: 'All', value: 'ALL' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Running', value: 'RUNNING' },
    { label: 'Queued', value: 'QUEUED' },
    { label: 'Waiting', value: 'WAITING' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Failed', value: 'FAILED' },
    { label: 'Cancelled', value: 'CANCELLED' },
    { label: 'Timeout', value: 'TIMEOUT' },
    { label: 'Stuck', value: 'STUCK' },
  ];

  const getStatusBadge = (item: MonitoredExecutionItem) => {
    if (item.isTimedOut) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <Timer className="w-3 h-3 text-rose-600" />
          <span>Timed Out</span>
        </span>
      );
    }

    if (item.isStuck) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          <span>Stuck (&gt;15m)</span>
        </span>
      );
    }

    switch (item.status) {
      case 'RUNNING':
      case 'VALIDATING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
            <span>Running</span>
          </span>
        );
      case 'QUEUED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>Queued</span>
          </span>
        );
      case 'WAITING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <PauseCircle className="w-3 h-3 text-amber-500" />
            <span>Waiting (Delay)</span>
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Completed</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>Failed</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">
            <span>Cancelled</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-500">
            <span>{item.status}</span>
          </span>
        );
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      {/* Table Header & Controls */}
      <div className="p-4 border-b border-slate-100 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <span>Live Execution Activity</span>
              {isLoading && <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time feed of queued, active, completed and failed workflow runs
            </p>
          </div>

          {/* Search & Trigger Controls */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search execution or workflow..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-56"
              />
            </div>

            <select
              value={triggerType}
              onChange={(e) => onTriggerChange(e.target.value)}
              className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500 text-slate-700"
            >
              <option value="">All Triggers</option>
              <option value="trigger.webhook">Webhook</option>
              <option value="trigger.schedule">Schedule</option>
              <option value="trigger.manual">Manual</option>
            </select>
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-50">
          <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Status:
          </span>
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onStatusChange(opt.value)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                selectedStatus === opt.value
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/60'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Execution Items Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Execution ID</th>
              <th className="py-3 px-4">Workflow</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Trigger</th>
              <th className="py-3 px-4">Started At</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4">Steps / Progress</th>
              <th className="py-3 px-4">Notes / Error</th>
              <th className="py-3 px-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400 text-xs">
                  <Layers className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                  <span>No executions found matching your active filter criteria.</span>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono font-medium text-blue-600">
                    <Link
                      href={`/executions?id=${item.id}`}
                      className="hover:underline flex items-center gap-1"
                    >
                      <span>{item.id}</span>
                    </Link>
                  </td>

                  <td className="py-3 px-4 font-semibold text-slate-900 max-w-xs truncate">
                    <div className="flex flex-col">
                      <span>{item.workflowName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{item.workflowId}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4">{getStatusBadge(item)}</td>

                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">
                      {item.triggerType.replace('trigger.', '')}
                    </span>
                  </td>

                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                    {formatDate(item.startedAt)}
                  </td>

                  <td className="py-3 px-4 font-mono text-[11px] font-semibold text-slate-800">
                    {formatDuration(item.durationMs)}
                  </td>

                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                    {item.totalStepsCount > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-emerald-600 font-medium">{item.completedStepsCount}</span>
                        {item.failedStepsCount > 0 && (
                          <span className="text-rose-600 font-bold">({item.failedStepsCount} err)</span>
                        )}
                        <span className="text-slate-400">/ {item.totalStepsCount}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">0</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-[11px] max-w-xs truncate">
                    {item.errorSummary ? (
                      <span className="text-rose-600 font-mono text-[10px]" title={item.errorSummary}>
                        {item.errorSummary}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Clean run</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/executions?id=${item.id}`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <span>View</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
        <div>
          Showing <strong>{items.length > 0 ? offset + 1 : 0}</strong> to{' '}
          <strong>{Math.min(offset + limit, total)}</strong> of <strong>{total}</strong> executions
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-3 py-1 bg-white border border-slate-200 rounded-md font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-slate-600 font-mono">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(offset + limit)}
            disabled={offset + limit >= total}
            className="px-3 py-1 bg-white border border-slate-200 rounded-md font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
