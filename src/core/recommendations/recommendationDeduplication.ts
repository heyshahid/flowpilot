import { recommendationStore } from '@/lib/storage/recommendationStore';
import {
  OptimizationRecommendation,
  RecommendationCategory,
  RecommendationSeverity,
  RecommendationTargetType,
  RecommendationEvidence,
  RecommendationAction,
  EstimatedImpact,
} from './types';

export interface CandidateRecommendationParams {
  workspaceId: string;
  ruleId: string;
  category: RecommendationCategory;
  title: string;
  summary: string;
  description: string;
  severity: RecommendationSeverity;
  priorityScore: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  confidenceScore: number;
  targetType: RecommendationTargetType;
  targetId?: string;
  targetName?: string;
  evidence: RecommendationEvidence[];
  suggestedActions: RecommendationAction[];
  estimatedImpact?: EstimatedImpact;
  limitations: string[];
  dataLimitations: string[];
}

export interface DeduplicationResult {
  recommendation: OptimizationRecommendation;
  isNew: boolean;
  wasRegenerated: boolean;
}

export class RecommendationDeduplicator {
  /**
   * Generates a deterministic deduplication key
   */
  public static generateDedupKey(
    workspaceId: string,
    ruleId: string,
    targetId?: string
  ): string {
    const safeTarget = targetId ? targetId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'global';
    return `rec_${workspaceId}_${ruleId}_${safeTarget}`;
  }

  /**
   * Evaluates candidate against existing records and applies deduplication or regeneration
   */
  public static processCandidate(
    candidate: CandidateRecommendationParams,
    asOfDate: Date = new Date()
  ): DeduplicationResult | null {
    const dedupKey = this.generateDedupKey(
      candidate.workspaceId,
      candidate.ruleId,
      candidate.targetId
    );

    const nowIso = asOfDate.toISOString();

    // 1. Check for existing ACTIVE recommendation (NEW, VIEWED, SNOOZED)
    const existingActive = recommendationStore.getActiveByDedupKey(dedupKey);

    if (existingActive) {
      // Update existing active recommendation in-place
      existingActive.occurrenceCount += 1;
      existingActive.lastSeenAt = nowIso;
      existingActive.updatedAt = nowIso;
      existingActive.priorityScore = candidate.priorityScore;
      existingActive.confidence = candidate.confidence;
      existingActive.confidenceScore = candidate.confidenceScore;
      existingActive.evidence = candidate.evidence;
      existingActive.estimatedImpact = candidate.estimatedImpact;

      recommendationStore.save(existingActive);

      return {
        recommendation: existingActive,
        isNew: false,
        wasRegenerated: false,
      };
    }

    // 2. Check for HISTORICAL recommendation (RESOLVED, DISMISSED)
    const historical = recommendationStore.getHistoricalByDedupKey(dedupKey);

    if (historical) {
      // If historical was resolved or dismissed, determine whether a new issue occurred
      const terminalDateStr = historical.resolvedAt || historical.dismissedAt || historical.updatedAt;
      const terminalTime = new Date(terminalDateStr).getTime();

      // Check evidence timestamp: must be strictly newer than terminal action
      const hasNewEvidence = candidate.evidence.some((ev) => {
        const evToTime = new Date(ev.measurementPeriod.to).getTime();
        return evToTime > terminalTime;
      });

      if (!hasNewEvidence) {
        // Honor user dismissal or resolution: condition has not produced new evidence
        return null;
      }

      // Condition has recurred with fresh evidence! Regenerate as a NEW recommendation record
      const newId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const regenerated: OptimizationRecommendation = {
        ...candidate,
        id: newId,
        dedupKey,
        status: 'NEW',
        occurrenceCount: 1,
        firstIdentifiedAt: nowIso,
        lastSeenAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      recommendationStore.save(regenerated);
      recommendationStore.recordHistory({
        recommendationId: newId,
        workspaceId: candidate.workspaceId,
        action: 'REGENERATED',
        actorId: 'system_engine',
        actorName: 'FlowPilot Optimization Engine',
        details: {
          previousId: historical.id,
          previousStatus: historical.status,
          ruleId: candidate.ruleId,
        },
      });

      return {
        recommendation: regenerated,
        isNew: true,
        wasRegenerated: true,
      };
    }

    // 3. Brand new recommendation
    const newId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const brandNew: OptimizationRecommendation = {
      ...candidate,
      id: newId,
      dedupKey,
      status: 'NEW',
      occurrenceCount: 1,
      firstIdentifiedAt: nowIso,
      lastSeenAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    recommendationStore.save(brandNew);
    recommendationStore.recordHistory({
      recommendationId: newId,
      workspaceId: candidate.workspaceId,
      action: 'CREATED',
      actorId: 'system_engine',
      actorName: 'FlowPilot Optimization Engine',
      details: {
        ruleId: candidate.ruleId,
        category: candidate.category,
      },
    });

    return {
      recommendation: brandNew,
      isNew: true,
      wasRegenerated: false,
    };
  }
}

