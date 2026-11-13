import { NodeDriver } from '../types';

export interface ConditionRule {
  field: any;
  operator: string;
  value: any;
}

function evaluateRule(field: any, operator: string, targetValue: any): boolean {
  const op = String(operator || 'equals').toLowerCase();

  switch (op) {
    case 'equals':
    case 'eq':
    case '==':
      return String(field ?? '') === String(targetValue ?? '');

    case 'not_equals':
    case 'neq':
    case '!=':
      return String(field ?? '') !== String(targetValue ?? '');

    case 'contains':
      return String(field ?? '')
        .toLowerCase()
        .includes(String(targetValue ?? '').toLowerCase());

    case 'not_contains':
      return !String(field ?? '')
        .toLowerCase()
        .includes(String(targetValue ?? '').toLowerCase());

    case 'greater_than':
    case 'gt':
    case '>':
      return Number(field) > Number(targetValue);

    case 'greater_than_or_equal':
    case 'gte':
    case '>=':
      return Number(field) >= Number(targetValue);

    case 'less_than':
    case 'lt':
    case '<':
      return Number(field) < Number(targetValue);

    case 'less_than_or_equal':
    case 'lte':
    case '<=':
      return Number(field) <= Number(targetValue);

    case 'is_empty':
      return (
        field === undefined ||
        field === null ||
        field === '' ||
        (Array.isArray(field) && field.length === 0)
      );

    case 'is_not_empty':
      return (
        field !== undefined &&
        field !== null &&
        field !== '' &&
        (!Array.isArray(field) || field.length > 0)
      );

    case 'in_list':
      const list = Array.isArray(targetValue)
        ? targetValue
        : String(targetValue).split(',').map((s) => s.trim());
      return list.includes(String(field));

    default:
      return String(field ?? '') === String(targetValue ?? '');
  }
}

export const advancedConditionDriver: NodeDriver = async (_context, resolvedConfig) => {
  const mode = String(resolvedConfig.mode || 'rules').toLowerCase();

  // Mode 1: Switch / Case
  if (mode === 'switch') {
    const testValue = String(resolvedConfig.value ?? '');
    const cases: Array<{ case: string; handle?: string }> = Array.isArray(resolvedConfig.cases)
      ? resolvedConfig.cases
      : [];

    let matchedBranch = resolvedConfig.defaultHandle || 'default';
    for (const c of cases) {
      if (String(c.case) === testValue) {
        matchedBranch = c.handle || c.case;
        break;
      }
    }

    return {
      mode: 'switch',
      testValue,
      branch: matchedBranch,
      matchedCase: matchedBranch,
      result: matchedBranch !== 'default',
    };
  }

  // Mode 2: Multi-rule Combinator (AND / OR)
  const combinator = String(resolvedConfig.combinator || 'AND').toUpperCase();
  const rules: ConditionRule[] = Array.isArray(resolvedConfig.rules)
    ? resolvedConfig.rules
    : [
        {
          field: resolvedConfig.field,
          operator: resolvedConfig.operator || 'equals',
          value: resolvedConfig.value,
        },
      ];

  if (rules.length === 0) {
    return {
      mode: 'rules',
      combinator,
      result: true,
      branch: 'true',
      rulesEvaluated: 0,
    };
  }

  let finalResult = combinator === 'AND';

  for (const rule of rules) {
    const passed = evaluateRule(rule.field, rule.operator, rule.value);
    if (combinator === 'AND') {
      if (!passed) {
        finalResult = false;
        break;
      }
    } else {
      // OR combinator
      if (passed) {
        finalResult = true;
        break;
      }
    }
  }

  const branch = finalResult ? 'true' : 'false';

  return {
    mode: 'rules',
    combinator,
    result: finalResult,
    branch,
    rulesEvaluated: rules.length,
  };
};
