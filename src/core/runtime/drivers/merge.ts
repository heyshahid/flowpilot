import { NodeDriver } from '../types';

export const mergeDriver: NodeDriver = async (context, resolvedConfig) => {
  const mode = String(resolvedConfig.mode || 'wait_all').toLowerCase();
  const steps = context.steps || {};

  const mergedData: Record<string, unknown> = {};
  const activeSources: string[] = [];
  const skippedSources: string[] = [];

  for (const [nodeId, stepRecord] of Object.entries(steps)) {
    if (stepRecord.status === 'COMPLETED') {
      activeSources.push(nodeId);
      mergedData[nodeId] = stepRecord.output;
    } else if (stepRecord.status === 'SKIPPED') {
      skippedSources.push(nodeId);
    }
  }

  return {
    mode,
    mergedCount: Object.keys(mergedData).length,
    activeSources,
    skippedSources,
    data: mergedData,
    completed: true,
    timestamp: new Date().toISOString(),
  };
};
