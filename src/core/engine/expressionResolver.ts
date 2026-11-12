import { WorkflowExecutionContext } from '../types/workflow';

/**
 * Safely resolves nested property paths (e.g. "a.b.c[0].d") from an object.
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  
  // Normalize array notation: a[0].b -> a.0.b
  const normalizedPath = path.replace(/\[(\w+)\]/g, '.$1');
  const segments = normalizedPath.split('.').filter(Boolean);

  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Evaluates template expressions in a string or nested object.
 * Syntax: {{ $trigger.payload.email }} or {{ $steps.node_id.output.data.token }}
 */
export function resolveExpressions<T>(template: T, context: WorkflowExecutionContext): T {
  if (typeof template === 'string') {
    // Check if the entire string is a single expression: e.g. "{{ $trigger.payload.amount }}"
    const singleMatch = template.trim().match(/^\{\{\s*(.+?)\s*\}\}$/);
    if (singleMatch) {
      const expr = singleMatch[1];
      return resolveSingleExpression(expr, context) as T;
    }

    // Otherwise replace embedded expressions inside text: "Hello {{ $trigger.payload.name }}!"
    return template.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, expr) => {
      const val = resolveSingleExpression(expr, context);
      return val !== undefined && val !== null ? String(val) : '';
    }) as T;
  }

  if (Array.isArray(template)) {
    return template.map((item) => resolveExpressions(item, context)) as T;
  }

  if (template !== null && typeof template === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
      result[key] = resolveExpressions(value, context);
    }
    return result as T;
  }

  return template;
}

function resolveSingleExpression(expression: string, context: WorkflowExecutionContext): unknown {
  const trimmed = expression.trim();

  // Root: $trigger
  if (trimmed.startsWith('$trigger')) {
    const path = trimmed.replace(/^\$trigger\.?/, '');
    if (!path) return context.trigger;
    return getNestedValue(context.trigger, path);
  }

  // Root: $steps
  if (trimmed.startsWith('$steps')) {
    const path = trimmed.replace(/^\$steps\.?/, '');
    if (!path) return context.steps;
    return getNestedValue(context.steps, path);
  }

  // Literal value or unrecognized expression
  return undefined;
}
