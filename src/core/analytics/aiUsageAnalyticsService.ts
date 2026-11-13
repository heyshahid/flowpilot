import { aiUsageStore, AIUsageLogEntry } from '../../lib/storage/aiUsageStore';
import { AIPricingManager } from './pricing';
import {
  AIModelUsageMetric,
  AIProviderUsageMetric,
  AITimeSeriesPoint,
  AIUsageAnalyticsOverview,
} from './integrationAiTypes';

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  groq: 'Groq',
  mock: 'FlowPilot Local Mock',
};

export class AIUsageAnalyticsService {
  private static instance: AIUsageAnalyticsService;

  public static getInstance(): AIUsageAnalyticsService {
    if (!AIUsageAnalyticsService.instance) {
      AIUsageAnalyticsService.instance = new AIUsageAnalyticsService();
    }
    return AIUsageAnalyticsService.instance;
  }

  public async getOverview(
    workspaceId: string = 'ws_default',
    startDate?: string,
    endDate?: string
  ): Promise<AIUsageAnalyticsOverview> {
    let logs = aiUsageStore.getRawLogs(workspaceId);

    // Apply date range filter
    if (startDate) {
      const s = new Date(startDate).getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() >= s);
    }
    if (endDate) {
      const e = new Date(endDate).getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() <= e);
    }

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalDurationMs = 0;
    let pricedSumUsd = 0;
    let unpricedRequestsCount = 0;
    const latencies: number[] = [];

    for (const log of logs) {
      totalPromptTokens += log.usage.promptTokens || 0;
      totalCompletionTokens += log.usage.completionTokens || 0;
      totalDurationMs += log.durationMs || 0;
      latencies.push(log.durationMs || 0);

      // Historical versioned pricing resolution
      const costResult = AIPricingManager.calculateCost(
        log.provider,
        log.model,
        log.usage.promptTokens,
        log.usage.completionTokens,
        new Date(log.timestamp)
      );

      if (costResult.isAvailable && costResult.costUsd !== null) {
        pricedSumUsd += costResult.costUsd;
      } else {
        unpricedRequestsCount++;
      }
    }

    latencies.sort((a, b) => a - b);
    const averageLatencyMs =
      logs.length > 0 ? Math.round((totalDurationMs / logs.length) * 10) / 10 : null;

    let medianLatencyMs: number | null = null;
    if (latencies.length > 0) {
      const mid = Math.floor(latencies.length / 2);
      medianLatencyMs =
        latencies.length % 2 !== 0
          ? latencies[mid]
          : Math.round(((latencies[mid - 1] + latencies[mid]) / 2) * 10) / 10;
    }

    const hasMissingPricingTiers = unpricedRequestsCount > 0;
    const estimatedTotalCostUsd =
      logs.length > 0 && unpricedRequestsCount < logs.length
        ? Number(pricedSumUsd.toFixed(6))
        : logs.length > 0 && unpricedRequestsCount === logs.length
        ? null
        : 0;

    return {
      workspaceId,
      totalRequests: logs.length,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      averageLatencyMs,
      medianLatencyMs,
      estimatedTotalCostUsd,
      costIsEstimated: true,
      currency: 'USD',
      sampleSize: logs.length,
      reportingPeriod: {
        startDate: logs.length > 0 ? logs[logs.length - 1].timestamp : startDate,
        endDate: logs.length > 0 ? logs[0].timestamp : endDate,
      },
      hasMissingPricingTiers,
      unpricedRequestsCount,
      disclaimer:
        'Cost figures are calculated estimates based on versioned per-million token pricing tiers active at request time. They represent advisory projections and may differ from official monthly invoices due to provider discounts, custom commitments, or caching credits.',
    };
  }

  public async getProviderMetrics(
    workspaceId: string = 'ws_default',
    startDate?: string,
    endDate?: string
  ): Promise<AIProviderUsageMetric[]> {
    let logs = aiUsageStore.getRawLogs(workspaceId);

    if (startDate) {
      const s = new Date(startDate).getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() >= s);
    }
    if (endDate) {
      const e = new Date(endDate).getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() <= e);
    }

    const byProvider = new Map<string, AIUsageLogEntry[]>();
    for (const log of logs) {
      const list = byProvider.get(log.provider) || [];
      list.push(log);
      byProvider.set(log.provider, list);
    }

    const metrics: AIProviderUsageMetric[] = [];
    for (const [providerId, providerLogs] of byProvider.entries()) {
      let promptTokens = 0;
      let completionTokens = 0;
      let durationSum = 0;
      let costSum = 0;
      let isAnyPricingAvailable = false;

      for (const log of providerLogs) {
        promptTokens += log.usage.promptTokens || 0;
        completionTokens += log.usage.completionTokens || 0;
        durationSum += log.durationMs || 0;

        const costResult = AIPricingManager.calculateCost(
          log.provider,
          log.model,
          log.usage.promptTokens,
          log.usage.completionTokens,
          new Date(log.timestamp)
        );

        if (costResult.isAvailable && costResult.costUsd !== null) {
          costSum += costResult.costUsd;
          isAnyPricingAvailable = true;
        }
      }

      metrics.push({
        provider: providerId as any,
        providerName: PROVIDER_DISPLAY_NAMES[providerId] || providerId,
        requestCount: providerLogs.length,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        averageLatencyMs:
          providerLogs.length > 0 ? Math.round(durationSum / providerLogs.length) : null,
        estimatedCostUsd: isAnyPricingAvailable ? Number(costSum.toFixed(6)) : null,
        isPricingAvailable: isAnyPricingAvailable,
        currency: 'USD',
      });
    }

    return metrics.sort((a, b) => b.requestCount - a.requestCount);
  }

  public async getModelMetrics(
    workspaceId: string = 'ws_default',
    providerFilter?: string,
    startDate?: string,
    endDate?: string
  ): Promise<AIModelUsageMetric[]> {
    let logs = aiUsageStore.getRawLogs(workspaceId);

    if (providerFilter) {
      logs = logs.filter((l) => l.provider === providerFilter);
    }
    if (startDate) {
      const s = new Date(startDate).getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() >= s);
    }
    if (endDate) {
      const e = new Date(endDate).getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() <= e);
    }

    const byModel = new Map<string, AIUsageLogEntry[]>();
    for (const log of logs) {
      const key = `${log.provider}::${log.model}`;
      const list = byModel.get(key) || [];
      list.push(log);
      byModel.set(key, list);
    }

    const metrics: AIModelUsageMetric[] = [];
    for (const [key, modelLogs] of byModel.entries()) {
      const [providerId, modelName] = key.split('::');

      let promptTokens = 0;
      let completionTokens = 0;
      let durationSum = 0;
      let costSum = 0;
      let isPricingAvailable = false;
      let pricingVersion: string | undefined;
      let inputPrice: number | undefined;
      let outputPrice: number | undefined;

      for (const log of modelLogs) {
        promptTokens += log.usage.promptTokens || 0;
        completionTokens += log.usage.completionTokens || 0;
        durationSum += log.durationMs || 0;

        const costResult = AIPricingManager.calculateCost(
          log.provider,
          log.model,
          log.usage.promptTokens,
          log.usage.completionTokens,
          new Date(log.timestamp)
        );

        if (costResult.isAvailable && costResult.costUsd !== null) {
          costSum += costResult.costUsd;
          isPricingAvailable = true;
          pricingVersion = costResult.pricingVersion;
        }

        const tier = AIPricingManager.getPricing(log.provider, log.model, new Date(log.timestamp));
        if (tier) {
          inputPrice = tier.inputPricePerMillion;
          outputPrice = tier.outputPricePerMillion;
        }
      }

      metrics.push({
        model: modelName,
        provider: providerId as any,
        requestCount: modelLogs.length,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        averageLatencyMs: modelLogs.length > 0 ? Math.round(durationSum / modelLogs.length) : null,
        estimatedCostUsd: isPricingAvailable ? Number(costSum.toFixed(6)) : null,
        isPricingAvailable,
        pricingVersion,
        inputPricePerMillion: inputPrice,
        outputPricePerMillion: outputPrice,
        currency: 'USD',
      });
    }

    return metrics.sort((a, b) => b.requestCount - a.requestCount);
  }

  public async getTimeSeries(
    workspaceId: string = 'ws_default',
    bucketSize: 'hour' | 'day' = 'day',
    startDate?: string,
    endDate?: string
  ): Promise<AITimeSeriesPoint[]> {
    let logs = aiUsageStore.getRawLogs(workspaceId);

    if (startDate) {
      const s = new Date(startDate).getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() >= s);
    }
    if (endDate) {
      const e = new Date(endDate).getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() <= e);
    }

    // Sort ascending for time series
    logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const buckets = new Map<string, AITimeSeriesPoint>();

    for (const log of logs) {
      const logDate = new Date(log.timestamp);
      let bucketKey: string;

      if (bucketSize === 'hour') {
        bucketKey = `${logDate.toISOString().substring(0, 13)}:00:00.000Z`;
      } else {
        bucketKey = `${logDate.toISOString().substring(0, 10)}T00:00:00.000Z`;
      }

      let point = buckets.get(bucketKey);
      if (!point) {
        point = {
          timestamp: bucketKey,
          requestCount: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
        };
        buckets.set(bucketKey, point);
      }

      point.requestCount++;
      point.promptTokens += log.usage.promptTokens || 0;
      point.completionTokens += log.usage.completionTokens || 0;
      point.totalTokens += log.usage.totalTokens || 0;

      const costResult = AIPricingManager.calculateCost(
        log.provider,
        log.model,
        log.usage.promptTokens,
        log.usage.completionTokens,
        logDate
      );

      if (costResult.isAvailable && costResult.costUsd !== null) {
        point.estimatedCostUsd = Number(
          (point.estimatedCostUsd + costResult.costUsd).toFixed(6)
        );
      }
    }

    return Array.from(buckets.values());
  }
}

export const aiUsageAnalyticsService = AIUsageAnalyticsService.getInstance();

