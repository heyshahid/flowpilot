import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { recommendationService } from '@/core/recommendations/recommendationService';
import { auditLogStore } from '@/lib/storage/auditLogStore';

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'recommendation:evaluate');

    const result = await recommendationService.evaluateWorkspace(authCtx.workspace.id);

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'recommendation.evaluated',
      resourceType: 'recommendation',
      resourceId: authCtx.workspace.id,
      resourceName: 'Optimization Recommendations Evaluation',
      metadata: {
        totalEvaluated: result.totalEvaluatedRules,
        generated: result.generatedCount,
        updated: result.updatedActiveCount,
        regenerated: result.regeneratedCount,
      },
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

