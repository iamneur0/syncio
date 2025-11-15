'use client'

import React from 'react'
import { RefreshCw } from 'lucide-react'
import { StremioOAuthCard } from '@/components/auth/StremioOAuthCard'

interface RequestRenewedPageProps {
  oauthLink: string | null
  oauthCode: string | null
  oauthExpiresAt: string | null
  oauthLinkGenerated: boolean
  oauthKeyVersion: number
  isGeneratingOAuth: boolean
  isCompleting: boolean
  onGenerateOAuth: () => void
  onAuthKey: (authKey: string) => void
}

export function RequestRenewedPage({
  oauthLink,
  oauthCode,
  oauthExpiresAt,
  oauthLinkGenerated,
  oauthKeyVersion,
  isGeneratingOAuth,
  isCompleting,
  onGenerateOAuth,
  onAuthKey
}: RequestRenewedPageProps) {
  const isOAuthExpired = oauthExpiresAt && new Date(oauthExpiresAt) < new Date()
  const isOAuthValid = oauthExpiresAt && new Date(oauthExpiresAt) > new Date()

  return (
    <>
      <div className="text-center mb-8">
        <RefreshCw className="w-16 h-16 mx-auto mb-4" style={{ color: '#3b82f6' }} />
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
          Request Renewed!
        </h1>
      </div>

      <div className="space-y-4">
        <div className="p-4 rounded-lg border" style={{ borderColor: '#3b82f6' }}>
          <p className="text-sm mb-0" style={{ color: 'var(--color-text-secondary)' }}>
            Your request has been renewed. Click the button below to authenticate with Stremio and be added to Syncio.
          </p>
        </div>

        {!oauthLinkGenerated && !oauthLink && (
          <button
            onClick={onGenerateOAuth}
            disabled={isGeneratingOAuth}
            className="w-full px-4 py-3 rounded-lg transition-colors disabled:opacity-50 color-surface hover:opacity-90"
          >
            {isGeneratingOAuth ? 'Generating OAuth Link...' : 'Connect to Stremio'}
          </button>
        )}

        {(oauthLinkGenerated || oauthLink) && isOAuthValid && (
          <div className="p-4 rounded-lg border" style={{ borderColor: '#3b82f6' }}>
            <StremioOAuthCard
              key={`oauth-${oauthLink || 'none'}-${oauthCode || 'none'}-${oauthKeyVersion}`}
              active={true}
              autoStart={!!oauthLink}
              onAuthKey={onAuthKey}
              disabled={isCompleting}
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

