import { WorkflowGraph } from '../types/workflow';
import { getNodeDefinition } from '../registry/nodeRegistry';
import { compileGraphTopology, CyclicWorkflowError } from '../engine/topologicalSort';

export interface ValidationIssue {
  type: 'error' | 'warning';
  nodeId?: string;
  edgeId?: string;
  message: string;
  code: string;
}

export interface ValidationReport {
  isValid: boolean;
  errorsCount: number;
  warningsCount: number;
  issues: ValidationIssue[];
  nodeErrors: Record<string, string[]>;
}

/**
 * Validates a workflow graph topology and node configurations.
 */
export function validateWorkflowGraph(graph: WorkflowGraph): ValidationReport {
  const issues: ValidationIssue[] = [];
  const nodeErrors: Record<string, string[]> = {};

  if (!graph.nodes || graph.nodes.length === 0) {
    issues.push({
      type: 'warning',
      message: 'Workflow canvas is empty. Add a trigger to start.',
      code: 'EMPTY_GRAPH',
    });
    return {
      isValid: false,
      errorsCount: 0,
      warningsCount: 1,
      issues,
      nodeErrors,
    };
  }

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const triggers = graph.nodes.filter((n) => n.category === 'trigger');

  // Check 1: Must have at least one trigger
  if (triggers.length === 0) {
    issues.push({
      type: 'error',
      message: 'Workflow requires at least one Trigger node (e.g. Webhook, Manual, or Schedule).',
      code: 'MISSING_TRIGGER',
    });
  } else if (triggers.length > 1) {
    issues.push({
      type: 'warning',
      message: `Workflow has ${triggers.length} triggers. Multiple entry points will execute independently.`,
      code: 'MULTIPLE_TRIGGERS',
    });
  }

  // Check 2: Node type & configuration schema validation
  for (const node of graph.nodes) {
    const definition = getNodeDefinition(node.type);
    if (!definition) {
      const err = `Unknown or deprecated node type "${node.type}".`;
      issues.push({
        type: 'error',
        nodeId: node.id,
        message: err,
        code: 'UNKNOWN_NODE_TYPE',
      });
      nodeErrors[node.id] = [err];
      continue;
    }

    // Validate config against definition Zod schema
    const validationResult = definition.validate(node.config || {});
    if (!validationResult.isValid) {
      nodeErrors[node.id] = validationResult.errors;
      for (const err of validationResult.errors) {
        issues.push({
          type: 'error',
          nodeId: node.id,
          message: `${node.name || definition.displayName}: ${err}`,
          code: 'INVALID_CONFIG',
        });
      }
    }
  }

  // Check 3: Edge endpoint integrity
  const connectedTargets = new Set<string>();
  const connectedSources = new Set<string>();

  for (const edge of graph.edges) {
    if (!nodeMap.has(edge.source)) {
      issues.push({
        type: 'error',
        edgeId: edge.id,
        message: `Connection references non-existent source node "${edge.source}".`,
        code: 'ORPHAN_EDGE_SOURCE',
      });
    } else {
      connectedSources.add(edge.source);
    }

    if (!nodeMap.has(edge.target)) {
      issues.push({
        type: 'error',
        edgeId: edge.id,
        message: `Connection references non-existent target node "${edge.target}".`,
        code: 'ORPHAN_EDGE_TARGET',
      });
    } else {
      connectedTargets.add(edge.target);
    }
  }

  // Check 4: Cycle detection
  try {
    compileGraphTopology(graph);
  } catch (err) {
    if (err instanceof CyclicWorkflowError) {
      issues.push({
        type: 'error',
        message: err.message,
        code: 'CYCLIC_DEPENDENCY',
      });
    }
  }

  // Check 5: Disconnected nodes (Warning)
  for (const node of graph.nodes) {
    if (node.category !== 'trigger' && !connectedTargets.has(node.id)) {
      issues.push({
        type: 'warning',
        nodeId: node.id,
        message: `"${node.name}" is disconnected. It will not receive data during execution.`,
        code: 'DISCONNECTED_NODE',
      });
    }
  }

  // Check 6: If/Else conditional handles completeness (Warning)
  const ifElseNodes = graph.nodes.filter((n) => n.type === 'logic.ifElse');
  for (const node of ifElseNodes) {
    const outgoing = graph.edges.filter((e) => e.source === node.id);
    const hasTrue = outgoing.some((e) => e.sourceHandle === 'true');
    const hasFalse = outgoing.some((e) => e.sourceHandle === 'false');

    if (!hasTrue || !hasFalse) {
      issues.push({
        type: 'warning',
        nodeId: node.id,
        message: `"${node.name}" is missing a ${!hasTrue ? 'TRUE' : 'FALSE'} branch connection.`,
        code: 'INCOMPLETE_BRANCH',
      });
    }
  }

  const errorsCount = issues.filter((i) => i.type === 'error').length;
  const warningsCount = issues.filter((i) => i.type === 'warning').length;

  return {
    isValid: errorsCount === 0,
    errorsCount,
    warningsCount,
    issues,
    nodeErrors,
  };
}

