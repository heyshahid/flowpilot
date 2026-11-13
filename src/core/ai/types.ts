export type AIProviderId = 'openai' | 'anthropic' | 'gemini' | 'mock';

export interface AIModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  inputCostPer1k: number;   // USD
  outputCostPer1k: number;  // USD
  isDefault?: boolean;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

export interface AITokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AIChatResponse {
  content: string;
  parsedJson?: any;
  usage: AITokenUsage;
  model: string;
  provider: AIProviderId;
  durationMs: number;
}

export interface AIProviderStatus {
  id: AIProviderId;
  name: string;
  isConfigured: boolean;
  isActive: boolean;
  defaultModel: string;
  availableModels: AIModelInfo[];
  lastTestedAt?: string;
}

export interface AIProviderAdapter {
  readonly id: AIProviderId;
  readonly name: string;
  getModels(): AIModelInfo[];
  getDefaultModel(): string;
  testConnection(apiKey?: string): Promise<{ success: boolean; message: string; latencyMs: number }>;
  chat(messages: AIMessage[], options?: AIChatOptions, apiKey?: string): Promise<AIChatResponse>;
}
