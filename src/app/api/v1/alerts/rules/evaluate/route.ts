import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { alertRuleEngine } from '@/core/alerts/alertRuleEngine';
import { alertRuleStore } from '@/lib/storage/alertRuleStore';

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'alert:manage');

    let body: { ruleId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is valid for evaluate-all
    }

    if (body.ruleId) {
      const rule = alertRuleStore.getById(body.ruleId, authCtx.workspace.id);
      if (!rule) {
        return NextResponse.json(
          { success: false, error: 'Rule not found' },
          { status: 404 }
        );
      }
      const result = await alertRuleEngine.evaluateRule(rule);
      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    const summary = await alertRuleEngine.evaluateAll(authCtx.workspace.id);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

