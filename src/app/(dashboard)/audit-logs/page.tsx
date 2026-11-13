'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  Clock,
  User,
  Info,
  Layers,
  Key,
  Users,
  GitBranch,
  Calendar,
  CheckCircle,
} from 'lucide-react';
import { AuditLogRecord, AuditResourceType } from '@/lib/storage/auditLogStore';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLogRecord[]>([]);
  const [selectedResourceType, setSelectedResourceType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [selectedResourceType]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const meRes = await fetch('/api/v1/users/me');
      const meData = await meRes.json();
      if (meData.success) {
        const url =
          selectedResourceType === 'all'
            ? `/api/v1/workspaces/${meData.workspace.id}/audit-logs?limit=100`
            : `/api/v1/workspaces/${meData.workspace.id}/audit-logs?resourceType=${selectedResourceType}&limit=100`;

        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
          setLogs(data.logs || []);
          setFilteredLogs(data.logs || []);
        }
      }
    } catch {
      // Error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredLogs(logs);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredLogs(
      logs.filter(
        (l) =>
          l.action.toLowerCase().includes(q) ||
          l.actorName.toLowerCase().includes(q) ||
          l.actorEmail.toLowerCase().includes(q) ||
          (l.resourceName && l.resourceName.toLowerCase().includes(q))
      )
    );
  }, [searchQuery, logs]);

  const getResourceIcon = (type: AuditResourceType) => {
    switch (type) {
      case 'workflow':
        return <GitBranch className="w-4 h-4 text-blue-600" />;
      case 'member':
      case 'invitation':
        return <Users className="w-4 h-4 text-emerald-600" />;
      case 'credential':
      case 'integration':
        return <Key className="w-4 h-4 text-amber-600" />;
      case 'schedule':
        return <Calendar className="w-4 h-4 text-purple-600" />;
      default:
        return <Layers className="w-4 h-4 text-slate-600" />;
    }
  };

  const getActionBadge = (action: string) => {
    if (action.includes('created') || action.includes('accepted') || action.includes('connected')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          {action}
        </span>
      );
    }
    if (action.includes('updated') || action.includes('changed') || action.includes('transferred')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          {action}
        </span>
      );
    }
    if (action.includes('deleted') || action.includes('revoked') || action.includes('removed')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          {action}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
        {action}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
          <ShieldCheck className="w-6 h-6 text-blue-600" />
          Workspace Audit Logs
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Immutable audit trail of member operations, workflow modifications, credentials updates, and security events.
        </p>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by action, actor, or resource..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedResourceType}
            onChange={(e) => setSelectedResourceType(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
          >
            <option value="all">All Resource Types</option>
            <option value="workspace">Workspace</option>
            <option value="member">Members</option>
            <option value="invitation">Invitations</option>
            <option value="workflow">Workflows</option>
            <option value="credential">Credentials</option>
            <option value="schedule">Schedules</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-6">Timestamp</th>
                <th className="py-3.5 px-4">Actor</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4">Resource</th>
                <th className="py-3.5 px-4">IP Address</th>
                <th className="py-3.5 px-6 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading audit trail...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No audit records match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-6 text-xs text-slate-500 font-mono whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                          {log.actorName.charAt(0)}
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {log.actorName}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {log.actorEmail}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {getActionBadge(log.action)}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        {getResourceIcon(log.resourceType)}
                        <span className="text-xs font-medium text-slate-800 truncate max-w-xs">
                          {log.resourceName || log.resourceId}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-xs font-mono text-slate-400">
                      {log.ipAddress || '127.0.0.1'}
                    </td>

                    <td className="py-3.5 px-6 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors inline-flex items-center gap-1"
                      >
                        <Info className="w-3.5 h-3.5" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                Audit Event: {selectedLog.action}
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-400 block font-medium">Event ID:</span>
                  <span className="font-mono text-slate-800">{selectedLog.id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Timestamp:</span>
                  <span className="text-slate-800">{new Date(selectedLog.timestamp).toISOString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Actor:</span>
                  <span className="text-slate-800">{selectedLog.actorName} ({selectedLog.actorEmail})</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Resource ID:</span>
                  <span className="font-mono text-slate-800">{selectedLog.resourceId}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Metadata & Parameters (Sanitized)
                </label>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto max-h-60">
                  {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                </pre>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
