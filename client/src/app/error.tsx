'use client'

import React, { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log the error to an error reporting service if needed
    // console.error('App error:', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <h2 className="text-2xl font-semibold mb-3">Something went wrong</h2>
        <p className="theme-text-3 mb-6">An unexpected error occurred. Please try again.</p>
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



