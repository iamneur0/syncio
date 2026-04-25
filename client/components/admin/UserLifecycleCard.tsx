'use client';

import { AdminMetrics } from '@/lib/api';
import { StatCard } from '@/components/ui';
import { UsersIcon, CheckIcon, UserIcon } from '@heroicons/react/24/outline';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface UserLifecycleCardProps {
  lifecycle: AdminMetrics['userLifecycle'];
  userJoins: Array<{ date: string; count: number }>;
}

export function UserLifecycleCard({ lifecycle, userJoins }: UserLifecycleCardProps) {
  const { retention } = lifecycle;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={retention.total.toString()}
          icon={<UsersIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Active (7d)"
          value={`${retention.active7d} (${retention.rate7d}%)`}
          icon={<CheckIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Active (30d)"
          value={`${retention.active30d} (${retention.rate30d}%)`}
          icon={<CheckIcon className="w-5 h-5" />}
        />
        <StatCard
          label="At Risk"
          value={lifecycle.atRisk.length.toString()}
          icon={<UserIcon className="w-5 h-5" />}
        />
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={userJoins}>
            <defs>
              <linearGradient id="colorSignups" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis
              dataKey="date"
              stroke="#64748b"
              fontSize={12}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }}
            />
            <YAxis stroke="#64748b" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(20, 20, 35, 0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
              }}
              labelFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--color-primary)"
              fillOpacity={1}
              fill="url(#colorSignups)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
