'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import {
  Bell,
  HelpCircle,
  Plus,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface TopNavigationProps {
  onCreateWorkflow?: () => void;
}

export const TopNavigation: React.FC<TopNavigationProps> = ({
  onCreateWorkflow,
}) => {
  const pathname = usePathname();

  // Derive breadcrumbs from path
  const pathSegments = pathname.split('/').filter(Boolean);
  const breadcrumbTitle =
    pathSegments.length === 0
      ? 'Dashboard'
      : pathSegments[0].charAt(0).toUpperCase() + pathSegments[0].slice(1);

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur-sm">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/"
          className="text-slate-500 hover:text-slate-800 transition-colors font-medium"
        >
          FlowPilot
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
        <span className="font-semibold text-slate-900">{breadcrumbTitle}</span>
        {pathSegments.length > 1 && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="text-slate-500 font-mono text-xs">
              {pathSegments[1]}
            </span>
          </>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* GitHub Repository Link */}
        <a
          href="https://github.com/heyshahid/flowpilot"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5 text-slate-700 fill-current" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          <span>heyshahid/flowpilot</span>
          <ExternalLink className="w-3 h-3 text-slate-400" />
        </a>

        {/* Documentation / Help */}
        <Link
          href="/docs"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          title="Help & Architecture Docs"
        >
          <HelpCircle className="w-4 h-4" />
        </Link>

        {/* Notifications */}
        <button
          className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          title="System notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600" />
        </button>

        <div className="h-4 w-px bg-slate-200 mx-1" />

        {/* Create Workflow Button */}
        {onCreateWorkflow && (
          <Button
            onClick={onCreateWorkflow}
            variant="primary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            New Workflow
          </Button>
        )}
      </div>
    </header>
  );
};
