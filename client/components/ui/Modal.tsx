'use client';

import { Fragment } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

export function Modal({ isOpen, onClose, title, description, size = 'md', children }: ModalProps) {
  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div 
            className="fixed inset-0 backdrop-blur-sm"
            style={{ background: 'rgba(0, 0, 0, 0.7)' }}
          />
        </TransitionChild>

        {/* Modal container */}
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95 translate-y-4"
            enterTo="opacity-100 scale-100 translate-y-0"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100 translate-y-0"
            leaveTo="opacity-0 scale-95 translate-y-4"
          >
            <DialogPanel
              className={clsx(
                'w-full',
                sizeStyles[size],
                'rounded-2xl p-0 overflow-hidden'
              )}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-surfaceBorder)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              }}
            >
              {/* Header */}
              {(title || description) && (
                <div 
                  className="px-6 pt-6 pb-4"
                  style={{ borderBottom: '1px solid var(--color-surfaceBorder)' }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      {title && (
                        <DialogTitle 
                          className="text-xl font-semibold font-display"
                          style={{ color: 'var(--color-text)' }}
                        >
                          {title}
                        </DialogTitle>
                      )}
                      {description && (
                        <p className="mt-1 text-sm" style={{ color: 'var(--color-textMuted)' }}>
                          {description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={onClose}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: 'var(--color-textMuted)' }}
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="p-6">
                {children}
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}

// Confirmation modal
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  isLoading,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="mb-6" style={{ color: 'var(--color-textMuted)' }}>{description}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="px-6 py-3 rounded-xl font-medium transition-all duration-300"
          style={{
            background: 'var(--color-surfaceHover)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-surfaceBorder)'
          }}
        >
          {cancelText}
        </button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onConfirm}
          disabled={isLoading}
          className="px-6 py-3 rounded-xl font-medium transition-all duration-300"
          style={{
            background: variant === 'danger' 
              ? 'var(--color-error)'
              : variant === 'warning'
              ? 'var(--color-warning)'
              : 'var(--color-primary)',
            color: 'white'
          }}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <motion.span
                className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              Processing...
            </span>
          ) : confirmText}
        </motion.button>
      </div>
    </Modal>
  );
}
