import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/storage/webhookStore';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const webhook = await webhookStore.getByToken(token);
    if (!webhook) {
      return NextResponse.json({ success: false, error: 'Webhook not found.' }, { status: 404 });
    }

    const updated = await webhookStore.rotateSecret(webhook.id);
    return NextResponse.json({
      success: true,
      message: 'Webhook secret successfully rotated.',
      newSecret: updated.secret,
      webhook: updated,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
