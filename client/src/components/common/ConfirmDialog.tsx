import React from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  isDanger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  description = 'This action cannot be undone.',
  confirmText = 'Yes',
  cancelText = 'Cancel',
  isDanger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any)
  }, [open, onCancel])

  if (!open) return null

  const hasDescription = Boolean(description && description.trim().length > 0)

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md rounded-xl shadow-xl bg-white dark:bg-gray-800 overflow-hidden animate-[fadeIn_120ms_ease-out]"
      >
        <div className={`px-6 py-4 flex items-center gap-3 border-b border-gray-200 dark:border-gray-700`}>
          <div className={`${isDanger ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 id="confirm-title" className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>

        {hasDescription && (
          <div className="px-6 py-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">{description}</p>
          </div>
        )}

        <div className={`px-6 py-4`}>
          <div className="flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-3">
            <button
              autoFocus
              onClick={onCancel}
              className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:focus:ring-gray-500"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isDanger
                  ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
                  : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
