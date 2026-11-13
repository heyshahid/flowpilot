import { WorkflowExecutionRecord, StepExecutionRecord } from '../execution/types';
import { NodePerformanceMetric } from './types';
import { calculateMeanDuration, calculateMedianDuration } from './metricDefinitions';

export interface BottleneckAnalysisOptions {
  minExecutionsThreshold?: number; // Defaults to 5
  highDurationThreshold?: number; // Defaults to 0.40 (40%)
  highFailureThreshold?: number; // Defaults to 15.0 (15%)
}

/**
 * Analyzes step execution traces across workflow runs to identify performance bottlenecks,
 * slow nodes, and frequent failure points with statistical safeguards.
 */
export class BottleneckAnalyzer {
  /**
   * Aggregates node executions across multiple workflow runs and evaluates bottleneck criteria.
   */
  public static analyze(
    executions: WorkflowExecutionRecord[],
    options: BottleneckAnalysisOptions = {}
  ): NodePerformanceMetric[] {
    const minThreshold = options.minExecutionsThreshold ?? 5;
    const highDurationRatio = options.highDurationThreshold ?? 0.40;
    const highFailureRate = options.highFailureThreshold ?? 15.0;

    // 1. Calculate overall workflow mean duration for ratio comparison
    const validWorkflowDurations = executions
      .filter((e) => typeof e.durationMs === 'number' && e.durationMs >= 0)
      .map((e) => e.durationMs as number);
    const workflowMeanDuration = calculateMeanDuration(validWorkflowDurations).value;

    // 2. Group traces by nodeId
    const nodeTracesMap = new Map<string, StepExecutionRecord[]>();

    for (const execution of executions) {
      if (!execution.traces || !Array.isArray(execution.traces)) continue;
      for (const trace of execution.traces) {
        if (!trace.nodeId) continue;
        const list = nodeTracesMap.get(trace.nodeId) || [];
        list.push(trace);
        nodeTracesMap.set(trace.nodeId, list);
      }
    }

    const metrics: NodePerformanceMetric[] = [];

    // 3. Compute statistics for each unique node
    for (const [nodeId, traces] of nodeTracesMap.entries()) {
      const executionCount = traces.length;
      const successCount = traces.filter((t) => t.status === 'COMPLETED').length;
      const failureCount = traces.filter((t) => t.status === 'FAILED').length;

      const representative = traces[0];
      const nodeType = representative.nodeType || 'unknown';
      const nodeName = representative.nodeName || nodeId;

      const validDurations = traces
        .filter((t) => typeof t.durationMs === 'number' && t.durationMs >= 0)
        .map((t) => t.durationMs as number);

      const meanDur = calculateMeanDuration(validDurations).value;
      const medianDur = calculateMedianDuration(validDurations).value;

      // Failure Rate (Percentage 0-100)
      const failureRatePercent =
        executionCount > 0 ? Number(((failureCount / executionCount) * 100).toFixed(2)) : null;

      // Duration contribution ratio (can exceed 1.0 in parallel / loop branches)
      let durationContributionRatio: number | null = null;
      if (meanDur !== null && workflowMeanDuration !== null && workflowMeanDuration > 0) {
        durationContributionRatio = Number((meanDur / workflowMeanDuration).toFixed(4));
      }

      // Total retries
      const totalRetryCount = traces.reduce((acc, t) => acc + (t.retryCount || 0), 0);

      // Error Categorization
      const errorCategories: Record<string, number> = {};
      for (const t of traces) {
        if (t.status === 'FAILED') {
          const errKey = typeof t.error === 'string' ? t.error.substring(0, 40) : (t.error ? String(t.error).substring(0, 40) : 'UnknownError');
          errorCategories[errKey] = (errorCategories[errKey] || 0) + 1;
        }
      }

      // Safeguard: Minimum sample threshold (default 5 executions)
      const sampleSizeAdequate = executionCount >= minThreshold;

      // Independent warning triggers (only evaluated if sample size is adequate)
      const highDuration =
        sampleSizeAdequate &&
        durationContributionRatio !== null &&
        durationContributionRatio > highDurationRatio;

      const highFailure =
        sampleSizeAdequate &&
        failureRatePercent !== null &&
        failureRatePercent > highFailureRate;

      // Ranking score for sorting (not displayed as a confidence percentage)
      const durationRankComponent =
        durationContributionRatio !== null ? Math.min(durationContributionRatio, 3.0) : 0;
      const failureRankComponent =
        failureRatePercent !== null ? failureRatePercent / 100 : 0;
      const bottleneckRankingScore = Number(
        (0.6 * durationRankComponent + 0.4 * failureRankComponent).toFixed(4)
      );

      metrics.push({
        nodeId,
        nodeType,
        nodeName,
        executionCount,
        successCount,
        failureCount,
        failureRatePercent,
        meanDurationMs: meanDur,
        medianDurationMs: medianDur,
        durationContributionRatio,
        totalRetryCount,
        errorCategories,
        sampleSizeAdequate,
        warnings: {
          highDuration,
          highFailureRate: highFailure,
        },
        bottleneckRankingScore,
      });
    }

    // Sort by bottleneck ranking score descending
    metrics.sort((a, b) => b.bottleneckRankingScore - a.bottleneckRankingScore);

    return metrics;
  }
}
