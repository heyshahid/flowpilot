# FlowPilot Scheduler Health & Missed-Run Architecture

## 1. Overview & Architectural Boundaries

FlowPilot's Scheduler Health module provides comprehensive operational visibility into recurring automations, cron definitions, upcoming execution queues, and overdue schedules.

> [!IMPORTANT]
> **Separation of Configuration vs. Health:** An active schedule configuration does **NOT** prove that a worker process is currently running or executing jobs. Scheduler monitoring strictly verifies configuration and execution timestamps against actual persisted execution records in `executionStore.json`.

---

## 2. Missed Schedule Detection Policy

A schedule is deterministically classified as **`MISSED` (Overdue)** when all of the following conditions are satisfied:
1. **Status is Active:** `schedule.status === 'active'`.
2. **Next Run is Overdue:** `schedule.nextRunAt` is in the past by more than a 60-second grace period ($\Delta t > 60,000\,\text{ms}$).
3. **Execution Absence:** Either `schedule.lastRunAt` is absent, or `new Date(schedule.lastRunAt).getTime() < new Date(schedule.nextRunAt).getTime()`.

### Catch-Up Policy Modes
* **`catchUpMissed: true`:** When the scheduler engine evaluates due schedules, it automatically dispatches the missed run upon the subsequent tick.
* **`catchUpMissed: false`:** Missed runs are skipped, advancing `nextRunAt` directly to the next future cron slot.

---

## 3. Upcoming Execution Queue

FlowPilot queries all active schedules with `nextRunAt > now` and sorts them chronologically:
* Calculates live countdown timers ($\text{seconds} = \lfloor(\text{nextRunAt} - \text{now}) / 1000\rfloor$).
* Formats remaining time into human-readable countdowns (e.g., `in 2m 14s`, `in 4h 30m`, or `Due now`).
* Displays the next 10 queued scheduled executions alongside workflow identifiers.

---

## 4. Execution Correlation & Failure Rates

The scheduler health engine correlates each schedule with actual workflow execution records:
* Inspects `schedule.lastExecutionId` to retrieve the terminal status (`COMPLETED` vs. `FAILED`) and execution duration of the most recent scheduled run.
* Computes `recentSuccessRatePercent` across executions linked via `$schedule.id` or `workflowId`.
* Flags schedules where failure rate $>30\%$ as unreliable.
