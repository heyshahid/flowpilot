import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { recommendationService } from '@/core/recommendations/recommendationService';
import { UserFeedbackType } from '@/core/recommendations/types';
import { auditLogStore } from '@/lib/storage/auditLogStore';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'recommendation:read');

    const feedbackList = await recommendationService.getFeedback(id, authCtx.workspace.id);

    return NextResponse.json({
      success: true,
      data: feedbackList,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'recommendation:feedback');

    const rec = await recommendationService.getRecommendationById(id, authCtx.workspace.id);
    if (!rec) {
      return NextResponse.json(
        { success: false, error: 'Recommendation not found' },
        { status: 404 }
      );
    }

    const body = await req.json();

    if (!body.type) {
      return NextResponse.json(
        { success: false, error: 'Feedback type is required' },
        { status: 400 }
      );
    }

    const feedback = await recommendationService.submitFeedback({
      recommendationId: id,
      workspaceId: authCtx.workspace.id,
      userId: authCtx.user.id,
      userName: authCtx.user.name,
      type: body.type as UserFeedbackType,
      comments: body.comments,
    });

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'recommendation.feedback_submitted',
      resourceType: 'recommendation',
      resourceId: id,
      resourceName: rec.title,
      metadata: { feedbackType: body.type, comments: body.comments },
    });

    return NextResponse.json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

