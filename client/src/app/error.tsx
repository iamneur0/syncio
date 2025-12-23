'use client'

import React, { useEffect } from 'react'

type AppError = Error & { digest?: string }

export default function Error({ error, reset }: { error: AppError; reset: () => void }) {
  useEffect(() => {
    // Log full error details for debugging (visible in browser/devtools + server logs)
    // eslint-disable-next-line no-console
    console.error('[App Error Boundary]', {
      message: error?.message,
      stack: error?.stack,
      digest: (error as AppError)?.digest,
    })
  }, [error])

  const isDev = process.env.NODE_ENV !== 'production'

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <h2 className="text-2xl font-semibold mb-3">Something went wrong</h2>
        <p className="theme-text-3 mb-4">An unexpected error occurred. Please try again.</p>

        {isDev && (
          <div className="mb-4 text-left text-xs font-mono bg-black/40 rounded-md p-3 overflow-auto max-h-48">
            <div className="mb-1 font-semibold">Debug info (dev only):</div>
            <div className="mb-1">
              <span className="font-semibold">Message:</span>{' '}
              <span>{error?.message || 'n/a'}</span>
            </div>
            {(error as AppError)?.digest && (
              <div className="mb-1">
                <span className="font-semibold">Digest:</span>{' '}
                <span>{(error as AppError).digest}</span>
              </div>
            )}
            {error?.stack && (
              <pre className="mt-2 whitespace-pre-wrap text-[10px] leading-snug">
                {error.stack}
              </pre>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-md accent-bg accent-text hover:opacity-90"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-md border theme-border-3 theme-text-1 hover-accent"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}



