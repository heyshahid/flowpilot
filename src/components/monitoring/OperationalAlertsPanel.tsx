import React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Info,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { OperationalIncident } from '@/core/monitoring/types';

interface OperationalAlertsPanelProps {
  incidents: OperationalIncident[];
  isLoading?: boolean;
}

export const OperationalAlertsPanel: React.FC<OperationalAlertsPanelProps> = ({
  incidents,
  isLoading,
}) => {
  if (incidents.length === 0) {
    return (
      <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 flex items-center justify-between text-xs text-emerald-900 shadow-xs">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <strong className="font-semibold text-emerald-950">All Systems Nominal</strong>
            <p className="text-emerald-800 text-[11px] mt-0.5">
              Zero active operational incidents detected. No repeated workflow failures, timeouts, stuck jobs, or missed schedules.
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
          Nominal
        </span>
      </div>
    );
  }

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600" />
          <span>Active Operational Incidents</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
            {incidents.length}
          </span>
        </h3>
        <span className="text-[11px] text-slate-400">Deduplicated continuing events</span>
      </div>

      <div className="space-y-2.5">
        {incidents.map((incident) => {
          const isCritical = incident.severity === 'CRITICAL';
          const isWarning = incident.severity === 'WARNING';

          return (
            <div
              key={incident.id}
              className={`p-3 rounded-lg border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                isCritical
                  ? 'bg-rose-50/50 border-rose-200 text-rose-950'
                  : isWarning
                  ? 'bg-amber-50/50 border-amber-200 text-amber-950'
                  : 'bg-blue-50/50 border-blue-200 text-blue-950'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {isCritical ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : isWarning ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{incident.title}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                        isCritical
                          ? 'bg-rose-200 text-rose-800'
                          : isWarning
                          ? 'bg-amber-200 text-amber-800'
                          : 'bg-blue-200 text-blue-800'
                      }`}
                    >
                      {incident.severity}
                    </span>
                    {incident.occurrenceCount > 1 && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-200 text-slate-700 font-mono">
                        Seen {incident.occurrenceCount}x
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-slate-700 leading-relaxed text-[11px]">
                    {incident.message}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500 font-mono">
                    <span>First: {formatTime(incident.firstSeenAt)}</span>
                    <span>Last: {formatTime(incident.lastSeenAt)}</span>
                    {incident.targetId && (
                      <span>
                        Target: <strong>{incident.targetId}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {incident.affectedExecutionIds && incident.affectedExecutionIds.length > 0 && (
                <div className="shrink-0">
                  <Link
                    href={`/executions?id=${incident.affectedExecutionIds[0]}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-slate-200 text-[11px] font-semibold text-blue-600 hover:text-blue-800 shadow-2xs transition-colors"
                  >
                    <span>Inspect Trace</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

