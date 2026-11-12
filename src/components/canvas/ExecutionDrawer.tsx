'use client';

import React from 'react';
import { ExecutionResult } from '@/core/types/workflow';
import { Badge } from '@/components/ui/Badge';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  Layers,
  X,
  Terminal,
} from 'lucide-react';

interface ExecutionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  result: ExecutionResult | null;
  isRunning: boolean;
}

export const ExecutionDrawer: React.FC<ExecutionDrawerProps> = ({
  isOpen,
  onClose,
  result,
  isRunning,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 max-h-80 bg-white border-t border-slate-200 shadow-2xl flex flex-col transition-all">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-slate-900 text-white text-xs select-none">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-4 h-4 text-blue-400" />
          <span className="font-bold tracking-wide">Live Execution Console</span>
          {isRunning ? (
            <span className="flex items-center gap-1.5 text-blue-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              Running DAG...
            </span>
          ) : result ? (
            <Badge
              variant={result.status === 'completed' ? 'success' : 'failed'}
              size="sm"
            >
              {result.status === 'completed' ? 'SUCCESS' : 'FAILED'}
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {result && (
            <span className="text-slate-400 font-mono text-[11px]">
              Duration: {result.durationMs}ms
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-50 font-mono text-xs space-y-2">
        {isRunning ? (
          <div className="p-6 text-center text-slate-500">
            Compiling graph topology and invoking node drivers...
          </div>
        ) : !result ? (
          <div className="p-6 text-center text-slate-500">
            Click &quot;Test Run&quot; above to execute this workflow with test payload.
          </div>
        ) : (
          <div className="space-y-2">
            {result.traces.map((trace, index) => (
              <div
                key={trace.nodeId}
                className="flex items-start justify-between p-2.5 rounded-lg border border-slate-200 bg-white shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-bold text-[11px] w-5">
                    #{index + 1}
                  </span>
                  {trace.status === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : trace.status === 'skipped' ? (
                    <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">
                        {trace.nodeName}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        ({trace.nodeType})
                      </span>
                    </div>
                    {trace.status === 'skipped' ? (
                      <p className="text-[11px] text-amber-600">
                        Skipped (non-matching conditional branch)
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 truncate max-w-md">
                        Output: {JSON.stringify(trace.output)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] text-slate-400">
                    {trace.durationMs}ms
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
