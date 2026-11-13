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
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  HardDrive,
  Info,
  Layers,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Table,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  IntegrationHealthSummary,
  IntegrationServiceMetric,
  WebhookDeliveryAnalyticsSummary,
} from '@/core/analytics/integrationAiTypes';

export default function IntegrationAnalyticsPage() {
  const [summary, setSummary] = useState<IntegrationHealthSummary | null>(null);
  const [services, setServices] = useState<IntegrationServiceMetric[]>([]);
  const [webhookAnalytics, setWebhookAnalytics] = useState<WebhookDeliveryAnalyticsSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'services' | 'webhooks'>('services');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewRes, webhooksRes] = await Promise.all([
        fetch('/api/v1/analytics/integrations/overview'),
        fetch('/api/v1/analytics/integrations/webhooks'),
      ]);

      const overviewJson = await overviewRes.json();
      const webhooksJson = await webhooksRes.json();

      if (overviewJson.success && overviewJson.data) {
        setSummary(overviewJson.data.summary);
        setServices(overviewJson.data.services || []);
      }

      if (webhooksJson.success && webhooksJson.data) {
        setWebhookAnalytics(webhooksJson.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load integration analytics.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getServiceIcon = (id: string) => {
    switch (id) {
      case 'slack':
        return <MessageSquare className="w-4 h-4 text-emerald-600" />;
      case 'telegram':
        return <Send className="w-4 h-4 text-sky-500" />;
      case 'smtp':
        return <Globe className="w-4 h-4 text-indigo-600" />;
      case 'googleSheets':
        return <Table className="w-4 h-4 text-emerald-700" />;
      default:
        return <Zap className="w-4 h-4 text-amber-600" />;
    }
  };

  const getCredentialBadge = (status: string) => {
    switch (status) {
      case 'valid':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            <span>Valid</span>
          </span>
        );
      case 'invalid':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            <span>Invalid</span>
          </span>
        );
      case 'untested':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <span>Untested</span>
          </span>
        );
      default:
        return (
          <span className="text-[10px] text-slate-400 italic">Not Required</span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Integration Health & Delivery Analytics
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span>Telemetry</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational success rates, latency distributions, failure root causes, and webhook delivery buffer metrics.
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
            className="px-3 py-1 rounded-md bg-white text-blue-600 shadow-2xs"
          >
            Integrations
          </Link>
          <Link
            href="/analytics/ai-usage"
            className="px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 transition-colors"
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
        {/* Total Operations */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Operations
            </span>
            <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Zap className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {summary?.totalOperations ?? 0}
            </span>
            <span className="text-xs text-slate-500">operations</span>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Inbound: <strong>{summary?.inboundWebhookDeliveriesCount ?? 0}</strong></span>
            <span>Outbound: <strong>{summary?.outboundOperationsCount ?? 0}</strong></span>
          </div>
        </div>

        {/* Success Rate */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Success Rate
            </span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {summary?.failureRatePercent !== null && summary?.failureRatePercent !== undefined
                ? `${(100 - summary.failureRatePercent).toFixed(1)}%`
                : 'N/A'}
            </span>
            <span className="text-xs text-slate-500">delivery & action</span>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span className="text-emerald-600 font-semibold">{summary?.successfulOperations ?? 0} passed</span>
            <span className="text-rose-600 font-semibold">{summary?.failedOperations ?? 0} failed</span>
          </div>
        </div>

        {/* Average Latency */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Response Latency
            </span>
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {summary?.meanDurationMs !== null && summary?.meanDurationMs !== undefined
                ? `${summary.meanDurationMs}ms`
                : 'N/A'}
            </span>
            <span className="text-xs text-slate-500">mean latency</span>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Median (p50): <strong>{summary?.medianDurationMs ?? 0}ms</strong></span>
            <span>Recorded: <strong>{summary?.totalOperations ?? 0}</strong></span>
          </div>
        </div>

        {/* Webhook Buffer Saturation */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Webhook Buffer
            </span>
            <span className="p-1.5 bg-slate-50 text-slate-600 rounded-lg">
              <HardDrive className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {webhookAnalytics?.totalDeliveriesSampled ?? 0} / 500
            </span>
            <span className="text-xs text-slate-500">slots</span>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Buffer limit: <strong>500 max</strong></span>
            <span className="text-slate-400 italic">FIFO retention</span>
          </div>
        </div>
      </div>

      {/* Retention Limitation Box */}
      <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 flex items-start gap-2.5 text-xs text-blue-900 shadow-xs">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong>Telemetry Notice:</strong> Webhook delivery telemetry is limited to the most recent 500 records in local storage. Outbound integration operations are extracted directly from executed workflow step traces. A valid credential format does not prove external third-party API availability.
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('services')}
          className={`pb-2.5 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'services'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Supported Integrations ({services.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('webhooks')}
          className={`pb-2.5 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'webhooks'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Inbound Webhook Deliveries ({webhookAnalytics?.totalDeliveriesSampled ?? 0})</span>
        </button>
      </div>

      {/* Tab 1: Supported Integrations Table */}
      {activeTab === 'services' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Integration Services Breakdown</h3>
              <p className="text-xs text-slate-500">
                Performance, failure rates, and credential verification status per integration
              </p>
            </div>
            <Link
              href="/credentials"
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
            >
              <span>Manage Credentials</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Integration</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Operations</th>
                  <th className="py-3 px-4">Success / Fail</th>
                  <th className="py-3 px-4">Failure Rate</th>
                  <th className="py-3 px-4">Mean Latency</th>
                  <th className="py-3 px-4">Credential</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {services.map((svc) => (
                  <tr key={svc.integrationId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <span className="p-1.5 bg-slate-100 rounded-lg">
                          {getServiceIcon(svc.integrationId)}
                        </span>
                        <div>
                          <span>{svc.integrationName}</span>
                          <span className="block text-[10px] text-slate-400 font-mono">
                            {svc.integrationId}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 capitalize font-mono text-[11px] text-slate-600">
                      <span className="px-1.5 py-0.5 bg-slate-100 rounded">
                        {svc.category}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono font-medium">
                      {svc.totalOperations > 0 ? (
                        <span>{svc.totalOperations} ops</span>
                      ) : (
                        <span className="text-slate-400 italic">0 recorded</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px]">
                      {svc.totalOperations > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600 font-semibold">{svc.successCount} passed</span>
                          {svc.failureCount > 0 && (
                            <span className="text-rose-600 font-semibold">/ {svc.failureCount} failed</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px]">
                      {svc.failureRatePercent !== null ? (
                        <span
                          className={`font-semibold ${
                            svc.failureRatePercent > 15
                              ? 'text-rose-600 font-bold'
                              : svc.failureRatePercent > 0
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {svc.failureRatePercent}%
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">N/A</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-slate-800">
                      {svc.meanDurationMs !== null ? `${svc.meanDurationMs}ms` : '—'}
                    </td>

                    <td className="py-3 px-4">{getCredentialBadge(svc.credentialStatus)}</td>

                    <td className="py-3 px-4">
                      {svc.totalOperations > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span>Active Telemetry</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200">
                          <span>No Traces Yet</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Webhook Deliveries Feed */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          {/* Status Code Distribution Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-2.5">
              HTTP Response Status Code Breakdown
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(webhookAnalytics?.statusCodesDistribution || {}).map(([code, count]) => {
                const is2xx = code.startsWith('2');
                const is4xx = code.startsWith('4');
                return (
                  <div
                    key={code}
                    className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 text-xs font-mono font-medium ${
                      is2xx
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : is4xx
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <span className="font-bold">{code}</span>
                    <span className="text-slate-500">({count} reqs)</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Deliveries Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Recent Webhook Inbound Deliveries</h3>
                <p className="text-xs text-slate-500">
                  Showing up to 50 most recent deliveries from the 500-slot local storage buffer
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Delivery ID</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">HTTP Code</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3">Latency</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Error / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {!webhookAnalytics?.recentDeliveries || webhookAnalytics.recentDeliveries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                        <span>No webhook deliveries recorded in this buffer.</span>
                      </td>
                    </tr>
                  ) : (
                    webhookAnalytics.recentDeliveries.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] font-medium text-slate-800">
                          {d.id}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              d.status === 'ACCEPTED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : d.status === 'REJECTED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold">
                          <span
                            className={
                              d.httpStatus < 300
                                ? 'text-emerald-700'
                                : d.httpStatus < 500
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }
                          >
                            {d.httpStatus}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{d.requestMethod}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">{d.durationMs}ms</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-500 max-w-xs truncate">
                          {d.errorReason ? (
                            <span className="text-rose-600 font-mono text-[10px]">{d.errorReason}</span>
                          ) : (
                            <span className="text-slate-400 italic">OK</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

