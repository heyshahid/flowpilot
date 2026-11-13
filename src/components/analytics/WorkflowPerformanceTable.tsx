'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { GitBranch, Search, ChevronRight, ArrowUpDown, Clock } from 'lucide-react';
import { WorkflowAnalyticsSummaryItem } from '@/core/analytics/types';

interface WorkflowPerformanceTableProps {
  workflows: WorkflowAnalyticsSummaryItem[];
  isLoading?: boolean;
}

export const WorkflowPerformanceTable: React.FC<WorkflowPerformanceTableProps> = ({
  workflows,
  isLoading = false,
}) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'runs' | 'duration' | 'name'>('runs');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = workflows.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.id.toLowerCase().includes(search.toLowerCase())
  );

  filtered.sort((a, b) => {
    let diff = 0;
    if (sortBy === 'runs') {
      diff = a.totalExecutions - b.totalExecutions;
    } else if (sortBy === 'duration') {
      const aDur = a.meanDurationMs.value ?? -1;
      const bDur = b.meanDurationMs.value ?? -1;
      diff = aDur - bDur;
    } else {
      diff = a.name.localeCompare(b.name);
    }
    return sortAsc ? diff : -diff;
  });

  const handleSort = (field: 'runs' | 'duration' | 'name') => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      {/* Table Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Workflows Performance</h3>
          <p className="text-xs text-slate-500">
            Execution frequency, terminal success rates, and average latencies by workflow
          </p>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search workflows..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500 w-48 sm:w-60"
          />
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="p-8 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <div className="p-3 rounded-full bg-slate-100 text-slate-400 mb-3">
            <GitBranch className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-800">No executions recorded</h4>
          <p className="text-xs text-slate-500 max-w-sm mt-1">
            No executions recorded in this timeframe. Trigger a workflow to start collecting analytics.
          </p>
          <Link
            href="/workflows"
            className="mt-4 px-3.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs"
          >
            Go to Workflows
          </Link>
        </div>
      ) : (
        /* Responsive Table */
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-800 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Workflow</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('runs')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-800 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Total Runs</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4">Completed / Failed</th>
                <th className="py-3 px-4">Success Rate</th>
                <th
                  onClick={() => handleSort('duration')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-800 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Mean Duration</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4">Last Run</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filtered.map((wf) => (
                <tr
                  key={wf.id}
                  className="hover:bg-slate-50/80 transition-colors group"
                >
                  <td className="py-3.5 px-4">
                    <Link
                      href={`/analytics/workflows/${wf.id}`}
                      className="flex items-center gap-2.5 font-medium text-slate-900 group-hover:text-blue-600 transition-colors"
                    >
                      <GitBranch className="w-4 h-4 text-slate-400 group-hover:text-blue-500 shrink-0" />
                      <div className="flex flex-col">
                        <span className="font-semibold">{wf.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{wf.id}</span>
                      </div>
                    </Link>
                  </td>

                  <td className="py-3.5 px-4 font-semibold text-slate-800">
                    {wf.totalExecutions}
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="text-emerald-600 font-bold">{wf.completedExecutions}</span>
                      <span className="text-slate-300">/</span>
                      <span className="text-rose-600 font-bold">{wf.failedExecutions}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    {wf.successRate.isAvailable ? (
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          (wf.successRate.value ?? 0) >= 90
                            ? 'bg-emerald-50 text-emerald-700'
                            : (wf.successRate.value ?? 0) >= 70
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {wf.successRate.formatted}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px] italic">N/A</span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                    {wf.meanDurationMs.isAvailable ? wf.meanDurationMs.formatted : 'N/A'}
                  </td>

                  <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                    {wf.lastExecutedAt ? (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{new Date(wf.lastExecutedAt).toLocaleDateString()}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Never</span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <Link
                      href={`/analytics/workflows/${wf.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <span>Detail</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
