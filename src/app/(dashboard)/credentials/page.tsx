'use client';

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Key, ShieldCheck, Lock, Plus } from 'lucide-react';

export default function CredentialsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Encrypted Credential Vault
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Store API keys, SMTP passwords, and webhook secrets encrypted with AES-256-GCM.
          </p>
        </div>
        <Button variant="primary" icon={<Plus className="w-4 h-4" />}>
          Add Credential
        </Button>
      </div>

      <div className="p-4 rounded-xl border border-blue-200/80 bg-blue-50/50 flex items-start gap-3">
        <Lock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 leading-relaxed">
          <span className="font-bold">Zero-Exposure Security Policy:</span> Credentials are never stored in browser local storage and are only decrypted in-memory inside the isolated execution worker using <code className="font-mono bg-blue-100 px-1 py-0.5 rounded text-[11px]">FLOWPILOT_ENCRYPTION_KEY</code>.
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center">
        <Key className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="font-bold text-sm text-slate-800">No Credentials Vaulted Yet</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
          Add an OpenAI API key or SMTP configuration to use in your action nodes.
        </p>
        <Button variant="outline" size="sm" icon={<Plus className="w-3.5 h-3.5" />}>
          New Credential
        </Button>
      </div>
    </div>
  );
}
