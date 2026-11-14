import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { recommendationService } from '@/core/recommendations/recommendationService';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'recommendation:read');

    const overview = await recommendationService.getOverview(authCtx.workspace.id);

    return NextResponse.json({
      success: true,
      data: overview,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

