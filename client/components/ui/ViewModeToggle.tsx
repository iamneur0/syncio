'use client';

import { motion } from 'framer-motion';
import { Squares2X2Icon, ListBulletIcon } from '@heroicons/react/24/outline';

interface ViewModeToggleProps {
  mode: 'grid' | 'list';
  onChange: (mode: 'grid' | 'list') => void;
  showLabels?: boolean;
}

export function ViewModeToggle({ mode, onChange, showLabels = true }: ViewModeToggleProps) {
  return (
    <div className="relative rounded-xl p-1 flex bg-surface border border-default">
      {/* Sliding background indicator */}
      <motion.div
        className="absolute top-1 h-[calc(100%-8px)] rounded-lg bg-primary-muted"
        initial={false}
        animate={{
          left: mode === 'grid' ? '4px' : 'calc(50% + 0px)',
          width: 'calc(50% - 4px)',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      />

      {/* Grid button */}
      <button
        onClick={() => onChange('grid')}
        className={`relative z-10 p-2 rounded-lg transition-all flex items-center gap-1.5 ${
          mode === 'grid' ? 'text-primary' : 'text-muted'
        }`}
        title="Grid view"
      >
        <Squares2X2Icon className="w-5 h-5" />
        {showLabels && <span className="hidden sm:inline text-sm font-medium">Grid</span>}
      </button>

      {/* List button */}
      <button
        onClick={() => onChange('list')}
        className={`relative z-10 p-2 rounded-lg transition-all flex items-center gap-1.5 ${
          mode === 'list' ? 'text-primary' : 'text-muted'
        }`}
        title="List view"
      >
        <ListBulletIcon className="w-5 h-5" />
        {showLabels && <span className="hidden sm:inline text-sm font-medium">List</span>}
      </button>
    </div>
  );
}
