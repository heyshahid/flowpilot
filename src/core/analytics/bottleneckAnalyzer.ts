import { WorkflowExecutionRecord, StepExecutionRecord } from '../execution/types';
import {
  DiagnosticStatus,
  NodeExecutionTraceDetail,
  NodePerformanceMetric,
  OptimizationRecommendation,
  RecommendationEvidenceLevel,
  WorkflowNodeDiagnosticsResult,
} from './types';
import { calculateMeanDuration, calculateMedianDuration } from './metricDefinitions';

export interface BottleneckAnalysisOptions {
  minExecutionsThreshold?: number; // Defaults to 5
  highDurationThreshold?: number; // Defaults to 0.40 (40%)
  highFailureThreshold?: number; // Defaults to 15.0 (15%)
  workflowId?: string;
  workspaceId?: string;
}

/**
 * Analyzes step execution traces across workflow runs to identify performance bottlenecks,
 * slow nodes, unreliability, and actionable evidence-backed optimization diagnostics.
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

    // 2. Group traces and metadata by nodeId
    const nodeTracesMap = new Map<string, Array<{ trace: StepExecutionRecord; executionId: string }>>();
    const uniqueExecutionsMap = new Map<string, Set<string>>();

    for (const execution of executions) {
      if (!execution.traces || !Array.isArray(execution.traces)) continue;
      for (const trace of execution.traces) {
        if (!trace.nodeId) continue;

        // Collect trace
        const list = nodeTracesMap.get(trace.nodeId) || [];
        list.push({ trace, executionId: execution.id });
        nodeTracesMap.set(trace.nodeId, list);

        // Track unique workflow execution IDs
        const uSet = uniqueExecutionsMap.get(trace.nodeId) || new Set<string>();
        uSet.add(execution.id);
        uniqueExecutionsMap.set(trace.nodeId, uSet);
      }
    }

    const metrics: NodePerformanceMetric[] = [];

    // 3. Compute statistics and diagnostics for each unique node
    for (const [nodeId, items] of nodeTracesMap.entries()) {
      const executionCount = items.length;
      const uniqueWorkflowExecutions = uniqueExecutionsMap.get(nodeId)?.size || 0;

      const traces = items.map((i) => i.trace);
      const successCount = traces.filter((t) => t.status === 'COMPLETED').length;
      const failureCount = traces.filter((t) => t.status === 'FAILED').length;
      const skippedCount = traces.filter((t) => t.status === 'SKIPPED').length;

      const representative = traces[0];
      const nodeType = representative.nodeType || 'unknown';
      const nodeName = representative.nodeName || nodeId;

      const validDurations = traces
        .filter((t) => typeof t.durationMs === 'number' && t.durationMs >= 0)
        .map((t) => t.durationMs as number);

      const meanDur = calculateMeanDuration(validDurations).value;
      const medianDur = calculateMedianDuration(validDurations).value;
      const minDurationMs = validDurations.length > 0 ? Math.min(...validDurations) : null;
      const maxDurationMs = validDurations.length > 0 ? Math.max(...validDurations) : null;

      // Failure Rate (Percentage 0-100)
      const failureRatePercent =
        executionCount > 0 ? Number(((failureCount / executionCount) * 100).toFixed(2)) : null;

      // Duration contribution ratio (can exceed 1.0 in parallel / loop branches)
      let durationContributionRatio: number | null = null;
      if (meanDur !== null && workflowMeanDuration !== null && workflowMeanDuration > 0) {
        durationContributionRatio = Number((meanDur / workflowMeanDuration).toFixed(4));
      }

      // Total retries and attempts
      let totalExecutionAttempts = 0;
      let totalRetryCount = 0;
      let timeoutCount = 0;

      const timeoutRegex = /timeout|timed out|504|ETIMEDOUT|gateway timeout/i;

      for (const t of traces) {
        totalExecutionAttempts += Math.max(1, t.attempts || 1);
        totalRetryCount += t.retryCount || (t.attempts > 1 ? t.attempts - 1 : 0);
        if (t.error && timeoutRegex.test(t.error)) {
          timeoutCount++;
        }
      }

      // Error Categorization
      const errorCategories: Record<string, number> = {};
      for (const t of traces) {
        if (t.status === 'FAILED') {
          const errKey =
            typeof t.error === 'string'
              ? t.error.substring(0, 50)
              : t.error
              ? String(t.error).substring(0, 50)
              : 'UnknownError';
          errorCategories[errKey] = (errorCategories[errKey] || 0) + 1;
        }
      }

      // Last observed timestamp
      let lastObservedAt: string | null = null;
      for (const t of traces) {
        const ts = t.completedAt || t.startedAt;
        if (ts && (!lastObservedAt || new Date(ts).getTime() > new Date(lastObservedAt).getTime())) {
          lastObservedAt = ts;
        }
      }

      // Recent traces (sanitized / redacted, up to 20)
      const recentTraces: NodeExecutionTraceDetail[] = items.slice(-20).reverse().map(({ trace, executionId }) => ({
        executionId,
        nodeId: trace.nodeId,
        nodeName: trace.nodeName || trace.nodeId,
        nodeType: trace.nodeType,
        status: trace.status,
        startedAt: trace.startedAt,
        completedAt: trace.completedAt,
        durationMs: trace.durationMs,
        attempts: trace.attempts || 1,
        retryCount: trace.retryCount || 0,
        error: trace.error,
      }));

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

      // Diagnostic Status Determination
      let diagnosticStatus: DiagnosticStatus;
      const diagnosticReasons: string[] = [];

      if (!sampleSizeAdequate) {
        diagnosticStatus = 'INSUFFICIENT_DATA';
        diagnosticReasons.push(
          `Insufficient observations (${executionCount} runs recorded, minimum ${minThreshold} required for diagnostic confidence).`
        );
      } else if (validDurations.length === 0 && meanDur === null) {
        diagnosticStatus = 'UNAVAILABLE';
        diagnosticReasons.push('Duration telemetry is missing or unavailable for this node.');
      } else if (highDuration && highFailure) {
        diagnosticStatus = 'NEEDS_ATTENTION';
        diagnosticReasons.push(
          `Critical: Average duration (${meanDur}ms) accounts for ${(durationContributionRatio! * 100).toFixed(1)}% of total workflow duration (threshold: ${(highDurationRatio * 100).toFixed(0)}%).`,
          `High unreliability: Failure rate is ${failureRatePercent}% (${failureCount}/${executionCount} failed, threshold: ${highFailureRate}%).`
        );
      } else if (highDuration) {
        diagnosticStatus = 'SLOW';
        diagnosticReasons.push(
          `Latency bottleneck: Average duration (${meanDur}ms) accounts for ${(durationContributionRatio! * 100).toFixed(1)}% of total workflow duration (threshold: ${(highDurationRatio * 100).toFixed(0)}%).`
        );
      } else if (highFailure) {
        diagnosticStatus = 'UNRELIABLE';
        diagnosticReasons.push(
          `Reliability issue: Failure rate is ${failureRatePercent}% (${failureCount}/${executionCount} failed, threshold: ${highFailureRate}%).`
        );
      } else {
        diagnosticStatus = 'HEALTHY';
        diagnosticReasons.push(
          `Operating normally: Duration contribution (${(durationContributionRatio ? durationContributionRatio * 100 : 0).toFixed(1)}%) and failure rate (${failureRatePercent || 0}%) within thresholds.`
        );
      }

      // Evidence level: STRONG (>= 20), MODERATE (5-19), or INSUFFICIENT (< 5)
      let evidenceLevel: RecommendationEvidenceLevel;
      if (executionCount >= 20) {
        evidenceLevel = 'STRONG';
      } else if (executionCount >= minThreshold) {
        evidenceLevel = 'MODERATE';
      } else {
        evidenceLevel = 'SUGGESTION';
      }

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
        totalExecutionAttempts,
        uniqueWorkflowExecutions,
        successCount,
        failureCount,
        skippedCount,
        failureRatePercent,
        meanDurationMs: meanDur,
        medianDurationMs: medianDur,
        minDurationMs,
        maxDurationMs,
        durationContributionRatio,
        totalRetryCount,
        timeoutCount,
        errorCategories,
        sampleSizeAdequate,
        diagnosticStatus,
        diagnosticReasons,
        evidenceLevel,
        warnings: {
          highDuration,
          highFailureRate: highFailure,
        },
        bottleneckRankingScore,
        lastObservedAt,
        recentTraces,
      });
    }

    // Sort by bottleneck ranking score descending
    metrics.sort((a, b) => b.bottleneckRankingScore - a.bottleneckRankingScore);

    return metrics;
  }

  /**
   * Generates advisory, evidence-backed optimization recommendations based on measured node patterns.
   * Recommendations never modify workflow configurations automatically.
   */
  public static generateRecommendations(
    executions: WorkflowExecutionRecord[],
    nodeMetrics: NodePerformanceMetric[],
    workflowId = 'unknown'
  ): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // Map executions for quick failure lookup
    const failedExecsByNode = new Map<string, string[]>();
    for (const execution of executions) {
      if (!execution.traces) continue;
      for (const t of execution.traces) {
        if (t.status === 'FAILED') {
          const list = failedExecsByNode.get(t.nodeId) || [];
          if (!list.includes(execution.id)) list.push(execution.id);
          failedExecsByNode.set(t.nodeId, list);
        }
      }
    }

    for (const node of nodeMetrics) {
      if (!node.sampleSizeAdequate) continue; // Skip recommendations when observations < 5

      const failedExecIds = failedExecsByNode.get(node.nodeId) || [];

      // 1. Timeout / Network Latency in HTTP or Webhook nodes
      if (
        (node.nodeType.includes('http') || node.nodeType.includes('webhook') || node.nodeType.includes('api')) &&
        ((node.timeoutCount && node.timeoutCount > 0) || (node.meanDurationMs && node.meanDurationMs > 3000) || node.warnings.highDuration)
      ) {
        recommendations.push({
          id: `rec_${node.nodeId}_timeout_${Date.now()}`,
          ruleId: 'NETWORK_LATENCY_OR_TIMEOUT',
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          nodeType: node.nodeType,
          workflowId,
          issue: `High latency or repeated timeouts observed on external network request (${node.timeoutCount || 0} timeouts, ${node.meanDurationMs}ms mean latency).`,
          supportingMeasurements: {
            nodeMeanDurationMs: node.meanDurationMs,
            timeoutCount: node.timeoutCount || 0,
            sampleSize: node.executionCount,
            durationContributionRatio: node.durationContributionRatio,
          },
          suggestedAction:
            'Configure an explicit timeout ceiling (e.g. 5000ms), implement exponential backoff with jitter on retries, or cache static upstream API payloads.',
          evidenceLevel: node.evidenceLevel || 'MODERATE',
          relevantExecutionIds: failedExecIds.slice(0, 5),
        });
      }

      // 2. Slow AI Operation
      if (
        (node.nodeType.startsWith('ai.') || node.nodeType.includes('ai') || node.nodeType.includes('llm')) &&
        node.warnings.highDuration
      ) {
        recommendations.push({
          id: `rec_${node.nodeId}_slow_ai_${Date.now()}`,
          ruleId: 'SLOW_AI_INFERENCE',
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          nodeType: node.nodeType,
          workflowId,
          issue: `AI inference accounts for ${(node.durationContributionRatio! * 100).toFixed(1)}% of total workflow wall-clock duration (mean: ${node.meanDurationMs}ms).`,
          supportingMeasurements: {
            nodeMeanDurationMs: node.meanDurationMs,
            durationContributionRatio: node.durationContributionRatio,
            sampleSize: node.executionCount,
          },
          suggestedAction:
            'Consider switching to a lightweight inference model (e.g. Gemini 2.0 Flash or GPT-4o-mini), bounding max_tokens, or streaming responses asynchronously.',
          evidenceLevel: node.evidenceLevel || 'MODERATE',
          relevantExecutionIds: failedExecIds.slice(0, 5),
        });
      }

      // 3. Excessive Retries Pattern
      if (node.totalRetryCount > 0 && node.totalRetryCount / node.executionCount >= 0.4) {
        recommendations.push({
          id: `rec_${node.nodeId}_retries_${Date.now()}`,
          ruleId: 'EXCESSIVE_RETRIES',
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          nodeType: node.nodeType,
          workflowId,
          issue: `Excessive retries detected (${node.totalRetryCount} retries across ${node.executionCount} executions, ${(node.totalRetryCount / node.executionCount).toFixed(2)} retries/run).`,
          supportingMeasurements: {
            retryCount: node.totalRetryCount,
            sampleSize: node.executionCount,
            failureRatePercent: node.failureRatePercent,
          },
          suggestedAction:
            'Check downstream rate limits, verify idempotency keys, and add circuit-breaker logic to avoid thrashing downstream services during outages.',
          evidenceLevel: node.evidenceLevel || 'MODERATE',
          relevantExecutionIds: failedExecIds.slice(0, 5),
        });
      }

      // 4. High Failure Rate Pattern
      if (node.warnings.highFailureRate) {
        recommendations.push({
          id: `rec_${node.nodeId}_unreliable_${Date.now()}`,
          ruleId: 'HIGH_NODE_FAILURE_RATE',
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          nodeType: node.nodeType,
          workflowId,
          issue: `Node failure rate is ${node.failureRatePercent}% (${node.failureCount}/${node.executionCount} executions failed).`,
          supportingMeasurements: {
            failureRatePercent: node.failureRatePercent,
            sampleSize: node.executionCount,
          },
          suggestedAction:
            'Implement defensive JSON schema validation prior to this node, or route errors to a dedicated error handler branch (e.g. If/Else or Switch) to prevent workflow disruption.',
          evidenceLevel: node.evidenceLevel || 'MODERATE',
          relevantExecutionIds: failedExecIds.slice(0, 5),
        });
      }

      // 5. Database / Storage Repeated Errors
      if (
        (node.nodeType.includes('db') || node.nodeType.includes('database') || node.nodeType.includes('sheets') || node.nodeType.includes('crm')) &&
        node.failureCount > 0 &&
        (node.failureRatePercent ?? 0) > 10
      ) {
        recommendations.push({
          id: `rec_${node.nodeId}_storage_${Date.now()}`,
          ruleId: 'DATABASE_OR_STORAGE_FAILURE',
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          nodeType: node.nodeType,
          workflowId,
          issue: `Repeated failures detected on storage or CRM integration (${node.failureCount} failures, ${node.failureRatePercent}% error rate).`,
          supportingMeasurements: {
            failureRatePercent: node.failureRatePercent,
            sampleSize: node.executionCount,
          },
          suggestedAction:
            'Verify OAuth token expiration, database connection pool limits, and ensure column/field schema mappings match external storage tables.',
          evidenceLevel: node.evidenceLevel || 'MODERATE',
          relevantExecutionIds: failedExecIds.slice(0, 5),
        });
      }
    }

    return recommendations;
  }

  /**
   * Generates a complete workflow node diagnostics report including node metrics and optimization recommendations.
   */
  public static diagnoseWorkflow(
    workflowId: string,
    workflowName: string,
    workspaceId: string,
    executions: WorkflowExecutionRecord[],
    options: BottleneckAnalysisOptions = {}
  ): WorkflowNodeDiagnosticsResult {
    const nodeDiagnostics = this.analyze(executions, {
      ...options,
      workflowId,
      workspaceId,
    });

    const recommendations = this.generateRecommendations(executions, nodeDiagnostics, workflowId);

    return {
      workflowId,
      workflowName,
      workspaceId,
      totalExecutionsSampled: executions.length,
      nodeDiagnostics,
      recommendations,
    };
  }
}
