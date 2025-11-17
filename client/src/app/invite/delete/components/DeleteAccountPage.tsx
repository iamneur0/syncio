'use client'

import React from 'react'
import { Trash2, CheckCircle, XCircle } from 'lucide-react'
import { StremioOAuthCard } from '@/components/auth/StremioOAuthCard'

interface DeleteUserPageProps {
  oauthLink: string | null
  oauthCode: string | null
  oauthExpiresAt: string | null
  oauthLinkGenerated: boolean
  oauthKeyVersion: number
  isGeneratingOAuth: boolean
  isDeleting: boolean
  onGenerateOAuth: () => void
  onAuthKey: (authKey: string) => void
  isSuccess?: boolean
  isError?: boolean
  errorMessage?: string
}

export function DeleteUserPage({
  oauthLink,
  oauthCode,
  oauthExpiresAt,
  oauthLinkGenerated,
  oauthKeyVersion,
  isGeneratingOAuth,
  isDeleting,
  onGenerateOAuth,
  onAuthKey,
  isSuccess = false,
  isError = false,
  errorMessage
}: DeleteUserPageProps) {
  const isOAuthExpired = oauthExpiresAt && new Date(oauthExpiresAt) < new Date()
  const isOAuthValid = oauthExpiresAt && new Date(oauthExpiresAt) > new Date()

  if (isSuccess) {
    return (
      <>
        <div className="text-center mb-8">
          <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: '#10b981' }} />
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            User Deleted
          </h1>
        </div>
        <div className="p-4 rounded-lg border" style={{ borderColor: '#10b981' }}>
          <p className="text-sm mb-0" style={{ color: 'var(--color-text-secondary)' }}>
            Your Syncio user has been successfully deleted. You have been removed from all groups and your data has been cleared.
          </p>
        </div>
      </>
    )
  }

  if (isError) {
    return (
      <>
        <div className="text-center mb-8">
          <XCircle className="w-16 h-16 mx-auto mb-4" style={{ color: '#ef4444' }} />
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            Error
          </h1>
        </div>
        <div className="p-4 rounded-lg border" style={{ borderColor: '#ef4444' }}>
          <p className="text-sm mb-0" style={{ color: 'var(--color-text-secondary)' }}>
            {errorMessage || 'Failed to delete your user. Please try again or contact support.'}
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="text-center mb-8">
        <Trash2 className="w-16 h-16 mx-auto mb-4" style={{ color: '#ef4444' }} />
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
          Delete Your User
        </h1>
      </div>

      <div className="space-y-4">
        <div className="p-4 rounded-lg border" style={{ borderColor: '#ef4444' }}>
          <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            This action cannot be undone. Deleting your user will:
          </p>
          <ul className="text-sm list-disc list-inside space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
            <li>Remove you from all groups</li>
            <li>Clear all your Stremio addons</li>
          </ul>
        </div>

        {!oauthLinkGenerated && !oauthLink && !isGeneratingOAuth && (
          <button
            onClick={onGenerateOAuth}
            disabled={isGeneratingOAuth}
            className="w-full px-4 py-3 rounded-lg transition-colors disabled:opacity-50 text-white font-medium"
            style={{ backgroundColor: '#ef4444' }}
          >
            Connect to Stremio
          </button>
        )}

        {isGeneratingOAuth && !oauthLink && (
          <button
            disabled
            className="w-full px-4 py-3 rounded-lg transition-colors disabled:opacity-50 text-white font-medium"
            style={{ backgroundColor: '#ef4444' }}
          >
            Generating OAuth Link...
          </button>
        )}

        {(oauthLinkGenerated || oauthLink) && oauthLink && oauthCode && (
          <div className="p-4 rounded-lg border" style={{ borderColor: '#ef4444' }}>
            <StremioOAuthCard
              key={`oauth-${oauthLink || 'none'}-${oauthCode || 'none'}-${oauthKeyVersion}`}
              active={true}
              autoStart={!!oauthLink}
              onAuthKey={onAuthKey}
              disabled={isDeleting}
              showSubmitButton={false}
              withContainer={false}
              showStartButton={false}
              initialLink={oauthLink || null}
              initialCode={oauthCode || null}
              initialExpiresAt={oauthExpiresAt ? new Date(oauthExpiresAt).getTime() : null}
            />
          </div>
        )}
      </div>
    </>
  )
}

