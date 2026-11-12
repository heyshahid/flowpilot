import { WorkflowEdge, WorkflowGraph, WorkflowNode } from '../types/workflow';

export class CyclicWorkflowError extends Error {
  constructor(message: string) {
    super(`[Workflow Graph Error] Cyclic dependency detected: ${message}`);
    this.name = 'CyclicWorkflowError';
  }
}

export class InvalidGraphError extends Error {
  constructor(message: string) {
    super(`[Workflow Graph Error] ${message}`);
    this.name = 'InvalidGraphError';
  }
}

export interface GraphTopology {
  orderedNodes: WorkflowNode[];
  adjacencyList: Map<string, Array<{ targetId: string; sourceHandle?: string }>>;
  inDegreeMap: Map<string, number>;
}

/**
 * Validates workflow graph structure and computes topological execution order using Kahn's Algorithm.
 */
export function compileGraphTopology(graph: WorkflowGraph): GraphTopology {
  if (!graph.nodes || graph.nodes.length === 0) {
    throw new InvalidGraphError('Workflow graph contains no nodes.');
  }

  const nodeMap = new Map<string, WorkflowNode>();
  const inDegreeMap = new Map<string, number>();
  const adjacencyList = new Map<string, Array<{ targetId: string; sourceHandle?: string }>>();

  // Initialize data structures
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
    inDegreeMap.set(node.id, 0);
    adjacencyList.set(node.id, []);
  }

  // Build graph edges and calculate in-degrees
  for (const edge of graph.edges) {
    if (!nodeMap.has(edge.source)) {
      throw new InvalidGraphError(`Edge references non-existent source node "${edge.source}".`);
    }
    if (!nodeMap.has(edge.target)) {
      throw new InvalidGraphError(`Edge references non-existent target node "${edge.target}".`);
    }

    adjacencyList.get(edge.source)!.push({
      targetId: edge.target,
      sourceHandle: edge.sourceHandle,
    });

    inDegreeMap.set(edge.target, (inDegreeMap.get(edge.target) || 0) + 1);
  }

  // Kahn's Algorithm
  const queue: string[] = [];
  for (const [nodeId, inDegree] of inDegreeMap.entries()) {
    if (inDegree === 0) {
      queue.push(nodeId);
    }
  }

  const orderedNodes: WorkflowNode[] = [];
  const inDegreeCopy = new Map(inDegreeMap);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentNode = nodeMap.get(currentId)!;
    orderedNodes.push(currentNode);

    const neighbors = adjacencyList.get(currentId) || [];
    for (const neighbor of neighbors) {
      const updatedInDegree = inDegreeCopy.get(neighbor.targetId)! - 1;
      inDegreeCopy.set(neighbor.targetId, updatedInDegree);

      if (updatedInDegree === 0) {
        queue.push(neighbor.targetId);
      }
    }
  }

  // Cycle check: If sorted nodes count is less than total nodes, a cycle exists
  if (orderedNodes.length !== graph.nodes.length) {
    const unvisited = graph.nodes
      .filter((n) => !orderedNodes.some((visited) => visited.id === n.id))
      .map((n) => n.id);
    throw new CyclicWorkflowError(`Loop or recursive connection between nodes: [${unvisited.join(', ')}]`);
  }

  return {
    orderedNodes,
    adjacencyList,
    inDegreeMap,
  };
}

