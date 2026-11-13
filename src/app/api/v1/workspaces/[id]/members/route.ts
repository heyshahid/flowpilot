import { NextRequest, NextResponse } from 'next/server';
import { membershipStore } from '@/lib/storage/membershipStore';
import { AuthContextManager } from '@/core/auth/authContext';

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
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') || msg.includes('Cross-workspace') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
