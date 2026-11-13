'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  HelpCircle,
  TrendingUp,
  Cpu,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { WorkflowNode, WorkflowEdge } from '@/core/types/workflow';

interface AiCanvasAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  workflowName: string;
  nodes: any[];
  edges: any[];
  onApplyChanges: (newNodes: any[], newEdges: any[]) => void;
}

export const AiCanvasAssistantDrawer: React.FC<AiCanvasAssistantDrawerProps> = ({
  isOpen,
  onClose,
  workflowId,
  workflowName,
  nodes,
  edges,
  onApplyChanges,
}) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'explain' | 'optimize'>('prompt');
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [explanation, setExplanation] = useState<any>(null);
  const [optimizations, setOptimizations] = useState<any>(null);
  const [proposedResult, setProposedResult] = useState<any>(null);

  if (!isOpen) return null;

  const handleRefineOrGenerate = async () => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/ai/refine-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: {
            name: workflowName,
            nodes,
            edges,
          },
          prompt: prompt.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setProposedResult(data.data);
      } else {
        alert(data.error || 'Failed to generate updates.');
      }
    } catch (err: any) {
      alert(err.message || 'Error processing AI instruction.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExplain = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/ai/explain-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: {
            name: workflowName,
            nodes,
            edges,
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setExplanation(data.data);
      }
    } catch (err: any) {
      alert(err.message || 'Error fetching explanation.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOptimize = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/ai/optimize-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: {
            name: workflowName,
            nodes,
            edges,
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setOptimizations(data.data);
      }
    } catch (err: any) {
      alert(err.message || 'Error fetching optimizations.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 bg-white border-l border-slate-200 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          <h3 className="font-bold text-sm text-slate-800">AI Copilot</h3>
          <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300 text-[10px] py-0">
            Intelligent DAG
          </Badge>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50 p-1 gap-1">
        <button
          onClick={() => setActiveTab('prompt')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeTab === 'prompt' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          Modify Graph
        </button>
        <button
          onClick={() => {
            setActiveTab('explain');
            if (!explanation) handleExplain();
          }}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeTab === 'explain' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          Explain
        </button>
        <button
          onClick={() => {
            setActiveTab('optimize');
            if (!optimizations) handleOptimize();
          }}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeTab === 'optimize' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          Optimize
        </button>
      </div>

      {/* Body Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
        {activeTab === 'prompt' && (
          <div className="space-y-4">
            <label className="font-semibold text-slate-700 block">
              Describe changes to make to this canvas:
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Add an If/Else condition to verify email format, or append an alert to Slack..."
              rows={4}
              className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleRefineOrGenerate}
              disabled={!prompt.trim() || isLoading}
              isLoading={isLoading}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Generate Graph Updates
            </Button>

            {proposedResult && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="font-semibold text-slate-800 flex items-center justify-between">
                  <span>Proposed Updates</span>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                    {proposedResult.nodes.length} Nodes
                  </Badge>
                </div>
                <p className="text-slate-600 text-[11px]">{proposedResult.explanation}</p>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onApplyChanges(proposedResult.nodes, proposedResult.edges);
                    setProposedResult(null);
                    setPrompt('');
                    onClose();
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                >
                  Apply Changes to Canvas
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'explain' && (
          <div className="space-y-3">
            {isLoading && <div className="text-center py-8 text-slate-400">Analyzing workflow graph...</div>}
            {explanation && (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-slate-700">
                  <span className="font-bold text-indigo-900 block mb-1">Overview:</span>
                  {explanation.overview}
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-slate-800 block">Step-by-Step Breakdown:</span>
                  {explanation.stepBreakdown.map((s: any, idx: number) => (
                    <div key={idx} className="p-2.5 rounded-lg border border-slate-200 bg-white">
                      <span className="font-semibold text-slate-800">{s.node}</span>
                      <p className="text-slate-500 text-[11px] mt-0.5">{s.role}</p>
                    </div>
                  ))}
                </div>

                {explanation.potentialFailurePoints?.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-bold text-amber-800 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Potential Edge Cases:
                    </span>
                    <ul className="list-disc pl-4 text-slate-600 space-y-1">
                      {explanation.potentialFailurePoints.map((pt: string, i: number) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'optimize' && (
          <div className="space-y-3">
            {isLoading && <div className="text-center py-8 text-slate-400">Inspecting graph bottlenecks...</div>}
            {optimizations && (
              <div className="space-y-3">
                <p className="text-slate-600">{optimizations.summary}</p>
                {optimizations.optimizations.map((item: any, i: number) => (
                  <div key={i} className="p-3 rounded-xl border border-slate-200 bg-white space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{item.issue}</span>
                      <Badge
                        variant="outline"
                        className={
                          item.impact === 'high'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }
                      >
                        {item.impact} impact
                      </Badge>
                    </div>
                    <p className="text-slate-600 text-[11px]">{item.recommendation}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
