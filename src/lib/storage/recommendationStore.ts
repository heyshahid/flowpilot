import fs from 'fs';
import path from 'path';
import {
  OptimizationRecommendation,
  RecommendationFilterOptions,
  RecommendationOverviewMetrics,
  RecommendationHistoryEntry,
  RecommendationCategory,
} from '@/core/recommendations/types';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'recommendations.json');
const HISTORY_FILE = path.join(DATA_DIR, 'recommendation_history.json');

export class RecommendationStore {
  private cache: Map<string, OptimizationRecommendation> = new Map();
  private historyCache: RecommendationHistoryEntry[] = [];
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
        const data: OptimizationRecommendation[] = JSON.parse(raw);
        for (const item of data) {
          this.cache.set(item.id, item);
        }
      }

      if (fs.existsSync(HISTORY_FILE)) {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
        this.historyCache = JSON.parse(raw);
      }
    } catch (err) {
      console.error('[RecommendationStore] Failed to initialize store:', err);
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
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.historyCache, null, 2), 'utf-8');
    } catch (err) {
      console.error('[RecommendationStore] Failed to persist data:', err);
    }
  }

  public getById(id: string, workspaceId?: string): OptimizationRecommendation | null {
    this.ensureInitialized();
    const rec = this.cache.get(id);
    if (!rec) return null;
    if (workspaceId && rec.workspaceId !== workspaceId) return null;
    return rec;
  }

  public getActiveByDedupKey(dedupKey: string): OptimizationRecommendation | null {
    this.ensureInitialized();
    for (const rec of this.cache.values()) {
      if (
        rec.dedupKey === dedupKey &&
        (rec.status === 'NEW' || rec.status === 'VIEWED' || rec.status === 'SNOOZED')
      ) {
        return rec;
      }
    }
    return null;
  }

  public getHistoricalByDedupKey(dedupKey: string): OptimizationRecommendation | null {
    this.ensureInitialized();
    const matches: OptimizationRecommendation[] = [];
    for (const rec of this.cache.values()) {
      if (rec.dedupKey === dedupKey) {
        matches.push(rec);
      }
    }
    if (matches.length === 0) return null;
    // Return most recent
    matches.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return matches[0];
  }

  public list(
    workspaceId: string,
    filter?: RecommendationFilterOptions
  ): { items: OptimizationRecommendation[]; total: number } {
    this.ensureInitialized();
    const now = Date.now();

    // Check snoozed expiration
    for (const rec of this.cache.values()) {
      if (rec.status === 'SNOOZED' && rec.snoozedUntil) {
        if (new Date(rec.snoozedUntil).getTime() <= now) {
          rec.status = 'NEW';
          rec.updatedAt = new Date().toISOString();
        }
      }
    }

    const all = Array.from(this.cache.values())
      .filter((r) => r.workspaceId === workspaceId)
      .filter((r) => (filter?.category ? r.category === filter.category : true))
      .filter((r) => (filter?.severity ? r.severity === filter.severity : true))
      .filter((r) => (filter?.status ? r.status === filter.status : true))
      .filter((r) => (filter?.confidence ? r.confidence === filter.confidence : true))
      .filter((r) => (filter?.targetType ? r.targetType === filter.targetType : true))
      .filter((r) => (filter?.targetId ? r.targetId === filter.targetId : true))
      .filter((r) => {
        if (!filter?.search) return true;
        const q = filter.search.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          (r.targetName && r.targetName.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        // Sort: Priority descending, then creation date descending
        if (b.priorityScore !== a.priorityScore) {
          return b.priorityScore - a.priorityScore;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const total = all.length;
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 50;
    const items = all.slice(offset, offset + limit);

    return { items, total };
  }

  public save(rec: OptimizationRecommendation): OptimizationRecommendation {
    this.ensureInitialized();
    this.cache.set(rec.id, rec);
    this.persist();
    return rec;
  }

  public recordHistory(entry: Omit<RecommendationHistoryEntry, 'id' | 'timestamp'>): void {
    this.ensureInitialized();
    const historyEntry: RecommendationHistoryEntry = {
      ...entry,
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    this.historyCache.push(historyEntry);
    this.persist();
  }

  public getHistory(recommendationId: string, workspaceId?: string): RecommendationHistoryEntry[] {
    this.ensureInitialized();
    return this.historyCache
      .filter((h) => h.recommendationId === recommendationId)
      .filter((h) => (workspaceId ? h.workspaceId === workspaceId : true))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public view(id: string, actorId: string, workspaceId?: string): OptimizationRecommendation | null {
    this.ensureInitialized();
    const rec = this.getById(id, workspaceId);
    if (!rec) return null;

    if (rec.status === 'NEW') {
      rec.status = 'VIEWED';
      rec.viewedAt = new Date().toISOString();
      rec.updatedAt = new Date().toISOString();
      this.cache.set(id, rec);
      this.recordHistory({
        recommendationId: id,
        workspaceId: rec.workspaceId,
        action: 'VIEWED',
        actorId,
        actorName: actorId,
      });
      this.persist();
    }
    return rec;
  }

  public dismiss(
    id: string,
    actorId: string,
    reason?: string,
    workspaceId?: string
  ): OptimizationRecommendation | null {
    this.ensureInitialized();
    const rec = this.getById(id, workspaceId);
    if (!rec) return null;

    rec.status = 'DISMISSED';
    rec.dismissedAt = new Date().toISOString();
    rec.dismissedBy = actorId;
    if (reason) rec.dismissReason = reason;
    rec.updatedAt = new Date().toISOString();

    this.cache.set(id, rec);
    this.recordHistory({
      recommendationId: id,
      workspaceId: rec.workspaceId,
      action: 'DISMISSED',
      actorId,
      actorName: actorId,
      details: { reason },
    });
    this.persist();
    return rec;
  }

  public snooze(
    id: string,
    actorId: string,
    untilDate: string,
    workspaceId?: string
  ): OptimizationRecommendation | null {
    this.ensureInitialized();
    const rec = this.getById(id, workspaceId);
    if (!rec) return null;

    rec.status = 'SNOOZED';
    rec.snoozedAt = new Date().toISOString();
    rec.snoozedUntil = untilDate;
    rec.snoozedBy = actorId;
    rec.updatedAt = new Date().toISOString();

    this.cache.set(id, rec);
    this.recordHistory({
      recommendationId: id,
      workspaceId: rec.workspaceId,
      action: 'SNOOZED',
      actorId,
      actorName: actorId,
      details: { untilDate },
    });
    this.persist();
    return rec;
  }

  public resolve(
    id: string,
    actorId: string,
    notes?: string,
    workspaceId?: string
  ): OptimizationRecommendation | null {
    this.ensureInitialized();
    const rec = this.getById(id, workspaceId);
    if (!rec) return null;

    rec.status = 'RESOLVED';
    rec.resolvedAt = new Date().toISOString();
    rec.resolvedBy = actorId;
    if (notes) rec.resolutionNotes = notes;
    rec.updatedAt = new Date().toISOString();

    this.cache.set(id, rec);
    this.recordHistory({
      recommendationId: id,
      workspaceId: rec.workspaceId,
      action: 'RESOLVED',
      actorId,
      actorName: actorId,
      details: { notes },
    });
    this.persist();
    return rec;
  }

  public getOverview(workspaceId: string): RecommendationOverviewMetrics {
    this.ensureInitialized();
    const wsItems = Array.from(this.cache.values()).filter((r) => r.workspaceId === workspaceId);

    const categoryDistribution: Record<RecommendationCategory, number> = {
      WORKFLOW_PERFORMANCE: 0,
      NODE_OPTIMIZATION: 0,
      RELIABILITY: 0,
      INTEGRATION: 0,
      AI_COST: 0,
      SCHEDULING: 0,
      RESOURCE_USAGE: 0,
      WORKFLOW_ARCHITECTURE: 0,
    };

    let totalActive = 0;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let unreviewedCount = 0;
    let resolvedCount = 0;
    let dismissedCount = 0;
    let snoozedCount = 0;

    for (const item of wsItems) {
      if (item.category in categoryDistribution) {
        categoryDistribution[item.category]++;
      }

      if (item.status === 'NEW' || item.status === 'VIEWED') {
        totalActive++;
        if (item.severity === 'CRITICAL') criticalCount++;
        if (item.severity === 'HIGH') highCount++;
        if (item.severity === 'MEDIUM') mediumCount++;
        if (item.severity === 'LOW') lowCount++;
      }

      if (item.status === 'NEW') unreviewedCount++;
      if (item.status === 'RESOLVED') resolvedCount++;
      if (item.status === 'DISMISSED') dismissedCount++;
      if (item.status === 'SNOOZED') snoozedCount++;
    }

    return {
      workspaceId,
      totalActive,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      unreviewedCount,
      resolvedCount,
      dismissedCount,
      snoozedCount,
      categoryDistribution,
      generatedAt: new Date().toISOString(),
    };
  }

  public clearWorkspace(workspaceId: string): void {
    this.ensureInitialized();
    const removedIds = new Set<string>();
    for (const [id, rec] of this.cache.entries()) {
      if (rec.workspaceId === workspaceId) {
        removedIds.add(id);
        this.cache.delete(id);
      }
    }
    this.historyCache = this.historyCache.filter((h) => !removedIds.has(h.recommendationId));
    this.persist();
  }
}

export const recommendationStore = new RecommendationStore();

