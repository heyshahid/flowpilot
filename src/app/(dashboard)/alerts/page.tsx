'use client';

import React, { useState, useEffect } from 'react';
import {
  Bell,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Sliders,
  Check,
  Radio,
  Activity,
  Layers,
  Zap,
  Sparkles,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  AlertRule,
  AlertIncident,
  AlertNotification,
  AlertCategory,
  AlertMetric,
  AlertOperator,
  AlertSeverity,
  IncidentStatus,
} from '@/core/alerts/types';

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState<'incidents' | 'rules' | 'notifications'>('incidents');
  const [incidents, setIncidents] = useState<AlertIncident[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<AlertIncident | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  // Filter states
  const [incidentStatusFilter, setIncidentStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // New Rule Form State
  const [ruleForm, setRuleForm] = useState<{
    name: string;
    description: string;
    category: AlertCategory;
    metric: AlertMetric;
    operator: AlertOperator;
    threshold: number;
    evaluationWindowMinutes: number;
    cooldownMinutes: number;
    severity: AlertSeverity;
    channels: Array<'in_app' | 'email' | 'webhook' | 'slack'>;
  }>({
    name: '',
    description: '',
    category: 'EXECUTION',
    metric: 'failure_rate',
    operator: 'gte',
    threshold: 25.0,
    evaluationWindowMinutes: 15,
    cooldownMinutes: 30,
    severity: 'WARNING',
    channels: ['in_app'],
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [incRes, rulesRes, notifRes] = await Promise.all([
        fetch('/api/v1/alerts/incidents'),
        fetch('/api/v1/alerts/rules'),
        fetch('/api/v1/alerts/notifications'),
      ]);

      if (incRes.ok) {
        const data = await incRes.json();
        if (data.success) setIncidents(data.items || []);
      }
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        if (data.success) setRules(data.data || []);
      }
      if (notifRes.ok) {
        const data = await notifRes.json();
        if (data.success) {
          setNotifications(data.items || []);
          setUnreadCount(data.unreadCount || 0);
        }
      }
    } catch (err) {
      console.error('Failed to load alert data:', err);
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
      const res = await fetch('/api/v1/alerts/rules/evaluate', { method: 'POST' });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setEvaluating(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/alerts/incidents/${id}/acknowledge`, {
        method: 'POST',
      });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleResolve = async () => {
    if (!selectedIncident) return;
    try {
      setResolving(true);
      const res = await fetch(`/api/v1/alerts/incidents/${selectedIncident.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: resolutionNotes }),
      });
      if (res.ok) {
        setSelectedIncident(null);
        setResolutionNotes('');
        await loadData();
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setResolving(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleForm),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setRuleForm({
          name: '',
          description: '',
          category: 'EXECUTION',
          metric: 'failure_rate',
          operator: 'gte',
          threshold: 25.0,
          evaluationWindowMinutes: 15,
          cooldownMinutes: 30,
          severity: 'WARNING',
          channels: ['in_app'],
        });
        await loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create rule');
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this alert rule?')) return;
    try {
      const res = await fetch(`/api/v1/alerts/rules/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleToggleRule = async (rule: AlertRule) => {
    try {
      const res = await fetch(`/api/v1/alerts/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/v1/alerts/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const filteredIncidents = incidents.filter((inc) => {
    if (incidentStatusFilter !== 'ALL' && inc.status !== incidentStatusFilter) return false;
    if (categoryFilter !== 'ALL' && inc.category !== categoryFilter) return false;
    return true;
  });

  const getSeverityBadge = (severity: AlertSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-700">
            <ShieldAlert className="w-3 h-3" /> Critical
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700">
            <AlertTriangle className="w-3 h-3" /> Warning
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
            Info
          </span>
        );
    }
  };

  const getStatusBadge = (status: IncidentStatus) => {
    switch (status) {
      case 'TRIGGERED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-500 text-white animate-pulse">
            Triggered
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
            Acknowledged
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
            Resolved
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-rose-600" />
            Alerts & Incident Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Automated threshold evaluation, proactive operational incident detection, and delivery telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEvaluate}
            disabled={evaluating}
            className="flex items-center gap-1.5"
          >
            <Play className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
            {evaluating ? 'Evaluating...' : 'Evaluate Rules'}
          </Button>

          <Button
            onClick={() => setShowCreateModal(true)}
            size="sm"
            className="bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New Alert Rule
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-200">
        <button
          onClick={() => setActiveTab('incidents')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'incidents'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Active Incidents ({incidents.filter((i) => i.status !== 'RESOLVED').length})
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'rules'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Alert Rules ({rules.length})
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'notifications'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Bell className="w-4 h-4" />
          Notifications {unreadCount > 0 && <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px]">{unreadCount}</span>}
        </button>
      </div>

      {/* TAB 1: INCIDENTS */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          {/* Incident Filters */}
          <div className="flex items-center gap-3">
            <select
              value={incidentStatusFilter}
              onChange={(e) => setIncidentStatusFilter(e.target.value)}
              className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
            >
              <option value="ALL">All Statuses</option>
              <option value="TRIGGERED">Triggered Only</option>
              <option value="ACKNOWLEDGED">Acknowledged Only</option>
              <option value="RESOLVED">Resolved Only</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
            >
              <option value="ALL">All Categories</option>
              <option value="EXECUTION">Execution</option>
              <option value="SCHEDULING">Scheduling</option>
              <option value="INTEGRATION">Integration</option>
              <option value="AI_USAGE">AI Usage</option>
              <option value="WORKSPACE_USAGE">Workspace Usage</option>
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="ml-auto text-xs flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          {filteredIncidents.length === 0 ? (
            <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">No active incidents found</p>
              <p className="text-xs text-slate-500">All evaluated rules and system metrics are within normal thresholds.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className={`p-4 rounded-xl border bg-white shadow-xs space-y-3 transition-all ${
                    inc.status === 'TRIGGERED'
                      ? 'border-rose-300 ring-1 ring-rose-200'
                      : inc.status === 'ACKNOWLEDGED'
                      ? 'border-amber-200'
                      : 'border-slate-200 opacity-80'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(inc.status)}
                      {getSeverityBadge(inc.severity)}
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {inc.category}
                      </span>
                      <h3 className="font-bold text-sm text-slate-900">{inc.ruleName}</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      {inc.status === 'TRIGGERED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAcknowledge(inc.id)}
                          className="text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-50"
                        >
                          Acknowledge
                        </Button>
                      )}

                      {inc.status !== 'RESOLVED' && (
                        <Button
                          size="sm"
                          onClick={() => setSelectedIncident(inc)}
                          className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-700">{inc.message}</p>

                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    <span>
                      Triggered: <strong>{new Date(inc.triggeredAt).toLocaleString()}</strong>
                    </span>
                    <span>
                      Occurrences: <strong>{inc.occurrenceCount}</strong>
                    </span>
                    {inc.acknowledgedBy && (
                      <span>
                        Ack by: <strong>{inc.acknowledgedBy}</strong> ({new Date(inc.acknowledgedAt!).toLocaleTimeString()})
                      </span>
                    )}
                    {inc.resolvedBy && (
                      <span className="text-emerald-700">
                        Resolved by: <strong>{inc.resolvedBy}</strong> ({new Date(inc.resolvedAt!).toLocaleTimeString()})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ALERT RULES */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Rule Name & Category</th>
                  <th className="px-4 py-3">Condition</th>
                  <th className="px-4 py-3">Evaluation & Cooldown</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Channels</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{rule.name}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="font-semibold uppercase text-slate-600">{rule.category}</span>
                        <span>•</span>
                        <span>{rule.description || 'No description'}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3 font-mono text-[11px] text-slate-700">
                      {rule.metric} {rule.operator} {rule.threshold}
                    </td>

                    <td className="px-4 py-3 text-slate-600 text-[11px]">
                      Window: {rule.evaluationWindowMinutes}m / Cooldown: {rule.cooldownMinutes}m
                    </td>

                    <td className="px-4 py-3">{getSeverityBadge(rule.severity)}</td>

                    <td className="px-4 py-3 text-[11px] text-slate-600">
                      {rule.channels.join(', ')}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleRule(rule)}
                          className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                            rule.enabled
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          title="Delete Rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Notification delivery logs and audit dispatch history.
            </span>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllRead}
                className="text-xs h-7 flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Mark All as Read
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No notification records dispatched yet.
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                    !notif.read ? 'bg-rose-50/30' : 'bg-white'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getSeverityBadge(notif.severity)}
                      <span className="font-bold text-xs text-slate-900">{notif.title}</span>
                      <span className="text-[10px] text-slate-400 uppercase font-mono">
                        via {notif.channel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{notif.message}</p>
                    {notif.deliveryError && (
                      <p className="text-[11px] text-amber-700 italic">
                        Notice: {notif.deliveryError}
                      </p>
                    )}
                    <span className="text-[10px] text-slate-400 block">
                      {new Date(notif.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        notif.deliveryStatus === 'DELIVERED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : notif.deliveryStatus === 'NOT_CONFIGURED'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {notif.deliveryStatus}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* CREATE RULE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-rose-600" /> Create Configurable Alert Rule
            </h2>

            <form onSubmit={handleCreateRule} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                  placeholder="e.g. Critical Failure Spike"
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={ruleForm.category}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, category: e.target.value as AlertCategory })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="EXECUTION">Execution</option>
                    <option value="SCHEDULING">Scheduling</option>
                    <option value="INTEGRATION">Integration</option>
                    <option value="AI_USAGE">AI Usage</option>
                    <option value="WORKSPACE_USAGE">Workspace Usage</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Metric</label>
                  <select
                    value={ruleForm.metric}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, metric: e.target.value as AlertMetric })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white font-mono"
                  >
                    <option value="failure_rate">failure_rate (%)</option>
                    <option value="consecutive_failures">consecutive_failures</option>
                    <option value="execution_duration_p95">execution_duration_p95 (ms)</option>
                    <option value="stuck_executions">stuck_executions</option>
                    <option value="missed_schedules">missed_schedules</option>
                    <option value="schedule_failure_rate">schedule_failure_rate (%)</option>
                    <option value="integration_failure_rate">integration_failure_rate (%)</option>
                    <option value="webhook_error_rate">webhook_error_rate (%)</option>
                    <option value="monthly_cost_usd">monthly_cost_usd ($)</option>
                    <option value="monthly_tokens">monthly_tokens</option>
                    <option value="workflow_limit_pct">workflow_limit_pct (%)</option>
                    <option value="execution_limit_pct">execution_limit_pct (%)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Operator</label>
                  <select
                    value={ruleForm.operator}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, operator: e.target.value as AlertOperator })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white font-mono"
                  >
                    <option value="gte">&gt;= (Greater or Equal)</option>
                    <option value="gt">&gt; (Greater Than)</option>
                    <option value="lte">&lt;= (Less or Equal)</option>
                    <option value="lt">&lt; (Less Than)</option>
                    <option value="eq">= (Equal To)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Threshold</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={ruleForm.threshold}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, threshold: Number(e.target.value) })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Window (Mins)</label>
                  <input
                    type="number"
                    value={ruleForm.evaluationWindowMinutes}
                    onChange={(e) =>
                      setRuleForm({
                        ...ruleForm,
                        evaluationWindowMinutes: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cooldown (Mins)</label>
                  <input
                    type="number"
                    value={ruleForm.cooldownMinutes}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, cooldownMinutes: Number(e.target.value) })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Severity</label>
                  <select
                    value={ruleForm.severity}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, severity: e.target.value as AlertSeverity })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="WARNING">Warning</option>
                    <option value="INFO">Info</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                >
                  Save Alert Rule
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESOLVE INCIDENT MODAL */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Resolve Operational Incident
            </h2>

            <p className="text-xs text-slate-600">
              Marking <strong>{selectedIncident.ruleName}</strong> as resolved. You can optionally record
              remediation notes.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Resolution Notes
              </label>
              <textarea
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="e.g. Fixed database connection pool limit, failure rate returned to normal."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIncident(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleResolve}
                disabled={resolving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {resolving ? 'Resolving...' : 'Confirm Resolution'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

