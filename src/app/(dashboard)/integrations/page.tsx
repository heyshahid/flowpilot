'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Webhook,
  Globe,
  Mail,
  FileSpreadsheet,
  MessageSquare,
  Bot,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RotateCw,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Lock,
  Layers,
  X,
  AlertCircle,
} from 'lucide-react';
import { IntegrationDefinition } from '@/core/integrations/types';
import { WebhookConfig, WebhookDeliveryRecord } from '@/lib/storage/webhookStore';

const ICON_MAP: Record<string, React.ElementType> = {
  Webhook,
  Globe,
  Mail,
  FileSpreadsheet,
  MessageSquare,
  Bot,
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'connected' | 'communication' | 'storage' | 'webhooks'>('all');

  // Modal State
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationDefinition | null>(null);
  const [credentialName, setCredentialName] = useState('');
  const [credentialForm, setCredentialForm] = useState<Record<string, any>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Webhook Deliveries Modal
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookConfig | null>(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDeliveryRecord[]>([]);
  const [isDeliveriesOpen, setIsDeliveriesOpen] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [intRes, whRes] = await Promise.all([
        fetch('/api/v1/integrations'),
        fetch('/api/v1/webhooks'),
      ]);

      if (intRes.ok) {
        const intData = await intRes.json();
        setIntegrations(intData.integrations || []);
      }

      if (whRes.ok) {
        const whData = await whRes.json();
        setWebhooks(whData.webhooks || []);
      }
    } catch (err) {
      console.error('Failed to load integrations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'webhooks' || tab === 'connected' || tab === 'communication' || tab === 'storage') {
        setActiveTab(tab as any);
      }
    }
  }, [fetchData]);

  const handleOpenConnect = (integ: IntegrationDefinition) => {
    setSelectedIntegration(integ);
    setCredentialName(`${integ.name} Account`);
    const initialForm: Record<string, any> = {};
    for (const f of integ.credentialFields) {
      initialForm[f.name] = '';
    }
    setCredentialForm(initialForm);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!selectedIntegration) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/v1/integrations/${selectedIntegration.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: credentialForm }),
      });
      const data = await res.json();
      setTestResult(data.testResult || { ok: false, message: 'Connection test failed.' });
    } catch (err: unknown) {
      setTestResult({ ok: false, message: (err as Error).message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveCredential = async () => {
    if (!selectedIntegration || !credentialName.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/v1/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: credentialName.trim(),
          integrationId: selectedIntegration.id,
          type: selectedIntegration.authType === 'smtp' ? 'smtp' : 'api_key',
          data: credentialForm,
        }),
      });

      if (res.ok) {
        setSelectedIntegration(null);
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to save credential:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyUrl = (token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const url = `${origin}/api/v1/webhooks/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleViewDeliveries = async (wh: WebhookConfig) => {
    setSelectedWebhook(wh);
    setIsDeliveriesOpen(true);
    try {
      const res = await fetch(`/api/v1/webhooks/${wh.token}/deliveries`);
      if (res.ok) {
        const data = await res.json();
        setWebhookDeliveries(data.deliveries || []);
      }
    } catch (err) {
      console.error('Failed to load deliveries:', err);
    }
  };

  const filteredIntegrations = integrations.filter((integ) => {
    if (activeTab === 'connected') return integ.connected;
    if (activeTab === 'communication') return integ.category === 'communication';
    if (activeTab === 'storage') return integ.category === 'storage';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Integration Hub & Connectors
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage authenticated connections for APIs, SMTP email, Google Sheets, Slack, Telegram, and production webhooks.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          isLoading={loading}
          icon={<RotateCw className="w-3.5 h-3.5 text-slate-500" />}
        >
          Refresh Connectors
        </Button>
      </div>

      {/* Security Banner */}
      <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/50 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-900 leading-relaxed">
          <span className="font-bold">Zero-Trust Network Interceptor:</span> All outbound HTTP, webhook, and provider calls automatically enforce SSRF protection against private subnets (RFC 1918), loopback interfaces, and cloud metadata endpoints (`169.254.169.254`). Credentials remain encrypted with AES-256-GCM.
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: 'all', label: 'All Connectors' },
          { id: 'connected', label: 'Connected' },
          { id: 'communication', label: 'Email & Messaging' },
          { id: 'storage', label: 'Spreadsheets & Storage' },
          { id: 'webhooks', label: 'Production Webhooks' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Webhooks Section */}
      {activeTab === 'webhooks' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Active Production Webhook Ingestion Endpoints ({webhooks.length})
            </h2>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Webhook Name</th>
                  <th className="py-3 px-4">Associated Workflow</th>
                  <th className="py-3 px-4">Security / Auth</th>
                  <th className="py-3 px-4">Deliveries</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {webhooks.map((wh) => (
                  <tr key={wh.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-xs text-slate-900">{wh.name}</div>
                      <div className="font-mono text-[11px] text-blue-600 mt-0.5 truncate max-w-xs">
                        /api/v1/webhooks/{wh.token}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-700">
                      {wh.workflowName}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 font-mono">
                      {wh.authType.toUpperCase()}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 font-mono">
                      {wh.deliveryCount} events
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ACTIVE
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleCopyUrl(wh.token)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors"
                      >
                        {copiedToken === wh.token ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                            <span>Copy URL</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleViewDeliveries(wh)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                      >
                        Deliveries
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Integrations Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredIntegrations.map((item) => {
            const Icon = ICON_MAP[item.icon] || Layers;
            return (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs hover:border-slate-300 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                      <Icon className="w-5 h-5" />
                    </div>
                    {item.connected ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        Ready to Connect
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-sm text-slate-900">{item.name}</h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    {item.description}
                  </p>

                  <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-slate-400">
                    <span>Auth: {item.authType.toUpperCase()}</span>
                    <span>•</span>
                    <span>v{item.version}</span>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">
                    {item.credentialsCount || 0} Vaulted Credentials
                  </span>
                  <Button
                    variant={item.connected ? 'outline' : 'primary'}
                    size="sm"
                    onClick={() => handleOpenConnect(item)}
                  >
                    {item.connected ? 'Manage / Re-test' : 'Connect'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Connect Modal */}
      {selectedIntegration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  Configure {selectedIntegration.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedIntegration(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Credential Name / Label
                </label>
                <input
                  type="text"
                  value={credentialName}
                  onChange={(e) => setCredentialName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
                  placeholder="Production Account"
                />
              </div>

              {selectedIntegration.credentialFields.map((field) => (
                <div key={field.name}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {field.label} {field.required && <span className="text-rose-500">*</span>}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      value={credentialForm[field.name] || ''}
                      onChange={(e) =>
                        setCredentialForm((prev) => ({ ...prev, [field.name]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
                    >
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={credentialForm[field.name] || ''}
                      onChange={(e) =>
                        setCredentialForm((prev) => ({ ...prev, [field.name]: e.target.value }))
                      }
                      placeholder={field.placeholder}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
                    />
                  )}
                  {field.description && (
                    <p className="mt-1 text-[11px] text-slate-400">{field.description}</p>
                  )}
                </div>
              ))}

              {/* Test Result Message */}
              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    testResult.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                isLoading={isTesting}
                icon={<RotateCw className="w-3.5 h-3.5" />}
              >
                Test Connection
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIntegration(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveCredential}
                  isLoading={isSaving}
                >
                  Save to Vault
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Deliveries Modal */}
      {isDeliveriesOpen && selectedWebhook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Deliveries: {selectedWebhook.name}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Token: {selectedWebhook.token}
                </p>
              </div>
              <button
                onClick={() => setIsDeliveriesOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
              {webhookDeliveries.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No webhook delivery events recorded yet.
                </div>
              ) : (
                webhookDeliveries.map((deliv) => (
                  <div
                    key={deliv.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 text-xs space-y-1.5 font-mono"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-slate-800">
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px]">
                          {deliv.requestMethod}
                        </span>
                        <span>HTTP {deliv.httpStatus}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-sans">
                        {new Date(deliv.timestamp).toLocaleTimeString()} • {deliv.durationMs}ms
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 truncate">
                      Payload: {deliv.payloadPreview}
                    </div>

                    {deliv.errorReason && (
                      <div className="text-[11px] text-rose-600 font-sans font-medium">
                        Error: {deliv.errorReason}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 text-right">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeliveriesOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
