import { NodeDriver } from '../types';

export const webhookTriggerDriver: NodeDriver = async (context, resolvedConfig) => {
  return {
    webhookReceived: true,
    triggerType: 'trigger.webhook',
    httpMethod: resolvedConfig.httpMethod || 'POST',
    data: context.trigger.payload || {},
    timestamp: new Date().toISOString(),
  };
};
