import { NodeDriver } from '../types';

export const sendNotificationDriver: NodeDriver = async (_context, resolvedConfig) => {
  const channel = String(resolvedConfig.channel || 'in_app').toLowerCase();
  const message = String(resolvedConfig.message || resolvedConfig.text || '').trim();

  if (!message) {
    throw new Error('Send Notification node requires a non-empty "message".');
  }

  const notificationId = `notif_${Math.random().toString(36).substring(2, 10)}`;

  return {
    sent: true,
    notificationId,
    channel,
    message,
    recipient: resolvedConfig.recipient || 'system_channel',
    timestamp: new Date().toISOString(),
  };
};

