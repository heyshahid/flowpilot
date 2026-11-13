import { NodeDriver } from '../types';

export const delayDriver: NodeDriver = async (context, resolvedConfig) => {
  let delayMs = 0;

  if (typeof resolvedConfig.durationMs === 'number') {
    delayMs = resolvedConfig.durationMs;
  } else {
    const duration = Number(resolvedConfig.duration || 0);
    const unit = String(resolvedConfig.unit || 'seconds').toLowerCase();

    switch (unit) {
      case 'seconds':
      case 's':
        delayMs = duration * 1000;
        break;
      case 'minutes':
      case 'm':
        delayMs = duration * 60 * 1000;
        break;
      case 'hours':
      case 'h':
        delayMs = duration * 60 * 60 * 1000;
        break;
      case 'days':
      case 'd':
        delayMs = duration * 24 * 60 * 60 * 1000;
        break;
      default:
        delayMs = duration * 1000;
        break;
    }
  }

  // Maximum delay enforcement: 30 days
  const MAX_DELAY_MS = 30 * 24 * 60 * 60 * 1000;
  if (delayMs > MAX_DELAY_MS) {
    throw new Error(`Configured delay of ${delayMs}ms exceeds maximum limit of 30 days.`);
  }

  if (delayMs < 0) {
    throw new Error(`Delay duration cannot be negative: ${delayMs}ms.`);
  }

  const startTime = Date.now();
  const resumeAt = new Date(startTime + delayMs).toISOString();

  // If delay is small (e.g. <= 3000ms), wait asynchronously in-memory
  // For long delays, record the target resume timestamp
  if (delayMs > 0 && delayMs <= 3000) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => resolve(), delayMs);

      if (context.signal) {
        if (context.signal.aborted) {
          clearTimeout(timer);
          reject(new Error('Delay cancelled by workflow execution abort.'));
          return;
        }

        context.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Delay cancelled by workflow execution abort.'));
        });
      }
    });
  }

  const actualElapsed = Date.now() - startTime;

  return {
    delayedDurationMs: delayMs,
    actualElapsedMs: actualElapsed,
    resumeAt,
    completed: true,
    timestamp: new Date().toISOString(),
  };
};
