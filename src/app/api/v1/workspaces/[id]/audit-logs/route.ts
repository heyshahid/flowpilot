import { NextRequest, NextResponse } from 'next/server';
import { auditLogStore, AuditResourceType } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await AuthContextManager.enforceWorkspaceIsolation(req, id, 'audit:read');

    const searchParams = req.nextUrl.searchParams;
    const resourceType = searchParams.get('resourceType') as AuditResourceType | null;
    const actorId = searchParams.get('actorId') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const logs = auditLogStore.list(id, {
      resourceType: resourceType || undefined,
      actorId,
      limit,
    });

    return NextResponse.json({
      success: true,
      total: logs.length,
      logs,
    });
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
