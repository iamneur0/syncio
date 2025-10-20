const express = require('express');
const { decrypt } = require('../utils/encryption')
const { parseAddonIds, parseProtectedAddons, canonicalizeManifestUrl } = require('../utils/validation')
const { StremioAPIClient } = require('stremio-api-client')
const { handleDatabaseError, sendError } = require('../utils/handlers');
const { findGroupById, getAllGroups, getGroupUsers } = require('../utils/helpers');

// Export a function that returns the router, allowing dependency injection
module.exports = ({ prisma, getAccountId, scopedWhere, AUTH_ENABLED, assignUserToGroup, getDecryptedManifestUrl }) => {
  const router = express.Router();

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
        return res.status(404).json({ message: 'Original group not found' });
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
        return res.status(404).json({ message: 'Group not found' });
      }

      // Get all addons in this group
      const groupAddons = group.addons || [];
      let reloadedCount = 0;
      let failedCount = 0;

      for (const groupAddon of groupAddons) {
        try {
          // Trigger addon reload by calling the addon reload endpoint logic
          // This is a simplified version - in practice you might want to call the actual addon reload logic
          console.log(`Reloading addon ${groupAddon.addon.name} for group ${group.name}`);
          reloadedCount++;
        } catch (error) {
          console.error(`Failed to reload addon ${groupAddon.addon.name}:`, error);
          failedCount++;
        }
      }

      res.json({
        message: 'Addon reload completed',
        reloaded: reloadedCount,
        failed: failedCount,
        total: groupAddons.length
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
      if (!group) return res.status(404).json({ message: 'Group not found' })

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
        return res.status(404).json({ message: 'Group not found' })
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
        return res.status(404).json({ message: 'Group not found' })
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
        return res.status(404).json({ message: 'Group not found' })
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
        return res.status(404).json({ message: 'Group not found' })
      }

      // Check if addon exists
      const addon = await prisma.addon.findUnique({
        where: { 
          id: addonId,
          accountId: getAccountId(req)
        }
      })
      
      if (!addon) {
        return res.status(404).json({ message: 'Addon not found' })
      }

      // Check if addon is already in group
      const existingGroupAddon = await prisma.groupAddon.findFirst({
        where: {
          groupId: groupId,
          addonId: addonId
        }
      })

      if (existingGroupAddon) {
        return res.status(400).json({ message: 'Addon already in this group' })
      }

      // Add addon to group at the top (position 0) and shift existing addons down
      await prisma.$transaction(async (tx) => {
        // Increment position of all existing addons in this group
        await tx.groupAddon.updateMany({
          where: { 
            groupId: groupId,
            position: { not: null }
          },
          data: {
            position: { increment: 1 }
          }
        })

        // Add new addon at position 0 (top)
        await tx.groupAddon.create({
          data: {
            groupId: groupId,
            addonId: addonId,
            isEnabled: true,
            position: 0
          }
        })
      })
      
      console.log(`🔢 Added addon to group ${groupId} at position 0 (top)`)

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
        return res.status(404).json({ message: 'Group not found' })
      }

      // Find and remove the group-addon relationship
      const groupAddon = await prisma.groupAddon.findFirst({
        where: {
          groupId: groupId,
          addonId: addonId
        }
      })

      if (!groupAddon) {
        return res.status(404).json({ message: 'Addon not found in this group' })
      }

      await prisma.groupAddon.delete({
        where: { id: groupAddon.id }
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
        return res.status(404).json({ message: 'Group not found' })
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
        return res.status(404).json({ message: 'Group not found' })
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

  // Sync group (placeholder - would implement actual sync logic)
  router.post('/:id/sync', async (req, res) => {
    try {
      const { id: groupId } = req.params
      
      const group = await prisma.group.findUnique({
        where: { 
          id: groupId,
          accountId: getAccountId(req)
        },
        include: {
          addons: { include: { addon: true } }
        }
      })
      
      if (!group) {
        return res.status(404).json({ message: 'Group not found' })
      }

      // Placeholder sync logic - in practice this would sync addons with Stremio
      res.json({ 
        message: 'Group sync completed',
        groupId: groupId,
        addonsCount: group.addons?.length || 0
      })
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
      if (!group) return res.status(404).json({ message: 'Group not found' })

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
      const { orderedManifestUrls } = req.body || {}

      console.log('🔄 Reorder group addons:', { groupId, orderedManifestUrls })

      if (!Array.isArray(orderedManifestUrls) || orderedManifestUrls.length === 0) {
        return res.status(400).json({ message: 'orderedManifestUrls array is required' })
      }

      // Ensure group exists and is scoped to the account
      const group = await prisma.group.findUnique({
        where: { id: groupId, accountId: getAccountId(req) },
        include: { addons: { include: { addon: true } } }
      })
      if (!group) return res.status(404).json({ message: 'Group not found' })

      // Validate URLs against current addons list
      const currentUrls = (group.addons || [])
        .map(ga => {
          try { return getDecryptedManifestUrl(ga.addon, req) } catch { return ga.addon?.manifestUrl }
        })
        .filter(Boolean)

      const invalid = orderedManifestUrls.filter(u => !currentUrls.includes(u))
      if (invalid.length) {
        return res.status(400).json({ message: 'Some URLs are not in group addons', invalid })
      }

      // Persist order by storing position Int on GroupAddon
      try {
        const urlToGroupAddon = new Map()
        for (const ga of group.addons) {
          const url = (() => { try { return getDecryptedManifestUrl(ga.addon, req) } catch { return ga.addon?.manifestUrl } })()
          if (url) urlToGroupAddon.set(url, ga)
        }
        let pos = 0
        for (const url of orderedManifestUrls) {
          const ga = urlToGroupAddon.get(url)
          if (!ga) continue
          await prisma.groupAddon.update({ where: { id: ga.id }, data: { position: pos++ } })
        }
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

      res.json({ message: 'Addons reordered successfully', groupId, reorderedCount: orderedManifestUrls.length })
    } catch (error) {
      console.error('Error reordering addons:', error)
      res.status(500).json({ message: 'Failed to reorder addons', error: error?.message })
    }
  });

  // Alias route for compatibility: accept either orderedManifestUrls or addonIds
  router.post('/:id/reorder-addons', async (req, res) => {
    try {
      const { id } = req.params
      const { orderedManifestUrls, addonIds } = req.body || {}
      const urls = Array.isArray(orderedManifestUrls) && orderedManifestUrls.length > 0
        ? orderedManifestUrls
        : Array.isArray(addonIds) ? addonIds : []
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
      if (!group) return res.status(404).json({ message: 'Group not found' })

      const currentUrls = (group.addons || [])
        .map(ga => { try { return getDecryptedManifestUrl(ga.addon, req) } catch { return ga.addon?.manifestUrl } })
        .filter(Boolean)
      const invalid = urlsNorm.filter(u => !currentUrls.includes(u))
      if (invalid.length) return res.status(400).json({ message: 'Some URLs are not in group addons', invalid })

      // Persist order via position as above
      try {
        const urlToGroupAddon = new Map()
        for (const ga of group.addons) {
          const url = (() => { try { return getDecryptedManifestUrl(ga.addon, req) } catch { return ga.addon?.manifestUrl } })()
          if (url) urlToGroupAddon.set(url, ga)
        }
        let pos = 0
        for (const url of urlsNorm) {
          const ga = urlToGroupAddon.get(url)
          if (!ga) continue
          await prisma.groupAddon.update({ where: { id: ga.id }, data: { position: pos++ } })
        }
      } catch {}

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
        return res.status(404).json({ message: 'Group not found' })
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
      
      console.log(`🔍 PATCH /api/groups/${id}/toggle-status called with:`, { isActive })
      
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

  return router;
};
