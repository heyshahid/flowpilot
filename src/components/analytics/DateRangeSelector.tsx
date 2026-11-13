'use client';

import React, { useState } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { TimeWindow } from '@/core/analytics/types';

interface DateRangeSelectorProps {
  selectedWindow: TimeWindow;
  customStartDate?: string;
  customEndDate?: string;
  onSelect: (window: TimeWindow, customRange?: { startDate: string; endDate: string }) => void;
}

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  selectedWindow,
  customStartDate,
  customEndDate,
  onSelect,
}) => {
  const [showCustomInputs, setShowCustomInputs] = useState(selectedWindow === 'custom');
  const [startInput, setStartInput] = useState(
    customStartDate || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  );
  const [endInput, setEndInput] = useState(
    customEndDate || new Date().toISOString().split('T')[0]
  );
  const [rangeError, setRangeError] = useState<string | null>(null);

  const presets: { id: TimeWindow; label: string }[] = [
    { id: '24h', label: 'Last 24 Hours' },
    { id: '7d', label: 'Last 7 Days' },
    { id: '30d', label: 'Last 30 Days' },
    { id: '90d', label: 'Last 90 Days' },
    { id: 'custom', label: 'Custom Range' },
  ];

  const handlePresetClick = (window: TimeWindow) => {
    if (window === 'custom') {
      setShowCustomInputs(true);
    } else {
      setShowCustomInputs(false);
      setRangeError(null);
      onSelect(window);
    }
  };

  const handleApplyCustom = () => {
    if (!startInput || !endInput) {
      setRangeError('Both start and end dates are required.');
      return;
    }
    const s = new Date(startInput).getTime();
    const e = new Date(endInput).getTime();
    if (s > e) {
      setRangeError('Start date cannot be after end date.');
      return;
    }
    setRangeError(null);
    onSelect('custom', {
      startDate: new Date(startInput + 'T00:00:00Z').toISOString(),
      endDate: new Date(endInput + 'T23:59:59Z').toISOString(),
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2 border border-slate-200 rounded-xl shadow-xs">
        {/* Preset Pills */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {presets.map((p) => {
            const isActive = selectedWindow === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handlePresetClick(p.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  isActive
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Timezone Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-md">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Reporting Timezone: <strong>UTC</strong></span>
        </div>
      </div>

      {/* Custom Date Range Form */}
      {showCustomInputs && (
        <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-3 border border-slate-200 rounded-xl animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-700">From:</span>
            <input
              type="date"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-700">To:</span>
            <input
              type="date"
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleApplyCustom}
            className="px-3.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs"
          >
            Apply Range
          </button>
          {rangeError && (
            <span className="text-xs text-rose-600 font-medium">{rangeError}</span>
          )}
        </div>
      )}
    </div>
  );
};
