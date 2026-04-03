'use client'

import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { invitationsAPI } from '@/services/api'
import { InvitePageLayout } from '../[inviteCode]/components/InvitePageLayout'
import { DeleteUserPage } from './components/DeleteAccountPage'

export default function DeleteUserRequestPage() {
  const [oauthLink, setOAuthLink] = useState<string | null>(null)
  const [oauthCode, setOAuthCode] = useState<string | null>(null)
  const [oauthExpiresAt, setOAuthExpiresAt] = useState<string | null>(null)
  const [oauthLinkGenerated, setOAuthLinkGenerated] = useState(false)
  const [oauthKeyVersion, setOAuthKeyVersion] = useState(0)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isError, setIsError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Generate Stremio OAuth link
  const generateOAuthMutation = useMutation({
    mutationFn: () => invitationsAPI.generateOAuth(),
    onSuccess: (data) => {
      setOAuthLink(data.oauthLink)
      setOAuthCode(data.oauthCode)
      const expiresAt = data.oauthExpiresAt instanceof Date
        ? data.oauthExpiresAt.toISOString()
        : data.oauthExpiresAt
      setOAuthExpiresAt(expiresAt)
      setOAuthLinkGenerated(true)
      setOAuthKeyVersion(prev => prev + 1)
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error || error?.message || 'Failed to generate OAuth link'
      toast.error(msg)
    }
  })

  // Delete user (Stremio via authKey, or Nuvio via nuvioUserId)
  const deleteUserMutation = useMutation({
    mutationFn: (params: { authKey?: string; nuvioData?: { nuvioUserId: string; refreshToken: string } }) =>
      invitationsAPI.deleteUser(params.authKey, params.nuvioData),
    onSuccess: () => {
      setIsSuccess(true)
      setIsError(false)
      toast.success('User deleted successfully')
    },
    onError: (error: any) => {
      setIsError(true)
      setIsSuccess(false)
      const message = error?.response?.data?.error || error?.message || 'Failed to delete user'
      setErrorMessage(message)
      toast.error(message)
    }
  })

  const handleGenerateOAuth = () => {
    generateOAuthMutation.mutate()
  }

  const handleOAuthAuthKey = async (authKey: string) => {
    try {
      await deleteUserMutation.mutateAsync({ authKey })
    } catch {}
  }

  const handleNuvioAuth = async (data: { nuvioUserId: string; refreshToken: string }) => {
    try {
      await deleteUserMutation.mutateAsync({ nuvioData: data })
    } catch {}
  }

  return (
    <InvitePageLayout showNewRequestButton={false} onNewRequest={() => {}}>
      <DeleteUserPage
        oauthLink={oauthLink}
        oauthCode={oauthCode}
        oauthExpiresAt={oauthExpiresAt}
        oauthLinkGenerated={oauthLinkGenerated}
        oauthKeyVersion={oauthKeyVersion}
        isGeneratingOAuth={generateOAuthMutation.isPending}
        isDeleting={deleteUserMutation.isPending}
        onGenerateOAuth={handleGenerateOAuth}
        onAuthKey={handleOAuthAuthKey}
        onNuvioAuth={handleNuvioAuth}
        isSuccess={isSuccess}
        isError={isError}
        errorMessage={errorMessage}
      />
    </InvitePageLayout>
  )
}
