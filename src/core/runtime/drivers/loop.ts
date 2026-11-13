import { NodeDriver } from '../types';

export const loopDriver: NodeDriver = async (context, resolvedConfig) => {
  let rawItems: any = resolvedConfig.items;

  // If string, try parsing as JSON array
  if (typeof rawItems === 'string') {
    try {
      rawItems = JSON.parse(rawItems);
    } catch {
      rawItems = [rawItems];
    }
  }

  let itemArray: any[] = [];
  if (Array.isArray(rawItems)) {
    itemArray = rawItems;
  } else if (rawItems !== null && rawItems !== undefined) {
    itemArray = [rawItems];
  }

  // Safety limits: max iterations
  const HARD_MAX_ITERATIONS = 1000;
  const configuredMax = Number(resolvedConfig.maxIterations || 100);
  const maxIterations = Math.min(configuredMax, HARD_MAX_ITERATIONS);

  const batchSize = Math.max(1, Number(resolvedConfig.batchSize || 10));
  const mode = String(resolvedConfig.mode || 'sequential').toLowerCase();

  const totalItems = itemArray.length;
  const processedItems: any[] = [];

  const iterationCount = Math.min(totalItems, maxIterations);

  for (let i = 0; i < iterationCount; i++) {
    if (context.signal?.aborted) {
      throw new Error(`Loop execution aborted at index ${i}.`);
    }

    const item = itemArray[i];
    const iterationMetadata = {
      index: i,
      item,
      batch: Math.floor(i / batchSize),
      isFirst: i === 0,
      isLast: i === iterationCount - 1,
    };

    processedItems.push(iterationMetadata);

    // Optional break condition check
    if (resolvedConfig.breakCondition && typeof item === 'object' && item !== null) {
      if ((item as any).break === true) {
        break;
      }
    }
  }

  return {
    totalItems,
    processedCount: processedItems.length,
    cappedAtLimit: totalItems > maxIterations,
    maxIterations,
    mode,
    batchSize,
    results: processedItems,
    completed: true,
  };
};
