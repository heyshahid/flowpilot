import { NextRequest, NextResponse } from 'next/server';
import { aiProviderRegistry } from '@/core/ai/aiProviderRegistry';
import { AIProviderId } from '@/core/ai/types';

export async function GET() {
  try {
    const providers = aiProviderRegistry.listProviders();
    const activeProvider = aiProviderRegistry.getActiveProvider();
    const activeModel = aiProviderRegistry.getActiveModel();

    return NextResponse.json({
      success: true,
      data: {
        providers,
        activeProviderId: activeProvider.id,
        activeModel,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { providerId, model } = body;

    if (!providerId) {
      return NextResponse.json(
        { success: false, error: 'providerId is required.' },
        { status: 400 }
      );
    }

    aiProviderRegistry.setActiveProvider(providerId as AIProviderId, model);

    return NextResponse.json({
      success: true,
      message: `Active AI provider set to ${providerId}${model ? ` (${model})` : ''}`,
      data: {
        activeProviderId: providerId,
        activeModel: aiProviderRegistry.getActiveModel(),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
