const express = require('express');
const { StremioAPIClient } = require('stremio-api-client');
const { handleDatabaseError, sendError, createRouteHandler, DatabaseTransactions } = require('../utils/handlers');
const { findAddonById, getAllAddons, sanitizeUrl, validateAccountContext } = require('../utils/helpers');
const { canonicalizeManifestUrl } = require('../utils/validation');

// Export a function that returns the router, allowing dependency injection
module.exports = ({ prisma, getAccountId, decrypt, encrypt, getDecryptedManifestUrl, scopedWhere, AUTH_ENABLED, manifestHash, filterManifestByResources, filterManifestByCatalogs }) => {
  const router = express.Router();


  // Get all addons
  router.get('/', async (req, res) => {
    try {
      const whereScope = getAccountId(req) ? { accountId: getAccountId(req) } : {}
      const addons = await prisma.addon.findMany({
        where: scopedWhere(req, {}),
        // return all addons, both active and inactive
        include: {
          groupAddons: {
            include: {
              group: {
                include: {
                  _count: {
                    select: {
                        addons: true
                    }
                  }
                }
              }
            }
          }
        },
          orderBy: { id: 'asc' }
      });

      const transformedAddons = await Promise.all(addons.map(async addon => {
        // Filter groupAddons to only include those from the current account
        const currentAccountId = getAccountId(req)
        const filteredGroupAddons = addon.groupAddons.filter(ga => 
          ga.group && ga.group.accountId === currentAccountId
        )

        // Calculate total users across all groups that contain this addon (only from current account)
        let totalUsers = 0
        
        if (filteredGroupAddons && filteredGroupAddons.length > 0) {
          // Get all unique user IDs from all groups that contain this addon
          const allUserIds = new Set()
          
          for (const groupAddon of filteredGroupAddons) {
            if (groupAddon.group && groupAddon.group.userIds) {
              try {
                const userIds = JSON.parse(groupAddon.group.userIds)
                if (Array.isArray(userIds)) {
                  userIds.forEach(userId => allUserIds.add(userId))
                }
              } catch (e) {
                console.error('Error parsing group userIds for addon:', e)
              }
            }
          }
          
          // Count active users
          if (allUserIds.size > 0) {
            const activeUsers = await prisma.user.findMany({
              where: {
                id: { in: Array.from(allUserIds) },
                isActive: true,
                accountId: getAccountId(req)
              },
              select: { id: true }
            })
            totalUsers = activeUsers.length
          }
        }
        
        return {
          id: addon.id,
          name: addon.name,
          description: addon.description,
        manifestUrl: getDecryptedManifestUrl(addon, req),
        url: getDecryptedManifestUrl(addon, req), // Keep both for compatibility
          version: addon.version,
          iconUrl: addon.iconUrl,
          status: addon.isActive ? 'active' : 'inactive',
          users: totalUsers,
          groups: filteredGroupAddons.length,
          accountId: addon.accountId
        }
      }));

      res.json(transformedAddons);
    } catch (error) {
      console.error('Error fetching addons:', error);
      res.status(500).json({ message: 'Failed to fetch addons' });
    }
  });

  // Enable addon (set isActive=true)
  router.put('/:id/enable', async (req, res) => {
    try {
      const { id } = req.params
      const existing = await prisma.addon.findUnique({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })
      if (!existing) return res.status(404).json({ message: 'Addon not found' })

      const updated = await prisma.addon.update({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }, 
        data: { isActive: true } 
      })
      return res.json({
        id: updated.id,
        name: updated.name,
        description: updated.description,
        url: getDecryptedManifestUrl(updated, req),
        version: updated.version,
        status: updated.isActive ? 'active' : 'inactive',
        users: 0,
        groups: 0
      })
    } catch (error) {
      console.error('Error enabling addon:', error)
      return res.status(500).json({ message: 'Failed to enable addon' })
    }
  })

  // Disable addon (soft disable, stays in DB and groups)
  router.put('/:id/disable', async (req, res) => {
    try {
      const { id } = req.params
      const existing = await prisma.addon.findUnique({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })
      if (!existing) return res.status(404).json({ message: 'Addon not found' })

      const updated = await prisma.addon.update({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }, 
        data: { isActive: false } 
      })
      return res.json({
        id: updated.id,
        name: updated.name,
        description: updated.description,
        url: getDecryptedManifestUrl(updated, req),
        version: updated.version,
        status: updated.isActive ? 'active' : 'inactive',
        users: 0,
        groups: 0
      })
    } catch (error) {
      console.error('Error disabling addon:', error)
      return res.status(500).json({ message: 'Failed to disable addon' })
    }
  })

  // Toggle addon status (enable/disable)
  router.patch('/:id/toggle-status', async (req, res) => {
    try {
      const { id } = req.params
      const { isActive } = req.body
      
      console.log(`🔍 PATCH /api/addons/${id}/toggle-status called with:`, { isActive })
      
      const existing = await prisma.addon.findUnique({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }
      })
      if (!existing) return res.status(404).json({ message: 'Addon not found' })

      const updated = await prisma.addon.update({ 
        where: { 
          id,
          accountId: getAccountId(req)
        }, 
        data: { isActive: isActive } 
      })
      
      return res.json({
        id: updated.id,
        name: updated.name,
        description: updated.description,
        url: getDecryptedManifestUrl(updated, req),
        version: updated.version,
        status: updated.isActive ? 'active' : 'inactive',
        users: 0,
        groups: 0
      })
    } catch (error) {
      console.error('Error toggling addon status:', error)
      return res.status(500).json({ message: 'Failed to toggle addon status' })
    }
  })

  // Create new addon
  router.post('/', async (req, res) => {
    try {
      const { url, name, description, groupIds, manifestData: providedManifestData } = req.body;
    
      if (!url) {
        return res.status(400).json({ message: 'Addon URL is required' });
      }

      // Validate account context
      const accountValidation = validateAccountContext(req, AUTH_ENABLED);
      if (!accountValidation.isValid) {
        return sendError(res, 401, accountValidation.error);
      }

      // Use centralized URL sanitization
      const sanitizedUrl = sanitizeUrl(url);
      if (!sanitizedUrl) {
        return sendError(res, 400, 'Invalid URL provided');
      }
      
      const lowerUrl = sanitizedUrl.toLowerCase()

      // Check for duplicate addon name instead of URL
      const existingByName = await prisma.addon.findFirst({ 
        where: { 
          name: name.trim(),
          accountId: getAccountId(req)
        } 
      })

      // Use provided manifest data if available, otherwise fetch it
      let manifestData = providedManifestData
      if (!manifestData) {
        try {
          console.log(`🔍 Fetching manifest for new addon: ${sanitizedUrl}`)
          const resp = await fetch(sanitizedUrl)
          if (!resp.ok) {
            return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' })
          }
          manifestData = await resp.json()
          console.log(`✅ Fetched manifest:`, manifestData?.name, manifestData?.version)
        } catch (e) {
          return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' })
        }
      }

      // Note: we build dbData after we compute filtered/resources/catalogs further below

      if (existingByName) {
        if (existingByName.isActive) {
          // Addon with this name already exists and is active
          return res.status(409).json({ message: 'Addon with this name already exists.' })
        } else {
        // Reactivate and refresh meta for inactive record
        const reactivated = await prisma.addon.update({
          where: { 
            id: existingByName.id,
            accountId: getAccountId(req)
          },
          data: {
            isActive: true,
            // Use provided name or manifest name when reactivating
            name: (name && name.trim()) ? name.trim() : (manifestData?.name || existingByName.name),
            description: description || manifestData?.description || existingByName.description || '',
            version: manifestData?.version || existingByName.version || null,
            iconUrl: manifestData?.logo || existingByName.iconUrl || null, // Store logo URL from manifest
            stremioAddonId: manifestData?.id || existingByName.stremioAddonId || null
          },
          select: { id: true, name: true, description: true, manifestUrl: true, version: true, isActive: true }
        })

        // Handle group assignments for reactivated addon
        let assignedGroups = [];
        if (groupIds && Array.isArray(groupIds) && groupIds.length > 0) {
          try {
            console.log(`🔍 Assigning reactivated addon to groups:`, groupIds);
            
            // Create group addon relationships
            for (const groupId of groupIds) {
              try {
                // Check if relationship already exists
                const existingGroupAddon = await prisma.groupAddon.findFirst({
                  where: {
                    groupId: groupId,
                    addonId: reactivated.id
                  }
                });

                if (!existingGroupAddon) {
                  // Get the next available position for this group
                  const maxPosition = await prisma.groupAddon.aggregate({
                    where: { 
                      groupId: groupId,
                      position: { not: null }
                    },
                    _max: { position: true }
                  })
                  const nextPosition = (maxPosition._max.position ?? -1) + 1
                  
                  await prisma.groupAddon.create({
                    data: {
                      groupId: groupId,
                      addonId: reactivated.id,
                      isEnabled: true,
                      position: nextPosition
                    }
                  });
                  assignedGroups.push(groupId);
                }
              } catch (groupError) {
                console.error(`Error assigning addon to group ${groupId}:`, groupError);
              }
            }
          } catch (error) {
            console.error('Error handling group assignments:', error);
          }
        }

        return res.json({
          message: 'Addon reactivated successfully',
          addon: {
            id: reactivated.id,
            name: reactivated.name,
            description: reactivated.description,
            url: getDecryptedManifestUrl(reactivated, req),
            version: reactivated.version,
            status: reactivated.isActive ? 'active' : 'inactive',
            users: 0,
            groups: assignedGroups.length
          },
          assignedGroups
        });
      }
      }

      // Filter manifest according to selected resources
      let filtered = manifestData
      if (Array.isArray(manifestData?.resources) && manifestData.resources.length > 0) {
        filtered = filterManifestByResources(manifestData, manifestData.resources)
      }

      // Extract simplified resources and catalogs for storage
      const simplifiedResources = (() => {
        try {
          const src = Array.isArray(manifestData?.resources) ? manifestData.resources : []
          return src.map(r => {
            if (typeof r === 'string') return r
            if (r && typeof r === 'object' && r.name) return r.name
            return null
          }).filter(Boolean)
        } catch { return [] }
      })()
      
      const simplifiedCatalogs = (() => {
        try {
          const src = Array.isArray(manifestData?.catalogs) ? manifestData.catalogs : []
          return src.map(c => ({ type: c.type, id: c.id })).filter(c => c.type && c.id)
        } catch { return [] }
      })()

      // Centralize DB data build (consistent with repair and elsewhere)
      const { buildAddonDbData } = require('../utils/stremio')
      const dbData = buildAddonDbData(req, {
        name: (name && name.trim()) ? name.trim() : (manifestData?.name || 'Unknown'),
        description,
        sanitizedUrl,
        manifestObj: manifestData,
        filteredManifest: filtered,
        iconUrl: manifestData?.logo,
        version: manifestData?.version,
        stremioAddonId: manifestData?.id,
        isActive: true,
        resources: simplifiedResources,
        catalogs: simplifiedCatalogs
      })

      // Create new addon using centralized builder
      const newAddon = await prisma.addon.create({ data: dbData })

      // Handle group assignments for new addon
      let assignedGroups = [];
      if (groupIds && Array.isArray(groupIds) && groupIds.length > 0) {
        try {
          console.log(`🔍 Assigning new addon to groups:`, groupIds);
          
          // Create group addon relationships
          for (const groupId of groupIds) {
            try {
              // Get the next available position for this group
              const maxPosition = await prisma.groupAddon.aggregate({
                where: { 
                  groupId: groupId,
                  position: { not: null }
                },
                _max: { position: true }
              })
              const nextPosition = (maxPosition._max.position ?? -1) + 1
              
              await prisma.groupAddon.create({
                data: {
                  groupId: groupId,
                  addonId: newAddon.id,
                  isEnabled: true,
                  position: nextPosition
                }
              });
              assignedGroups.push(groupId);
            } catch (groupError) {
              console.error(`Error assigning addon to group ${groupId}:`, groupError);
            }
          }
        } catch (error) {
          console.error('Error handling group assignments:', error);
        }
      }

      res.status(201).json({
        message: 'Addon created successfully',
        addon: {
          id: newAddon.id,
          name: newAddon.name,
          description: newAddon.description,
          url: getDecryptedManifestUrl(newAddon, req),
          version: newAddon.version,
          status: newAddon.isActive ? 'active' : 'inactive',
          users: 0,
          groups: assignedGroups.length
        },
        assignedGroups
      });
    } catch (error) {
      console.error('Error creating addon:', error);
      if (error.code === 'P2002') {
        // If unique constraint (likely manifestUrl) tripped, return a friendly conflict
        return res.status(409).json({ message: 'Addon already exists.' })
      }
      res.status(500).json({ message: 'Failed to create addon', error: error?.message });
    }
  });

  // Reload addon manifest and update content
  router.post('/:id/reload', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Find the addon (scope to account to avoid cross-account mismatches)
      const addon = await prisma.addon.findFirst({
        where: { id, accountId: getAccountId(req) }
      });

      if (!addon) {
        return res.status(404).json({ error: 'Addon not found' });
      }

      if (!addon.isActive) {
        return res.status(400).json({ error: 'Addon is disabled' });
      }

      if (!addon.manifestUrl) {
        return res.status(400).json({ error: 'Addon has no manifest URL' });
      }

      // Resolve decrypted transport URL
      const transportUrl = getDecryptedManifestUrl(addon, req)
      if (!transportUrl) {
        return res.status(400).json({ error: 'Failed to resolve addon URL' })
      }

      // Fetch the latest manifest
      let manifestData = null;
      try {
        console.log(`🔍 Reloading manifest for addon: ${addon.name} (${transportUrl})`);
        const manifestResponse = await fetch(transportUrl);
        if (manifestResponse.ok) {
          manifestData = await manifestResponse.json();
          console.log(`✅ Reloaded manifest:`, manifestData?.name, manifestData?.version);
        } else {
          throw new Error(`HTTP ${manifestResponse.status}: ${manifestResponse.statusText}`);
        }
      } catch (e) {
        console.error(`❌ Failed to fetch manifest:`, e.message);
        return res.status(400).json({ 
          error: 'Failed to fetch addon manifest',
          details: e.message 
        });
      }

      // Filter manifest according to selected resources stored on addon
      let filtered = manifestData
      try {
        const rawSelected = (() => { try { return addon.resources ? JSON.parse(addon.resources) : [] } catch { return [] } })()
        const selected = Array.isArray(rawSelected)
          ? rawSelected.map((r) => (typeof r === 'string' ? r : (r && (r.name || r.type)))).filter(Boolean)
          : []
        console.log(`🔍 Reload filtering with selected resources:`, selected)
        if (Array.isArray(selected) && manifestData) {
          filtered = filterManifestByResources(manifestData, selected)
          console.log(`🔍 Filtered manifest catalogs:`, filtered?.catalogs?.length || 0)
        }
      } catch (e) {
        console.error('Failed to filter manifest on reload:', e)
      }

      // Update the addon with fresh original manifest and derived manifest; preserve display name
      const updatedAddon = await prisma.addon.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: {
          name: addon.name, // explicitly preserve name
          description: manifestData?.description || addon.description,
          version: manifestData?.version || addon.version,
          // Update logo URL from manifest
          iconUrl: manifestData?.logo || addon.iconUrl || null,
          // Store encrypted manifests (original untouched, filtered current)
          originalManifest: encrypt(JSON.stringify(manifestData), req),
          manifest: encrypt(JSON.stringify(filtered), req),
          // Always recompute manifestHash on reload based on filtered manifest
          manifestHash: manifestHash(filtered)
        }
      });

      res.json({
        message: 'Addon reloaded successfully',
        addon: {
          id: updatedAddon.id,
          name: updatedAddon.name,
          description: updatedAddon.description,
          url: updatedAddon.manifestUrl,
          version: updatedAddon.version,
          iconUrl: updatedAddon.iconUrl,
          status: updatedAddon.isActive ? 'active' : 'inactive'
        }
      });
    } catch (error) {
      console.error('Error reloading addon:', error);
      res.status(500).json({ error: 'Failed to reload addon', details: error?.message });
    }
  });

  // Delete addon
  router.delete('/:id', createRouteHandler(async (req, res) => {
    const { id } = req.params;
    const accountId = getAccountId(req);
    
    // Ensure addon exists
    const existing = await findAddonById(prisma, id, accountId);
    if (!existing) {
      return sendError(res, 404, 'Addon not found');
    }

    // Use centralized database transaction
    const dbTransactions = new DatabaseTransactions(prisma);
    await dbTransactions.deleteAddonWithRelations(id, accountId);

    res.json({ message: 'Addon deleted successfully' });
  }));

  // Clone addon endpoint
  router.post('/:id/clone', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Find the original addon
      const originalAddon = await prisma.addon.findUnique({
        where: { 
          id,
          accountId: getAccountId(req)
        }
      });
      
      if (!originalAddon) {
        return res.status(404).json({ message: 'Addon not found' });
      }
      
      // Create a clone with a modified name
      const clonedAddon = await prisma.addon.create({
        data: {
          name: `${originalAddon.name} (Copy)`,
          description: originalAddon.description,
          manifestUrl: originalAddon.manifestUrl,
          manifest: originalAddon.manifest,
          manifestHash: originalAddon.manifestHash,
          version: originalAddon.version,
          iconUrl: originalAddon.iconUrl,
          stremioAddonId: originalAddon.stremioAddonId,
          resources: originalAddon.resources,
          catalogs: originalAddon.catalogs,
          isActive: false, // Clone as inactive by default
          accountId: getAccountId(req)
        }
      });
      
      // Clone group associations
      if (originalAddon.groups && originalAddon.groups.length > 0) {
        await prisma.addon.update({
          where: { id: clonedAddon.id },
          data: {
            groups: {
              connect: originalAddon.groups.map(groupId => ({ id: groupId }))
            }
          }
        });
      }
      
      res.json({ 
        message: 'Addon cloned successfully',
        addon: clonedAddon
      });
    } catch (error) {
      console.error('Error cloning addon:', error);
      res.status(500).json({ message: 'Failed to clone addon', error: error?.message });
    }
  });

  // Get individual addon details
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const addon = await prisma.addon.findUnique({
        where: { id },
        include: {
          groupAddons: {
            include: {
              group: {
                include: {
                  _count: {
                    select: {
                        addons: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!addon) {
        return res.status(404).json({ error: 'Addon not found' });
      }

      // Filter groupAddons to only include those from the current account
      const currentAccountId = getAccountId(req)
      const filteredGroupAddons = addon.groupAddons.filter(ga => 
        ga.group && ga.group.accountId === currentAccountId
      )

      // Calculate total users across all groups that have this addon (only from current account)
      const totalUsers = filteredGroupAddons.reduce((sum, groupAddon) => {
        return sum + (groupAddon.group._count.users || 0)
      }, 0)

      const transformedAddon = {
        id: addon.id,
        name: addon.name,
        description: addon.description,
        url: (() => {
          try {
            if (addon.manifestUrl) return decrypt(addon.manifestUrl, req)
          } catch {}
          return addon.manifestUrl
        })(),
        version: addon.version,
        category: addon.category || 'Other',
        status: addon.isActive ? 'active' : 'inactive',
        users: totalUsers,
        groups: filteredGroupAddons.map(ga => ({
          id: ga.group.id,
          name: ga.group.name
      })),
        resources: (() => { try { return addon.resources ? JSON.parse(addon.resources) : [] } catch { return [] } })(),
        catalogs: (() => { try { return addon.catalogs ? JSON.parse(addon.catalogs) : [] } catch { return [] } })(),
        originalManifest: (() => {
          try {
            if (addon.originalManifest) return JSON.parse(decrypt(addon.originalManifest, req))
          } catch {}
          return null
        })(),
      // include manifest details for UI configuration (resources/types/etc.)
      manifest: (() => {
        let manifestObj = null
        try {
          if (addon.manifest) {
            manifestObj = JSON.parse(decrypt(addon.manifest, req))
          }
        } catch {}
        // Always return an object to avoid null checks client-side
        if (!manifestObj) {
          manifestObj = {
            id: addon.stremioAddonId || addon.name || 'unknown',
            name: addon.name || 'Unknown',
            version: addon.version || 'unknown',
            description: addon.description || '',
            types: [],
              resources: (() => { try { return addon.resources ? JSON.parse(addon.resources) : [] } catch { return [] } })(),
            catalogs: []
          }
        }
        return manifestObj
      })()
      };

      res.json(transformedAddon);
    } catch (error) {
      console.error('Error fetching addon details:', error);
      res.status(500).json({ error: 'Failed to fetch addon details' });
    }
  });

  // Update addon
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, url, version, groupIds, resources, catalogs } = req.body;
      
      console.log(`🔍 PUT /api/addons/${id} called with:`, { name, description, url, groupIds, resources, catalogs });
      console.log(`🔍 AUTH_ENABLED: ${AUTH_ENABLED}, req.appAccountId: ${req.appAccountId}`);

      // Check if addon exists
      const existingAddon = await prisma.addon.findUnique({
        where: { 
          id
        },
        include: { groupAddons: true }
      });

      console.log(`🔍 Found existing addon:`, existingAddon ? { id: existingAddon.id, name: existingAddon.name, accountId: existingAddon.accountId } : 'null');

      if (!existingAddon) {
        return res.status(404).json({ error: 'Addon not found' });
      }

      // If URL is provided, validate scheme and fetch manifest to refresh fields
      let manifestData = null;
      let nextUrl = undefined;
      if (url !== undefined) {
        const trimmedUrl = String(url).trim()
        let sanitizedUrl = trimmedUrl.replace(/^@+/, '')
        
        // Convert stremio:// scheme to https://
        if (sanitizedUrl.toLowerCase().startsWith('stremio://')) {
          sanitizedUrl = sanitizedUrl.replace(/^stremio:\/\//i, 'https://')
        }
        
        const lowerUrl = sanitizedUrl.toLowerCase()

        // If changing URL, ensure no other addon already uses it (including canonical similarity)
        const prevCanon = canonicalizeManifestUrl(getDecryptedManifestUrl(existingAddon) || '')
        const nextCanon = canonicalizeManifestUrl(sanitizedUrl)
        if (nextCanon !== prevCanon) {
          const all = await prisma.addon.findMany({ where: {}, select: { id: true, manifestUrl: true } })
          const conflict = all.find((a) => a.id !== id && canonicalizeManifestUrl(getDecryptedManifestUrl(a, req)) === nextCanon)
          if (conflict) {
            return res.status(409).json({ message: 'Another addon already exists with this (similar) URL.' })
          }
        }

        nextUrl = sanitizedUrl;
        try {
          console.log(`🔍 Reloading manifest for updated URL: ${sanitizedUrl}`);
          const resp = await fetch(sanitizedUrl);
          if (!resp.ok) {
            return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' });
          }
          manifestData = await resp.json();
        } catch (e) {
          return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' });
        }
      }

      // If resources or catalogs provided, re-derive manifest from originalManifest and persist both fields
      let filtered = null
      if (resources !== undefined || catalogs !== undefined) {
        try {
          console.log('🔍 Resources provided, filtering manifest. existingAddon.originalManifest exists:', !!existingAddon.originalManifest)
          
          // Get the original manifest (unfiltered) to re-filter from
          let original = null
          try { 
            if (existingAddon.originalManifest) {
              original = JSON.parse(decrypt(existingAddon.originalManifest, req))
              console.log('🔍 Successfully decrypted originalManifest, has resources:', Array.isArray(original?.resources))
            }
          } catch (e) {
            console.error('🔍 Error decrypting originalManifest:', e.message)
          }
          
          // Fallback: if no originalManifest, use decrypted current manifest
          if (!original) {
            try { 
              if (existingAddon.manifest) {
                original = JSON.parse(decrypt(existingAddon.manifest, req))
                console.log('🔍 Fallback to current manifest, has resources:', Array.isArray(original?.resources))
              }
            } catch (e) {
              console.error('🔍 Error decrypting current manifest:', e.message)
            }
          }
          
          if (original && Array.isArray(original.resources)) {
            const selected = Array.isArray(resources) ? resources : []
            console.log('🔍 Filtering from original manifest with selected resources:', selected)
            filtered = filterManifestByResources(original, selected) || { ...original, catalogs: [], addonCatalogs: [] }
            console.log('🔍 Filtered manifest has catalogs:', Array.isArray(filtered?.catalogs) ? filtered.catalogs.length : 'no catalogs')
            
            // Apply catalog filtering if catalogs are provided
            if (catalogs !== undefined && filtered) {
              const selectedCatalogs = Array.isArray(catalogs) ? catalogs : []
              console.log('🔍 Filtering catalogs with selected catalog IDs:', selectedCatalogs)
              filtered = filterManifestByCatalogs(filtered, selectedCatalogs)
              console.log('🔍 After catalog filtering, manifest has catalogs:', Array.isArray(filtered?.catalogs) ? filtered.catalogs.length : 'no catalogs')
            }
          } else if (Array.isArray(resources)) {
            // If no original manifest available, create a minimal filtered manifest
            const names = resources.map(r => (typeof r === 'string' ? r : (r && (r.name || r.type)))).filter(Boolean)
            console.log('🔍 No original manifest, creating minimal filtered manifest with resources:', names)
            filtered = { 
              id: existingAddon.name || 'unknown.addon',
              name: existingAddon.name || 'Unknown',
              version: existingAddon.version || null,
              description: existingAddon.description || null,
              resources: names,
              catalogs: names.includes('catalog') ? [] : [],
              addonCatalogs: names.includes('addon_catalog') ? [] : []
            }
          }
          
          // Handle case where only catalogs are changed (without resources)
          if (catalogs !== undefined && !resources && original && filtered) {
            const selectedCatalogs = Array.isArray(catalogs) ? catalogs : []
            console.log('🔍 Only catalogs changed, filtering catalogs with selected catalog IDs:', selectedCatalogs)
            filtered = filterManifestByCatalogs(filtered, selectedCatalogs)
            console.log('🔍 After catalog-only filtering, manifest has catalogs:', Array.isArray(filtered?.catalogs) ? filtered.catalogs.length : 'no catalogs')
          }
        } catch (e) {
          console.error('Error filtering manifest from original:', e)
        }
      } else if (manifestData) {
        // If URL changed and we fetched a fresh manifest, derive filtered manifest
        const selected = Array.isArray(resources) ? resources : (() => {
          try { return existingAddon.resources ? JSON.parse(existingAddon.resources) : [] } catch { return [] }
        })()
        if (Array.isArray(selected) && selected.length > 0) {
          filtered = filterManifestByResources(manifestData, selected)
        } else {
          filtered = manifestData
        }
      }

      // Update addon
      const updatedAddon = await prisma.addon.update({
        where: { 
          id,
          accountId: getAccountId(req)
        },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(description !== undefined && { description }),
          ...(nextUrl && { 
            manifestUrl: encrypt(nextUrl, req),
            manifestUrlHash: manifestHash(nextUrl)
          }),
          ...(version !== undefined && { version }),
          ...(resources !== undefined && { 
            resources: JSON.stringify(Array.isArray(resources) ? resources.map(r => {
              if (typeof r === 'string') return r
              if (r && typeof r === 'object' && r.name) return r.name
              return null
            }).filter(Boolean) : []) 
          }),
          ...(catalogs !== undefined && { 
            catalogs: JSON.stringify(Array.isArray(catalogs) ? catalogs.map(c => ({ type: c.type, id: c.id })).filter(c => c.type && c.id) : []) 
          }),
          ...(manifestData && {
            originalManifest: encrypt(JSON.stringify(manifestData), req),
            manifest: encrypt(JSON.stringify(filtered), req),
            manifestHash: manifestHash(filtered)
          }),
          // Update manifest when only resources or catalogs are changed (without URL change)
          ...((resources !== undefined || catalogs !== undefined) && !manifestData && filtered && {
            manifest: encrypt(JSON.stringify(filtered), req),
            manifestHash: manifestHash(filtered),
            // Keep originalManifest as is when only resources/catalogs change
            originalManifest: existingAddon.originalManifest
          })
        }
      });

      // Handle group assignments
      if (groupIds !== undefined) {
        // Remove existing group associations
        await prisma.groupAddon.deleteMany({
          where: { addonId: id }
        });

        // Add new group associations
        if (Array.isArray(groupIds) && groupIds.length > 0) {
          for (const groupId of groupIds) {
            await prisma.groupAddon.create({
              data: {
                groupId: groupId,
                addonId: id
              }
            });
          }
        }
      }

      res.json({
        message: 'Addon updated successfully',
        addon: {
          id: updatedAddon.id,
          name: updatedAddon.name,
          description: updatedAddon.description,
          url: getDecryptedManifestUrl(updatedAddon, req),
          version: updatedAddon.version,
          status: updatedAddon.isActive ? 'active' : 'inactive',
          users: 0,
          groups: 0
        }
      });
    } catch (error) {
      console.error('Error updating addon:', error);
      res.status(500).json({ error: 'Failed to update addon', details: error?.message });
    }
  });

  return router;
};