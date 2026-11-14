import { recommendationStore } from '@/lib/storage/recommendationStore';
import { recommendationFeedbackStore } from '@/lib/storage/recommendationFeedbackStore';
import { recommendationEngine, EvaluationResultSummary } from './recommendationEngine';
import {
  OptimizationRecommendation,
  RecommendationFilterOptions,
  RecommendationOverviewMetrics,
  RecommendationFeedback,
  RecommendationHistoryEntry,
  UserFeedbackType,
} from './types';

export class RecommendationService {
  /**
   * List recommendations for a workspace with filtering and pagination
   */
  public async getRecommendations(
    workspaceId: string = 'ws_default',
    filter?: RecommendationFilterOptions
  ): Promise<{ items: OptimizationRecommendation[]; total: number }> {
    return recommendationStore.list(workspaceId, filter);
  }

  /**
   * Retrieve a single recommendation by ID with workspace isolation
   */
  public async getRecommendationById(
    id: string,
    workspaceId?: string
  ): Promise<OptimizationRecommendation | null> {
    return recommendationStore.getById(id, workspaceId);
  }

  /**
   * Get overview aggregate statistics for recommendations in a workspace
   */
  public async getOverview(
    workspaceId: string = 'ws_default'
  ): Promise<RecommendationOverviewMetrics> {
    return recommendationStore.getOverview(workspaceId);
  }

  /**
   * Trigger on-demand workspace evaluation
   */
  public async evaluateWorkspace(
    workspaceId: string = 'ws_default'
  ): Promise<EvaluationResultSummary> {
    return recommendationEngine.evaluateWorkspace(workspaceId);
  }

  /**
   * Mark recommendation as viewed
   */
  public async viewRecommendation(
    id: string,
    actorId: string,
    workspaceId?: string
  ): Promise<OptimizationRecommendation | null> {
    return recommendationStore.view(id, actorId, workspaceId);
  }

  /**
   * Dismiss recommendation with reason
   */
  public async dismissRecommendation(
    id: string,
    actorId: string,
    reason?: string,
    workspaceId?: string
  ): Promise<OptimizationRecommendation | null> {
    return recommendationStore.dismiss(id, actorId, reason, workspaceId);
  }

  /**
   * Snooze recommendation until date
   */
  public async snoozeRecommendation(
    id: string,
    actorId: string,
    untilDate: string,
    workspaceId?: string
  ): Promise<OptimizationRecommendation | null> {
    return recommendationStore.snooze(id, actorId, untilDate, workspaceId);
  }

  /**
   * Resolve recommendation with optional notes
   */
  public async resolveRecommendation(
    id: string,
    actorId: string,
    notes?: string,
    workspaceId?: string
  ): Promise<OptimizationRecommendation | null> {
    return recommendationStore.resolve(id, actorId, notes, workspaceId);
  }

  /**
   * Submit user feedback on a recommendation
   */
  public async submitFeedback(params: {
    recommendationId: string;
    workspaceId: string;
    userId: string;
    userName: string;
    type: UserFeedbackType;
    comments?: string;
  }): Promise<RecommendationFeedback> {
    const feedback = recommendationFeedbackStore.create(params);
    recommendationStore.recordHistory({
      recommendationId: params.recommendationId,
      workspaceId: params.workspaceId,
      action: 'FEEDBACK_ADDED',
      actorId: params.userId,
      actorName: params.userName,
      details: { type: params.type, comments: params.comments },
    });
    return feedback;
  }

  /**
   * Retrieve feedback for a recommendation
   */
  public async getFeedback(
    recommendationId: string,
    workspaceId?: string
  ): Promise<RecommendationFeedback[]> {
    return recommendationFeedbackStore.list(recommendationId, workspaceId);
  }

  /**
   * Retrieve history audit log for a recommendation
   */
  public async getHistory(
    recommendationId: string,
    workspaceId?: string
  ): Promise<RecommendationHistoryEntry[]> {
    return recommendationStore.getHistory(recommendationId, workspaceId);
  }
}

export const recommendationService = new RecommendationService();

