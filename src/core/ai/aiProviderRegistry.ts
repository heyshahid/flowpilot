import { AIProviderAdapter, AIProviderId, AIProviderStatus, AIMessage, AIChatOptions, AIChatResponse } from './types';
import { OpenAIProvider } from './providers/openaiProvider';
import { AnthropicProvider } from './providers/anthropicProvider';
import { GeminiProvider } from './providers/geminiProvider';
import { MockAIProvider } from './providers/mockProvider';
import { credentialStore } from '../../lib/storage/credentialStore';
import { CredentialVault } from '../security/vault';

export class AIProviderRegistry {
  private static instance: AIProviderRegistry;
  private providers: Map<AIProviderId, AIProviderAdapter> = new Map();
  private activeProviderId: AIProviderId = 'mock';
  private activeModel: string = 'flowpilot-mock-v1';

  private constructor() {
    this.register(new MockAIProvider());
    this.register(new OpenAIProvider());
    this.register(new AnthropicProvider());
    this.register(new GeminiProvider());

    // Check if an environment provider is available
    if (process.env.OPENAI_API_KEY) {
      this.activeProviderId = 'openai';
      this.activeModel = 'gpt-4o-mini';
    } else if (process.env.GEMINI_API_KEY) {
      this.activeProviderId = 'gemini';
      this.activeModel = 'gemini-2.0-flash';
    } else if (process.env.ANTHROPIC_API_KEY) {
      this.activeProviderId = 'anthropic';
      this.activeModel = 'claude-3-5-sonnet-latest';
    }
  }

  public static getInstance(): AIProviderRegistry {
    if (!AIProviderRegistry.instance) {
      AIProviderRegistry.instance = new AIProviderRegistry();
    }
    return AIProviderRegistry.instance;
  }

  public register(provider: AIProviderAdapter): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: AIProviderId): AIProviderAdapter {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`AI Provider "${id}" is not registered.`);
    }
    return provider;
  }

  public getActiveProvider(): AIProviderAdapter {
    return this.getProvider(this.activeProviderId);
  }

  public setActiveProvider(providerId: AIProviderId, model?: string): void {
    const provider = this.getProvider(providerId);
    this.activeProviderId = providerId;
    if (model) {
      this.activeModel = model;
    } else {
      this.activeModel = provider.getDefaultModel();
    }
  }

  public getActiveModel(): string {
    return this.activeModel;
  }

  /**
   * Securely retrieve the stored API key for a provider from CredentialVault or env
   */
  public getApiKeyForProvider(providerId: AIProviderId): string | undefined {
    if (providerId === 'mock') return 'mock-key';

    // 1. Check database/storage credential vault
    const creds = credentialStore.listSync();
    const matchingCred = creds.find(
      (c) => c.integrationId === providerId || c.id === `cred_ai_${providerId}`
    );

    if (matchingCred && matchingCred.encryptedData) {
      try {
        const decrypted = CredentialVault.decrypt<{ apiKey?: string; token?: string }>(matchingCred.encryptedData);
        if (decrypted.apiKey || decrypted.token) {
          return decrypted.apiKey || decrypted.token;
        }
      } catch {
        // Fall back to env
      }
    }

    // 2. Check environment variables
    switch (providerId) {
      case 'openai':
        return process.env.OPENAI_API_KEY;
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY;
      case 'gemini':
        return process.env.GEMINI_API_KEY;
      default:
        return undefined;
    }
  }

  /**
   * List all providers with their configuration and active state
   */
  public listProviders(): AIProviderStatus[] {
    const result: AIProviderStatus[] = [];

    for (const [id, provider] of this.providers.entries()) {
      const apiKey = this.getApiKeyForProvider(id);
      const isConfigured = Boolean(apiKey || id === 'mock');

      result.push({
        id,
        name: provider.name,
        isConfigured,
        isActive: this.activeProviderId === id,
        defaultModel: provider.getDefaultModel(),
        availableModels: provider.getModels(),
      });
    }

    return result;
  }

  /**
   * Test connection to a provider
   */
  public async testProvider(
    providerId: AIProviderId,
    customApiKey?: string
  ): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const provider = this.getProvider(providerId);
    const key = customApiKey || this.getApiKeyForProvider(providerId);
    return provider.testConnection(key);
  }

  /**
   * Execute chat completion via the active or specified provider
   */
  public async chat(
    messages: AIMessage[],
    options?: AIChatOptions,
    preferredProviderId?: AIProviderId
  ): Promise<AIChatResponse> {
    const providerId = preferredProviderId || this.activeProviderId;
    const provider = this.getProvider(providerId);
    const apiKey = this.getApiKeyForProvider(providerId);

    const mergedOptions: AIChatOptions = {
      model: options?.model || (providerId === this.activeProviderId ? this.activeModel : provider.getDefaultModel()),
      ...options,
    };

    return provider.chat(messages, mergedOptions, apiKey);
  }
}

export const aiProviderRegistry = AIProviderRegistry.getInstance();
