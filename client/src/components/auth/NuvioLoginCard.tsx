'use client'
import { useState } from 'react'
import { nuvioAPI } from '@/services/api'

interface NuvioLoginCardProps {
  onAuth: (data: { email: string; nuvioUserId: string; nuvioPassword: string }) => void
  disabled?: boolean
  startButtonLabel?: string
}

export default function NuvioLoginCard({ onAuth, disabled = false, startButtonLabel = 'Sign in with Nuvio' }: NuvioLoginCardProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Email and password are required')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await nuvioAPI.validate({ email, password })
      if (result.valid && result.user) {
        onAuth({
          email: result.user.email,
          nuvioUserId: result.user.id,
          nuvioPassword: password
        })
      } else {
        setError(result.error || 'Invalid credentials')
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to validate credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Nuvio Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            disabled={disabled || loading}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Nuvio Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            disabled={disabled || loading}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
          />
        </div>
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
        <button
          type="submit"
          disabled={disabled || loading || !email || !password}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Validating...' : startButtonLabel}
        </button>
      </form>
    </div>
  )
}
