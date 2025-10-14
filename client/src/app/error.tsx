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
        <p className="text-gray-500 mb-6">An unexpected error occurred. Please try again.</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-md bg-stremio-purple text-white hover:opacity-90"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}


