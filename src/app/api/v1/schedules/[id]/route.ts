import { NextRequest, NextResponse } from 'next/server';
import { scheduleStore } from '@/lib/storage/scheduleStore';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'schedule:read');

    const schedule = await scheduleStore.getById(id, authCtx.workspace.id);
    if (!schedule) {
      return NextResponse.json(
        { success: false, error: `Schedule "${id}" was not found.` },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, schedule });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'schedule:manage');

    const body = await req.json();

    const updated = await scheduleStore.update(id, body, authCtx.workspace.id);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: `Schedule "${id}" was not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, schedule: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'schedule:manage');

    const deleted = await scheduleStore.delete(id, authCtx.workspace.id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: `Schedule "${id}" not found.` },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, message: `Schedule "${id}" deleted successfully.` });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
