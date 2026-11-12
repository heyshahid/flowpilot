'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Webhook,
  Play,
  Globe,
  Mail,
  GitBranch,
  Sliders,
  Bot,
  Database,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WorkflowNodeData {
  title: string;
  category: 'trigger' | 'action' | 'logic' | 'data' | 'ai';
  nodeType: string;
  description?: string;
  config?: Record<string, unknown>;
  hasMultipleOutputs?: boolean;
}

const CATEGORY_STYLES = {
  trigger: {
    bg: 'bg-blue-50/60',
    border: 'border-blue-200',
    iconColor: 'text-blue-600',
    badge: 'bg-blue-100 text-blue-700',
  },
  action: {
    bg: 'bg-emerald-50/60',
    border: 'border-emerald-200',
    iconColor: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  logic: {
    bg: 'bg-amber-50/60',
    border: 'border-amber-200',
    iconColor: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
  },
  data: {
    bg: 'bg-indigo-50/60',
    border: 'border-indigo-200',
    iconColor: 'text-indigo-600',
    badge: 'bg-indigo-100 text-indigo-700',
  },
  ai: {
    bg: 'bg-purple-50/60',
    border: 'border-purple-200',
    iconColor: 'text-purple-600',
    badge: 'bg-purple-100 text-purple-700',
  },
};

function getNodeIcon(nodeType: string, category: string) {
  if (nodeType.includes('webhook')) return Webhook;
  if (nodeType.includes('manual') || nodeType.includes('play')) return Play;
  if (nodeType.includes('http') || nodeType.includes('request')) return Globe;
  if (nodeType.includes('email') || nodeType.includes('mail')) return Mail;
  if (nodeType.includes('ifElse') || nodeType.includes('switch')) return GitBranch;
  if (nodeType.includes('transform') || nodeType.includes('variable')) return Sliders;
  if (nodeType.includes('ai') || nodeType.includes('gpt')) return Bot;
  if (nodeType.includes('database') || nodeType.includes('query')) return Database;
  return Layers;
}

export const CustomWorkflowNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const category = nodeData.category || 'action';
  const styles = CATEGORY_STYLES[category] || CATEGORY_STYLES.action;
  const Icon = getNodeIcon(nodeData.nodeType || '', category);
  const isTrigger = category === 'trigger';
  const isIfElse = nodeData.nodeType === 'logic.ifElse';

  return (
    <div
      className={cn(
        'w-64 rounded-xl border bg-white p-3.5 shadow-sm transition-all text-left select-none',
        styles.border,
        selected ? 'ring-2 ring-blue-600 shadow-md' : 'hover:border-slate-400'
      )}
    >
      {/* Target Handle (Incoming connection) - Not for Triggers */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white"
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-2">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
            styles.bg,
            styles.border,
            styles.iconColor
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                styles.badge
              )}
            >
              {category}
            </span>
          </div>
          <h4 className="font-bold text-xs text-slate-900 truncate mt-0.5">
            {nodeData.title || 'Untitled Node'}
          </h4>
        </div>
      </div>

      {/* Description */}
      {nodeData.description && (
        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
          {nodeData.description}
        </p>
      )}

      {/* Source Handles (Outgoing connections) */}
      {isIfElse ? (
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold">
          <div className="flex items-center gap-1 text-emerald-600">
            <span>TRUE</span>
            <Handle
              type="source"
              id="true"
              position={Position.Right}
              style={{ top: '65%' }}
              className="!w-2.5 !h-2.5 !bg-emerald-600 !border-2 !border-white"
            />
          </div>
          <div className="flex items-center gap-1 text-rose-600">
            <span>FALSE</span>
            <Handle
              type="source"
              id="false"
              position={Position.Right}
              style={{ top: '85%' }}
              className="!w-2.5 !h-2.5 !bg-rose-600 !border-2 !border-white"
            />
          </div>
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white"
        />
      )}
    </div>
  );
});

CustomWorkflowNode.displayName = 'CustomWorkflowNode';

