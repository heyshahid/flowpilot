import { WorkflowExecutionRecord } from '../execution/types';
import { TimeBucketInterval, TimeSeriesPoint, TimeSeriesResult } from './types';
import { calculateMeanDuration } from './metricDefinitions';

export interface BucketBoundary {
  start: Date;
  end: Date;
  label: string;
}

/**
 * Formats a date into a clean ISO-like label.
 */
function formatBucketLabel(date: Date, interval: TimeBucketInterval): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');

  switch (interval) {
    case 'hour':
      return `${y}-${m}-${d} ${h}:00`;
    case 'day':
      return `${y}-${m}-${d}`;
    case 'week':
      return `Wk of ${y}-${m}-${d}`;
    case 'month':
      return `${y}-${m}`;
    default:
      return `${y}-${m}-${d}`;
  }
}

/**
 * Generates continuous time-series buckets adhering strictly to:
 * Boundary rule: [start, end) (inclusive start, exclusive end).
 */
export function generateBuckets(
  from: Date,
  to: Date,
  interval: TimeBucketInterval
): BucketBoundary[] {
  const buckets: BucketBoundary[] = [];
  const current = new Date(from.getTime());

  // Normalize current to bucket start boundary
  switch (interval) {
    case 'hour':
      current.setUTCMinutes(0, 0, 0);
      break;
    case 'day':
    case 'week':
      current.setUTCHours(0, 0, 0, 0);
      break;
    case 'month':
      current.setUTCDate(1);
      current.setUTCHours(0, 0, 0, 0);
      break;
  }

  const endTimestamp = to.getTime();

  while (current.getTime() < endTimestamp) {
    const bucketStart = new Date(current.getTime());
    let bucketEnd: Date;

    switch (interval) {
      case 'hour':
        bucketEnd = new Date(bucketStart.getTime() + 3600 * 1000);
        break;
      case 'day':
        bucketEnd = new Date(bucketStart.getTime() + 24 * 3600 * 1000);
        break;
      case 'week':
        bucketEnd = new Date(bucketStart.getTime() + 7 * 24 * 3600 * 1000);
        break;
      case 'month': {
        const nextMonth = new Date(bucketStart.getTime());
        nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
        bucketEnd = nextMonth;
        break;
      }
      default:
        bucketEnd = new Date(bucketStart.getTime() + 24 * 3600 * 1000);
    }

    buckets.push({
      start: bucketStart,
      end: bucketEnd,
      label: formatBucketLabel(bucketStart, interval),
    });

    current.setTime(bucketEnd.getTime());
  }

  return buckets;
}

/**
 * Aggregates execution records into time-series buckets.
 * Missing periods are zero-filled so charts show unbroken continuous time sequences.
 */
export function bucketExecutions(
  executions: WorkflowExecutionRecord[],
  from: Date,
  to: Date,
  interval: TimeBucketInterval
): TimeSeriesResult {
  const buckets = generateBuckets(from, to, interval);

  const points: TimeSeriesPoint[] = buckets.map((bucket) => {
    const bStart = bucket.start.getTime();
    const bEnd = bucket.end.getTime();

    // [start, end) inclusive start, exclusive end
    const matching = executions.filter((e) => {
      const eTime = new Date(e.startedAt).getTime();
      return eTime >= bStart && eTime < bEnd;
    });

    const completed = matching.filter((e) => e.status === 'COMPLETED').length;
    const failed = matching.filter((e) => e.status === 'FAILED').length;
    const durations = matching
      .filter((e) => typeof e.durationMs === 'number' && e.durationMs >= 0)
      .map((e) => e.durationMs as number);

    const meanDuration = calculateMeanDuration(durations);

    return {
      timestamp: bucket.start.toISOString(),
      bucketLabel: bucket.label,
      total: matching.length,
      completed,
      failed,
      meanDurationMs: meanDuration.value,
    };
  });

  return {
    interval,
    points,
    boundaryRule: '[start, end) (inclusive start, exclusive end)',
  };
}
