import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/storage/webhookStore';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const webhook = await webhookStore.getByToken(token);
    if (!webhook) {
      return NextResponse.json({ success: false, error: 'Webhook not found.' }, { status: 404 });
    }

    const deliveries = await webhookStore.getDeliveries(webhook.id, 50);
    return NextResponse.json({ success: true, deliveries });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

