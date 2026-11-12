import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'active' | 'draft' | 'paused' | 'success' | 'failed' | 'neutral' | 'blue';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'neutral',
  size = 'md',
  children,
  ...props
}) => {
  const variants = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    draft: 'bg-amber-50 text-amber-700 border-amber-200',
    paused: 'bg-slate-100 text-slate-600 border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-slate-50 text-slate-600 border-slate-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 font-medium',
    md: 'text-xs px-2.5 py-1 font-medium',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      <span
        className={cn('w-1.5 h-1.5 rounded-full', {
          'bg-emerald-500': variant === 'active' || variant === 'success',
          'bg-amber-500': variant === 'draft',
          'bg-slate-400': variant === 'paused' || variant === 'neutral',
          'bg-red-500': variant === 'failed',
          'bg-blue-500': variant === 'blue',
        })}
      />
      {children}
    </span>
  );
};
