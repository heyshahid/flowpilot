'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Activity,
  CheckCircle2,
  XCircle,
  PlayCircle,
  TrendingUp,
  AlertTriangle,
  Timer,
  Clock,
  RefreshCw,
} from 'lucide-react';
import {
  ExecutionSummaryMetrics,
  TimeSeriesResult,
  TimeWindow,
  WorkflowAnalyticsSummaryItem,
} from '@/core/analytics/types';
import { DateRangeSelector } from '@/components/analytics/DateRangeSelector';
import { SummaryCard } from '@/components/analytics/SummaryCard';
import { TimeSeriesChart } from '@/components/analytics/TimeSeriesChart';
import { StatusDistributionBar } from '@/components/analytics/StatusDistributionBar';
import { WorkflowPerformanceTable } from '@/components/analytics/WorkflowPerformanceTable';

export default function AnalyticsDashboardPage() {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d');
  const [customRange, setCustomRange] = useState<{ startDate: string; endDate: string } | undefined>(
    undefined
  );

  const [summary, setSummary] = useState<ExecutionSummaryMetrics | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesResult | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowAnalyticsSummaryItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      let queryParams = `timeWindow=${timeWindow}`;
      if (timeWindow === 'custom' && customRange) {
        queryParams += `&startDate=${encodeURIComponent(customRange.startDate)}&endDate=${encodeURIComponent(customRange.endDate)}`;
      }

      // Fetch overview summary + time-series
      const overviewRes = await fetch(`/api/v1/analytics/overview?${queryParams}`);
      const overviewData = await overviewRes.json();

      if (!overviewData.success) {
        throw new Error(overviewData.error || 'Failed to fetch analytics overview.');
      }

      setSummary(overviewData.data.summary);
      setTimeSeries(overviewData.data.timeSeries);

      // Fetch workflow breakdown
      const workflowsRes = await fetch(`/api/v1/analytics/workflows?${queryParams}`);
      const workflowsData = await workflowsRes.json();

      if (workflowsData.success) {
        setWorkflows(workflowsData.data || []);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeWindow, customRange]);

  const handleRangeChange = (
    newWindow: TimeWindow,
    newRange?: { startDate: string; endDate: string }
  ) => {
    setTimeWindow(newWindow);
    setCustomRange(newRange);
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Analytics & Telemetry
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time execution performance, terminal success rates, and latency metrics across workflows
          </p>
        </div>

        {/* Analytics Sub-Nav */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <Link
            href="/analytics"
            className="px-3 py-1 rounded-md bg-white text-blue-600 shadow-2xs"
          >
            Overview
          </Link>
          <Link
            href="/analytics/integrations"
            className="px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 transition-colors"
          >
            Integrations
          </Link>
          <Link
            href="/analytics/ai-usage"
            className="px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 transition-colors"
          >
            AI Usage & Cost
          </Link>
          <button
            onClick={() => fetchAnalytics(true)}
            disabled={isLoading || isRefreshing}
            className="p-1 rounded-md text-slate-500 hover:bg-white hover:text-slate-700 transition-colors ml-1"
            title="Refresh analytics data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
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
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchAnalytics()}
            className="px-2.5 py-1 bg-white border border-rose-200 font-semibold text-rose-700 rounded-md hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      ) : summary ? (
        <>
          {/* Summary Metric Cards Grid (8 Cards) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              title="Total Executions"
              value={summary.totalExecutions}
              subtitle="All triggered runs"
              icon={Activity}
              variant="blue"
            />
            <SummaryCard
              title="Completed Runs"
              value={summary.completedExecutions}
              subtitle="Successful completions"
              icon={CheckCircle2}
              variant="emerald"
            />
            <SummaryCard
              title="Failed Runs"
              value={summary.failedExecutions}
              subtitle="Unrecoverable errors"
              icon={XCircle}
              variant="rose"
            />
            <SummaryCard
              title="In-Flight Runs"
              value={summary.inFlightExecutions}
              subtitle="Active or queued"
              icon={PlayCircle}
              variant="indigo"
            />

            <SummaryCard
              title="Terminal Success Rate"
              value={summary.successRate.value}
              formattedValue={summary.successRate.formatted}
              sampleSize={summary.terminalExecutions}
              isAvailable={summary.successRate.isAvailable}
              notes={summary.successRate.notes}
              icon={TrendingUp}
              variant="emerald"
            />
            <SummaryCard
              title="Terminal Failure Rate"
              value={summary.failureRate.value}
              formattedValue={summary.failureRate.formatted}
              sampleSize={summary.terminalExecutions}
              isAvailable={summary.failureRate.isAvailable}
              notes={summary.failureRate.notes}
              icon={AlertTriangle}
              variant="rose"
            />
            <SummaryCard
              title="Average Duration"
              value={summary.meanDurationMs.value}
              formattedValue={summary.meanDurationMs.formatted}
              sampleSize={summary.completedExecutions}
              isAvailable={summary.meanDurationMs.isAvailable}
              notes={summary.meanDurationMs.notes}
              icon={Timer}
              variant="amber"
            />
            <SummaryCard
              title="Median Duration (p50)"
              value={summary.medianDurationMs.value}
              formattedValue={summary.medianDurationMs.formatted}
              sampleSize={summary.completedExecutions}
              isAvailable={summary.medianDurationMs.isAvailable}
              notes={summary.medianDurationMs.notes}
              icon={Clock}
              variant="purple"
            />
          </div>

          {/* Time Series Activity Chart */}
          {timeSeries && (
            <TimeSeriesChart
              points={timeSeries.points}
              interval={timeSeries.interval}
              title="Execution Volume & Completion Trend"
            />
          )}

          {/* Execution Status Distribution Bar */}
          <StatusDistributionBar summary={summary} />

          {/* Workflows Performance Breakdown */}
          <WorkflowPerformanceTable workflows={workflows} isLoading={isLoading} />
        </>
      ) : null}
    </div>
  );
}
