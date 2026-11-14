import { workflowStore } from '@/lib/storage/workflowStore';
import { executionStore } from '@/lib/storage/executionStore';
import { scheduleStore } from '@/lib/storage/scheduleStore';
import { aiUsageStore } from '@/lib/storage/aiUsageStore';
import { webhookStore } from '@/lib/storage/webhookStore';
import { credentialStore } from '@/lib/storage/credentialStore';
import { usageService } from '@/core/usage/usageService';
import { BottleneckAnalyzer } from '@/core/analytics/bottleneckAnalyzer';
import { calculateMeanDuration, calculateMedianDuration } from '@/core/analytics/metricDefinitions';
import { AIPricingManager } from '@/core/analytics/pricing';
import { RECOMMENDATION_RULES } from './recommendationDefinitions';
import { RecommendationScorer } from './recommendationScoring';
import { RecommendationDeduplicator } from './recommendationDeduplication';
import {
  OptimizationRecommendation,
  RecommendationEvidence,
} from './types';

export interface EvaluationResultSummary {
  workspaceId: string;
  totalEvaluatedRules: number;
  generatedCount: number;
  updatedActiveCount: number;
  regeneratedCount: number;
  recommendations: OptimizationRecommendation[];
  evaluatedAt: string;
}

export class RecommendationEngine {
  /**
   * In-memory workspace evaluation lock.
   * NOTE: This lock provides single-process protection against concurrent overlapping
   * evaluations within the same Node.js runtime. It is not a distributed concurrency control
   * mechanism across multiple horizontal application instances.
   */
  private static activeEvaluations = new Set<string>();

  /**
   * Evaluate all 8 categories of optimization recommendations for a workspace
   */
  public async evaluateWorkspace(
    workspaceId: string = 'ws_default',
    asOfDate: Date = new Date()
  ): Promise<EvaluationResultSummary> {
    // Single-process concurrency guard: avoid overlapping evaluations for the same workspace
    if (RecommendationEngine.activeEvaluations.has(workspaceId)) {
      throw new Error(`Evaluation is already in progress for workspace: ${workspaceId} (Single-process evaluation in flight)`);
    }

    RecommendationEngine.activeEvaluations.add(workspaceId);

    try {
      const generated: OptimizationRecommendation[] = [];
      let generatedCount = 0;
      let updatedActiveCount = 0;
      let regeneratedCount = 0;

      const thirtyDaysAgo = new Date(asOfDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      const period = {
        from: thirtyDaysAgo.toISOString(),
        to: asOfDate.toISOString(),
      };

      // 1. Fetch persistent data boundedly
      const allWorkflows = workflowStore.getAll(workspaceId);
      const executionResult = await executionStore.list({ workspaceId, limit: 500 });
      const allExecutions = executionResult.items;
      const allSchedules = await scheduleStore.list({ workspaceId });
      const aiLogs = aiUsageStore.getRawLogs(workspaceId);
      const credentials = await credentialStore.list({ workspaceId });
      const webhookDeliveries = await webhookStore.getDeliveries(undefined, 500);

      // Helper to process candidate
      const submitCandidate = (candidateParams: any) => {
        const res = RecommendationDeduplicator.processCandidate(candidateParams, asOfDate);
        if (res) {
          generated.push(res.recommendation);
          if (res.isNew && !res.wasRegenerated) generatedCount++;
          else if (res.wasRegenerated) regeneratedCount++;
          else updatedActiveCount++;
        }
      };

      // =========================================================================
      // CATEGORY 1: WORKFLOW_PERFORMANCE
      // =========================================================================
      for (const wf of allWorkflows) {
        const wfExecs = allExecutions.filter((e) => e.workflowId === wf.id);
        const terminalExecs = wfExecs.filter(
          (e) => e.status === 'COMPLETED' || e.status === 'FAILED'
        );

        if (terminalExecs.length >= 5) {
          const durations = terminalExecs
            .filter((e) => typeof e.durationMs === 'number' && e.durationMs >= 0)
            .map((e) => e.durationMs)
            .sort((a, b) => a - b);

          if (durations.length >= 5) {
            const p95Idx = Math.floor(durations.length * 0.95);
            const p95Val = durations[p95Idx] || durations[durations.length - 1];
            const medianVal = calculateMedianDuration(durations).value || 0;

            // Rule: PERF_SLOW_WORKFLOW_P95
            if (p95Val > 30000 && medianVal > 10000) {
              const rule = RECOMMENDATION_RULES.PERF_SLOW_WORKFLOW_P95;
              const evidence: RecommendationEvidence[] = [
                {
                  metricName: 'p95DurationMs',
                  observedValue: `${(p95Val / 1000).toFixed(1)}s`,
                  comparisonValue: '30.0s threshold',
                  unit: 'ms',
                  sampleSize: durations.length,
                  measurementPeriod: period,
                  sourceService: 'AnalyticsService',
                  relevantIds: terminalExecs.slice(0, 5).map((e) => e.id),
                },
                {
                  metricName: 'medianDurationMs',
                  observedValue: `${(medianVal / 1000).toFixed(1)}s`,
                  comparisonValue: '10.0s threshold',
                  unit: 'ms',
                  sampleSize: durations.length,
                  measurementPeriod: period,
                  sourceService: 'AnalyticsService',
                },
              ];

              const scoring = RecommendationScorer.score(
                { severity: rule.defaultSeverity, impactRatio: Math.min(1.0, p95Val / 60000) },
                { sampleSize: durations.length, isMultiRunSustained: true }
              );

              submitCandidate({
                workspaceId,
                ruleId: rule.id,
                category: rule.category,
                title: `Elevated P95 Latency on "${wf.name}" (${(p95Val / 1000).toFixed(1)}s)`,
                summary: `Workflow tail latency reached ${(p95Val / 1000).toFixed(1)}s across ${durations.length} terminal runs.`,
                description: rule.description,
                severity: rule.defaultSeverity,
                priorityScore: scoring.priorityScore,
                confidence: scoring.confidenceTier,
                confidenceScore: scoring.confidenceScore,
                targetType: 'WORKFLOW',
                targetId: wf.id,
                targetName: wf.name,
                evidence,
                suggestedActions: rule.suggestedActions.map((a) => ({
                  ...a,
                  targetUrl: a.targetUrl ? `${a.targetUrl}${wf.id}` : undefined,
                })),
                estimatedImpact: {
                  description: 'Potential 25% - 50% execution duration reduction through asynchronous optimization',
                  isEstimated: true,
                },
                limitations: rule.standardLimitations,
                dataLimitations: rule.standardDataLimitations,
              });
            }

            // Rule: PERF_DURATION_DRIFT
            if (durations.length >= 15) {
              const recent5 = durations.slice(-5);
              const baseline = durations.slice(0, -5);
              const recentMean = calculateMeanDuration(recent5).value || 0;
              const baselineMean = calculateMeanDuration(baseline).value || 0;

              if (baselineMean > 0 && recentMean > baselineMean * 1.5) {
                const driftPct = Math.round(((recentMean - baselineMean) / baselineMean) * 100);
                const rule = RECOMMENDATION_RULES.PERF_DURATION_DRIFT;
                const evidence: RecommendationEvidence[] = [
                  {
                    metricName: 'recentMeanDurationMs',
                    observedValue: `${(recentMean / 1000).toFixed(1)}s`,
                    comparisonValue: `${(baselineMean / 1000).toFixed(1)}s baseline`,
                    unit: 'ms',
                    sampleSize: 5,
                    measurementPeriod: period,
                    sourceService: 'AnalyticsService',
                    notes: `Drift: +${driftPct}% over baseline`,
                  },
                ];

                const scoring = RecommendationScorer.score(
                  { severity: rule.defaultSeverity, impactRatio: Math.min(1.0, driftPct / 100) },
                  { sampleSize: durations.length, isMultiRunSustained: true }
                );

                submitCandidate({
                  workspaceId,
                  ruleId: rule.id,
                  category: rule.category,
                  title: `Duration Drift Detected on "${wf.name}" (+${driftPct}%)`,
                  summary: `Recent executions are ${driftPct}% slower than the 30-day baseline duration.`,
                  description: rule.description,
                  severity: rule.defaultSeverity,
                  priorityScore: scoring.priorityScore,
                  confidence: scoring.confidenceTier,
                  confidenceScore: scoring.confidenceScore,
                  targetType: 'WORKFLOW',
                  targetId: wf.id,
                  targetName: wf.name,
                  evidence,
                  suggestedActions: rule.suggestedActions,
                  estimatedImpact: {
                    description: 'Restores execution latency to baseline performance',
                    isEstimated: true,
                  },
                  limitations: rule.standardLimitations,
                  dataLimitations: rule.standardDataLimitations,
                });
              }
            }
          }
        }

        // Rule: PERF_POTENTIAL_PARALLELIZATION
        if (wf.nodes && wf.nodes.length >= 3 && wf.edges) {
          const httpOrAiNodes = wf.nodes.filter(
            (n) => n.type?.startsWith('http') || n.type?.startsWith('ai_')
          );
          if (httpOrAiNodes.length >= 2) {
            // Check if they are arranged in a strict linear sequence
            const nodeIds = new Set(httpOrAiNodes.map((n) => n.id));
            const sequentialEdges = wf.edges.filter(
              (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
            );

            // Verify if there are explicit data dependencies between source and target
            const candidatesWithoutDataDeps: typeof sequentialEdges = [];
            for (const edge of sequentialEdges) {
              const srcNode = wf.nodes.find((n) => n.id === edge.source);
              const tgtNode = wf.nodes.find((n) => n.id === edge.target);
              const tgtDataStr = JSON.stringify(tgtNode?.config || (tgtNode as any)?.data || {});
              const hasDataDependency =
                srcNode &&
                (tgtDataStr.includes(srcNode.id) ||
                  (srcNode.name && tgtDataStr.includes(srcNode.name)) ||
                  tgtDataStr.includes(`steps.${srcNode.id}`));

              if (!hasDataDependency) {
                candidatesWithoutDataDeps.push(edge);
              }
            }

            if (candidatesWithoutDataDeps.length >= 1) {
              const rule = RECOMMENDATION_RULES.PERF_POTENTIAL_PARALLELIZATION;
              const evidence: RecommendationEvidence[] = [
                {
                  metricName: 'candidateParallelEdges',
                  observedValue: candidatesWithoutDataDeps.length,
                  comparisonValue: 1,
                  sampleSize: 1,
                  measurementPeriod: period,
                  sourceService: 'WorkflowStore',
                  relevantIds: httpOrAiNodes.map((n) => n.id),
                },
                {
                  metricName: 'explicitDataDependencies',
                  observedValue: 'None detected in static node configuration',
                  sampleSize: 1,
                  measurementPeriod: period,
                  sourceService: 'WorkflowStore',
                },
              ];

              const scoring = RecommendationScorer.score(
                { severity: rule.defaultSeverity, occurrenceCount: candidatesWithoutDataDeps.length },
                { sampleSize: 1, isMultiRunSustained: false }
              );

              submitCandidate({
                workspaceId,
                ruleId: rule.id,
                category: rule.category,
                title: `[Candidate - Requires Verification] Potential Parallel Execution in "${wf.name}"`,
                summary: `Found ${candidatesWithoutDataDeps.length} sequential remote service calls with no direct data dependencies in topology, but graph topology alone cannot prove execution independence.`,
                description: rule.description,
                severity: rule.defaultSeverity,
                priorityScore: scoring.priorityScore,
                confidence: scoring.confidenceTier,
                confidenceScore: scoring.confidenceScore,
                targetType: 'WORKFLOW',
                targetId: wf.id,
                targetName: wf.name,
                evidence,
                suggestedActions: rule.suggestedActions.map((a) => ({
                  ...a,
                  targetUrl: `${a.targetUrl}${wf.id}`,
                })),
                estimatedImpact: {
                  description: 'Up to 30% reduction in total workflow runtime if tasks are semantically independent',
                  isEstimated: true,
                },
                limitations: [
                  ...rule.standardLimitations,
                  'Graph topology alone cannot prove execution independence. If steps rely on external side-effects, implicit database state, or provider rate limits, sequential execution must be preserved.',
                ],
                dataLimitations: rule.standardDataLimitations,
              });
            }
          }
        }
      }

      // =========================================================================
      // CATEGORY 2: NODE_OPTIMIZATION
      // =========================================================================
      for (const wf of allWorkflows) {
        const wfExecs = allExecutions.filter((e) => e.workflowId === wf.id);
        if (wfExecs.length >= 5) {
          const nodeMetrics = BottleneckAnalyzer.analyze(wfExecs);

          for (const node of nodeMetrics) {
            const nodeSampleSize = node.uniqueWorkflowExecutions || node.executionCount || 0;
            const nodeTimeoutCount = node.timeoutCount || 0;

            // Rule: NODE_DISPROPORTIONATE_DURATION
            if (
              node.durationContributionRatio !== null &&
              node.durationContributionRatio >= 0.40 &&
              nodeSampleSize >= 5
            ) {
              const rule = RECOMMENDATION_RULES.NODE_DISPROPORTIONATE_DURATION;
              const ratioPct = Math.round(node.durationContributionRatio * 100);
              const evidence: RecommendationEvidence[] = [
                {
                  metricName: 'durationContributionRatio',
                  observedValue: `${ratioPct}%`,
                  comparisonValue: '40% threshold',
                  sampleSize: nodeSampleSize,
                  measurementPeriod: period,
                  sourceService: 'BottleneckAnalyzer',
                  relevantIds: [node.nodeId],
                },
                {
                  metricName: 'nodeMeanDurationMs',
                  observedValue: `${node.meanDurationMs || 0}ms`,
                  unit: 'ms',
                  sampleSize: nodeSampleSize,
                  measurementPeriod: period,
                  sourceService: 'BottleneckAnalyzer',
                },
              ];

              const scoring = RecommendationScorer.score(
                { severity: rule.defaultSeverity, impactRatio: node.durationContributionRatio },
                { sampleSize: nodeSampleSize, isMultiRunSustained: true }
              );

              submitCandidate({
                workspaceId,
                ruleId: rule.id,
                category: rule.category,
                title: `Node Bottleneck: "${node.nodeName}" in "${wf.name}" (${ratioPct}%)`,
                summary: `Node "${node.nodeName}" consumes ${ratioPct}% of total workflow duration across ${nodeSampleSize} runs.`,
                description: rule.description,
                severity: rule.defaultSeverity,
                priorityScore: scoring.priorityScore,
                confidence: scoring.confidenceTier,
                confidenceScore: scoring.confidenceScore,
                targetType: 'NODE',
                targetId: node.nodeId,
                targetName: `${node.nodeName} (${wf.name})`,
                evidence,
                suggestedActions: rule.suggestedActions.map((a) => ({
                  ...a,
                  targetUrl: `${a.targetUrl}${wf.id}`,
                })),
                estimatedImpact: {
                  description: 'Eliminates principal execution latency bottleneck',
                  isEstimated: true,
                },
                limitations: rule.standardLimitations,
                dataLimitations: rule.standardDataLimitations,
              });
            }

            // Rule: NODE_EXCESSIVE_RETRIES
            if (node.totalRetryCount > 0 && nodeSampleSize >= 5) {
              const retryRate = node.totalRetryCount / nodeSampleSize;
              if (retryRate >= 0.30) {
                const rule = RECOMMENDATION_RULES.NODE_EXCESSIVE_RETRIES;
                const evidence: RecommendationEvidence[] = [
                  {
                    metricName: 'retryRate',
                    observedValue: `${Math.round(retryRate * 100)}%`,
                    comparisonValue: '30% threshold',
                    sampleSize: nodeSampleSize,
                    measurementPeriod: period,
                    sourceService: 'BottleneckAnalyzer',
                    relevantIds: [node.nodeId],
                  },
                ];

                const scoring = RecommendationScorer.score(
                  { severity: rule.defaultSeverity, affectedRatio: Math.min(1.0, retryRate) },
                  { sampleSize: nodeSampleSize, isMultiRunSustained: true }
                );

                submitCandidate({
                  workspaceId,
                  ruleId: rule.id,
                  category: rule.category,
                  title: `High Retry Rate on Node "${node.nodeName}" (${Math.round(retryRate * 100)}%)`,
                  summary: `Node "${node.nodeName}" in "${wf.name}" experienced ${node.totalRetryCount} retries across ${nodeSampleSize} executions.`,
                  description: rule.description,
                  severity: rule.defaultSeverity,
                  priorityScore: scoring.priorityScore,
                  confidence: scoring.confidenceTier,
                  confidenceScore: scoring.confidenceScore,
                  targetType: 'NODE',
                  targetId: node.nodeId,
                  targetName: `${node.nodeName} (${wf.name})`,
                  evidence,
                  suggestedActions: rule.suggestedActions,
                  estimatedImpact: {
                    description: 'Reduces wasted execution retries and stabilizes runtime latency',
                    isEstimated: true,
                  },
                  limitations: rule.standardLimitations,
                  dataLimitations: rule.standardDataLimitations,
                });
              }
            }

            // Rule: NODE_FREQUENT_TIMEOUTS
            if (nodeTimeoutCount > 0 && nodeSampleSize >= 5) {
              const timeoutRate = nodeTimeoutCount / nodeSampleSize;
              if (timeoutRate >= 0.15) {
                const rule = RECOMMENDATION_RULES.NODE_FREQUENT_TIMEOUTS;
                const evidence: RecommendationEvidence[] = [
                  {
                    metricName: 'timeoutRate',
                    observedValue: `${Math.round(timeoutRate * 100)}%`,
                    comparisonValue: '15% threshold',
                    sampleSize: nodeSampleSize,
                    measurementPeriod: period,
                    sourceService: 'BottleneckAnalyzer',
                    relevantIds: [node.nodeId],
                  },
                ];

                const scoring = RecommendationScorer.score(
                  { severity: rule.defaultSeverity, affectedRatio: Math.min(1.0, timeoutRate) },
                  { sampleSize: nodeSampleSize, isMultiRunSustained: true }
                );

                submitCandidate({
                  workspaceId,
                  ruleId: rule.id,
                  category: rule.category,
                  title: `Frequent Timeouts on Node "${node.nodeName}" (${nodeTimeoutCount} timeouts)`,
                  summary: `Node "${node.nodeName}" in "${wf.name}" timed out in ${Math.round(timeoutRate * 100)}% of executions.`,
                  description: rule.description,
                  severity: rule.defaultSeverity,
                  priorityScore: scoring.priorityScore,
                  confidence: scoring.confidenceTier,
                  confidenceScore: scoring.confidenceScore,
                  targetType: 'NODE',
                  targetId: node.nodeId,
                  targetName: `${node.nodeName} (${wf.name})`,
                  evidence,
                  suggestedActions: rule.suggestedActions,
                  estimatedImpact: {
                    description: 'Prevents workflow aborts due to remote endpoint unresponsiveness',
                    isEstimated: true,
                  },
                  limitations: rule.standardLimitations,
                  dataLimitations: rule.standardDataLimitations,
                });
              }
            }
          }
        }
      }

      // =========================================================================
      // CATEGORY 3: RELIABILITY
      // =========================================================================
      for (const wf of allWorkflows) {
        const wfExecs = allExecutions.filter((e) => e.workflowId === wf.id);
        const terminalExecs = wfExecs.filter(
          (e) => e.status === 'COMPLETED' || e.status === 'FAILED'
        );

        if (terminalExecs.length >= 5) {
          const completedCount = terminalExecs.filter((e) => e.status === 'COMPLETED').length;
          const failedCount = terminalExecs.filter((e) => e.status === 'FAILED').length;
          const successRate = Math.round((completedCount / terminalExecs.length) * 1000) / 10;

          // Rule: REL_LOW_SUCCESS_RATE
          if (successRate < 80.0) {
            const rule = RECOMMENDATION_RULES.REL_LOW_SUCCESS_RATE;
            const evidence: RecommendationEvidence[] = [
              {
                metricName: 'successRate',
                observedValue: `${successRate}%`,
                comparisonValue: '80.0% threshold',
                sampleSize: terminalExecs.length,
                measurementPeriod: period,
                sourceService: 'AnalyticsService',
                relevantIds: terminalExecs.filter((e) => e.status === 'FAILED').map((e) => e.id),
              },
            ];

            const scoring = RecommendationScorer.score(
              { severity: rule.defaultSeverity, affectedRatio: failedCount / terminalExecs.length },
              { sampleSize: terminalExecs.length, isMultiRunSustained: true }
            );

            submitCandidate({
              workspaceId,
              ruleId: rule.id,
              category: rule.category,
              title: `Low Success Rate on "${wf.name}" (${successRate}%)`,
              summary: `Workflow "${wf.name}" failed ${failedCount} times out of ${terminalExecs.length} runs.`,
              description: rule.description,
              severity: rule.defaultSeverity,
              priorityScore: scoring.priorityScore,
              confidence: scoring.confidenceTier,
              confidenceScore: scoring.confidenceScore,
              targetType: 'WORKFLOW',
              targetId: wf.id,
              targetName: wf.name,
              evidence,
              suggestedActions: rule.suggestedActions,
              estimatedImpact: {
                description: 'Restores workflow operational reliability to >= 95%',
                isEstimated: true,
              },
              limitations: rule.standardLimitations,
              dataLimitations: rule.standardDataLimitations,
            });
          }

          // Rule: REL_REPEATED_STAGE_FAILURE
          const failedExecs = wfExecs.filter((e) => e.status === 'FAILED');
          if (failedExecs.length >= 3) {
            const failedStepCounts = new Map<string, number>();
            for (const fEx of failedExecs.slice(0, 5)) {
              const lastTrace = fEx.traces?.filter((t) => t.status === 'FAILED').pop();
              if (lastTrace && lastTrace.nodeName) {
                failedStepCounts.set(
                  lastTrace.nodeName,
                  (failedStepCounts.get(lastTrace.nodeName) || 0) + 1
                );
              }
            }

            for (const [nodeName, count] of failedStepCounts.entries()) {
              if (count >= 3) {
                const rule = RECOMMENDATION_RULES.REL_REPEATED_STAGE_FAILURE;
                const evidence: RecommendationEvidence[] = [
                  {
                    metricName: 'consecutiveFailuresAtStage',
                    observedValue: count,
                    comparisonValue: 3,
                    sampleSize: failedExecs.length,
                    measurementPeriod: period,
                    sourceService: 'ExecutionStore',
                    relevantIds: failedExecs.slice(0, count).map((e) => e.id),
                  },
                ];

                const scoring = RecommendationScorer.score(
                  { severity: rule.defaultSeverity, occurrenceCount: count },
                  { sampleSize: failedExecs.length, isMultiRunSustained: true }
                );

                submitCandidate({
                  workspaceId,
                  ruleId: rule.id,
                  category: rule.category,
                  title: `Persistent Stage Failure at "${nodeName}" in "${wf.name}"`,
                  summary: `Node "${nodeName}" failed in ${count} consecutive executions.`,
                  description: rule.description,
                  severity: rule.defaultSeverity,
                  priorityScore: scoring.priorityScore,
                  confidence: scoring.confidenceTier,
                  confidenceScore: scoring.confidenceScore,
                  targetType: 'WORKFLOW',
                  targetId: wf.id,
                  targetName: wf.name,
                  evidence,
                  suggestedActions: rule.suggestedActions,
                  estimatedImpact: {
                    description: 'Resolves systematic workflow execution failure',
                    isEstimated: true,
                  },
                  limitations: rule.standardLimitations,
                  dataLimitations: rule.standardDataLimitations,
                });
              }
            }
          }
        }
      }

      // =========================================================================
      // CATEGORY 4: INTEGRATION
      // =========================================================================
      if (webhookDeliveries.length >= 10) {
        const failedWh = webhookDeliveries.filter(
          (d) => d.status === 'REJECTED' || d.status === 'FAILED'
        ).length;
        const rejRate = (failedWh / webhookDeliveries.length) * 100;

        if (rejRate >= 15.0) {
          const rule = RECOMMENDATION_RULES.INT_WEBHOOK_REJECTION_SPIKE;
          const evidence: RecommendationEvidence[] = [
            {
              metricName: 'webhookRejectionRate',
              observedValue: `${Math.round(rejRate)}%`,
              comparisonValue: '15.0% threshold',
              sampleSize: webhookDeliveries.length,
              measurementPeriod: period,
              sourceService: 'WebhookStore',
              relevantIds: webhookDeliveries.slice(0, 5).map((d) => d.id),
            },
          ];

          const scoring = RecommendationScorer.score(
            { severity: rule.defaultSeverity, affectedRatio: rejRate / 100 },
            { sampleSize: webhookDeliveries.length, isMultiRunSustained: true }
          );

          submitCandidate({
            workspaceId,
            ruleId: rule.id,
            category: rule.category,
            title: `Elevated Webhook Rejection Rate (${Math.round(rejRate)}%)`,
            summary: `${failedWh} out of ${webhookDeliveries.length} incoming webhooks were rejected or failed.`,
            description: rule.description,
            severity: rule.defaultSeverity,
            priorityScore: scoring.priorityScore,
            confidence: scoring.confidenceTier,
            confidenceScore: scoring.confidenceScore,
            targetType: 'INTEGRATION',
            targetName: 'Inbound Webhook Gateway',
            evidence,
            suggestedActions: rule.suggestedActions,
            estimatedImpact: {
              description: 'Ensures reliable ingestion of external trigger payloads',
              isEstimated: true,
            },
            limitations: rule.standardLimitations,
            dataLimitations: rule.standardDataLimitations,
          });
        }
      }

      // Check for 429 rate limits or expired credentials
      const invalidCredentials = credentials.filter((c) => c.status === 'invalid');
      if (invalidCredentials.length > 0) {
        const rule = RECOMMENDATION_RULES.INT_AUTHENTICATION_EXPIRED;
        const evidence: RecommendationEvidence[] = [
          {
            metricName: 'invalidCredentialsCount',
            observedValue: invalidCredentials.length,
            comparisonValue: 0,
            sampleSize: credentials.length,
            measurementPeriod: period,
            sourceService: 'CredentialStore',
            relevantIds: invalidCredentials.map((c) => c.id),
          },
        ];

        const scoring = RecommendationScorer.score(
          { severity: rule.defaultSeverity, occurrenceCount: invalidCredentials.length },
          { sampleSize: credentials.length, isMultiRunSustained: true }
        );

        submitCandidate({
          workspaceId,
          ruleId: rule.id,
          category: rule.category,
          title: `Expired Integration Credentials Detected (${invalidCredentials.length})`,
          summary: `${invalidCredentials.length} credential(s) in the Vault are marked invalid.`,
          description: rule.description,
          severity: rule.defaultSeverity,
          priorityScore: scoring.priorityScore,
          confidence: scoring.confidenceTier,
          confidenceScore: scoring.confidenceScore,
          targetType: 'INTEGRATION',
          targetName: 'Credentials Vault',
          evidence,
          suggestedActions: rule.suggestedActions,
          estimatedImpact: {
            description: 'Restores connectivity for authenticated integration nodes',
            isEstimated: true,
          },
          limitations: rule.standardLimitations,
          dataLimitations: rule.standardDataLimitations,
        });
      }

      // =========================================================================
      // CATEGORY 5: AI_COST
      // =========================================================================
      if (aiLogs.length > 0) {
        let totalTokens = 0;
        let unpricedCount = 0;
        const modelCounts = new Map<string, number>();

        for (const log of aiLogs) {
          totalTokens += log.usage.totalTokens || 0;
          modelCounts.set(log.model, (modelCounts.get(log.model) || 0) + 1);

          const pricing = AIPricingManager.calculateCost(
            log.provider,
            log.model,
            log.usage.promptTokens || 0,
            log.usage.completionTokens || 0,
            new Date(log.timestamp)
          );
          if (!pricing.isAvailable) {
            unpricedCount++;
          }
        }

        // Rule: AI_HIGH_TOKEN_CONSUMPTION
        if (totalTokens > 50000) {
          const rule = RECOMMENDATION_RULES.AI_HIGH_TOKEN_CONSUMPTION;
          const evidence: RecommendationEvidence[] = [
            {
              metricName: 'totalTokensConsumed',
              observedValue: totalTokens.toLocaleString(),
              comparisonValue: '50,000 threshold',
              unit: 'tokens',
              sampleSize: aiLogs.length,
              measurementPeriod: period,
              sourceService: 'AIUsageStore',
            },
          ];

          const scoring = RecommendationScorer.score(
            { severity: rule.defaultSeverity, impactRatio: Math.min(1.0, totalTokens / 100000) },
            { sampleSize: aiLogs.length, hasUnpricedAiModels: unpricedCount > 0, isMultiRunSustained: true }
          );

          submitCandidate({
            workspaceId,
            ruleId: rule.id,
            category: rule.category,
            title: `Substantial AI Token Usage (${totalTokens.toLocaleString()} tokens)`,
            summary: `Workspace has consumed ${totalTokens.toLocaleString()} AI tokens across ${aiLogs.length} requests.`,
            description: rule.description,
            severity: rule.defaultSeverity,
            priorityScore: scoring.priorityScore,
            confidence: scoring.confidenceTier,
            confidenceScore: scoring.confidenceScore,
            targetType: 'WORKSPACE',
            targetName: 'AI Services',
            evidence,
            suggestedActions: rule.suggestedActions,
            estimatedImpact: {
              description: 'Potential 20% - 40% reduction in AI expenditure through prompt compaction',
              isEstimated: true,
            },
            limitations: rule.standardLimitations,
            dataLimitations: rule.standardDataLimitations,
          });
        }

        // Rule: AI_UNPRICED_MODEL_USAGE
        if (unpricedCount > 0) {
          const rule = RECOMMENDATION_RULES.AI_UNPRICED_MODEL_USAGE;
          const evidence: RecommendationEvidence[] = [
            {
              metricName: 'unpricedRequestsCount',
              observedValue: unpricedCount,
              comparisonValue: 0,
              sampleSize: aiLogs.length,
              measurementPeriod: period,
              sourceService: 'AIPricingManager',
            },
          ];

          const scoring = RecommendationScorer.score(
            { severity: rule.defaultSeverity, occurrenceCount: unpricedCount },
            { sampleSize: aiLogs.length, hasUnpricedAiModels: true, isMultiRunSustained: true }
          );

          submitCandidate({
            workspaceId,
            ruleId: rule.id,
            category: rule.category,
            title: `Unpriced AI Models in Use (${unpricedCount} requests)`,
            summary: `${unpricedCount} AI invocation(s) used models lacking verified pricing in the catalog.`,
            description: rule.description,
            severity: rule.defaultSeverity,
            priorityScore: scoring.priorityScore,
            confidence: scoring.confidenceTier,
            confidenceScore: scoring.confidenceScore,
            targetType: 'WORKSPACE',
            targetName: 'AI Pricing Engine',
            evidence,
            suggestedActions: rule.suggestedActions,
            estimatedImpact: {
              description: 'Enables accurate financial reporting and cost transparency',
              isEstimated: true,
            },
            limitations: rule.standardLimitations,
            dataLimitations: rule.standardDataLimitations,
          });
        }
      }

      // =========================================================================
      // CATEGORY 6: SCHEDULING
      // =========================================================================
      const activeSchedules = allSchedules.filter((s) => s.status === 'active');
      let missedCount = 0;
      const missedSchedules: string[] = [];

      for (const s of activeSchedules) {
        if (s.nextRunAt) {
          const dueTime = new Date(s.nextRunAt).getTime();
          if (asOfDate.getTime() - dueTime > 5 * 60 * 1000) {
            const lastRun = s.lastRunAt ? new Date(s.lastRunAt).getTime() : 0;
            if (lastRun < dueTime) {
              missedCount++;
              missedSchedules.push(s.name);
            }
          }
        }
      }

      // Rule: SCHED_MISSED_RUNS
      if (missedCount > 0) {
        const rule = RECOMMENDATION_RULES.SCHED_MISSED_RUNS;
        const evidence: RecommendationEvidence[] = [
          {
            metricName: 'missedSchedulesCount',
            observedValue: missedCount,
            comparisonValue: 0,
            sampleSize: activeSchedules.length,
            measurementPeriod: period,
            sourceService: 'ScheduleStore',
            notes: `Affected schedules: ${missedSchedules.join(', ')}`,
          },
        ];

        const scoring = RecommendationScorer.score(
          { severity: rule.defaultSeverity, occurrenceCount: missedCount },
          { sampleSize: activeSchedules.length, isMultiRunSustained: true }
        );

        submitCandidate({
          workspaceId,
          ruleId: rule.id,
          category: rule.category,
          title: `Overdue Workflow Schedules (${missedCount} missed)`,
          summary: `${missedCount} active schedule(s) are past their expected trigger window by > 5 minutes.`,
          description: rule.description,
          severity: rule.defaultSeverity,
          priorityScore: scoring.priorityScore,
          confidence: scoring.confidenceTier,
          confidenceScore: scoring.confidenceScore,
          targetType: 'SCHEDULE',
          targetName: 'Background Scheduler',
          evidence,
          suggestedActions: rule.suggestedActions,
          estimatedImpact: {
            description: 'Restores timely execution of business-critical automated workflows',
            isEstimated: true,
          },
          limitations: rule.standardLimitations,
          dataLimitations: rule.standardDataLimitations,
        });
      }

      // Rule: SCHED_INTERVAL_CONGESTION
      const minuteMap = new Map<number, string[]>();
      for (const s of activeSchedules) {
        if (s.type === 'cron' && s.cronExpression) {
          const parts = s.cronExpression.trim().split(/\s+/);
          const minutePart = parseInt(parts[0], 10);
          if (!isNaN(minutePart)) {
            const list = minuteMap.get(minutePart) || [];
            list.push(s.name);
            minuteMap.set(minutePart, list);
          }
        }
      }

      for (const [minute, names] of minuteMap.entries()) {
        if (names.length >= 3) {
          const rule = RECOMMENDATION_RULES.SCHED_INTERVAL_CONGESTION;
          const evidence: RecommendationEvidence[] = [
            {
              metricName: 'congestedMinuteSchedules',
              observedValue: names.length,
              comparisonValue: 3,
              sampleSize: activeSchedules.length,
              measurementPeriod: period,
              sourceService: 'ScheduleStore',
              notes: `Minute :${minute.toString().padStart(2, '0')} has ${names.length} schedules: ${names.join(', ')}`,
            },
          ];

          const scoring = RecommendationScorer.score(
            { severity: rule.defaultSeverity, occurrenceCount: names.length },
            { sampleSize: activeSchedules.length, isMultiRunSustained: false }
          );

          submitCandidate({
            workspaceId,
            ruleId: rule.id,
            category: rule.category,
            title: `Schedule Congestion at Minute :${minute.toString().padStart(2, '0')} (${names.length} workflows)`,
            summary: `${names.length} active workflows are scheduled to run at the exact same minute.`,
            description: rule.description,
            severity: rule.defaultSeverity,
            priorityScore: scoring.priorityScore,
            confidence: scoring.confidenceTier,
            confidenceScore: scoring.confidenceScore,
            targetType: 'SCHEDULE',
            targetName: 'Cron Schedule Pool',
            evidence,
            suggestedActions: rule.suggestedActions,
            estimatedImpact: {
              description: 'Smooths queue processing concurrency and prevents execution delays',
              isEstimated: true,
            },
            limitations: rule.standardLimitations,
            dataLimitations: rule.standardDataLimitations,
          });
        }
      }

      // =========================================================================
      // CATEGORY 7: RESOURCE_USAGE
      // =========================================================================
      const usageSummary = await usageService.getWorkspaceUsageSummary(workspaceId, '30d');
      for (const [key, lim] of Object.entries(usageSummary.limits)) {
        if (lim.limit !== null && lim.percentage !== null) {
          if (lim.state === 'LIMIT_REACHED') {
            const rule = RECOMMENDATION_RULES.RES_LIMIT_EXCEEDED;
            const evidence: RecommendationEvidence[] = [
              {
                metricName: lim.name,
                observedValue: `${lim.current} ${lim.unit} (${lim.percentage}%)`,
                comparisonValue: `${lim.limit} ${lim.unit} limit`,
                sampleSize: 1,
                measurementPeriod: period,
                sourceService: 'UsageService',
              },
            ];

            const scoring = RecommendationScorer.score(
              { severity: rule.defaultSeverity, impactRatio: 1.0 },
              { sampleSize: 1, isMultiRunSustained: true }
            );

            submitCandidate({
              workspaceId,
              ruleId: `${rule.id}_${key}`,
              category: rule.category,
              title: `Quota Ceiling Exceeded: ${lim.name} (${lim.percentage}%)`,
              summary: `${lim.name} is currently at ${lim.percentage}% of the administrator-configured limit.`,
              description: rule.description,
              severity: rule.defaultSeverity,
              priorityScore: scoring.priorityScore,
              confidence: scoring.confidenceTier,
              confidenceScore: scoring.confidenceScore,
              targetType: 'WORKSPACE',
              targetName: lim.name,
              evidence,
              suggestedActions: rule.suggestedActions,
              estimatedImpact: {
                description: 'Aligns resource limits with business volume',
                isEstimated: true,
              },
              limitations: rule.standardLimitations,
              dataLimitations: rule.standardDataLimitations,
            });
          } else if (lim.state === 'WARNING') {
            const rule = RECOMMENDATION_RULES.RES_LIMIT_APPROACHING;
            const evidence: RecommendationEvidence[] = [
              {
                metricName: lim.name,
                observedValue: `${lim.current} ${lim.unit} (${lim.percentage}%)`,
                comparisonValue: `${lim.limit} ${lim.unit} limit`,
                sampleSize: 1,
                measurementPeriod: period,
                sourceService: 'UsageService',
              },
            ];

            const scoring = RecommendationScorer.score(
              { severity: rule.defaultSeverity, impactRatio: lim.percentage / 100 },
              { sampleSize: 1, isMultiRunSustained: true }
            );

            submitCandidate({
              workspaceId,
              ruleId: `${rule.id}_${key}`,
              category: rule.category,
              title: `Approaching Quota Ceiling: ${lim.name} (${lim.percentage}%)`,
              summary: `${lim.name} has reached ${lim.percentage}% of its quota ceiling.`,
              description: rule.description,
              severity: rule.defaultSeverity,
              priorityScore: scoring.priorityScore,
              confidence: scoring.confidenceTier,
              confidenceScore: scoring.confidenceScore,
              targetType: 'WORKSPACE',
              targetName: lim.name,
              evidence,
              suggestedActions: rule.suggestedActions,
              estimatedImpact: {
                description: 'Proactively prevents service warnings',
                isEstimated: true,
              },
              limitations: rule.standardLimitations,
              dataLimitations: rule.standardDataLimitations,
            });
          }
        }
      }

      // =========================================================================
      // CATEGORY 8: WORKFLOW_ARCHITECTURE
      // =========================================================================
      for (const wf of allWorkflows) {
        if (!wf.nodes || wf.nodes.length === 0) continue;

        // Rule: ARCH_UNHANDLED_ERROR_PATH
        const criticalNodes = wf.nodes.filter(
          (n) => n.type?.startsWith('http') || n.type?.startsWith('ai_') || n.type?.startsWith('database')
        );

        for (const cNode of criticalNodes) {
          const outgoingEdges = wf.edges?.filter((e) => e.source === cNode.id) || [];
          // Validate actual node error-port semantics (distinguish genuine error paths from ordinary conditional false/else branches)
          const hasErrorBranch = outgoingEdges.some((e) => {
            const handle = (e.sourceHandle || '').toLowerCase();
            const label = String((e as any).label || '').toLowerCase();
            if (handle === 'false' || handle === 'else' || handle === 'default' || handle === 'success') {
              return false;
            }
            return handle === 'error' || handle === 'onerror' || handle === 'failure' || label === 'error';
          });

          if (!hasErrorBranch) {
            const rule = RECOMMENDATION_RULES.ARCH_UNHANDLED_ERROR_PATH;
            const evidence: RecommendationEvidence[] = [
              {
                metricName: 'unhandledNode',
                observedValue: cNode.name || cNode.id,
                comparisonValue: 'Configured error branch',
                sampleSize: 1,
                measurementPeriod: period,
                sourceService: 'WorkflowStore',
                relevantIds: [cNode.id],
              },
            ];

            const scoring = RecommendationScorer.score(
              { severity: rule.defaultSeverity, occurrenceCount: 1 },
              { sampleSize: 1, isMultiRunSustained: false }
            );

            submitCandidate({
              workspaceId,
              ruleId: `${rule.id}_${cNode.id}`,
              category: rule.category,
              title: `Missing Error Handler for "${cNode.name || cNode.id}" in "${wf.name}"`,
              summary: `Critical node "${cNode.name || cNode.id}" lacks an error fallback connection.`,
              description: rule.description,
              severity: rule.defaultSeverity,
              priorityScore: scoring.priorityScore,
              confidence: scoring.confidenceTier,
              confidenceScore: scoring.confidenceScore,
              targetType: 'NODE',
              targetId: cNode.id,
              targetName: `${cNode.name || cNode.id} (${wf.name})`,
              evidence,
              suggestedActions: rule.suggestedActions.map((a) => ({
                ...a,
                targetUrl: `${a.targetUrl}${wf.id}`,
              })),
              estimatedImpact: {
                description: 'Prevents catastrophic workflow job crashes on remote failure',
                isEstimated: true,
              },
              limitations: rule.standardLimitations,
              dataLimitations: rule.standardDataLimitations,
            });
            break; // Report once per workflow to avoid overwhelming
          }
        }

        // Rule: ARCH_HIGH_FANOUT_WITHOUT_BATCHING
        const triggerNode = wf.nodes.find((n) => n.category === 'trigger' || n.type?.startsWith('trigger'));
        if (triggerNode) {
          const triggerOutgoing = wf.edges?.filter((e) => e.source === triggerNode.id) || [];
          if (triggerOutgoing.length > 10) {
            const rule = RECOMMENDATION_RULES.ARCH_HIGH_FANOUT_WITHOUT_BATCHING;
            const evidence: RecommendationEvidence[] = [
              {
                metricName: 'triggerOutgoingEdges',
                observedValue: triggerOutgoing.length,
                comparisonValue: '10 edges threshold',
                sampleSize: 1,
                measurementPeriod: period,
                sourceService: 'WorkflowStore',
                relevantIds: [triggerNode.id],
              },
            ];

            const scoring = RecommendationScorer.score(
              { severity: rule.defaultSeverity, occurrenceCount: triggerOutgoing.length },
              { sampleSize: 1, isMultiRunSustained: false }
            );

            submitCandidate({
              workspaceId,
              ruleId: rule.id,
              category: rule.category,
              title: `High Graph Fan-Out in "${wf.name}" (${triggerOutgoing.length} outgoing paths)`,
              summary: `Trigger connects directly to ${triggerOutgoing.length} parallel paths without batching.`,
              description: rule.description,
              severity: rule.defaultSeverity,
              priorityScore: scoring.priorityScore,
              confidence: scoring.confidenceTier,
              confidenceScore: scoring.confidenceScore,
              targetType: 'WORKFLOW',
              targetId: wf.id,
              targetName: wf.name,
              evidence,
              suggestedActions: rule.suggestedActions.map((a) => ({
                ...a,
                targetUrl: `${a.targetUrl}${wf.id}`,
              })),
              estimatedImpact: {
                description: 'Mitigates execution queue contention and downstream rate limits',
                isEstimated: true,
              },
              limitations: rule.standardLimitations,
              dataLimitations: rule.standardDataLimitations,
            });
          }
        }

        // Rule: ARCH_UNBOUNDED_LOOP_RISK
        const loopNodes = wf.nodes.filter(
          (n) => n.type === 'loop' || n.type === 'while' || n.name?.toLowerCase().includes('loop')
        );
        for (const lNode of loopNodes) {
          const config = (lNode.config || (lNode as any)?.data || {}) as Record<string, unknown>;
          const maxIter = config.maxIterations || config.limit;
          if (!maxIter) {
            const rule = RECOMMENDATION_RULES.ARCH_UNBOUNDED_LOOP_RISK;
            const evidence: RecommendationEvidence[] = [
              {
                metricName: 'maxIterations',
                observedValue: 'Not configured (unbounded)',
                comparisonValue: 100,
                sampleSize: 1,
                measurementPeriod: period,
                sourceService: 'WorkflowStore',
                relevantIds: [lNode.id],
              },
            ];

            const scoring = RecommendationScorer.score(
              { severity: rule.defaultSeverity, occurrenceCount: 1 },
              { sampleSize: 1, isMultiRunSustained: false }
            );

            submitCandidate({
              workspaceId,
              ruleId: `${rule.id}_${lNode.id}`,
              category: rule.category,
              title: `Unbounded Loop Node "${lNode.name || lNode.id}" in "${wf.name}"`,
              summary: `Loop node lacks an explicit maximum iteration ceiling.`,
              description: rule.description,
              severity: rule.defaultSeverity,
              priorityScore: scoring.priorityScore,
              confidence: scoring.confidenceTier,
              confidenceScore: scoring.confidenceScore,
              targetType: 'NODE',
              targetId: lNode.id,
              targetName: `${lNode.name || lNode.id} (${wf.name})`,
              evidence,
              suggestedActions: rule.suggestedActions.map((a) => ({
                ...a,
                targetUrl: `${a.targetUrl}${wf.id}`,
              })),
              estimatedImpact: {
                description: 'Guarantees execution terminates and avoids infinite loop timeout',
                isEstimated: true,
              },
              limitations: rule.standardLimitations,
              dataLimitations: rule.standardDataLimitations,
            });
          }
        }
      }

      return {
        workspaceId,
        totalEvaluatedRules: Object.keys(RECOMMENDATION_RULES).length,
        generatedCount,
        updatedActiveCount,
        regeneratedCount,
        recommendations: generated,
        evaluatedAt: asOfDate.toISOString(),
      };
    } finally {
      RecommendationEngine.activeEvaluations.delete(workspaceId);
    }
  }
}

export const recommendationEngine = new RecommendationEngine();

