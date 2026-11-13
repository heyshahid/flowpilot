import { NodeDriver } from '../types';

export const waitUntilDriver: NodeDriver = async (context, resolvedConfig) => {
  const targetStr = String(
    resolvedConfig.targetDateTime || resolvedConfig.until || resolvedConfig.date || ''
  ).trim();

  if (!targetStr) {
    throw new Error('Wait Until node requires a valid "targetDateTime" configuration.');
  }

  const targetDate = new Date(targetStr);
  if (isNaN(targetDate.getTime())) {
    throw new Error(`Invalid ISO date format for Wait Until: "${targetStr}".`);
  }

  const now = Date.now();
  const waitMs = targetDate.getTime() - now;

  // If already in the past, continue immediately
  if (waitMs <= 0) {
    return {
      targetDateTime: targetDate.toISOString(),
      waitMs: 0,
      status: 'already_passed',
      resumedAt: new Date().toISOString(),
      completed: true,
    };
  }

  // Max wait threshold (30 days)
  const MAX_WAIT_MS = 30 * 24 * 60 * 60 * 1000;
  if (waitMs > MAX_WAIT_MS) {
    throw new Error(`Wait Until duration (${waitMs}ms) exceeds maximum limit of 30 days.`);
  }

  // For short wait windows (<= 3000ms), wait asynchronously
  if (waitMs <= 3000) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => resolve(), waitMs);

      if (context.signal) {
        if (context.signal.aborted) {
          clearTimeout(timer);
          reject(new Error('Wait Until cancelled by workflow execution abort.'));
          return;
        }

        context.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Wait Until cancelled by workflow execution abort.'));
        });
      }
    });
  }

  return {
    targetDateTime: targetDate.toISOString(),
    scheduledWaitMs: waitMs,
    status: 'resumed',
    resumedAt: new Date().toISOString(),
    completed: true,
  };
};
