'use client';

import { AddonStat, ResourceStat } from '@/lib/api';
import { motion } from 'framer-motion';
import { StatCard, Badge } from '@/components/ui';
import { PuzzlePieceIcon, UsersIcon, ChartPieIcon } from '@heroicons/react/24/outline';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface AddonPerformanceCardProps {
  totalAddons: number;
  activeAddons: number;
  topAddons: AddonStat[];
  byResource: ResourceStat[];
}

const COLORS = [
  '#7c3aed', // Violet
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#8b5cf6', // Purple
];

export function AddonPerformanceCard({
  totalAddons,
  activeAddons,
  topAddons,
  byResource,
}: AddonPerformanceCardProps) {
  const totalResourceCount = byResource.reduce((sum, r) => sum + r.count, 0);
  const pieData = byResource.slice(0, 4).map((r, index) => {
    const percentage = totalResourceCount > 0 ? Math.round((r.count / totalResourceCount) * 100) : 0;
    return {
      name: r.name,
      value: r.count,
      percentage,
      color: COLORS[index % COLORS.length],
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Addons"
          value={totalAddons.toString()}
          icon={<PuzzlePieceIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Active Addons"
          value={activeAddons.toString()}
          icon={<CheckIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Top Addon Users"
          value={topAddons[0]?.userCount?.toString() || '0'}
          icon={<UsersIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Addon Type"
          value={byResource.length.toString()}
          icon={<ChartPieIcon className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Addons List */}
        <div className="space-y-3">
          <h4 className="font-medium text-default">Top Addons by Usage</h4>
          <div className="space-y-2">
            {topAddons.slice(0, 5).map((addon, index) => (
              <motion.div
                key={addon.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover"
              >
                {addon.iconUrl ? (
                  <img
                    src={addon.iconUrl}
                    alt={addon.name}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
                    <PuzzlePieceIcon className="w-5 h-5 text-muted" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-default truncate">{addon.name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <span>{addon.userCount} users</span>
                    <span>•</span>
                    <span>{addon.usageRate}% usage</span>
                  </div>
                </div>
                <Badge variant={addon.isActive ? 'success' : 'default'} size="sm">
                  {addon.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Resource Breakdown Pie Chart */}
        <div className="space-y-3">
          <h4 className="font-medium text-default">Addon Type</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={65}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ percent = 0 }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any, name: any, props: any) => [
                    `${value} (${props.payload.percentage}%)`, 
                    name
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {pieData.map((item, index) => (
              <div key={item.name} className="flex items-center gap-2 group">
                <div
                  className="w-3.5 h-3.5 rounded-full shadow-sm transition-transform group-hover:scale-110"
                  style={{ background: item.color }}
                />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-default capitalize leading-none">{item.name}</span>
                  <span className="text-[11px] font-bold text-primary">{item.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper icon component
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
