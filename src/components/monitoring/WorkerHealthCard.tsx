import React from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  HardDrive,
  Info,
  Layers,
  Server,
  Zap,
} from 'lucide-react';
import { QueueObservabilityMetric, WorkerInstanceRecord } from '@/core/monitoring/types';

interface WorkerHealthCardProps {
  workers: WorkerInstanceRecord[];
  primaryWorker: WorkerInstanceRecord | null;
  queueMetrics: QueueObservabilityMetric | null;
  isLoading?: boolean;
}

export const WorkerHealthCard: React.FC<WorkerHealthCardProps> = ({
  workers,
  primaryWorker,
  queueMetrics,
  isLoading,
}) => {
  const isHealthy = primaryWorker?.status === 'HEALTHY';
  const isStale = primaryWorker?.status === 'STALE';

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '—';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const formatHeartbeatAge = (isoString?: string) => {
    if (!isoString) return 'never';
    const diff = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Worker Instance Details */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-600" />
              <span>Worker Node Observability</span>
            </h3>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isHealthy
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : isStale
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isHealthy
                    ? 'bg-emerald-500 animate-pulse'
                    : isStale
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
              />
              <span>{primaryWorker?.status || 'OFFLINE'}</span>
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Worker ID / Host:</span>
              <span className="font-mono font-medium text-slate-800">
                {primaryWorker?.id || 'worker_standalone_primary'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Architecture / Mode:</span>
              <span className="font-medium text-slate-700">
                Standalone In-Process Worker
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Last Emitted Heartbeat:</span>
              <span className="font-mono text-slate-700">
                {formatHeartbeatAge(primaryWorker?.lastHeartbeatAt)}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Process Uptime:</span>
              <span className="font-mono text-slate-700">
                {formatUptime(primaryWorker?.uptimeSeconds)}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Heap Memory Usage:</span>
              <span className="font-mono text-slate-700">
                {primaryWorker?.memoryUsageMb ?? 0} MB
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Runtime / PID:</span>
              <span className="font-mono text-slate-600">
                Node {primaryWorker?.nodeVersion || 'v20'} (PID: {primaryWorker?.pid || 1})
              </span>
            </div>
          </div>
        </div>

        {/* Execution Queue Observability */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Execution Queue Health</span>
              </h3>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                FIFO In-Memory
              </span>
            </div>

            <div className="space-y-4">
              {/* Utilization Bar */}
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-500">Concurrency Saturation:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {queueMetrics?.activeConcurrency ?? 0} / {queueMetrics?.maxConcurrency ?? 5} slots (
                    {queueMetrics?.utilizationPercent ?? 0}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      (queueMetrics?.utilizationPercent ?? 0) >= 100
                        ? 'bg-rose-500'
                        : (queueMetrics?.utilizationPercent ?? 0) >= 60
                        ? 'bg-amber-500'
                        : 'bg-blue-600'
                    }`}
                    style={{ width: `${Math.min(100, queueMetrics?.utilizationPercent ?? 0)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Queued Jobs:</span>
                  <span className="text-lg font-bold font-mono text-slate-900">
                    {queueMetrics?.queueDepth ?? 0}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Active In-Flight:</span>
                  <span className="text-lg font-bold font-mono text-blue-600">
                    {queueMetrics?.activeConcurrency ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Architectural Limitation Callout */}
          <div className="mt-4 p-3 bg-blue-50/60 border border-blue-100 rounded-lg flex items-start gap-2 text-[11px] text-blue-900">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <strong>Single-Node Standalone Architecture:</strong> FlowPilot execution workers run
              in-process within this application node. External distributed messaging brokers
              (e.g., Redis Streams / RabbitMQ) are not attached in this configuration.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

