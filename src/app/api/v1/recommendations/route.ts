import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { recommendationService } from '@/core/recommendations/recommendationService';
import {
  RecommendationCategory,
  RecommendationSeverity,
  RecommendationStatus,
  RecommendationConfidenceTier,
  RecommendationTargetType,
} from '@/core/recommendations/types';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'recommendation:read');

    const { searchParams } = new URL(req.url);
    const category = (searchParams.get('category') || undefined) as RecommendationCategory | undefined;
    const severity = (searchParams.get('severity') || undefined) as RecommendationSeverity | undefined;
    const status = (searchParams.get('status') || undefined) as RecommendationStatus | undefined;
    const confidence = (searchParams.get('confidence') || undefined) as RecommendationConfidenceTier | undefined;
    const targetType = (searchParams.get('targetType') || undefined) as RecommendationTargetType | undefined;
    const targetId = searchParams.get('targetId') || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = await recommendationService.getRecommendations(authCtx.workspace.id, {
      category,
      severity,
      status,
      confidence,
      targetType,
      targetId,
      search,
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

