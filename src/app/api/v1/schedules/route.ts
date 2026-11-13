import { NextRequest, NextResponse } from 'next/server';
import { scheduleStore } from '@/lib/storage/scheduleStore';
import { workflowStore } from '@/lib/storage/workflowStore';
import { CronParser } from '@/core/scheduler/cronParser';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workflowId = searchParams.get('workflowId') || undefined;
    const status = (searchParams.get('status') as any) || undefined;

    const list = await scheduleStore.list({ workflowId, status });
    return NextResponse.json({ success: true, count: list.length, schedules: list });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workflowId, name, type, cronExpression, intervalMinutes, targetDateTime, timezone, inputPayload, catchUpMissed, maxRuns } = body;

    if (!workflowId || !name || !type) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: "workflowId", "name", and "type" are required.' },
        { status: 400 }
      );
    }

    const workflow = workflowStore.getById(workflowId);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow with ID "${workflowId}" does not exist.` },
        { status: 404 }
      );
    }

    if (type === 'cron') {
      if (!cronExpression || !CronParser.isValid(cronExpression)) {
        return NextResponse.json(
          { success: false, error: `Invalid cron expression "${cronExpression}".` },
          { status: 400 }
        );
      }
    } else if (type === 'one_time') {
      if (!targetDateTime || isNaN(Date.parse(targetDateTime))) {
        return NextResponse.json(
          { success: false, error: `Invalid one-time ISO timestamp "${targetDateTime}".` },
          { status: 400 }
        );
      }
    } else if (type === 'interval') {
      if (!intervalMinutes || intervalMinutes <= 0) {
        return NextResponse.json(
          { success: false, error: 'Interval must be a positive number of minutes.' },
          { status: 400 }
        );
      }
    }

    const saved = await scheduleStore.save({
      workflowId,
      workflowName: workflow.name,
      name,
      description: body.description || '',
      type,
      cronExpression,
      intervalMinutes,
      targetDateTime,
      timezone: timezone || 'UTC',
      status: 'active',
      inputPayload: inputPayload || {},
      catchUpMissed: catchUpMissed ?? true,
      maxRuns,
    });

    return NextResponse.json({ success: true, schedule: saved }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
