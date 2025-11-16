'use client'

import React from 'react'
import { Mail } from 'lucide-react'

interface RequestAccessFormProps {
  email: string
  username: string
  emailError: string | null
  usernameError: string | null
  isSubmitting: boolean
  onEmailChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onUsernameChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSubmit: (e: React.FormEvent) => void
}

export function RequestAccessForm({
  email,
  username,
  emailError,
  usernameError,
  isSubmitting,
  onEmailChange,
  onUsernameChange,
  onSubmit
}: RequestAccessFormProps) {
  return (
    <>
      <div className="text-center mb-8">
        <Mail className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--color-text)' }} />
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
          Request Access
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Enter your details to request access to this Syncio instance
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <input
            type="email"
            value={email}
            onChange={onEmailChange}
            placeholder="Email"
            required
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none input ${emailError ? 'border-red-500' : ''}`}
          />
          {emailError && (
            <p className="mt-1 text-sm text-red-500">{emailError}</p>
          )}
        </div>
        <div>
          <input
            type="text"
            value={username}
            onChange={onUsernameChange}
            placeholder="Username"
            required
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none input ${usernameError ? 'border-red-500' : ''}`}
          />
          {usernameError && (
            <p className="mt-1 text-sm text-red-500">{usernameError}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={isSubmitting || !!emailError || !!usernameError}
          className="w-full px-4 py-3 rounded-lg transition-colors disabled:opacity-50 color-surface hover:opacity-90"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>
    </>
  )
}

