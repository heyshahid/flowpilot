import { NodeDriver } from '../types';

export const sendEmailDriver: NodeDriver = async (_context, resolvedConfig) => {
  const to = String(resolvedConfig.to || '').trim();
  const subject = String(resolvedConfig.subject || '').trim();
  const content = String(resolvedConfig.content || resolvedConfig.body || '').trim();

  if (!to) {
    throw new Error('Send Email node requires a valid "to" recipient address.');
  }

  // Basic email pattern check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error(`Invalid recipient email address format: "${to}".`);
  }

  if (!subject) {
    throw new Error('Send Email node requires a non-empty "subject".');
  }

  const messageId = `msg_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;

  return {
    delivered: true,
    messageId,
    recipient: to,
    subject,
    contentPreview: content.substring(0, 80),
    timestamp: new Date().toISOString(),
    provider: 'flowpilot-transactional-relay',
  };
};

