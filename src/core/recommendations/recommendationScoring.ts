import {
  RecommendationSeverity,
  RecommendationConfidenceTier,
} from './types';

export interface PriorityScoringInput {
  severity: RecommendationSeverity;
  affectedRatio?: number; // 0.0 to 1.0 (e.g. 5 failed out of 10 runs = 0.5)
  occurrenceCount?: number; // Absolute count when ratio is not applicable
  impactRatio?: number; // 0.0 to 1.0 (e.g. node consumes 60% of duration = 0.6)
}

export interface ConfidenceScoringInput {
  sampleSize: number;
  hasUnpricedAiModels?: boolean;
  isWebhookBufferTruncated?: boolean;
  cancelledExecutionRatio?: number;
  isMultiRunSustained?: boolean;
}

export interface ScoringResult {
  priorityScore: number;
  confidenceScore: number;
  confidenceTier: RecommendationConfidenceTier;
}

export class RecommendationScorer {
  /**
   * Calculate deterministic priority score [10 - 100]
   */
  public static calculatePriority(input: PriorityScoringInput): number {
    // 1. Severity weight [10 - 40]
    let sScore = 10;
    switch (input.severity) {
      case 'CRITICAL':
        sScore = 40;
        break;
      case 'HIGH':
        sScore = 30;
        break;
      case 'MEDIUM':
        sScore = 20;
        break;
      case 'LOW':
      default:
        sScore = 10;
        break;
    }

    // 2. Frequency weight [0 - 30]
    let fScore = 0;
    if (typeof input.affectedRatio === 'number' && input.affectedRatio >= 0) {
      fScore = Math.min(30, Math.round(input.affectedRatio * 30));
    } else if (typeof input.occurrenceCount === 'number' && input.occurrenceCount > 0) {
      fScore = Math.min(30, Math.round((Math.min(input.occurrenceCount, 10) / 10) * 30));
    } else {
      fScore = 10; // Default baseline frequency
    }

    // 3. Impact weight [0 - 30]
    let iScore = 0;
    if (typeof input.impactRatio === 'number' && input.impactRatio >= 0) {
      iScore = Math.min(30, Math.round(input.impactRatio * 30));
    } else {
      iScore = 10; // Default baseline impact
    }

    return Math.min(100, Math.max(10, sScore + fScore + iScore));
  }

  /**
   * Calculate deterministic confidence score [25 - 100] and tier
   */
  public static calculateConfidence(input: ConfidenceScoringInput): {
    score: number;
    tier: RecommendationConfidenceTier;
  } {
    // 1. Sample Size factor [15 - 50]
    let sScore = 15;
    const n = Math.max(0, input.sampleSize);
    if (n >= 10) {
      sScore = 50;
    } else if (n >= 5) {
      sScore = 40;
    } else if (n >= 3) {
      sScore = 25;
    } else {
      sScore = 15; // Small sample size penalty
    }

    // 2. Data Completeness & Quality factor [10 - 30]
    let qScore = 30;
    if (input.hasUnpricedAiModels) {
      qScore -= 10;
    }
    if (input.isWebhookBufferTruncated) {
      qScore -= 10;
    }
    if (input.cancelledExecutionRatio && input.cancelledExecutionRatio > 0.2) {
      qScore -= 10;
    }
    qScore = Math.max(10, qScore);

    // 3. Consistency factor [0 - 20]
    let cScore = 0;
    if (input.isMultiRunSustained === true) {
      cScore = 20; // Sustained across multiple runs
    } else if (input.isMultiRunSustained === false) {
      cScore = 0; // Not sustained / single isolated occurrence
    } else {
      cScore = n >= 3 ? 20 : n >= 1 ? 10 : 0;
    }

    const totalScore = Math.min(100, Math.max(25, sScore + qScore + cScore));

    let tier: RecommendationConfidenceTier = 'LOW';
    if (totalScore >= 80) {
      tier = 'HIGH';
    } else if (totalScore >= 50) {
      tier = 'MEDIUM';
    } else {
      tier = 'LOW';
    }

    return { score: totalScore, tier };
  }

  /**
   * Score a recommendation candidate deterministically
   */
  public static score(
    priorityInput: PriorityScoringInput,
    confidenceInput: ConfidenceScoringInput
  ): ScoringResult {
    const priorityScore = this.calculatePriority(priorityInput);
    const { score: confidenceScore, tier: confidenceTier } =
      this.calculateConfidence(confidenceInput);

    return {
      priorityScore,
      confidenceScore,
      confidenceTier,
    };
  }
}
