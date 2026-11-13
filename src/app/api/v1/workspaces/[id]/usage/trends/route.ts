import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { usageService } from '@/core/usage/usageService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await AuthContextManager.enforceWorkspaceIsolation(req, id, 'usage:read');

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

    const trends = await usageService.getUsageTrends(id, days);

    return NextResponse.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') || msg.includes('Cross-workspace') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

