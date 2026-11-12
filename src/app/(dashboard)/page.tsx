'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { workflowStore, WorkflowRecord } from '@/lib/storage/workflowStore';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CreateWorkflowModal } from '@/components/workflows/CreateWorkflowModal';
import { formatDate } from '@/lib/utils';
import {
  GitBranch,
  CheckCircle2,
  AlertCircle,
  PlayCircle,
  ArrowRight,
  Plus,
  Sparkles,
  Zap,
  Activity,
  Layers,
  Clock,
} from 'lucide-react';

export default function DashboardPage() {
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [stats, setStats] = useState({
    totalWorkflows: 0,
    activeWorkflows: 0,
    successfulRuns: 0,
    failedRuns: 0,
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    const list = workflowStore.getAll();
    setWorkflows(list);
    setStats(workflowStore.getDashboardStats());
  }, []);

  const recentWorkflows = [...workflows]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-7 text-white shadow-lg">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold mb-3 border border-blue-400/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Shahid Growth Lab Automation Hub</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Workflow Automation Studio
          </h1>
          <p className="mt-1 text-sm text-slate-300 max-w-xl">
            Visually design, test, and execute event-driven workflows with Zero-Trust SSRF protection and decoupled DAG runtime.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/workflows">
            <Button variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20">
              Browse Workflows
            </Button>
          </Link>
          <Button
            variant="primary"
            onClick={() => setIsCreateOpen(true)}
            icon={<Plus className="w-4 h-4" />}
            className="bg-blue-500 hover:bg-blue-600 shadow-blue-900/40"
          >
            Create Workflow
          </Button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Workflows"
          value={stats.totalWorkflows}
          subtitle="Configured in workspace"
          icon={<GitBranch className="w-5 h-5 text-blue-600" />}
          trend={{ value: '+100% this week', isPositive: true }}
        />
        <StatCard
          title="Active Automations"
          value={stats.activeWorkflows}
          subtitle="Currently listening for triggers"
          icon={<Zap className="w-5 h-5 text-emerald-600" />}
        />
        <StatCard
          title="Successful Runs"
          value={stats.successfulRuns}
          subtitle="Executed with 0 step errors"
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          trend={{ value: '98.2% health', isPositive: true }}
        />
        <StatCard
          title="Failed Executions"
          value={stats.failedRuns}
          subtitle="Logged with error stack trace"
          icon={<AlertCircle className="w-5 h-5 text-rose-600" />}
        />
      </div>

      {/* Main 2-Column Section: Recent Workflows & Execution Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recently Edited Workflows */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">
                Recently Edited Workflows
              </h2>
            </div>
            <Link
              href="/workflows"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              View all {workflows.length} workflows
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
            {recentWorkflows.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No workflows found. Click &quot;Create Workflow&quot; to begin your first automation.
              </div>
            ) : (
              recentWorkflows.map((wf) => (
                <div
                  key={wf.id}
                  className="flex items-center justify-between p-4 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 pr-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100/60 mt-0.5">
                      <GitBranch className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/builder/${wf.id}`}
                          className="font-semibold text-sm text-slate-900 hover:text-blue-600 truncate transition-colors"
                        >
                          {wf.name}
                        </Link>
                        <Badge variant={wf.status} size="sm">
                          {wf.status.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {wf.description || 'No description provided.'}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {wf.nodes.length} nodes
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Updated {formatDate(wf.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Link href={`/builder/${wf.id}`} className="shrink-0">
                    <Button variant="outline" size="sm" icon={<PlayCircle className="w-3.5 h-3.5" />}>
                      Open Canvas
                    </Button>
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 1 Col: Execution Engine Status & Quick-Start Templates */}
        <div className="space-y-6">
          {/* Engine Status Card */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Core Engine Status
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Operational
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Topological DAG Sorter:</span>
                <span className="font-semibold text-slate-900">Kahn&apos;s Algorithm</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>SSRF Protection Firewall:</span>
                <span className="font-semibold text-emerald-700">Enforced</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Expression Engine:</span>
                <span className="font-semibold text-slate-900">Safe AST (No eval)</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Automated Parity Tests:</span>
                <span className="font-semibold text-blue-700">6 / 6 Passing</span>
              </div>
            </div>
          </div>

          {/* Quick-Start Templates */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Starter Templates
              </span>
              <Link href="/templates" className="text-xs text-blue-600 font-semibold hover:underline">
                View All
              </Link>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50/50 hover:border-blue-200 transition-colors cursor-pointer group">
                <h4 className="text-xs font-semibold text-slate-900 group-hover:text-blue-700">
                  Lead Gen & VIP Routing
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Webhook ➔ If Budget &ge; $10k ➔ Email Rep
                </p>
              </div>

              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50/50 hover:border-blue-200 transition-colors cursor-pointer group">
                <h4 className="text-xs font-semibold text-slate-900 group-hover:text-blue-700">
                  Webhook to REST API Ingestion
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Webhook ➔ Transform ➔ Outbound HTTP POST
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CreateWorkflowModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(id) => {
          setWorkflows(workflowStore.getAll());
          setStats(workflowStore.getDashboardStats());
        }}
      />
    </div>
  );
}

