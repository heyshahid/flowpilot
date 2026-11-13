import { BaseAIProvider } from './baseProvider';
import { AIProviderAdapter, AIProviderId, AIModelInfo, AIMessage, AIChatOptions, AIChatResponse } from '../types';

export class AnthropicProvider extends BaseAIProvider implements AIProviderAdapter {
  readonly id: AIProviderId = 'anthropic';
  readonly name = 'Anthropic (Claude)';

  getModels(): AIModelInfo[] {
    return [
      {
        id: 'claude-3-5-sonnet-latest',
        name: 'Claude 3.5 Sonnet',
        contextWindow: 200000,
        inputCostPer1k: 0.003,
        outputCostPer1k: 0.015,
        isDefault: true,
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        contextWindow: 200000,
        inputCostPer1k: 0.00025,
        outputCostPer1k: 0.00125,
      },
    ];
  }

  getDefaultModel(): string {
    return 'claude-3-5-sonnet-latest';
  }

  async testConnection(apiKey?: string): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return { success: false, message: 'Anthropic API key is missing. Please configure credentials.', latencyMs: 0 };
    }

    const start = Date.now();
    try {
      // Anthropic does not have a /models GET endpoint in basic v1 without an empty message
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return {
          success: false,
          message: errorData.error?.message || `Anthropic returned HTTP ${res.status}`,
          latencyMs,
        };
      }

      return { success: true, message: 'Successfully connected to Anthropic API.', latencyMs };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network connection failed.', latencyMs: Date.now() - start };
    }
  }

  async chat(messages: AIMessage[], options?: AIChatOptions, apiKey?: string): Promise<AIChatResponse> {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('Anthropic API Key is not configured.');
    }

    const model = options?.model || this.getDefaultModel();
    const { signal, cleanup } = this.createTimeoutSignal(options?.timeoutMs || 45000, options?.abortSignal);
    const start = Date.now();

    try {
      let systemPrompt = '';
      const userAndAssistantMessages: { role: 'user' | 'assistant'; content: string }[] = [];

      for (const m of messages) {
        if (m.role === 'system') {
          systemPrompt += (systemPrompt ? '\n\n' : '') + this.redactSecrets(m.content);
        } else {
          userAndAssistantMessages.push({
            role: m.role,
            content: this.redactSecrets(m.content),
          });
        }
      }

      const bodyPayload: any = {
        model,
        max_tokens: options?.maxTokens ?? 2500,
        temperature: options?.temperature ?? 0.3,
        messages: userAndAssistantMessages,
      };

      if (systemPrompt) {
        bodyPayload.system = systemPrompt;
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(bodyPayload),
        signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic API returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const content = data.content?.[0]?.text || '';
      const promptTokens = data.usage?.input_tokens || this.estimateTokens(JSON.stringify(messages));
      const completionTokens = data.usage?.output_tokens || this.estimateTokens(content);
      const totalTokens = promptTokens + completionTokens;
      const estimatedCostUsd = this.calculateCost(model, promptTokens, completionTokens);

      return {
        content,
        parsedJson: options?.responseFormat === 'json' ? this.extractJsonFromMarkdown(content) : undefined,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
          estimatedCostUsd,
        },
        model,
        provider: this.id,
        durationMs: Date.now() - start,
      };
    } finally {
      cleanup();
    }
  }
}

