'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Calendar,
  Clock,
  Play,
  Plus,
  RotateCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Pause,
  Layers,
  Globe,
  X,
  Repeat,
  AlertCircle,
} from 'lucide-react';
import { ScheduleConfig } from '@/core/scheduler/types';
import { WorkflowRecord } from '@/lib/storage/workflowStore';

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  // Form State
  const [workflowId, setWorkflowId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'cron' | 'interval' | 'one_time'>('cron');
  const [cronExpression, setCronExpression] = useState('0 9 * * *');
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [targetDateTime, setTargetDateTime] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [schedRes, wfRes] = await Promise.all([
        fetch('/api/v1/schedules'),
        fetch('/api/v1/workflows'),
      ]);

      if (schedRes.ok) {
        const data = await schedRes.json();
        setSchedules(data.schedules || []);
      }
      if (wfRes.ok) {
        const data = await wfRes.json();
        setWorkflows(data.workflows || []);
        if (data.workflows?.length > 0 && !workflowId) {
          setWorkflowId(data.workflows[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load schedules:', err);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTriggerNow = async (id: string) => {
    setTriggeringId(id);
    try {
      const res = await fetch(`/api/v1/schedules/${id}/trigger`, { method: 'POST' });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to trigger schedule:', err);
    } finally {
      setTriggeringId(null);
    }
  };

  const handleToggleStatus = async (sched: ScheduleConfig) => {
    const nextStatus = sched.status === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`/api/v1/schedules/${sched.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    try {
      const res = await fetch(`/api/v1/schedules/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to delete schedule:', err);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload: any = {
        workflowId,
        name,
        description,
        type,
        timezone,
      };

      if (type === 'cron') payload.cronExpression = cronExpression;
      if (type === 'interval') payload.intervalMinutes = Number(intervalMinutes);
      if (type === 'one_time') payload.targetDateTime = targetDateTime;

      const res = await fetch('/api/v1/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsAddOpen(false);
        setName('');
        setDescription('');
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to save schedule:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Scheduled Automations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Trigger recurring workflows with timezone-aware cron expressions and interval timers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
            <RotateCw className="w-4 h-4 text-slate-500" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setIsAddOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Schedule
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50/70 border border-blue-200/60 text-blue-900 text-xs leading-relaxed">
        <Clock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold text-blue-800">Durable Distributed Scheduler:</span> All scheduled
          workflows survive backend worker restarts, auto-catch up missed runs if enabled, and enforce concurrent
          execution debouncing.
        </div>
      </div>

      {/* Schedules Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Schedule / Workflow</th>
              <th className="py-3 px-4">Cadence</th>
              <th className="py-3 px-4">Timezone</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Next Run</th>
              <th className="py-3 px-4">Runs</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {schedules.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                  No scheduled automations created yet. Click "New Schedule" to create one.
                </td>
              </tr>
            )}

            {schedules.map((sched) => (
              <tr key={sched.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900">{sched.name}</div>
                      <div className="text-[11px] text-slate-400">{sched.workflowName}</div>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 font-mono text-xs text-slate-700">
                  {sched.type === 'cron' ? (
                    <span className="inline-flex items-center gap-1">
                      <Repeat className="w-3 h-3 text-slate-400" />
                      {sched.cronExpression}
                    </span>
                  ) : sched.type === 'interval' ? (
                    `Every ${sched.intervalMinutes}m`
                  ) : (
                    `Once (${new Date(sched.targetDateTime || '').toLocaleString()})`
                  )}
                </td>
                <td className="py-3 px-4 text-xs font-medium text-slate-500">
                  {sched.timezone}
                </td>
                <td className="py-3 px-4">
                  {sched.status === 'active' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      ACTIVE
                    </span>
                  ) : sched.status === 'paused' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <Pause className="w-3 h-3 text-amber-600" />
                      PAUSED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                      COMPLETED
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 font-mono">
                  {sched.nextRunAt ? new Date(sched.nextRunAt).toLocaleString() : '—'}
                </td>
                <td className="py-3 px-4 text-xs text-slate-600">
                  {sched.runCount}
                </td>
                <td className="py-3 px-4 text-right space-x-1.5">
                  <button
                    onClick={() => handleTriggerNow(sched.id)}
                    disabled={triggeringId === sched.id}
                    title="Trigger immediately"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors"
                  >
                    <Play
                      className={`w-3.5 h-3.5 text-blue-600 ${
                        triggeringId === sched.id ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Run</span>
                  </button>

                  <button
                    onClick={() => handleToggleStatus(sched)}
                    title={sched.status === 'active' ? 'Pause Schedule' : 'Resume Schedule'}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                  >
                    {sched.status === 'active' ? 'Pause' : 'Resume'}
                  </button>

                  <button
                    onClick={() => handleDelete(sched.id)}
                    title="Delete Schedule"
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Schedule Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">Create New Schedule</h3>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Schedule Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Daily Enterprise Sync"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Workflow</label>
                <select
                  value={workflowId}
                  onChange={(e) => setWorkflowId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-blue-500"
                >
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Schedule Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="cron">Cron Expression</option>
                    <option value="interval">Fixed Interval</option>
                    <option value="one_time">One-time Execution</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                    <option value="Asia/Karachi">Asia/Karachi (PKT)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  </select>
                </div>
              </div>

              {type === 'cron' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cron Expression (min hour dom month dow)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={cronExpression}
                      onChange={(e) => setCronExpression(e.target.value)}
                      placeholder="0 9 * * 1-5"
                      className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 focus:outline-hidden focus:border-blue-500"
                    />
                    <select
                      onChange={(e) => {
                        if (e.target.value) setCronExpression(e.target.value);
                      }}
                      className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600"
                    >
                      <option value="">Presets...</option>
                      <option value="@hourly">Hourly (@hourly)</option>
                      <option value="@daily">Daily at midnight (@daily)</option>
                      <option value="0 9 * * 1-5">Weekdays 9 AM</option>
                      <option value="@weekly">Weekly (@weekly)</option>
                      <option value="@monthly">Monthly (@monthly)</option>
                    </select>
                  </div>
                </div>
              )}

              {type === 'interval' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Interval (Minutes)</label>
                  <input
                    type="number"
                    min={1}
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              )}

              {type === 'one_time' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Date & Time (ISO)</label>
                  <input
                    type="datetime-local"
                    required
                    value={targetDateTime}
                    onChange={(e) => setTargetDateTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <Button variant="ghost" size="sm" type="button" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" type="submit" disabled={isSaving}>
                  {isSaving ? 'Creating...' : 'Create Schedule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
