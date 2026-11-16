import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { aiProviderRegistry } from '@/core/ai/aiProviderRegistry';
import { AIProviderId } from '@/core/ai/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await AuthContextManager.enforcePermission(req, 'integration:manage');

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await aiProviderRegistry.testProvider(id as AIProviderId, body.apiKey);

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
