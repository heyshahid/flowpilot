/**
 * FlowPilot Phase 9G: Optimization Recommendations Engine Types
 */

export type RecommendationCategory =
  | 'WORKFLOW_PERFORMANCE'
  | 'NODE_OPTIMIZATION'
  | 'RELIABILITY'
  | 'INTEGRATION'
  | 'AI_COST'
  | 'SCHEDULING'
  | 'RESOURCE_USAGE'
  | 'WORKFLOW_ARCHITECTURE';

export type RecommendationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RecommendationConfidenceTier = 'LOW' | 'MEDIUM' | 'HIGH';

export type RecommendationTargetType =
  | 'WORKFLOW'
  | 'NODE'
  | 'INTEGRATION'
  | 'SCHEDULE'
  | 'WORKSPACE';

export type RecommendationStatus =
  | 'NEW'
  | 'VIEWED'
  | 'DISMISSED'
  | 'SNOOZED'
  | 'RESOLVED';

export interface RecommendationEvidence {
  metricName: string;
  observedValue: number | string | boolean;
  comparisonValue?: number | string | boolean | null;
  unit?: string;
  sampleSize: number;
  measurementPeriod: {
    from: string;
    to: string;
  };
  sourceService: string;
  relevantIds?: string[];
  notes?: string;
}

export interface RecommendationAction {
  id: string;
  title: string;
  description: string;
  actionType: 'NAVIGATE' | 'CONFIGURATION_GUIDE' | 'INSPECTION';
  targetUrl?: string;
  suggestedConfig?: Record<string, unknown>;
}

export interface EstimatedImpact {
  description: string;
  value?: number;
  unit?: string;
  isEstimated: boolean;
}

export interface OptimizationRecommendation {
  id: string;
  workspaceId: string;
  ruleId: string;
  category: RecommendationCategory;
  title: string;
  summary: string;
  description: string;
  severity: RecommendationSeverity;
  priorityScore: number; // Normalized 10 - 100
  confidence: RecommendationConfidenceTier;
  confidenceScore: number; // Normalized 25 - 100
  targetType: RecommendationTargetType;
  targetId?: string;
  targetName?: string;
  evidence: RecommendationEvidence[];
  suggestedActions: RecommendationAction[];
  estimatedImpact?: EstimatedImpact;
  limitations: string[];
  dataLimitations: string[];
  status: RecommendationStatus;
  dedupKey: string;
  occurrenceCount: number;
  firstIdentifiedAt: string;
  lastSeenAt: string;
  viewedAt?: string;
  dismissedAt?: string;
  dismissedBy?: string;
  dismissReason?: string;
  snoozedAt?: string;
  snoozedUntil?: string;
  snoozedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserFeedbackType =
  | 'HELPFUL'
  | 'NOT_HELPFUL'
  | 'ALREADY_FIXED'
  | 'NOT_RELEVANT'
  | 'INCORRECT';

export interface RecommendationFeedback {
  id: string;
  recommendationId: string;
  workspaceId: string;
  userId: string;
  userName: string;
  type: UserFeedbackType;
  comments?: string;
  createdAt: string;
}

export interface RecommendationHistoryEntry {
  id: string;
  recommendationId: string;
  workspaceId: string;
  action: 'CREATED' | 'VIEWED' | 'SNOOZED' | 'DISMISSED' | 'RESOLVED' | 'REGENERATED' | 'FEEDBACK_ADDED';
  actorId: string;
  actorName: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface RecommendationOverviewMetrics {
  workspaceId: string;
  totalActive: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  unreviewedCount: number; // status === 'NEW'
  resolvedCount: number;
  dismissedCount: number;
  snoozedCount: number;
  categoryDistribution: Record<RecommendationCategory, number>;
  generatedAt: string;
}

export interface RecommendationFilterOptions {
  category?: RecommendationCategory;
  severity?: RecommendationSeverity;
  status?: RecommendationStatus;
  confidence?: RecommendationConfidenceTier;
  targetType?: RecommendationTargetType;
  targetId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

