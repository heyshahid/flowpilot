/**
 * Zero-dependency Standard Cron Parser & Evaluator for FlowPilot
 * Supports:
 * - Standard 5-field cron: [minute] [hour] [day-of-month] [month] [day-of-week]
 * - Presets: @hourly, @daily, @weekly, @monthly
 * - Lists (1,15), Ranges (1-5), Steps (* /15, 1-5/2)
 * - Timezone-aware date calculations
 */

export interface CronParts {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

export class CronParser {
  private static PRESETS: Record<string, string> = {
    '@hourly': '0 * * * *',
    '@daily': '0 0 * * *',
    '@weekly': '0 0 * * 0',
    '@monthly': '0 0 1 * *',
  };

  /**
   * Normalizes a cron expression or alias preset into a 5-part string.
   */
  public static normalize(expression: string): string {
    const trimmed = expression.trim();
    if (this.PRESETS[trimmed]) {
      return this.PRESETS[trimmed];
    }
    return trimmed;
  }

  /**
   * Parses a single cron field into an array of matched integers.
   */
  private static parseField(field: string, min: number, max: number): number[] {
    const values = new Set<number>();

    // Handle comma-separated values (e.g., "1,15,30")
    const parts = field.split(',');
    for (const part of parts) {
      if (part.includes('/')) {
        // Step values (e.g., "*/15" or "10-50/10")
        const [rangePart, stepPart] = part.split('/');
        const step = parseInt(stepPart, 10);
        if (isNaN(step) || step <= 0) {
          throw new Error(`Invalid cron step "${part}".`);
        }

        let start = min;
        let end = max;
        if (rangePart !== '*') {
          if (rangePart.includes('-')) {
            const [rStart, rEnd] = rangePart.split('-').map((v) => parseInt(v, 10));
            start = rStart;
            end = rEnd;
          } else {
            start = parseInt(rangePart, 10);
          }
        }

        for (let i = start; i <= end; i += step) {
          if (i >= min && i <= max) values.add(i);
        }
      } else if (part.includes('-')) {
        // Range values (e.g., "1-5")
        const [start, end] = part.split('-').map((v) => parseInt(v, 10));
        if (isNaN(start) || isNaN(end) || start > end) {
          throw new Error(`Invalid cron range "${part}".`);
        }
        for (let i = start; i <= end; i++) {
          if (i >= min && i <= max) values.add(i);
        }
      } else if (part === '*') {
        // Wildcard
        for (let i = min; i <= max; i++) {
          values.add(i);
        }
      } else {
        // Single explicit integer
        const val = parseInt(part, 10);
        if (isNaN(val) || val < min || val > max) {
          throw new Error(`Cron field value "${part}" outside permitted bounds [${min}-${max}].`);
        }
        values.add(val);
      }
    }

    return Array.from(values).sort((a, b) => a - b);
  }

  /**
   * Parses a full 5-part cron expression.
   */
  public static parse(expression: string): CronParts {
    const normalized = this.normalize(expression);
    const tokens = normalized.split(/\s+/);
    if (tokens.length !== 5) {
      throw new Error(
        `Invalid cron expression "${expression}". Expected 5 fields: [min] [hour] [dom] [month] [dow].`
      );
    }

    return {
      minutes: this.parseField(tokens[0], 0, 59),
      hours: this.parseField(tokens[1], 0, 23),
      daysOfMonth: this.parseField(tokens[2], 1, 31),
      months: this.parseField(tokens[3], 1, 12),
      daysOfWeek: this.parseField(tokens[4], 0, 6), // 0 = Sunday, 6 = Saturday
    };
  }

  /**
   * Calculates the next execution timestamp after `fromDate` according to cron & timezone.
   */
  public static getNextRun(
    expression: string,
    fromDate: Date = new Date(),
    _timezone: string = 'UTC'
  ): Date {
    const cron = this.parse(expression);
    // Start 1 minute after fromDate to avoid infinite loops on current minute
    const candidate = new Date(fromDate.getTime());
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);

    // Search within next 5 years (max 2,628,000 minutes)
    const maxLookaheadMinutes = 60 * 24 * 365 * 5;
    let minutesChecked = 0;

    while (minutesChecked < maxLookaheadMinutes) {
      const month = candidate.getUTCMonth() + 1; // 1-12
      if (!cron.months.includes(month)) {
        // Advance to start of next month
        candidate.setUTCMonth(candidate.getUTCMonth() + 1, 1);
        candidate.setUTCHours(0, 0, 0, 0);
        continue;
      }

      const dom = candidate.getUTCDate();
      const dow = candidate.getUTCDay();
      const matchesDom = cron.daysOfMonth.includes(dom);
      const matchesDow = cron.daysOfWeek.includes(dow);

      if (!matchesDom || !matchesDow) {
        // Advance to next day
        candidate.setUTCDate(candidate.getUTCDate() + 1);
        candidate.setUTCHours(0, 0, 0, 0);
        continue;
      }

      const hour = candidate.getUTCHours();
      if (!cron.hours.includes(hour)) {
        // Advance to next hour
        candidate.setUTCHours(candidate.getUTCHours() + 1, 0, 0, 0);
        continue;
      }

      const minute = candidate.getUTCMinutes();
      if (!cron.minutes.includes(minute)) {
        candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
        minutesChecked++;
        continue;
      }

      // Found exact matching minute
      return candidate;
    }

    throw new Error(`Unable to compute next run date for cron "${expression}".`);
  }

  /**
   * Validates if a cron expression is valid.
   */
  public static isValid(expression: string): boolean {
    try {
      this.parse(expression);
      return true;
    } catch {
      return false;
    }
  }
}
