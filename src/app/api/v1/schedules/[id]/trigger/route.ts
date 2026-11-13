import { NextRequest, NextResponse } from 'next/server';
import { scheduleStore } from '@/lib/storage/scheduleStore';
import { schedulerEngine } from '@/core/scheduler/schedulerEngine';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const schedule = await scheduleStore.getById(id);
    if (!schedule) {
      return NextResponse.json(
        { success: false, error: `Schedule "${id}" was not found.` },
        { status: 404 }
      );
    }

    const execution = await schedulerEngine.triggerSchedule(schedule, new Date());

    return NextResponse.json({
      success: true,
      message: `Schedule "${schedule.name}" triggered immediately.`,
      executionId: execution.id,
      status: execution.status,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
