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

  const handleSubmit = async () => {
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
    <div className="w-full space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        disabled={disabled || loading}
        className="w-full px-3 py-2 border rounded-lg focus:outline-none input"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        disabled={disabled || loading}
        className="w-full px-3 py-2 border rounded-lg focus:outline-none input"
      />
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || loading || !email || !password}
        className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Validating...' : startButtonLabel}
      </button>
    </div>
  )
}
