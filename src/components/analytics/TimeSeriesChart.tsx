'use client';

import React, { useState } from 'react';
import { TimeSeriesPoint, TimeBucketInterval } from '@/core/analytics/types';
import { formatDuration } from '@/core/analytics/metricDefinitions';

interface TimeSeriesChartProps {
  points: TimeSeriesPoint[];
  interval: TimeBucketInterval;
  title?: string;
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  points,
  interval,
  title = 'Execution Volume Over Time',
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<TimeSeriesPoint | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!points || points.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white border border-slate-200 rounded-xl text-center">
        <p className="text-sm font-medium text-slate-500">No time-series data available.</p>
      </div>
    );
  }

  const maxTotal = Math.max(...points.map((p) => p.total), 1);
  // Round up max for clean Y-axis
  const yMax = maxTotal <= 5 ? 5 : Math.ceil(maxTotal / 5) * 5;

  const chartHeight = 220;
  const paddingBottom = 30;
  const paddingTop = 20;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  // X-axis label frequency to prevent crowding
  const labelInterval = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
      {/* Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">
            Bucket interval: <span className="font-semibold text-slate-700 capitalize">{interval}</span>
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-emerald-500" />
            <span className="font-medium text-slate-600">Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-rose-500" />
            <span className="font-medium text-slate-600">Failed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-slate-300" />
            <span className="font-medium text-slate-600">Zero Activity</span>
          </div>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 800 ${chartHeight}`}
          className="w-full h-56 select-none"
          preserveAspectRatio="none"
        >
          {/* Horizontal Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction, i) => {
            const y = paddingTop + plotHeight * (1 - fraction);
            const val = Math.round(yMax * fraction);
            return (
              <g key={i}>
                <line
                  x1="40"
                  y1={y}
                  x2="780"
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={fraction === 0 ? '' : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x="30"
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] fill-slate-400 font-mono font-medium"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {points.map((p, idx) => {
            const availableWidth = 740;
            const barSlotWidth = availableWidth / points.length;
            const barWidth = Math.max(4, Math.min(24, barSlotWidth * 0.7));
            const x = 40 + idx * barSlotWidth + (barSlotWidth - barWidth) / 2;

            const completedHeight = (p.completed / yMax) * plotHeight;
            const failedHeight = (p.failed / yMax) * plotHeight;
            const totalHeight = (p.total / yMax) * plotHeight;

            const isHovered = hoveredIndex === idx;

            return (
              <g
                key={idx}
                onMouseEnter={() => {
                  setHoveredPoint(p);
                  setHoveredIndex(idx);
                }}
                onMouseLeave={() => {
                  setHoveredPoint(null);
                  setHoveredIndex(null);
                }}
                className="cursor-pointer"
              >
                {/* Background hover highlight column */}
                {isHovered && (
                  <rect
                    x={40 + idx * barSlotWidth}
                    y={paddingTop}
                    width={barSlotWidth}
                    height={plotHeight}
                    fill="#f1f5f9"
                    opacity="0.6"
                    rx="4"
                  />
                )}

                {/* Zero-activity indicator tick */}
                {p.total === 0 && (
                  <rect
                    x={x}
                    y={paddingTop + plotHeight - 3}
                    width={barWidth}
                    height={3}
                    fill="#cbd5e1"
                    rx="1.5"
                  />
                )}

                {/* Completed Bar Segment (Bottom) */}
                {p.completed > 0 && (
                  <rect
                    x={x}
                    y={paddingTop + plotHeight - completedHeight}
                    width={barWidth}
                    height={completedHeight}
                    fill="#10b981"
                    rx={p.failed > 0 ? 0 : 3}
                    className="transition-all duration-150"
                  />
                )}

                {/* Failed Bar Segment (Stacked on top of completed) */}
                {p.failed > 0 && (
                  <rect
                    x={x}
                    y={paddingTop + plotHeight - completedHeight - failedHeight}
                    width={barWidth}
                    height={failedHeight}
                    fill="#f43f5e"
                    rx={3}
                    className="transition-all duration-150"
                  />
                )}

                {/* X-axis Label */}
                {idx % labelInterval === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight - 8}
                    textAnchor="middle"
                    className="text-[10px] fill-slate-500 font-sans"
                  >
                    {p.bucketLabel.split(' ')[0]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div className="absolute top-2 right-4 bg-slate-900/95 text-white p-3 rounded-lg shadow-lg text-xs border border-slate-700 pointer-events-none animate-in fade-in-50">
            <p className="font-semibold text-slate-200 border-b border-slate-800 pb-1 mb-1.5">
              {hoveredPoint.bucketLabel}
            </p>
            <div className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">Total Runs:</span>
                <span className="font-bold text-white">{hoveredPoint.total}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-emerald-400">Completed:</span>
                <span className="font-bold text-emerald-300">{hoveredPoint.completed}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-rose-400">Failed:</span>
                <span className="font-bold text-rose-300">{hoveredPoint.failed}</span>
              </div>
              <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800 text-slate-300">
                <span>Avg Latency:</span>
                <span className="font-mono">{formatDuration(hoveredPoint.meanDurationMs)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
