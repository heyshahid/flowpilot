import { NodeDriver } from '../types';

export const ifElseDriver: NodeDriver = async (_context, resolvedConfig) => {
  const field = resolvedConfig.field;
  const operator = String(resolvedConfig.operator || 'equals').toLowerCase();
  const targetValue = resolvedConfig.value;

  let result = false;

  switch (operator) {
    case 'equals':
      result = String(field ?? '') === String(targetValue ?? '');
      break;

    case 'not_equals':
      result = String(field ?? '') !== String(targetValue ?? '');
      break;

    case 'contains':
      result = String(field ?? '')
        .toLowerCase()
        .includes(String(targetValue ?? '').toLowerCase());
      break;

    case 'not_contains':
      result = !String(field ?? '')
        .toLowerCase()
        .includes(String(targetValue ?? '').toLowerCase());
      break;

    case 'greater_than':
      result = Number(field) > Number(targetValue);
      break;

    case 'greater_than_or_equal':
      result = Number(field) >= Number(targetValue);
      break;

    case 'less_than':
      result = Number(field) < Number(targetValue);
      break;

    case 'less_than_or_equal':
      result = Number(field) <= Number(targetValue);
      break;

    case 'is_empty':
      result =
        field === undefined ||
        field === null ||
        field === '' ||
        (Array.isArray(field) && field.length === 0) ||
        (typeof field === 'object' && Object.keys(field).length === 0);
      break;

    case 'is_not_empty':
      result =
        field !== undefined &&
        field !== null &&
        field !== '' &&
        (!Array.isArray(field) || field.length > 0) &&
        (typeof field !== 'object' || Object.keys(field).length > 0);
      break;

    case 'starts_with':
      result = String(field ?? '')
        .toLowerCase()
        .startsWith(String(targetValue ?? '').toLowerCase());
      break;

    case 'ends_with':
      result = String(field ?? '')
        .toLowerCase()
        .endsWith(String(targetValue ?? '').toLowerCase());
      break;

    default:
      result = String(field ?? '') === String(targetValue ?? '');
      break;
  }

  const branch: 'true' | 'false' = result ? 'true' : 'false';

  return {
    result,
    branch,
    field,
    operator,
    targetValue,
  };
};
