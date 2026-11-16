import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/storage/webhookStore';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const webhook = await webhookStore.getByToken(token);
    if (!webhook) {
      return NextResponse.json(
        { success: false, error: 'Webhook not found.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const wsId = webhook.workspaceId || 'ws_default';
    await AuthContextManager.enforceWorkspaceIsolation(req, wsId, 'webhook:read');

    const deliveries = await webhookStore.getDeliveries(webhook.id, 50, wsId);
    return NextResponse.json({ success: true, deliveries });
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
