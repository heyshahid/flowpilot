'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  ExternalLink,
  Flame,
  XCircle,
  TrendingDown,
} from 'lucide-react';
import {
  DiagnosticStatus,
  NodePerformanceMetric,
} from '@/core/analytics/types';
import { formatDuration } from '@/core/analytics/metricDefinitions';

interface NodePerformanceTableProps {
  nodes: NodePerformanceMetric[];
  workflowId: string;
}

export const NodePerformanceTable: React.FC<NodePerformanceTableProps> = ({ nodes, workflowId }) => {
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  const getStatusBadge = (status: DiagnosticStatus) => {
    switch (status) {
      case 'HEALTHY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Healthy</span>
          </span>
        );
      case 'SLOW':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            <span>Slow (&gt;40%)</span>
          </span>
        );
      case 'UNRELIABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>Unreliable (&gt;15%)</span>
          </span>
        );
      case 'NEEDS_ATTENTION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Flame className="w-3 h-3 text-purple-600" />
            <span>Needs Attention</span>
          </span>
        );
      case 'INSUFFICIENT_DATA':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <HelpCircle className="w-3 h-3 text-slate-400" />
            <span>Insufficient Data (&lt;5)</span>
          </span>
        );
      case 'UNAVAILABLE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">
            <span>Unavailable</span>
          </span>
        );
    }
  };

  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white border border-slate-200 rounded-xl text-center">
        <Layers className="w-6 h-6 text-slate-400 mb-2" />
        <h4 className="text-sm font-semibold text-slate-800">No Node Traces Recorded</h4>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Node execution traces will appear here once executions are triggered for this workflow.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Node Performance & Bottlenecks</h3>
          <p className="text-xs text-slate-500">
            Node-level latency, failure rates, retry patterns, and diagnostic classifications
          </p>
        </div>
        <div className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
          Thresholds: <strong>&gt;40% duration</strong>, <strong>&gt;15% failures</strong>, min <strong>5 runs</strong>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Node</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Attempts (Unique Runs)</th>
              <th className="py-3 px-4">Mean Duration</th>
              <th className="py-3 px-4">Median (p50)</th>
              <th className="py-3 px-4">Failure Rate</th>
              <th className="py-3 px-4">Retries / Timeouts</th>
              <th className="py-3 px-4">Diagnostic Status</th>
              <th className="py-3 px-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {nodes.map((node) => {
              const isExpanded = expandedNodeId === node.nodeId;
              return (
                <React.Fragment key={node.nodeId}>
                  <tr className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div className="flex flex-col">
                        <span>{node.nodeName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{node.nodeId}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">
                        {node.nodeType}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-medium">
                      <span>{node.totalExecutionAttempts || node.executionCount}</span>
                      <span className="text-slate-400 text-[11px] ml-1">
                        ({node.uniqueWorkflowExecutions || node.executionCount} runs)
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-slate-800">
                      <div className="flex flex-col">
                        <span className="font-semibold">{formatDuration(node.meanDurationMs)}</span>
                        {node.durationContributionRatio !== null && (
                          <span className={`text-[10px] ${node.warnings.highDuration ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                            {(node.durationContributionRatio * 100).toFixed(1)}% of total
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                      {formatDuration(node.medianDurationMs)}
                    </td>

                    <td className="py-3 px-4">
                      {node.failureRatePercent !== null ? (
                        <span
                          className={`font-semibold text-[11px] ${
                            node.warnings.highFailureRate
                              ? 'text-rose-600 font-bold'
                              : (node.failureRatePercent ?? 0) > 0
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {node.failureRatePercent}%
                          <span className="text-slate-400 font-normal text-[10px] ml-1">
                            ({node.failureCount} failed)
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">N/A</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                      <span>{node.totalRetryCount} retries</span>
                      {(node.timeoutCount ?? 0) > 0 && (
                        <span className="text-rose-600 ml-1.5 font-bold">
                          ({node.timeoutCount} timeouts)
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {getStatusBadge(node.diagnosticStatus)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setExpandedNodeId(isExpanded ? null : node.nodeId)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>

                  {/* Expandable Node Diagnostics Drawer */}
                  {isExpanded && (
                    <tr className="bg-slate-50/70 border-b border-slate-200">
                      <td colSpan={9} className="p-4">
                        <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                          {/* Diagnostic Evidence Header */}
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                              <span>Diagnostic Evidence & Observations</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold lowercase">
                                {node.evidenceLevel} evidence ({node.executionCount} samples)
                              </span>
                            </h4>
                            <div className="flex flex-col gap-1 text-xs text-slate-700">
                              {node.diagnosticReasons && node.diagnosticReasons.length > 0 ? (
                                node.diagnosticReasons.map((reason, rIdx) => (
                                  <div key={rIdx} className="flex items-start gap-1.5">
                                    <span className="text-slate-400">•</span>
                                    <span>{reason}</span>
                                  </div>
                                ))
                              ) : (
                                <span>Operating within normal operational parameters.</span>
                              )}
                            </div>
                          </div>

                          {/* Error Categories Breakdown */}
                          {Object.keys(node.errorCategories || {}).length > 0 && (
                            <div>
                              <h5 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-1">
                                Failure Categories
                              </h5>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(node.errorCategories).map(([err, count]) => (
                                  <div
                                    key={err}
                                    className="px-2.5 py-1 bg-rose-50 border border-rose-200 rounded-md text-[11px] text-rose-800 font-mono flex items-center gap-2"
                                  >
                                    <span>{err}</span>
                                    <span className="font-bold bg-rose-200 text-rose-900 px-1.5 rounded-full text-[10px]">
                                      {count}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Recent Execution Traces */}
                          <div>
                            <h5 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                              Recent Execution Attempts (Sanitized)
                            </h5>
                            {node.recentTraces && node.recentTraces.length > 0 ? (
                              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                <table className="w-full text-left text-[11px]">
                                  <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                                    <tr>
                                      <th className="py-2 px-3">Execution ID</th>
                                      <th className="py-2 px-3">Status</th>
                                      <th className="py-2 px-3">Duration</th>
                                      <th className="py-2 px-3">Attempts / Retries</th>
                                      <th className="py-2 px-3">Error</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-slate-700">
                                    {node.recentTraces.map((t, tIdx) => (
                                      <tr key={tIdx} className="hover:bg-slate-50">
                                        <td className="py-2 px-3">
                                          <Link
                                            href={`/executions/${t.executionId}`}
                                            className="font-mono text-blue-600 hover:underline flex items-center gap-1"
                                          >
                                            <span>{t.executionId}</span>
                                            <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                                          </Link>
                                        </td>
                                        <td className="py-2 px-3">
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                              t.status === 'COMPLETED'
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : t.status === 'FAILED'
                                                ? 'bg-rose-50 text-rose-700'
                                                : 'bg-slate-100 text-slate-600'
                                            }`}
                                          >
                                            {t.status}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 font-mono">
                                          {formatDuration(t.durationMs)}
                                        </td>
                                        <td className="py-2 px-3 font-mono">
                                          {t.attempts} attempt(s) ({t.retryCount} retries)
                                        </td>
                                        <td className="py-2 px-3 text-rose-600 max-w-xs truncate">
                                          {t.error || '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400 italic">No recent trace records available.</p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

