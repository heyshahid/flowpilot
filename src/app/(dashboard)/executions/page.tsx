'use client';

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Activity, CheckCircle2, Clock, Play } from 'lucide-react';

const RECENT_RUNS = [
  {
    id: 'exec_8fa1b920',
    workflowName: 'Inbound Lead Qualification & VIP Routing',
    trigger: 'Webhook Inbound',
    status: 'success' as const,
    durationMs: 38,
    timeAgo: '12 minutes ago',
    stepsCount: 4,
  },
  {
    id: 'exec_72cd49e1',
    workflowName: 'Customer Order Enrichment API',
    trigger: 'Webhook POST',
    status: 'success' as const,
    durationMs: 54,
    timeAgo: '1 hour ago',
    stepsCount: 3,
  },
  {
    id: 'exec_1094ba83',
    workflowName: 'Inbound Lead Qualification & VIP Routing',
    trigger: 'Manual Run',
    status: 'success' as const,
    durationMs: 24,
    timeAgo: '3 hours ago',
    stepsCount: 4,
  },
];

export default function ExecutionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Execution History & Logs
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Real-time step traces, execution duration, and audit logs recorded by the execution engine.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Execution ID</th>
              <th className="py-3 px-4">Workflow</th>
              <th className="py-3 px-4">Trigger</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4">Executed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {RECENT_RUNS.map((run) => (
              <tr key={run.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3 px-4 font-mono text-xs text-blue-600 font-medium">
                  {run.id}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-900 text-xs">
                  {run.workflowName}
                </td>
                <td className="py-3 px-4 text-xs text-slate-600">
                  {run.trigger}
                </td>
                <td className="py-3 px-4">
                  <Badge variant={run.status} size="sm">
                    {run.status.toUpperCase()}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-xs text-slate-500 font-mono">
                  {run.durationMs}ms
                </td>
                <td className="py-3 px-4 text-xs text-slate-400">
                  {run.timeAgo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

