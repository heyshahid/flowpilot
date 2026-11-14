'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Lightbulb,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Info,
  Sliders,
  Activity,
  Layers,
  Zap,
  DollarSign,
  X,
  Calendar,
  Eye,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  OptimizationRecommendation,
  RecommendationCategory,
  RecommendationSeverity,
  RecommendationStatus,
  RecommendationConfidenceTier,
  RecommendationOverviewMetrics,
  UserFeedbackType,
} from '@/core/recommendations/types';

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<OptimizationRecommendation[]>([]);
  const [overview, setOverview] = useState<RecommendationOverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [selectedRec, setSelectedRec] = useState<OptimizationRecommendation | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [feedbackComments, setFeedbackComments] = useState('');

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE'); // ACTIVE = NEW + VIEWED
  const [confidenceFilter, setConfidenceFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [recsRes, overviewRes] = await Promise.all([
        fetch('/api/v1/recommendations?limit=100'),
        fetch('/api/v1/recommendations/overview'),
      ]);

      if (recsRes.ok) {
        const data = await recsRes.json();
        if (data.success) {
          setRecommendations(data.items || []);
        }
      }

      if (overviewRes.ok) {
        const oData = await overviewRes.json();
        if (oData.success) {
          setOverview(oData.data);
        }
      }
    } catch (err) {
      console.error('Failed to load recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEvaluate = async () => {
    try {
      setEvaluating(true);
      const res = await fetch('/api/v1/recommendations/evaluate', { method: 'POST' });
      if (res.ok) {
        await loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Evaluation failed');
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setEvaluating(false);
    }
  };

  const handleView = async (rec: OptimizationRecommendation) => {
    setSelectedRec(rec);
    if (rec.status === 'NEW') {
      try {
        await fetch(`/api/v1/recommendations/${rec.id}/view`, { method: 'POST' });
        // Optimistically update
        setRecommendations((prev) =>
          prev.map((r) => (r.id === rec.id ? { ...r, status: 'VIEWED' } : r))
        );
      } catch (err) {
        console.error('Failed to mark viewed:', err);
      }
    }
  };

  const handleDismiss = async (id: string) => {
    const reason = prompt('Please provide an optional reason for dismissing:');
    try {
      const res = await fetch(`/api/v1/recommendations/${id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (res.ok) {
        if (selectedRec?.id === id) setSelectedRec(null);
        await loadData();
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleSnooze = async (id: string, days: number = 7) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    try {
      const res = await fetch(`/api/v1/recommendations/${id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ untilDate: d.toISOString() }),
      });
      if (res.ok) {
        if (selectedRec?.id === id) setSelectedRec(null);
        await loadData();
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleResolve = async (id: string) => {
    const notes = prompt('Optional resolution / remediation notes:');
    try {
      const res = await fetch(`/api/v1/recommendations/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes || undefined }),
      });
      if (res.ok) {
        if (selectedRec?.id === id) setSelectedRec(null);
        await loadData();
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleFeedback = async (type: UserFeedbackType) => {
    if (!selectedRec) return;
    try {
      const res = await fetch(`/api/v1/recommendations/${selectedRec.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, comments: feedbackComments || undefined }),
      });
      if (res.ok) {
        setFeedbackSuccess(true);
        setTimeout(() => setFeedbackSuccess(false), 3000);
        setFeedbackComments('');
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Filter recommendations
  const filteredRecs = recommendations.filter((rec) => {
    if (categoryFilter !== 'ALL' && rec.category !== categoryFilter) return false;
    if (severityFilter !== 'ALL' && rec.severity !== severityFilter) return false;
    if (confidenceFilter !== 'ALL' && rec.confidence !== confidenceFilter) return false;

    if (statusFilter === 'ACTIVE') {
      if (rec.status !== 'NEW' && rec.status !== 'VIEWED') return false;
    } else if (statusFilter !== 'ALL') {
      if (rec.status !== statusFilter) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        rec.title.toLowerCase().includes(q) ||
        rec.summary.toLowerCase().includes(q) ||
        rec.category.toLowerCase().includes(q) ||
        (rec.targetName && rec.targetName.toLowerCase().includes(q))
      );
    }

    return true;
  });

  const getSeverityBadge = (sev: RecommendationSeverity) => {
    switch (sev) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800">
            <ShieldAlert className="w-3 h-3 text-rose-600" /> Critical
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
            <AlertTriangle className="w-3 h-3 text-amber-600" /> High
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
            Medium
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
            Low
          </span>
        );
    }
  };

  const getConfidenceBadge = (conf: RecommendationConfidenceTier, score: number) => {
    const color =
      conf === 'HIGH'
        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
        : conf === 'MEDIUM'
        ? 'text-blue-700 bg-blue-50 border-blue-200'
        : 'text-slate-600 bg-slate-50 border-slate-200';

    return (
      <span
        title={`Confidence Score: ${score}/100 based on sample size and data quality`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${color}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {conf} ({score})
      </span>
    );
  };

  const getCategoryIcon = (cat: RecommendationCategory) => {
    switch (cat) {
      case 'WORKFLOW_PERFORMANCE':
        return <Activity className="w-3.5 h-3.5 text-blue-600" />;
      case 'NODE_OPTIMIZATION':
        return <Sliders className="w-3.5 h-3.5 text-indigo-600" />;
      case 'RELIABILITY':
        return <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />;
      case 'INTEGRATION':
        return <Zap className="w-3.5 h-3.5 text-amber-600" />;
      case 'AI_COST':
        return <DollarSign className="w-3.5 h-3.5 text-emerald-600" />;
      case 'SCHEDULING':
        return <Clock className="w-3.5 h-3.5 text-purple-600" />;
      case 'RESOURCE_USAGE':
        return <Layers className="w-3.5 h-3.5 text-slate-600" />;
      case 'WORKFLOW_ARCHITECTURE':
        return <Sparkles className="w-3.5 h-3.5 text-teal-600" />;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-amber-500" />
            Optimization Recommendations Engine
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Evidence-backed diagnostic insights to improve execution latency, reliability, AI costs, and resource efficiency.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleEvaluate}
            disabled={evaluating}
            className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 shadow-xs"
          >
            <Play className={`w-4 h-4 ${evaluating ? 'animate-spin' : ''}`} />
            {evaluating ? 'Evaluating Rules...' : 'Run Diagnostics'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5 leading-relaxed">
          <span className="font-semibold text-amber-950">Advisory-Only Optimization Policy: </span>
          FlowPilot recommendations are advisory analyses intended to highlight potential optimization opportunities.
          FlowPilot <strong>never alters, disables, or modifies workflows automatically</strong> without explicit user review.
        </div>
      </div>

      {/* KPI Overview Bar */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
            <span className="text-[11px] font-medium text-slate-500">Active</span>
            <div className="mt-1 text-2xl font-bold text-slate-900">{overview.totalActive}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{overview.unreviewedCount} unreviewed</div>
          </div>

          <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 shadow-xs">
            <span className="text-[11px] font-semibold text-rose-700">Critical</span>
            <div className="mt-1 text-2xl font-bold text-rose-900">{overview.criticalCount}</div>
            <div className="text-[10px] text-rose-600 mt-0.5">High operational risk</div>
          </div>

          <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 shadow-xs">
            <span className="text-[11px] font-semibold text-amber-700">High Priority</span>
            <div className="mt-1 text-2xl font-bold text-amber-900">{overview.highCount}</div>
            <div className="text-[10px] text-amber-600 mt-0.5">Bottlenecks & retries</div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
            <span className="text-[11px] font-medium text-slate-500">Medium / Low</span>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {overview.mediumCount + overview.lowCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Efficiency advisories</div>
          </div>

          <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-xs">
            <span className="text-[11px] font-semibold text-emerald-700">Resolved</span>
            <div className="mt-1 text-2xl font-bold text-emerald-900">{overview.resolvedCount}</div>
            <div className="text-[10px] text-emerald-600 mt-0.5">Remediated issues</div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
            <span className="text-[11px] font-medium text-slate-500">Dismissed</span>
            <div className="mt-1 text-2xl font-bold text-slate-900">{overview.dismissedCount}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{overview.snoozedCount} snoozed</div>
          </div>
        </div>
      )}

      {/* Category Pills Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
        {[
          { key: 'ALL', label: 'All Categories' },
          { key: 'WORKFLOW_PERFORMANCE', label: 'Performance' },
          { key: 'NODE_OPTIMIZATION', label: 'Node Bottlenecks' },
          { key: 'RELIABILITY', label: 'Reliability' },
          { key: 'INTEGRATION', label: 'Integrations' },
          { key: 'AI_COST', label: 'AI Cost & Tokens' },
          { key: 'SCHEDULING', label: 'Scheduling' },
          { key: 'RESOURCE_USAGE', label: 'Resource Quotas' },
          { key: 'WORKFLOW_ARCHITECTURE', label: 'Architecture' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategoryFilter(tab.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
              categoryFilter === tab.key
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="ACTIVE">Active (New & Viewed)</option>
            <option value="NEW">New Only</option>
            <option value="VIEWED">Viewed</option>
            <option value="SNOOZED">Snoozed</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
            <option value="ALL">All Statuses</option>
          </select>

          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Confidence filter */}
          <select
            value={confidenceFilter}
            onChange={(e) => setConfidenceFilter(e.target.value)}
            className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="ALL">All Confidence Tiers</option>
            <option value="HIGH">High Confidence</option>
            <option value="MEDIUM">Medium Confidence</option>
            <option value="LOW">Low Confidence</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search recommendations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Recommendations Cards Grid */}
      {filteredRecs.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              No optimization recommendations have been identified from the available data.
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Run new workflow executions or check back after operational activity has accumulated to evaluate diagnostic rules.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecs.map((rec) => (
            <div
              key={rec.id}
              className={`p-5 rounded-xl border bg-white shadow-xs hover:border-slate-300 transition-all space-y-3 ${
                rec.status === 'NEW' ? 'border-amber-200 bg-amber-50/10 ring-1 ring-amber-100' : 'border-slate-200'
              }`}
            >
              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                    {getCategoryIcon(rec.category)}
                    {rec.category.replace('_', ' ')}
                  </span>
                  {getSeverityBadge(rec.severity)}
                  {getConfidenceBadge(rec.confidence, rec.confidenceScore)}
                  {rec.targetName && (
                    <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                      {rec.targetType}: {rec.targetName}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[11px] text-slate-400 font-mono">
                    Priority Score: <strong className="text-slate-700">{rec.priorityScore}</strong>/100
                  </span>
                  {rec.status === 'NEW' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white">
                      NEW
                    </span>
                  )}
                  {rec.status === 'SNOOZED' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">
                      SNOOZED
                    </span>
                  )}
                </div>
              </div>

              {/* Title & Summary */}
              <div>
                <h3 className="font-bold text-sm text-slate-900">{rec.title}</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{rec.summary}</p>
              </div>

              {/* Supporting Evidence preview */}
              {rec.evidence.length > 0 && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                  {rec.evidence.map((ev, idx) => (
                    <div key={idx} className="flex items-baseline gap-1.5">
                      <span className="font-semibold text-slate-700">{ev.metricName}:</span>
                      <span className="font-mono text-slate-900">{String(ev.observedValue)}</span>
                      {ev.comparisonValue && (
                        <span className="text-[11px] text-slate-400">({String(ev.comparisonValue)})</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Suggested Action & Buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                {rec.suggestedActions.length > 0 ? (
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span className="font-semibold text-slate-700">Action:</span>
                    <span>{rec.suggestedActions[0].title}</span>
                  </div>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleView(rec)}
                    className="text-xs h-7 flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" /> Details
                  </Button>

                  {rec.status !== 'RESOLVED' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSnooze(rec.id, 7)}
                        className="text-xs h-7 text-purple-700 hover:bg-purple-50"
                      >
                        Snooze 7d
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDismiss(rec.id)}
                        className="text-xs h-7 text-slate-500 hover:text-slate-800"
                      >
                        Dismiss
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleResolve(rec.id)}
                        className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Resolve
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedRec && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                    {getCategoryIcon(selectedRec.category)}
                    {selectedRec.category.replace('_', ' ')}
                  </span>
                  {getSeverityBadge(selectedRec.severity)}
                  {getConfidenceBadge(selectedRec.confidence, selectedRec.confidenceScore)}
                </div>
                <h2 className="text-base font-bold text-slate-900">{selectedRec.title}</h2>
              </div>

              <button
                onClick={() => setSelectedRec(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Diagnostic Summary</h4>
              <p className="text-xs text-slate-700 leading-relaxed">{selectedRec.description}</p>
            </div>

            {/* Supporting Evidence Breakdown */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Supporting Evidence Metrics</h4>
              <div className="rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {selectedRec.evidence.map((ev, idx) => (
                  <div key={idx} className="p-3 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-semibold text-slate-800">{ev.metricName}</span>
                      <div className="text-[11px] text-slate-500">
                        Source: {ev.sourceService} • Sample Size: {ev.sampleSize}
                      </div>
                      {ev.notes && <div className="text-[11px] text-slate-600 italic mt-0.5">{ev.notes}</div>}
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-slate-900">{String(ev.observedValue)}</span>
                      {ev.comparisonValue && (
                        <div className="text-[11px] text-slate-500">Ref: {String(ev.comparisonValue)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Estimated Impact & Limitations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {selectedRec.estimatedImpact && (
                <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200 text-xs text-emerald-950 space-y-1">
                  <span className="font-bold flex items-center gap-1 text-emerald-800">
                    <Sparkles className="w-3.5 h-3.5" /> Estimated Benefit
                  </span>
                  <p>{selectedRec.estimatedImpact.description}</p>
                  <span className="text-[10px] text-emerald-700 block italic">
                    * Conservative estimate; actual performance depends on workload.
                  </span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                <span className="font-bold text-slate-900 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-slate-500" /> Data Limitations
                </span>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-600">
                  {selectedRec.dataLimitations.map((lim, idx) => (
                    <li key={idx}>{lim}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Suggested Actions */}
            {selectedRec.suggestedActions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Suggested Action Steps</h4>
                <div className="space-y-2">
                  {selectedRec.suggestedActions.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900">{act.title}</span>
                        <p className="text-slate-600 mt-0.5">{act.description}</p>
                      </div>
                      {act.targetUrl && (
                        <Link href={act.targetUrl}>
                          <Button size="sm" variant="outline" className="text-xs h-7 flex items-center gap-1 shrink-0">
                            Navigate <ExternalLink className="w-3 h-3" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User Feedback Form */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-800">Was this diagnostic recommendation helpful?</h4>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleFeedback('HELPFUL')}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-white border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-colors flex items-center gap-1"
                >
                  <ThumbsUp className="w-3.5 h-3.5" /> Helpful
                </button>
                <button
                  onClick={() => handleFeedback('NOT_HELPFUL')}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition-colors flex items-center gap-1"
                >
                  <ThumbsDown className="w-3.5 h-3.5" /> Not Helpful
                </button>
                <button
                  onClick={() => handleFeedback('ALREADY_FIXED')}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  Already Fixed
                </button>
                <button
                  onClick={() => handleFeedback('NOT_RELEVANT')}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                >
                  Not Relevant
                </button>
                <button
                  onClick={() => handleFeedback('INCORRECT')}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-white border border-slate-200 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                >
                  Incorrect
                </button>
              </div>

              {feedbackSuccess && (
                <div className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Thank you! Feedback recorded for platform governance.
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedRec(null)}
              >
                Close
              </Button>

              {selectedRec.status !== 'RESOLVED' && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSnooze(selectedRec.id, 7)}
                    className="text-xs"
                  >
                    Snooze 7 Days
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleResolve(selectedRec.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  >
                    Confirm Resolved
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

