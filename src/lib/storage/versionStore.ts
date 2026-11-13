import fs from 'fs';
import path from 'path';
import { WorkflowVersion, VersionDiffResult } from '../../core/versioning/types';
import { workflowStore, WorkflowRecord } from './workflowStore';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'workflow_versions.json');

export class VersionStore {
  private inMemoryVersions = new Map<string, WorkflowVersion>();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (typeof window === 'undefined') {
      try {
        if (fs.existsSync(DATA_FILE)) {
          const raw = fs.readFileSync(DATA_FILE, 'utf-8');
          const list: WorkflowVersion[] = JSON.parse(raw);
          for (const item of list) {
            this.inMemoryVersions.set(item.id, item);
          }
          return;
        }
      } catch {
        // Fallback to auto-seeding
      }
    }

    // Auto-seed v1 snapshots for existing workflows
    const allWorkflows = workflowStore.getAll();
    for (const wf of allWorkflows) {
      const vId = `ver_${wf.id}_v1`;
      this.inMemoryVersions.set(vId, {
        id: vId,
        workflowId: wf.id,
        versionNumber: 1,
        name: wf.name,
        description: wf.description,
        nodes: [...wf.nodes],
        edges: [...wf.edges],
        nodeCount: wf.nodes.length,
        edgeCount: wf.edges.length,
        isPublished: true,
        changeSummary: 'Initial baseline production release (v1.0.0)',
        createdBy: 'system@flowpilot.dev',
        createdAt: wf.createdAt,
      });
    }
    this.persist();
  }

  private persist(): void {
    if (typeof window === 'undefined') {
      try {
        const list = Array.from(this.inMemoryVersions.values());
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
      } catch {
        // Retain in memory
      }
    }
  }

  /**
   * Captures an immutable version snapshot of a workflow.
   */
  public async createVersion(
    workflowId: string,
    changeSummary: string = 'Workflow updated',
    isPublished: boolean = true,
    createdBy: string = 'user'
  ): Promise<WorkflowVersion> {
    const workflow = workflowStore.getById(workflowId);
    if (!workflow) {
      throw new Error(`Cannot version non-existent workflow "${workflowId}".`);
    }

    const existingVersions = await this.listVersions(workflowId);
    const nextVersionNumber = existingVersions.length > 0
      ? Math.max(...existingVersions.map((v) => v.versionNumber)) + 1
      : 1;

    const id = `ver_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    const versionRecord: WorkflowVersion = {
      id,
      workflowId,
      versionNumber: nextVersionNumber,
      name: workflow.name,
      description: workflow.description,
      nodes: JSON.parse(JSON.stringify(workflow.nodes)),
      edges: JSON.parse(JSON.stringify(workflow.edges)),
      nodeCount: workflow.nodes.length,
      edgeCount: workflow.edges.length,
      isPublished,
      changeSummary,
      createdBy,
      createdAt: now,
    };

    this.inMemoryVersions.set(id, versionRecord);
    this.persist();
    return versionRecord;
  }

  /**
   * Lists all versions for a given workflow ordered from newest to oldest.
   */
  public async listVersions(workflowId: string): Promise<WorkflowVersion[]> {
    const list = Array.from(this.inMemoryVersions.values()).filter(
      (v) => v.workflowId === workflowId
    );
    return list.sort((a, b) => b.versionNumber - a.versionNumber);
  }

  public async getVersion(versionId: string): Promise<WorkflowVersion | null> {
    return this.inMemoryVersions.get(versionId) || null;
  }

  /**
   * Restores a workflow graph definition to a previous version snapshot.
   */
  public async restoreVersion(
    workflowId: string,
    versionId: string,
    restoredBy: string = 'user'
  ): Promise<{ workflow: WorkflowRecord; restoredVersion: WorkflowVersion }> {
    const version = await this.getVersion(versionId);
    if (!version || version.workflowId !== workflowId) {
      throw new Error(`Version "${versionId}" does not belong to workflow "${workflowId}".`);
    }

    const currentWf = workflowStore.getById(workflowId);
    if (!currentWf) {
      throw new Error(`Workflow "${workflowId}" not found for restoration.`);
    }

    // Rollback graph
    currentWf.nodes = JSON.parse(JSON.stringify(version.nodes));
    currentWf.edges = JSON.parse(JSON.stringify(version.edges));
    currentWf.updatedAt = new Date().toISOString();
    workflowStore.save(currentWf);

    // Create an audit snapshot of the restoration
    await this.createVersion(
      workflowId,
      `Restored from Version ${version.versionNumber} ("${version.changeSummary || 'Snapshot'}")`,
      true,
      restoredBy
    );

    return {
      workflow: currentWf,
      restoredVersion: version,
    };
  }

  /**
   * Computes a structural diff between two versions.
   */
  public async compareVersions(fromVersionId: string, toVersionId: string): Promise<VersionDiffResult> {
    const v1 = await this.getVersion(fromVersionId);
    const v2 = await this.getVersion(toVersionId);

    if (!v1 || !v2) {
      throw new Error('One or both specified versions do not exist.');
    }

    const v1NodeIds = new Set(v1.nodes.map((n) => n.id));
    const v2NodeIds = new Set(v2.nodes.map((n) => n.id));

    const addedNodes = v2.nodes.filter((n) => !v1NodeIds.has(n.id)).map((n) => n.id);
    const removedNodes = v1.nodes.filter((n) => !v2NodeIds.has(n.id)).map((n) => n.id);

    const commonNodeIds = v1.nodes.filter((n) => v2NodeIds.has(n.id)).map((n) => n.id);
    const modifiedNodes: string[] = [];

    for (const nid of commonNodeIds) {
      const n1 = v1.nodes.find((n) => n.id === nid)!;
      const n2 = v2.nodes.find((n) => n.id === nid)!;
      if (JSON.stringify(n1.config) !== JSON.stringify(n2.config) || n1.name !== n2.name) {
        modifiedNodes.push(nid);
      }
    }

    const v1EdgeIds = new Set(v1.edges.map((e) => e.id));
    const v2EdgeIds = new Set(v2.edges.map((e) => e.id));

    const addedEdges = v2.edges.filter((e) => !v1EdgeIds.has(e.id)).map((e) => e.id);
    const removedEdges = v1.edges.filter((e) => !v2EdgeIds.has(e.id)).map((e) => e.id);

    return {
      addedNodes,
      removedNodes,
      modifiedNodes,
      addedEdges,
      removedEdges,
    };
  }
}

export const versionStore = new VersionStore();
