'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Alert } from '@/lib/api';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

interface AlertBannerProps {
  alerts: {
    critical: Alert[];
    warnings: Alert[];
    total: number;
    hasCritical: boolean;
  };
}

export function AlertBanner({ alerts }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || (!alerts.critical.length && !alerts.warnings.length)) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="mb-6"
    >
      <AnimatePresence>
        {alerts.critical.map((alert, idx) => (
          <motion.div
            key={`critical-${idx}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-4 p-4 mb-3 rounded-xl bg-error-muted border border-error/20"
          >
            <ExclamationTriangleIcon className="w-6 h-6 text-error flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-error">{alert.message}</p>
              {alert.users && alert.users.length > 0 && (
                <p className="text-sm text-error/70 mt-1">
                  Users: {alert.users.join(', ')}
                  {alert.count > alert.users.length && ` +${alert.count - alert.users.length} more`}
                </p>
              )}
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 rounded-lg hover:bg-error/10 text-error"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
