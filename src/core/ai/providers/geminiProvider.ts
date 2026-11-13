import { BaseAIProvider } from './baseProvider';
import { AIProviderAdapter, AIProviderId, AIModelInfo, AIMessage, AIChatOptions, AIChatResponse } from '../types';

export class GeminiProvider extends BaseAIProvider implements AIProviderAdapter {
  readonly id: AIProviderId = 'gemini';
  readonly name = 'Google Gemini';

  getModels(): AIModelInfo[] {
    return [
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        contextWindow: 1048576,
        inputCostPer1k: 0.0001,
        outputCostPer1k: 0.0004,
        isDefault: true,
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        contextWindow: 2097152,
        inputCostPer1k: 0.00125,
        outputCostPer1k: 0.005,
      },
    ];
  }

  getDefaultModel(): string {
    return 'gemini-2.0-flash';
  }

  async testConnection(apiKey?: string): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      return { success: false, message: 'Google Gemini API key is missing. Please configure credentials.', latencyMs: 0 };
    }

    const start = Date.now();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
      const res = await fetch(url, { method: 'GET' });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return {
          success: false,
          message: errorData.error?.message || `Gemini API returned HTTP ${res.status}`,
          latencyMs,
        };
      }

      return { success: true, message: 'Successfully connected to Google Gemini API.', latencyMs };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network connection failed.', latencyMs: Date.now() - start };
    }
  }

  async chat(messages: AIMessage[], options?: AIChatOptions, apiKey?: string): Promise<AIChatResponse> {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('Google Gemini API Key is not configured.');
    }

    const model = options?.model || this.getDefaultModel();
    const { signal, cleanup } = this.createTimeoutSignal(options?.timeoutMs || 45000, options?.abortSignal);
    const start = Date.now();

    try {
      let systemInstruction: any = undefined;
      const contents: any[] = [];

      for (const m of messages) {
        if (m.role === 'system') {
          systemInstruction = {
            parts: [{ text: this.redactSecrets(m.content) }],
          };
        } else {
          contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: this.redactSecrets(m.content) }],
          });
        }
      }

      const bodyPayload: any = {
        contents,
        generationConfig: {
          temperature: options?.temperature ?? 0.3,
          maxOutputTokens: options?.maxTokens ?? 2500,
        },
      };

      if (systemInstruction) {
        bodyPayload.systemInstruction = systemInstruction;
      }

      if (options?.responseFormat === 'json') {
        bodyPayload.generationConfig.responseMimeType = 'application/json';
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
        signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const promptTokens = data.usageMetadata?.promptTokenCount || this.estimateTokens(JSON.stringify(messages));
      const completionTokens = data.usageMetadata?.candidatesTokenCount || this.estimateTokens(content);
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

