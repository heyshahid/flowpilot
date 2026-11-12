'use client';

import React, { useState } from 'react';
import { SearchInput } from '@/components/ui/SearchInput';
import {
  Webhook,
  Play,
  Globe,
  Mail,
  GitBranch,
  Sliders,
  Bot,
  Plus,
  Layers,
} from 'lucide-react';
import { NodeCategory, StandardNodeType } from '@/core/types/workflow';

export interface AvailableNodeItem {
  type: StandardNodeType;
  category: NodeCategory;
  name: string;
  description: string;
  icon: React.ElementType;
}

export const NODE_CATALOG: AvailableNodeItem[] = [
  {
    type: 'trigger.webhook',
    category: 'trigger',
    name: 'Webhook Trigger',
    description: 'Listen for incoming POST/GET payloads from external webhooks.',
    icon: Webhook,
  },
  {
    type: 'trigger.manual',
    category: 'trigger',
    name: 'Manual Trigger',
    description: 'Trigger workflow on-demand with custom test variables.',
    icon: Play,
  },
  {
    type: 'action.httpRequest',
    category: 'action',
    name: 'HTTP Request',
    description: 'Outbound REST call with SSRF firewall and variable expressions.',
    icon: Globe,
  },
  {
    type: 'logic.ifElse',
    category: 'logic',
    name: 'If / Else Branch',
    description: 'Route execution to TRUE or FALSE paths based on conditions.',
    icon: GitBranch,
  },
  {
    type: 'action.sendEmail',
    category: 'action',
    name: 'Send Email',
    description: 'Send transactional alerts or welcome emails via SMTP / Resend.',
    icon: Mail,
  },
  {
    type: 'data.transform',
    category: 'data',
    name: 'Data Transform',
    description: 'Format, set variables, or reshape step payloads.',
    icon: Sliders,
  },
  {
    type: 'ai.textGeneration',
    category: 'ai',
    name: 'AI Text Generator',
    description: 'Prompt LLM models (Gemini / OpenAI) for copy, summary, or JSON.',
    icon: Bot,
  },
];

interface NodeLibraryProps {
  onAddNode: (item: AvailableNodeItem) => void;
}

export const NodeLibrary: React.FC<NodeLibraryProps> = ({ onAddNode }) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredNodes = NODE_CATALOG.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col h-full overflow-hidden select-none">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-900">Node Library</h3>
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter nodes..."
        />
        {/* Category Pills */}
        <div className="flex flex-wrap gap-1 text-[11px] font-semibold">
          {['all', 'trigger', 'action', 'logic', 'data', 'ai'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 rounded capitalize transition-colors ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Nodes List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredNodes.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            No matching nodes found.
          </div>
        ) : (
          filteredNodes.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.type}
                onClick={() => onAddNode(item)}
                className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-white hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer group"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white text-slate-700 border border-slate-200 group-hover:border-blue-400 group-hover:text-blue-600 mt-0.5">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800 group-hover:text-blue-600">
                      {item.name}
                    </span>
                    <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight mt-0.5 line-clamp-2">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 text-center">
        Click any node to append to the canvas.
      </div>
    </aside>
  );
};
