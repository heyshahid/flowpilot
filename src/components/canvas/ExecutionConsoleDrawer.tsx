'use client';

import React, { useEffect, useState } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RotateCw,
  Ban,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  X,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StepExecutionRecord, WorkflowExecutionRecord } from '@/core/execution/types';

interface ExecutionConsoleDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  executionId: string | null;
  onSelectNode?: (nodeId: string) => void;
}

export function ExecutionConsoleDrawer({
  isOpen,
  onClose,
  executionId,
  onSelectNode,
}: ExecutionConsoleDrawerProps) {
  const [execution, setExecution] = useState<WorkflowExecutionRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [aiDiagnosis, setAiDiagnosis] = useState<any>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  const handleDiagnoseAI = async () => {
    if (!executionId) return;
    setIsDiagnosing(true);
    try {
      const res = await fetch('/api/v1/ai/analyze-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId }),
      });
      const data = await res.json();
      if (data.success) {
        setAiDiagnosis(data.data);
      } else {
        alert(data.error || 'Failed to diagnose execution error.');
      }
    } catch (err: any) {
      alert(err.message || 'Error diagnosing execution.');
    } finally {
      setIsDiagnosing(false);
    }
  };

  // Poll execution status while active
  useEffect(() => {
    if (!isOpen || !executionId) {
      setExecution(null);
      return;
    }

    let isMounted = true;
    let timer: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/v1/executions/${executionId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.execution) {
          setExecution(data.execution);

          // If still running or queued, poll again
          if (
            data.execution.status === 'RUNNING' ||
            data.execution.status === 'QUEUED' ||
            data.execution.status === 'VALIDATING'
          ) {
            timer = setTimeout(fetchStatus, 600);
          }
        }
      } catch (err) {
        console.error('Failed to poll execution details:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    setLoading(true);
    fetchStatus();

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, executionId]);

  if (!isOpen) return null;

  const toggleNodeExpand = (nodeId: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const handleCancel = async () => {
    if (!executionId) return;
    setIsCancelling(true);
    try {
      await fetch(`/api/v1/executions/${executionId}/cancel`, { method: 'POST' });
      // Re-fetch
      const res = await fetch(`/api/v1/executions/${executionId}`);
      if (res.ok) {
        const data = await res.json();
        setExecution(data.execution);
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRetry = async () => {
    if (!executionId) return;
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/v1/executions/${executionId}/retry`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setExecution(data.execution);
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const isTerminal =
    execution?.status === 'COMPLETED' ||
    execution?.status === 'FAILED' ||
    execution?.status === 'CANCELLED';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            COMPLETED
          </span>
        );
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
            <RotateCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            RUNNING
          </span>
        );
      case 'VALIDATING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <RotateCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
            VALIDATING
          </span>
        );
      case 'QUEUED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            QUEUED
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            FAILED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <Ban className="w-3.5 h-3.5 text-slate-500" />
            CANCELLED
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
            SKIPPED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 bg-slate-50/60 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
            <Play className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Execution Console
              </h3>
              {execution && getStatusBadge(execution.status)}
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              ID: {execution?.id || executionId || 'Initializing...'} • {execution?.durationMs || 0}ms total duration
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {!isTerminal && execution && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              isLoading={isCancelling}
              className="text-rose-600 border-rose-200 hover:bg-rose-50"
              icon={<Ban className="w-3.5 h-3.5" />}
            >
              Cancel Run
            </Button>
          )}

          {(execution?.status === 'FAILED' || execution?.status === 'CANCELLED') && (
            <Button
              size="sm"
              variant="primary"
              onClick={handleRetry}
              isLoading={isRetrying}
              icon={<RotateCw className="w-3.5 h-3.5" />}
            >
              Retry Execution
            </Button>
          )}

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 max-h-[60vh]">
        {/* Error Banner if workflow failed */}
        {(execution?.error || execution?.status === 'FAILED') && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Execution Failed</div>
                  <div className="mt-1 font-mono text-[11px] whitespace-pre-wrap">{execution.error || 'A step failed during execution.'}</div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDiagnoseAI}
                isLoading={isDiagnosing}
                icon={<Sparkles className="w-3.5 h-3.5 text-purple-600" />}
                className="bg-white text-purple-700 border-purple-200 hover:bg-purple-50 shrink-0"
              >
                AI Error Diagnosis
              </Button>
            </div>

            {aiDiagnosis && (
              <div className="pt-3 border-t border-rose-200/60 text-xs space-y-2 text-slate-800 bg-white/80 p-3 rounded-lg">
                <div className="flex items-center gap-1.5 font-bold text-purple-900">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>{aiDiagnosis.summary}</span>
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] ml-auto">
                    {Math.round(aiDiagnosis.confidenceScore * 100)}% Confidence
                  </Badge>
                </div>
                <p className="text-slate-600 text-[11px]">{aiDiagnosis.rootCause}</p>
                <div>
                  <span className="font-semibold text-slate-800 text-[11px]">Recommended Fixes:</span>
                  <ul className="list-disc pl-4 mt-1 space-y-1 text-[11px] text-slate-600">
                    {aiDiagnosis.suggestedFixes.map((fix: string, idx: number) => (
                      <li key={idx}>{fix}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step Traces List */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
            <span>Execution Step Traces ({execution?.traces?.length || 0})</span>
            {execution?.startedAt && (
              <span className="font-normal lowercase text-[11px] text-slate-400">
                Triggered: {new Date(execution.startedAt).toLocaleTimeString()}
              </span>
            )}
          </h4>

          {(!execution?.traces || execution.traces.length === 0) && (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
              {loading ? 'Preparing workflow execution environment...' : 'No steps recorded yet.'}
            </div>
          )}

          <div className="space-y-2">
            {execution?.traces?.map((trace: StepExecutionRecord, idx: number) => {
              const isExpanded = Boolean(expandedNodes[trace.nodeId]);
              return (
                <div
                  key={trace.nodeId || idx}
                  className="rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden transition-all"
                >
                  <div
                    onClick={() => toggleNodeExpand(trace.nodeId)}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
                  >
                    <div className="flex items-center gap-3">
                      <button className="text-slate-400 hover:text-slate-700">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900">
                          {trace.nodeName}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          ({trace.nodeType})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {trace.durationMs > 0 && (
                        <span className="text-[11px] font-mono text-slate-500">
                          {trace.durationMs}ms
                        </span>
                      )}
                      {getStatusBadge(trace.status)}

                      {onSelectNode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectNode(trace.nodeId);
                          }}
                          title="Focus node in canvas"
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expandable Trace Details */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-3 text-xs">
                      {trace.error && (
                        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
                          <span className="font-bold">Error:</span> {trace.error}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px]">
                        <div>
                          <div className="font-sans font-semibold text-slate-600 mb-1">
                            Input Parameters:
                          </div>
                          <pre className="p-2.5 rounded-lg bg-white border border-slate-200 overflow-x-auto max-h-40 text-slate-800">
                            {JSON.stringify(trace.input || {}, null, 2)}
                          </pre>
                        </div>

                        <div>
                          <div className="font-sans font-semibold text-slate-600 mb-1">
                            Output Result:
                          </div>
                          <pre className="p-2.5 rounded-lg bg-white border border-slate-200 overflow-x-auto max-h-40 text-slate-800">
                            {JSON.stringify(trace.output || {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

