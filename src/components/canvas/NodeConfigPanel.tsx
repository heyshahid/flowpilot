'use client';

import React, { useEffect, useState } from 'react';
import { Node } from '@xyflow/react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { WorkflowNodeData } from './CustomWorkflowNode';
import {
  Settings,
  Trash2,
  Check,
  ShieldCheck,
  Code,
  Sliders,
  AlertCircle,
} from 'lucide-react';

interface NodeConfigPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, updatedData: Partial<WorkflowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  onClose,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<Record<string, any>>({});
  const [hasSaved, setHasSaved] = useState(false);

  useEffect(() => {
    if (selectedNode) {
      const data = selectedNode.data as unknown as WorkflowNodeData;
      setTitle(data.title || '');
      setDescription(data.description || '');
      setConfig(data.config || {});
      setHasSaved(false);
    }
  }, [selectedNode]);

  if (!selectedNode) {
    return (
      <aside className="w-80 shrink-0 border-l border-slate-200 bg-white p-6 flex flex-col items-center justify-center text-center select-none">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3">
          <Settings className="w-6 h-6" />
        </div>
        <h4 className="font-bold text-sm text-slate-800">No Node Selected</h4>
        <p className="text-xs text-slate-500 max-w-xs mt-1 leading-relaxed">
          Click on any node in the workflow canvas to configure its execution parameters and dynamic variables.
        </p>
      </aside>
    );
  }

  const data = selectedNode.data as unknown as WorkflowNodeData;
  const nodeType = data.nodeType || '';

  const handleSave = () => {
    onUpdateNode(selectedNode.id, {
      title,
      description,
      config,
    });
    setHasSaved(true);
    setTimeout(() => setHasSaved(false), 2000);
  };

  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 bg-white flex flex-col h-full overflow-hidden select-none">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Node Inspector
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="blue" size="sm">
              {data.category.toUpperCase()}
            </Badge>
            <span className="text-xs font-mono text-slate-400 truncate">
              {selectedNode.id}
            </span>
          </div>
        </div>
        <button
          onClick={() => onDeleteNode(selectedNode.id)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Delete Node"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Form Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Node Name */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Display Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Description
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Dynamic Schema Fields Based on Node Type */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
            Execution Parameters
          </span>

          {/* Webhook Config */}
          {nodeType === 'trigger.webhook' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  HTTP Method
                </label>
                <select
                  value={config.httpMethod || 'POST'}
                  onChange={(e) => setConfig({ ...config, httpMethod: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                >
                  <option value="POST">POST (Recommended)</option>
                  <option value="GET">GET</option>
                  <option value="ANY">ANY</option>
                </select>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-900 leading-relaxed">
                Webhook endpoint URL will be generated when published.
              </div>
            </div>
          )}

          {/* HTTP Request Config */}
          {nodeType === 'action.httpRequest' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Endpoint URL
                </label>
                <input
                  type="text"
                  value={config.url || ''}
                  onChange={(e) => setConfig({ ...config, url: e.target.value })}
                  placeholder="https://api.example.com/v1/..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  HTTP Method
                </label>
                <select
                  value={config.method || 'GET'}
                  onChange={(e) => setConfig({ ...config, method: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Protected against SSRF attacks.</span>
              </div>
            </div>
          )}

          {/* If/Else Logic Config */}
          {nodeType === 'logic.ifElse' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Expression Field
                </label>
                <input
                  type="text"
                  value={config.field || ''}
                  onChange={(e) => setConfig({ ...config, field: e.target.value })}
                  placeholder="{{ $trigger.payload.budget }}"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Operator
                </label>
                <select
                  value={config.operator || 'greater_than'}
                  onChange={(e) => setConfig({ ...config, operator: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="greater_than">Greater Than (&gt;)</option>
                  <option value="less_than">Less Than (&lt;)</option>
                  <option value="equals">Equals (==)</option>
                  <option value="not_equals">Not Equals (!=)</option>
                  <option value="contains">Contains</option>
                  <option value="is_empty">Is Empty</option>
                  <option value="is_not_empty">Is Not Empty</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Compare Value
                </label>
                <input
                  type="text"
                  value={config.value || ''}
                  onChange={(e) => setConfig({ ...config, value: e.target.value })}
                  placeholder="e.g. 10000"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          )}

          {/* Send Email Config */}
          {nodeType === 'action.sendEmail' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Recipient (To)
                </label>
                <input
                  type="text"
                  value={config.to || ''}
                  onChange={(e) => setConfig({ ...config, to: e.target.value })}
                  placeholder="sales@company.com"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={config.subject || ''}
                  onChange={(e) => setConfig({ ...config, subject: e.target.value })}
                  placeholder="New Lead: {{ $trigger.payload.name }}"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Email Body
                </label>
                <textarea
                  rows={3}
                  value={config.content || ''}
                  onChange={(e) => setConfig({ ...config, content: e.target.value })}
                  placeholder="Lead details..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-[11px]"
                />
              </div>
            </div>
          )}

          {/* AI Text Generation Config */}
          {nodeType === 'ai.textGeneration' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Model
                </label>
                <select
                  value={config.model || 'gemini-2.5-flash'}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Prompt
                </label>
                <textarea
                  rows={3}
                  value={config.userPrompt || ''}
                  onChange={(e) => setConfig({ ...config, userPrompt: e.target.value })}
                  placeholder="Summarize this lead inquiry: {{ $trigger.payload.message }}"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-slate-100 flex items-center justify-between bg-slate-50">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          icon={hasSaved ? <Check className="w-3.5 h-3.5" /> : undefined}
        >
          {hasSaved ? 'Updated' : 'Apply Changes'}
        </Button>
      </div>
    </aside>
  );
};
