import fs from 'fs';
import path from 'path';
import { WorkerInstanceRecord } from '../../core/monitoring/types';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'workers.json');

export class WorkerStore {
  private inMemoryWorkers: Map<string, WorkerInstanceRecord> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (typeof window === 'undefined') {
      try {
        if (fs.existsSync(DATA_FILE)) {
          const raw = fs.readFileSync(DATA_FILE, 'utf-8');
          const list: WorkerInstanceRecord[] = JSON.parse(raw);
          for (const item of list) {
            this.inMemoryWorkers.set(item.id, item);
          }
          return;
        }
      } catch {
        // Fallback to empty
      }
    }
  }

  private persist(): void {
    if (typeof window === 'undefined') {
      try {
        const list = Array.from(this.inMemoryWorkers.values());
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
      } catch {
        // Retain in memory
      }
    }
  }

  public upsert(worker: WorkerInstanceRecord): WorkerInstanceRecord {
    this.inMemoryWorkers.set(worker.id, worker);
    this.persist();
    return worker;
  }

  public getById(id: string): WorkerInstanceRecord | null {
    return this.inMemoryWorkers.get(id) || null;
  }

  public list(): WorkerInstanceRecord[] {
    return Array.from(this.inMemoryWorkers.values());
  }

  public delete(id: string): boolean {
    const deleted = this.inMemoryWorkers.delete(id);
    if (deleted) {
      this.persist();
    }
    return deleted;
  }

  public clear(): void {
    this.inMemoryWorkers.clear();
    this.persist();
  }
}

export const workerStore = new WorkerStore();
