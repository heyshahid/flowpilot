'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  ExternalLink,
  HelpCircle,
  Info,
  Layers,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  AIModelUsageMetric,
  AIProviderUsageMetric,
  AITimeSeriesPoint,
  AIUsageAnalyticsOverview,
} from '@/core/analytics/integrationAiTypes';

export default function AIUsageAnalyticsPage() {
  const [overview, setOverview] = useState<AIUsageAnalyticsOverview | null>(null);
  const [providers, setProviders] = useState<AIProviderUsageMetric[]>([]);
  const [models, setModels] = useState<AIModelUsageMetric[]>([]);
  const [trends, setTrends] = useState<AITimeSeriesPoint[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewRes, providersRes, modelsRes, trendsRes] = await Promise.all([
        fetch('/api/v1/analytics/ai-usage/overview'),
        fetch('/api/v1/analytics/ai-usage/providers'),
        fetch(`/api/v1/analytics/ai-usage/models${selectedProvider ? `?provider=${selectedProvider}` : ''}`),
        fetch('/api/v1/analytics/ai-usage/trends'),
      ]);

      const overviewJson = await overviewRes.json();
      const providersJson = await providersRes.json();
      const modelsJson = await modelsRes.json();
      const trendsJson = await trendsRes.json();

      if (overviewJson.success && overviewJson.data) setOverview(overviewJson.data);
      if (providersJson.success && providersJson.data) setProviders(providersJson.data.items || []);
      if (modelsJson.success && modelsJson.data) setModels(modelsJson.data.items || []);
      if (trendsJson.success && trendsJson.data) setTrends(trendsJson.data.points || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load AI usage analytics.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedProvider]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              AI Usage & Versioned Cost Analytics
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <span>Token Observability</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Model token consumption, request latency distributions, and reproducible cost estimates backed by versioned pricing.
          </p>
        </div>

        {/* Analytics Sub-Nav */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <Link
            href="/analytics"
            className="px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 transition-colors"
          >
            Overview
          </Link>
          <Link
            href="/analytics/integrations"
            className="px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 transition-colors"
          >
            Integrations
          </Link>
          <Link
            href="/analytics/ai-usage"
            className="px-3 py-1 rounded-md bg-white text-blue-600 shadow-2xs"
          >
            AI Usage & Cost
          </Link>
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="p-1 rounded-md text-slate-500 hover:bg-white hover:text-slate-700 transition-colors ml-1"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Requests */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total AI Requests
            </span>
            <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Bot className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {overview?.totalRequests ?? 0}
            </span>
            <span className="text-xs text-slate-500">requests</span>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Sample size: <strong>{overview?.sampleSize ?? 0}</strong></span>
            <span>Providers: <strong>{providers.length}</strong></span>
          </div>
        </div>

        {/* Token Volume */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Token Volume
            </span>
            <span className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
              <Brain className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {overview?.totalTokens ? overview.totalTokens.toLocaleString() : '0'}
            </span>
            <span className="text-xs text-slate-500">tokens</span>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Prompt: <strong>{overview?.totalPromptTokens.toLocaleString() ?? 0}</strong></span>
            <span>Completion: <strong>{overview?.totalCompletionTokens.toLocaleString() ?? 0}</strong></span>
          </div>
        </div>

        {/* Average Latency */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Inference Latency
            </span>
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {overview?.averageLatencyMs !== null && overview?.averageLatencyMs !== undefined
                ? `${overview.averageLatencyMs}ms`
                : 'N/A'}
            </span>
            <span className="text-xs text-slate-500">mean latency</span>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Median (p50): <strong>{overview?.medianLatencyMs ?? 0}ms</strong></span>
            <span className="text-slate-400">Response time</span>
          </div>
        </div>

        {/* Estimated Cost */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <span>Estimated Cost</span>
              <span title="Advisory estimate based on versioned token rates. Not an invoice.">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
              </span>
            </span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Coins className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700 font-mono">
              {overview?.estimatedTotalCostUsd !== null && overview?.estimatedTotalCostUsd !== undefined
                ? `$${overview.estimatedTotalCostUsd.toFixed(4)}`
                : 'N/A'}
            </span>
            <span className="text-xs text-slate-400">USD est.</span>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span className="text-emerald-700 font-medium">Historical pricing</span>
            {overview?.hasMissingPricingTiers && (
              <span className="text-amber-600 font-semibold">{overview.unpricedRequestsCount} unpriced</span>
            )}
          </div>
        </div>
      </div>

      {/* Advisory Cost Disclaimer Banner */}
      <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900 shadow-xs">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <strong>Financial Reporting Notice:</strong> Cost figures are calculated estimates resolved using versioned per-million token pricing tiers active on the specific date of each request. They are advisory operational projections and do not constitute confirmed monthly invoices from external providers.
        </div>
      </div>

      {/* Provider Breakdown Cards */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-blue-600" />
          <span>Provider Breakdown</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {providers.length === 0 ? (
            <div className="col-span-4 p-8 bg-white border border-slate-200 rounded-xl text-center text-slate-400 text-xs">
              <Bot className="w-6 h-6 mx-auto mb-2 text-slate-300" />
              <span>No AI provider usage recorded in this workspace.</span>
            </div>
          ) : (
            providers.map((p) => (
              <div
                key={p.provider}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-slate-900">{p.providerName}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 font-mono">
                      {p.provider}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-600 mt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Requests:</span>
                      <span className="font-semibold text-slate-800">{p.requestCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tokens:</span>
                      <span className="font-mono">{p.totalTokens.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Mean Latency:</span>
                      <span className="font-mono">{p.averageLatencyMs ? `${p.averageLatencyMs}ms` : '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400 text-[11px]">Estimated Cost:</span>
                  <span className="font-bold font-mono text-emerald-700">
                    {p.estimatedCostUsd !== null ? `$${p.estimatedCostUsd.toFixed(5)}` : 'N/A'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Model Performance & Pricing Registry Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Model Performance & Versioned Pricing</h3>
            <p className="text-xs text-slate-500">
              Aggregated token consumption, latency, and resolved versioned pricing rates per model
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Filter Provider:</span>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="py-1 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden text-slate-700 font-medium"
            >
              <option value="">All Providers</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
              <option value="anthropic">Anthropic</option>
              <option value="groq">Groq</option>
              <option value="mock">Local Mock</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Model</th>
                <th className="py-3 px-4">Provider</th>
                <th className="py-3 px-4">Requests</th>
                <th className="py-3 px-4">Total Tokens (Prompt / Comp)</th>
                <th className="py-3 px-4">Pricing Tier</th>
                <th className="py-3 px-4">Rates (In / Out per 1M)</th>
                <th className="py-3 px-4">Estimated Cost</th>
                <th className="py-3 px-4">Mean Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {models.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    <span>No models recorded for the selected filter.</span>
                  </td>
                </tr>
              ) : (
                models.map((m) => (
                  <tr key={`${m.provider}-${m.model}`} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900 font-mono">
                      {m.model}
                    </td>

                    <td className="py-3 px-4 capitalize font-mono text-[11px] text-slate-600">
                      <span className="px-1.5 py-0.5 bg-slate-100 rounded">
                        {m.provider}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono font-medium">
                      {m.requestCount}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px]">
                      <div>
                        <span className="font-semibold text-slate-900">{m.totalTokens.toLocaleString()}</span>
                        <span className="text-slate-400 text-[10px] block">
                          {m.promptTokens.toLocaleString()} in / {m.completionTokens.toLocaleString()} out
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px]">
                      {m.pricingVersion ? (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-semibold">
                          {m.pricingVersion}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Unversioned</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                      {m.inputPricePerMillion !== undefined && m.outputPricePerMillion !== undefined ? (
                        <span>${m.inputPricePerMillion} / ${m.outputPricePerMillion}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] font-semibold text-emerald-700">
                      {m.estimatedCostUsd !== null ? `$${m.estimatedCostUsd.toFixed(5)}` : 'N/A'}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-slate-800">
                      {m.averageLatencyMs ? `${m.averageLatencyMs}ms` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

