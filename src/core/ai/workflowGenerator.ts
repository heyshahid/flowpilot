import { aiProviderRegistry } from './aiProviderRegistry';
import { aiUsageStore } from '../../lib/storage/aiUsageStore';
import { credentialStore } from '../../lib/storage/credentialStore';
import { getNodeDefinition, getAllNodeDefinitions } from '../registry/nodeRegistry';
import { validateWorkflowGraph } from '../validation/graphValidator';
import { buildWorkflowGenerationSystemPrompt } from './promptTemplates';
import { AIProviderId, AITokenUsage } from './types';
import { WorkflowGraph, WorkflowEdge as CanvasEdge, NodeCategory } from '../types/workflow';

export interface GeneratedWorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    type: string;
    config: Record<string, any>;
    category: NodeCategory;
    isValid: boolean;
  };
}

export interface GeneratedWorkflowProposal {
  name: string;
  description: string;
  nodes: GeneratedWorkflowNode[];
  edges: CanvasEdge[];
  explanation: string;
  requiredIntegrations: string[];
  missingCredentials: string[];
  warnings: string[];
  isValid: boolean;
  validationErrors: string[];
  usage: AITokenUsage;
  provider: AIProviderId;
  model: string;
}

export class WorkflowGenerator {
  private static integrationMap: Record<string, string> = {
    'action.slack': 'slack',
    'action.googleSheets': 'google_sheets',
    'action.sendEmail': 'smtp',
    'action.telegram': 'telegram',
  };

  /**
   * Generate a proposed visual workflow DAG from a natural language prompt
   */
  public static async generate(
    userPrompt: string,
    options?: {
      provider?: AIProviderId;
      model?: string;
      workspaceId?: string;
    }
  ): Promise<GeneratedWorkflowProposal> {
    if (!userPrompt || userPrompt.trim().length === 0) {
      throw new Error('User prompt cannot be empty.');
    }

    const systemPrompt = buildWorkflowGenerationSystemPrompt();
    const chatResponse = await aiProviderRegistry.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt.trim() },
      ],
      {
        responseFormat: 'json',
        model: options?.model,
        temperature: 0.2,
      },
      options?.provider
    );

    // Record token usage
    aiUsageStore.recordUsage(
      chatResponse.provider,
      chatResponse.model,
      'generate_workflow',
      chatResponse.usage,
      chatResponse.durationMs,
      options?.workspaceId || 'ws_default'
    );

    let parsed = chatResponse.parsedJson;
    if (!parsed) {
      throw new Error('AI provider failed to return a valid JSON workflow graph.');
    }

    // Standardize nodes and edges
    const name = parsed.name || 'AI Generated Workflow';
    const description = parsed.description || 'Generated from prompt: ' + userPrompt.slice(0, 80);
    const rawNodes: any[] = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const rawEdges: any[] = Array.isArray(parsed.edges) ? parsed.edges : [];
    const explanation = parsed.explanation || 'Workflow generated to satisfy prompt requirements.';

    const validationErrors: string[] = [];
    const warnings: string[] = [];
    const requiredIntegrationsSet = new Set<string>();

    // 1. Process & Sanitize Nodes
    const sanitizedNodes: GeneratedWorkflowNode[] = rawNodes.map((node, index) => {
      const type = node.type || node.data?.type || 'action.httpRequest';
      const nodeDef = getNodeDefinition(type);

      if (!nodeDef) {
        validationErrors.push(`Node #${index + 1} uses unregistered type "${type}".`);
      }

      // Check integration dependency
      const integration = this.integrationMap[type];
      if (integration) {
        requiredIntegrationsSet.add(integration);
      }

      const label = node.data?.label || node.label || nodeDef?.displayName || `Node ${index + 1}`;
      const config = {
        ...(nodeDef?.defaultConfig || {}),
        ...(node.data?.config || node.config || {}),
      };

      // Validate config with schema
      if (nodeDef) {
        const valRes = nodeDef.validate(config);
        if (!valRes.isValid) {
          validationErrors.push(...valRes.errors.map((e) => `${label}: ${e}`));
        }
      }

      const position = node.position || {
        x: 250,
        y: 50 + index * 140,
      };

      return {
        id: node.id || `node_${index + 1}`,
        type: 'custom',
        position,
        data: {
          label,
          type,
          config,
          category: nodeDef?.category || 'action',
          isValid: true,
        },
      } as GeneratedWorkflowNode;
    });

    // 2. Process & Sanitize Edges
    const sanitizedEdges: CanvasEdge[] = rawEdges.map((edge, index) => ({
      id: edge.id || `edge_${index + 1}`,
      source: edge.source,
      sourceHandle: edge.sourceHandle || 'default',
      target: edge.target,
      targetHandle: edge.targetHandle || 'default',
      animated: edge.animated ?? true,
    }));

    // 3. Topology Validation using FlowPilot's Graph Validator
    const graphForValidator: WorkflowGraph = {
      id: 'wf_ai_generated',
      name,
      nodes: sanitizedNodes.map((n) => ({
        id: n.id,
        name: n.data.label,
        category: n.data.category,
        type: n.data.type,
        config: n.data.config,
        metadata: { position: n.position },
      })),
      edges: sanitizedEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
      })),
    };

    const graphValidation = validateWorkflowGraph(graphForValidator);
    if (!graphValidation.isValid) {
      for (const issue of graphValidation.issues) {
        if (issue.type === 'error') {
          validationErrors.push(issue.message);
        } else {
          warnings.push(issue.message);
        }
      }
    }

    // 4. Verify Credentials for Required Integrations
    const requiredIntegrations = Array.from(requiredIntegrationsSet);
    const existingCreds = credentialStore.listSync();
    const missingCredentials: string[] = [];

    for (const integ of requiredIntegrations) {
      const hasCred = existingCreds.some(
        (c) => c.integrationId === integ && c.status === 'valid'
      );
      if (!hasCred) {
        missingCredentials.push(integ);
        warnings.push(
          `Integration "${integ}" is required but no active credentials were found. Please configure ${integ} credentials before running.`
        );
      }
    }

    return {
      name,
      description,
      nodes: sanitizedNodes,
      edges: sanitizedEdges,
      explanation,
      requiredIntegrations,
      missingCredentials,
      warnings,
      isValid: validationErrors.length === 0,
      validationErrors,
      usage: chatResponse.usage,
      provider: chatResponse.provider,
      model: chatResponse.model,
    };
  }
}
