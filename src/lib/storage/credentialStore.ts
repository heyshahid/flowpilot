import fs from 'fs';
import path from 'path';
import { CredentialVault } from '../../core/security/vault';

export interface CredentialRecord {
  id: string;
  name: string;
  integrationId: string;
  type: 'api_key' | 'oauth2' | 'basic_auth' | 'bearer_token' | 'smtp';
  encryptedData: string;
  maskedPreview: Record<string, string>;
  status: 'valid' | 'invalid' | 'untested';
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'credentials.json');

export const SEED_CREDENTIALS: CredentialRecord[] = [
  {
    id: 'cred_sample_smtp',
    name: 'Transactional SMTP Relay (SendGrid)',
    integrationId: 'smtp',
    type: 'smtp',
    encryptedData: CredentialVault.encrypt({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      user: 'apikey',
      password: 'mock_sg_api_key_for_testing_relay_12345',
      senderEmail: 'notifications@flowpilot.dev',
      senderName: 'FlowPilot Dispatcher',
    }),
    maskedPreview: {
      host: 'smtp.sendgrid.net',
      port: '587',
      user: 'apikey',
      password: CredentialVault.maskSecret('mock_sg_api_key_for_testing_relay_12345'),
      senderEmail: 'notifications@flowpilot.dev',
    },
    status: 'valid',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    lastVerifiedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: 'cred_sample_slack',
    name: 'FlowPilot Alerts Slack Bot',
    integrationId: 'slack',
    type: 'bearer_token',
    encryptedData: CredentialVault.encrypt({
      botToken: 'xoxb-982141-891238-fakeSlackBotToken123',
      defaultChannel: '#alerts',
    }),
    maskedPreview: {
      botToken: CredentialVault.maskSecret('xoxb-982141-891238-fakeSlackBotToken123'),
      defaultChannel: '#alerts',
    },
    status: 'valid',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    lastVerifiedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'cred_sample_telegram',
    name: 'Ops Telegram Bot Dispatcher',
    integrationId: 'telegram',
    type: 'api_key',
    encryptedData: CredentialVault.encrypt({
      botToken: '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ1234567',
      defaultChatId: '-100123456789',
    }),
    maskedPreview: {
      botToken: CredentialVault.maskSecret('123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ1234567'),
      defaultChatId: '-100123456789',
    },
    status: 'valid',
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    lastVerifiedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
  },
];

export class CredentialStore {
  private inMemoryCredentials = new Map<string, CredentialRecord>();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (typeof window === 'undefined') {
      try {
        if (fs.existsSync(DATA_FILE)) {
          const raw = fs.readFileSync(DATA_FILE, 'utf-8');
          const list: CredentialRecord[] = JSON.parse(raw);
          for (const item of list) {
            this.inMemoryCredentials.set(item.id, item);
          }
          return;
        }
      } catch {
        // Fallback to seeds
      }
    }

    for (const seed of SEED_CREDENTIALS) {
      this.inMemoryCredentials.set(seed.id, seed);
    }
    this.persist();
  }

  private persist(): void {
    const list = Array.from(this.inMemoryCredentials.values());
    if (typeof window === 'undefined') {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
      } catch {
        // In-memory retains records
      }
    }
  }

  public async save(params: {
    name: string;
    integrationId: string;
    type: CredentialRecord['type'];
    data: Record<string, any>;
  }): Promise<CredentialRecord> {
    const id = `cred_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    const encryptedData = CredentialVault.encrypt(params.data);

    // Build masked preview
    const maskedPreview: Record<string, string> = {};
    for (const [key, value] of Object.entries(params.data)) {
      if (typeof value === 'string' && value.length > 0) {
        maskedPreview[key] =
          key.toLowerCase().includes('password') ||
            key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('key')
            ? CredentialVault.maskSecret(value)
            : value;
      } else {
        maskedPreview[key] = String(value);
      }
    }

    const record: CredentialRecord = {
      id,
      name: params.name,
      integrationId: params.integrationId,
      type: params.type,
      encryptedData,
      maskedPreview,
      status: 'untested',
      createdAt: now,
      updatedAt: now,
    };

    this.inMemoryCredentials.set(id, record);
    this.persist();
    return record;
  }

  public async getById(id: string): Promise<CredentialRecord | null> {
    return this.inMemoryCredentials.get(id) || null;
  }

  public async getDecryptedData<T = Record<string, any>>(id: string): Promise<T | null> {
    const record = await this.getById(id);
    if (!record) return null;
    return CredentialVault.decrypt<T>(record.encryptedData);
  }

  public async updateStatus(id: string, status: 'valid' | 'invalid'): Promise<void> {
    const record = this.inMemoryCredentials.get(id);
    if (record) {
      record.status = status;
      record.lastVerifiedAt = new Date().toISOString();
      record.updatedAt = new Date().toISOString();
      this.persist();
    }
  }

  public listSync(filter?: { integrationId?: string }): CredentialRecord[] {
    let list = Array.from(this.inMemoryCredentials.values());
    if (filter?.integrationId) {
      list = list.filter((c) => c.integrationId === filter.integrationId);
    }
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public async list(filter?: { integrationId?: string }): Promise<CredentialRecord[]> {
    return this.listSync(filter);
  }

  public async delete(id: string): Promise<boolean> {
    const deleted = this.inMemoryCredentials.delete(id);
    if (deleted) {
      this.persist();
    }
    return deleted;
  }
}

export const credentialStore = new CredentialStore();

