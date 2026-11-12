'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { getNodeDefinition } from '@/core/registry/nodeRegistry';
import { resolveNodeIcon } from './nodeIcons';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, RotateCw, XCircle, Ban } from 'lucide-react';
import { NodeExecutionStatus } from '@/core/execution/types';

export interface WorkflowNodeData {
  title: string;
  category: 'trigger' | 'action' | 'logic' | 'data' | 'ai';
  nodeType: string;
  description?: string;
  config?: Record<string, unknown>;
  validationErrors?: string[];
  executionStatus?: NodeExecutionStatus;
  isConfigured?: boolean;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const CATEGORY_STYLES = {
  trigger: {
    bg: 'bg-blue-50/80',
    border: 'border-blue-200',
    iconColor: 'text-blue-600',
    badge: 'bg-blue-100 text-blue-700',
  },
  action: {
    bg: 'bg-emerald-50/80',
    border: 'border-emerald-200',
    iconColor: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  logic: {
    bg: 'bg-amber-50/80',
    border: 'border-amber-200',
    iconColor: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
  },
  data: {
    bg: 'bg-indigo-50/80',
    border: 'border-indigo-200',
    iconColor: 'text-indigo-600',
    badge: 'bg-indigo-100 text-indigo-700',
  },
  ai: {
    bg: 'bg-purple-50/80',
    border: 'border-purple-200',
    iconColor: 'text-purple-600',
    badge: 'bg-purple-100 text-purple-700',
  },
};

export const CustomWorkflowNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const definition = getNodeDefinition(nodeData.nodeType || '');
  const category = (definition?.category || nodeData.category || 'action') as keyof typeof CATEGORY_STYLES;
  const styles = CATEGORY_STYLES[category] || CATEGORY_STYLES.action;
  const Icon = resolveNodeIcon(definition?.icon);

  const hasInputs = (definition?.inputs.length || 0) > 0 || category !== 'trigger';
  const outputs = definition?.outputs || [{ id: 'default', name: 'Next' }];
  const hasErrors = (nodeData.validationErrors?.length || 0) > 0;
  const execStatus = nodeData.executionStatus;

  return (
    <div
      className={cn(
        'w-64 rounded-xl border bg-white p-3.5 shadow-sm transition-all text-left select-none relative group',
        styles.border,
        selected ? 'ring-2 ring-blue-600 shadow-md' : 'hover:border-slate-400',
        hasErrors && 'border-amber-400 ring-1 ring-amber-300',
        execStatus === 'RUNNING' && 'border-blue-500 ring-2 ring-blue-400 shadow-md animate-pulse',
        execStatus === 'COMPLETED' && 'border-emerald-500 ring-1 ring-emerald-300',
        execStatus === 'FAILED' && 'border-rose-500 ring-2 ring-rose-400',
        execStatus === 'SKIPPED' && 'opacity-60 bg-slate-50'
      )}
    >
      {/* Target Handle (Incoming connection) - Trigger nodes have no input handle */}
      {hasInputs && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white transition-transform hover:scale-125"
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1.5">
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

            {/* Execution / Validation Indicator */}
            {execStatus ? (
              execStatus === 'RUNNING' ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600">
                  <RotateCw className="w-3 h-3 animate-spin text-blue-600" />
                  Run
                </span>
              ) : execStatus === 'COMPLETED' ? (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Done
                </span>
              ) : execStatus === 'FAILED' ? (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-rose-600">
                  <XCircle className="w-3 h-3 text-rose-600" />
                  Fail
                </span>
              ) : execStatus === 'SKIPPED' ? (
                <span className="text-[10px] font-medium text-slate-400">
                  Skipped
                </span>
              ) : null
            ) : hasErrors ? (
              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600" title={nodeData.validationErrors?.join(', ')}>
                <AlertCircle className="w-3 h-3 text-amber-500" />
                <span>Issue</span>
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-[10px] text-emerald-600" title="Node configured">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              </span>
            )}
          </div>
          <h4 className="font-bold text-xs text-slate-900 truncate mt-0.5">
            {nodeData.title || definition?.displayName || 'Untitled Node'}
          </h4>
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
        {nodeData.description || definition?.description || ''}
      </p>

      {/* Dynamic Source Handles */}
      {outputs.length > 1 ? (
        <div className="mt-3 pt-2 border-t border-slate-100 space-y-1.5 text-[10px] font-bold">
          {outputs.map((port, idx) => (
            <div
              key={port.id}
              className={cn(
                'flex items-center justify-end gap-1.5',
                port.id === 'true' ? 'text-emerald-600' : port.id === 'false' ? 'text-rose-600' : 'text-slate-600'
              )}
            >
              <span>{port.label || port.name.toUpperCase()}</span>
              <Handle
                type="source"
                id={port.id}
                position={Position.Right}
                style={{ top: `${60 + idx * 24}%` }}
                className={cn(
                  '!w-2.5 !h-2.5 !border-2 !border-white transition-transform hover:scale-125',
                  port.id === 'true' ? '!bg-emerald-600' : port.id === 'false' ? '!bg-rose-600' : '!bg-blue-600'
                )}
              />
            </div>
          ))}
        </div>
      ) : (
        <Handle
          type="source"
          id={outputs[0]?.id || 'default'}
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white transition-transform hover:scale-125"
        />
      )}
    </div>
  );
});

CustomWorkflowNode.displayName = 'CustomWorkflowNode';
