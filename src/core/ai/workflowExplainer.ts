import { aiProviderRegistry } from './aiProviderRegistry';
import { aiUsageStore } from '../../lib/storage/aiUsageStore';
import { buildWorkflowExplanationSystemPrompt } from './promptTemplates';
import { AIProviderId, AITokenUsage } from './types';
import { WorkflowNode, WorkflowEdge } from '../types/workflow';

export interface WorkflowExplanationResult {
  overview: string;
  triggerSummary: string;
  stepBreakdown: Array<{ node: string; role: string }>;
  potentialFailurePoints: string[];
  recommendations: string[];
  usage: AITokenUsage;
}

export class WorkflowExplainer {
  public static async explain(
    workflow: {
      name: string;
      description?: string;
      nodes: any[];
      edges: any[];
    },
    options?: {
      provider?: AIProviderId;
      model?: string;
      workspaceId?: string;
    }
  ): Promise<WorkflowExplanationResult> {
    const systemPrompt = buildWorkflowExplanationSystemPrompt();
    const workflowPayload = {
      name: workflow.name,
      description: workflow.description,
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
          content: `Please explain this workflow in detail:\n\n${JSON.stringify(workflowPayload, null, 2)}`,
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
      'explain_workflow',
      chatResponse.usage,
      chatResponse.durationMs,
      options?.workspaceId || 'ws_default'
    );

    const parsed = chatResponse.parsedJson || {};

    return {
      overview: parsed.overview || `This workflow "${workflow.name}" orchestrates ${workflow.nodes.length} connected steps.`,
      triggerSummary: parsed.triggerSummary || 'Workflow begins at the root trigger node.',
      stepBreakdown: Array.isArray(parsed.stepBreakdown) ? parsed.stepBreakdown : [],
      potentialFailurePoints: Array.isArray(parsed.potentialFailurePoints) ? parsed.potentialFailurePoints : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      usage: chatResponse.usage,
    };
  }
}
