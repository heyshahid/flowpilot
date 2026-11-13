import { NextRequest, NextResponse } from 'next/server';
import { aiProviderRegistry } from '@/core/ai/aiProviderRegistry';
import { AIProviderId } from '@/core/ai/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await aiProviderRegistry.testProvider(id as AIProviderId, body.apiKey);

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
