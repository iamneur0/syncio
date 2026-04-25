'use client';

import { HourlyActivity } from '@/lib/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface HourlyHeatmapProps {
  hourlyActivity: HourlyActivity[];
  peakHour: number;
}

export function HourlyHeatmap({ hourlyActivity, peakHour }: HourlyHeatmapProps) {
  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour} ${period}`;
  };

  const data = hourlyActivity.map((h) => ({
    ...h,
    isPeak: h.hour === peakHour,
    hourLabel: formatHour(h.hour),
  }));

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted">
        Peak activity at{' '}
        <span className="text-primary font-medium">{formatHour(peakHour)}</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis
              dataKey="hourLabel"
              stroke="#64748b"
              fontSize={10}
              interval={2}
            />
            <YAxis stroke="#64748b" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(20, 20, 35, 0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
              }}
            />
            <Bar
              dataKey="sessions"
              fill="var(--color-chart-1)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
