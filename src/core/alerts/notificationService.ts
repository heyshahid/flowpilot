import { notificationStore } from '@/lib/storage/notificationStore';
import {
  AlertIncident,
  AlertNotification,
  NotificationChannel,
  NotificationDeliveryStatus,
} from './types';

export class NotificationService {
  /**
   * Dispatch notifications for an incident across the rule's configured channels.
   */
  public async dispatchIncidentNotifications(
    incident: AlertIncident,
    channels: NotificationChannel[] = ['in_app']
  ): Promise<AlertNotification[]> {
    const results: AlertNotification[] = [];

    for (const channel of channels) {
      const title = `[${incident.severity}] ${incident.ruleName}`;
      const message = incident.message;

      let deliveryStatus: NotificationDeliveryStatus = 'PENDING';
      let deliveryError: string | undefined = undefined;

      switch (channel) {
        case 'in_app':
          // In-app notifications are directly stored and delivered to dashboard
          deliveryStatus = 'DELIVERED';
          break;

        case 'email':
          // External SMTP or notification service check
          deliveryStatus = 'NOT_CONFIGURED';
          deliveryError =
            'Workspace external SMTP/Email notification gateway is not configured.';
          break;

        case 'webhook':
          // External outgoing webhook endpoint check
          deliveryStatus = 'NOT_CONFIGURED';
          deliveryError =
            'Workspace notification webhook destination URL is not configured.';
          break;

        case 'slack':
          // Slack Incoming Webhook check
          deliveryStatus = 'NOT_CONFIGURED';
          deliveryError =
            'Workspace Slack integration webhook URL is not configured.';
          break;

        default:
          deliveryStatus = 'FAILED';
          deliveryError = `Unsupported notification channel: ${channel}`;
          break;
      }

      const notif = notificationStore.create({
        workspaceId: incident.workspaceId,
        incidentId: incident.id,
        ruleId: incident.ruleId,
        channel,
        title,
        message,
        severity: incident.severity,
        deliveryStatus,
        deliveryError,
      });

      results.push(notif);
    }

    return results;
  }
}

export const notificationService = new NotificationService();

