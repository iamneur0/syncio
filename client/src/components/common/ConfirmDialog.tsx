import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

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
  const { isDark, isMono } = useTheme()
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
        onCancel()
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
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className={`relative w-full max-w-md rounded-xl shadow-xl overflow-hidden animate-[fadeIn_120ms_ease-out] ${
          isDark ? 'bg-gray-800' : 'bg-white'
        }`}
      >
        <div className={`px-6 py-4 flex items-center gap-3 border-b ${
          isDark ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <div className={`${isDanger ? (isDark ? 'text-red-400' : 'text-red-600') : (isDark ? 'text-blue-400' : 'text-blue-600')}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 id="confirm-title" className={`text-base sm:text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
        </div>

        {hasDescription && (
          <div className="px-6 py-4">
            <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{description}</p>
          </div>
        )}

        <div className={`px-6 py-4`}>
          <div className="flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-3">
            <button
              autoFocus
              onClick={onCancel}
              className={`px-3 py-2 text-sm rounded-lg border-0 focus:outline-none focus:ring-0 ${
                isDark 
                  ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isDanger
                  ? (isDark ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500' : 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500')
                  : 'accent-bg accent-text hover:opacity-90 focus:ring-gray-500'
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
