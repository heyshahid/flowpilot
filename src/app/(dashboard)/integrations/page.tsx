'use client';

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Webhook,
  Globe,
  Mail,
  FileSpreadsheet,
  MessageSquare,
  Bot,
  Database,
  ShieldCheck,
  CheckCircle2,
  Clock,
} from 'lucide-react';

const INTEGRATIONS = [
  {
    name: 'Webhooks Ingestion',
    category: 'Trigger',
    description: 'Listen for inbound HTTP POST/GET events with HMAC signature verification.',
    status: 'Operational (Phase 1 Engine)',
    badge: 'active' as const,
    icon: Webhook,
  },
  {
    name: 'HTTP / REST Client',
    category: 'Action',
    description: 'Make outbound API requests with built-in SSRF protection and dynamic variables.',
    status: 'Operational (Phase 1 Engine)',
    badge: 'active' as const,
    icon: Globe,
  },
  {
    name: 'Transactional Email (SMTP/Resend)',
    category: 'Action',
    description: 'Send alerts and automated notifications via SMTP or API.',
    status: 'Driver Ready (Phase 3 Integration)',
    badge: 'draft' as const,
    icon: Mail,
  },
  {
    name: 'AI Text & Data Extractor',
    category: 'AI Cognitive',
    description: 'Prompt LLM models (Gemini / OpenAI) for classification and auto-drafting.',
    status: 'Driver Ready (Phase 3 Integration)',
    badge: 'draft' as const,
    icon: Bot,
  },
  {
    name: 'Google Sheets',
    category: 'Cloud Storage',
    description: 'Append and sync rows automatically without manual spreadsheet entry.',
    status: 'Planned (Phase 5)',
    badge: 'neutral' as const,
    icon: FileSpreadsheet,
  },
  {
    name: 'Slack & Discord Alerts',
    category: 'Team Messaging',
    description: 'Post structured channel notifications and deal win announcements.',
    status: 'Planned (Phase 5)',
    badge: 'neutral' as const,
    icon: MessageSquare,
  },
];

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Integration Connectors
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage API drivers, authentication connections, and outbound network safety.
        </p>
      </div>

      <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/50 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-900 leading-relaxed">
          <span className="font-bold">SSRF IP Firewall Active:</span> All outbound HTTP and webhook connectors automatically validate destination IPs against RFC 1918 private subnets, loopback interfaces, and cloud metadata services.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {INTEGRATIONS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.name}
              className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                    <Icon className="w-5 h-5" />
                  </div>
                  <Badge variant={item.badge} size="sm">
                    {item.category}
                  </Badge>
                </div>

                <h3 className="font-bold text-sm text-slate-900">{item.name}</h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  {item.description}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[11px] font-medium text-slate-600">
                  {item.status}
                </span>
                {item.badge === 'active' ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Verified
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    Roadmap
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

