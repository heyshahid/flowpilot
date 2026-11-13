'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Bot,
  Send,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  Plus,
  Layers,
  Settings,
  ShieldCheck,
  ChevronRight,
  Zap,
  Cpu,
  Clock,
  Save,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { GeneratedWorkflowProposal } from '@/core/ai/workflowGenerator';

const PROMPT_SUGGESTIONS = [
  'When a form webhook arrives, check if budget > $5000, send a Slack alert to #vip-leads, or send a standard welcome email.',
  'Poll a payment API endpoint every hour, check transaction status, and send an alert to Telegram if status is failed.',
  'Capture customer contact form submissions, append details to Google Sheets, and notify our team on Slack.',
  'When a new user signs up, wait 2 hours, check if profile is verified, and send an onboarding email.',
];

export default function AIAssistantPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [proposal, setProposal] = useState<GeneratedWorkflowProposal | null>(null);
  const [refinementPrompt, setRefinementPrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>('mock');
  const [activeModel, setActiveModel] = useState<string>('flowpilot-mock-v1');
  const [availableProviders, setAvailableProviders] = useState<any[]>([]);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Fetch configured AI providers
  useEffect(() => {
    fetch('/api/v1/ai/providers')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAvailableProviders(data.data.providers || []);
          setActiveProvider(data.data.activeProviderId || 'mock');
          setActiveModel(data.data.activeModel || 'flowpilot-mock-v1');
        }
      })
      .catch((err) => console.error('Failed to load AI providers:', err));
  }, []);

  const handleGenerate = async (targetPrompt?: string) => {
    const textToSubmit = targetPrompt || prompt;
    if (!textToSubmit.trim() || isGenerating) return;

    setIsGenerating(true);
    setSaveSuccessMsg(null);

    try {
      const res = await fetch('/api/v1/ai/generate-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSubmit,
          provider: activeProvider,
          model: activeModel,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setProposal(data.data);
      } else {
        alert(data.error || 'Failed to generate workflow.');
      }
    } catch (err: any) {
      alert(err.message || 'Error communicating with AI service.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!proposal || !refinementPrompt.trim() || isRefining) return;

    setIsRefining(true);
    try {
      const res = await fetch('/api/v1/ai/refine-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: {
            name: proposal.name,
            description: proposal.description,
            nodes: proposal.nodes,
            edges: proposal.edges,
          },
          prompt: refinementPrompt,
          provider: activeProvider,
          model: activeModel,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setProposal(data.data);
        setRefinementPrompt('');
      } else {
        alert(data.error || 'Refinement failed.');
      }
    } catch (err: any) {
      alert(err.message || 'Error refining workflow.');
    } finally {
      setIsRefining(false);
    }
  };

  const handleSaveWorkflow = async () => {
    if (!proposal) return;

    try {
      const newWf = {
        name: proposal.name,
        description: proposal.description,
        status: 'draft',
        nodes: proposal.nodes.map((n) => ({
          id: n.id,
          name: n.data.label,
          category: n.data.category,
          type: n.data.type,
          config: n.data.config,
          metadata: { position: n.position },
        })),
        edges: proposal.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
        })),
      };

      const res = await fetch('/api/v1/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWf),
      });

      const data = await res.json();
      if (data.success) {
        setSaveSuccessMsg(`Workflow "${proposal.name}" saved successfully!`);
        setTimeout(() => {
          router.push(`/builder/${data.data.id}`);
        }, 1200);
      } else {
        alert(data.error || 'Failed to save workflow.');
      }
    } catch (err: any) {
      alert(err.message || 'Error saving workflow.');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50">
      {/* Top Header */}
      <div className="border-b border-slate-200 bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                FlowPilot AI Assistant
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                  Intelligent DAG Builder
                </Badge>
              </h1>
              <p className="text-sm text-slate-500">
                Transform plain English instructions into production-ready visual automation graphs.
              </p>
            </div>
          </div>

          {/* Provider Selection */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-400">Active Provider</div>
              <div className="text-xs font-semibold text-slate-700 capitalize flex items-center gap-1">
                <Bot className="w-3.5 h-3.5 text-indigo-600" />
                {activeProvider} ({activeModel})
              </div>
            </div>
            <Link href="/credentials">
              <Button variant="outline" size="sm" icon={<Settings className="w-3.5 h-3.5" />}>
                Configure APIs
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl w-full mx-auto p-8 space-y-8">
        {/* Prompt Input Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <label className="block text-sm font-semibold text-slate-800">
            Describe what you want to automate:
          </label>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. When a new customer submits a form, check their budget. If greater than $5,000, send an urgent notification to Slack #vip-leads, otherwise send an onboarding email..."
              rows={3}
              className="w-full rounded-xl border border-slate-300 p-4 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all outline-none resize-none"
            />
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Outputs are validated against real registered schemas before generation.
              </div>
              <Button
                variant="primary"
                onClick={() => handleGenerate()}
                disabled={!prompt.trim() || isGenerating}
                isLoading={isGenerating}
                icon={<Sparkles className="w-4 h-4" />}
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20"
              >
                {isGenerating ? 'Generating Graph...' : 'Generate Workflow'}
              </Button>
            </div>
          </div>

          {/* Quick Starters */}
          <div className="pt-2">
            <span className="text-xs font-medium text-slate-500 block mb-2">Prompt Starters:</span>
            <div className="flex flex-wrap gap-2">
              {PROMPT_SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPrompt(s);
                    handleGenerate(s);
                  }}
                  className="text-xs text-slate-600 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors text-left"
                >
                  {s.slice(0, 60)}...
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Success Banner */}
        {saveSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="font-semibold text-sm">{saveSuccessMsg} Redirecting to Canvas...</span>
            </div>
          </div>
        )}

        {/* Proposed Workflow Preview */}
        {proposal && (
          <div className="space-y-6">
            {/* Header / Actions Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-900">{proposal.name}</h2>
                  {proposal.isValid ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                      Valid DAG Schema
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                      Schema Errors Detected
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-1">{proposal.description}</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                  <span>{proposal.nodes.length} Nodes</span>
                  <span>•</span>
                  <span>{proposal.edges.length} Connections</span>
                  <span>•</span>
                  <span>Tokens Used: {proposal.usage.totalTokens}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={handleSaveWorkflow}
                  icon={<Save className="w-4 h-4" />}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  Save & Open in Canvas
                </Button>
              </div>
            </div>

            {/* Missing Credentials Warning Banner */}
            {proposal.missingCredentials.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-sm">Action Required: Missing Integrations</span>
                    <p className="text-xs text-amber-700 mt-0.5">
                      This workflow relies on: <strong>{proposal.missingCredentials.join(', ')}</strong>. Connect your API keys in Settings to activate execution.
                    </p>
                  </div>
                </div>
                <Link href="/credentials">
                  <Button variant="outline" size="sm" className="bg-white text-amber-900 border-amber-300">
                    Connect Credentials
                  </Button>
                </Link>
              </div>
            )}

            {/* Visual Node Flow Cards */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider text-xs">
                Proposed Execution Flow
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {proposal.nodes.map((node, i) => (
                  <div
                    key={node.id}
                    className="border border-slate-200 rounded-xl p-4 bg-slate-50 hover:bg-white hover:border-indigo-300 transition-all shadow-xs"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-slate-400">Step {i + 1}</span>
                      <Badge
                        variant="outline"
                        className={
                          node.data.category === 'trigger'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : node.data.category === 'logic'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }
                      >
                        {node.data.type}
                      </Badge>
                    </div>
                    <div className="font-semibold text-sm text-slate-800">{node.data.label}</div>
                    <div className="mt-2 text-xs text-slate-500 font-mono bg-white p-2 rounded border border-slate-200 overflow-hidden text-ellipsis whitespace-nowrap">
                      {JSON.stringify(node.data.config)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Explanation Text */}
              <div className="mt-4 p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 text-sm text-slate-700">
                <span className="font-semibold text-indigo-900 block mb-1">AI Explanation:</span>
                {proposal.explanation}
              </div>
            </div>

            {/* Conversational Refinement Drawer */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <RotateCw className="w-4 h-4 text-indigo-600" />
                Refine This Workflow
              </h3>
              <p className="text-xs text-slate-500">
                Want to make changes? Give follow-up instructions (e.g. &quot;Add a 2-hour delay before sending the email&quot; or &quot;Add a condition for customer country&quot;).
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={refinementPrompt}
                  onChange={(e) => setRefinementPrompt(e.target.value)}
                  placeholder="e.g. Also notify our Discord channel or add a condition..."
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRefine();
                  }}
                />
                <Button
                  variant="outline"
                  onClick={handleRefine}
                  disabled={!refinementPrompt.trim() || isRefining}
                  isLoading={isRefining}
                  icon={<Send className="w-3.5 h-3.5" />}
                >
                  Refine Graph
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
