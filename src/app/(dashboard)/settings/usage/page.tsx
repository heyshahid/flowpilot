'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Gauge,
  ArrowLeft,
  Activity,
  GitBranch,
  Clock,
  Sparkles,
  Zap,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Save,
  Sliders,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  WorkspaceUsageSummary,
  WorkspaceLimits,
  UsageTimeWindow,
  ResourceLimitStatus,
} from '@/core/usage/types';

export default function WorkspaceUsagePage() {
  const [timeWindow, setTimeWindow] = useState<UsageTimeWindow>('30d');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState<WorkspaceUsageSummary | null>(null);
  const [limitsForm, setLimitsForm] = useState<Partial<WorkspaceLimits>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsageData = async (window: UsageTimeWindow = timeWindow) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/workspaces/ws_default/usage?timeWindow=${window}`);
      if (!res.ok) throw new Error('Failed to load workspace usage metrics');
      const data = await res.json();
      if (data.success) {
        setUsage(data.data);
      } else {
        throw new Error(data.error || 'Failed to load usage');
      }

      const limitsRes = await fetch(`/api/v1/workspaces/ws_default/limits`);
      if (limitsRes.ok) {
        const limData = await limitsRes.json();
        if (limData.success) {
          setLimitsForm(limData.data);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsageData(timeWindow);
  }, [timeWindow]);

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSaveSuccess(false);
      const res = await fetch(`/api/v1/workspaces/ws_default/limits`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxWorkflows: limitsForm.maxWorkflows !== null && limitsForm.maxWorkflows !== undefined ? Number(limitsForm.maxWorkflows) : null,
          maxMonthlyExecutions: limitsForm.maxMonthlyExecutions !== null && limitsForm.maxMonthlyExecutions !== undefined ? Number(limitsForm.maxMonthlyExecutions) : null,
          maxConcurrentExecutions: limitsForm.maxConcurrentExecutions !== null && limitsForm.maxConcurrentExecutions !== undefined ? Number(limitsForm.maxConcurrentExecutions) : null,
          maxActiveSchedules: limitsForm.maxActiveSchedules !== null && limitsForm.maxActiveSchedules !== undefined ? Number(limitsForm.maxActiveSchedules) : null,
          maxAiTokensMonthly: limitsForm.maxAiTokensMonthly !== null && limitsForm.maxAiTokensMonthly !== undefined ? Number(limitsForm.maxAiTokensMonthly) : null,
          maxAiCostMonthlyUsd: limitsForm.maxAiCostMonthlyUsd !== null && limitsForm.maxAiCostMonthlyUsd !== undefined ? Number(limitsForm.maxAiCostMonthlyUsd) : null,
          maxMonthlyIntegrationOps: limitsForm.maxMonthlyIntegrationOps !== null && limitsForm.maxMonthlyIntegrationOps !== undefined ? Number(limitsForm.maxMonthlyIntegrationOps) : null,
        }),
      });

      if (!res.ok) throw new Error('Failed to save quota policies');
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        await fetchUsageData(timeWindow);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: ResourceLimitStatus) => {
    switch (status.state) {
      case 'LIMIT_REACHED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-700">
            <ShieldAlert className="w-3 h-3" /> Limit Exceeded
          </span>
        );
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-700">
            <AlertTriangle className="w-3 h-3" /> 100% Critical
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700">
            <AlertTriangle className="w-3 h-3" /> Warning ({status.percentage}%)
          </span>
        );
      case 'NORMAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="w-3 h-3" /> Healthy ({status.percentage}%)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
            Unlimited
          </span>
        );
    }
  };

  const getBarColor = (status: ResourceLimitStatus) => {
    switch (status.state) {
      case 'LIMIT_REACHED':
      case 'CRITICAL':
        return 'bg-rose-500';
      case 'WARNING':
        return 'bg-amber-500';
      case 'NORMAL':
        return 'bg-emerald-500';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Navigation Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/settings"
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Settings
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Gauge className="w-6 h-6 text-amber-600" />
            Workspace Usage & Resource Quotas
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor real resource consumption, active execution workloads, AI cost quotas, and admin-configured policies.
          </p>
        </div>

        {/* Time Window Filters */}
        <div className="flex items-center gap-2">
          {(['7d', '30d', '90d'] as UsageTimeWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => setTimeWindow(w)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                timeWindow === w
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Last {w === '7d' ? '7 Days' : w === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchUsageData(timeWindow)}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Workflows */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Workflows</span>
            <GitBranch className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {usage ? usage.workflows.total : '-'}
            </span>
            <span className="text-xs text-slate-500">
              ({usage?.workflows.active || 0} active)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            {usage?.workflows.draft || 0} draft, {usage?.workflows.paused || 0} paused
          </div>
        </div>

        {/* Executions */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Executions</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {usage ? usage.executions.total : '-'}
            </span>
            <span className="text-xs text-slate-500">runs</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-2">
            <span className="text-emerald-600 font-medium">{usage?.executions.completed || 0} ok</span>
            <span className="text-rose-600 font-medium">{usage?.executions.failed || 0} failed</span>
          </div>
        </div>

        {/* Active Schedules */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Schedules</span>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {usage ? usage.schedules.active : '-'}
            </span>
            <span className="text-xs text-slate-500">active</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            {usage?.schedules.total || 0} total registered
          </div>
        </div>

        {/* AI Usage & Cost */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>AI Cost (Est.)</span>
            <DollarSign className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              ${usage ? usage.aiUsage.estimatedCostUsd.toFixed(2) : '0.00'}
            </span>
            <span className="text-xs text-slate-500">USD</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            {usage?.aiUsage.totalTokens?.toLocaleString() || 0} tokens ({usage?.aiUsage.totalRequests || 0} calls)
          </div>
        </div>

        {/* Integrations */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Integration Ops</span>
            <Zap className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {usage ? usage.integrations.totalOperations : '-'}
            </span>
            <span className="text-xs text-slate-500">ops</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            {usage?.integrations.webhookDeliveries || 0} inbound webhooks
          </div>
        </div>
      </div>

      {/* Quota Gauges / Resource Limits */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-600" />
              Resource Quotas & Threshold Status
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live comparison of workspace consumption against administrator-defined ceilings.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {usage &&
            Object.values(usage.limits).map((lim) => {
              const pct = lim.percentage !== null ? Math.min(lim.percentage, 100) : 0;
              return (
                <div key={lim.metric} className="p-4 rounded-lg border border-slate-100 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">{lim.name}</span>
                    {getStatusBadge(lim)}
                  </div>

                  <div className="flex items-baseline justify-between text-xs text-slate-500">
                    <span>
                      Current: <strong className="text-slate-800">{lim.current.toLocaleString()}</strong> {lim.unit}
                    </span>
                    <span>
                      Limit:{' '}
                      <strong className="text-slate-800">
                        {lim.limit !== null ? `${lim.limit.toLocaleString()} ${lim.unit}` : 'Unlimited'}
                      </strong>
                    </span>
                  </div>

                  {lim.limit !== null && (
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${getBarColor(lim)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Admin Limits Configuration Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-600" />
            Workspace Resource Policy Configuration
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure soft resource boundaries for this workspace. Set fields to empty or 0 to allow unlimited usage.
          </p>
        </div>

        <form onSubmit={handleSaveLimits} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Max Total Workflows
              </label>
              <input
                type="number"
                value={limitsForm.maxWorkflows ?? ''}
                onChange={(e) =>
                  setLimitsForm({
                    ...limitsForm,
                    maxWorkflows: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="Unlimited"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Monthly Executions Limit
              </label>
              <input
                type="number"
                value={limitsForm.maxMonthlyExecutions ?? ''}
                onChange={(e) =>
                  setLimitsForm({
                    ...limitsForm,
                    maxMonthlyExecutions: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="Unlimited"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Max Concurrent Executions
              </label>
              <input
                type="number"
                value={limitsForm.maxConcurrentExecutions ?? ''}
                onChange={(e) =>
                  setLimitsForm({
                    ...limitsForm,
                    maxConcurrentExecutions: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="Unlimited"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Max Active Schedules
              </label>
              <input
                type="number"
                value={limitsForm.maxActiveSchedules ?? ''}
                onChange={(e) =>
                  setLimitsForm({
                    ...limitsForm,
                    maxActiveSchedules: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="Unlimited"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Monthly AI Cost Ceiling ($ USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={limitsForm.maxAiCostMonthlyUsd ?? ''}
                onChange={(e) =>
                  setLimitsForm({
                    ...limitsForm,
                    maxAiCostMonthlyUsd: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="Unlimited"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Monthly AI Token Limit
              </label>
              <input
                type="number"
                value={limitsForm.maxAiTokensMonthly ?? ''}
                onChange={(e) =>
                  setLimitsForm({
                    ...limitsForm,
                    maxAiTokensMonthly: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="Unlimited"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              disabled={saving}
              className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Update Quota Policies'}
            </Button>
            {saveSuccess && (
              <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Policies updated successfully
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Advisory Banner */}
      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 text-blue-900 text-xs space-y-1">
        <div className="font-semibold flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          FlowPilot Workspace Governance Notice
        </div>
        <p className="text-slate-600 leading-relaxed">
          AI cost metrics are advisory estimates computed from published LLM provider rates. Resource limits do not
          silently delete or disable user workflows when reached; they flag critical states and notify administrators to
          prevent service degradation.
        </p>
      </div>
    </div>
  );
}

