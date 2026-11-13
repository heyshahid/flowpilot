'use client';

import React from 'react';
import Link from 'next/link';
import {
  Lightbulb,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Info,
  Clock,
  Sparkles,
} from 'lucide-react';
import { OptimizationRecommendation } from '@/core/analytics/types';

interface OptimizationRecommendationsPanelProps {
  recommendations: OptimizationRecommendation[];
}

export const OptimizationRecommendationsPanel: React.FC<OptimizationRecommendationsPanelProps> = ({
  recommendations,
}) => {
  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Workflow Operating Optimally</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              No bottleneck thresholds or reliability warning patterns detected across recorded execution traces.
            </p>
          </div>
        </div>
        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
          Optimal Performance
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Lightbulb className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Evidence-Backed Optimization Recommendations ({recommendations.length})
            </h3>
            <p className="text-xs text-slate-500">
              Advisory diagnostics derived from actual execution telemetry. Workflows are never modified automatically.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span>Non-destructive advisory guidelines</span>
        </div>
      </div>

      {/* Recommendations Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className="flex flex-col justify-between p-4 bg-slate-50/70 border border-slate-200 rounded-xl transition-all hover:bg-white hover:border-blue-200 hover:shadow-xs"
          >
            <div>
              {/* Badge & Rule Header */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  {rec.ruleId}
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    rec.evidenceLevel === 'STRONG'
                      ? 'bg-emerald-100 text-emerald-800'
                      : rec.evidenceLevel === 'MODERATE'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {rec.evidenceLevel} Evidence
                </span>
              </div>

              {/* Node identification */}
              <h4 className="text-xs font-bold text-slate-900 mb-1">
                Node: <span className="text-blue-600">{rec.nodeName}</span>{' '}
                <span className="font-mono text-[10px] text-slate-400">({rec.nodeType})</span>
              </h4>

              {/* Issue Description */}
              <p className="text-xs text-slate-700 mb-3 leading-relaxed">{rec.issue}</p>

              {/* Supporting Measurements Box */}
              <div className="grid grid-cols-2 gap-2 p-2.5 bg-white border border-slate-200 rounded-lg text-[11px] mb-3">
                {rec.supportingMeasurements.nodeMeanDurationMs != null && (
                  <div>
                    <span className="text-slate-400 text-[10px] block">Mean Duration:</span>
                    <span className="font-semibold text-slate-800">
                      {rec.supportingMeasurements.nodeMeanDurationMs}ms
                    </span>
                  </div>
                )}
                {rec.supportingMeasurements.durationContributionRatio != null && (
                  <div>
                    <span className="text-slate-400 text-[10px] block">Duration Share:</span>
                    <span className="font-semibold text-amber-700">
                      {(rec.supportingMeasurements.durationContributionRatio * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
                {rec.supportingMeasurements.failureRatePercent != null && (
                  <div>
                    <span className="text-slate-400 text-[10px] block">Failure Rate:</span>
                    <span className="font-semibold text-rose-700">
                      {rec.supportingMeasurements.failureRatePercent}%
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-slate-400 text-[10px] block">Analyzed Samples:</span>
                  <span className="font-semibold text-slate-800">
                    {rec.supportingMeasurements.sampleSize} runs
                  </span>
                </div>
              </div>

              {/* Actionable Suggestion */}
              <div className="flex items-start gap-2 text-xs bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 text-blue-900">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Recommended Action:</strong> {rec.suggestedAction}
                </span>
              </div>
            </div>

            {/* Affected Execution IDs link */}
            {rec.relevantExecutionIds && rec.relevantExecutionIds.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-slate-200 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-400">Evidence executions:</span>
                {rec.relevantExecutionIds.map((execId) => (
                  <Link
                    key={execId}
                    href={`/executions/${execId}`}
                    className="font-mono text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-blue-600 hover:underline flex items-center gap-0.5"
                  >
                    <span>{execId.substring(0, 10)}...</span>
                    <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

