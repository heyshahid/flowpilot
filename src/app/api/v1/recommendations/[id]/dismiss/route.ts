import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { recommendationService } from '@/core/recommendations/recommendationService';
import { auditLogStore } from '@/lib/storage/auditLogStore';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'recommendation:manage');

    let body: { reason?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Body optional
    }

    const updated = await recommendationService.dismissRecommendation(
      id,
      authCtx.user.id,
      body.reason,
      authCtx.workspace.id
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Recommendation not found' },
        { status: 404 }
      );
    }

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'recommendation.dismissed',
      resourceType: 'recommendation',
      resourceId: id,
      resourceName: updated.title,
      metadata: { reason: body.reason },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

