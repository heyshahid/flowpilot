'use client';

import React, { useState } from 'react';
import { SearchInput } from '@/components/ui/SearchInput';
import { getAllNodeDefinitions, NodeDefinition } from '@/core/registry/nodeRegistry';
import { resolveNodeIcon } from './nodeIcons';
import { Plus, Layers, GripVertical } from 'lucide-react';
import { NodeCategory } from '@/core/types/workflow';

interface NodeLibraryProps {
  onAddNode: (item: NodeDefinition<any>) => void;
}

export const NodeLibrary: React.FC<NodeLibraryProps> = ({ onAddNode }) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const allNodes = getAllNodeDefinitions();

  const filteredNodes = allNodes.filter((item) => {
    const matchesSearch =
      item.displayName.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col h-full overflow-hidden select-none">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-sm text-slate-900">Node Library</h3>
          </div>
          <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {allNodes.length} Nodes
          </span>
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
          <div className="p-6 text-center text-xs text-slate-400">
            No matching nodes found.
          </div>
        ) : (
          filteredNodes.map((item) => {
            const Icon = resolveNodeIcon(item.icon);
            return (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => onDragStart(e, item.type)}
                onClick={() => onAddNode(item)}
                className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-100 bg-slate-50/70 hover:bg-white hover:border-blue-300 hover:shadow-xs transition-all cursor-grab active:cursor-grabbing group"
                title="Drag onto canvas or click to add"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white text-slate-700 border border-slate-200 group-hover:border-blue-400 group-hover:text-blue-600 mt-0.5">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800 group-hover:text-blue-600 truncate">
                      {item.displayName}
                    </span>
                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                      <GripVertical className="w-3 h-3 text-slate-400" />
                      <Plus className="w-3 h-3 text-blue-600" />
                    </div>
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

      <div className="p-2.5 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 text-center flex items-center justify-center gap-1">
        <GripVertical className="w-3.5 h-3.5 text-slate-400" />
        <span>Drag nodes onto canvas, or click to append.</span>
      </div>
    </aside>
  );
};
