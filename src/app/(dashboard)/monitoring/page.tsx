'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Clock,
  Cpu,
  Layers,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Server,
} from 'lucide-react';
import { LiveExecutionTable } from '@/components/monitoring/LiveExecutionTable';
import { MonitoringSummaryCards } from '@/components/monitoring/MonitoringSummaryCards';
import { OperationalAlertsPanel } from '@/components/monitoring/OperationalAlertsPanel';
import { SchedulerHealthCard } from '@/components/monitoring/SchedulerHealthCard';
import { WorkerHealthCard } from '@/components/monitoring/WorkerHealthCard';
import {
  MonitoredExecutionItem,
  MonitoredScheduleItem,
  MonitoringOverviewData,
} from '@/core/monitoring/types';

export default function MonitoringPage() {
  const [activeTab, setActiveTab] = useState<'executions' | 'schedules' | 'workers'>('executions');
  const [overview, setOverview] = useState<MonitoringOverviewData | null>(null);
  const [executions, setExecutions] = useState<MonitoredExecutionItem[]>([]);
  const [schedules, setSchedules] = useState<MonitoredScheduleItem[]>([]);
  const [totalExecutions, setTotalExecutions] = useState(0);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [triggerType, setTriggerType] = useState<string>('');
  const [offset, setOffset] = useState<number>(0);
  const limit = 20;

  // Auto-refresh states
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(10);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchOverview = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/v1/monitoring/overview', { signal });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setOverview(json.data);
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to fetch monitoring overview:', err);
      }
    }
  };

  const fetchExecutions = async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      if (selectedStatus && selectedStatus !== 'ALL') params.set('status', selectedStatus);
      if (searchQuery) params.set('search', searchQuery);
      if (triggerType) params.set('triggerType', triggerType);
      params.set('offset', offset.toString());
      params.set('limit', limit.toString());

      const res = await fetch(`/api/v1/monitoring/executions?${params.toString()}`, { signal });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setExecutions(json.data.items || []);
          setTotalExecutions(json.data.total || 0);
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to fetch executions:', err);
      }
    }
  };

  const fetchSchedules = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/v1/monitoring/schedules', { signal });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setSchedules(json.data.schedules || []);
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to fetch schedules:', err);
      }
    }
  };

  const refreshAll = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      await Promise.all([
        fetchOverview(signal),
        fetchExecutions(signal),
        fetchSchedules(signal),
      ]);
      setLastRefreshedAt(new Date());
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [selectedStatus, searchQuery, triggerType, offset]);

  // Periodic Polling with Page Visibility Check
  useEffect(() => {
    if (!autoRefresh || refreshIntervalSec <= 0) return;

    const intervalId = setInterval(() => {
      // Pause polling if document is hidden/inactive
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      refreshAll();
    }, refreshIntervalSec * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [autoRefresh, refreshIntervalSec, selectedStatus, searchQuery, triggerType, offset]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header with Live Polling Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Execution Monitoring & Scheduler Health
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
              <span>Live Monitor</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time observability of active executions, queue saturation, scheduler status, and operational alerts.
          </p>
        </div>

        {/* Live Controls */}
        <div className="flex flex-wrap items-center gap-2.5 bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              autoRefresh
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {autoRefresh ? (
              <>
                <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                <span>Polling Active</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 text-slate-500" />
                <span>Polling Paused</span>
              </>
            )}
          </button>

          {/* Interval Selector */}
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={refreshIntervalSec}
              onChange={(e) => setRefreshIntervalSec(parseInt(e.target.value, 10))}
              disabled={!autoRefresh}
              className="py-1 px-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-hidden text-slate-700 font-medium"
            >
              <option value="5">Every 5s</option>
              <option value="10">Every 10s</option>
              <option value="30">Every 30s</option>
              <option value="60">Every 60s</option>
            </select>
          </div>

          {/* Manual Refresh Button */}
          <button
            onClick={refreshAll}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Last Refreshed Stamp */}
          {lastRefreshedAt && (
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
              {lastRefreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Overview Metric Cards */}
      <MonitoringSummaryCards data={overview} isLoading={isLoading} />

      {/* Operational Alerts Panel */}
      {overview?.alertsSummary && (
        <OperationalAlertsPanel
          incidents={overview.alertsSummary.activeIncidents}
          isLoading={isLoading}
        />
      )}

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('executions')}
          className={`pb-2.5 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'executions'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Execution Monitor</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-mono">
            {totalExecutions}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('schedules')}
          className={`pb-2.5 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'schedules'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Scheduler Health</span>
          {(overview?.schedulerHealth?.missedSchedulesCount ?? 0) > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-700 font-bold">
              {overview?.schedulerHealth?.missedSchedulesCount} overdue
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('workers')}
          className={`pb-2.5 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'workers'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Worker & Queue Observability</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'executions' && (
        <LiveExecutionTable
          items={executions}
          total={totalExecutions}
          offset={offset}
          limit={limit}
          onPageChange={setOffset}
          selectedStatus={selectedStatus}
          onStatusChange={(st) => {
            setSelectedStatus(st);
            setOffset(0);
          }}
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            setOffset(0);
          }}
          triggerType={triggerType}
          onTriggerChange={(tr) => {
            setTriggerType(tr);
            setOffset(0);
          }}
          isLoading={isLoading}
        />
      )}

      {activeTab === 'schedules' && (
        <SchedulerHealthCard
          schedules={schedules}
          summary={overview?.schedulerHealth || null}
          isLoading={isLoading}
        />
      )}

      {activeTab === 'workers' && (
        <WorkerHealthCard
          workers={overview?.workerHealth?.workers || []}
          primaryWorker={overview?.workerHealth?.primaryWorker || null}
          queueMetrics={overview?.workerHealth?.queueMetrics || null}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
