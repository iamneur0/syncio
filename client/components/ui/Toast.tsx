'use client';

import { Toaster, toast as hotToast } from 'react-hot-toast';
import { CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

// Re-export toast for easy usage
export { toast } from 'react-hot-toast';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-surfaceBorder)',
            borderRadius: '12px',
            padding: '12px 16px',
            boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.5)',
          },
          success: {
            iconTheme: {
              primary: 'var(--color-success)',
              secondary: 'var(--color-surface)',
            },
          },
          error: {
            iconTheme: {
              primary: 'var(--color-error)',
              secondary: 'var(--color-surface)',
            },
          },
        }}
      />
    </>
  );
}

// Helper functions for consistent toast styling
export const showToast = {
  success: (message: string) => hotToast.success(message),
  error: (message: string) => hotToast.error(message),
  info: (message: string) => hotToast(message, {
    icon: <InformationCircleIcon className="w-5 h-5" style={{ color: 'var(--color-secondary)' }} />,
  }),
  warning: (message: string) => hotToast(message, {
    icon: <ExclamationCircleIcon className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />,
  }),
  loading: (message: string) => hotToast.loading(message),
  dismiss: (id?: string) => hotToast.dismiss(id),
  promise: <T,>(
    promise: Promise<T>,
    msgs: { loading: string; success: string; error: string }
  ) => hotToast.promise(promise, msgs),
};
