import fs from 'fs';
import path from 'path';
import { WebhookSecurityManager } from '../../core/security/webhookSecurity';

export interface WebhookConfig {
  id: string;
  workflowId: string;
  workflowName: string;
  workspaceId?: string;
  name: string;
  token: string;
  secret: string;
  status: 'active' | 'disabled';
  allowedMethods: ('POST' | 'GET')[];
  authType: 'none' | 'hmac_sha256' | 'bearer_token' | 'api_key';
  rateLimitPerMin: number;
  replayToleranceSec: number;
  deliveryCount: number;
  lastDeliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  webhookId: string;
  workflowId: string;
  executionId?: string;
  status: 'ACCEPTED' | 'REJECTED' | 'FAILED';
  httpStatus: number;
  requestMethod: string;
  headers: Record<string, string>;
  clientIp: string;
  payloadPreview: string;
  durationMs: number;
  errorReason?: string;
  timestamp: string;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const CONFIGS_FILE = path.join(DATA_DIR, 'webhooks.json');
const DELIVERIES_FILE = path.join(DATA_DIR, 'webhook_deliveries.json');

export const SEED_WEBHOOKS: WebhookConfig[] = [
  {
    id: 'whk_lead_ingestion',
    workflowId: 'wf_lead_qualification',
    workflowName: 'Inbound Lead Qualification & VIP Routing',
    name: 'Website Contact Form Webhook',
    token: 'whk_48a9f029b9e14a89bc213890',
    secret: 'fpsec_98124901824901248091248901284901',
    status: 'active',
    allowedMethods: ['POST'],
    authType: 'hmac_sha256',
    rateLimitPerMin: 60,
    replayToleranceSec: 300,
    deliveryCount: 142,
    lastDeliveredAt: new Date(Date.now() - 1800000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'whk_order_sync',
    workflowId: 'wf_order_enrichment',
    workflowName: 'Customer Order Enrichment API',
    name: 'Shopify Order Checkout Hook',
    token: 'whk_72cd49e10912839012489012',
    secret: 'fpsec_72891249012849012849012849012849',
    status: 'active',
    allowedMethods: ['POST'],
    authType: 'none',
    rateLimitPerMin: 120,
    replayToleranceSec: 300,
    deliveryCount: 28,
    lastDeliveredAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
];

export class WebhookStore {
  private configs = new Map<string, WebhookConfig>();
  private deliveries: WebhookDeliveryRecord[] = [];

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (typeof window === 'undefined') {
      try {
        if (fs.existsSync(CONFIGS_FILE)) {
          const raw = fs.readFileSync(CONFIGS_FILE, 'utf-8');
          const list: WebhookConfig[] = JSON.parse(raw);
          for (const item of list) {
            this.configs.set(item.id, item);
          }
        }
      } catch {
        // Fallback
      }

      try {
        if (fs.existsSync(DELIVERIES_FILE)) {
          const raw = fs.readFileSync(DELIVERIES_FILE, 'utf-8');
          this.deliveries = JSON.parse(raw);
        }
      } catch {
        // Fallback
      }
    }

    if (this.configs.size === 0) {
      for (const seed of SEED_WEBHOOKS) {
        this.configs.set(seed.id, seed);
      }
      this.persistConfigs();
    }
  }

  private persistConfigs(): void {
    if (typeof window === 'undefined') {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(CONFIGS_FILE, JSON.stringify(Array.from(this.configs.values()), null, 2), 'utf-8');
      } catch {
        // In-memory retains
      }
    }
  }

  private persistDeliveries(): void {
    if (typeof window === 'undefined') {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        // Retain max 500 recent deliveries
        const recent = this.deliveries.slice(-500);
        fs.writeFileSync(DELIVERIES_FILE, JSON.stringify(recent, null, 2), 'utf-8');
      } catch {
        // In-memory retains
      }
    }
  }

  public async create(params: {
    workflowId: string;
    workflowName: string;
    name?: string;
    authType?: WebhookConfig['authType'];
    allowedMethods?: ('POST' | 'GET')[];
    rateLimitPerMin?: number;
  }): Promise<WebhookConfig> {
    const id = `whk_cfg_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const config: WebhookConfig = {
      id,
      workflowId: params.workflowId,
      workflowName: params.workflowName,
      name: params.name || `${params.workflowName} Ingestion`,
      token: WebhookSecurityManager.generateWebhookToken(),
      secret: WebhookSecurityManager.generateWebhookSecret(),
      status: 'active',
      allowedMethods: params.allowedMethods || ['POST'],
      authType: params.authType || 'none',
      rateLimitPerMin: params.rateLimitPerMin || 60,
      replayToleranceSec: 300,
      deliveryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.configs.set(id, config);
    this.persistConfigs();
    return config;
  }

  public async getById(id: string): Promise<WebhookConfig | null> {
    return this.configs.get(id) || null;
  }

  public async getByToken(token: string): Promise<WebhookConfig | null> {
    for (const c of this.configs.values()) {
      if (c.token === token) return c;
    }
    return null;
  }

  public async getByWorkflowId(workflowId: string): Promise<WebhookConfig | null> {
    for (const c of this.configs.values()) {
      if (c.workflowId === workflowId) return c;
    }
    return null;
  }

  public async list(workspaceId?: string): Promise<WebhookConfig[]> {
    let list = Array.from(this.configs.values());
    if (workspaceId) {
      list = list.filter((c) => (c.workspaceId || 'ws_default') === workspaceId);
    }
    return list.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public async rotateSecret(id: string): Promise<WebhookConfig> {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Webhook "${id}" not found.`);

    config.secret = WebhookSecurityManager.generateWebhookSecret();
    config.updatedAt = new Date().toISOString();
    this.persistConfigs();
    return config;
  }

  public async updateStatus(id: string, status: 'active' | 'disabled'): Promise<WebhookConfig> {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Webhook "${id}" not found.`);

    config.status = status;
    config.updatedAt = new Date().toISOString();
    this.persistConfigs();
    return config;
  }

  public async logDelivery(delivery: Omit<WebhookDeliveryRecord, 'id' | 'timestamp'>): Promise<WebhookDeliveryRecord> {
    const record: WebhookDeliveryRecord = {
      ...delivery,
      id: `deliv_${Math.random().toString(36).substring(2, 10)}`,
      timestamp: new Date().toISOString(),
    };

    this.deliveries.unshift(record);
    if (this.deliveries.length > 500) {
      this.deliveries.pop();
    }

    // Increment config delivery counter
    const config = this.configs.get(delivery.webhookId);
    if (config) {
      config.deliveryCount = (config.deliveryCount || 0) + 1;
      config.lastDeliveredAt = record.timestamp;
      config.updatedAt = record.timestamp;
      this.persistConfigs();
    }

    this.persistDeliveries();
    return record;
  }

  public async getDeliveries(webhookId?: string, limit = 50): Promise<WebhookDeliveryRecord[]> {
    let list = this.deliveries;
    if (webhookId) {
      list = list.filter((d) => d.webhookId === webhookId);
    }
    return list.slice(0, limit);
  }
}

export const webhookStore = new WebhookStore();

