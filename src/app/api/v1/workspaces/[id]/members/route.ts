import { NextRequest, NextResponse } from 'next/server';
import { membershipStore } from '@/lib/storage/membershipStore';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(req, id, 'member:read');

    const members = membershipStore.listWithUserDetails(id);

    return NextResponse.json({
      success: true,
      currentUserId: authCtx.user.id,
      currentUserRole: authCtx.role,
      members,
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
