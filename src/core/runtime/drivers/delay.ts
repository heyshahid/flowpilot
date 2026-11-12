import { NodeDriver } from '../types';

export const delayDriver: NodeDriver = async (context, resolvedConfig) => {
  const durationMs = Number(resolvedConfig.durationMs || Number(resolvedConfig.seconds || 1) * 1000);

  if (durationMs <= 0) {
    return { delayedMs: 0 };
  }

  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout;

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Delay node aborted by execution cancellation.'));
    };

    if (context.signal?.aborted) {
      return reject(new Error('Delay node aborted by execution cancellation.'));
    }

    context.signal?.addEventListener('abort', onAbort);

    timer = setTimeout(() => {
      context.signal?.removeEventListener('abort', onAbort);
      resolve({
        delayedMs: durationMs,
        completedAt: new Date().toISOString(),
      });
    }, durationMs);
  });
};

