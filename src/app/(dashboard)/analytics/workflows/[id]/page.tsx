'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  GitBranch,
  Activity,
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertTriangle,
  Timer,
  Clock,
  PlayCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import {
  TimeWindow,
  WorkflowPerformanceReport,
} from '@/core/analytics/types';
import { DateRangeSelector } from '@/components/analytics/DateRangeSelector';
import { SummaryCard } from '@/components/analytics/SummaryCard';
import { TimeSeriesChart } from '@/components/analytics/TimeSeriesChart';
import { formatDuration } from '@/core/analytics/metricDefinitions';

interface ExecutionRow {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  triggerType: string;
  retryCount: number;
  error?: string;
}

export default function WorkflowAnalyticsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d');
  const [customRange, setCustomRange] = useState<{ startDate: string; endDate: string } | undefined>(
    undefined
  );

  const [report, setReport] = useState<WorkflowPerformanceReport | null>(null);
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [totalExecutions, setTotalExecutions] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 10;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const fetchWorkflowReport = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    setNotFound(false);

    try {
      let queryParams = `timeWindow=${timeWindow}`;
      if (timeWindow === 'custom' && customRange) {
        queryParams += `&startDate=${encodeURIComponent(customRange.startDate)}&endDate=${encodeURIComponent(customRange.endDate)}`;
      }

      // Fetch workflow report
      const res = await fetch(`/api/v1/analytics/workflows/${id}?${queryParams}`);
      const data = await res.json();

      if (res.status === 404 || !data.success) {
        if (res.status === 404) setNotFound(true);
        throw new Error(data.error || 'Workflow analytics could not be retrieved.');
      }

      setReport(data.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const fetchExecutions = async () => {
    try {
      const offset = page * limit;
      const res = await fetch(
        `/api/v1/analytics/workflows/${id}/executions?limit=${limit}&offset=${offset}`
      );
      const data = await res.json();
      if (data.success) {
        setExecutions(data.data.items || []);
        setTotalExecutions(data.data.total || 0);
      }
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    fetchWorkflowReport();
  }, [id, timeWindow, customRange]);

  useEffect(() => {
    fetchExecutions();
  }, [id, page]);

  const handleRangeChange = (
    newWindow: TimeWindow,
    newRange?: { startDate: string; endDate: string }
  ) => {
    setTimeWindow(newWindow);
    setCustomRange(newRange);
  };

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="p-4 rounded-full bg-rose-50 text-rose-600 mb-4 border border-rose-100">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Workflow Not Found</h2>
        <p className="text-xs text-slate-500 max-w-md mt-1 mb-6">
          The requested workflow does not exist, has been deleted, or you do not have permission to view its analytics in this workspace.
        </p>
        <Link
          href="/analytics"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Analytics Dashboard</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Breadcrumb Navigation & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/analytics"
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-xs"
            title="Back to Analytics"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Workflow Analytics
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-mono text-slate-400">{id}</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              <GitBranch className="w-5 h-5 text-blue-600" />
              <span>{report?.workflowName || `Workflow ${id}`}</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchWorkflowReport(true)}
            disabled={isLoading || isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            href={`/builder/${id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <span>Open Builder</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </Link>
        </div>
      </div>

      {/* Date Range Selector */}
      <DateRangeSelector
        selectedWindow={timeWindow}
        customStartDate={customRange?.startDate?.split('T')[0]}
        customEndDate={customRange?.endDate?.split('T')[0]}
        onSelect={handleRangeChange}
      />

      {/* Error Alert */}
      {error && !notFound && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchWorkflowReport()}
            className="px-2.5 py-1 bg-white border border-rose-200 font-semibold text-rose-700 rounded-md hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              title="Workflow Runs"
              value={report.summary.totalExecutions}
              subtitle="Total triggered"
              icon={Activity}
              variant="blue"
            />
            <SummaryCard
              title="Successful Runs"
              value={report.summary.completedExecutions}
              subtitle="Clean completions"
              icon={CheckCircle2}
              variant="emerald"
            />
            <SummaryCard
              title="Failed Runs"
              value={report.summary.failedExecutions}
              subtitle="Workflow failures"
              icon={XCircle}
              variant="rose"
            />
            <SummaryCard
              title="Active / In-Flight"
              value={report.summary.inFlightExecutions}
              subtitle="Running or waiting"
              icon={PlayCircle}
              variant="indigo"
            />

            <SummaryCard
              title="Success Rate"
              value={report.summary.successRate.value}
              formattedValue={report.summary.successRate.formatted}
              sampleSize={report.summary.terminalExecutions}
              isAvailable={report.summary.successRate.isAvailable}
              notes={report.summary.successRate.notes}
              icon={TrendingUp}
              variant="emerald"
            />
            <SummaryCard
              title="Failure Rate"
              value={report.summary.failureRate.value}
              formattedValue={report.summary.failureRate.formatted}
              sampleSize={report.summary.terminalExecutions}
              isAvailable={report.summary.failureRate.isAvailable}
              notes={report.summary.failureRate.notes}
              icon={AlertTriangle}
              variant="rose"
            />
            <SummaryCard
              title="Mean Duration"
              value={report.summary.meanDurationMs.value}
              formattedValue={report.summary.meanDurationMs.formatted}
              sampleSize={report.summary.completedExecutions}
              isAvailable={report.summary.meanDurationMs.isAvailable}
              notes={report.summary.meanDurationMs.notes}
              icon={Timer}
              variant="amber"
            />
            <SummaryCard
              title="Median (p50) Duration"
              value={report.summary.medianDurationMs.value}
              formattedValue={report.summary.medianDurationMs.formatted}
              sampleSize={report.summary.completedExecutions}
              isAvailable={report.summary.medianDurationMs.isAvailable}
              notes={report.summary.medianDurationMs.notes}
              icon={Clock}
              variant="purple"
            />
          </div>

          {/* Activity Over Time Chart */}
          {report.durationTrend && (
            <TimeSeriesChart
              points={report.durationTrend.points}
              interval={report.durationTrend.interval}
              title={`${report.workflowName} — Execution Activity`}
            />
          )}

          {/* Paginated Execution History Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Recent Executions</h3>
                <p className="text-xs text-slate-500">
                  Showing {executions.length} of {totalExecutions} execution records
                </p>
              </div>
              <Link
                href={`/executions?workflowId=${id}`}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                View in Execution Console
              </Link>
            </div>

            {executions.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                No execution history records found for this workflow.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Execution ID</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Trigger</th>
                      <th className="py-3 px-4">Started At</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Error Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {executions.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <Link
                            href={`/executions/${e.id}`}
                            className="font-mono text-blue-600 hover:underline font-medium text-[11px]"
                          >
                            {e.id}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              e.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : e.status === 'FAILED'
                                ? 'bg-rose-50 text-rose-700'
                                : e.status === 'RUNNING'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {e.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {e.triggerType}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          {new Date(e.startedAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                          {formatDuration(e.durationMs ?? null)}
                        </td>
                        <td className="py-3 px-4 text-rose-600 text-[11px] max-w-xs truncate">
                          {e.error || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalExecutions > limit && (
              <div className="flex items-center justify-between p-3.5 border-t border-slate-100 bg-slate-50/50 text-xs">
                <span className="text-slate-500">
                  Page {page + 1} of {Math.ceil(totalExecutions / limit)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="flex items-center gap-1 px-2.5 py-1 text-slate-600 bg-white border border-slate-200 rounded-md disabled:opacity-40 hover:bg-slate-50 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={(page + 1) * limit >= totalExecutions}
                    className="flex items-center gap-1 px-2.5 py-1 text-slate-600 bg-white border border-slate-200 rounded-md disabled:opacity-40 hover:bg-slate-50 transition-colors"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
