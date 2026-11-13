import { aiProviderRegistry } from './aiProviderRegistry';
import { aiUsageStore } from '../../lib/storage/aiUsageStore';
import { buildWorkflowOptimizationSystemPrompt } from './promptTemplates';
import { AIProviderId, AITokenUsage } from './types';
import { WorkflowNode, WorkflowEdge } from '../types/workflow';

export interface WorkflowOptimizationItem {
  type: 'redundancy' | 'reliability' | 'performance' | 'security';
  nodeId?: string;
  issue: string;
  recommendation: string;
  impact: 'low' | 'medium' | 'high';
}

export interface WorkflowOptimizationResult {
  summary: string;
  optimizations: WorkflowOptimizationItem[];
  usage: AITokenUsage;
}

export class WorkflowOptimizer {
  public static async analyze(
    workflow: {
      name: string;
      nodes: any[];
      edges: any[];
    },
    options?: {
      provider?: AIProviderId;
      model?: string;
      workspaceId?: string;
    }
  ): Promise<WorkflowOptimizationResult> {
    const systemPrompt = buildWorkflowOptimizationSystemPrompt();

    // Deterministic static graph analysis checks
    const staticIssues: WorkflowOptimizationItem[] = [];

    // Check for HTTP requests without retry or error continuation
    for (const node of workflow.nodes) {
      const type = node.data?.type || node.type;
      const config = node.data?.config || node.config || {};

      if (type === 'action.httpRequest' && !config.continueOnError) {
        staticIssues.push({
          type: 'reliability',
          nodeId: node.id,
          issue: `HTTP Request "${node.data?.label || node.id}" does not handle failure gracefully.`,
          recommendation: 'Enable "continueOnError" or add a conditional fallback branch to prevent workflow interruption.',
          impact: 'medium',
        });
      }

      if (type === 'logic.loop' && (!config.maxIterations || config.maxIterations > 500)) {
        staticIssues.push({
          type: 'performance',
          nodeId: node.id,
          issue: `Loop node "${node.data?.label || node.id}" has high or unbounded iteration ceiling.`,
          recommendation: 'Configure a sensible "maxIterations" (e.g. 50-100) to protect backend worker resources.',
          impact: 'high',
        });
      }
    }

    const workflowPayload = {
      name: workflow.name,
      nodeCount: workflow.nodes.length,
      edgeCount: workflow.edges.length,
      nodes: workflow.nodes.map((n) => ({
        id: n.id,
        label: n.data?.label || n.name,
        type: n.data?.type || n.type,
        config: n.data?.config || n.config,
      })),
      edges: workflow.edges.map((e) => ({
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
      })),
    };

    const chatResponse = await aiProviderRegistry.chat(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Inspect and optimize this workflow:\n\n${JSON.stringify(workflowPayload, null, 2)}`,
        },
      ],
      {
        responseFormat: 'json',
        model: options?.model,
      },
      options?.provider
    );

    aiUsageStore.recordUsage(
      chatResponse.provider,
      chatResponse.model,
      'optimize_workflow',
      chatResponse.usage,
      chatResponse.durationMs,
      options?.workspaceId || 'ws_default'
    );

    const parsed = chatResponse.parsedJson || {};
    const aiOptimizations: WorkflowOptimizationItem[] = Array.isArray(parsed.optimizations)
      ? parsed.optimizations
      : [];

    // Combine static rules with AI insights
    const allOptimizations = [...staticIssues, ...aiOptimizations];

    return {
      summary: parsed.summary || `Analysis completed for "${workflow.name}". ${allOptimizations.length} optimization opportunities identified.`,
      optimizations: allOptimizations,
      usage: chatResponse.usage,
    };
  }
}
