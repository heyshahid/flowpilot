'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface SummaryCardProps {
  title: string;
  value: string | number | null;
  formattedValue?: string;
  unit?: string;
  subtitle?: string;
  sampleSize?: number;
  isAvailable?: boolean;
  notes?: string;
  icon: LucideIcon;
  variant?: 'blue' | 'emerald' | 'rose' | 'amber' | 'indigo' | 'purple';
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  value,
  formattedValue,
  unit,
  subtitle,
  sampleSize,
  isAvailable = true,
  notes,
  icon: Icon,
  variant = 'blue',
}) => {
  const variantStyles = {
    blue: {
      bg: 'bg-blue-50/70',
      text: 'text-blue-600',
      border: 'border-blue-100',
    },
    emerald: {
      bg: 'bg-emerald-50/70',
      text: 'text-emerald-600',
      border: 'border-emerald-100',
    },
    rose: {
      bg: 'bg-rose-50/70',
      text: 'text-rose-600',
      border: 'border-rose-100',
    },
    amber: {
      bg: 'bg-amber-50/70',
      text: 'text-amber-600',
      border: 'border-amber-100',
    },
    indigo: {
      bg: 'bg-indigo-50/70',
      text: 'text-indigo-600',
      border: 'border-indigo-100',
    },
    purple: {
      bg: 'bg-purple-50/70',
      text: 'text-purple-600',
      border: 'border-purple-100',
    },
  };

  const style = variantStyles[variant];

  // Display value: if isAvailable is false or value is null, show N/A
  const displayVal = !isAvailable || value === null ? 'N/A' : (formattedValue || String(value));

  return (
    <div className="flex flex-col justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-xs transition-all hover:shadow-md hover:border-slate-300">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        <div className={`p-2 rounded-lg ${style.bg} ${style.text}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-2xl font-bold tracking-tight ${!isAvailable || value === null ? 'text-slate-400' : 'text-slate-900'}`}>
            {displayVal}
          </span>
          {unit && isAvailable && value !== null && (
            <span className="text-xs font-medium text-slate-500">{unit}</span>
          )}
        </div>

        {/* Subtitle / Sample size info */}
        <div className="mt-1 text-[11px] text-slate-400">
          {!isAvailable ? (
            <span className="italic">{notes || 'Unavailable in timeframe'}</span>
          ) : (
            <span>
              {subtitle || (sampleSize !== undefined ? `Based on ${sampleSize} runs` : '')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
