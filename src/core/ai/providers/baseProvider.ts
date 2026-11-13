import { AIModelInfo, AIMessage, AITokenUsage, AIProviderId } from '../types';

export abstract class BaseAIProvider {
  abstract readonly id: AIProviderId;
  abstract readonly name: string;
  abstract getModels(): AIModelInfo[];
  abstract getDefaultModel(): string;

  /**
   * Approximate token count for a text string (~4 chars per token)
   */
  protected estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
  }

  /**
   * Calculate cost based on model pricing
   */
  protected calculateCost(modelId: string, promptTokens: number, completionTokens: number): number {
    const model = this.getModels().find((m) => m.id === modelId) || this.getModels()[0];
    if (!model) return 0;
    const inputCost = (promptTokens / 1000) * model.inputCostPer1k;
    const outputCost = (completionTokens / 1000) * model.outputCostPer1k;
    return Number((inputCost + outputCost).toFixed(6));
  }

  /**
   * Redact common sensitive credentials and authorization tokens from prompts
   */
  public redactSecrets(content: string): string {
    if (!content) return '';
    return content
      .replace(/(Bearer\s+)[a-zA-Z0-9_\-\.]{20,}/gi, '$1[REDACTED_TOKEN]')
      .replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[a-zA-Z0-9_\-\.]{16,}["']?/gi, '$1[REDACTED_API_KEY]')
      .replace(/(password["']?\s*[:=]\s*["']?)[^"'\s\n]{6,}["']?/gi, '$1[REDACTED_PASSWORD]')
      .replace(/(xox[baprs]-[0-9a-zA-Z]{10,})/gi, '[REDACTED_SLACK_TOKEN]')
      .replace(/(fpsec_[a-zA-Z0-9]{20,})/gi, '[REDACTED_WEBHOOK_SECRET]')
      .replace(/(ghp_[a-zA-Z0-9]{36})/gi, '[REDACTED_GITHUB_TOKEN]');
  }

  /**
   * Create an AbortSignal with timeout
   */
  protected createTimeoutSignal(timeoutMs = 30000, externalSignal?: AbortSignal): {
    signal: AbortSignal;
    cleanup: () => void;
  } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error(`AI Request timed out after ${timeoutMs}ms`)), timeoutMs);

    if (externalSignal) {
      externalSignal.addEventListener('abort', () => {
        controller.abort(externalSignal.reason);
      });
    }

    return {
      signal: controller.signal,
      cleanup: () => clearTimeout(timeoutId),
    };
  }

  /**
   * Extract JSON cleanly from LLM markdown code blocks
   */
  protected extractJsonFromMarkdown(content: string): any {
    try {
      // 1. Direct JSON parse
      return JSON.parse(content.trim());
    } catch {
      // 2. Extract from ```json ... ``` code fence
      const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenceMatch && fenceMatch[1]) {
        try {
          return JSON.parse(fenceMatch[1].trim());
        } catch {
          // Continue to regex object finder
        }
      }

      // 3. Find first { ... } or [ ... ]
      const braceMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (braceMatch && braceMatch[1]) {
        try {
          return JSON.parse(braceMatch[1].trim());
        } catch {
          // ignore
        }
      }
    }
    return null;
  }
}

