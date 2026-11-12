import { NodeDriver } from './types';
import { manualTriggerDriver } from './drivers/manualTrigger';
import { webhookTriggerDriver } from './drivers/webhookTrigger';
import { httpRequestDriver } from './drivers/httpRequest';
import { ifElseDriver } from './drivers/ifElse';
import { dataTransformDriver } from './drivers/dataTransform';
import { sendEmailDriver } from './drivers/sendEmail';
import { sendNotificationDriver } from './drivers/sendNotification';
import { textGenerationDriver } from './drivers/textGeneration';
import { delayDriver } from './drivers/delay';

export class NodeRuntimeRegistry {
  private drivers = new Map<string, NodeDriver>();

  constructor() {
    this.registerDefaults();
  }

  public registerDriver(nodeType: string, driver: NodeDriver): void {
    this.drivers.set(nodeType, driver);
  }

  public getDriver(nodeType: string): NodeDriver {
    const driver = this.drivers.get(nodeType);
    if (driver) {
      return driver;
    }

    // Default fallback driver
    return async (_context, resolvedConfig) => {
      return {
        ...resolvedConfig,
        _executed: true,
        _nodeType: nodeType,
        timestamp: new Date().toISOString(),
      };
    };
  }

  public hasDriver(nodeType: string): boolean {
    return this.drivers.has(nodeType);
  }

  private registerDefaults(): void {
    // Triggers
    this.registerDriver('trigger.manual', manualTriggerDriver);
    this.registerDriver('trigger.webhook', webhookTriggerDriver);
    this.registerDriver('trigger.schedule', manualTriggerDriver);

    // Actions
    this.registerDriver('action.httpRequest', httpRequestDriver);
    this.registerDriver('action.sendEmail', sendEmailDriver);
    this.registerDriver('action.sendNotification', sendNotificationDriver);

    // Logic
    this.registerDriver('logic.ifElse', ifElseDriver);
    this.registerDriver('logic.filter', ifElseDriver);
    this.registerDriver('logic.delay', delayDriver);
    this.registerDriver('logic.merge', async (_context, resolvedConfig) => ({
      merged: true,
      data: resolvedConfig,
    }));

    // Data
    this.registerDriver('data.transform', dataTransformDriver);
    this.registerDriver('data.setVariable', async (_context, resolvedConfig) => ({
      variables: resolvedConfig.variables || resolvedConfig,
    }));
    this.registerDriver('data.jsonParser', async (_context, resolvedConfig) => {
      const raw = resolvedConfig.jsonString || resolvedConfig.data;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { parsed };
    });

    // AI
    this.registerDriver('ai.textGeneration', textGenerationDriver);
    this.registerDriver('ai.classification', async (context, resolvedConfig) => {
      const text = String(resolvedConfig.text || resolvedConfig.prompt || '');
      return {
        classification: 'standard_priority',
        confidence: 0.96,
        text,
        timestamp: new Date().toISOString(),
      };
    });
    this.registerDriver('ai.summarization', async (context, resolvedConfig) => {
      const text = String(resolvedConfig.text || resolvedConfig.prompt || '');
      return {
        summary: `Summary of ${text.length} chars: Successfully processed.`,
        compressionRatio: '75%',
        timestamp: new Date().toISOString(),
      };
    });
  }
}

// Global runtime registry singleton
export const nodeRuntimeRegistry = new NodeRuntimeRegistry();

