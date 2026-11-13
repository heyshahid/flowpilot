import { NextRequest, NextResponse } from 'next/server';
import { SmartConfigSuggester } from '@/core/ai/smartConfigSuggester';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nodeType, userIntent, existingConfig, provider, model, workspaceId } = body;

    if (!nodeType || !userIntent) {
      return NextResponse.json(
        { success: false, error: '"nodeType" and "userIntent" are required.' },
        { status: 400 }
      );
    }

    const result = await SmartConfigSuggester.suggest(
      nodeType,
      userIntent,
      existingConfig || {},
      { provider, model, workspaceId }
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
