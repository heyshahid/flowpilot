import fs from 'fs';
import path from 'path';
import { RecommendationFeedback, UserFeedbackType } from '@/core/recommendations/types';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'recommendation_feedback.json');

export class RecommendationFeedbackStore {
  private cache: Map<string, RecommendationFeedback> = new Map();
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
        const data: RecommendationFeedback[] = JSON.parse(raw);
        for (const item of data) {
          this.cache.set(item.id, item);
        }
      }
    } catch (err) {
      console.error('[RecommendationFeedbackStore] Failed to initialize store:', err);
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
      console.error('[RecommendationFeedbackStore] Failed to persist data:', err);
    }
  }

  public create(params: {
    recommendationId: string;
    workspaceId: string;
    userId: string;
    userName: string;
    type: UserFeedbackType;
    comments?: string;
  }): RecommendationFeedback {
    this.ensureInitialized();
    const id = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const feedback: RecommendationFeedback = {
      ...params,
      id,
      createdAt: new Date().toISOString(),
    };

    this.cache.set(id, feedback);
    this.persist();
    return feedback;
  }

  public list(recommendationId: string, workspaceId?: string): RecommendationFeedback[] {
    this.ensureInitialized();
    return Array.from(this.cache.values())
      .filter((fb) => fb.recommendationId === recommendationId)
      .filter((fb) => (workspaceId ? fb.workspaceId === workspaceId : true))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public listByWorkspace(workspaceId: string): RecommendationFeedback[] {
    this.ensureInitialized();
    return Array.from(this.cache.values())
      .filter((fb) => fb.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export const recommendationFeedbackStore = new RecommendationFeedbackStore();

