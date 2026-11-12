'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { workflowStore } from '@/lib/storage/workflowStore';
import { Webhook, Play, Sparkles } from 'lucide-react';

interface CreateWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (workflowId: string) => void;
}

export const CreateWorkflowModal: React.FC<CreateWorkflowModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'trigger.webhook' | 'trigger.manual'>('trigger.webhook');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Workflow name is required.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const newWorkflow = workflowStore.create({
        name: name.trim(),
        description: description.trim(),
        triggerType,
      });

      setName('');
      setDescription('');
      onClose();

      if (onCreated) {
        onCreated(newWorkflow.id);
      } else {
        router.push(`/builder/${newWorkflow.id}`);
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create workflow.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Workflow"
      description="Set up your automated pipeline name and initial trigger."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
            Workflow Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError('');
            }}
            placeholder="e.g. Lead Qualification & VIP Alert"
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-xs"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
            Description <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what business process this automation executes..."
            className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-xs"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
            Starting Trigger
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTriggerType('trigger.webhook')}
              className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                triggerType === 'trigger.webhook'
                  ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-500'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Webhook className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-slate-800">Webhook Trigger</span>
              </div>
              <p className="text-xs text-slate-500">
                Executes automatically on incoming HTTP requests.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setTriggerType('trigger.manual')}
              className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                triggerType === 'trigger.manual'
                  ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-500'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Play className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-slate-800">Manual Run</span>
              </div>
              <p className="text-xs text-slate-500">
                Triggered on-demand via the dashboard or API.
              </p>
            </button>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            icon={<Sparkles className="w-4 h-4" />}
          >
            Create & Open Builder
          </Button>
        </div>
      </form>
    </Modal>
  );
};

