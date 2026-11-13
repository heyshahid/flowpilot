'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import {
  Building2,
  Users,
  ShieldCheck,
  ChevronRight,
  Shield,
  Key,
  Gauge,
} from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Settings & Governance
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure organization settings, team permissions, security policies, resource quotas, and audit governance.
        </p>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/settings/workspace"
          className="p-5 bg-white border border-slate-200/80 hover:border-blue-400 rounded-xl shadow-xs transition-all group hover:shadow-md"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="font-bold text-sm text-slate-900 flex items-center justify-between">
            <span>Workspace</span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Manage profile, member defaults, and ownership.
          </p>
        </Link>

        <Link
          href="/settings/usage"
          className="p-5 bg-white border border-slate-200/80 hover:border-amber-400 rounded-xl shadow-xs transition-all group hover:shadow-md"
        >
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Gauge className="w-5 h-5" />
          </div>
          <div className="font-bold text-sm text-slate-900 flex items-center justify-between">
            <span>Usage & Quotas</span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Monitor consumption, active limits, and resource quotas.
          </p>
        </Link>

        <Link
          href="/team"
          className="p-5 bg-white border border-slate-200/80 hover:border-emerald-400 rounded-xl shadow-xs transition-all group hover:shadow-md"
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5" />
          </div>
          <div className="font-bold text-sm text-slate-900 flex items-center justify-between">
            <span>Team & Roles</span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Invite teammates, assign RBAC permissions, and manage memberships.
          </p>
        </Link>

        <Link
          href="/audit-logs"
          className="p-5 bg-white border border-slate-200/80 hover:border-purple-400 rounded-xl shadow-xs transition-all group hover:shadow-md"
        >
          <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="font-bold text-sm text-slate-900 flex items-center justify-between">
            <span>Audit Logs</span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Immutable log of team actions, workflow revisions, and security events.
          </p>
        </Link>
      </div>

      {/* Security & Policies */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-900">Security & Execution Policy</h3>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Outbound network sockets are protected by the SSRF Guard firewall. Internal IP ranges and cloud metadata endpoints are permanently blocked.
          Credentials stored in the Vault are encrypted using AES-256-GCM.
        </p>
        <div className="pt-2 flex items-center gap-3">
          <Link href="/audit-logs">
            <Button variant="outline" size="sm">
              View Workspace Audit Trail
            </Button>
          </Link>
          <Link href="/credentials">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5" />
              Credentials Vault
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
