'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Sparkles, Webhook, Mail, ArrowRight, Layers, Bot, Database } from 'lucide-react';

const TEMPLATES = [
  {
    id: 'tpl_lead_gen',
    title: 'Lead Ingestion & VIP Qualification',
    category: 'Sales & Marketing',
    description: 'Listen for form submissions, filter leads with budget >= $10k, and alert team on email.',
    nodesCount: 4,
    integrations: ['Webhook', 'If/Else', 'Send Email'],
    icon: Sparkles,
  },
  {
    id: 'tpl_webhook_api',
    title: 'Webhook to REST API Gateway',
    category: 'Developer Operations',
    description: 'Ingest external webhook payloads, validate headers, transform schema, and POST to internal API.',
    nodesCount: 3,
    integrations: ['Webhook', 'Data Transform', 'HTTP Request'],
    icon: Webhook,
  },
  {
    id: 'tpl_ai_responder',
    title: 'AI Customer Email Auto-Responder',
    category: 'Customer Support',
    description: 'Draft contextual replies using Gemini / OpenAI LLM prompts and send instant email confirmation.',
    nodesCount: 4,
    integrations: ['Webhook', 'AI Text Generation', 'Send Email'],
    icon: Bot,
  },
  {
    id: 'tpl_db_sync',
    title: 'Database Event Sync & Audit Logger',
    category: 'Data Management',
    description: 'Poll database updates, transform records, and dispatch event telemetry.',
    nodesCount: 4,
    integrations: ['Schedule', 'HTTP Request', 'Data Transform'],
    icon: Database,
  },
];

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Workflow Starter Templates
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pre-configured automation recipes designed for common business use cases.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {TEMPLATES.map((tpl) => {
          const Icon = tpl.icon;
          return (
            <div
              key={tpl.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs hover:shadow-md hover:border-blue-200 transition-all"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                    <Icon className="w-5 h-5" />
                  </div>
                  <Badge variant="blue" size="sm">
                    {tpl.category}
                  </Badge>
                </div>

                <h3 className="font-bold text-base text-slate-900">{tpl.title}</h3>
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                  {tpl.description}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {tpl.integrations.map((item) => (
                    <span
                      key={item}
                      className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {tpl.nodesCount} pre-configured nodes
                </span>
                <Link href="/workflows">
                  <Button variant="outline" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                    Use Template
                  </Button>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

