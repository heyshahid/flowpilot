'use client';

import React from 'react';
import { ValidationReport } from '@/core/validation/graphValidator';
import { Badge } from '@/components/ui/Badge';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  ShieldCheck,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface ValidationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  report: ValidationReport | null;
  onSelectNode?: (nodeId: string) => void;
}

export const ValidationDrawer: React.FC<ValidationDrawerProps> = ({
  isOpen,
  onClose,
  report,
  onSelectNode,
}) => {
  if (!isOpen || !report) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 max-h-96 bg-white border-t border-slate-200 shadow-2xl flex flex-col transition-all">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-slate-900 text-white text-xs select-none">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span className="font-bold tracking-wide">Graph Validation & Topology Inspector</span>
          <Badge
            variant={report.isValid ? 'success' : report.errorsCount > 0 ? 'failed' : 'draft'}
            size="sm"
          >
            {report.isValid ? 'GRAPH VALID' : `${report.errorsCount} ERRORS`}
          </Badge>
          {report.warningsCount > 0 && (
            <span className="text-amber-400 font-semibold text-[11px]">
              ({report.warningsCount} Warnings)
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Notice Banner */}
      <div className="px-6 py-2 bg-slate-100 border-b border-slate-200/80 text-[11px] text-slate-600 flex items-center justify-between">
        <span>
          <span className="font-semibold text-slate-800">Verification Boundary:</span> Validates DAG structure, cycles, ports, and Zod configuration schemas. Background execution worker queue is scheduled for Phase 4.
        </span>
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-50 text-xs space-y-2">
        {report.issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-slate-600">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-2" />
            <span className="font-bold text-slate-800">Graph is Clean & Valid</span>
            <p className="text-xs text-slate-500 mt-0.5">
              Topological sort passed, 0 cycles detected, and all node configurations satisfy their schema rules.
            </p>
          </div>
        ) : (
          report.issues.map((issue, index) => (
            <div
              key={index}
              className={`flex items-start justify-between p-3 rounded-lg border bg-white shadow-xs ${
                issue.type === 'error'
                  ? 'border-rose-200 bg-rose-50/20'
                  : 'border-amber-200 bg-amber-50/20'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {issue.type === 'error' ? (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold text-slate-800">
                    {issue.code.replace(/_/g, ' ')}
                  </span>
                  <p className="text-slate-600 mt-0.5">{issue.message}</p>
                </div>
              </div>

              {issue.nodeId && onSelectNode && (
                <button
                  onClick={() => {
                    onSelectNode(issue.nodeId!);
                    onClose();
                  }}
                  className="flex items-center gap-1 text-[11px] text-blue-600 font-semibold hover:underline shrink-0 ml-4"
                >
                  Inspect Node
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
