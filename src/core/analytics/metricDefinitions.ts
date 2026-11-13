import { MetricValue } from './types';

/**
 * Pure helper to format millisecond duration into human-readable strings.
 */
export function formatDuration(ms: number | null): string {
  if (ms === null || isNaN(ms)) return 'N/A';
  if (ms < 1) return '< 1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Formats a percentage value (0 - 100).
 */
export function formatPercent(pct: number | null, decimals = 1): string {
  if (pct === null || isNaN(pct)) return 'N/A';
  return `${pct.toFixed(decimals)}%`;
}

/**
 * Formats a currency value in USD.
 */
export function formatCurrency(usd: number | null, decimals = 4): string {
  if (usd === null || isNaN(usd)) return 'N/A';
  return `$${usd.toFixed(decimals)}`;
}

/**
 * Calculates workflow success rate based strictly on terminal executions (COMPLETED + FAILED).
 * In-flight executions (RUNNING, QUEUED, WAITING, VALIDATING) and CANCELLED executions
 * are excluded from the denominator.
 */
export function calculateSuccessRate(
  completed: number,
  failed: number
): MetricValue<number | null> {
  const terminalExecutions = completed + failed;

  if (terminalExecutions === 0) {
    return {
      value: null,
      formatted: 'N/A',
      sampleSize: 0,
      isAvailable: false,
      notes: 'No terminal executions in query period',
    };
  }

  const rate = (completed / terminalExecutions) * 100;
  return {
    value: Number(rate.toFixed(2)),
    formatted: formatPercent(rate, 1),
    sampleSize: terminalExecutions,
    isAvailable: true,
  };
}

/**
 * Calculates workflow failure rate based strictly on terminal executions (COMPLETED + FAILED).
 */
export function calculateFailureRate(
  completed: number,
  failed: number
): MetricValue<number | null> {
  const terminalExecutions = completed + failed;

  if (terminalExecutions === 0) {
    return {
      value: null,
      formatted: 'N/A',
      sampleSize: 0,
      isAvailable: false,
      notes: 'No terminal executions in query period',
    };
  }

  const rate = (failed / terminalExecutions) * 100;
  return {
    value: Number(rate.toFixed(2)),
    formatted: formatPercent(rate, 1),
    sampleSize: terminalExecutions,
    isAvailable: true,
  };
}

/**
 * Filters duration array for valid non-negative finite numbers.
 */
export function filterValidDurations(durations: number[]): number[] {
  return durations.filter((d) => typeof d === 'number' && !isNaN(d) && isFinite(d) && d >= 0);
}

/**
 * Calculates arithmetic mean (average) duration.
 */
export function calculateMeanDuration(durations: number[]): MetricValue<number | null> {
  const valid = filterValidDurations(durations);

  if (valid.length === 0) {
    return {
      value: null,
      formatted: 'N/A',
      sampleSize: 0,
      isAvailable: false,
      notes: 'No valid duration records available',
    };
  }

  const sum = valid.reduce((acc, d) => acc + d, 0);
  const mean = sum / valid.length;

  return {
    value: Number(mean.toFixed(2)),
    formatted: formatDuration(mean),
    sampleSize: valid.length,
    isAvailable: true,
  };
}

/**
 * Calculates median (p50) duration with proper odd/even handling.
 */
export function calculateMedianDuration(durations: number[]): MetricValue<number | null> {
  const valid = filterValidDurations(durations);

  if (valid.length === 0) {
    return {
      value: null,
      formatted: 'N/A',
      sampleSize: 0,
      isAvailable: false,
      notes: 'No valid duration records available',
    };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const len = sorted.length;
  let median: number;

  if (len % 2 === 1) {
    // Odd: exact middle element
    median = sorted[Math.floor(len / 2)];
  } else {
    // Even: average of two middle elements
    const mid = len / 2;
    median = (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return {
    value: Number(median.toFixed(2)),
    formatted: formatDuration(median),
    sampleSize: len,
    isAvailable: true,
  };
}

/**
 * Calculates 95th percentile (p95) duration.
 */
export function calculateP95Duration(durations: number[]): MetricValue<number | null> {
  const valid = filterValidDurations(durations);

  if (valid.length === 0) {
    return {
      value: null,
      formatted: 'N/A',
      sampleSize: 0,
      isAvailable: false,
      notes: 'No valid duration records available',
    };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  // Nearest-rank percentile: index = ceil(0.95 * N) - 1, clamped
  const idx = Math.min(Math.max(0, Math.ceil(0.95 * sorted.length) - 1), sorted.length - 1);
  const p95 = sorted[idx];

  return {
    value: Number(p95.toFixed(2)),
    formatted: formatDuration(p95),
    sampleSize: sorted.length,
    isAvailable: true,
  };
}

