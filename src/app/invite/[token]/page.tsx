'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Users,
  CheckCircle2,
  AlertCircle,
  Shield,
  Building2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [invitationData, setInvitationData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (token) {
      verifyToken();
    }
  }, [token]);

  const verifyToken = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/invitations/${token}`);
      const data = await res.json();
      if (data.success) {
        setInvitationData(data.invitation);
      } else {
        setError(data.error || 'Invalid or expired invitation token.');
      }
    } catch {
      setError('Failed to reach FlowPilot server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email: invitationData?.email,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        // Set active workspace cookie
        document.cookie = `fp_active_workspace=${data.workspaceId}; path=/; max-age=2592000; SameSite=Lax`;
        setTimeout(() => {
          router.push('/workflows');
        }, 1500);
      } else {
        setError(data.error || 'Failed to accept invitation.');
      }
    } catch {
      setError('Network error during invitation acceptance.');
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 selection:bg-blue-500 selection:text-white">
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div className="w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand */}
        <div className="flex items-center gap-2.5 mb-6">
          <div className="h-9 w-9 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center shadow-md shadow-blue-500/20">
            FP
          </div>
          <div>
            <div className="font-bold text-slate-900 text-sm leading-tight">FlowPilot</div>
            <div className="text-[10px] text-slate-400 uppercase font-medium">Workspace Collaboration</div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            Verifying invitation token...
          </div>
        ) : error ? (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-red-900">Invitation Expired or Invalid</h3>
                <p className="text-xs text-red-700 mt-1">{error}</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/')}
              className="w-full py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Back to Home
            </button>
          </div>
        ) : success ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Welcome to the Team!</h3>
            <p className="text-xs text-slate-500">
              You are now a member of <strong>{invitationData?.workspaceName}</strong>. Redirecting to your workflows canvas...
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Team Collaboration Invitation
              </span>
              <h2 className="text-xl font-bold text-slate-900">
                Join {invitationData?.workspaceName}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {invitationData?.invitedByName || 'A team administrator'} has invited you to collaborate on automated workflows.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                <span className="text-slate-500">Invited Account:</span>
                <span className="font-semibold text-slate-900">{invitationData?.email}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                <span className="text-slate-500">Assigned Role:</span>
                <span className="font-bold text-blue-700 uppercase bg-blue-100/70 px-2 py-0.5 rounded text-[11px]">
                  {invitationData?.role}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Expires:</span>
                <span className="text-slate-700">
                  {new Date(invitationData?.expiresAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <Button
              onClick={handleAccept}
              isLoading={isAccepting}
              className="w-full flex items-center justify-center gap-2 py-2.5"
            >
              <span>Accept & Enter Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
