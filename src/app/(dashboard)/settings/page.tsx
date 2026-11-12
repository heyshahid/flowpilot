'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Workspace Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure organization details, runtime parameters, and security policies.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
        <h3 className="font-bold text-sm text-slate-900">Workspace Profile</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Workspace Name</label>
            <input
              type="text"
              readOnly
              value="Shahid Growth Lab"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Owner Email</label>
            <input
              type="email"
              readOnly
              value="shd.13021990@gmail.com"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-3">
        <h3 className="font-bold text-sm text-slate-900">Security & Execution Policy</h3>
        <p className="text-xs text-slate-500">
          Outbound network connections are protected by the SSRF Guard firewall. Internal IP ranges and cloud metadata endpoints are permanently blocked.
        </p>
        <div className="pt-2">
          <Button variant="outline" size="sm">
            Export Audit Logs
          </Button>
        </div>
      </div>
    </div>
  );
}

