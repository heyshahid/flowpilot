import { WorkflowEdge, WorkflowGraph, WorkflowNode } from '../types/workflow';

export class ExecutionPlanningError extends Error {
  constructor(message: string) {
    super(`[ExecutionPlanningError] ${message}`);
    this.name = 'ExecutionPlanningError';
  }
}

export interface OutgoingEdge {
  targetId: string;
  sourceHandle?: string;
  targetHandle?: string;
  edgeId: string;
}

export interface ExecutionPlan {
  workflowId: string;
  workflowName: string;
  orderedNodes: WorkflowNode[];
  stages: WorkflowNode[][];
  nodeMap: Map<string, WorkflowNode>;
  adjacencyList: Map<string, OutgoingEdge[]>;
  predecessors: Map<string, string[]>;
  triggerNode: WorkflowNode;
}

export class ExecutionPlanner {
  /**
   * Generates a deterministic multi-stage execution plan from a WorkflowGraph.
   */
  public static plan(graph: WorkflowGraph): ExecutionPlan {
    if (!graph.nodes || graph.nodes.length === 0) {
      throw new ExecutionPlanningError('Cannot plan an empty workflow graph.');
    }

    const nodeMap = new Map<string, WorkflowNode>();
    for (const node of graph.nodes) {
      nodeMap.set(node.id, node);
    }

    // Build Adjacency and Predecessor lists
    const adjacencyList = new Map<string, OutgoingEdge[]>();
    const predecessors = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const node of graph.nodes) {
      adjacencyList.set(node.id, []);
      predecessors.set(node.id, []);
      inDegree.set(node.id, 0);
    }

    for (const edge of graph.edges || []) {
      if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
        continue;
      }
      adjacencyList.get(edge.source)!.push({
        targetId: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        edgeId: edge.id,
      });
      predecessors.get(edge.target)!.push(edge.source);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    // Find trigger entry point (category 'trigger' or inDegree 0)
    const triggerNodes = graph.nodes.filter(
      (n) => n.category === 'trigger' || n.type.startsWith('trigger.')
    );

    if (triggerNodes.length === 0) {
      throw new ExecutionPlanningError('Workflow has no trigger node. At least one trigger is required.');
    }

    const triggerNode = triggerNodes[0];

    // Kahn's Algorithm for Stage-based Topological Sorting & Cycle Detection
    const queue: string[] = [];
    for (const [nodeId, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(nodeId);
      }
    }

    const orderedNodes: WorkflowNode[] = [];
    const stages: WorkflowNode[][] = [];
    const visited = new Set<string>();

    let currentLevel = [...queue];

    while (currentLevel.length > 0) {
      const currentStageNodes: WorkflowNode[] = [];
      const nextLevel: string[] = [];

      for (const nodeId of currentLevel) {
        visited.add(nodeId);
        const node = nodeMap.get(nodeId);
        if (node) {
          currentStageNodes.push(node);
          orderedNodes.push(node);
        }

        const outgoing = adjacencyList.get(nodeId) || [];
        for (const out of outgoing) {
          const currentDeg = inDegree.get(out.targetId)! - 1;
          inDegree.set(out.targetId, currentDeg);
          if (currentDeg === 0) {
            nextLevel.push(out.targetId);
          }
        }
      }

      if (currentStageNodes.length > 0) {
        stages.push(currentStageNodes);
      }
      currentLevel = nextLevel;
    }

    // Cycle detection check: all reachable nodes in DAG must have been processed
    if (visited.size < graph.nodes.length) {
      const unprocessed = graph.nodes
        .filter((n) => !visited.has(n.id))
        .map((n) => n.name || n.id);
      throw new ExecutionPlanningError(
        `Cycle or unreachable loop detected in workflow graph involving: ${unprocessed.join(', ')}`
      );
    }

    return {
      workflowId: graph.id,
      workflowName: graph.name,
      orderedNodes,
      stages,
      nodeMap,
      adjacencyList,
      predecessors,
      triggerNode,
    };
  }

  /**
   * Resolves which downstream nodes should be marked SKIPPED when a conditional branch is taken.
   * e.g. If/Else condition evaluates to true -> inactive branch is 'false'.
   * Downstream nodes that depend solely on the inactive branch are skipped recursively.
   */
  public static calculateSkippedNodes(
    nodeId: string,
    activeHandle: 'true' | 'false' | string,
    adjacencyList: Map<string, OutgoingEdge[]>,
    predecessors: Map<string, string[]>,
    alreadySkipped: Set<string>
  ): Set<string> {
    const skipped = new Set<string>(alreadySkipped);
    const edges = adjacencyList.get(nodeId) || [];

    // Find edges originating from the non-active handle
    for (const edge of edges) {
      if (edge.sourceHandle && edge.sourceHandle !== activeHandle) {
        skipped.add(edge.targetId);
        ExecutionPlanner.propagateSkip(edge.targetId, adjacencyList, predecessors, skipped);
      }
    }

    return skipped;
  }

  private static propagateSkip(
    targetNodeId: string,
    adjacencyList: Map<string, OutgoingEdge[]>,
    predecessors: Map<string, string[]>,
    skipped: Set<string>
  ): void {
    const children = adjacencyList.get(targetNodeId) || [];
    for (const child of children) {
      if (!skipped.has(child.targetId)) {
        const parents = predecessors.get(child.targetId) || [];
        const allParentsSkipped = parents.length > 0 && parents.every((p) => skipped.has(p));
        if (allParentsSkipped) {
          skipped.add(child.targetId);
          ExecutionPlanner.propagateSkip(child.targetId, adjacencyList, predecessors, skipped);
        }
      }
    }
  }
}
