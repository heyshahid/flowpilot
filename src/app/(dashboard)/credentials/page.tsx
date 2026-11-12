'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Key,
  ShieldCheck,
  Lock,
  Plus,
  RotateCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  X,
  Mail,
  MessageSquare,
  Bot,
  FileSpreadsheet,
  Globe,
  Layers,
} from 'lucide-react';
import { CredentialRecord } from '@/lib/storage/credentialStore';

const ICON_MAP: Record<string, React.ElementType> = {
  smtp: Mail,
  slack: MessageSquare,
  telegram: Bot,
  google_sheets: FileSpreadsheet,
  http: Globe,
};

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [integrationId, setIntegrationId] = useState('smtp');
  const [formFields, setFormFields] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/credentials');
      if (res.ok) {
        const data = await res.json();
        setCredentials(data.credentials || []);
      }
    } catch (err) {
      console.error('Failed to load credentials:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const handleTestCredential = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/v1/credentials/${id}/test`, { method: 'POST' });
      if (res.ok) {
        await fetchCredentials();
      }
    } catch (err) {
      console.error('Failed to test credential:', err);
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteCredential = async (id: string) => {
    if (!confirm('Are you sure you want to delete this encrypted credential?')) return;
    try {
      const res = await fetch(`/api/v1/credentials/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchCredentials();
      }
    } catch (err) {
      console.error('Failed to delete credential:', err);
    }
  };

  const handleCreateCredential = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/v1/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          integrationId,
          type: integrationId === 'smtp' ? 'smtp' : 'api_key',
          data: formFields,
        }),
      });

      if (res.ok) {
        setIsAddOpen(false);
        setName('');
        setFormFields({});
        await fetchCredentials();
      }
    } catch (err) {
      console.error('Failed to create credential:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Encrypted Credential Vault
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Store API keys, SMTP passwords, OAuth refresh tokens, and bot secrets safely encrypted with AES-256-GCM.
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setIsAddOpen(true)}
        >
          Add Credential
        </Button>
      </div>

      {/* Security Policy Banner */}
      <div className="p-4 rounded-xl border border-blue-200/80 bg-blue-50/50 flex items-start gap-3">
        <Lock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 leading-relaxed">
          <span className="font-bold">Zero-Exposure Security Policy:</span> Stored credentials are never returned in cleartext to the client browser. They are only decrypted in-memory inside backend workers using server-side AES-256-GCM master keys.
        </div>
      </div>

      {/* Credentials Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Credential Name</th>
              <th className="py-3 px-4">Integration</th>
              <th className="py-3 px-4">Masked Parameters</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Last Verified</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {credentials.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                  No credentials in vault yet. Click "Add Credential" to create one.
                </td>
              </tr>
            )}

            {credentials.map((cred) => {
              const Icon = (cred.integrationId && ICON_MAP[cred.integrationId]) || Layers;
              return (
                <tr key={cred.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-900">{cred.name}</div>
                        <div className="text-[11px] font-mono text-slate-400">{cred.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-slate-700 capitalize">
                    {(cred.integrationId || 'generic').replace('_', ' ')}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                    {Object.entries(cred.maskedPreview || {})
                      .slice(0, 2)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' • ')}
                  </td>
                  <td className="py-3 px-4">
                    {cred.status === 'valid' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        VALID
                      </span>
                    ) : cred.status === 'invalid' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        <XCircle className="w-3 h-3 text-rose-600" />
                        FAILED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                        UNTESTED
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-400">
                    {cred.lastVerifiedAt
                      ? new Date(cred.lastVerifiedAt).toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      onClick={() => handleTestCredential(cred.id)}
                      disabled={testingId === cred.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors"
                    >
                      <RotateCw
                        className={`w-3.5 h-3.5 text-slate-500 ${
                          testingId === cred.id ? 'animate-spin text-blue-600' : ''
                        }`}
                      />
                      <span>Test</span>
                    </button>

                    <button
                      onClick={() => handleDeleteCredential(cred.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Credential Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Add Credential to Vault</h3>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Credential Label
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production Slack Bot"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Integration Service
                </label>
                <select
                  value={integrationId}
                  onChange={(e) => {
                    setIntegrationId(e.target.value);
                    setFormFields({});
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
                >
                  <option value="smtp">Transactional Email (SMTP)</option>
                  <option value="slack">Slack Messaging (Bot Token)</option>
                  <option value="telegram">Telegram Bot API</option>
                  <option value="google_sheets">Google Sheets (OAuth2 / Service Account)</option>
                  <option value="http">HTTP REST API (Bearer Token / API Key)</option>
                </select>
              </div>

              {/* Dynamic Inputs Based on Integration */}
              {integrationId === 'smtp' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">SMTP Host</label>
                    <input
                      type="text"
                      placeholder="smtp.sendgrid.net"
                      value={formFields.host || ''}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, host: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Port</label>
                      <input
                        type="number"
                        placeholder="587"
                        value={formFields.port || ''}
                        onChange={(e) => setFormFields((prev) => ({ ...prev, port: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                      <input
                        type="text"
                        placeholder="apikey"
                        value={formFields.user || ''}
                        onChange={(e) => setFormFields((prev) => ({ ...prev, user: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Password / API Key</label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={formFields.password || ''}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, password: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Default Sender Email</label>
                    <input
                      type="email"
                      placeholder="alerts@flowpilot.dev"
                      value={formFields.senderEmail || ''}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, senderEmail: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                    />
                  </div>
                </>
              )}

              {integrationId === 'slack' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Bot User OAuth Token</label>
                    <input
                      type="password"
                      placeholder="xoxb-••••••••••••"
                      value={formFields.botToken || ''}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, botToken: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Default Channel</label>
                    <input
                      type="text"
                      placeholder="#general"
                      value={formFields.defaultChannel || ''}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, defaultChannel: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                    />
                  </div>
                </>
              )}

              {integrationId === 'telegram' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Telegram Bot Token</label>
                    <input
                      type="password"
                      placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      value={formFields.botToken || ''}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, botToken: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Default Chat ID</label>
                    <input
                      type="text"
                      placeholder="-100123456789"
                      value={formFields.defaultChatId || ''}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, defaultChatId: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                    />
                  </div>
                </>
              )}

              {integrationId === 'google_sheets' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">OAuth Client ID</label>
                    <input
                      type="text"
                      placeholder="xxxxx.apps.googleusercontent.com"
                      value={formFields.clientId || ''}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, clientId: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Client Secret</label>
                    <input
                      type="password"
                      placeholder="GOCSPX-••••••••"
                      value={formFields.clientSecret || ''}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, clientSecret: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Refresh Token</label>
                    <input
                      type="password"
                      placeholder="1//04••••••••"
                      value={formFields.refreshToken || ''}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, refreshToken: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                    />
                  </div>
                </>
              )}

              {integrationId === 'http' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Bearer Token / API Key</label>
                    <input
                      type="password"
                      placeholder="Bearer token or API key"
                      value={formFields.token || ''}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, token: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Base API URL (Optional)</label>
                    <input
                      type="text"
                      placeholder="https://api.acme.com"
                      value={formFields.baseUrl || ''}
                      onChange={(e) => setFormFields((prev) => ({ ...prev, baseUrl: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-slate-50/50"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4 bg-slate-50">
              <Button variant="outline" size="sm" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateCredential}
                isLoading={isSaving}
              >
                Encrypt & Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
