import { NodeDriver } from '../types';

export const manualTriggerDriver: NodeDriver = async (context, resolvedConfig) => {
  return {
    triggered: true,
    triggerType: 'trigger.manual',
    payload: context.trigger.payload || {},
    config: resolvedConfig,
    timestamp: new Date().toISOString(),
  };
};
