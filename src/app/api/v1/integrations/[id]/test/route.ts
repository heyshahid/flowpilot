import { NextRequest, NextResponse } from 'next/server';
import { integrationRegistry } from '@/core/integrations/registry';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await AuthContextManager.enforcePermission(req, 'integration:manage');

    const { id } = await params;
    const body = await req.json();
    const credentials = body.credentials || body;

    const result = await integrationRegistry.testConnection(id, credentials);
    return NextResponse.json({ success: true, testResult: result });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
