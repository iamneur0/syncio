import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  description?: string
  body?: React.ReactNode
  confirmText?: string
  cancelText?: string
  isDanger?: boolean
  onConfirm: () => void
  onCancel: (reason?: 'cancel' | 'escape' | 'backdrop') => void
}

export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  description = 'This action cannot be undone.',
  body,
  confirmText = 'Yes',
  cancelText = 'Cancel',
  isDanger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        onCancel('escape')
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any)
  }, [open, onCancel])

  if (!open) return null

  // Don't render until mounted
  if (!mounted) {
    return null
  }

  const hasDescription = Boolean(description && description.trim().length > 0)


  if (!mounted || typeof window === 'undefined' || !document.body) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => onCancel('backdrop')} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className={`relative w-full max-w-md rounded-xl shadow-xl overflow-hidden animate-[fadeIn_120ms_ease-out] card`}
      >
        <div className={`px-6 py-4 flex items-center gap-3 card-header`}>
          <div className={`${isDanger ? 'color-text' : 'color-text-secondary'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 id="confirm-title" className={`text-base sm:text-lg font-semibold`}>{title}</h3>
        </div>

        <div className="px-6 py-4">
          {body ? (
            body
          ) : (
            hasDescription && (
              <p className={`text-sm`}>{description}</p>
            )
          )}
        </div>

        <div className={`px-6 py-4`}>
          <div className="flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-3">
            <button
              autoFocus
              onClick={() => onCancel('cancel')}
              className={`px-3 py-2 text-sm rounded-lg border-0 focus:outline-none focus:ring-0 color-hover`}
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isDanger
                  ? 'color-surface color-text hover:opacity-90 focus:ring-offset-2'
                  : 'color-surface color-text hover:opacity-90 focus:ring-gray-500'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
