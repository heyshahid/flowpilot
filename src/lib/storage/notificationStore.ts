import fs from 'fs';
import path from 'path';
import { AlertNotification, NotificationChannel, NotificationDeliveryStatus } from '@/core/alerts/types';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'notifications.json');

export const SEED_NOTIFICATIONS: AlertNotification[] = [
  {
    id: 'notif_seed_001',
    workspaceId: 'ws_default',
    incidentId: 'inc_seed_001',
    ruleId: 'rule_exec_failure_high',
    channel: 'in_app',
    title: 'High Workflow Failure Rate',
    message: 'Workflow failure rate reached 33.3% (threshold: >= 25.0%)',
    severity: 'CRITICAL',
    deliveryStatus: 'DELIVERED',
    read: false,
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: 'notif_seed_002',
    workspaceId: 'ws_default',
    incidentId: 'inc_seed_002',
    ruleId: 'rule_ai_cost_spike',
    channel: 'in_app',
    title: 'Monthly AI Cost Quota Warning',
    message: 'Estimated AI cost reached $22.45 USD (threshold: >= $20.00 USD)',
    severity: 'WARNING',
    deliveryStatus: 'DELIVERED',
    read: true,
    createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
  },
];

export class NotificationStore {
  private cache: Map<string, AlertNotification> = new Map();
  private initialized = false;

  constructor() {
    this.ensureInitialized();
  }

  private ensureInitialized(): void {
    if (this.initialized) return;

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const data: AlertNotification[] = JSON.parse(raw);
        for (const notif of data) {
          this.cache.set(notif.id, notif);
        }
      } else {
        for (const notif of SEED_NOTIFICATIONS) {
          this.cache.set(notif.id, notif);
        }
        this.persist();
      }
    } catch {
      for (const notif of SEED_NOTIFICATIONS) {
        this.cache.set(notif.id, notif);
      }
    }

    this.initialized = true;
  }

  private persist(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = Array.from(this.cache.values());
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[NotificationStore] Failed to persist data:', err);
    }
  }

  public list(
    workspaceId: string,
    filter?: {
      channel?: NotificationChannel;
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    }
  ): { items: AlertNotification[]; total: number; unreadCount: number } {
    this.ensureInitialized();
    const wsNotifs = Array.from(this.cache.values())
      .filter((n) => n.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const unreadCount = wsNotifs.filter((n) => !n.read).length;

    const filtered = wsNotifs
      .filter((n) => (filter?.channel ? n.channel === filter.channel : true))
      .filter((n) => (filter?.unreadOnly ? !n.read : true));

    const total = filtered.length;
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 50;
    const items = filtered.slice(offset, offset + limit);

    return { items, total, unreadCount };
  }

  public create(
    params: Omit<AlertNotification, 'id' | 'createdAt' | 'read'>
  ): AlertNotification {
    this.ensureInitialized();
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const notification: AlertNotification = {
      ...params,
      id,
      read: false,
      createdAt: new Date().toISOString(),
    };

    this.cache.set(id, notification);
    this.persist();
    return notification;
  }

  public markAsRead(id: string, workspaceId?: string): boolean {
    this.ensureInitialized();
    const notif = this.cache.get(id);
    if (!notif) return false;
    if (workspaceId && notif.workspaceId !== workspaceId) return false;

    notif.read = true;
    this.cache.set(id, notif);
    this.persist();
    return true;
  }

  public markAllAsRead(workspaceId: string): number {
    this.ensureInitialized();
    let updated = 0;
    for (const notif of this.cache.values()) {
      if (notif.workspaceId === workspaceId && !notif.read) {
        notif.read = true;
        updated++;
      }
    }
    if (updated > 0) {
      this.persist();
    }
    return updated;
  }
}

export const notificationStore = new NotificationStore();

