import { NextRequest, NextResponse } from 'next/server';
import { scheduleStore } from '@/lib/storage/scheduleStore';
import { workflowStore } from '@/lib/storage/workflowStore';
import { CronParser } from '@/core/scheduler/cronParser';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'schedule:read');
    const { searchParams } = new URL(req.url);
    const workflowId = searchParams.get('workflowId') || undefined;
    const status = (searchParams.get('status') as any) || undefined;

    const list = await scheduleStore.list({
      workflowId,
      status,
      workspaceId: authCtx.workspace.id,
    });
    return NextResponse.json({ success: true, count: list.length, schedules: list });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'schedule:manage');
    const body = await req.json();
    const {
      workflowId,
      name,
      type,
      cronExpression,
      intervalMinutes,
      targetDateTime,
      timezone,
      inputPayload,
      catchUpMissed,
      maxRuns,
    } = body;

    if (!workflowId || !name || !type) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: "workflowId", "name", and "type" are required.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const workflow = workflowStore.getById(workflowId, authCtx.workspace.id);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow with ID "${workflowId}" does not exist in this workspace.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (type === 'cron') {
      if (!cronExpression || !CronParser.isValid(cronExpression)) {
        return NextResponse.json(
          { success: false, error: `Invalid cron expression "${cronExpression}".`, code: 'INVALID_CRON' },
          { status: 400 }
        );
      }
    }

    const schedule = await scheduleStore.save({
      workflowId,
      workflowName: workflow.name,
      workspaceId: authCtx.workspace.id,
      name,
      type,
      cronExpression,
      intervalMinutes,
      targetDateTime,
      timezone: timezone || 'UTC',
      status: 'active',
      inputPayload,
      catchUpMissed: catchUpMissed ?? true,
      maxRuns,
    });

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'schedule.created',
      resourceType: 'schedule',
      resourceId: schedule.id,
      resourceName: schedule.name,
      metadata: { workflowId, type, cronExpression },
    });

    return NextResponse.json({ success: true, schedule }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
