import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { alertIncidentStore } from '@/lib/storage/alertIncidentStore';
import { AlertCategory, IncidentStatus } from '@/core/alerts/types';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'alert:read');

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || undefined) as IncidentStatus | undefined;
    const category = (searchParams.get('category') || undefined) as AlertCategory | undefined;
    const ruleId = searchParams.get('ruleId') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = alertIncidentStore.list(authCtx.workspace.id, {
      status,
      category,
      ruleId,
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

