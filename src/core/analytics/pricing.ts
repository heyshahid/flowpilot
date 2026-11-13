import { AIProviderId } from '../ai/types';
import { ModelPricingTier } from './types';

export const INITIAL_PRICING_REGISTRY: ModelPricingTier[] = [
  // OpenAI Tiers (Version 2026-Q1)
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60,
    currency: 'USD',
    effectiveFrom: '2026-01-01T00:00:00Z',
    pricingVersion: '2026-Q1',
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00,
    currency: 'USD',
    effectiveFrom: '2026-01-01T00:00:00Z',
    pricingVersion: '2026-Q1',
  },
  {
    provider: 'openai',
    model: 'gpt-4-turbo',
    inputPricePerMillion: 10.00,
    outputPricePerMillion: 30.00,
    currency: 'USD',
    effectiveFrom: '2026-01-01T00:00:00Z',
    pricingVersion: '2026-Q1',
  },
  // Anthropic Tiers (Version 2026-Q1)
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    currency: 'USD',
    effectiveFrom: '2026-01-01T00:00:00Z',
    pricingVersion: '2026-Q1',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-haiku',
    inputPricePerMillion: 0.80,
    outputPricePerMillion: 4.00,
    currency: 'USD',
    effectiveFrom: '2026-01-01T00:00:00Z',
    pricingVersion: '2026-Q1',
  },
  // Google Gemini Tiers (Version 2026-Q1)
  {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    inputPricePerMillion: 0.10,
    outputPricePerMillion: 0.40,
    currency: 'USD',
    effectiveFrom: '2026-01-01T00:00:00Z',
    pricingVersion: '2026-Q1',
  },
  {
    provider: 'gemini',
    model: 'gemini-1.5-pro',
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.00,
    currency: 'USD',
    effectiveFrom: '2026-01-01T00:00:00Z',
    pricingVersion: '2026-Q1',
  },
  // Deterministic Mock Provider (Zero cost)
  {
    provider: 'mock',
    model: 'flowpilot-mock-v1',
    inputPricePerMillion: 0.0,
    outputPricePerMillion: 0.0,
    currency: 'USD',
    effectiveFrom: '2026-01-01T00:00:00Z',
    pricingVersion: '2026-Q1',
  },
];

export class AIPricingManager {
  private static registry: ModelPricingTier[] = [...INITIAL_PRICING_REGISTRY];

  /**
   * Registers a new or updated model pricing tier.
   */
  public static registerTier(tier: ModelPricingTier): void {
    // Prepend so newer tiers for the same model take priority
    this.registry.unshift(tier);
  }

  /**
   * Resolves the applicable pricing tier for a provider and model as of a specific historical date.
   */
  public static getPricing(
    provider: AIProviderId,
    model: string,
    asOfDate: Date = new Date()
  ): ModelPricingTier | null {
    const targetTimestamp = asOfDate.getTime();
    const normalizedModel = model.toLowerCase().trim();

    // Find all matching tiers for provider and model
    const candidates = this.registry.filter(
      (t) =>
        t.provider === provider &&
        (t.model.toLowerCase() === normalizedModel || normalizedModel.includes(t.model.toLowerCase())) &&
        new Date(t.effectiveFrom).getTime() <= targetTimestamp
    );

    if (candidates.length === 0) return null;

    // Pick the most recent tier effective on or before the target date
    candidates.sort(
      (a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
    );

    return candidates[0];
  }

  /**
   * Calculates estimated cost based on token counts and the applicable historical pricing version.
   * If pricing tier is missing or uninstrumented, returns costUsd: null with isAvailable: false.
   */
  public static calculateCost(
    provider: AIProviderId,
    model: string,
    promptTokens: number,
    completionTokens: number,
    asOfDate: Date = new Date()
  ): {
    costUsd: number | null;
    isAvailable: boolean;
    pricingVersion?: string;
    currency: string;
  } {
    const tier = this.getPricing(provider, model, asOfDate);
    if (!tier) {
      return {
        costUsd: null,
        isAvailable: false,
        currency: 'USD',
      };
    }

    const inputCost = (promptTokens * tier.inputPricePerMillion) / 1_000_000;
    const outputCost = (completionTokens * tier.outputPricePerMillion) / 1_000_000;
    const totalCost = Number((inputCost + outputCost).toFixed(6));

    return {
      costUsd: totalCost,
      isAvailable: true,
      pricingVersion: tier.pricingVersion,
      currency: tier.currency,
    };
  }

  /**
   * Returns all active pricing tiers.
   */
  public static listTiers(): ModelPricingTier[] {
    return [...this.registry];
  }
}

