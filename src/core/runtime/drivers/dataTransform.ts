import { NodeDriver } from '../types';

export const dataTransformDriver: NodeDriver = async (_context, resolvedConfig) => {
  const mode = String(resolvedConfig.mode || 'passthrough');
  const inputData = resolvedConfig.input !== undefined ? resolvedConfig.input : resolvedConfig.data;

  let transformedData: unknown = inputData;

  switch (mode) {
    case 'to_uppercase':
      transformedData = String(inputData || '').toUpperCase();
      break;

    case 'to_lowercase':
      transformedData = String(inputData || '').toLowerCase();
      break;

    case 'trim':
      transformedData = String(inputData || '').trim();
      break;

    case 'json_parse':
      try {
        transformedData = typeof inputData === 'string' ? JSON.parse(inputData) : inputData;
      } catch (e) {
        throw new Error(`Failed to parse JSON in Data Transform: ${(e as Error).message}`);
      }
      break;

    case 'json_stringify':
      try {
        transformedData = JSON.stringify(inputData, null, 2);
      } catch (e) {
        throw new Error(`Failed to stringify JSON in Data Transform: ${(e as Error).message}`);
      }
      break;

    case 'extract_field': {
      const fieldPath = String(resolvedConfig.fieldPath || '');
      if (fieldPath && typeof inputData === 'object' && inputData !== null) {
        const parts = fieldPath.split('.');
        let curr: any = inputData;
        for (const part of parts) {
          curr = curr?.[part];
        }
        transformedData = curr;
      }
      break;
    }

    case 'passthrough':
    default:
      transformedData = inputData !== undefined ? inputData : resolvedConfig;
      break;
  }

  return {
    transformed: true,
    mode,
    result: transformedData,
    output: transformedData,
  };
};

