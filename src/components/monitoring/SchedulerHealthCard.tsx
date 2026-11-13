import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  PauseCircle,
  PlayCircle,
  Timer,
  XCircle,
} from 'lucide-react';
import { MonitoredScheduleItem, SchedulerHealthSummary } from '@/core/monitoring/types';

interface SchedulerHealthCardProps {
  schedules: MonitoredScheduleItem[];
  summary: SchedulerHealthSummary | null;
  isLoading?: boolean;
}

export const SchedulerHealthCard: React.FC<SchedulerHealthCardProps> = ({
  schedules,
  summary,
  isLoading,
}) => {
  const missedSchedules = schedules.filter((s) => s.isMissed);

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return 'Due now';
    if (seconds < 60) return `in ${seconds}s`;
    if (seconds < 3600) return `in ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `in ${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      {/* 1. Missed Schedules Alert Banner (if any) */}
      {missedSchedules.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                Missed Schedule Alert ({missedSchedules.length})
              </h4>
              <p className="text-xs text-amber-800 mt-1">
                The following active schedules missed their execution window. Catch-up policy will
                evaluate missed runs on subsequent ticks.
              </p>
              <div className="mt-2.5 space-y-1.5">
                {missedSchedules.map((ms) => (
                  <div
                    key={ms.id}
                    className="flex items-center justify-between bg-white/80 p-2 rounded-lg border border-amber-200 text-xs"
                  >
                    <div>
                      <strong className="text-amber-950">{ms.name}</strong>
                      <span className="text-slate-500 font-mono text-[10px] ml-2">
                        Due: {formatTime(ms.nextRunAt)}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                      Policy: {ms.catchUpMissed ? 'Catch up on tick' : 'Skip run'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Upcoming Queue & Schedules View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Upcoming Queue */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between mb-3">
            <span className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-indigo-600" />
              <span>Upcoming Scheduled Runs</span>
            </span>
            <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {summary?.upcomingRunsCount ?? 0} queued
            </span>
          </h3>

          {!summary?.upcomingQueue || summary.upcomingQueue.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              <Clock className="w-5 h-5 mx-auto mb-1 text-slate-300" />
              <span>No upcoming scheduled runs detected.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {summary.upcomingQueue.map((run) => (
                <div
                  key={run.scheduleId}
                  className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between text-xs hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-900 truncate max-w-[170px]">
                      {run.scheduleName}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {run.workflowName}
                    </span>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <span className="text-indigo-600 font-semibold font-mono text-[11px]">
                      {formatCountdown(run.countdownSeconds)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatTime(run.scheduledAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Schedules Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Configured Schedules Overview</span>
              </h3>
              <Link
                href="/schedules"
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
              >
                <span>Manage Schedules</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Schedule</th>
                    <th className="py-2.5 px-3">Cadence</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Last Run</th>
                    <th className="py-2.5 px-3">Next Run</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {schedules.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                        <span>No schedules configured in this workspace.</span>
                      </td>
                    </tr>
                  ) : (
                    schedules.map((sched) => (
                      <tr key={sched.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-900 max-w-[180px] truncate">
                          <div className="flex flex-col">
                            <span>{sched.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{sched.workflowName}</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                          {sched.cronExpression ? (
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700">
                              {sched.cronExpression}
                            </span>
                          ) : sched.intervalMinutes ? (
                            <span>Every {sched.intervalMinutes}m</span>
                          ) : (
                            <span>One-time</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          {sched.isMissed ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Overdue</span>
                            </span>
                          ) : sched.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              <PauseCircle className="w-3 h-3" />
                              <span>{sched.status}</span>
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                          <div className="flex flex-col">
                            <span>{formatTime(sched.lastRunAt)}</span>
                            {sched.lastExecutionStatus && sched.lastExecutionStatus !== 'UNKNOWN' && (
                              <span
                                className={`text-[10px] font-semibold ${
                                  sched.lastExecutionStatus === 'COMPLETED'
                                    ? 'text-emerald-600'
                                    : 'text-rose-600'
                                }`}
                              >
                                {sched.lastExecutionStatus}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800">
                          {formatTime(sched.nextRunAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              Total: <strong>{summary?.totalSchedules ?? 0}</strong> ({summary?.activeCount ?? 0} active,{' '}
              {summary?.pausedOrDisabledCount ?? 0} paused)
            </span>
            <span className="italic">Evaluated from persisted scheduleStore records</span>
          </div>
        </div>
      </div>
    </div>
  );
};

