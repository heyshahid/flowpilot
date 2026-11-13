import { BaseAIProvider } from './baseProvider';
import { AIProviderAdapter, AIProviderId, AIModelInfo, AIMessage, AIChatOptions, AIChatResponse } from '../types';

export class OpenAIProvider extends BaseAIProvider implements AIProviderAdapter {
  readonly id: AIProviderId = 'openai';
  readonly name = 'OpenAI';

  getModels(): AIModelInfo[] {
    return [
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        contextWindow: 128000,
        inputCostPer1k: 0.00015,
        outputCostPer1k: 0.0006,
        isDefault: true,
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o (Omni)',
        contextWindow: 128000,
        inputCostPer1k: 0.0025,
        outputCostPer1k: 0.01,
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        contextWindow: 128000,
        inputCostPer1k: 0.01,
        outputCostPer1k: 0.03,
      },
    ];
  }

  getDefaultModel(): string {
    return 'gpt-4o-mini';
  }

  async testConnection(apiKey?: string): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      return { success: false, message: 'OpenAI API key is missing. Please configure credentials.', latencyMs: 0 };
    }

    const start = Date.now();
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
      });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return {
          success: false,
          message: errorData.error?.message || `OpenAI returned HTTP ${res.status}`,
          latencyMs,
        };
      }

      return { success: true, message: 'Successfully connected to OpenAI API.', latencyMs };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network connection failed.', latencyMs: Date.now() - start };
    }
  }

  async chat(messages: AIMessage[], options?: AIChatOptions, apiKey?: string): Promise<AIChatResponse> {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OpenAI API Key is not configured.');
    }

    const model = options?.model || this.getDefaultModel();
    const { signal, cleanup } = this.createTimeoutSignal(options?.timeoutMs || 45000, options?.abortSignal);
    const start = Date.now();

    try {
      const sanitizedMessages = messages.map((m) => ({
        role: m.role,
        content: this.redactSecrets(m.content),
      }));

      const bodyPayload: any = {
        model,
        messages: sanitizedMessages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 2500,
      };

      if (options?.responseFormat === 'json') {
        bodyPayload.response_format = { type: 'json_object' };
      }

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(bodyPayload),
        signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenAI API returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      const promptTokens = data.usage?.prompt_tokens || this.estimateTokens(JSON.stringify(sanitizedMessages));
      const completionTokens = data.usage?.completion_tokens || this.estimateTokens(content);
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

