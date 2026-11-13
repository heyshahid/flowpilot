import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { notificationStore } from '@/lib/storage/notificationStore';
import { NotificationChannel } from '@/core/alerts/types';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'alert:read');

    const { searchParams } = new URL(req.url);
    const channel = (searchParams.get('channel') || undefined) as NotificationChannel | undefined;
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = notificationStore.list(authCtx.workspace.id, {
      channel,
      unreadOnly,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'alert:read');

    const body = await req.json();

    if (body.markAllRead) {
      const count = notificationStore.markAllAsRead(authCtx.workspace.id);
      return NextResponse.json({
        success: true,
        markedCount: count,
      });
    }

    if (body.id) {
      const ok = notificationStore.markAsRead(body.id, authCtx.workspace.id);
      return NextResponse.json({
        success: ok,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Provide either id or markAllRead: true' },
      { status: 400 }
    );
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

