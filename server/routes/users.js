const express = require('express');
const { StremioAPIClient } = require('stremio-api-client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { handleStremioError } = require('../utils/handlers');
const { findUserById } = require('../utils/helpers');
const { responseUtils, dbUtils } = require('../utils/routeUtils');

// Export a function that returns the router, allowing dependency injection
module.exports = ({ prisma, getAccountId, scopedWhere, AUTH_ENABLED, decrypt, encrypt, parseAddonIds, parseProtectedAddons, getDecryptedManifestUrl, StremioAPIClient, StremioAPIStore, assignUserToGroup, debug, defaultAddons, canonicalizeManifestUrl, getAccountDek, getServerKey, aesGcmDecrypt, validateStremioAuthKey, manifestUrlHmac, manifestHash }) => {
  const router = express.Router();

  // Get all users
  router.get('/', async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        where: scopedWhere(req, {}),
        include: {},
        orderBy: { id: 'asc' }
      });

      // Transform data for frontend compatibility
      const transformedUsers = await Promise.all(users.map(async (user) => {
        // For SQLite, we need to find groups that contain this user
        const groups = await prisma.group.findMany({
          where: scopedWhere(req, { userIds: { contains: user.id } }),
          include: {
            addons: {
              include: {
                addon: true
              }
            }
          }
        })
        
        const userGroup = groups[0] // Use first group
        const addonCount = userGroup?.addons?.length || 0
        
        // Calculate Stremio addons count by fetching live data
        let stremioAddonsCount = 0
        if (user.stremioAuthKey) {
          try {
            // Decrypt stored auth key
            const authKeyPlain = decrypt(user.stremioAuthKey, req)
            
            // Use stateless client with authKey to fetch addon collection directly
            const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
            const collection = await apiClient.request('addonCollectionGet', {})
            
            const rawAddons = collection?.addons || collection || {}
            const addonsNormalized = Array.isArray(rawAddons)
              ? rawAddons
              : (typeof rawAddons === 'object' ? Object.values(rawAddons) : [])
            
            stremioAddonsCount = addonsNormalized.length
          } catch (error) {
            console.error(`Error fetching Stremio addons for user ${user.id}:`, error.message)
            // Note: stremioAddons field was removed from User schema
            // No fallback to database value available
          }
        }
        
        const excludedAddons = parseAddonIds(user.excludedAddons)
        const protectedAddons = parseProtectedAddons(user.protectedAddons, req)

        return {
          id: user.id,
          username: user.username,
          email: user.email,
          groupName: userGroup?.name || null,
          groupId: userGroup?.id || null,
          status: user.isActive ? 'active' : 'inactive',
          addons: addonCount,
          stremioAddonsCount: stremioAddonsCount,
          groups: groups.length,
          lastActive: null,
          hasStremioConnection: !!user.stremioAuthKey,
          isActive: user.isActive,
          excludedAddons: excludedAddons,
          protectedAddons: protectedAddons,
          colorIndex: user.colorIndex
        };
      }));

      res.json(transformedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  });

  // Get single user with detailed information
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const { basic } = req.query
      debug.log(`🔍 GET /api/users/${id} called${basic ? ' (basic mode)' : ''}`)
      
      const user = await findUserById(prisma, id, getAccountId(req), {})
      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      // Find groups that contain this user
      const groups = await prisma.group.findMany({
        where: {
          accountId: getAccountId(req),
          userIds: {
            contains: user.id
          }
        },
        include: {
          addons: {
            include: {
              addon: true
            }
          }
        }
      })

      // Group addons come from the user's primary group assignment
      const primaryGroup = groups[0]
      const currentAccountId = getAccountId(req)
      // Resolve ordered addons via shared helper
      const { getGroupAddons } = require('../utils/helpers')
      const orderedAddons = primaryGroup ? await getGroupAddons(prisma, primaryGroup.id, req) : []

      // Get all groups the user belongs to
      const userGroups = groups.map(g => ({ id: g.id, name: g.name }))

      // Note: stremioAddons field was removed from User schema
      // Stremio addons are now fetched live when needed
      let stremioAddonsCount = 0
      let stremioAddons = []

      // Parse excluded and protected addons from database
      let excludedAddons = []
      let protectedAddons = []
      
      excludedAddons = parseAddonIds(user.excludedAddons)
      
      protectedAddons = parseProtectedAddons(user.protectedAddons, req)

      // Transform for frontend
      const transformedUser = {
        id: user.id,
        email: user.email,
        username: user.username,
        hasStremioConnection: !!user.stremioAuthKey,
        status: user.isActive ? 'active' : 'inactive',
        addons: orderedAddons,
        groups: userGroups,
        groupName: groups[0]?.name || null,
        groupId: groups[0]?.id || null,
        lastActive: null,
        stremioAddonsCount: stremioAddonsCount,
        stremioAddons: stremioAddons,
        excludedAddons: excludedAddons,
        protectedAddons: protectedAddons,
        colorIndex: user.colorIndex
      }

      res.json(transformedUser)
    } catch (error) {
      console.error('Error fetching user details:', error)
      res.status(500).json({ error: 'Failed to fetch user details' })
    }
  });

  // Update user
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const { username, email, password, groupId, colorIndex } = req.body
      

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
      })

      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Prepare update data
      const updateData = {}
      
      if (username !== undefined) {
        updateData.username = username
      }
      
      if (email !== undefined) {
        // Check if email is already taken by another user
        const emailExists = await prisma.user.findFirst({
          where: { 
            AND: [
              { email },
              { id: { not: id } },
              ...(AUTH_ENABLED && req.appAccountId ? [{ accountId: req.appAccountId }] : [])
            ]
          }
        })
        
        if (emailExists) {
          return res.status(400).json({ error: 'Email already exists' })
        }
        
        updateData.email = email
      }

      if (password !== undefined && password.trim() !== '') {
        updateData.password = await bcrypt.hash(password, 12)
      }

      if (colorIndex !== undefined) {
        updateData.colorIndex = colorIndex
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData
      })

      // Handle group assignment
      if (groupId !== undefined) {
        await assignUserToGroup(id, groupId, req)
      }

      // Fetch updated user for response
      const userWithGroups = await prisma.user.findUnique({
        where: { id }
      })

      // Find groups that contain this user using userIds JSON array
      const userGroups = await prisma.group.findMany({
        where: {
          userIds: {
            contains: id
          }
        }
      })

      // Transform for frontend response
      const userGroup = userGroups[0] // Get first group if any
      const transformedUser = {
        id: userWithGroups.id,
        username: userWithGroups.username,
        email: userWithGroups.email,
        status: userWithGroups.isActive ? 'active' : 'inactive',
        addons: userWithGroups.stremioAddons ? 
          (Array.isArray(userWithGroups.stremioAddons) ? userWithGroups.stremioAddons.length : Object.keys(userWithGroups.stremioAddons).length) : 0,
        groups: userGroups.length,
        groupName: userGroup?.name || null,
        groupId: userGroup?.id || null,
        lastActive: null
      }

      // Log activity (temporarily disabled for debugging)
      // try {
      //   await prisma.activityLog.create({
      //     data: {
      //       userId: id,
      //       action: 'user_updated',
      //       details: JSON.stringify({ updatedFields: Object.keys(updateData) }),
      //       accountId: getAccountId(req)
      //     }
      //   })
      // } catch (logError) {
      //   console.warn('Failed to log user update activity:', logError.message)
      // }

      res.json(transformedUser)
    } catch (error) {
      console.error('Error updating user:', error)
      res.status(500).json({ error: 'Failed to update user', details: error?.message })
    }
  });

  // Enable user
  router.put('/:id/enable', async (req, res) => {
    try {
      const { id } = req.params
      
      
      // Update user status to active
      const updatedUser = await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: { isActive: true },
        include: {}
      })
      
      // Remove sensitive data
      delete updatedUser.password
      delete updatedUser.stremioAuthKey
      
      res.json(updatedUser)
    } catch (error) {
      console.error('Error enabling user:', error)
      res.status(500).json({ error: 'Failed to enable user', details: error?.message })
    }
  });

  // Disable user
  router.put('/:id/disable', async (req, res) => {
    try {
      const { id } = req.params
      
      
      // Update user status to inactive
      const updatedUser = await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: { isActive: false },
        include: {}
      })
      
      // Remove sensitive data
      delete updatedUser.password
      delete updatedUser.stremioAuthKey
      
      res.json(updatedUser)
    } catch (error) {
      console.error('Error disabling user:', error)
      res.status(500).json({ error: 'Failed to disable user', details: error?.message })
    }
  });

  // Delete user
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Ensure user exists
      const existingUser = await prisma.user.findUnique({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })
      if (!existingUser) {
        return responseUtils.notFound(res, 'User')
      }

      // Remove user from all groups first (update userIds arrays)
      const groups = await prisma.group.findMany({
        where: {
          accountId: getAccountId(req),
          userIds: {
            contains: id
          }
        }
      })
      
      // Update each group to remove the user from userIds array
      for (const group of groups) {
        const userIds = group.userIds ? JSON.parse(group.userIds) : []
        const updatedUserIds = userIds.filter(userId => userId !== id)
        await prisma.group.update({
          where: { id: group.id },
          data: { userIds: JSON.stringify(updatedUserIds) }
        })
      }

      // Delete related records first to avoid FK constraint errors
      await prisma.$transaction([
        // ActivityLog model removed
        prisma.user.delete({ 
          where: { 
            id,
            accountId: getAccountId(req)
          }
        })
      ])

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Failed to delete user' });
    }
  });

  // Get user sync status (delegates to shared util)
  router.get('/:id/sync-status', async (req, res) => {
    try {
      const { id } = req.params
      const { groupId, unsafe } = req.query

      const { createGetUserSyncStatus } = require('../utils/sync')
      const getUserSyncStatus = createGetUserSyncStatus({
        prisma,
        getAccountId,
        decrypt,
        parseAddonIds,
        parseProtectedAddons,
        getDecryptedManifestUrl,
        canonicalizeManifestUrl,
        StremioAPIClient,
      })

      const result = await getUserSyncStatus(id, { groupId, unsafe }, req)
      return res.json(result)
    } catch (error) {
      console.error('Error getting sync status:', error)
      res.status(500).json({ message: 'Failed to get sync status' })
    }
  });

  // Get user's raw Stremio addons (getUserAddons function)
  router.get('/:id/user-addons', async (req, res) => {
    try {
      const { id } = req.params

      // Get user
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          id: true,
          stremioAuthKey: true,
          isActive: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      // Import the getUserAddons function
      const { getUserAddons } = require('../utils/sync')
      
      // Get raw Stremio addons
      const result = await getUserAddons(user, req, {
        decrypt,
        StremioAPIClient
      })

      if (!result.success) {
        console.error('❌ getUserAddons failed:', result.error)
        return res.status(500).json({ message: 'Failed to fetch Stremio addons', error: result.error })
      }

      // Removed verbose raw addons log to reduce noise
      res.json(result.addons)
    } catch (error) {
      console.error('❌ Error fetching raw Stremio addons:', error)
      res.status(500).json({ message: 'Failed to fetch raw Stremio addons', error: error?.message })
    }
  });

  // Get user's Stremio addons
  router.get('/:id/stremio-addons', async (req, res) => {
    try {
      const { id } = req.params
      // Fetch the user's stored Stremio auth
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { stremioAuthKey: true }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User is not connected to Stremio' })
      }

      // Decrypt stored auth key
      let authKeyPlain
      try {
        authKeyPlain = decrypt(user.stremioAuthKey, req)
      } catch (e) {
        console.error('Decryption failed:', e.message)
        return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' })
      }

      // Use stateless client with authKey to fetch addon collection directly
      try {
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
        const collection = await apiClient.request('addonCollectionGet', {})

        const rawAddons = collection?.addons || collection || {}
        const addonsNormalized = Array.isArray(rawAddons)
          ? rawAddons
          : (typeof rawAddons === 'object' ? Object.values(rawAddons) : [])

        // Keep only safe serializable fields (skip manifest fetching for performance)
        const allAddons = addonsNormalized.map((a) => {
          return {
            id: a?.id || a?.manifest?.id || 'unknown',
            name: a?.name || a?.manifest?.name || 'Unknown',
            manifestUrl: a?.manifestUrl || a?.transportUrl || a?.url || null,
            version: a?.version || a?.manifest?.version || 'unknown',
            description: a?.description || a?.manifest?.description || '',
            iconUrl: a?.iconUrl || a?.manifest?.logo || null, // Add iconUrl field
            // Include manifest object for frontend compatibility - ensure it's never null
            manifest: a?.manifest || {
              id: a?.manifest?.id || a?.id || 'unknown',
              name: a?.manifest?.name || a?.name || 'Unknown',
              version: a?.manifest?.version || a?.version || 'unknown',
              description: a?.manifest?.description || a?.description || '',
              logo: a?.iconUrl || a?.manifest?.logo || null, // Add logo to manifest
              // Include other essential manifest fields to prevent null errors
              types: a?.manifest?.types || ['other'],
              resources: a?.manifest?.resources || [],
              catalogs: a?.manifest?.catalogs || []
            }
          }
        })

        // Keep all addons for display (don't filter default addons in the main endpoint)
        const addons = allAddons

        return res.json({
          userId: id,
          count: addons.length,
          addons
        })
      } catch (error) {
        console.error('Error fetching Stremio addons:', error)
        return res.status(500).json({ message: 'Failed to fetch addons from Stremio', error: error.message })
      }
    } catch (error) {
      console.error('Error getting Stremio addons:', error)
      res.status(500).json({ message: 'Failed to get Stremio addons' })
    }
  });

  // Get user's desired addons (group addons + protected addons)
  router.get('/:id/desired-addons', async (req, res) => {
    try {
      const { id } = req.params
      
      // Fetch the user
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          id: true,
          stremioAuthKey: true,
          excludedAddons: true,
          protectedAddons: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      // Import the getDesiredAddons function
      const { getDesiredAddons } = require('../utils/sync')
      
      // Get unsafe mode from query parameter
      const unsafe = req.query.unsafe === 'true'
      
      // Call getDesiredAddons with all required dependencies
      const result = await getDesiredAddons(user, req, {
        prisma,
        getAccountId,
        decrypt,
        parseAddonIds,
        parseProtectedAddons,
        canonicalizeManifestUrl,
        StremioAPIClient,
        unsafeMode: unsafe
      })

      if (!result.success) {
        return res.status(500).json({ message: result.error })
      }

      res.json({ addons: result.addons })
    } catch (error) {
      console.error('❌ Error fetching desired addons:', error)
      res.status(500).json({ message: 'Failed to fetch desired addons', error: error?.message })
    }
  });

  // Get user's group addons
  router.get('/:id/group-addons', async (req, res) => {
    try {
      const { id } = req.params
      
      // Get user's groups
      const groups = await prisma.group.findMany({
        where: {
          accountId: getAccountId(req),
          userIds: {
            contains: id
          }
        }
      })

      if (groups.length === 0) {
        return res.json({ addons: [] })
      }

      // Use the primary group (first one)
      const primaryGroup = groups[0]
      
      // Import the getGroupAddons function
      const { getGroupAddons } = require('../utils/helpers')
      
      // Get group addons with proper ordering and decryption
      const groupAddons = await getGroupAddons(prisma, primaryGroup.id, req)

      res.json({ addons: groupAddons })
    } catch (error) {
      console.error('❌ Error fetching group addons:', error)
      res.status(500).json({ message: 'Failed to fetch group addons', error: error?.message })
    }
  });

  // Update excluded addons
  router.put('/:id/excluded-addons', async (req, res) => {
    try {
      const { id } = req.params
      const { excludedAddons } = req.body

      const user = await prisma.user.findUnique({
        where: { id, accountId: getAccountId(req) }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      const updatedUser = await prisma.user.update({
        where: { id, accountId: getAccountId(req) },
        data: { excludedAddons: JSON.stringify(excludedAddons || []) }
      })

      res.json({ 
        message: 'Excluded addons updated successfully',
        excludedAddons: parseAddonIds(updatedUser.excludedAddons)
      })
    } catch (error) {
      console.error('Error updating excluded addons:', error)
      res.status(500).json({ message: 'Failed to update excluded addons' })
    }
  });

  // Update protected addons
  router.put('/:id/protected-addons', async (req, res) => {
    try {
      const { id } = req.params
      const { protectedAddons } = req.body

      const user = await prisma.user.findUnique({
        where: { id, accountId: getAccountId(req) }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      const updatedUser = await prisma.user.update({
        where: { id, accountId: getAccountId(req) },
        data: { protectedAddons: JSON.stringify(protectedAddons || []) }
      })

      res.json({ 
        message: 'Protected addons updated successfully',
        protectedAddons: parseProtectedAddons(updatedUser.protectedAddons, req)
      })
    } catch (error) {
      console.error('Error updating protected addons:', error)
      res.status(500).json({ message: 'Failed to update protected addons' })
    }
  });

  // Sync user addons (UI endpoint) – simple implementation using getDesiredAddons
  router.post('/:id/sync', async (req, res) => {
    try {
      const { id } = req.params
      const { unsafe } = req.body

      // Get user
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          id: true,
          stremioAuthKey: true,
          isActive: true,
          excludedAddons: true,
          protectedAddons: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.isActive) {
        return res.status(400).json({ message: 'User is disabled' })
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      // Get desired addons
      const { getDesiredAddons } = require('../utils/sync')
      const result = await getDesiredAddons(user, req, {
        prisma,
        getAccountId,
        decrypt,
        parseAddonIds,
        parseProtectedAddons,
        canonicalizeManifestUrl,
        StremioAPIClient,
        unsafeMode: unsafe === true
      })

      if (!result.success) {
        return res.status(500).json({ message: 'Failed to get desired addons', error: result.error })
      }

      
      // Note: We still need to sync even when desired is empty to clear current addons

      // Use Stremio API client to manage addons
      const authKeyPlain = decrypt(user.stremioAuthKey, req)
      const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
      
      // Convert desired addons to the exact format expected by Stremio API
      // Prefer collection-style objects coming from getDesiredAddons: { transportUrl, transportName, manifest }
      const addonsForSync = result.addons.map((item) => {
        if (item && (item.transportUrl || item.transportName || item.manifest)) {
          return {
            transportUrl: item.transportUrl,
            transportName: item.transportName || (item.manifest && item.manifest.name) || item.name || 'Addon',
            manifest: item.manifest || item,
          }
        }
        // Fallback if an entry is a raw manifest object (legacy)
        const fallbackUrl = item?.manifestUrl || item?.url || item?.transportUrl || ''
        const fallbackName = item?.name || item?.manifest?.name || 'Addon'
        return {
          transportUrl: fallbackUrl,
          transportName: fallbackName,
          manifest: item?.manifest || item,
        }
      })

      // Set the entire desired collection (this replaces the current collection)
      try {
        await apiClient.request('addonCollectionSet', { addons: addonsForSync })
      } catch (error) {
        console.error('❌ Failed to set addon collection:', error.message)
        return res.status(500).json({ message: 'Failed to sync addons', error: error.message })
      }

      res.json({ 
        message: 'User synced successfully', 
        addonsCount: result.addons.length
      })
    } catch (error) {
      console.error('Error in sync endpoint:', error)
      return res.status(500).json({ message: 'Failed to sync user', error: error?.message })
    }
  });

  // Sync all users
  router.post('/sync-all', async (req, res) => {
    try {
      debug.log('🚀 Sync all users endpoint called')
      
      // Get all enabled users
      const users = await prisma.user.findMany({
        where: { isActive: true }
      })
      
      if (users.length === 0) {
        return res.json({ 
          message: 'No enabled users found to sync',
          syncedCount: 0,
          totalUsers: 0
        })
      }
      
      let syncedCount = 0
      let totalAddons = 0
      const errors = []
      
      debug.log(`🔄 Starting sync for ${users.length} enabled users`)
      
      // Sync each user
      for (const user of users) {
        try {
          debug.log(`🔄 Syncing user: ${user.username || user.email}`)
          
          // Use the reusable sync function
          const syncResult = await syncUserAddons(user.id, [], 'normal', false, req)
          
          if (syncResult.success) {
            syncedCount++
            debug.log(`✅ Successfully synced user: ${user.username || user.email}`)
            
            // Collect reload progress if available
            if (syncResult.reloadedCount !== undefined && syncResult.totalAddons !== undefined) {
              totalAddons += syncResult.totalAddons
            }
          } else {
            errors.push(`${user.username || user.email}: ${syncResult.error}`)
          }
        } catch (error) {
          errors.push(`${user.username || user.email}: ${error.message}`)
          console.error(`❌ Error syncing user ${user.username || user.email}:`, error)
        }
      }
      
      let message = `All users sync completed.\n${syncedCount}/${users.length} users synced`
      if (totalAddons > 0) {
        message += `\n${totalAddons} total addons processed`
      }
      if (errors.length > 0) {
        message += `\n\nErrors:\n${errors.join('\n')}`
      }
      
      res.json({
        message,
        syncedCount,
        totalUsers: users.length,
        totalAddons,
        errors: errors.length > 0 ? errors : undefined
      })
    } catch (error) {
      console.error('Error syncing all users:', error)
      res.status(500).json({ message: 'Failed to sync all users', error: error?.message })
    }
  });

  // Patch user (partial update)
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const updateData = req.body

      // Remove any fields that shouldn't be updated directly
      delete updateData.id
      delete updateData.accountId
      delete updateData.createdAt
      delete updateData.updatedAt

      const user = await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: updateData
      })

      // Hide sensitive fields
      delete user.password
      delete user.stremioAuthKey

      res.json(user)
    } catch (error) {
      console.error('Error patching user:', error)
      res.status(500).json({ message: 'Failed to patch user' })
    }
  })

  // Toggle user status
  router.patch('/:id/toggle-status', async (req, res) => {
    try {
      const { id } = req.params
      const { isActive } = req.body

      const user = await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: { isActive }
      })

      res.json({ 
        message: `User ${isActive ? 'enabled' : 'disabled'} successfully`,
        isActive: user.isActive
      })
    } catch (error) {
      console.error('Error toggling user status:', error)
      res.status(500).json({ message: 'Failed to toggle user status' })
    }
  })

  // Toggle protect status for a single addon
  router.post('/:id/protect-addon', async (req, res) => {
    try {
      const { id } = req.params
      const { addonId, manifestUrl } = req.body
      const { unsafe } = req.query
      
      
      // Resolve target URL to protect/unprotect
      let targetUrl = null
      try {
        if (typeof manifestUrl === 'string' && manifestUrl.trim()) {
          targetUrl = manifestUrl.trim()
        } else if (typeof addonId === 'string' && /^https?:\/\//i.test(addonId)) {
          targetUrl = addonId.trim()
        } else if (typeof addonId === 'string' && addonId.trim()) {
          const found = await prisma.addon.findFirst({
            where: { id: addonId.trim(), accountId: getAccountId(req) }
          })
          if (found && found.manifestUrl) {
            try { targetUrl = decrypt(found.manifestUrl, req) } catch { targetUrl = found.manifestUrl }
          }
        }
      } catch {}

      // Default Stremio addons that should be ignored in sync checks
      const defaultAddons = {
        names: [
          'Cinemeta',
          'Local Files'
        ],
        ids: [
          'com.linvo.cinemeta',
          'org.stremio.local'
        ],
        manifestUrls: [
          'http://127.0.0.1:11470/local-addon/manifest.json',
          'https://v3-cinemeta.strem.io/manifest.json'
        ]
      }

      // Check if this is a default addon in safe mode (match by ID or URL)
      const isDefaultAddon = (typeof addonId === 'string' && defaultAddons.ids.includes(addonId)) ||
                             (typeof targetUrl === 'string' && defaultAddons.manifestUrls.includes(targetUrl)) ||
                             (typeof addonId === 'string' && defaultAddons.names.some(name => addonId.includes(name)))
      
      if (isDefaultAddon && unsafe !== 'true') {
        return res.status(403).json({ 
          error: 'This addon is protected by default and cannot be unprotected in safe mode',
          isDefaultAddon: true
        })
      }
      
      // Get current user with protected addons
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { protectedAddons: true }
      })
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }
      
      // Parse current protected addons (stored as encrypted manifest URLs)
      let currentEncrypted = []
      try {
        currentEncrypted = user.protectedAddons ? JSON.parse(user.protectedAddons) : []
      } catch (e) {
        console.warn('Failed to parse protected addons:', e)
        currentEncrypted = []
      }
      // Decrypt existing to URLs for comparison
      const currentUrls = currentEncrypted.map((enc) => { try { return decrypt(enc, req) } catch { return null } }).filter((u) => typeof u === 'string' && u.trim())

      if (!targetUrl || !/^https?:\/\//i.test(String(targetUrl))) {
        return res.status(400).json({ error: 'manifestUrl required or resolvable' })
      }

      const isCurrentlyProtected = currentUrls.includes(targetUrl)
      const nextUrls = isCurrentlyProtected ? currentUrls.filter((u) => u !== targetUrl) : [...currentUrls, targetUrl]
      const nextEncrypted = nextUrls.map((u) => { try { return encrypt(u, req) } catch { return null } }).filter(Boolean)

      // Update user (store encrypted URLs)
      await prisma.user.update({
        where: { id },
        data: {
          protectedAddons: JSON.stringify(nextEncrypted)
        }
      })
      
      res.json({ 
        message: `Addon ${isCurrentlyProtected ? 'unprotected' : 'protected'} successfully`,
        isProtected: !isCurrentlyProtected,
        protectedAddons: nextUrls
      })
    } catch (error) {
      console.error('Error toggling protect addon:', error)
      res.status(500).json({ error: 'Failed to toggle protect addon' })
    }
  })

  // Reload all group addons for a user (fetch fresh manifests and update database)
  router.post('/:id/reload-addons', async (req, res) => {
    try {
      const { id } = req.params

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          isActive: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.isActive) {
        return res.status(400).json({ message: 'User is disabled' })
      }

      // Get user's group
      const userGroup = await prisma.group.findFirst({
          where: {
            accountId: getAccountId(req),
            userIds: {
              contains: user.id
            }
          }
        })

      if (!userGroup) {
          return res.json({ 
          message: 'User not in any group, no addons to reload',
          reloadedCount: 0,
          failedCount: 0,
          total: 0
        })
      }

      // Call reloadGroupAddons on the user's group
      const reloadResult = await reloadGroupAddons(prisma, getAccountId, userGroup.id, req)

        res.json({
        message: 'Group addons reloaded successfully',
        reloadedCount: reloadResult.reloadedCount,
        failedCount: reloadResult.failedCount,
        total: reloadResult.total
      })
    } catch (error) {
      console.error('Error in reload addons endpoint:', error)
      res.status(500).json({ message: 'Failed to reload user addons', error: error?.message })
    }
  })

  // Add specific addons to user's Stremio account
  router.post('/:id/stremio-addons/add', async (req, res) => {
    try {
      const { id } = req.params
      const { addonUrls } = req.body

      if (!Array.isArray(addonUrls) || addonUrls.length === 0) {
        return res.status(400).json({ message: 'addonUrls must be a non-empty array' })
      }

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          stremioAuthKey: true,
          isActive: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      if (!user.isActive) {
        return res.status(400).json({ message: 'User is disabled' })
      }

      try {
        const authKeyPlain = decrypt(user.stremioAuthKey, req)
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
        
        let addedCount = 0
        const results = []

        for (const addonUrl of addonUrls) {
          try {
            // Fetch addon manifest
            const manifestResponse = await fetch(addonUrl)
            if (!manifestResponse.ok) {
              throw new Error(`Failed to fetch manifest: ${manifestResponse.status}`)
            }
            const manifest = await manifestResponse.json()

            // Add to Stremio
            await apiClient.request('addonCollectionAdd', {
              addonId: addonUrl,
              manifest: manifest
            })

            addedCount++
            results.push({
              url: addonUrl,
              status: 'success',
              name: manifest.name || 'Unknown'
            })
          } catch (error) {
            console.error(`Error adding addon ${addonUrl}:`, error)
            results.push({
              url: addonUrl,
              status: 'error',
              error: error.message
            })
          }
        }

        res.json({
          message: 'Addons added successfully',
          addedCount,
          totalRequested: addonUrls.length,
          results
        })
      } catch (error) {
        console.error('Error adding Stremio addons:', error)
        res.status(500).json({ message: 'Failed to add addons', error: error?.message })
      }
    } catch (error) {
      console.error('Error in add Stremio addons endpoint:', error)
      res.status(500).json({ message: 'Failed to add addons', error: error?.message })
    }
  })

  // Clear all Stremio addons from user's account
  router.post('/:id/stremio-addons/clear', async (req, res) => {
    try {
      const { id } = req.params

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          stremioAuthKey: true,
          isActive: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      if (!user.isActive) {
        return res.status(400).json({ message: 'User is disabled' })
      }

      try {
        const authKeyPlain = decrypt(user.stremioAuthKey, req)
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

        // Clear the entire addon collection in one call (matches old backend)
        await apiClient.request('addonCollectionSet', { addons: [] })

        res.json({
          message: 'All addons cleared successfully',
          clearedCount: 0
        })
      } catch (error) {
        console.error('Error clearing Stremio addons:', error)
        res.status(500).json({ message: 'Failed to clear addons', error: error?.message })
      }
    } catch (error) {
      console.error('Error in clear Stremio addons endpoint:', error)
      res.status(500).json({ message: 'Failed to clear addons', error: error?.message })
    }
  })

  // Delete Stremio addon from user's account
  router.delete('/:id/stremio-addons/:addonId', async (req, res) => {
    try {
      const { id, addonId } = req.params
      const { unsafe } = req.query
      
      // Get user to check for user-defined protected addons and Stremio auth
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { 
          stremioAuthKey: true,
          isActive: true,
          protectedAddons: true
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User not connected to Stremio' })
      }

      if (!user.isActive) {
        return res.status(400).json({ message: 'User is disabled' })
      }

      // Protected addons logic (matching old implementation):
      // 1. Default Stremio addons: protected in safe mode, not protected in unsafe mode
      // 2. User-defined protected addons: ALWAYS protected regardless of mode
      const { defaultAddons } = require('../utils/config')
      const protectedAddonIds = unsafe === 'true' ? [] : defaultAddons.ids
      const protectedManifestUrls = unsafe === 'true' ? [] : defaultAddons.manifestUrls
      
      // Parse user-defined protected addons (ALWAYS protected regardless of mode)
      let userProtectedAddons = []
      try {
        const encryptedUrls = user.protectedAddons ? JSON.parse(user.protectedAddons) : []
        if (Array.isArray(encryptedUrls)) {
          userProtectedAddons = encryptedUrls.map(encryptedUrl => {
            try {
              return decrypt(encryptedUrl, req)
            } catch (e) {
              console.warn('Failed to decrypt protected addon URL in delete:', e.message)
              return null
            }
          }).filter(url => url !== null)
        }
      } catch (e) {
        console.warn('Failed to parse user protected addons in delete:', e)
        userProtectedAddons = []
      }
      
      // Add user-defined protected addons to the protected URLs list (ALWAYS)
      const allProtectedUrls = [...protectedManifestUrls, ...userProtectedAddons]
      
      // Check if the addon being deleted is protected
      const isProtected = protectedAddonIds.some(protectedId => addonId.includes(protectedId)) ||
                         allProtectedUrls.some(protectedUrl => addonId === protectedUrl)
      
      // In unsafe mode, allow deletion of default Stremio addons but not user-defined protected addons
      if (isProtected && unsafe !== 'true') {
        return res.status(403).json({ message: 'This addon is protected and cannot be deleted' })
      }

      // Decrypt stored auth key
      let authKeyPlain
      try {
        authKeyPlain = decrypt(user.stremioAuthKey, req)
      } catch (e) {
        return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' })
      }

      // Use StremioAPIClient with proper addon collection format
      const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

      // 1) Pull current collection
      const current = await apiClient.request('addonCollectionGet', {})
      const currentAddonsRaw = current?.addons || current || []
      const currentAddons = Array.isArray(currentAddonsRaw)
        ? currentAddonsRaw
        : (typeof currentAddonsRaw === 'object' ? Object.values(currentAddonsRaw) : [])

      // Find the target by manifestUrl since all addons have id: "unknown"
      const target = currentAddons.find((a) => (a?.manifestUrl || a?.transportUrl || a?.url || '') === addonId)
      const targetUrl = target?.transportUrl || target?.manifestUrl || target?.url

      // Use proper format to remove the addon
      let filteredAddons = currentAddons
      try {
        // Filter out the target addon (if not found, keep list as-is)
        filteredAddons = currentAddons.filter((a) => {
          const curUrl = a?.manifestUrl || a?.transportUrl || a?.url || ''
          return curUrl !== addonId
        })

        // Set the filtered addons using the proper format
        await apiClient.request('addonCollectionSet', { addons: filteredAddons })
      } catch (e) {
        console.error(`❌ Failed to remove addon:`, e.message)
        throw e
      }

      return res.json({ message: 'Addon removed from Stremio account successfully' })
    } catch (error) {
      console.error('Error removing Stremio addon:', error)
      return res.status(502).json({ message: 'Failed to remove addon from Stremio', error: error?.message })
    }
  })

  // Connect user with auth key
  router.post('/:id/connect-stremio-authkey', async (req, res) => {
    try {
      const { id } = req.params
      const { authKey } = req.body

      if (!authKey) {
        return res.status(400).json({ message: 'Auth key is required' })
      }

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      // Encrypt and store the auth key
      const encryptedAuthKey = encrypt(authKey, req)

      await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: {
          stremioAuthKey: encryptedAuthKey,
          isActive: true
        }
      })

      res.json({ message: 'Stremio connection established successfully' })
    } catch (error) {
      console.error('Error connecting user with auth key:', error)
      res.status(500).json({ message: 'Failed to connect user', error: error?.message })
    }
  })

  // Clear Stremio credentials
  router.post('/:id/clear-stremio-credentials', async (req, res) => {
    try {
      const { id } = req.params

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      // Clear Stremio credentials
      await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: {
          stremioAuthKey: null,
          isActive: false // Disconnect user since Stremio credentials are cleared
        }
      })

      res.json({ message: 'Stremio credentials cleared successfully' })
    } catch (error) {
      console.error('Error clearing Stremio credentials:', error)
      res.status(500).json({ message: 'Failed to clear Stremio credentials', error: error?.message })
    }
  })

  // Connect existing user to Stremio
  router.post('/:id/connect-stremio', async (req, res) => {
    try {
      const { id } = req.params
      const { password, authKey } = req.body

      if (!password || !authKey) {
        return res.status(400).json({ message: 'Password and authKey are required' })
      }

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      // Encrypt and store the auth key
      const encryptedAuthKey = encrypt(authKey, req)

      await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: {
          stremioAuthKey: encryptedAuthKey,
          isActive: true
        }
      })

      res.json({ message: 'Stremio connection established successfully' })
    } catch (error) {
      console.error('Error connecting user to Stremio:', error)
      res.status(500).json({ message: 'Failed to connect user to Stremio', error: error?.message })
    }
  })

  // Import addons from a user
  router.post('/:id/import-addons', async (req, res, next) => {
    try {
      // Compatibility shim: if payload already contains addons array (new flow), or addonUrls (legacy),
      // normalize and forward to the enhanced handler declared later in this file.
      if (Array.isArray(req.body?.addons) || Array.isArray(req.body?.addonUrls)) {
        if (!Array.isArray(req.body.addons) && Array.isArray(req.body.addonUrls)) {
          req.body.addons = req.body.addonUrls.map((url) => ({ url, manifestUrl: url }))
        }
        return next()
      }
      const { id } = req.params
      const { addonUrls } = req.body

      if (!Array.isArray(addonUrls) || addonUrls.length === 0) {
        return res.status(400).json({ message: 'addonUrls must be a non-empty array' })
      }

      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })

      if (!user) {
        return responseUtils.notFound(res, 'User')
      }

      // Find groups that contain this user
      const groups = await prisma.group.findMany({
        where: {
          accountId: getAccountId(req),
          userIds: {
            contains: user.id
          }
        }
      })

      if (groups.length === 0) {
        return res.status(400).json({ message: 'User is not in any groups' })
      }

      const group = groups[0] // Use first group
      let importedCount = 0
      const results = []

      for (const addonUrl of addonUrls) {
        try {
          // Fetch addon manifest
          const manifestResponse = await fetch(addonUrl)
          if (!manifestResponse.ok) {
            throw new Error(`Failed to fetch manifest: ${manifestResponse.status}`)
          }
          const manifest = await manifestResponse.json()

          // Check if addon already exists
          const existingAddon = await prisma.addon.findFirst({
            where: {
              accountId: getAccountId(req),
              manifestUrlHash: manifestUrlHmac(req, addonUrl)
            }
          })

          if (existingAddon) {
            // Check if addon is already in the group
            const existingGroupAddon = await prisma.groupAddon.findFirst({
              where: {
                groupId: group.id,
                addonId: existingAddon.id
              }
            })

            if (!existingGroupAddon) {
              // Add existing addon to group
              await prisma.groupAddon.create({
                data: {
                  groupId: group.id,
                  addonId: existingAddon.id,
                  isEnabled: true
                }
              })
              importedCount++
            }
            results.push({
              url: addonUrl,
              status: 'added_to_group',
              name: manifest.name || 'Unknown'
            })
          } else {
            // Create new addon
            const newAddon = await prisma.addon.create({
              data: {
                accountId: getAccountId(req),
                name: manifest.name || 'Unknown',
                description: manifest.description || '',
                version: manifest.version || null,
                iconUrl: manifest.logo || null,
                stremioAddonId: manifest.id || null,
                isActive: true,
                manifestUrl: encrypt(addonUrl, req),
                manifestUrlHash: manifestUrlHmac(req, addonUrl),
                manifest: encrypt(JSON.stringify(manifest), req),
                manifestHash: manifestHash(manifest)
              }
            })

            // Add to group
            await prisma.groupAddon.create({
              data: {
                groupId: group.id,
                addonId: newAddon.id,
                isEnabled: true
              }
            })

            importedCount++
            results.push({
              url: addonUrl,
              status: 'created_and_added',
              name: manifest.name || 'Unknown'
            })
          }
        } catch (error) {
          console.error(`Error importing addon ${addonUrl}:`, error)
          results.push({
            url: addonUrl,
            status: 'error',
            error: error.message
          })
        }
      }

      if (importedCount === 0) {
        return res.status(400).json({ 
          message: 'No new addons were imported. All addons already exist in the group.',
          importedCount: 0,
          results
        })
      }

      res.json({
        message: `Successfully imported ${importedCount} addons to group "${group.name}"`,
        importedCount,
        totalRequested: addonUrls.length,
        results
      })
    } catch (error) {
      console.error('Error importing addons:', error)
      res.status(500).json({ message: 'Failed to import addons', error: error?.message })
    }
  })

  // Reorder Stremio addons for a user
  router.post('/:id/stremio-addons/reorder', async (req, res) => {
    try {
      const { id: userId } = req.params
      const { orderedManifestUrls } = req.body || {}
      
      
      if (!Array.isArray(orderedManifestUrls) || orderedManifestUrls.length === 0) {
        return res.status(400).json({ message: 'orderedManifestUrls array is required' })
      }
      
      // Get the user
      const user = await prisma.user.findUnique({
        where: { 
          id: userId,
          accountId: getAccountId(req)
        }
      })
      
      if (!user) {
        return responseUtils.notFound(res, 'User')
      }
      
      if (!user.stremioAuthKey) {
        return res.status(400).json({ message: 'User is not connected to Stremio' })
      }
      
      // Decrypt auth key
      let authKeyPlain
      try { 
        authKeyPlain = decrypt(user.stremioAuthKey, req) 
      } catch { 
        return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' }) 
      }
      
      // Use StremioAPIClient to get current addons
      const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
      const current = await apiClient.request('addonCollectionGet', {})
      const currentAddons = current?.addons || []
      
      // Create a map of manifest URLs to addon objects
      const manifestToAddon = new Map()
      currentAddons.forEach(addon => {
        const manifestUrl = addon.transportUrl
        if (manifestUrl) {
          manifestToAddon.set(manifestUrl, addon)
        }
      })
      
      // Validate that all provided URLs exist in the user's addons
      const invalidUrls = orderedManifestUrls.filter(url => !manifestToAddon.has(url))
      if (invalidUrls.length > 0) {
        return res.status(400).json({ 
          message: 'Some URLs are not in the user\'s current addons', 
          invalidUrls 
        })
      }
      
      // Create reordered addons array
      const reorderedAddons = orderedManifestUrls.map(url => manifestToAddon.get(url))
      
      // Set the reordered collection
      await apiClient.request('addonCollectionSet', { addons: reorderedAddons })
      
      res.json({ 
        message: 'Addons reordered successfully',
        reorderedCount: reorderedAddons.length
      })
    } catch (error) {
      console.error('Error reordering Stremio addons:', error)
      res.status(500).json({ message: 'Failed to reorder addons', error: error?.message })
    }
  });

  // Protect addon
  router.post('/:id/protect-addon', async (req, res) => {
    try {
      const { id } = req.params
      const { addonId, manifestUrl } = req.body
      const { unsafe } = req.query
      
      
      // Resolve target URL to protect/unprotect
      let targetUrl = null
      try {
        if (typeof manifestUrl === 'string' && manifestUrl.trim()) {
          targetUrl = manifestUrl.trim()
        } else if (typeof addonId === 'string' && /^https?:\/\//i.test(addonId)) {
          targetUrl = addonId.trim()
        } else if (typeof addonId === 'string' && addonId.trim()) {
          const found = await prisma.addon.findFirst({
            where: { id: addonId.trim(), accountId: getAccountId(req) }
          })
          if (found && found.manifestUrl) {
            try { targetUrl = decrypt(found.manifestUrl, req) } catch { targetUrl = found.manifestUrl }
          }
        }
      } catch {}

      // Check if this is a default addon in safe mode (match by ID or URL)
      const isDefaultAddon = (typeof addonId === 'string' && defaultAddons.ids.includes(addonId)) ||
                             (typeof targetUrl === 'string' && defaultAddons.manifestUrls.includes(targetUrl)) ||
                             (typeof addonId === 'string' && defaultAddons.names.some(name => addonId.includes(name)))
      
      if (isDefaultAddon && unsafe !== 'true') {
        return res.status(403).json({ 
          error: 'This addon is protected by default and cannot be unprotected in safe mode',
          isDefaultAddon: true
        })
      }
      
      // Get current user with protected addons
      const user = await prisma.user.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        select: { protectedAddons: true }
      })
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }
      
      // Parse current protected addons (stored as encrypted manifest URLs)
      let currentEncrypted = []
      try {
        currentEncrypted = user.protectedAddons ? JSON.parse(user.protectedAddons) : []
      } catch (e) {
        console.warn('Failed to parse protected addons:', e)
        currentEncrypted = []
      }
      // Decrypt existing to URLs for comparison
      const currentUrls = currentEncrypted.map((enc) => { try { return decrypt(enc, req) } catch { return null } }).filter((u) => typeof u === 'string' && u.trim())

      if (!targetUrl || !/^https?:\/\//i.test(String(targetUrl))) {
        return res.status(400).json({ error: 'manifestUrl required or resolvable' })
      }

      const isCurrentlyProtected = currentUrls.includes(targetUrl)
      const nextUrls = isCurrentlyProtected ? currentUrls.filter((u) => u !== targetUrl) : [...currentUrls, targetUrl]
      const nextEncrypted = nextUrls.map((u) => { try { return encrypt(u, req) } catch { return null } }).filter(Boolean)

      // Update user (store encrypted URLs)
      await prisma.user.update({
        where: { id },
        data: {
          protectedAddons: JSON.stringify(nextEncrypted)
        }
      })
      
      res.json({ 
        message: `Addon ${isCurrentlyProtected ? 'unprotected' : 'protected'} successfully`,
        isProtected: !isCurrentlyProtected,
        protectedAddons: nextUrls
      })
    } catch (error) {
      console.error('Error toggling protect addon:', error)
      res.status(500).json({ error: 'Failed to toggle protect addon' })
    }
  });

  // Connect user with Stremio auth key
  router.post('/:id/connect-stremio-authkey', async (req, res) => {
    try {
      const { id } = req.params
      const { authKey } = req.body
      if (!authKey) return res.status(400).json({ message: 'authKey is required' })

      const user = await prisma.user.findUnique({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })
      if (!user) return res.status(404).json({ message: 'User not found' })

      // Validate auth key
      let addonsData = {}
      let verifiedUser = null
      try {
        const validation = await validateStremioAuthKey(authKey)
        addonsData = (validation && validation.addons) || {}
        verifiedUser = validation && validation.user ? validation.user : null
      } catch (e) {
        const msg = (e && (e.message || e.error || '')) || ''
        const code = (e && e.code) || 0
        if (code === 1 || /session does not exist/i.test(String(msg))) {
          return res.status(401).json({ message: 'Invalid or expired Stremio auth key' })
        }
        return res.status(400).json({ message: 'Could not validate auth key' })
      }

      const encryptedAuthKey = encrypt(authKey, req)

      const updated = await prisma.user.update({
        where: { id },
        data: {
          stremioAuthKey: encryptedAuthKey,
          stremioAddons: JSON.stringify(addonsData || {}),
          email: verifiedUser?.email ? verifiedUser.email.toLowerCase() : undefined,
          isActive: true, // Reconnect user since they now have valid Stremio connection
        },
      })

      delete updated.password
      delete updated.stremioAuthKey
      return res.json(updated)
    } catch (e) {
      console.error('connect-stremio-authkey failed:', e)
      return res.status(500).json({ message: 'Failed to connect existing user with authKey' })
    }
  });

  // Clear Stremio credentials
  router.post('/:id/clear-stremio-credentials', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Use the middleware-protected user (ensures account isolation)
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });

      if (!existingUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Clear Stremio credentials
      const updatedUser = await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: {
          stremioAuthKey: null,
          stremioAddons: null,
          isActive: false, // Disconnect user since Stremio credentials are cleared
        },
      });

      res.json({ message: 'Stremio credentials cleared successfully', userId: updatedUser.id });
    } catch (error) {
      console.error('Error clearing Stremio credentials:', error);
      res.status(500).json({ message: 'Failed to clear Stremio credentials', error: error?.message });
    }
  });

  // Connect existing user to Stremio
  router.post('/:id/connect-stremio', async (req, res) => {
    try {
      const safe = (() => { const { password: _pw, authKey: _ak, ...rest } = (req.body || {}); return rest })()
      console.log('🚀 Connect Stremio endpoint called with:', req.params.id, safe);
    } catch {
      console.log('🚀 Connect Stremio endpoint called with:', req.params.id, '{redacted}')
    }
    try {
      const { id } = req.params;
      const { email, password, username } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }
      
      // Use the middleware-protected user (ensures account isolation)
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });
      
      if (!existingUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Check if user already has Stremio credentials
      // Allow reconnection - we'll update the stremioAuthKey with new credentials
      
      // Create a temporary storage object for this authentication session
      const tempStorage = {};
      
      // Create Stremio API store for this user
      const apiStore = new StremioAPIStore({
        endpoint: 'https://api.strem.io',
        storage: {
          getJSON: (key) => {
            if (tempStorage[key] !== undefined) {
              return tempStorage[key];
            }
            switch (key) {
              case 'addons':
                return [];
              case 'user':
                return null;
              case 'auth':
                return null;
              default:
                return null;
            }
          },
          setJSON: (key, value) => {
            tempStorage[key] = value;
          }
        }
      });
      
      // Create Stremio API client
      const apiClient = new StremioAPIClient(apiStore);
      
      // Authenticate with Stremio using the same method as new user creation
      const loginEmailOnly = async () => {
        let lastErr
        for (const attempt of [
          () => apiStore.login({ email, password }),
          () => apiStore.login(email, password),
        ]) {
          try {
            await attempt()
            return
          } catch (e) {
            lastErr = e
          }
        }
        throw lastErr
      }
      
      try {
        await loginEmailOnly()
      } catch (e) {
        console.error('Stremio connection error:', e);
        
        // Use centralized Stremio error handling
        return handleStremioError(e, res);
      }
      
      // Pull user's addon collection from Stremio
      await apiStore.pullAddonCollection();
      
      // Get authentication data from the API store (support both possible keys)
      const authKey = apiStore.authKey || tempStorage.auth || tempStorage.authKey;
      const userData = apiStore.user || tempStorage.user;
      
      
      if (!authKey || !userData) {
        console.error('🔍 Missing auth data - authKey:', !!authKey, 'userData:', !!userData);
        return res.status(401).json({ message: 'Failed to get Stremio authentication data' });
      }
      
      // Get user's addons using the same logic as stremio-addons endpoint
      let addonsData = [];
      try {
        const collection = await apiClient.request('addonCollectionGet', {});
        const rawAddons = collection?.addons || collection || {};
        const addonsNormalized = Array.isArray(rawAddons)
          ? rawAddons
          : (typeof rawAddons === 'object' ? Object.values(rawAddons) : []);
        
        // Process addons to get the actual count (same as stremio-addons endpoint)
        addonsData = await Promise.all(addonsNormalized.map(async (a) => {
          let manifestData = null;
          
          // Always try to fetch manifest if we have a URL and no proper manifest data
          if ((a?.manifestUrl || a?.transportUrl || a?.url) && (!a?.manifest || !a?.name || a.name === 'Unknown')) {
            try {
              const manifestUrl = a?.manifestUrl || a?.transportUrl || a?.url;
              const response = await fetch(manifestUrl);
              if (response.ok) {
                manifestData = await response.json();
              }
            } catch (e) {
              // Ignore manifest fetch errors for counting
            }
          }

          return {
            id: a?.id || a?.manifest?.id || manifestData?.id || 'unknown',
            name: a?.name || a?.manifest?.name || manifestData?.name || 'Unknown',
            manifestUrl: a?.manifestUrl || a?.transportUrl || a?.url || null,
            version: a?.version || a?.manifest?.version || manifestData?.version || null,
            description: a?.description || a?.manifest?.description || manifestData?.description || '',
            manifest: manifestData || a?.manifest || {
              id: manifestData?.id || a?.manifest?.id || a?.id || 'unknown',
              name: manifestData?.name || a?.manifest?.name || a?.name || 'Unknown',
              version: manifestData?.version || a?.manifest?.version || a?.version || null,
              description: manifestData?.description || a?.manifest?.description || a?.description || '',
              types: manifestData?.types || a?.manifest?.types || ['other'],
              resources: manifestData?.resources || a?.manifest?.resources || [],
              catalogs: manifestData?.catalogs || a?.manifest?.catalogs || []
            }
          };
        }));
        
      } catch (e) {
        console.log('Could not fetch addons:', e.message);
      }
      
      // Encrypt the auth key for secure storage
      const encryptedAuthKey = encrypt(authKey, req);
      
      // Update user with Stremio credentials
      const updatedUser = await prisma.user.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: {
          email: email,
          username: username || userData?.username || email.split('@')[0],
          stremioAuthKey: encryptedAuthKey,
          stremioAddons: JSON.stringify(addonsData || {}),
          isActive: true, // Re-enable the user after successful reconnection
        }
      });
      
      return res.json({ 
        message: 'Successfully connected to Stremio', 
        addonsCount: addonsData.length,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email
        }
      });
      
    } catch (error) {
      console.error('Stremio connection error:', error);
      return res.status(500).json({ 
        message: 'Failed to connect to Stremio', 
        error: error?.message || 'Unknown error' 
      });
    }
  });

  // Import user addons endpoint
  router.post('/:id/import-addons', async (req, res) => {
    try {
      const { id: userId } = req.params
      const { addons } = req.body || {}

      if (!Array.isArray(addons) || addons.length === 0) {
        return res.status(400).json({ message: 'addons array is required' })
      }

      // Validate user exists
      const user = await prisma.user.findUnique({ 
        where: { 
          id: userId,
          accountId: getAccountId(req)
        }
      })
      if (!user) return res.status(404).json({ message: 'User not found' })

      // Create import group with unique name
      const baseGroupName = `${user.username} Imports`
      let groupName = baseGroupName
      let group = await prisma.group.findFirst({
        where: { name: groupName, accountId: getAccountId(req) }
      })
      
      // Find unique name if group exists (Copy, Copy #2, etc.)
      if (group) {
        let copyNumber = 1
        while (group) {
          groupName = copyNumber === 1 ? `${baseGroupName} Copy` : `${baseGroupName} Copy #${copyNumber}`
          group = await prisma.group.findFirst({
            where: { name: groupName, accountId: getAccountId(req) }
          })
          copyNumber++
        }
      }
      
      // Create the group
      group = await prisma.group.create({
        data: {
          name: groupName,
          description: `Imported addons from ${user.username}`,
          colorIndex: 0,
          isActive: true,
          accountId: getAccountId(req)
        }
      })

      // Process each addon
      const processedAddons = []
      const newlyImportedAddons = []
      const existingAddons = []
      
      for (const addonData of addons) {
        const addonUrl = addonData.manifestUrl || addonData.transportUrl || addonData.url
        if (!addonUrl) {
          console.log(`⚠️ Skipping addon with no URL:`, addonData)
          continue
        }

        // Get manifest data first
          let manifestData = addonData.manifest
          if (!manifestData) {
            try {
              const resp = await fetch(addonUrl)
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
              manifestData = await resp.json()
            } catch (e) {
              manifestData = {
                id: addonData.id || 'unknown',
                name: addonData.name || 'Unknown Addon',
                version: addonData.version || '1.0.0',
                description: addonData.description || '',
                resources: addonData.manifest?.resources || [],
                types: addonData.manifest?.types || ['other'],
                catalogs: addonData.manifest?.catalogs || []
              }
          }
        }

        // Check if addon exists by manifest content hash
        let addon = null
        try {
          const existingAddon = await prisma.addon.findFirst({ 
              where: {
              manifestHash: manifestHash(manifestData),
              accountId: getAccountId(req)
            },
            select: { id: true, name: true, manifestUrl: true, accountId: true }
          })
          if (existingAddon) {
            console.log(`♻️ Found existing addon with same manifest: ${existingAddon.name}`)
            processedAddons.push(existingAddon)
            existingAddons.push(existingAddon)
            addon = existingAddon
          }
        } catch (e) {
          console.log(`⚠️ Manifest check failed for ${addonUrl}:`, e?.message || e)
        }

        // Create new addon if not found
        if (!addon) {
          console.log(`🔨 Creating new addon for: ${addonUrl}`)
          
          // Check if addon name exists and find unique name
          let addonName = manifestData?.name || addonData.name || 'Unknown Addon'
          let finalAddonName = addonName
          let copyNumber = 1
          
          while (true) {
            const nameExists = await prisma.addon.findFirst({
              where: {
                name: finalAddonName,
                accountId: getAccountId(req)
              }
            })
            
            if (!nameExists) break
            
            finalAddonName = copyNumber === 1 ? `${addonName} Copy` : `${addonName} Copy #${copyNumber}`
            copyNumber++
          }
          
          if (finalAddonName !== addonName) {
            console.log(`📝 Addon name exists, using: ${finalAddonName}`)
          }

          // Fetch original manifest for full capabilities - always try to fetch from transportUrl first
              let originalManifestObj = null
              try {
                const resp = await fetch(addonUrl)
                if (resp.ok) {
                  originalManifestObj = await resp.json()
                }
              } catch {}
              
              // If fetch failed, use the same manifest that goes into the manifest field
              if (!originalManifestObj) {
                originalManifestObj = manifestData
              }

          // Create addon
          try {
            const resourcesNames = JSON.stringify(
              Array.isArray(manifestData?.resources) 
                ? manifestData.resources.map(r => typeof r === 'string' ? r : (r?.name || r?.type)).filter(Boolean)
                : []
            )

            const catalogsData = JSON.stringify(
              Array.isArray(manifestData?.catalogs) 
                ? manifestData.catalogs.map(c => ({ type: c?.type, id: c?.id })).filter(c => c.type && c.id)
                : []
            )

              const createdAddon = await prisma.addon.create({
                data: {
                  accountId: getAccountId(req),
                  name: finalAddonName,
                  description: manifestData?.description || addonData.description || '',
                  version: manifestData?.version || addonData.version || null,
                  iconUrl: manifestData?.logo || addonData.iconUrl || null,
                  stremioAddonId: manifestData?.id || addonData.stremioAddonId || null,
                  isActive: true,
                  manifestUrl: encrypt(addonUrl, req),
                  manifestUrlHash: manifestUrlHmac(req, addonUrl),
                  originalManifest: originalManifestObj ? encrypt(JSON.stringify(originalManifestObj), req) : null,
                  manifest: manifestData ? encrypt(JSON.stringify(manifestData), req) : null,
                  manifestHash: manifestData ? manifestHash(manifestData) : null,
                  resources: resourcesNames,
                  catalogs: catalogsData
                }
              })
            
              addon = createdAddon
              processedAddons.push(addon)
              newlyImportedAddons.push(addon)
            } catch (error) {
            console.error(`❌ Failed to create addon:`, error?.message || error)
                    continue
                  }
          }
      }

      // Attach all processed addons to the group
      for (const addon of processedAddons) {
        try {
          // Get the addon URL for comparison
          const addonUrl = addon.manifestUrl ? decrypt(addon.manifestUrl, req) : null
          
          if (addonUrl) {
            // Check if addon with same URL already exists in group
            const existingGroupAddon = await prisma.groupAddon.findFirst({
              where: {
                groupId: group.id,
                addon: {
                  manifestUrlHash: manifestUrlHmac(req, addonUrl),
                  accountId: getAccountId(req)
                }
              },
              include: { addon: true }
            })

            if (existingGroupAddon) {
              // Remove old addon from group
              await prisma.groupAddon.delete({
                where: {
                  groupId_addonId: {
                    groupId: group.id,
                    addonId: existingGroupAddon.addonId
                  }
                }
              })
              console.log(`🗑️ Removed old addon from group: ${existingGroupAddon.addon.name}`)
            }
          }

          // Add new addon to group
          await prisma.groupAddon.create({
          data: {
              groupId: group.id,
              addonId: addon.id,
              isEnabled: true
            }
          })
        } catch (error) {
          console.error(`❌ Failed to attach ${addon.name}:`, error?.message || error)
        }
      }

      // Assign user to group if they don't have any groups
      const allGroups = await prisma.group.findMany({
        where: { accountId: getAccountId(req) },
        select: { id: true, userIds: true }
      })
      
      let userInAnyGroup = false
      for (const g of allGroups) {
        if (g.userIds) {
          try {
            const userIds = JSON.parse(g.userIds)
            if (Array.isArray(userIds) && userIds.includes(userId)) {
              userInAnyGroup = true
              break
            }
          } catch (e) {
            console.error('Error parsing group userIds:', e)
          }
        }
      }
      
      if (!userInAnyGroup) {
        await assignUserToGroup(userId, group.id, req)
      }

      const message = existingAddons.length > 0
        ? `Successfully imported ${processedAddons.length} addons to group "${groupName}" (${existingAddons.length} already existed, ${newlyImportedAddons.length} newly created)`
        : `Successfully imported ${processedAddons.length} addons to group "${groupName}"`

      res.json({
        message,
        groupId: group.id,
        groupName: group.name,
        addonCount: processedAddons.length,
        newlyImported: newlyImportedAddons.length,
        existing: existingAddons.length
      })

    } catch (error) {
      console.error('❌ Import addons error:', error)
      res.status(500).json({ message: 'Failed to import addons', error: error.message })
    }
  });

  return router;
};

// Export the reloadGroupAddons helper function for use by other modules
module.exports.reloadGroupAddons = reloadGroupAddons;

// Helper function to get sync mode from request headers
function getSyncMode(req) {
  const syncMode = req?.headers?.['x-sync-mode'] || 'normal'
  return syncMode === 'advanced' ? 'advanced' : 'normal'
}

// Reusable function to sync a single user's addons
// Import helpers for standalone usage (when called outside router closure)
const {
  parseAddonIds: parseAddonIdsUtil,
  canonicalizeManifestUrl: canonicalizeManifestUrlUtil,
  filterManifestByResources,
  filterManifestByCatalogs
} = require('../utils/validation')
const { 
  getAccountDek: getAccountDekUtil, 
  getServerKey: getServerKeyUtil, 
  aesGcmDecrypt: aesGcmDecryptUtil,
  encrypt,
  getDecryptedManifestUrl
} = require('../utils/encryption')
const { manifestHash } = require('../utils/hashing')

// Import the shared reload addon helper at module level
const { reloadAddon } = require('./addons')

// Helper function to reload all addons for a group
async function reloadGroupAddons(prisma, getAccountId, groupId, req) {
  let reloadedCount = 0
  let failedCount = 0
  
  // Get all active addons in the group
  const group = await prisma.group.findUnique({
    where: { id: groupId, accountId: getAccountId(req) },
    include: {
      addons: {
        include: { addon: true }
      }
    }
  })

  if (!group) {
    throw new Error('Group not found')
  }

  const groupAddons = group.addons
    .filter(ga => ga.addon && ga.addon.isActive !== false)
    .map(ga => ga.addon)

  
  for (const addon of groupAddons) {
    try {
      
      // Use the existing reloadAddon function
      const result = await reloadAddon(prisma, getAccountId, addon.id, req, { 
        filterManifestByResources, 
        filterManifestByCatalogs, 
        encrypt, 
        getDecryptedManifestUrl, 
        manifestHash 
      })
      
      if (result.success) {
        reloadedCount++
      } else {
        console.warn(`⚠️ Failed to reload ${addon.name}`)
        failedCount++
      }
      
    } catch (error) {
      console.warn(`⚠️ Error reloading ${addon.name}:`, error.message)
      failedCount++
    }
  }
  
  
  return {
    reloadedCount,
    failedCount,
    total: groupAddons.length
  }
}

async function syncUserAddons(userId, excludedManifestUrls = [], syncMode = 'normal', unsafeMode = false, req) {
  try {
    console.log('🚀 Syncing user addons:', userId)

    // Load user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        stremioAuthKey: true,
        isActive: true,
        protectedAddons: true,
        excludedAddons: true,
        accountId: true
      }
    })

    if (!user) return { success: false, error: 'User not found' }
    if (!user.isActive) return { success: false, error: 'User is disabled' }
    if (!user.stremioAuthKey) return { success: false, error: 'User is not connected to Stremio' }

    // Find groups that contain this user
    const groups = await prisma.group.findMany({
      where: {
        accountId: user.accountId,
        userIds: {
          contains: user.id
        }
      },
      include: {
        addons: {
          include: {
            addon: true
          }
        }
      }
    })

    // Get excluded addons from user's database record (like sync status check does)
    let excludedAddons = []
    try {
      excludedAddons = (typeof parseAddonIds === 'function' ? parseAddonIds : parseAddonIdsUtil)(user.excludedAddons)
    } catch (e) {
      console.error('Error parsing excluded addons in sync:', e)
    }
    
    const excludedSet = new Set(excludedAddons.map(id => String(id).trim()))

    // Get ordered, decrypted addons via shared helper
    const { getGroupAddons } = require('../utils/helpers')
    const primaryGroup = groups[0]
    const groupAddons = primaryGroup ? (await getGroupAddons(prisma, primaryGroup.id, req)).filter((a) => a?.manifestUrl && !excludedSet.has(a.id)) : []

    // Advanced sync: reload all group addons first
    let reloadedCount = 0
    let totalAddons = groupAddons.length
    
    if (syncMode === 'advanced') {
      
      // Use the existing reload addon functionality
      const reloadResult = await reloadGroupAddons(prisma, getAccountId, groupAddons, req)
      reloadedCount = reloadResult.reloadedCount
      
      // Reload the group addons from database to get updated data
      const updatedFamilyGroup = await prisma.group.findUnique({
        where: { id: primaryGroup.id },
        include: {
          addons: { 
            include: { addon: true },
            where: { isEnabled: { not: false } }
          }
        }
      })
      
      const updatedFamilyAddons = Array.isArray(updatedFamilyGroup?.addons)
        ? updatedFamilyGroup.addons
            .filter((ga) => (ga?.isEnabled !== false) && (ga?.addon?.isActive !== false) && (ga?.addon?.accountId === user.accountId))
            .map((ga) => ({
              id: ga.addon.id,
              name: ga.addon.name,
              version: ga.addon.version,
              description: ga.addon.description,
              manifestUrl: ga.addon.manifestUrl,
              manifest: ga.addon.manifest,
            }))
            .filter((fa) => fa?.manifestUrl && !excludedSet.has(fa.manifestUrl))
        : []
      
      
      // Use updated addons for sync
      groupAddons.splice(0, groupAddons.length, ...updatedFamilyAddons)
    }

    // Decrypt auth using account-scoped key (no req in this scope)
    let authKeyPlain
    try {
      let key = null
      try { key = (typeof getAccountDek === 'function' ? getAccountDek : getAccountDekUtil)(user.accountId) } catch {}
      if (!key) { key = (typeof getServerKey === 'function' ? getServerKey : getServerKeyUtil)() }
      authKeyPlain = (typeof aesGcmDecrypt === 'function' ? aesGcmDecrypt : aesGcmDecryptUtil)(key, user.stremioAuthKey)
    } catch {
      return { success: false, error: 'Failed to decrypt Stremio credentials' }
    }

    // Create StremioAPIClient for this user
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

    // Protected addons logic:
    // 1. Default Stremio addons: protected in safe mode, not protected in unsafe mode
    // 2. User-defined protected addons: ALWAYS protected regardless of mode
    
    // Load default protected addons config
    const { defaultAddons: defaultCfg } = require('../utils/config')
    const protectedAddonIds = unsafeMode ? new Set() : new Set(defaultCfg.ids)
    // IMPORTANT: match by RAW manifestUrl string (as stored) + canonical URL + default IDs
    const protectedUrls = unsafeMode ? new Set() : new Set(defaultCfg.manifestUrls.map((u) => (u || '').toString().trim()))
    const protectedCanonicalUrls = unsafeMode ? new Set() : new Set(defaultCfg.manifestUrls.map((u) => (typeof canonicalizeManifestUrl === 'function' ? canonicalizeManifestUrl : canonicalizeManifestUrlUtil)(u)))

    // Parse user-defined protected addons (ALWAYS protected regardless of mode)
    let userProtectedAddons = []
    try {
      const encryptedUrls = user.protectedAddons ? JSON.parse(user.protectedAddons) : []
      if (Array.isArray(encryptedUrls)) {
        // Decrypt using account-derived key (no req context here)
        let key = null
        try { key = (typeof getAccountDek === 'function' ? getAccountDek : getAccountDekUtil)(user.accountId) } catch {}
        if (!key) { key = (typeof getServerKey === 'function' ? getServerKey : getServerKeyUtil)() }
        userProtectedAddons = encryptedUrls.map(encryptedUrl => {
          try {
            return (typeof aesGcmDecrypt === 'function' ? aesGcmDecrypt : aesGcmDecryptUtil)(key, encryptedUrl)
          } catch (e) {
            console.warn('Failed to decrypt protected addon URL in sync:', e.message)
            return null
          }
        }).filter(url => url !== null)
      }
    } catch (e) {
      console.warn('Failed to parse user protected addons in sync:', e)
      userProtectedAddons = []
    }
    
    // Add user-defined protected addons to the protected URL set (ALWAYS)
    userProtectedAddons.forEach(url => {
      if (url && typeof url === 'string') {
        const raw = url.toString().trim()
        protectedUrls.add(raw)
        protectedCanonicalUrls.add((typeof canonicalizeManifestUrl === 'function' ? canonicalizeManifestUrl : canonicalizeManifestUrlUtil)(raw))
      }
    })

    // Derive any protected IDs visible in this run (from desired group manifests)
    const protectedIdsFromDesired = (() => {
      try {
        const ids = new Set()
        ;(desiredGroup || []).forEach((a) => {
          if (isProtected(a)) {
            const pid = a?.manifest?.id || a?.id
            if (pid) ids.add(pid)
          }
        })
        return Array.from(ids)
      } catch { return [] }
    })()

    console.error('🔒 Protected sets summary:', {
      defaultIds: Array.from(protectedAddonIds),
      userProtectedIdsFromDesired: protectedIdsFromDesired,
      urlCount: protectedUrls.size,
      canonicalCount: protectedCanonicalUrls.size
    })
    
    const isProtected = (a) => {
      const aid = a?.id || a?.manifest?.id || ''
      const rawUrl = (a?.manifestUrl || a?.transportUrl || a?.url || '').toString().trim()
      const canonUrl = (typeof canonicalizeManifestUrl === 'function' ? canonicalizeManifestUrl : canonicalizeManifestUrlUtil)(rawUrl)
      return protectedAddonIds.has(aid) || protectedUrls.has(rawUrl) || protectedCanonicalUrls.has(canonUrl)
    }

    // Use the same canonicalization used elsewhere for URL set equality checks only
    const normalize = (s) => (typeof canonicalizeManifestUrl === 'function' ? canonicalizeManifestUrl : canonicalizeManifestUrlUtil)(s)

    // Pull current collection
    const current = await apiClient.request('addonCollectionGet', {})
    const currentAddonsRaw = current?.addons || current || []
    const currentAddons = Array.isArray(currentAddonsRaw) ? currentAddonsRaw : (typeof currentAddonsRaw === 'object' ? Object.values(currentAddonsRaw) : [])
    console.error('📥 Current addons from Stremio:', currentAddons?.length || 0)

    // Build desired group addon objects (fetch manifests with fallback to stored data)
    const desiredGroup = []
    for (const fa of groupAddons) {
      try {
        // Use the stored manifest directly instead of fetching from URL
        // This preserves the user's resource selections and customizations
        if (fa.manifest && typeof fa.manifest === 'object') {
          desiredGroup.push({
            transportUrl: fa.manifestUrl,
            transportName: fa.manifest.name || fa.name,
            manifest: fa.manifest,
          })
        } else {
          // Fallback: fetch from URL only if no stored manifest
        const resp = await fetch(fa.manifestUrl)
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
        }
        const manifest = await resp.json()
        
        // Ensure manifest has required fields
        const safeManifest = {
          id: manifest?.id || 'unknown',
          name: manifest?.name || fa.name || 'Unknown',
          version: manifest?.version || '1.0.0', // Default version if null
          description: manifest?.description || fa.description || '',
          ...manifest // Include all other manifest fields
        }
        
        desiredGroup.push({
          transportUrl: fa.manifestUrl,
          transportName: safeManifest.name,
          manifest: safeManifest,
        })
        }
      } catch (e) {
        console.warn(`⚠️ Failed to fetch manifest for ${fa.manifestUrl}:`, e.message)
        
        // Always include the addon, even if we can't fetch the live manifest
        // Use stored manifest from the database as fallback
        let fallbackManifest
        if (fa.manifest && typeof fa.manifest === 'object') {
          // Use the stored manifest JSON directly - no need to reconstruct it
          fallbackManifest = fa.manifest
        } else {
          // Fallback to database fields if no stored manifest
          fallbackManifest = {
            id: fa.id || 'unknown',
            name: fa.name || 'Unknown',
            version: fa.version || '1.0.0',
            description: fa.description || '',
            types: ['other'],
            resources: [],
            catalogs: []
          }
        }
        
        desiredGroup.push({ 
          transportUrl: fa.manifestUrl,
          transportName: fallbackManifest.name,
          manifest: fallbackManifest
        })
        
        if (e.message.includes('429') || e.message.includes('Too Many Requests')) {
          console.warn(`⏭️ Using stored manifest due to rate limiting: ${fallbackManifest.name}`)
        } else {
          console.warn(`⏭️ Using stored manifest due to fetch error: ${fallbackManifest.name}`)
        }
      }
    }

    // Don't filter out any group addons here - the "locked positions" approach
    // will handle protected addons by preserving their positions. We will only
    // use non-protected group addons for filling.
    const nonProtectedGroupAddons = desiredGroup.filter((a) => !isProtected(a))

    // Build initial desired collection using the locked positions approach:
    // 1) Lock protected addons at their original indices from currentAddons
    // 2) Fill remaining holes with non-protected group addons in order
    // Build locked map by canonical URL to preserve position even if Stremio returns reordered list
    const lockedByUrl = new Map()
    for (let i = 0; i < currentAddons.length; i++) {
      const cur = currentAddons[i]
      if (isProtected(cur)) {
        lockedByUrl.set(normalize(cur?.transportUrl || cur?.manifestUrl || cur?.url), i)
      }
    }

    const baseResult = new Array(currentAddons.length).fill(null)
    for (let i = 0; i < currentAddons.length; i++) {
      const cur = currentAddons[i]
      const url = normalize(cur?.transportUrl || cur?.manifestUrl || cur?.url)
      if (lockedByUrl.has(url)) {
        baseResult[lockedByUrl.get(url)] = cur
      }
    }

    let fillerIdx = 0
    for (let i = 0; i < baseResult.length && fillerIdx < nonProtectedGroupAddons.length; i++) {
      if (baseResult[i] === null) {
        baseResult[i] = nonProtectedGroupAddons[fillerIdx++]
      }
    }
    while (fillerIdx < nonProtectedGroupAddons.length) {
      baseResult.push(nonProtectedGroupAddons[fillerIdx++])
    }

    // Dedupe by canonical URL and drop nulls
    const seenUrls = new Set()
    const initialDesired = baseResult.filter((addon) => {
      if (!addon) return false
      const url = normalize(addon?.transportUrl || addon?.manifestUrl || addon?.url)
      if (!url) return true
      if (seenUrls.has(url)) return false
      seenUrls.add(url)
      return true
    })

    // Final lock enforcement pass: if any protected addon from currentAddons is
    // not at its original index in initialDesired, re-place it back to that index.
    // Only non-protected entries can shift as a result.
    const desiredByUrl = new Map(initialDesired.map((a) => [
      normalize(a?.transportUrl || a?.manifestUrl || a?.url),
      a
    ]))

    // Build a list of non-protected entries from initialDesired to use as fillers
    const nonProtectedQueue = initialDesired.filter((a) => !isProtected(a))

    // Start with an array sized to max of current length and initialDesired
    const finalLength = Math.max(currentAddons.length, initialDesired.length)
    const finalDesiredCollection = new Array(finalLength).fill(null)

    // Place protected addons at their original positions
    for (const addon of currentAddons) {
      if (!isProtected(addon)) continue
      const pos = lockedByUrl.get(normalize(addon?.transportUrl || addon?.manifestUrl || addon?.url))
      if (pos != null && pos < finalLength) finalDesiredCollection[pos] = addon
    }

    // Fill remaining positions with non-protected addons
    let queueIdx = 0
    for (let i = 0; i < finalLength && queueIdx < nonProtectedQueue.length; i++) {
      if (finalDesiredCollection[i] === null) {
        finalDesiredCollection[i] = nonProtectedQueue[queueIdx++]
      }
    }

    // Add any remaining non-protected addons at the end
    while (queueIdx < nonProtectedQueue.length) {
      finalDesiredCollection.push(nonProtectedQueue[queueIdx++])
    }

    // Remove nulls
    const finalDesired = finalDesiredCollection.filter(Boolean)

    // Check if already synced (same addons in same order)
    const toUrl = (a) => normalize(a?.transportUrl || a?.manifestUrl || a?.url)
    const toUrlSet = (list) => new Set(list.map(toUrl))
    const currentUrls = toUrlSet(currentAddons)
    const desiredUrls = toUrlSet(finalDesired)
    
    const alreadySynced = currentUrls.size === desiredUrls.size && 
      [...currentUrls].every(url => desiredUrls.has(url)) &&
      JSON.stringify(currentAddons.map(toUrl)) === JSON.stringify(finalDesired.map(toUrl))

    if (alreadySynced) {
      if (syncMode === 'advanced') {
        return { 
          success: true, 
          total: finalDesired.length, 
          alreadySynced: true, 
          reloadedCount, 
          totalAddons 
        }
      }
      return { success: true, total: finalDesired.length, alreadySynced: true }
    }

    // Set the addon collection using the proper format (replaces, removes extras not included)
    try {
      finalDesiredCollection.forEach((a, idx) => {
        const name = a?.manifest?.name || a?.name || a?.transportName || 'Unknown'
        const prot = isProtected(a) ? ' (protected)' : ''
        console.log(`${idx + 1} - ${name}${prot}`)
      })
      
      await apiClient.request('addonCollectionSet', { addons: finalDesired })
      // Skip propagation wait to speed up normal sync
      if (syncMode === 'advanced') {
        await new Promise((r) => setTimeout(r, 1200))
      }
    } catch (e) {
      console.error('❌ Failed to set addon collection:', e.message)
      return { success: false, error: `Failed to sync addons: ${e?.message}` }
    }

    // For speed, avoid a second collection fetch in normal mode; compute from desired
    let total
    if (syncMode === 'advanced') {
      const after = await apiClient.request('addonCollectionGet', {})
      total = Array.isArray(after?.addons) ? after.addons.length : (after?.addons ? Object.keys(after.addons).length : 0)
    } else {
      total = finalDesired.length
    }

    // Note: stremioAddons field was removed from User schema
    // No database update needed for connect
    console.log('💾 Connect completed (stremioAddons field removed from schema)')

    if (syncMode === 'advanced') {
      return { success: true, total, reloadedCount, totalAddons }
    }
    return { success: true, total }
  } catch (error) {
    console.error('Error in syncUserAddons:', error)
    return { success: false, error: error?.message || 'Unknown error' }
  }
}
