'use client'

import React from 'react'

interface InvitePageLayoutProps {
  showNewRequestButton: boolean
  onNewRequest: () => void
  children: React.ReactNode
}

export function InvitePageLayout({ showNewRequestButton, onNewRequest, children }: InvitePageLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ background: 'var(--color-background)' }}>
      {showNewRequestButton && (
        <button
          onClick={onNewRequest}
          className="absolute top-4 right-4 px-4 py-2 rounded-lg transition-colors color-surface hover:opacity-90 text-sm font-medium"
          title="Start a new request"
        >
          New Request
        </button>
      )}
      <div className="max-w-md w-full">
        {children}
      </div>
    </div>
  )
}

