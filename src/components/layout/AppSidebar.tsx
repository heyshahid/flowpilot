'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  GitBranch,
  Layers,
  Zap,
  Activity,
  Key,
  Bot,
  BarChart3,
  Settings,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ShieldCheck,
  Clock,
  Users,
} from 'lucide-react';
import { WorkspaceSelector } from './WorkspaceSelector';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Workflows', href: '/workflows', icon: GitBranch },
  { name: 'Schedules', href: '/schedules', icon: Clock },
  { name: 'Templates', href: '/templates', icon: Layers },
  { name: 'Integrations', href: '/integrations', icon: Zap },
  { name: 'Executions', href: '/executions', icon: Activity },
  { name: 'Credentials', href: '/credentials', icon: Key },
  { name: 'AI Assistant', href: '/ai-assistant', icon: Bot, badge: 'AI' },
  { name: 'Team', href: '/team', icon: Users },
  { name: 'Audit Logs', href: '/audit-logs', icon: ShieldCheck },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export const AppSidebar: React.FC = () => {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r border-slate-200 bg-white transition-all duration-300 z-30 select-none shrink-0',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-100">
        <Link href="/" className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20">
            FP
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight text-slate-900 leading-none">
                FlowPilot
              </span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide uppercase mt-1">
                Workflow Automation
              </span>
            </div>
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronsRight className="w-4 h-4" />
          ) : (
            <ChevronsLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Workspace Selector */}
      <WorkspaceSelector collapsed={collapsed} />

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all group',
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? item.name : undefined}
            >
              <Icon
                className={cn(
                  'w-4 h-4 shrink-0 transition-colors',
                  isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-700'
                )}
              />
              {!collapsed && (
                <span className="flex-1 truncate">{item.name}</span>
              )}
              {!collapsed && item.badge && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Security & System Badge */}
      {!collapsed && (
        <div className="p-3 mx-3 mb-2 rounded-lg bg-emerald-50/60 border border-emerald-200/60 flex items-center gap-2 text-[11px] text-emerald-800">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="truncate">SSRF Guard & AES-256 Active</span>
        </div>
      )}

      {/* User Profile Footer */}
      <div className="border-t border-slate-100 p-3">
        <div
          className={cn(
            'flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50 transition-colors cursor-pointer',
            collapsed && 'justify-center p-1'
          )}
        >
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-medium flex items-center justify-center text-xs shrink-0 shadow-xs">
            SA
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold text-slate-800 truncate">
                Shahid Akram
              </span>
              <span className="text-[11px] text-slate-400 truncate">
                shd.13021990@gmail.com
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

