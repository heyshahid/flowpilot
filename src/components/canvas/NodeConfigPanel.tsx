'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Node } from '@xyflow/react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { WorkflowNodeData } from './CustomWorkflowNode';
import { getNodeDefinition } from '@/core/registry/nodeRegistry';
import {
  Settings,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  AlertCircle,
  Plus,
  X,
  Code2,
} from 'lucide-react';

interface NodeConfigPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, updatedData: Partial<WorkflowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onClose: () => void;
}

export const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  onDuplicateNode,
  onClose,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [hasSaved, setHasSaved] = useState(false);

  const nodeData = selectedNode ? (selectedNode.data as unknown as WorkflowNodeData) : null;
  const definition = useMemo(
    () => (nodeData?.nodeType ? getNodeDefinition(nodeData.nodeType) : null),
    [nodeData?.nodeType]
  );

  useEffect(() => {
    if (selectedNode && nodeData) {
      setTitle(nodeData.title || '');
      setDescription(nodeData.description || '');
      const initialConfig = nodeData.config || definition?.defaultConfig || {};
      setConfig(initialConfig);

      // Validate config immediately
      if (definition) {
        const val = definition.validate(initialConfig);
        setValidationErrors(val.errors);
      }
      setHasSaved(false);
    }
  }, [selectedNode, nodeData?.nodeType]);

  if (!selectedNode || !nodeData) {
    return (
      <aside className="w-80 shrink-0 border-l border-slate-200 bg-white p-6 flex flex-col items-center justify-center text-center select-none">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3">
          <Settings className="w-6 h-6" />
        </div>
        <h4 className="font-bold text-sm text-slate-800">No Node Selected</h4>
        <p className="text-xs text-slate-500 max-w-xs mt-1 leading-relaxed">
          Select any node in the workflow canvas to configure its properties, input parameters, and dynamic variables.
        </p>
      </aside>
    );
  }

  const handleConfigChange = (key: string, value: any) => {
    const updated = { ...config, [key]: value };
    setConfig(updated);

    if (definition) {
      const val = definition.validate(updated);
      setValidationErrors(val.errors);
    }

    onUpdateNode(selectedNode.id, {
      title,
      description,
      config: updated,
      validationErrors: definition ? definition.validate(updated).errors : [],
    });
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    onUpdateNode(selectedNode.id, { title: newTitle });
  };

  const handleDescriptionChange = (newDesc: string) => {
    setDescription(newDesc);
    onUpdateNode(selectedNode.id, { description: newDesc });
  };

  const handleInsertVariable = (key: string, variableExpr: string) => {
    const current = String(config[key] || '');
    handleConfigChange(key, current ? `${current} ${variableExpr}` : variableExpr);
  };

  const nodeType = nodeData.nodeType;

  return (
    <aside className="w-84 shrink-0 border-l border-slate-200 bg-white flex flex-col h-full overflow-hidden select-none">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Node Configuration
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="blue" size="sm">
              {nodeData.category.toUpperCase()}
            </Badge>
            <span className="text-xs font-mono text-slate-400 truncate">
              {selectedNode.id}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onDuplicateNode(selectedNode.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Duplicate node"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDeleteNode(selectedNode.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete node"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Close inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Validation Alert (if errors exist) */}
      {validationErrors.length > 0 && (
        <div className="p-3 mx-3 mt-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 space-y-1">
          <div className="flex items-center gap-1 font-bold text-amber-800">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Configuration Issues ({validationErrors.length}):</span>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-amber-700">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

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
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
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
            onChange={(e) => handleDescriptionChange(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Dynamic Schema Form Controls */}
        <div className="pt-2 border-t border-slate-100 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
              Parameters
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              v{definition?.version || 1}
            </span>
          </div>

          {/* Webhook Trigger */}
          {nodeType === 'trigger.webhook' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  HTTP Method
                </label>
                <select
                  value={config.httpMethod || 'POST'}
                  onChange={(e) => handleConfigChange('httpMethod', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                >
                  <option value="POST">POST (Standard)</option>
                  <option value="GET">GET</option>
                  <option value="ANY">ANY (All Methods)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Response Status Code
                </label>
                <input
                  type="number"
                  value={config.responseStatusCode || 200}
                  onChange={(e) => handleConfigChange('responseStatusCode', parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-200 text-[11px] text-blue-900 leading-relaxed">
                <span className="font-semibold">Webhook URL:</span> Endpoint URL will be assigned automatically upon publishing.
              </div>
            </div>
          )}

          {/* HTTP Request Action */}
          {nodeType === 'action.httpRequest' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Endpoint URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={config.url || ''}
                  onChange={(e) => handleConfigChange('url', e.target.value)}
                  placeholder="https://api.example.com/v1/..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px]"
                />
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">Insert:</span>
                  <button
                    type="button"
                    onClick={() => handleInsertVariable('url', '{{ $trigger.payload.id }}')}
                    className="text-[10px] bg-slate-100 hover:bg-blue-50 hover:text-blue-600 px-1.5 py-0.5 rounded text-slate-600 font-mono"
                  >
                    + id
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Method
                  </label>
                  <select
                    value={config.method || 'GET'}
                    onChange={(e) => handleConfigChange('method', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Timeout (ms)
                  </label>
                  <input
                    type="number"
                    value={config.timeoutMs || 30000}
                    onChange={(e) => handleConfigChange('timeoutMs', parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Protected against SSRF (RFC 1918 & metadata blocked).</span>
              </div>
            </div>
          )}

          {/* Send Email Action */}
          {nodeType === 'action.sendEmail' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Recipient (To) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={config.to || ''}
                  onChange={(e) => handleConfigChange('to', e.target.value)}
                  placeholder="e.g. {{ $trigger.payload.email }} or sales@corp.com"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Subject Line <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={config.subject || ''}
                  onChange={(e) => handleConfigChange('subject', e.target.value)}
                  placeholder="Notification: New Inquiry"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Email Content <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={config.content || ''}
                  onChange={(e) => handleConfigChange('content', e.target.value)}
                  placeholder="Hello {{ $trigger.payload.name }}, your deal has been approved..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-[11px]"
                />
              </div>
            </div>
          )}

          {/* If/Else Branch Logic */}
          {nodeType === 'logic.ifElse' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Expression Field <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={config.field || ''}
                  onChange={(e) => handleConfigChange('field', e.target.value)}
                  placeholder="{{ $trigger.payload.budget }}"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Comparison Operator
                </label>
                <select
                  value={config.operator || 'equals'}
                  onChange={(e) => handleConfigChange('operator', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="equals">Equals (==)</option>
                  <option value="not_equals">Not Equals (!=)</option>
                  <option value="greater_than">Greater Than (&gt;)</option>
                  <option value="less_than">Less Than (&lt;)</option>
                  <option value="contains">Contains Substring</option>
                  <option value="not_contains">Does Not Contain</option>
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
                  onChange={(e) => handleConfigChange('value', e.target.value)}
                  placeholder="e.g. 10000"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                <span className="font-semibold">Dual Output Handles:</span> Connect downstream actions to the <strong className="text-emerald-700">TRUE</strong> and <strong className="text-rose-700">FALSE</strong> handles on the right of the node.
              </div>
            </div>
          )}

          {/* AI Text Generator */}
          {nodeType === 'ai.textGeneration' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Provider & Model
                </label>
                <select
                  value={config.model || 'gemini-2.5-flash'}
                  onChange={(e) => handleConfigChange('model', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="gemini-2.5-flash">Google Gemini 2.5 Flash</option>
                  <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Prompt <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={config.userPrompt || ''}
                  onChange={(e) => handleConfigChange('userPrompt', e.target.value)}
                  placeholder="Summarize customer message: {{ $trigger.payload.message }}"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Output Format
                </label>
                <select
                  value={config.outputFormat || 'text'}
                  onChange={(e) => handleConfigChange('outputFormat', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="text">Plain Text</option>
                  <option value="json">Structured JSON</option>
                </select>
              </div>
            </div>
          )}

          {/* Set Variable Data */}
          {nodeType === 'data.setVariable' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Variable Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={config.variableName || ''}
                  onChange={(e) => handleConfigChange('variableName', e.target.value)}
                  placeholder="e.g. userTier"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={config.value || ''}
                  onChange={(e) => handleConfigChange('value', e.target.value)}
                  placeholder="e.g. VIP"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>
          )}

          {/* Data Transform */}
          {nodeType === 'data.transform' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Transformation Type
                </label>
                <select
                  value={config.transformationType || 'json_stringify'}
                  onChange={(e) => handleConfigChange('transformationType', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="json_stringify">JSON Stringify</option>
                  <option value="json_parse">JSON Parse</option>
                  <option value="uppercase">Uppercase Text</option>
                  <option value="lowercase">Lowercase Text</option>
                  <option value="trim">Trim Whitespace</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Output Variable Name
                </label>
                <input
                  type="text"
                  value={config.outputVariableName || 'result'}
                  onChange={(e) => handleConfigChange('outputVariableName', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-100 flex items-center justify-between bg-slate-50">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
          <Check className="w-3.5 h-3.5 text-emerald-600" />
          Auto-synced
        </span>
      </div>
    </aside>
  );
};
