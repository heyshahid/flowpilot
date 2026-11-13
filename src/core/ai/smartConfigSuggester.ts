import { aiProviderRegistry } from './aiProviderRegistry';
import { aiUsageStore } from '../../lib/storage/aiUsageStore';
import { AIProviderId, AITokenUsage } from './types';

export interface SmartConfigSuggestionResult {
  suggestedConfig: Record<string, any>;
  explanation: string;
  usage: AITokenUsage;
}

export class SmartConfigSuggester {
  public static async suggest(
    nodeType: string,
    userIntent: string,
    existingConfig: Record<string, any> = {},
    options?: {
      provider?: AIProviderId;
      model?: string;
      workspaceId?: string;
    }
  ): Promise<SmartConfigSuggestionResult> {
    const prompt = `You are FlowPilot Smart Configuration Assistant.
Suggest realistic, safe, production-ready configuration fields for node type: "${nodeType}".
User Goal: "${userIntent}"
Existing Config: ${JSON.stringify(existingConfig)}

Return STRICT JSON matching the structure:
{
  "suggestedConfig": { ...fields with FlowPilot template expressions like {{ $trigger.body.email }}... },
  "explanation": "Why these settings are recommended"
}`;

    const chatResponse = await aiProviderRegistry.chat(
      [{ role: 'user', content: prompt }],
      {
        responseFormat: 'json',
        model: options?.model,
      },
      options?.provider
    );

    aiUsageStore.recordUsage(
      chatResponse.provider,
      chatResponse.model,
      'node_execution',
      chatResponse.usage,
      chatResponse.durationMs,
      options?.workspaceId || 'ws_default'
    );

    const parsed = chatResponse.parsedJson || {};

    let fallbackConfig: Record<string, any> = {};
    if (nodeType === 'action.sendEmail') {
      fallbackConfig = {
        subject: 'Welcome to FlowPilot — Action Required',
        content: '<p>Hi {{ $trigger.body.name }},</p><p>Thank you for submitting your request. Our team is reviewing it now.</p>',
        fromName: 'FlowPilot Automation',
      };
    } else if (nodeType === 'action.slack') {
      fallbackConfig = {
        channel: '#leads',
        message: 'New high-priority lead captured: *{{ $trigger.body.email }}* | Budget: *${{ $trigger.body.budget }}*',
      };
    } else if (nodeType === 'logic.ifElse') {
      fallbackConfig = {
        field: '{{ $trigger.body.budget }}',
        operator: 'greater_than',
        value: '1000',
      };
    }

    return {
      suggestedConfig: parsed.suggestedConfig || fallbackConfig,
      explanation: parsed.explanation || `Configured ${nodeType} tailored to "${userIntent}".`,
      usage: chatResponse.usage,
    };
  }
}
