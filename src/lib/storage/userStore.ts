import fs from 'fs';
import path from 'path';
import { UserRecord } from '../../core/auth/types';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'users.json');

export const SEED_USERS: UserRecord[] = [
  {
    id: 'usr_owner',
    name: 'Shahid Akram',
    email: 'shd.13021990@gmail.com',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
  },
  {
    id: 'usr_admin',
    name: 'Sarah Connor',
    email: 'sarah@cyberdyne.org',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
    createdAt: new Date(Date.now() - 86400000 * 25).toISOString(),
  },
  {
    id: 'usr_editor',
    name: 'Alex Rivera',
    email: 'alex.rivera@dev.io',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
    createdAt: new Date(Date.now() - 86400000 * 15).toISOString(),
  },
  {
    id: 'usr_viewer',
    name: 'Elena Rostova',
    email: 'elena@observability.net',
    avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
];

export class UserStore {
  private users: Map<string, UserRecord> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (typeof window === 'undefined') {
      try {
        if (fs.existsSync(DATA_FILE)) {
          const raw = fs.readFileSync(DATA_FILE, 'utf-8');
          const list: UserRecord[] = JSON.parse(raw);
          for (const u of list) {
            this.users.set(u.id, u);
          }
        }
      } catch {
        // Fallback to in-memory
      }
    }

    if (this.users.size === 0) {
      for (const u of SEED_USERS) {
        this.users.set(u.id, u);
      }
      this.persist();
    }
  }

  private persist(): void {
    if (typeof window === 'undefined') {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(this.users.values()), null, 2), 'utf-8');
      } catch {
        // In-memory retains
      }
    }
  }

  public getById(id: string): UserRecord | null {
    return this.users.get(id) || null;
  }

  public getByEmail(email: string): UserRecord | null {
    const target = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === target) {
        return u;
      }
    }
    return null;
  }

  public list(): UserRecord[] {
    return Array.from(this.users.values());
  }

  public create(params: { name: string; email: string; avatarUrl?: string }): UserRecord {
    const existing = this.getByEmail(params.email);
    if (existing) return existing;

    const id = `usr_${Math.random().toString(36).substring(2, 9)}`;
    const user: UserRecord = {
      id,
      name: params.name.trim(),
      email: params.email.toLowerCase().trim(),
      avatarUrl: params.avatarUrl,
      createdAt: new Date().toISOString(),
    };

    this.users.set(id, user);
    this.persist();
    return user;
  }
}

export const userStore = new UserStore();
