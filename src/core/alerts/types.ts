/**
 * Alert Rules, Incidents & Notifications Types - Phase 9F
 */

export type AlertCategory =
  | 'EXECUTION'
  | 'SCHEDULING'
  | 'INTEGRATION'
  | 'AI_USAGE'
  | 'WORKSPACE_USAGE';

export type AlertMetric =
  // Execution category
  | 'failure_rate'
  | 'consecutive_failures'
  | 'execution_duration_p95'
  | 'stuck_executions'
  // Scheduling category
  | 'missed_schedules'
  | 'schedule_failure_rate'
  // Integration category
  | 'integration_failure_rate'
  | 'webhook_error_rate'
  // AI Usage category
  | 'monthly_cost_usd'
  | 'monthly_tokens'
  | 'unpriced_requests_count'
  // Workspace Usage category
  | 'workflow_limit_pct'
  | 'execution_limit_pct'
  | 'schedule_limit_pct'
  | 'ai_cost_limit_pct';

export type AlertOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type NotificationChannel = 'in_app' | 'email' | 'webhook' | 'slack';

export interface AlertRule {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  category: AlertCategory;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  evaluationWindowMinutes: number; // e.g. 5, 15, 60, 1440
  cooldownMinutes: number;          // e.g. 15, 60, 360
  severity: AlertSeverity;
  enabled: boolean;
  targetWorkflowId?: string;       // Optional target (specific workflow or entire workspace)
  channels: NotificationChannel[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastEvaluatedAt?: string;
  lastTriggeredAt?: string;
}

export type IncidentStatus = 'TRIGGERED' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface AlertIncident {
  id: string;
  workspaceId: string;
  ruleId: string;
  ruleName: string;
  category: AlertCategory;
  severity: AlertSeverity;
  status: IncidentStatus;
  dedupKey: string;
  metric: AlertMetric;
  currentValue: number;
  threshold: number;
  message: string;
  targetType?: 'workflow' | 'schedule' | 'integration' | 'workspace';
  targetId?: string;
  targetName?: string;
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
  occurrenceCount: number;
  lastSeenAt: string;
}

export type NotificationDeliveryStatus =
  | 'DELIVERED'
  | 'FAILED'
  | 'NOT_CONFIGURED'
  | 'PENDING';

export interface AlertNotification {
  id: string;
  workspaceId: string;
  incidentId: string;
  ruleId: string;
  channel: NotificationChannel;
  recipient?: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  deliveryStatus: NotificationDeliveryStatus;
  deliveryError?: string;
  read: boolean;
  createdAt: string;
}

