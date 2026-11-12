'use client';

import React, { useState } from 'react';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { TopNavigation } from '@/components/layout/TopNavigation';
import { CreateWorkflowModal } from '@/components/workflows/CreateWorkflowModal';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      {/* Collapsible Sidebar Navigation */}
      <AppSidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNavigation onCreateWorkflow={() => setIsCreateModalOpen(true)} />

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl space-y-8">
            {children}
          </div>
        </main>
      </div>

      {/* Global Create Workflow Modal */}
      <CreateWorkflowModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
