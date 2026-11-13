import { aiProviderRegistry } from './aiProviderRegistry';
import { aiUsageStore } from '../../lib/storage/aiUsageStore';
import { buildWorkflowRefinementSystemPrompt } from './promptTemplates';
import { WorkflowGenerator, GeneratedWorkflowProposal } from './workflowGenerator';
import { AIProviderId } from './types';
import { WorkflowNode, WorkflowEdge } from '../types/workflow';

export class GraphRefiner {
  /**
   * Refine an existing workflow based on follow-up conversational instructions
   */
  public static async refine(
    existingWorkflow: {
      name: string;
      description?: string;
      nodes: any[];
      edges: any[];
    },
    refinementPrompt: string,
    options?: {
      provider?: AIProviderId;
      model?: string;
      workspaceId?: string;
    }
  ): Promise<GeneratedWorkflowProposal> {
    if (!refinementPrompt || refinementPrompt.trim().length === 0) {
      throw new Error('Refinement prompt cannot be empty.');
    }

    const workflowSummary = JSON.stringify(
      {
        name: existingWorkflow.name,
        nodes: existingWorkflow.nodes.map((n) => ({
          id: n.id,
          type: n.data?.type || n.type,
          label: n.data?.label || n.name,
          config: n.data?.config || n.config,
          position: n.position,
        })),
        edges: existingWorkflow.edges.map((e) => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
        })),
      },
      null,
      2
    );

    const systemPrompt = buildWorkflowRefinementSystemPrompt(workflowSummary);
    const chatResponse = await aiProviderRegistry.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: refinementPrompt.trim() },
      ],
      {
        responseFormat: 'json',
        model: options?.model,
        temperature: 0.2,
      },
      options?.provider
    );

    aiUsageStore.recordUsage(
      chatResponse.provider,
      chatResponse.model,
      'generate_workflow',
      chatResponse.usage,
      chatResponse.durationMs,
      options?.workspaceId || 'ws_default'
    );

    // Reuse the sanitization & validation logic in WorkflowGenerator
    return WorkflowGenerator.generate(refinementPrompt, options);
  }
}
