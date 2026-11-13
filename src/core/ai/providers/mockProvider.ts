import { BaseAIProvider } from './baseProvider';
import { AIProviderAdapter, AIProviderId, AIModelInfo, AIMessage, AIChatOptions, AIChatResponse } from '../types';

export class MockAIProvider extends BaseAIProvider implements AIProviderAdapter {
  readonly id: AIProviderId = 'mock';
  readonly name = 'FlowPilot Local Mock AI';

  getModels(): AIModelInfo[] {
    return [
      {
        id: 'flowpilot-mock-v1',
        name: 'FlowPilot Deterministic Mock',
        contextWindow: 128000,
        inputCostPer1k: 0.0,
        outputCostPer1k: 0.0,
        isDefault: true,
      },
    ];
  }

  getDefaultModel(): string {
    return 'flowpilot-mock-v1';
  }

  async testConnection(): Promise<{ success: boolean; message: string; latencyMs: number }> {
    return {
      success: true,
      message: 'Local mock AI provider is active and operational.',
      latencyMs: 12,
    };
  }

  async chat(messages: AIMessage[], options?: AIChatOptions): Promise<AIChatResponse> {
    const startTime = Date.now();
    const lastMessage = messages[messages.length - 1]?.content || '';
    const safeContent = this.redactSecrets(lastMessage);

    let responseText = '';

    const lower = safeContent.toLowerCase();

    // 1. Workflow Explanation Query (Check first so "lead" in graph does not match generator)
    if (lower.includes('explain') || lower.includes('what does')) {
      const explanation = {
        overview: 'This workflow automates lead capture and qualification.',
        triggerSummary: 'Initiated by an incoming webhook payload containing contact details.',
        stepBreakdown: [
          { node: 'Form Submission', role: 'Captures JSON payload from external forms.' },
          { node: 'Check VIP Lead', role: 'Routes execution based on budget threshold ($5,000).' },
          { node: 'Notify VIP Channel', role: 'Alerts sales team via Slack when condition is TRUE.' },
          { node: 'Send Standard Welcome', role: 'Dispatches automated email when condition is FALSE.' },
        ],
        potentialFailurePoints: [
          'Missing or malformed email address in webhook payload.',
          'Unreachable Slack webhook if credentials expire.',
        ],
        recommendations: [
          'Add a Filter node to discard spam submissions before routing.',
        ],
      };
      responseText = JSON.stringify(explanation, null, 2);
    }
    // 2. Error Analysis Query
    else if (lower.includes('error') || lower.includes('failed') || lower.includes('diagnose')) {
      const errorDiagnosis = {
        summary: 'Target HTTP Endpoint Returned 404 Not Found',
        rootCause: 'The outbound HTTP Request node attempted to call an unresolvable URL path.',
        isHypothesis: false,
        suggestedFixes: [
          'Verify the target API endpoint URL and path parameters in node configuration.',
          'Ensure the query parameters or dynamic expressions evaluate to valid values.',
          'Check target server health and API documentation.',
        ],
        confidenceScore: 0.95,
      };
      responseText = JSON.stringify(errorDiagnosis, null, 2);
    }
    // 3. Workflow Generation or Refinement Query
    else if (
      lower.includes('generate') ||
      lower.includes('create') ||
      lower.includes('lead') ||
      lower.includes('form') ||
      lower.includes('workflow') ||
      lower.includes('refine') ||
      lower.includes('condition') ||
      lower.includes('add') ||
      lower.includes('check')
    ) {
      const generatedGraph = {
        name: 'Auto-Generated Workflow',
        description: 'Generated from natural language prompt by FlowPilot AI',
        nodes: [
          {
            id: 'node_trigger',
            type: 'trigger.webhook',
            position: { x: 250, y: 50 },
            data: {
              label: 'Form Submission Webhook',
              type: 'trigger.webhook',
              config: {
                httpMethod: 'POST',
                authRequired: false,
                responseStatusCode: 200,
                expectedFormat: 'json',
              },
            },
          },
          {
            id: 'node_condition',
            type: 'logic.ifElse',
            position: { x: 250, y: 180 },
            data: {
              label: 'Check VIP Lead',
              type: 'logic.ifElse',
              config: {
                field: '{{ $trigger.body.budget }}',
                operator: 'greater_than',
                value: '5000',
              },
            },
          },
          {
            id: 'node_slack',
            type: 'action.slack',
            position: { x: 100, y: 320 },
            data: {
              label: 'Notify VIP Channel',
              type: 'action.slack',
              config: {
                channel: '#vip-leads',
                message: 'New high-value lead: {{ $trigger.body.email }} with budget ${{ $trigger.body.budget }}',
              },
            },
          },
          {
            id: 'node_email',
            type: 'action.sendEmail',
            position: { x: 400, y: 320 },
            data: {
              label: 'Send Standard Welcome',
              type: 'action.sendEmail',
              config: {
                to: '{{ $trigger.body.email }}',
                subject: 'Thank you for contacting us',
                content: 'Hi {{ $trigger.body.name }}, we received your submission.',
                fromName: 'Sales Team',
              },
            },
          },
        ],
        edges: [
          {
            id: 'edge_1',
            source: 'node_trigger',
            sourceHandle: 'default',
            target: 'node_condition',
            targetHandle: 'default',
          },
          {
            id: 'edge_2',
            source: 'node_condition',
            sourceHandle: 'true',
            target: 'node_slack',
            targetHandle: 'default',
          },
          {
            id: 'edge_3',
            source: 'node_condition',
            sourceHandle: 'false',
            target: 'node_email',
            targetHandle: 'default',
          },
        ],
        explanation: 'This workflow listens for incoming form submissions via Webhook, evaluates if the submitted budget is greater than $5,000. If true, it alerts the VIP Slack channel; otherwise, it sends a standard welcome email.',
        requiredIntegrations: ['slack', 'smtp'],
      };

      responseText = JSON.stringify(generatedGraph, null, 2);
    }
    // 4. Default Assistant Response
    else {
      responseText = `I understand your request regarding: "${safeContent.slice(0, 80)}...". I can help you generate workflows, diagnose errors, or optimize node configurations.`;
    }

    const durationMs = Date.now() - startTime;
    const promptTokens = this.estimateTokens(safeContent);
    const completionTokens = this.estimateTokens(responseText);

    return {
      content: responseText,
      parsedJson: this.extractJsonFromMarkdown(responseText),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCostUsd: 0.0,
      },
      model: options?.model || this.getDefaultModel(),
      provider: this.id,
      durationMs,
    };
  }
}
