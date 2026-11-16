import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { usageService } from '@/core/usage/usageService';
import { UsageTimeWindow } from '@/core/usage/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await AuthContextManager.enforceWorkspaceIsolation(req, id, 'usage:read');

    const { searchParams } = new URL(req.url);
    const timeWindow = (searchParams.get('timeWindow') || '30d') as UsageTimeWindow;
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    const summary = await usageService.getWorkspaceUsageSummary(id, timeWindow, {
      from,
      to,
    });

    return NextResponse.json({
      success: true,
      data: summary,
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

