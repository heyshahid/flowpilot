/**
 * FlowPilot Current User Profile Endpoint (Alias)
 * GET /api/v1/auth/me
 *
 * Backward-compatibility alias that routes directly to /api/v1/auth/session.
 */

import { NextRequest } from 'next/server';
import { GET as sessionGet } from '../session/route';

export async function GET(req: NextRequest) {
  return sessionGet(req);
}
