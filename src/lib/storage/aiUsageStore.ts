import fs from 'fs';
import path from 'path';
import { AITokenUsage, AIProviderId } from '../../core/ai/types';

export interface AIUsageLogEntry {
  id: string;
  provider: AIProviderId;
  model: string;
  operation: 'generate_workflow' | 'explain_workflow' | 'error_assistant' | 'optimize_workflow' | 'chat' | 'node_execution';
  usage: AITokenUsage;
  durationMs: number;
  timestamp: string;
  workspaceId: string;
}

export interface AIUsageSummary {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  byProvider: Record<string, { requests: number; tokens: number; costUsd: number }>;
  byModel: Record<string, { requests: number; tokens: number; costUsd: number }>;
  recentLogs: AIUsageLogEntry[];
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'ai_usage.json');

export class AIUsageStore {
  private static instance: AIUsageStore;
  private cache: AIUsageLogEntry[] = [];
  private isLoaded = false;

  private constructor() {
    this.ensureDataFile();
  }

  public static getInstance(): AIUsageStore {
    if (!AIUsageStore.instance) {
      AIUsageStore.instance = new AIUsageStore();
    }
    return AIUsageStore.instance;
  }

  private ensureDataFile(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      const initialLogs: AIUsageLogEntry[] = [
        {
          id: 'ai_log_seed_1',
          provider: 'openai',
          model: 'gpt-4o-mini',
          operation: 'generate_workflow',
          usage: { promptTokens: 650, completionTokens: 420, totalTokens: 1070, estimatedCostUsd: 0.00035 },
          durationMs: 820,
          timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
          workspaceId: 'ws_default',
        },
        {
          id: 'ai_log_seed_2',
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          operation: 'explain_workflow',
          usage: { promptTokens: 920, completionTokens: 310, totalTokens: 1230, estimatedCostUsd: 0.00021 },
          durationMs: 410,
          timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
          workspaceId: 'ws_default',
        },
      ];
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialLogs, null, 2), 'utf-8');
      this.cache = initialLogs;
      this.isLoaded = true;
    }
  }

  private load(): void {
    if (this.isLoaded) return;
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.cache = JSON.parse(raw);
      }
    } catch {
      this.cache = [];
    }
    this.isLoaded = true;
  }

  private save(): void {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to persist AI usage logs:', e);
    }
  }

  public recordUsage(
    provider: AIProviderId,
    model: string,
    operation: AIUsageLogEntry['operation'],
    usage: AITokenUsage,
    durationMs: number,
    workspaceId = 'ws_default'
  ): AIUsageLogEntry {
    this.load();
    const entry: AIUsageLogEntry = {
      id: `ai_log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      provider,
      model,
      operation,
      usage,
      durationMs,
      timestamp: new Date().toISOString(),
      workspaceId,
    };

    this.cache.unshift(entry);
    // Keep last 1,000 entries
    if (this.cache.length > 1000) {
      this.cache = this.cache.slice(0, 1000);
    }
    this.save();
    return entry;
  }

  public getSummary(workspaceId = 'ws_default'): AIUsageSummary {
    this.load();
    const logs = this.cache.filter((l) => !workspaceId || l.workspaceId === workspaceId);

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCostUsd = 0;
    const byProvider: Record<string, { requests: number; tokens: number; costUsd: number }> = {};
    const byModel: Record<string, { requests: number; tokens: number; costUsd: number }> = {};

    for (const log of logs) {
      totalPromptTokens += log.usage.promptTokens;
      totalCompletionTokens += log.usage.completionTokens;
      totalCostUsd += log.usage.estimatedCostUsd;

      // By Provider
      if (!byProvider[log.provider]) {
        byProvider[log.provider] = { requests: 0, tokens: 0, costUsd: 0 };
      }
      byProvider[log.provider].requests += 1;
      byProvider[log.provider].tokens += log.usage.totalTokens;
      byProvider[log.provider].costUsd += log.usage.estimatedCostUsd;

      // By Model
      if (!byModel[log.model]) {
        byModel[log.model] = { requests: 0, tokens: 0, costUsd: 0 };
      }
      byModel[log.model].requests += 1;
      byModel[log.model].tokens += log.usage.totalTokens;
      byModel[log.model].costUsd += log.usage.estimatedCostUsd;
    }

    return {
      totalRequests: logs.length,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      byProvider,
      byModel,
      recentLogs: logs.slice(0, 20),
    };
  }
}

export const aiUsageStore = AIUsageStore.getInstance();
