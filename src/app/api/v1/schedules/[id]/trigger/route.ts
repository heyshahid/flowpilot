import { NextRequest, NextResponse } from 'next/server';
import { scheduleStore } from '@/lib/storage/scheduleStore';
import { schedulerEngine } from '@/core/scheduler/schedulerEngine';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const schedule = await scheduleStore.getById(id);
    if (!schedule) {
      return NextResponse.json(
        { success: false, error: `Schedule "${id}" was not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    await AuthContextManager.enforceWorkspaceIsolation(
      req,
      schedule.workspaceId || 'ws_default',
      'schedule:manage'
    );

    const execution = await schedulerEngine.triggerSchedule(schedule, new Date());

    return NextResponse.json({
      success: true,
      message: `Schedule "${schedule.name}" triggered immediately.`,
      executionId: execution.id,
      status: execution.status,
    });
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
