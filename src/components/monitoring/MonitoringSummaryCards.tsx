import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  PlayCircle,
  Radio,
  XCircle,
} from 'lucide-react';
import { MonitoringOverviewData } from '@/core/monitoring/types';

interface MonitoringSummaryCardsProps {
  data: MonitoringOverviewData | null;
  isLoading?: boolean;
}

export const MonitoringSummaryCards: React.FC<MonitoringSummaryCardsProps> = ({
  data,
  isLoading,
}) => {
  if (isLoading && !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-slate-100 rounded-xl border border-slate-200"></div>
        ))}
      </div>
    );
  }

  const exec = data?.executionSummary;
  const sched = data?.schedulerHealth;
  const worker = data?.workerHealth.primaryWorker;
  const queue = data?.workerHealth.queueMetrics;
  const alerts = data?.alertsSummary;

  const isWorkerHealthy = worker?.status === 'HEALTHY';
  const isWorkerStale = worker?.status === 'STALE';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Active Executions */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Active Executions
          </span>
          <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
            <Activity className="w-4 h-4 animate-pulse" />
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900 font-mono">
            {exec?.activeCount ?? 0}
          </span>
          <span className="text-xs text-slate-500">running / queued</span>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
            Running: <strong>{exec?.runningCount ?? 0}</strong>
          </span>
          <span>Queued: <strong>{exec?.queuedCount ?? 0}</strong></span>
          <span>Waiting: <strong>{exec?.waitingCount ?? 0}</strong></span>
        </div>
      </div>

      {/* 2. Success Rate & Throughput */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Execution Health
          </span>
          <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <CheckCircle2 className="w-4 h-4" />
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900 font-mono">
            {exec?.successRatePercent !== null && exec?.successRatePercent !== undefined
              ? `${exec.successRatePercent}%`
              : 'N/A'}
          </span>
          <span className="text-xs text-slate-500">success rate</span>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span className="text-emerald-600 font-semibold">
            {exec?.completedCount ?? 0} passed
          </span>
          <span className="text-rose-600 font-semibold">
            {exec?.failedCount ?? 0} failed
          </span>
          <span className="text-slate-400">
            {exec?.cancelledCount ?? 0} cancelled
          </span>
        </div>
      </div>

      {/* 3. Scheduler Health */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Scheduler Engine
          </span>
          <span
            className={`p-1.5 rounded-lg ${
              (sched?.missedSchedulesCount ?? 0) > 0
                ? 'bg-amber-50 text-amber-600'
                : 'bg-indigo-50 text-indigo-600'
            }`}
          >
            <Clock className="w-4 h-4" />
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900 font-mono">
            {sched?.activeCount ?? 0}
          </span>
          <span className="text-xs text-slate-500">active schedules</span>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Upcoming: <strong>{sched?.upcomingRunsCount ?? 0}</strong></span>
          {(sched?.missedSchedulesCount ?? 0) > 0 ? (
            <span className="text-amber-600 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {sched?.missedSchedulesCount} overdue
            </span>
          ) : (
            <span className="text-emerald-600 font-medium">0 missed</span>
          )}
        </div>
      </div>

      {/* 4. Worker & Alerts Status */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Worker & Incidents
          </span>
          <span
            className={`p-1.5 rounded-lg ${
              isWorkerHealthy
                ? 'bg-emerald-50 text-emerald-600'
                : isWorkerStale
                ? 'bg-amber-50 text-amber-600'
                : 'bg-rose-50 text-rose-600'
            }`}
          >
            <Cpu className="w-4 h-4" />
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isWorkerHealthy
                  ? 'bg-emerald-500'
                  : isWorkerStale
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            ></span>
            <span className="text-lg font-bold text-slate-900 font-mono">
              {worker?.status || 'OFFLINE'}
            </span>
          </span>
          <span className="text-xs text-slate-400">
            ({queue?.activeConcurrency ?? 0}/{queue?.maxConcurrency ?? 5} slots)
          </span>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Queue Depth: <strong>{queue?.queueDepth ?? 0}</strong></span>
          {(alerts?.criticalCount ?? 0) > 0 ? (
            <span className="text-rose-600 font-bold">
              {alerts?.criticalCount} critical alert
            </span>
          ) : (alerts?.warningCount ?? 0) > 0 ? (
            <span className="text-amber-600 font-bold">
              {alerts?.warningCount} warning
            </span>
          ) : (
            <span className="text-emerald-600">0 alerts</span>
          )}
        </div>
      </div>
    </div>
  );
};
