import { WorkflowNode, WorkflowEdge } from '../types/workflow';

export interface WorkflowVersion {
  id: string; // e.g. ver_abc123
  workflowId: string;
  versionNumber: number; // e.g. 1, 2, 3...
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  nodeCount: number;
  edgeCount: number;
  isPublished: boolean;
  changeSummary?: string;
  createdBy: string;
  createdAt: string;
}

export interface VersionDiffResult {
  addedNodes: string[];
  removedNodes: string[];
  modifiedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
}
