const express = require('express')
const crypto = require('crypto')
const { postDiscord } = require('../utils/notify')
const { validateStremioAuthKey } = require('../utils/stremio')
const { formatCodeBlock, formatRelativeTime, parseSyncConfig, getAppVersion } = require('../utils/webhookHelpers')

// generates a random invite code - 8 chars uppercase
function generateInviteCode() {
  return crypto.randomBytes(4).toString('base64url').substring(0, 8).toUpperCase()
}

module.exports = ({ prisma, getAccountId, AUTH_ENABLED, encrypt, decrypt, assignUserToGroup }) => {
  const router = express.Router()

  router.get('/', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) return res.status(401).json({ error: 'Unauthorized' })

      // fetch all invites with their requests, newest first
      const invitations = await prisma.invitation.findMany({
        where: { accountId },
        include: {
          requests: {
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      })

      res.json(invitations)
    } catch (error) {
      console.error('Error fetching invitations:', error)
      res.status(500).json({ error: 'Failed to fetch invitations' })
    }
  })

  router.post('/', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) return res.status(401).json({ error: 'Unauthorized' })

      const { maxUses, expiresAt, groupName, syncOnJoin, membershipDurationDays } = req.body

      // make sure code is unique
      let inviteCode
      let attempts = 0
      do {
        inviteCode = generateInviteCode()
        const exists = await prisma.invitation.findUnique({ where: { inviteCode } })
        if (!exists) break
        attempts++
        if (attempts > 10) return res.status(500).json({ error: 'Failed to generate unique invite code' })
      } while (true)

      const invitation = await prisma.invitation.create({
        data: {
          accountId,
          inviteCode,
          groupName: groupName || null,
          maxUses: maxUses || 1,
          currentUses: 0,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          membershipDurationDays:
            typeof membershipDurationDays === 'number' && !Number.isNaN(membershipDurationDays)
              ? Number(membershipDurationDays)
              : null,
          isActive: true,
          syncOnJoin: syncOnJoin === true
        }
      })

      // discord webhook
      try {
        const account = await prisma.appAccount.findUnique({
          where: { id: accountId },
          select: { sync: true }
        })
        const syncCfg = parseSyncConfig(account?.sync)
        const webhookUrl = syncCfg?.webhookUrl
        if (webhookUrl) {
          // build the invite link
          const originHeader = (req.headers?.origin || '').trim()
          const hostHeader = req.get('host')
          const protocolHost = hostHeader ? `${req.protocol}://${hostHeader}` : ''
          const baseUrl = (originHeader || protocolHost || '').replace(/\/$/, '')
          const inviteLink = baseUrl ? `${baseUrl}/invite/${invitation.inviteCode}` : `/invite/${invitation.inviteCode}`

          const relativeExpiry = formatRelativeTime(invitation.expiresAt)
          let descriptionText
          if (relativeExpiry) {
            descriptionText = `An invitation has been created${invitation.groupName ? ` for **${invitation.groupName}**` : ''} and expires ${relativeExpiry}.`
          } else {
            descriptionText = `An invitation has been created${invitation.groupName ? ` for **${invitation.groupName}**` : ''} with no expiration.`
          }

          const embed = {
            title: 'New Invitation Created',
            description: descriptionText,
            color: 0x3b82f6,
            fields: [
              { name: 'Invite Code', value: formatCodeBlock(invitation.inviteCode), inline: true },
              { name: 'Group', value: formatCodeBlock(invitation.groupName || 'No group'), inline: true },
              { name: 'Uses', value: formatCodeBlock(invitation.maxUses?.toString() || 'Unlimited'), inline: true },
              { name: 'Invite Link', value: formatCodeBlock(inviteLink), inline: false }
            ],
            timestamp: (invitation.createdAt || new Date()).toISOString()
          }

          const appVersion = getAppVersion()
          if (appVersion) {
            embed.footer = { text: `Syncio v${appVersion}` }
          }

          await postDiscord(webhookUrl, null, {
            embeds: [embed],
            avatar_url: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png'
          })
        }
      } catch (webhookError) {
        console.error('Failed to send invitation webhook:', webhookError)
      }

      res.json(invitation)
    } catch (error) {
      console.error('Error creating invitation:', error)
      res.status(500).json({ error: 'Failed to create invitation' })
    }
  })

  router.patch('/:id/toggle-status', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) return res.status(401).json({ error: 'Unauthorized' })

      const { id } = req.params
      const { isActive } = req.body

      const invitation = await prisma.invitation.findFirst({ where: { id, accountId } })
      if (!invitation) return res.status(404).json({ error: 'Invitation not found' })
 
      const updated = await prisma.invitation.update({
        where: { id },
        data: { isActive: isActive },
        include: {
          requests: {
            orderBy: { createdAt: 'desc' }
          }
        }
      })

      res.json(updated)
    } catch (error) {
      console.error('Error toggling invitation status:', error)
      res.status(500).json({ error: 'Failed to toggle invitation status' })
    }
  })

  router.patch('/:id', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) return res.status(401).json({ error: 'Unauthorized' })

      const { id } = req.params
      const { groupName, syncOnJoin, expiresAt, membershipDurationDays, createdAt } = req.body

      const invitation = await prisma.invitation.findFirst({ where: { id, accountId } })
      if (!invitation) return res.status(404).json({ error: 'Invitation not found' })

      const updateData = {}
      if (groupName !== undefined) updateData.groupName = groupName || null
      if (syncOnJoin !== undefined) updateData.syncOnJoin = syncOnJoin === true
      if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null
      if (membershipDurationDays !== undefined) {
        updateData.membershipDurationDays =
          membershipDurationDays === null || Number.isNaN(Number(membershipDurationDays))
            ? null
            : Number(membershipDurationDays)
      }
      if (createdAt !== undefined) updateData.createdAt = createdAt ? new Date(createdAt) : invitation.createdAt

      const updated = await prisma.invitation.update({
        where: { id },
        data: updateData,
        include: {
          requests: {
            orderBy: { createdAt: 'desc' }
          }
        }
      })

      res.json(updated)
    } catch (error) {
      console.error('Error updating invitation:', error)
      res.status(500).json({ error: 'Failed to update invitation' })
    }
  })

  router.delete('/:id', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) return res.status(401).json({ error: 'Unauthorized' })

      const { id } = req.params
      const invitation = await prisma.invitation.findFirst({ where: { id, accountId } })
      if (!invitation) return res.status(404).json({ error: 'Invitation not found' })

      await prisma.invitation.delete({
        where: { id }
      })

      res.json({ message: 'Invitation deleted successfully' })
    } catch (error) {
      console.error('Error deleting invitation:', error)
      res.status(500).json({ error: 'Failed to delete invitation' })
    }
  })

  router.get('/:id/requests', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) return res.status(401).json({ error: 'Unauthorized' })

      const { id } = req.params
      const invitation = await prisma.invitation.findFirst({ where: { id, accountId } })
      if (!invitation) return res.status(404).json({ error: 'Invitation not found' })

      const requests = await prisma.inviteRequest.findMany({
        where: { invitationId: id },
        orderBy: { createdAt: 'desc' }
      })

      res.json(requests)
    } catch (error) {
      console.error('Error fetching requests:', error)
      res.status(500).json({ error: 'Failed to fetch requests' })
    }
  })

  router.get('/:id', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) return res.status(401).json({ error: 'Unauthorized' })

      const { id } = req.params

      const invitation = await prisma.invitation.findFirst({
        where: { id, accountId },
        include: {
          requests: {
            orderBy: { createdAt: 'desc' }
          }
        }
      })

      if (!invitation) return res.status(404).json({ error: 'Invitation not found' })

      res.json(invitation)
    } catch (error) {
      console.error('Error fetching invitation:', error)
      res.status(500).json({ error: 'Failed to fetch invitation' })
    }
  })

  router.post('/requests/:requestId/accept', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) return res.status(401).json({ error: 'Unauthorized' })

      const { requestId } = req.params
      const { groupName } = req.body

      const request = await prisma.inviteRequest.findUnique({
        where: { id: requestId },
        include: { invitation: true }
      })

      if (!request) return res.status(404).json({ error: 'Request not found' })
      if (request.invitation.accountId !== accountId) return res.status(403).json({ error: 'Forbidden' })

      // validate the invite is still usable
      if (!request.invitation.isActive) {
        return res.status(400).json({ error: 'Invitation is not active' })
      }
      if (request.invitation.expiresAt && new Date(request.invitation.expiresAt) < new Date()) {
        return res.status(400).json({ error: 'Invitation has expired' })
      }
      if (request.invitation.currentUses >= request.invitation.maxUses) {
        return res.status(400).json({ error: 'Invitation has reached maximum uses' })
      }

      // prefer groupName from body, then from invite, else null
      const finalGroupName = groupName || request.invitation.groupName || null

      const updatedRequest = await prisma.inviteRequest.update({
        where: { id: requestId },
        data: {
          status: 'accepted',
          groupName: finalGroupName,
          respondedAt: new Date(),
          respondedBy: accountId
        }
      })

      res.json(updatedRequest)
    } catch (error) {
      console.error('Error accepting request:', error)
      res.status(500).json({ error: 'Failed to accept request' })
    }
  })

  router.post('/requests/:requestId/reject', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) return res.status(401).json({ error: 'Unauthorized' })

      const { requestId } = req.params
      const request = await prisma.inviteRequest.findUnique({
        where: { id: requestId },
        include: { invitation: true }
      })

      if (!request) return res.status(404).json({ error: 'Request not found' })
      if (request.invitation.accountId !== accountId) return res.status(403).json({ error: 'Forbidden' })

      const updatedRequest = await prisma.inviteRequest.update({
        where: { id: requestId },
        data: {
          status: 'rejected',
          respondedAt: new Date(),
          respondedBy: accountId
        }
      })

      res.json(updatedRequest)
    } catch (error) {
      console.error('Error rejecting request:', error)
      res.status(500).json({ error: 'Failed to reject request' })
    }
  })

  // undo rejection - basically just accept it
  router.post('/requests/:requestId/undo-rejection', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) return res.status(401).json({ error: 'Unauthorized' })

      const { requestId } = req.params
      const { groupName } = req.body

      const request = await prisma.inviteRequest.findUnique({
        where: { id: requestId },
        include: { invitation: true }
      })

      if (!request) return res.status(404).json({ error: 'Request not found' })
      if (request.invitation.accountId !== accountId) return res.status(403).json({ error: 'Forbidden' })
      if (request.status !== 'rejected') return res.status(400).json({ error: 'Request is not rejected' })

      // make sure invite is still valid
      if (!request.invitation.isActive) return res.status(400).json({ error: 'Invitation is not active' })
      if (request.invitation.expiresAt && new Date(request.invitation.expiresAt) < new Date()) {
        return res.status(400).json({ error: 'Invitation has expired' })
      }
      if (request.invitation.maxUses != null && request.invitation.currentUses >= request.invitation.maxUses) {
        return res.status(400).json({ error: 'Invitation has reached maximum uses' })
      }

      const finalGroupName = groupName || request.invitation.groupName || null

      const updatedRequest = await prisma.inviteRequest.update({
        where: { id: requestId },
        data: {
          status: 'accepted',
          groupName: finalGroupName,
          respondedAt: new Date(),
          respondedBy: accountId
        }
      })

      res.json(updatedRequest)
    } catch (error) {
      console.error('Error undoing rejection:', error)
      res.status(500).json({ error: 'Failed to undo rejection' })
    }
  })

  // clear oauth link so user can generate a new one
  router.post('/requests/:requestId/clear-oauth', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) return res.status(401).json({ error: 'Unauthorized' })

      const { requestId } = req.params
      const request = await prisma.inviteRequest.findUnique({
        where: { id: requestId },
        include: { invitation: true }
      })

      if (!request) return res.status(404).json({ error: 'Request not found' })
      if (request.invitation.accountId !== accountId) return res.status(403).json({ error: 'Forbidden' })
      // Allow clearing OAuth for accepted requests (or expired ones that were accepted)
      if (request.status !== 'accepted' && request.status !== 'completed') {
        return res.status(400).json({ error: 'Request must be accepted to clear OAuth link' })
      }

      const updatedRequest = await prisma.inviteRequest.update({
        where: { id: requestId },
        data: {
          oauthCode: null,
          oauthLink: null,
          oauthExpiresAt: null,
          status: 'accepted' // Reset to accepted so user can generate new OAuth link
        }
      })

      res.json(updatedRequest)
    } catch (error) {
      console.error('Error clearing OAuth link:', error)
      res.status(500).json({ error: 'Failed to clear OAuth link' })
    }
  })

  // delete an invitation request
  router.delete('/requests/:requestId', async (req, res) => {
    try {
      const accountId = getAccountId(req)
      if (!accountId) return res.status(401).json({ error: 'Unauthorized' })

      const { requestId } = req.params
      const request = await prisma.inviteRequest.findUnique({
        where: { id: requestId },
        include: { invitation: true }
      })

      if (!request) return res.status(404).json({ error: 'Request not found' })
      if (request.invitation.accountId !== accountId) return res.status(403).json({ error: 'Forbidden' })

      // Only allow deletion for rejected or accepted requests (not completed or pending)
      if (request.status === 'completed') {
        return res.status(400).json({ error: 'Cannot delete completed requests' })
      }
      if (request.status === 'pending') {
        return res.status(400).json({ error: 'Cannot delete pending requests. Reject them instead.' })
      }

      // Delete the request
      await prisma.inviteRequest.delete({
        where: { id: requestId }
      })

      res.json({ message: 'Request deleted successfully' })
    } catch (error) {
      console.error('Error deleting request:', error)
      res.status(500).json({ error: 'Failed to delete request' })
    }
  })

  return router
}

// Helper function to get Stremio user info from authKey
async function getStremioUserInfo(authKey, username, email) {
  const { validateStremioAuthKey } = require('../utils/stremio')
  
  let verifiedUser = null
  try {
    const validation = await validateStremioAuthKey(authKey)
    verifiedUser = validation && validation.user ? validation.user : null
  } catch (e) {
    const msg = (e && (e.message || e.error || '')) || ''
    const code = (e && e.code) || 0
    if (code === 1 || /session does not exist/i.test(String(msg))) {
      throw new Error('Invalid or expired Stremio auth key')
    }
    throw new Error('Could not validate auth key')
  }

  const normalizedEmail = (verifiedUser?.email || email || '').toLowerCase()
  const requestedUsername = typeof username === 'string' ? username.trim() : ''
  const emailPart = normalizedEmail ? normalizedEmail.split('@')[0] : ''
  let baseUsername = (requestedUsername || verifiedUser?.username || emailPart || `user_${Math.random().toString(36).slice(2, 8)}`).trim()
  if (!baseUsername) {
    baseUsername = `user_${Math.random().toString(36).slice(2, 8)}`
  }
  const finalUsername = baseUsername

  return {
    username: finalUsername,
    email: normalizedEmail
  }
}

// Public invite routes (no auth required)
// These routes are mounted at /invite/:inviteCode/*
module.exports.createPublicRouter = ({ prisma, encrypt, assignUserToGroup, decrypt }) => {
  const publicRouter = express.Router()

  // Generate OAuth link for account deletion (public endpoint, no invite code needed)
  // MUST be defined BEFORE /:inviteCode routes to avoid route conflicts
  publicRouter.post('/generate-oauth', async (req, res) => {
    try {
      // Always generate fresh oauth link
      let oauthCode = null
      let oauthLink = null
      let oauthExpiresAt = null

      try {
        const host = req.headers.host || req.headers.origin || 'syncio.local'
        
        const stremioResponse = await fetch('https://link.stremio.com/api/v2/create?type=Create', {
          headers: {
            'X-Requested-With': host,
          },
        })
        
        if (stremioResponse.ok) {
          const stremioData = await stremioResponse.json()
          const result = stremioData?.result
          if (result?.success && result?.code && result?.link) {
            oauthCode = result.code
            oauthLink = result.link
            // 5 min expiry - convert to ISO string for JSON serialization
            oauthExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
          } else {
            return res.status(500).json({ 
              error: 'Failed to generate OAuth link - Stremio API returned invalid response',
              details: stremioData?.error?.message || 'Missing code or link in response'
            })
          }
        } else {
          const errorText = await stremioResponse.text()
          return res.status(500).json({ 
            error: 'Failed to generate OAuth link from Stremio',
            details: `HTTP ${stremioResponse.status}: ${errorText}`
          })
        }
      } catch (error) {
        return res.status(500).json({ 
          error: 'Failed to generate OAuth link',
          details: error?.message || 'Unknown error'
        })
      }

      res.setHeader('Content-Type', 'application/json')
      res.json({
        oauthLink,
        oauthCode,
        oauthExpiresAt
      })
    } catch (error) {
      console.error('Error in generate-oauth:', error)
      res.setHeader('Content-Type', 'application/json')
      res.status(500).json({ error: 'Failed to generate OAuth link' })
    }
  })

  // Delete user via OAuth (public endpoint for opt-out)
  // MUST be defined BEFORE /:inviteCode routes to avoid route conflicts
  // Using /delete-user to avoid conflict with /invite/delete page route
  publicRouter.post('/delete-user', async (req, res) => {
    try {
      const { authKey } = req.body

      if (!authKey) {
        res.setHeader('Content-Type', 'application/json')
        return res.status(400).json({ error: 'authKey is required' })
      }

      // Validate authKey and get email
      const { validateStremioAuthKey } = require('../utils/stremio')
      let stremioEmail = null
      try {
        const validation = await validateStremioAuthKey(authKey)
        if (validation && validation.user && validation.user.email) {
          stremioEmail = validation.user.email.toLowerCase().trim()
        }
      } catch (e) {
        const msg = (e && (e.message || e.error || '')) || ''
        const code = (e && e.code) || 0
        res.setHeader('Content-Type', 'application/json')
        if (code === 1 || /session does not exist/i.test(String(msg))) {
          return res.status(401).json({ error: 'Invalid or expired Stremio auth key' })
        }
        return res.status(400).json({ error: 'Could not validate auth key' })
      }

      if (!stremioEmail) {
        res.setHeader('Content-Type', 'application/json')
        return res.status(400).json({ error: 'Could not retrieve email from Stremio account' })
      }

      // Clear Stremio addons using the OAuth-provided authKey (current valid session)
      // Do this BEFORE finding/deleting users so we have a valid session
      let addonsCleared = false
      try {
        const { StremioAPIClient } = require('stremio-api-client')
        // Use the authKey from OAuth (current valid session) to clear addons
        // The authKey from OAuth is already plain text, no decryption needed
        console.log(`🔄 Attempting to clear Stremio addons for email: ${stremioEmail}`)
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKey })
        
        // Clear addons
        await apiClient.request('addonCollectionSet', { addons: [] })
        
        // Verify addons were cleared
        const verifyResult = await apiClient.request('addonCollectionGet', {})
        const remainingAddons = verifyResult?.addons || []
        if (Array.isArray(remainingAddons) && remainingAddons.length === 0) {
          addonsCleared = true
          console.log(`✅ Successfully cleared Stremio addons for email: ${stremioEmail}`)
        } else {
          console.warn(`⚠️  Addons may not have been fully cleared. Remaining: ${remainingAddons.length}`)
        }
      } catch (e) {
        console.error('❌ Failed to clear Stremio addons during user deletion:', {
          message: e.message,
          stack: e.stack,
          error: e,
          authKeyLength: authKey ? authKey.length : 0
        })
        // Continue with deletion even if addon clearing fails
        // But log the full error so we can debug
      }

      // Find ALL users with this email (check all accounts since this is a public endpoint)
      const users = await prisma.user.findMany({
        where: {
          email: stremioEmail
        }
      })

      if (users.length === 0) {
        res.setHeader('Content-Type', 'application/json')
        return res.status(404).json({ error: 'No user found with this email address' })
      }

      // For each user, remove them from all groups and delete them
      for (const user of users) {
        // Get all groups that contain this user
        const groups = await prisma.group.findMany({
          where: {
            userIds: {
              contains: user.id
            }
          }
        })

        // Remove user from all groups
        for (const group of groups) {
          const userIds = group.userIds ? JSON.parse(group.userIds) : []
          const updatedUserIds = userIds.filter((id) => id !== user.id)
          await prisma.group.update({
            where: { id: group.id },
            data: { userIds: JSON.stringify(updatedUserIds) }
          })
        }

        // Delete the user
        await prisma.user.delete({
          where: { id: user.id }
        })

        console.log(`✅ Deleted user via opt-out: ${user.email} (${user.id})`)
      }

      res.setHeader('Content-Type', 'application/json')
      res.json({
        message: 'User deleted successfully',
        success: true
      })
    } catch (error) {
      console.error('Error deleting user:', error)
      res.setHeader('Content-Type', 'application/json')
      res.status(500).json({ error: 'Failed to delete user' })
    }
  })

  publicRouter.get('/:inviteCode/check', async (req, res) => {
    try {
      const { inviteCode } = req.params
      const invitation = await prisma.invitation.findUnique({
        where: { inviteCode }
      })

      if (!invitation) return res.status(404).json({ error: 'Invitation not found' })

      res.json({
        isActive: invitation.isActive,
        expiresAt: invitation.expiresAt,
        currentUses: invitation.currentUses,
        maxUses: invitation.maxUses
      })
    } catch (error) {
      console.error('Error checking invitation:', error)
      res.status(500).json({ error: 'Failed to check invitation' })
    }
  })

  publicRouter.post('/:inviteCode/request', async (req, res) => {
    try {
      const { inviteCode } = req.params
      const { email, username } = req.body

      if (!email || !username) {
        return res.status(400).json({ error: 'Email and username are required' })
      }

      const invitation = await prisma.invitation.findUnique({
        where: { inviteCode }
      })

      if (!invitation) return res.status(404).json({ error: 'Invitation not found' })
      if (!invitation.isActive) return res.status(400).json({ error: 'Invitation is not active' })
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        return res.status(400).json({ error: 'Invitation has expired' })
      }
      if (invitation.currentUses >= invitation.maxUses) {
        return res.status(400).json({ error: 'Invitation has reached maximum uses' })
      }

      // check if user already exists (by email or username)
      const existingUserByEmail = await prisma.user.findFirst({
        where: {
          accountId: invitation.accountId,
          email: email.trim().toLowerCase()
        }
      })

      const existingUserByUsername = await prisma.user.findFirst({
        where: {
          accountId: invitation.accountId,
          username: username.trim()
        }
      })

      if (existingUserByEmail && existingUserByUsername) {
        return res.status(409).json({ error: 'EMAIL_AND_USERNAME_EXIST', message: 'Both email and username are already registered' })
      }
      if (existingUserByEmail) {
        return res.status(409).json({ error: 'EMAIL_EXISTS', message: 'This email is already registered' })
      }
      if (existingUserByUsername) {
        return res.status(409).json({ error: 'USERNAME_EXISTS', message: 'This username is already taken' })
      }

      // check for duplicate requests (any status)
      const existingRequest = await prisma.inviteRequest.findFirst({
        where: {
          invitationId: invitation.id,
          email: email.trim().toLowerCase(),
          username: username.trim()
        },
        orderBy: { createdAt: 'desc' }
      })

      if (existingRequest) {
        return res.status(409).json({ 
          error: 'A request already exists for this email and username',
          status: existingRequest.status
        })
      }

      const request = await prisma.inviteRequest.create({
        data: {
          invitationId: invitation.id,
          accountId: invitation.accountId,
          email: email.trim().toLowerCase(),
          username: username.trim(),
          status: 'pending'
        }
      })

      res.json(request)
    } catch (error) {
      console.error('Error submitting invite request:', error)
      res.status(500).json({ error: 'Failed to submit request' })
    }
  })

  publicRouter.get('/:inviteCode/status', async (req, res) => {
    try {
      const { inviteCode } = req.params
      const { email, username } = req.query

      if (!email || !username) {
        return res.status(400).json({ error: 'Email and username are required' })
      }

      const invitation = await prisma.invitation.findUnique({
        where: { inviteCode }
      })

      if (!invitation) return res.status(404).json({ error: 'Invitation not found' })

      // get most recent request
      const request = await prisma.inviteRequest.findFirst({
        where: {
          invitationId: invitation.id,
          email: email.trim().toLowerCase(),
          username: username.trim()
        },
        include: {
          invitation: true
        },
        orderBy: { createdAt: 'desc' }
      })

      if (!request) return res.status(404).json({ error: 'Request not found' })

      // allow checking completed requests even if invite is disabled
      if (!invitation.isActive && request.status !== 'completed') {
        return res.status(400).json({ error: 'Invitation is not active' })
      }

      // check oauth validity
      let oauthValid = false
      if (request.status === 'accepted' && request.oauthLink && request.oauthExpiresAt) {
        oauthValid = new Date(request.oauthExpiresAt) > new Date()
      }

      res.json({
        status: request.status,
        oauthCode: oauthValid ? request.oauthCode : null,
        oauthLink: oauthValid ? request.oauthLink : null,
        oauthExpiresAt: request.oauthExpiresAt,
        groupName: request.groupName || request.invitation.groupName || null,
        createdAt: request.createdAt,
        hasOAuthLink: !!request.oauthLink
      })
    } catch (error) {
      console.error('Error checking request status:', error)
      res.status(500).json({ error: 'Failed to check request status' })
    }
  })

  publicRouter.post('/:inviteCode/generate-oauth', async (req, res) => {
    try {
      const { inviteCode } = req.params
      const { email, username } = req.body

      if (!email || !username) {
        return res.status(400).json({ error: 'Email and username are required' })
      }

      const invitation = await prisma.invitation.findUnique({
        where: { inviteCode }
      })

      if (!invitation) return res.status(404).json({ error: 'Invitation not found' })
      if (!invitation.isActive) return res.status(400).json({ error: 'Invitation is not active' })

      const request = await prisma.inviteRequest.findFirst({
        where: {
          invitationId: invitation.id,
          email: email.trim().toLowerCase(),
          username: username.trim(),
          status: 'accepted'
        },
        orderBy: { createdAt: 'desc' }
      })

      if (!request) return res.status(404).json({ error: 'No accepted request found' })

      // always generate fresh oauth link
      let oauthCode = null
      let oauthLink = null
      let oauthExpiresAt = null

      try {
        const host = req.headers.host || req.headers.origin || 'syncio.local'
        
        const stremioResponse = await fetch('https://link.stremio.com/api/v2/create?type=Create', {
          headers: {
            'X-Requested-With': host,
          },
        })
        
        if (stremioResponse.ok) {
          const stremioData = await stremioResponse.json()
          const result = stremioData?.result
          if (result?.success && result?.code && result?.link) {
            oauthCode = result.code
            oauthLink = result.link
            // 5 min expiry
            oauthExpiresAt = new Date(Date.now() + 5 * 60 * 1000)
          } else {
            return res.status(500).json({ 
              error: 'Failed to generate OAuth link - Stremio API returned invalid response',
              details: stremioData?.error?.message || 'Missing code or link in response'
            })
          }
        } else {
          const errorText = await stremioResponse.text()
          return res.status(500).json({ 
            error: 'Failed to generate OAuth link from Stremio',
            details: `HTTP ${stremioResponse.status}: ${errorText}`
          })
        }
      } catch (error) {
        return res.status(500).json({ 
          error: 'Failed to generate OAuth link',
          details: error?.message || 'Unknown error'
        })
      }

      await prisma.inviteRequest.update({
        where: { id: request.id },
        data: {
          oauthCode,
          oauthLink,
          oauthExpiresAt
        }
      })

      res.json({
        oauthCode,
        oauthLink,
        oauthExpiresAt
      })
    } catch (error) {
      console.error('Error generating OAuth link:', error)
      res.status(500).json({ error: 'Failed to generate OAuth link' })
    }
  })

  publicRouter.post('/:inviteCode/complete', async (req, res) => {
    try {
      const { inviteCode } = req.params
      const { email, username, authKey, groupName } = req.body

      if (!email || !username || !authKey) {
        return res.status(400).json({ error: 'Email, username, and authKey are required' })
      }

      const invitation = await prisma.invitation.findUnique({
        where: { inviteCode }
      })

      if (!invitation) return res.status(404).json({ error: 'Invitation not found' })
      if (!invitation.isActive) return res.status(400).json({ error: 'Invitation is not active' })

      // find the accepted request - try exact match first
      let request = await prisma.inviteRequest.findFirst({
        where: {
          invitationId: invitation.id,
          email: email.trim().toLowerCase(),
          username: username.trim(),
          status: 'accepted'
        },
        orderBy: { createdAt: 'desc' }
      })

      // if not found, do a more lenient search (handles edge cases)
      if (!request) {
        const allRequests = await prisma.inviteRequest.findMany({
          where: {
            invitationId: invitation.id,
            status: 'accepted'
          },
          orderBy: { createdAt: 'desc' }
        })
        
        request = allRequests.find(r => 
          r.email.toLowerCase() === email.trim().toLowerCase() &&
          r.username.trim() === username.trim()
        ) || null
      }

      if (!request) {
        // maybe it's already completed? check that too
        let completedRequest = await prisma.inviteRequest.findFirst({
          where: {
            invitationId: invitation.id,
            email: email.trim().toLowerCase(),
            username: username.trim(),
            status: 'completed'
          },
          orderBy: { createdAt: 'desc' }
        })
        
        if (!completedRequest) {
          const allCompletedRequests = await prisma.inviteRequest.findMany({
            where: {
              invitationId: invitation.id,
              status: 'completed'
            },
            orderBy: { createdAt: 'desc' }
          })
          
          completedRequest = allCompletedRequests.find(r => 
            r.email.toLowerCase() === email.trim().toLowerCase() &&
            r.username.trim() === username.trim()
          ) || null
        }
        
        if (completedRequest) {
          // already done, just return success
          return res.json({
            status: 'completed',
            message: 'User already created'
          })
        }
        
        return res.status(404).json({ error: 'No accepted request found' })
      }

      // group name priority: body > request > invitation > null
      const finalGroupName = groupName || request.groupName || invitation.groupName || null

      // validate the stremio auth key and get email - this is required
      let stremioEmail = null
      try {
        const validation = await validateStremioAuthKey(authKey)
        if (validation && validation.user && validation.user.email) {
          stremioEmail = validation.user.email.toLowerCase().trim()
        }
      } catch (error) {
        console.error('Failed to validate Stremio auth key:', error)
        return res.status(400).json({ 
          error: 'INVALID_AUTH_KEY',
          message: 'Could not validate Stremio authentication. Please try again.'
        })
      }

      if (!stremioEmail) {
        return res.status(400).json({ 
          error: 'EMAIL_NOT_AVAILABLE',
          message: 'Could not retrieve email from Stremio account. Please try again.'
        })
      }

      // emails must match exactly
      const requestEmail = request.email.toLowerCase().trim()
      if (stremioEmail !== requestEmail) {
        // Send Discord webhook for email mismatch if configured
        try {
          const account = await prisma.appAccount.findUnique({
            where: { id: invitation.accountId },
            select: { sync: true }
          })

          const syncCfg = parseSyncConfig(account?.sync)
          const webhookUrl = syncCfg?.webhookUrl
          if (webhookUrl) {
            const embed = {
              title: `User ${request.username} used different emails`,
              description: `The user has used different emails for the Stremio account and its request.`,
              color: 0xef4444, // Red color for error
              fields: [
                { name: 'Username', value: formatCodeBlock(request.username), inline: true },
                { name: 'Invite Code', value: formatCodeBlock(invitation.inviteCode), inline: true },
                { name: 'Group', value: formatCodeBlock(request.groupName || invitation.groupName || 'No group'), inline: true },
                { name: 'Request Email', value: formatCodeBlock(request.email), inline: true },
                { name: 'Stremio Email', value: formatCodeBlock(stremioEmail), inline: true }
              ],
              timestamp: new Date().toISOString()
            }

            const appVersion = getAppVersion()
            if (appVersion) {
              embed.footer = { text: `Syncio v${appVersion}` }
            }

            await postDiscord(webhookUrl, null, {
              embeds: [embed],
              avatar_url: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png'
            })
          }
        } catch (webhookError) {
          console.error('Failed to send email mismatch webhook:', webhookError)
        }
        
        return res.status(400).json({ 
          error: 'EMAIL_MISMATCH',
          message: 'The Stremio account email does not match the email used in your request'
        })
      }

      // check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          accountId: invitation.accountId,
          email: email.trim().toLowerCase()
        }
      })

      if (existingUser) {
        // mark request as rejected since user already exists
        await prisma.inviteRequest.update({
          where: { id: request.id },
          data: { status: 'rejected' }
        })
        return res.status(409).json({ error: 'User is already registered to Syncio' })
      }

      // encrypt and create the user
      const encryptedAuthKey = encrypt(authKey, { appAccountId: invitation.accountId })

      let computedExpiresAt = null
      const now = new Date()
      const durationRaw = invitation.membershipDurationDays
      if (durationRaw != null && !Number.isNaN(durationRaw)) {
        const days = Number(durationRaw)
        const debugMode =
          process.env.DEBUG === 'true' ||
          process.env.DEBUG === '1' ||
          process.env.NEXT_PUBLIC_DEBUG === 'true' ||
          process.env.NEXT_PUBLIC_DEBUG === '1'

        if (debugMode && days === -1) {
          // Special-case debug: 1 minute membership
          computedExpiresAt = new Date(now.getTime() + 60 * 1000)
        } else if (days > 0) {
          computedExpiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
        }
      }

      const newUser = await prisma.user.create({
        data: {
          accountId: invitation.accountId,
          email: email.trim().toLowerCase(),
          username: username.trim(),
          stremioAuthKey: encryptedAuthKey,
          isActive: true,
          expiresAt: computedExpiresAt,
          inviteCode: invitation.inviteCode
        }
      })

      // assign to group if we have one
      if (finalGroupName) {
        try {
          const group = await prisma.group.findFirst({
            where: {
              accountId: invitation.accountId,
              name: finalGroupName
            }
          })
          if (group) {
            // Create a wrapper that binds prisma to assignUserToGroup
            // assignUserToGroup expects prisma in scope, so we need to call it with prisma bound
            const assignUserToGroupWithPrisma = async (userId, groupId, req) => {
              // Temporarily set prisma in the function's scope by creating a bound version
              // Since assignUserToGroup uses prisma directly, we need to ensure it's available
              const { assignUserToGroup: originalAssign } = require('../utils/helpers/database')
              // The function uses prisma from closure, but we need to pass it
              // Actually, let's manually do the assignment since we have prisma here
              const accId = invitation.accountId
              
              // Remove user from all other groups
              const allGroups = await prisma.group.findMany({
                where: { accountId: accId },
                select: { id: true, userIds: true }
              })
              
              for (const g of allGroups) {
                if (g.userIds) {
                  const userIds = JSON.parse(g.userIds)
                  const updatedUserIds = userIds.filter(id => id !== userId)
                  if (updatedUserIds.length !== userIds.length) {
                    await prisma.group.update({
                      where: { id: g.id },
                      data: { userIds: JSON.stringify(updatedUserIds) }
                    })
                  }
                }
              }
              
              // Add user to target group
              const targetGroup = await prisma.group.findUnique({
                where: { id: groupId, accountId: accId },
                select: { id: true, userIds: true }
              })
              
              if (!targetGroup) {
                throw new Error(`Target group not found: ${groupId}`)
              }
              
              const currentUserIds = targetGroup.userIds ? JSON.parse(targetGroup.userIds) : []
              if (!currentUserIds.includes(userId)) {
                currentUserIds.push(userId)
                await prisma.group.update({
                  where: { id: groupId },
                  data: { userIds: JSON.stringify(currentUserIds) }
                })
              }
            }
            
            await assignUserToGroupWithPrisma(newUser.id, group.id, { appAccountId: invitation.accountId })
            
            // Sync user addons if syncOnJoin is enabled
            if (invitation.syncOnJoin) {
              try {
                const { syncUserAddons } = require('./users')
                const reqLike = { appAccountId: invitation.accountId, headers: {} }
                const syncResult = await syncUserAddons(prisma, newUser.id, [], false, reqLike, decrypt, () => invitation.accountId, true)
                if (syncResult?.success) {
                  console.log('✅ User synced on join')
                } else {
                  console.warn('⚠️ Sync on join failed:', syncResult?.error)
                }
              } catch (syncError) {
                console.error('❌ Error syncing user on join:', syncError)
                // Don't fail the whole thing if sync fails
              }
            }
          }
        } catch (error) {
          console.error('Error assigning user to group:', error)
          // don't fail the whole thing if group assignment fails
        }
      }

      // bump the use count
      const updatedInvitation = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { currentUses: invitation.currentUses + 1 }
      })

      // mark request as completed
      await prisma.inviteRequest.update({
        where: { id: request.id },
        data: { status: 'completed' }
      })

      // send webhook if configured
      try {
        const account = await prisma.appAccount.findUnique({
          where: { id: invitation.accountId },
          select: { sync: true }
        })

        const syncCfg = parseSyncConfig(account?.sync)
        const webhookUrl = syncCfg?.webhookUrl
        if (webhookUrl) {
          // uses left after incrementing
          const usesLeft = updatedInvitation.maxUses != null 
            ? Math.max(0, updatedInvitation.maxUses - updatedInvitation.currentUses)
            : null
          const usesLeftText = usesLeft !== null 
            ? `${usesLeft} / ${updatedInvitation.maxUses}`
            : 'Unlimited'
          
          const titleGroup = finalGroupName ? ` ${finalGroupName}` : ''
          const title = `User ${newUser.username} Joined${titleGroup} via Invite`

          const embed = {
            title: title,
            description: `User has successfully joined Syncio using invite.`,
            color: 0x22c55e, // Green color for success
            fields: [
              { name: 'Username', value: formatCodeBlock(newUser.username), inline: true },
              { name: 'Email', value: formatCodeBlock(newUser.email), inline: true },
              { name: 'Group', value: formatCodeBlock(finalGroupName || 'No group'), inline: true },
              { name: 'Invite Code', value: formatCodeBlock(invitation.inviteCode), inline: true },
              { name: 'Uses Left', value: formatCodeBlock(usesLeftText), inline: true }
            ],
            timestamp: new Date().toISOString()
          }

          const appVersion = getAppVersion()
          if (appVersion) {
            embed.footer = { text: `Syncio v${appVersion}` }
          }

          await postDiscord(webhookUrl, null, {
            embeds: [embed],
            avatar_url: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png'
          })
        }
      } catch (webhookError) {
        console.error('Failed to send user joined webhook:', webhookError)
      }

      res.json({ 
        message: 'User created successfully',
        status: 'completed',
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email
        }
      })
    } catch (error) {
      console.error('Error completing invite:', error)
      res.status(500).json({ error: 'Failed to complete invite' })
    }
  })

  // Get Stremio user info from authKey (public endpoint for invite flow)
  publicRouter.post('/:inviteCode/user-info', async (req, res) => {
    try {
      const { inviteCode } = req.params
      const { authKey, username, email } = req.body

      if (!authKey) {
        return res.status(400).json({ error: 'authKey is required' })
      }

      // Verify the invite exists and is active
      const invitation = await prisma.invitation.findUnique({
        where: { inviteCode }
      })

      if (!invitation) {
        return res.status(404).json({ error: 'Invitation not found' })
      }

      if (!invitation.isActive) {
        return res.status(403).json({ error: 'Invitation is disabled' })
      }

      // Get user info from authKey
      const userInfo = await getStremioUserInfo(authKey, username, email)

      return res.json({
        message: 'Stremio account verified',
        user: userInfo
      })
    } catch (error) {
      if (error.message === 'Invalid or expired Stremio auth key') {
        return res.status(401).json({ error: error.message })
      }
      if (error.message === 'Could not validate auth key') {
        return res.status(400).json({ error: error.message })
      }
      console.error('Error verifying auth key:', error)
      res.status(500).json({ error: 'Failed to verify auth key' })
    }
  })

  return publicRouter
}

// Export the helper for use in other routes
module.exports.getStremioUserInfo = getStremioUserInfo

