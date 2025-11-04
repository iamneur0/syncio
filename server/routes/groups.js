const express = require('express');
const { decrypt } = require('../utils/encryption')
const { parseAddonIds, parseProtectedAddons, canonicalizeManifestUrl } = require('../utils/validation')
const { StremioAPIClient } = require('stremio-api-client')
const { handleDatabaseError, sendError } = require('../utils/handlers');
const { findGroupById } = require('../utils/helpers');
const { responseUtils, dbUtils } = require('../utils/routeUtils');

// Export a function that returns the router, allowing dependency injection
module.exports = ({ prisma, getAccountId, scopedWhere, AUTH_ENABLED, assignUserToGroup, getDecryptedManifestUrl, manifestUrlHmac, decrypt }) => {
  const router = express.Router();

  // Shared helper: reload (advanced mode) then sync all users in a group
  async function syncGroupUsers(groupId, req) {
    // Load group with scoped account
    const group = await prisma.group.findUnique({
      where: { id: groupId, accountId: getAccountId(req) },
      select: { id: true, userIds: true, name: true }
    })
    if (!group) {
      return { error: 'Group not found', groupId }
    }

    // Parse userIds array from stored JSON
    let userIds = []
    try { userIds = Array.isArray(group.userIds) ? group.userIds : JSON.parse(group.userIds || '[]') } catch {}
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return { groupId, syncedUsers: 0, failedUsers: 0, message: 'Group has no users to sync' }
    }

    // Read account-backed sync settings; fallback to headers only if unavailable
    let syncMode = 'normal'
    let unsafeMode = false
    try {
      const acct = await prisma.appAccount.findUnique({ where: { id: getAccountId(req) }, select: { sync: true } })
      let cfg = acct?.sync
      if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch { cfg = null } }
      if (cfg && typeof cfg === 'object') {
        if (cfg.mode === 'advanced') syncMode = 'advanced'
        if (typeof cfg.safe === 'boolean') unsafeMode = !cfg.safe
      } else {
        const headerMode = (req.headers['x-sync-mode'] || '').toString().toLowerCase()
        syncMode = headerMode === 'advanced' ? 'advanced' : 'normal'
        unsafeMode = req.query?.unsafe === 'true' || req.body?.unsafe === true
      }
    } catch {
      const headerMode = (req.headers['x-sync-mode'] || '').toString().toLowerCase()
      syncMode = headerMode === 'advanced' ? 'advanced' : 'normal'
      unsafeMode = req.query?.unsafe === 'true' || req.body?.unsafe === true
    }

    // Remove duplicates from userIds to prevent double syncing
    const uniqueUserIds = [...new Set(userIds)]
    if (uniqueUserIds.length !== userIds.length) {
      console.log(`⚠️ Group ${groupId} had duplicate user IDs, deduplicated: ${userIds.length} -> ${uniqueUserIds.length}`)
    }
    
    console.log(`\nSyncing group ${group.name || groupId}`)
    console.log(`🔄 Syncing ${uniqueUserIds.length} users in group`)

    // In advanced mode, reload group addons first (shared helper from users router)
    let reloadInfo = null
    if (syncMode === 'advanced') {
      const { reloadGroupAddons } = require('./users')
      try { reloadInfo = await reloadGroupAddons(prisma, getAccountId, groupId, req, decrypt) } catch (e) {
        console.warn('Group reload before sync failed:', e?.message)
      }
    }

    // Sync each user in the group (like individual user sync)
    const { syncUserAddons } = require('./users')
    const { computeUserSyncPlan } = require('../utils/sync')
    let synced = 0
    let failed = 0
    
    for (const uid of uniqueUserIds) {
      try {
        // Pre-compute current/desired and alreadySynced using the same comparator as the badge
        const userRec = await prisma.user.findUnique({
          where: { id: uid, accountId: getAccountId(req) },
          select: { id: true, stremioAuthKey: true, excludedAddons: true, protectedAddons: true, isActive: true }
        })
        if (!userRec || userRec.isActive === false) { failed++; continue }

        const plan = await computeUserSyncPlan(userRec, req, {
          prisma,
          getAccountId,
          decrypt,
          parseAddonIds,
          parseProtectedAddons,
          canonicalizeManifestUrl,
          StremioAPIClient,
          unsafeMode
        })

        // If already synced, count and skip pushing
        if (plan?.success && plan.alreadySynced) {
          console.log('✅ User already synced')
          synced++
          continue
        }

        // Otherwise perform sync (reload already handled above if advanced)
        const result = await syncUserAddons(prisma, uid, [], unsafeMode, req, decrypt, getAccountId)
        if (result?.success) {
          synced++
          console.log('✅ User now synced')
        } else {
          failed++
        }
      } catch (e) { 
        failed++ 
      }
    }

    return {
      groupId,
      syncedUsers: synced,
      failedUsers: failed,
      message: `Group sync completed: ${synced}/${userIds.length} users synced`,
      reloadDiffs: reloadInfo?.diffsByAddon || []
    }
  }

  // Get all groups
  router.get('/', async (req, res) => {
    try {
      const whereScope = AUTH_ENABLED && req.appAccountId ? { accountId: req.appAccountId } : {}
      const groups = await prisma.group.findMany({
        where: scopedWhere(req, {}),
        include: {
          addons: { include: { addon: true } },
          _count: { select: { addons: true } }
        },
        orderBy: { id: 'asc' }
      });

      const transformedGroups = await Promise.all(groups.map(async group => {
        // Count only active users from userIds array
        let activeMemberCount = 0
        if (group.userIds) {
          try {
            const userIds = JSON.parse(group.userIds)
            if (Array.isArray(userIds) && userIds.length > 0) {
              const activeUsers = await prisma.user.findMany({
                where: {
                  id: { in: userIds },
                  isActive: true,
                  accountId: getAccountId(req)
                },
                select: { id: true }
              })
              activeMemberCount = activeUsers.length
            }
          } catch (e) {
            console.error('Error parsing group userIds:', e)
          }
        }

        // Count unique active addons scoped to this account (avoid duplicates across accounts)
        const accountId = getAccountId(req)
        const uniqActiveAddonIds = new Set(
          (group.addons || [])
            .filter((ga) => ga?.addon && ga.addon.isActive !== false && (!accountId || ga.addon.accountId === accountId))
            .map((ga) => ga.addon.id)
        )

        return {
        id: group.id,
        name: group.name,
        description: group.description,
          users: activeMemberCount,
          addons: uniqActiveAddonIds.size,
        restrictions: 'none', // TODO: Implement restrictions logic
        isActive: group.isActive,
        // Expose color index for UI
          colorIndex: group.colorIndex || 1,
          // Include userIds for SQLite compatibility
          userIds: group.userIds
        }
      }));
      
      res.json(transformedGroups);
    } catch (error) {
      console.error('Error fetching groups:', error);
      res.status(500).json({ message: 'Failed to fetch groups' });
    }
  });

  // Create new group
  router.post('/', async (req, res) => {
    try {
      const { name, description, colorIndex } = req.body;
      
      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Group name is required' });
      }

      // Check if group with same name exists
      const existingGroup = await prisma.group.findFirst({
        where: { name: name.trim(), ...(AUTH_ENABLED && req.appAccountId ? { accountId: req.appAccountId } : {}) }
      });

      if (existingGroup) {
        return res.status(400).json({ message: 'Group with this name already exists' });
      }

      const newGroup = await prisma.group.create({
        data: {
          name: name.trim(),
          description: description || '',
          colorIndex: colorIndex || 1,
          accountId: getAccountId(req),
        }
      });

      res.status(201).json({
        id: newGroup.id,
        name: newGroup.name,
        description: newGroup.description,
        users: 0,
        addons: 0,
        restrictions: 'none',
        isActive: newGroup.isActive,
        colorIndex: newGroup.colorIndex || 1,
      });
    } catch (error) {
      console.error('Error creating group:', error);
      res.status(500).json({ message: 'Failed to create group', error: error?.message });
    }
  });

  // Clone group
  router.post('/clone', async (req, res) => {
    try {
      const { originalGroupId } = req.body;
      
      if (!originalGroupId) {
        return res.status(400).json({ message: 'Original group ID is required' });
      }

      // Find the original group
      const originalGroup = await prisma.group.findUnique({
        where: { 
          id: originalGroupId,
          accountId: getAccountId(req)
        },
        include: {
          addons: { include: { addon: true } }
        }
      });

      if (!originalGroup) {
        return responseUtils.notFound(res, 'Original group');
      }

      // Create a clone with a modified name
      const clonedGroup = await prisma.group.create({
        data: {
          name: `${originalGroup.name} (Copy)`,
          description: originalGroup.description,
          colorIndex: originalGroup.colorIndex || 1,
          accountId: getAccountId(req),
        }
      });

      // Clone addon associations
      if (originalGroup.addons && originalGroup.addons.length > 0) {
        const groupAddonData = originalGroup.addons.map(ga => ({
          groupId: clonedGroup.id,
          addonId: ga.addonId,
          isEnabled: ga.isEnabled,
          position: ga.position ?? null
        }));

        await prisma.groupAddon.createMany({
          data: groupAddonData
        });
      }

      res.json({ 
        message: 'Group cloned successfully',
        group: {
          id: clonedGroup.id,
          name: clonedGroup.name,
          description: clonedGroup.description,
          users: 0,
          addons: originalGroup.addons?.length || 0,
          restrictions: 'none',
          isActive: clonedGroup.isActive,
          colorIndex: clonedGroup.colorIndex || 1,
        }
      });
    } catch (error) {
      console.error('Error cloning group:', error);
      res.status(500).json({ message: 'Failed to clone group', error: error?.message });
    }
  });

  // Reload addons for a group
  router.post('/:id/reload-addons', async (req, res) => {
    try {
      const { id: groupId } = req.params;
      
      const group = await prisma.group.findUnique({
        where: { 
          id: groupId,
          accountId: getAccountId(req)
        },
        include: {
          addons: { include: { addon: true } }
        }
      });

      if (!group) {
        return responseUtils.notFound(res, 'Group');
      }

      // Use the shared reload group addons function
      const { reloadGroupAddons } = require('./users')
      const reloadResult = await reloadGroupAddons(prisma, getAccountId, group.id, req, decrypt)

      res.json({
        message: 'Group addons reloaded successfully',
        reloadedCount: reloadResult.reloadedCount,
        failedCount: reloadResult.failedCount,
        total: reloadResult.total
      });
    } catch (error) {
      console.error('Error reloading group addons:', error);
      res.status(500).json({ message: 'Failed to reload group addons', error: error?.message });
    }
  });

  // Find or create group
  router.post('/find-or-create', async (req, res) => {
    try {
      const { name } = req.body;
      
      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Group name is required' });
      }

      // Try to find existing group
      let group = await prisma.group.findFirst({
        where: { 
          name: name.trim(),
          accountId: getAccountId(req)
        }
      });

      if (!group) {
        // Create new group if not found
        group = await prisma.group.create({
          data: {
            name: name.trim(),
            description: '',
            colorIndex: 1,
            accountId: getAccountId(req),
          }
        });
      }

      res.json({
        id: group.id,
        name: group.name,
        description: group.description,
        users: 0,
        addons: 0,
        restrictions: 'none',
        isActive: group.isActive,
        colorIndex: group.colorIndex || 1,
      });
    } catch (error) {
      console.error('Error finding or creating group:', error);
      res.status(500).json({ message: 'Failed to find or create group', error: error?.message });
    }
  });

  // Get group details with users and addons
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const group = await findGroupById(prisma, id, getAccountId(req), {
        addons: { 
          include: { addon: true }
        }
      })
      if (!group) return sendError(res, 404, 'Group not found')
      
      // Use shared helper to get ordered addons for this group
      const { getGroupAddons } = require('../utils/helpers')
      const filteredAddonsSorted = await getGroupAddons(prisma, id, req)
      
      // Note: manifest URLs are derived within helper per addon; no separate list needed here
      
      // Find users that belong to this group (SQLite approach) - only active users
      const userIds = group.userIds ? JSON.parse(group.userIds) : []
      const dbUsers = await prisma.user.findMany({
        where: {
          id: { in: userIds },
          isActive: true,
          accountId: getAccountId(req)
        },
        select: {
          id: true,
          username: true,
          email: true,
          colorIndex: true,
          excludedAddons: true
        }
      })

      const users = dbUsers.map((user) => ({
          id: user.id, 
          username: user.username, 
          email: user.email,
          colorIndex: user.colorIndex,
        // Field kept for UI compatibility; with private mode we no longer store per-user stremioAddons
        stremioAddonsCount: 0,
        excludedAddons: user.excludedAddons || []
      }))
      res.json({
        id: group.id,
        name: group.name,
        description: group.description,
        users: users,
        addons: filteredAddonsSorted,
        restrictions: 'none',
        isActive: group.isActive,
        colorIndex: group.colorIndex || 1,
        userIds: group.userIds
      });
    } catch (error) {
      console.error('Error fetching group detail:', error);
      res.status(500).json({ message: 'Failed to fetch group detail', error: error?.message });
    }
  });

  // Update group fields and usership/addons
  router.put('/:id', async (req, res) => {
    const { id } = req.params
    const { name, description, userIds, addonIds, colorIndex } = req.body
    try {
      const group = await prisma.group.findUnique({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }, 
        include: { 
          addons: {
            include: {
              addon: true
            }
          }
        } 
      })
      if (!group) return responseUtils.notFound(res, 'Group')

      // Update basic fields (ignore empty strings)
      const nextName = (typeof name === 'string' && name.trim() === '') ? undefined : name
      const nextDesc = (typeof description === 'string' && description.trim() === '') ? undefined : description
      const updateData = { 
        name: nextName ?? group.name, 
        description: nextDesc ?? group.description 
      }
      
      if (colorIndex !== undefined) {
        updateData.colorIndex = colorIndex
      }
      
      await prisma.group.update({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }, 
        data: updateData
      })

      // Sync users only if userIds is explicitly provided (SQLite approach)
      if (userIds !== undefined) {
        const desiredUserIds = Array.isArray(userIds) ? userIds : []
        
        // First, remove all users from this group
        await prisma.group.update({
          where: { id },
          data: { userIds: JSON.stringify([]) }
        })
        
        // Then, assign each user to this group (which will remove them from other groups)
        for (const userId of desiredUserIds) {
          await assignUserToGroup(userId, id, req)
        }
      }

      // Sync addons only if addonIds is explicitly provided
      if (addonIds !== undefined) {
        const desiredAddonIds = Array.isArray(addonIds) ? addonIds : []
        
        // Remove all existing addon associations
        await prisma.groupAddon.deleteMany({
          where: { groupId: id }
        })
        
        // Add new addon associations
        if (desiredAddonIds.length > 0) {
          await prisma.groupAddon.createMany({
            data: desiredAddonIds.map((addonId, index) => ({
              groupId: id,
              addonId: addonId,
              isEnabled: true,
              position: index
            }))
          })
        }
      }

      res.json({ message: 'Group updated successfully' })
    } catch (error) {
      console.error('Error updating group:', error)
      res.status(500).json({ message: 'Failed to update group', error: error?.message })
    }
  });

  // Delete a group (hard delete and detach users/addons)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const existing = await prisma.group.findUnique({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })
      if (!existing) {
        return responseUtils.notFound(res, 'Group')
      }

      await prisma.$transaction([
        // GroupMember model removed - using JSON arrays instead
        prisma.groupAddon.deleteMany({ where: { groupId: id } }),
        // ActivityLog model removed
        prisma.group.delete({ 
          where: { 
            id,
            accountId: getAccountId(req)
          }
        }),
      ])

      return res.json({ message: 'Group deleted and users/addons detached' })
    } catch (error) {
      console.error('Error deleting group:', error)
      if (error.code === 'P2025') {
        return responseUtils.notFound(res, 'Group')
      }
      return res.status(500).json({ message: 'Failed to delete group', error: error?.message })
    }
  });

  // Remove user from group
  router.delete('/:groupId/users/:userId', async (req, res) => {
    try {
      const { groupId, userId } = req.params
      
      const group = await prisma.group.findUnique({
        where: { 
          id: groupId,
          accountId: getAccountId(req)
        }
      })
      
      if (!group) {
        return responseUtils.notFound(res, 'Group')
      }

      // Parse current userIds and remove the specified user
      const currentUserIds = group.userIds ? JSON.parse(group.userIds) : []
      const updatedUserIds = currentUserIds.filter(id => id !== userId)
      
      await prisma.group.update({
        where: { id: groupId },
        data: { userIds: JSON.stringify(updatedUserIds) }
      })

      res.json({ message: 'User removed from group successfully' })
    } catch (error) {
      console.error('Error removing user from group:', error)
      res.status(500).json({ message: 'Failed to remove user from group', error: error?.message })
    }
  });

  // Add user to group
  router.post('/:groupId/users/:userId', async (req, res) => {
    try {
      const { groupId, userId } = req.params
      
      // Use the assignUserToGroup function to handle the assignment
      await assignUserToGroup(userId, groupId, req)
      
      res.json({ message: 'User added to group successfully' })
    } catch (error) {
      console.error('Error adding user to group:', error)
      res.status(500).json({ message: 'Failed to add user to group', error: error?.message })
    }
  });

  // Add addon to group
  router.post('/:groupId/addons/:addonId', async (req, res) => {
    try {
      const { groupId, addonId } = req.params
      
      // Check if group exists
      const group = await prisma.group.findUnique({
        where: { 
          id: groupId,
          accountId: getAccountId(req)
        }
      })
      
      if (!group) {
        return responseUtils.notFound(res, 'Group')
      }

      // Check if addon exists
      const addon = await prisma.addon.findUnique({
        where: { 
          id: addonId,
          accountId: getAccountId(req)
        }
      })
      
      if (!addon) {
        return responseUtils.notFound(res, 'Addon')
      }

      // Get the addon's manifest URL for comparison
      const addonUrl = addon.manifestUrl ? decrypt(addon.manifestUrl, req) : null
      
      let existingGroupAddon = null
      if (addonUrl) {
        const targetHash = manifestUrlHmac(req, addonUrl)
        
        // Check if addon with same manifest URL already exists in group
        existingGroupAddon = await prisma.groupAddon.findFirst({
          where: {
            groupId: groupId,
            addon: {
              manifestUrlHash: targetHash,
              accountId: getAccountId(req)
            }
          },
          include: { addon: true }
        })
        
        
        // If not found by hash, try to find by URL (for corrupted data)
        if (!existingGroupAddon) {
          const allGroupAddons = await prisma.groupAddon.findMany({
            where: { groupId: groupId },
            include: { addon: true }
          })
          
          for (const ga of allGroupAddons) {
            const existingUrl = ga.addon.manifestUrl ? decrypt(ga.addon.manifestUrl, req) : null
            if (existingUrl === addonUrl) {
              existingGroupAddon = ga
              break
            }
          }
        }
      }

      // If addon with same URL exists, remove it first and preserve its position
      let preservedPosition = null
      if (existingGroupAddon) {
        preservedPosition = existingGroupAddon.position
        await prisma.groupAddon.delete({
          where: {
            groupId_addonId: {
              groupId: groupId,
              addonId: existingGroupAddon.addonId
            }
          }
        })
        console.log(`🗑️ Removed existing addon with same URL: ${existingGroupAddon.addon.name} (position: ${preservedPosition})`)
      }

      // Add addon to group
      await prisma.$transaction(async (tx) => {
        let position
        if (preservedPosition !== null) {
          // Use the preserved position from the replaced addon
          position = preservedPosition
        } else {
          // Add at the bottom (highest position + 1)
          const maxPosition = await tx.groupAddon.aggregate({
            where: { groupId: groupId },
            _max: { position: true }
          })
          position = (maxPosition._max.position ?? -1) + 1
        }

        // Add new addon at the determined position
        await tx.groupAddon.create({
          data: {
            groupId: groupId,
            addonId: addonId,
            isEnabled: true,
            position: position
          }
        })
        
        console.log(`🔢 Added addon to group ${groupId} at position ${preservedPosition !== null ? preservedPosition : 'bottom'}`)
      })

      res.json({ message: 'Addon added to group successfully' })
    } catch (error) {
      console.error('Error adding addon to group:', error)
      res.status(500).json({ message: 'Failed to add addon to group', error: error?.message })
    }
  });

  // Remove addon from group
  router.delete('/:groupId/addons/:addonId', async (req, res) => {
    try {
      const { groupId, addonId } = req.params
      
      // Check if group exists
      const group = await prisma.group.findUnique({
        where: { 
          id: groupId,
          accountId: getAccountId(req)
        }
      })
      
      if (!group) {
        return responseUtils.notFound(res, 'Group')
      }

      // Find and remove the group-addon relationship
      const groupAddon = await prisma.groupAddon.findFirst({
        where: {
          groupId: groupId,
          addonId: addonId
        }
      })

      if (!groupAddon) {
        return responseUtils.notFound(res, 'Addon in this group')
      }

      await prisma.groupAddon.delete({
        where: { 
          groupId_addonId: {
            groupId: groupId,
            addonId: addonId
          }
        }
      })

      res.json({ message: 'Addon removed from group successfully' })
    } catch (error) {
      console.error('Error removing addon from group:', error)
      res.status(500).json({ message: 'Failed to remove addon from group', error: error?.message })
    }
  });

  // Enable group
  router.put('/:id/enable', async (req, res) => {
    try {
      const { id } = req.params
      
      const group = await prisma.group.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })
      
      if (!group) {
        return responseUtils.notFound(res, 'Group')
      }

      await prisma.group.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: { isActive: true }
      })

      res.json({ message: 'Group enabled successfully' })
    } catch (error) {
      console.error('Error enabling group:', error)
      res.status(500).json({ message: 'Failed to enable group', error: error?.message })
    }
  });

  // Disable group
  router.put('/:id/disable', async (req, res) => {
    try {
      const { id } = req.params
      
      const group = await prisma.group.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })
      
      if (!group) {
        return responseUtils.notFound(res, 'Group')
      }

      await prisma.group.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: { isActive: false }
      })

      res.json({ message: 'Group disabled successfully' })
    } catch (error) {
      console.error('Error disabling group:', error)
      res.status(500).json({ message: 'Failed to disable group', error: error?.message })
    }
  });

  // Sync group - iterate users in this group and call the shared user sync function
  router.post('/:id/sync', async (req, res) => {
    try {
      const { id: groupId } = req.params
      const result = await syncGroupUsers(groupId, req)
      if (result?.error) return responseUtils.notFound(res, 'Group')
      return res.json(result)
    } catch (error) {
      console.error('Error syncing group:', error)
      res.status(500).json({ message: 'Failed to sync group', error: error?.message })
    }
  });

  // Group sync-status: aggregate user statuses via shared getUserSyncStatus
  router.get('/:id/sync-status', async (req, res) => {
    try {
      const { id } = req.params
      const group = await prisma.group.findUnique({
        where: { id, accountId: getAccountId(req) },
        include: { addons: { include: { addon: true } } }
      })
      if (!group) return responseUtils.notFound(res, 'Group')

      // Resolve userIds JSON
      let userIds = []
      try { userIds = Array.isArray(group.userIds) ? group.userIds : JSON.parse(group.userIds || '[]') } catch {}

      const { createGetGroupSyncStatus } = require('../utils/sync')
      const getGroupSyncStatus = createGetGroupSyncStatus({
        prisma,
        getAccountId,
        decrypt,
        parseAddonIds,
        parseProtectedAddons,
        getDecryptedManifestUrl: (addon) => addon?.manifestUrl,
        canonicalizeManifestUrl,
        StremioAPIClient,
      })

      const aggregated = await getGroupSyncStatus(id, req)
      if (aggregated?.error) return res.status(404).json({ message: aggregated.error })
      res.json(aggregated)
    } catch (error) {
      console.error('Error fetching group sync status:', error)
      res.status(500).json({ message: 'Failed to fetch group sync status' })
    }
  })

  // Reorder addons in group (by manifest URL order) and sync users
  router.post('/:id/addons/reorder', async (req, res) => {
    try {
      const { id: groupId } = req.params
      const { orderedManifestUrls, orderedAddonIds } = req.body || {}

      // Support both orderedManifestUrls (legacy) and orderedAddonIds (new)
      const orderedIds = orderedAddonIds || orderedManifestUrls
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({ message: 'orderedAddonIds or orderedManifestUrls array is required' })
      }

      // Ensure group exists and is scoped to the account
      const group = await prisma.group.findUnique({
        where: { id: groupId, accountId: getAccountId(req) },
        include: { addons: { include: { addon: true } } }
      })
      if (!group) return responseUtils.notFound(res, 'Group')
      
      console.log(`Reordering group ${group.name}:`)

      // Validate addon IDs against current addons list
      const currentAddonIds = new Set((group.addons || []).map(ga => ga.addonId))
      const invalid = orderedIds.filter(id => !currentAddonIds.has(id))
      if (invalid.length) {
        return res.status(400).json({ message: 'Some addon IDs are not in group addons', invalid })
      }

      // Persist order by storing position Int on GroupAddon
      try {
        const addonIdToGroupAddon = new Map()
        for (const ga of group.addons) {
          addonIdToGroupAddon.set(ga.addonId, ga)
        }
        
        let pos = 0
        const oldOrder = []
        const newOrder = []
        
        // Build old order from current positions
        const sortedByPosition = [...group.addons].sort((a, b) => (a.position || 0) - (b.position || 0))
        for (const ga of sortedByPosition) {
          oldOrder.push(ga.addon.name)
        }
        
        // Update positions and build new order
        for (const addonId of orderedIds) {
          const ga = addonIdToGroupAddon.get(addonId)
          if (!ga) continue
          newOrder.push(ga.addon.name)
          await prisma.groupAddon.update({ where: { id: ga.id }, data: { position: pos++ } })
        }
        
        console.log('Current order:')
        oldOrder.forEach(name => console.log(`- ${name}`))
        console.log('New order:')
        newOrder.forEach(name => console.log(`- ${name}`))
      } catch (e) {
        console.warn('Order persistence failed (position):', e?.message)
      }

      // Optional: trigger sync for all active users of this group
      try {
        const userIds = Array.isArray(group.userIds) ? group.userIds : JSON.parse(group.userIds || '[]')
        if (Array.isArray(userIds) && userIds.length > 0) {
          // Fire-and-forget; don’t block response
          setTimeout(async () => {
            try {
              for (const uid of userIds) {
                // We avoid importing here; just ask users router to sync using default mode
                await prisma.$executeRaw`SELECT 1` // noop to keep connection alive in some pools
              }
            } catch {}
          }, 0)
        }
      } catch {}

      res.json({ message: 'Addons reordered successfully', groupId, reorderedCount: orderedIds.length })
    } catch (error) {
      console.error('Error reordering addons:', error)
      res.status(500).json({ message: 'Failed to reorder addons', error: error?.message })
    }
  });

  // Alias route for compatibility: accept either orderedManifestUrls or addonIds
  router.post('/:id/reorder-addons', async (req, res) => {
    try {
      const { id } = req.params
      const { orderedManifestUrls, addonIds, orderedAddonIds } = req.body || {}
      
      // Use orderedAddonIds first, then orderedManifestUrls, then addonIds
      const urls = orderedAddonIds || (Array.isArray(orderedManifestUrls) && orderedManifestUrls.length > 0
        ? orderedManifestUrls
        : Array.isArray(addonIds) ? addonIds : [])
      // Forward to primary handler shape by replacing req.body then calling next middleware stack manually is complex here;
      // so we re-run the same logic inline by crafting a request to the same endpoint.
      req.body = { orderedManifestUrls: urls }
      // Call the canonical handler logic by invoking the same function body
      const { orderedManifestUrls: urlsNorm } = req.body
      if (!Array.isArray(urlsNorm) || urlsNorm.length === 0) {
        return res.status(400).json({ message: 'orderedManifestUrls array is required' })
      }

      const group = await prisma.group.findUnique({
        where: { id, accountId: getAccountId(req) },
        include: { addons: { include: { addon: true } } }
      })
      if (!group) return responseUtils.notFound(res, 'Group')
      
      console.log(`Reordering group ${group.name}:`)

      // Check if urlsNorm contains addon IDs (from orderedAddonIds) or URLs (from orderedManifestUrls)
      const isAddonIds = urlsNorm[0] && /^[a-zA-Z0-9]+$/.test(urlsNorm[0])
      
      // Validate IDs/URLs against current addons list
      if (isAddonIds) {
        // Handle as addon IDs
        const currentAddonIds = new Set((group.addons || []).map(ga => ga.addonId))
        const invalid = urlsNorm.filter(id => !currentAddonIds.has(id))
        if (invalid.length) return res.status(400).json({ message: 'Some addon IDs are not in group addons', invalid })
      } else {
        // Handle as URLs (legacy)
        const currentUrls = (group.addons || [])
          .map(ga => { try { return getDecryptedManifestUrl(ga.addon, req) } catch { return ga.addon?.manifestUrl } })
          .filter(Boolean)
        const invalid = urlsNorm.filter(u => !currentUrls.includes(u))
        if (invalid.length) return res.status(400).json({ message: 'Some URLs are not in group addons', invalid })
      }

      // Persist order via position as above
      try {
        const oldOrder = []
        const newOrder = []
        
        // Build old order from current positions
        const sortedByPosition = [...group.addons].sort((a, b) => (a.position || 0) - (b.position || 0))
        for (const ga of sortedByPosition) {
          oldOrder.push(ga.addon.name)
        }
        
        if (isAddonIds) {
          // Map by addon ID
          const addonIdToGroupAddon = new Map()
          for (const ga of group.addons) {
            addonIdToGroupAddon.set(ga.addonId, ga)
          }
          
          let pos = 0
          for (const addonId of urlsNorm) {
            const ga = addonIdToGroupAddon.get(addonId)
            if (!ga) continue
            newOrder.push(ga.addon.name)
            await prisma.groupAddon.update({ where: { id: ga.id }, data: { position: pos++ } })
          }
        } else {
          // Map by URL (legacy)
          const urlToGroupAddons = new Map()
          for (const ga of group.addons) {
            const url = (() => { try { return getDecryptedManifestUrl(ga.addon, req) } catch { return ga.addon?.manifestUrl } })()
            if (url) {
              if (!urlToGroupAddons.has(url)) {
                urlToGroupAddons.set(url, [])
              }
              urlToGroupAddons.get(url).push(ga)
            }
          }
          
          let pos = 0
          const processedGroupAddonIds = new Set()
          for (const url of urlsNorm) {
            const groupAddons = urlToGroupAddons.get(url) || []
            // For each URL, try to find an unprocessed group addon
            for (const ga of groupAddons) {
              if (processedGroupAddonIds.has(ga.id)) continue
              newOrder.push(ga.addon.name)
              await prisma.groupAddon.update({ where: { id: ga.id }, data: { position: pos++ } })
              processedGroupAddonIds.add(ga.id)
              break // Only process one addon per URL in the order
            }
          }
        }
        
        console.log('Current order:')
        oldOrder.forEach(name => console.log(`- ${name}`))
        console.log('New order:')
        newOrder.forEach(name => console.log(`- ${name}`))
      } catch (e) {
        console.error('Order persistence failed (position):', e?.message)
      }

      res.json({ message: 'Addons reordered successfully', groupId: id, reorderedCount: urlsNorm.length })
    } catch (error) {
      console.error('Error reordering addons (alias):', error)
      res.status(500).json({ message: 'Failed to reorder addons', error: error?.message })
    }
  })

  // Simple health probe for groups router
  router.get('/health', (req, res) => {
    return res.json({ ok: true })
  })

  // Update user's excluded addons
  router.put('/:groupId/users/:userId/excluded-addons', async (req, res) => {
    try {
      const { groupId, userId } = req.params
      const { excludedAddons } = req.body
      
      // Check if group exists
      const group = await prisma.group.findUnique({
        where: { 
          id: groupId,
          accountId: getAccountId(req)
        }
      })
      
      if (!group) {
        return responseUtils.notFound(res, 'Group')
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { 
          id: userId,
          accountId: getAccountId(req)
        }
      })
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' })
      }

      // Update user's excluded addons
      await prisma.user.update({
        where: { id: userId },
        data: { 
          excludedAddons: Array.isArray(excludedAddons) ? JSON.stringify(excludedAddons) : null
        }
      })

      res.json({ message: 'Excluded addons updated successfully' })
    } catch (error) {
      console.error('Error updating excluded addons:', error)
      res.status(500).json({ message: 'Failed to update excluded addons', error: error?.message })
    }
  });

  // Toggle group status
  router.patch('/:id/toggle-status', async (req, res) => {
    try {
      const { id } = req.params
      const { isActive } = req.body
      
      
      // Update group status
      const updatedGroup = await prisma.group.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: { isActive: isActive },
        include: {
          addons: {
            include: {
              addon: true
            }
          }
        }
      })
      
      res.json(updatedGroup)
    } catch (error) {
      console.error('Error toggling group status:', error)
      res.status(500).json({ error: 'Failed to toggle group status', details: error?.message })
    }
  });

  // Get group addons directly
  router.get('/:id/addons', async (req, res) => {
    try {
      const { id } = req.params
      const group = await findGroupById(prisma, id, getAccountId(req))
      if (!group) return sendError(res, 404, 'Group not found')
      
      // Use shared helper to get ordered addons for this group
      const { getGroupAddons } = require('../utils/helpers')
      const filteredAddonsSorted = await getGroupAddons(prisma, id, req)
      
      res.json({ addons: filteredAddonsSorted })
    } catch (error) {
      console.error('Error fetching group addons:', error)
      res.status(500).json({ message: 'Failed to fetch group addons', error: error?.message })
    }
  })

  // Sync all groups
  router.post('/sync-all', async (req, res) => {
    try {
      const groups = await prisma.group.findMany({
        where: scopedWhere(req, {}),
        select: { id: true }
      });

      if (groups.length === 0) {
        return res.json({
          message: 'No groups found to sync',
          syncedGroups: 0,
          failedGroups: 0,
          totalGroups: 0
        });
      }

      let syncedGroups = 0;
      let failedGroups = 0;
      let totalUsersSynced = 0;
      let totalUsersFailed = 0;

      for (const group of groups) {
        try {
          const result = await syncGroupUsers(group.id, req)
          if (result?.error) {
            failedGroups++
          } else {
            syncedGroups++
            totalUsersSynced += (result.syncedUsers || 0)
            totalUsersFailed += (result.failedUsers || 0)
            console.log(result.message)
          }
        } catch (error) {
          console.error(`Failed to sync group ${group.id}:`, error);
          failedGroups++;
        }
      }

      res.json({
        message: `Synced ${syncedGroups} groups successfully, ${failedGroups} failed. Total users: ${totalUsersSynced} synced, ${totalUsersFailed} failed`,
        syncedGroups,
        failedGroups,
        totalGroups: groups.length,
        totalUsersSynced,
        totalUsersFailed
      });
    } catch (error) {
      console.error('Error syncing all groups:', error);
      res.status(500).json({ message: 'Failed to sync all groups', error: error?.message });
    }
  });
  // Exportable helper to sync one group's users (used by scheduler)
  async function externalSyncGroupUsers(prismaDep, getAccountIdDep, scopedWhereDep, decryptDep, groupId, reqDep) {
    // Load group
    const group = await prismaDep.group.findUnique({ where: { id: groupId, accountId: getAccountIdDep(reqDep) }, select: { id: true, userIds: true, name: true } })
    if (!group) return { error: 'Group not found', groupId }
    // Parse users
    let userIds = []
    try { userIds = Array.isArray(group.userIds) ? group.userIds : JSON.parse(group.userIds || '[]') } catch {}
    const uniqueUserIds = [...new Set(userIds)]
    // Mode/unsafe: prefer DB account sync config; fallback to request header/body
    let syncMode = 'normal'
    let unsafeMode = false
    try {
      const accountId = reqDep.appAccountId
      if (accountId) {
        const acc = await prismaDep.appAccount.findUnique({ where: { id: accountId }, select: { sync: true } })
        let cfg = acc?.sync || null
        if (cfg && typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch { cfg = null } }
        if (cfg && typeof cfg === 'object') {
          syncMode = cfg.mode === 'advanced' ? 'advanced' : 'normal'
          unsafeMode = (typeof cfg.safe === 'boolean') ? !cfg.safe : !!cfg.unsafe
        }
      }
    } catch {}
    if (!syncMode) syncMode = 'normal'
    // Final fallback to request if DB not present
    if (!reqDep.appAccountId) {
      const headerMode = (reqDep.headers?.['x-sync-mode'] || '').toString().toLowerCase()
      syncMode = headerMode === 'advanced' ? 'advanced' : 'normal'
      unsafeMode = reqDep.body?.unsafe === true
    }
    // Log before any reload
    console.log(`\nSyncing group ${group.name || groupId}`)
    // Advanced: reload and capture diffs
    let reloadInfo = null
    if (syncMode === 'advanced') {
      const { reloadGroupAddons } = require('./users')
      try { reloadInfo = await reloadGroupAddons(prismaDep, getAccountIdDep, groupId, reqDep, decryptDep) } catch {}
    }
    // Sync users
    const { syncUserAddons } = require('./users')
    let synced = 0, failed = 0
    for (const uid of uniqueUserIds) {
      try {
        const r = await syncUserAddons(prismaDep, uid, [], unsafeMode, reqDep, decryptDep, getAccountIdDep)
        if (r?.success) synced++; else failed++
      } catch { failed++ }
    }
    return { groupId, syncedUsers: synced, failedUsers: failed, reloadDiffs: reloadInfo?.diffsByAddon || [] }
  }

  // Attach export
  module.exports.syncGroupUsers = externalSyncGroupUsers;
  // Also attach to the returned router instance for factory consumers
  router.syncGroupUsers = externalSyncGroupUsers;

  return router;
};
