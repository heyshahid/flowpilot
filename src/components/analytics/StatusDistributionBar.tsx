'use client';

import React from 'react';
import { ExecutionSummaryMetrics } from '@/core/analytics/types';

interface StatusDistributionBarProps {
  summary: ExecutionSummaryMetrics;
}

export const StatusDistributionBar: React.FC<StatusDistributionBarProps> = ({ summary }) => {
  const {
    totalExecutions,
    terminalExecutions,
    completedExecutions,
    failedExecutions,
    inFlightExecutions,
    cancelledExecutions,
    successRate,
  } = summary;

  if (totalExecutions === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 mb-2">Execution Status Distribution</h3>
        <p className="text-xs text-slate-400 italic">No executions recorded in this reporting period.</p>
      </div>
    );
  }

  const completedPct = totalExecutions > 0 ? (completedExecutions / totalExecutions) * 100 : 0;
  const failedPct = totalExecutions > 0 ? (failedExecutions / totalExecutions) * 100 : 0;
  const inFlightPct = totalExecutions > 0 ? (inFlightExecutions / totalExecutions) * 100 : 0;
  const cancelledPct = totalExecutions > 0 ? (cancelledExecutions / totalExecutions) * 100 : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Execution Status Distribution</h3>
          <p className="text-xs text-slate-500">
            {terminalExecutions} terminal runs, {inFlightExecutions} in-flight, {cancelledExecutions} cancelled
          </p>
        </div>
        {successRate.isAvailable && (
          <div className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
            Terminal Success Rate: {successRate.formatted}
          </div>
        )}
      </div>

      {/* Progress Bar Segments */}
      <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
        {completedPct > 0 && (
          <div
            style={{ width: `${completedPct}%` }}
            className="bg-emerald-500 h-full transition-all duration-300"
            title={`Completed: ${completedExecutions} (${completedPct.toFixed(1)}%)`}
          />
        )}
        {failedPct > 0 && (
          <div
            style={{ width: `${failedPct}%` }}
            className="bg-rose-500 h-full transition-all duration-300"
            title={`Failed: ${failedExecutions} (${failedPct.toFixed(1)}%)`}
          />
        )}
        {inFlightPct > 0 && (
          <div
            style={{ width: `${inFlightPct}%` }}
            className="bg-blue-500 h-full transition-all duration-300"
            title={`In-Flight: ${inFlightExecutions} (${inFlightPct.toFixed(1)}%)`}
          />
        )}
        {cancelledPct > 0 && (
          <div
            style={{ width: `${cancelledPct}%` }}
            className="bg-slate-400 h-full transition-all duration-300"
            title={`Cancelled: ${cancelledExecutions} (${cancelledPct.toFixed(1)}%)`}
          />
        )}
      </div>

      {/* Legend & Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-100 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
          <div className="flex flex-col">
            <span className="font-semibold text-slate-800">{completedExecutions} Completed</span>
            <span className="text-[10px] text-slate-400">{completedPct.toFixed(1)}% of total</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
          <div className="flex flex-col">
            <span className="font-semibold text-slate-800">{failedExecutions} Failed</span>
            <span className="text-[10px] text-slate-400">{failedPct.toFixed(1)}% of total</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
          <div className="flex flex-col">
            <span className="font-semibold text-slate-800">{inFlightExecutions} In-Flight</span>
            <span className="text-[10px] text-slate-400">{inFlightPct.toFixed(1)}% active</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
          <div className="flex flex-col">
            <span className="font-semibold text-slate-800">{cancelledExecutions} Cancelled</span>
            <span className="text-[10px] text-slate-400">{cancelledPct.toFixed(1)}% stopped</span>
          </div>
        </div>
      </div>
    </div>
  );
};
