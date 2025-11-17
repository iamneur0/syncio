'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
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

  // Generate OAuth link
  const generateOAuthMutation = useMutation({
    mutationFn: () => invitationsAPI.generateOAuth(),
    onSuccess: (data) => {
      console.log('OAuth generation success:', data)
      setOAuthLink(data.oauthLink)
      setOAuthCode(data.oauthCode)
      // Convert Date to ISO string if needed
      const expiresAt = data.oauthExpiresAt instanceof Date 
        ? data.oauthExpiresAt.toISOString() 
        : data.oauthExpiresAt
      setOAuthExpiresAt(expiresAt)
      setOAuthLinkGenerated(true)
      setOAuthKeyVersion(prev => prev + 1)
    },
    onError: (error: any) => {
      console.error('OAuth generation error:', error)
      const errorMessage = error?.response?.data?.error || error?.response?.data?.details || error?.message || 'Failed to generate OAuth link'
      toast.error(errorMessage)
    }
  })

  // Delete user via OAuth
  const deleteUserMutation = useMutation({
    mutationFn: (authKey: string) => invitationsAPI.deleteUser(authKey),
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
      await deleteUserMutation.mutateAsync(authKey)
    } catch (error) {
      // Error already handled in mutation
    }
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
        isSuccess={isSuccess}
        isError={isError}
        errorMessage={errorMessage}
      />
    </InvitePageLayout>
  )
}

