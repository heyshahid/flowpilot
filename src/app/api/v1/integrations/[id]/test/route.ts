import { NextRequest, NextResponse } from 'next/server';
import { integrationRegistry } from '@/core/integrations/registry';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const credentials = body.credentials || body;

    const result = await integrationRegistry.testConnection(id, credentials);
    return NextResponse.json({ success: true, testResult: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
