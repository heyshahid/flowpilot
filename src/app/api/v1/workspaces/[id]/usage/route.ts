import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
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
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') || msg.includes('Cross-workspace') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

