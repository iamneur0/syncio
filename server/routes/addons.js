const express = require('express');
const { StremioAPIClient } = require('stremio-api-client');
const { handleDatabaseError, sendError, createRouteHandler, DatabaseTransactions } = require('../utils/handlers');
const { findAddonById, sanitizeUrl, validateAccountContext } = require('../utils/helpers');
const { canonicalizeManifestUrl } = require('../utils/validation');
const { responseUtils, dbUtils } = require('../utils/routeUtils');

// In-memory manifest cache (short TTL) to avoid hammering when multiple addons share a URL
const _manifestCache = new Map() // key: url, value: { data, ts }
const CACHE_TTL_MS = 60 * 1000

function getCachedManifest(url) {
  const rec = _manifestCache.get(url)
  if (!rec) return null
  if (Date.now() - rec.ts > CACHE_TTL_MS) { _manifestCache.delete(url); return null }
  return rec.data
}
function setCachedManifest(url, data) {
  _manifestCache.set(url, { data, ts: Date.now() })
}

// Shared helper function to reload a single addon
async function reloadAddon(prisma, getAccountId, addonId, req, { filterManifestByResources, filterManifestByCatalogs, encrypt, decrypt, getDecryptedManifestUrl, manifestHash, silent = false }, autoSelectNewElements = true) {
  // Find the addon (scope to account to avoid cross-account mismatches)
  const addon = await prisma.addon.findFirst({
    where: { id: addonId, accountId: getAccountId(req) }
  });

  if (!addon) {
    throw new Error('Addon not found');
  }

  if (!silent) {
    console.log(`🔄 Reload addon ${addon.name}`)
  }

  if (!addon.isActive) {
    throw new Error('Addon is disabled');
  }

  if (!addon.manifestUrl) {
    throw new Error('Addon has no manifest URL');
  }

  // Found addon

  // Resolve decrypted transport URL
  const transportUrl = getDecryptedManifestUrl(addon, req)
  if (!transportUrl) {
    throw new Error('Failed to resolve addon URL')
  }

  // Skip reloading for local development addons
  if (transportUrl === 'http://127.0.0.1:11470/local-addon/manifest.json') {
    if (!silent) {
      console.log(`⏭️  Skipping reload for local addon URL: ${transportUrl}`)
    }
    return {
      skipped: true,
      message: 'Skipped local addon reload',
      diffs: { addedResources: [], removedResources: [], addedCatalogs: [], removedCatalogs: [] }
    }
  }

  // Decrypted transport URL resolved

  // Fetch the latest manifest
  let manifestData = null;
  // Prepare diff containers to return
  let addedRes = []
  let removedRes = []
  let addedCat = []
  let removedCat = []
  // Module-level cache to avoid hammering same manifest URL
  const cacheKey = transportUrl
  const cached = getCachedManifest(cacheKey)
  if (cached) {
    manifestData = cached
  } else {
    try {
      const manifestResponse = await fetch(transportUrl);
      if (!manifestResponse.ok) throw new Error(`HTTP ${manifestResponse.status}: ${manifestResponse.statusText}`)
      manifestData = await manifestResponse.json();
      setCachedManifest(cacheKey, manifestData)
    } catch (e) {
      console.error(`❌ Failed to fetch manifest:`, e.message);
      throw new Error(`Failed to fetch addon manifest: ${e.message}`);
    }
  }

  // 1. Save current selections from DB
  // Load current selections from DB
  
  const savedResources = (() => { 
    try { 
      const parsed = addon.resources ? JSON.parse(addon.resources) : []
      // Saved resources parsed
      return parsed
    } catch (e) { 
      console.log(`❌ Error parsing saved resources:`, e.message)
      return [] 
    } 
  })()
  const savedCatalogs = (() => { 
    try { 
      const parsed = addon.catalogs ? JSON.parse(addon.catalogs) : []
      // Saved catalogs parsed
      return parsed
    } catch (e) { 
      console.log(`❌ Error parsing saved catalogs:`, e.message)
      return [] 
    } 
  })()

  // 2. Get all available resources and catalogs from fresh manifest
  // Process fresh manifest
  const manifestResources = Array.isArray(manifestData?.resources) ? manifestData.resources : []
  const manifestCatalogs = Array.isArray(manifestData?.catalogs) ? manifestData.catalogs : []
  
  // Fresh manifest parsed
  
  // Check if there are any search catalogs
  const hasSearchCatalogs = manifestCatalogs.some((catalog) => 
    catalog.extra?.some((extra) => extra.name === 'search')
  )
  // Has search catalogs computed
  
  // 3. RESET FIRST: Select all resources and catalogs (like reset button)
  // Create reset selections
  const resetResources = [...manifestResources.map(r => 
    typeof r === 'string' ? r : r.name  // Handle both strings and objects
  )]
  if (hasSearchCatalogs && !resetResources.includes('search')) {
    resetResources.push('search')
  }
  // Reset resources computed
  
  const resetCatalogs = manifestCatalogs.map((c) => ({
    type: c.type,
    id: c.id,
    search: c.extra?.some((extra) => extra.name === 'search') || false
  }))
  // Reset catalogs computed
  
  // 4. REAPPLY: Preserve user selections and only auto-select truly new items
  // Debug summary removed (noise)
  
  // Get original manifest to determine what was available before
  let originalResources = []
  let originalCatalogs = []
  try {
    if (addon.originalManifest) {
      // Decrypt the original manifest first
      const decryptedOriginalManifest = JSON.parse(decrypt(addon.originalManifest, req))
      const originalManifestData = decryptedOriginalManifest
      const originalManifestResources = Array.isArray(originalManifestData?.resources) ? originalManifestData.resources : []
      const originalManifestCatalogs = Array.isArray(originalManifestData?.catalogs) ? originalManifestData.catalogs : []
      
      // Extract resource names (handle both strings and objects)
      originalResources = originalManifestResources.map(r => 
        typeof r === 'string' ? r : r.name
      )
      
      // Extract catalog info (preserve name so removals can show it)
      originalCatalogs = originalManifestCatalogs.map(c => ({
        type: c.type,
        id: c.id,
        name: c.name
      }))
    }
  } catch (e) {
    console.log('⚠️ Could not parse original manifest:', e.message)
  }
  
  // Diff logs (availability changes between original manifest and freshly fetched manifest)
  try {
    // IMPORTANT: compare raw manifest resources, not our derived selections
    const freshResourcesRaw = (Array.isArray(manifestResources) ? manifestResources : []).map(r => typeof r === 'string' ? r : r?.name).filter(Boolean)
    const originalResSet = new Set((originalResources || []).filter(Boolean))
    const newResSet = new Set(freshResourcesRaw)
    addedRes = [...newResSet].filter(k => !originalResSet.has(k))
    removedRes = [...originalResSet].filter(k => !newResSet.has(k))

    // Compare catalogs on raw manifest too (ignore our computed search flag)
    const toKey = (c) => `${c?.type || ''}:${c?.id || ''}`
    const originalCatalogsRaw = (Array.isArray(manifestCatalogs) ? [] : []) // placeholder to keep structure clear
    const originalCatSet = new Set((originalCatalogs || []).map(toKey))
    const freshCatalogsRaw = (Array.isArray(manifestCatalogs) ? manifestCatalogs : []).map(c => ({ type: c?.type, id: c?.id, name: c?.name }))
    const newCatSet = new Set(freshCatalogsRaw.map(toKey))
    const addedCatKeys = [...newCatSet].filter(k => !originalCatSet.has(k))
    const removedCatKeys = [...originalCatSet].filter(k => !newCatSet.has(k))

    // Pretty labels: show type:name for catalogs
    // Prefer "Name (type)" label
    const labelFor = (c) => `${(c?.name || c?.id || '').toString()} (${c?.type || ''})`
    const freshLabelByKey = new Map(freshCatalogsRaw.map(c => [toKey(c), labelFor(c)]))
    const originalLabelByKey = new Map((Array.isArray(originalCatalogs) ? originalCatalogs : []).map(c => [toKey(c), labelFor(c)]))
    addedCat = addedCatKeys.map(k => freshLabelByKey.get(k) || k)
    removedCat = removedCatKeys.map(k => originalLabelByKey.get(k) || k)

    if ((addedRes.length || removedRes.length || addedCat.length || removedCat.length) && !silent) {
      const parts = []
      if (addedRes.length) parts.push(`+resources: ${addedRes.join(', ')}`)
      if (removedRes.length) parts.push(`-resources: ${removedRes.join(', ')}`)
      if (addedCat.length) parts.push(`+catalogs: ${addedCat.join(', ')}`)
      if (removedCat.length) parts.push(`-catalogs: ${removedCat.join(', ')}`)
      if (parts.length) console.log(`🧩 ${addon.name} diffs → ${parts.join(' | ')}`)
    }
  } catch {}
  
  // Original manifest summary removed
  
  // Keep only saved selections that still exist in the fresh manifest
  const validResources = savedResources.filter(r => resetResources.includes(r))
  const validCatalogs = savedCatalogs.filter(c => 
    resetCatalogs.some(reset => 
      reset.type === c.type && reset.id === c.id
    )
  )
  
  // Valid preserved selections computed
  
  // 5. Handle auto-selection of truly new elements
  let finalResources = validResources
  let finalCatalogs = validCatalogs
  
  if (autoSelectNewElements) {
    // Auto-selecting new elements
    
    // Find resources that exist in fresh manifest but were NOT in original manifest
    // This excludes items that were previously unselected by the user
    const trulyNewResources = resetResources.filter(r => 
      !originalResources.includes(r) && !savedResources.includes(r)
    )
    // New resources auto-selected
    
    // Find catalogs that exist in fresh manifest but were NOT in original manifest
    // This excludes catalogs that were previously unselected by the user
    const trulyNewCatalogs = resetCatalogs.filter(fresh => 
      !originalCatalogs.some(orig => orig.type === fresh.type && orig.id === fresh.id)
    )
    // New catalogs auto-selected
    
    // Combine preserved + truly new selections
    finalResources = [...validResources, ...trulyNewResources]
    finalCatalogs = [...validCatalogs, ...trulyNewCatalogs]
  }
  
  // Final selections computed
  
  // Apply filtering using final resources/catalogs
  let filtered = manifestData
  if (Array.isArray(finalResources) || Array.isArray(finalCatalogs)) {
    try {
      
      if (Array.isArray(finalResources) && finalResources.length > 0) {
        filtered = filterManifestByResources(manifestData, finalResources)
      }
      
      // Apply catalog filtering if catalogs are provided
      if (Array.isArray(finalCatalogs) && finalCatalogs.length > 0 && filtered) {
        // Convert tuples to objects for filtering
        const catalogObjects = finalCatalogs.map(c => {
          if (Array.isArray(c) && c.length >= 2) {
            return { type: c[0], id: c[1], search: c[2] !== undefined ? c[2] : false }
          }
          return c
        })
        filtered = filterManifestByCatalogs(filtered, catalogObjects)
      }
    } catch (e) {
      console.error('Error filtering manifest on reload:', e)
      filtered = manifestData
    }
  }

  // Update the addon using the same logic as the update endpoint
  const updatedAddon = await prisma.addon.update({
    where: { 
      id: addonId,
      accountId: getAccountId(req)
    },
    data: {
      name: addon.name, // preserve name
      description: manifestData?.description || addon.description,
      version: manifestData?.version || addon.version,
      iconUrl: manifestData?.logo || addon.iconUrl || null,
      // Store encrypted manifests (original untouched, filtered current)
      originalManifest: encrypt(JSON.stringify(manifestData), req),
      manifest: encrypt(JSON.stringify(filtered), req),
      manifestHash: manifestHash(filtered),
      // Store final selections (validated + optionally auto-selected new elements)
      resources: JSON.stringify(finalResources),
      catalogs: JSON.stringify(finalCatalogs.map(c => ({ type: c.type, id: c.id, search: c.search })).filter((c, index, arr) => 
        arr.findIndex(item => item.type === c.type && item.id === c.id) === index
      ))
    }
  });

  return {
    success: true,
    addon: {
      id: updatedAddon.id,
      name: updatedAddon.name,
      description: updatedAddon.description,
      url: updatedAddon.manifestUrl,
      version: updatedAddon.version,
      iconUrl: updatedAddon.iconUrl,
      status: updatedAddon.isActive ? 'active' : 'inactive'
    },
    diffs: {
      addedResources: addedRes,
      removedResources: removedRes,
      addedCatalogs: addedCat,
      removedCatalogs: removedCat
    }
  };
}

// Export a function that returns the router, allowing dependency injection
module.exports = ({ prisma, getAccountId, decrypt, encrypt, getDecryptedManifestUrl, scopedWhere, AUTH_ENABLED, manifestHash, filterManifestByResources, filterManifestByCatalogs, manifestUrlHmac }) => {
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
      
      // Validate addon exists
      const addon = await dbUtils.findEntity(prisma, 'addon', id, getAccountId(req))
      if (!addon) {
        return responseUtils.notFound(res, 'Addon')
      }

      // Update addon
      const updated = await dbUtils.updateEntity(prisma, 'addon', id, { isActive: true }, getAccountId(req))
      
      return responseUtils.success(res, {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        url: getDecryptedManifestUrl(updated, req),
        version: updated.version,
        status: updated.isActive ? 'active' : 'inactive',
        users: 0,
        groups: 0
      }, 'Addon enabled successfully')
    } catch (error) {
      console.error('Error enabling addon:', error)
      return responseUtils.internalError(res, error.message)
    }
  })

  // Disable addon (soft disable, stays in DB and groups)
  router.put('/:id/disable', async (req, res) => {
    try {
      const { id } = req.params
      
      // Validate addon exists
      const addon = await dbUtils.findEntity(prisma, 'addon', id, getAccountId(req))
      if (!addon) {
        return responseUtils.notFound(res, 'Addon')
      }

      // Update addon
      const updated = await dbUtils.updateEntity(prisma, 'addon', id, { isActive: false }, getAccountId(req))
      
      return responseUtils.success(res, {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        url: getDecryptedManifestUrl(updated, req),
        version: updated.version,
        status: updated.isActive ? 'active' : 'inactive',
        users: 0,
        groups: 0
      }, 'Addon disabled successfully')
    } catch (error) {
      console.error('Error disabling addon:', error)
      return responseUtils.internalError(res, error.message)
    }
  })

  // Toggle addon status (enable/disable)
  router.patch('/:id/toggle-status', async (req, res) => {
    try {
      const { id } = req.params
      const { isActive } = req.body
      
      // Validate addon exists
      const addon = await dbUtils.findEntity(prisma, 'addon', id, getAccountId(req))
      if (!addon) {
        return responseUtils.notFound(res, 'Addon')
      }

      // Update addon
      const updated = await dbUtils.updateEntity(prisma, 'addon', id, { isActive }, getAccountId(req))
      
      return responseUtils.success(res, {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        url: getDecryptedManifestUrl(updated, req),
        version: updated.version,
        status: updated.isActive ? 'active' : 'inactive',
        users: 0,
        groups: 0
      }, `Addon ${isActive ? 'enabled' : 'disabled'} successfully`)
    } catch (error) {
      console.error('Error toggling addon status:', error)
      return responseUtils.internalError(res, error.message)
    }
  })

  // Create new addon
  router.post('/', async (req, res) => {
    try {
      const { url, name, description, groupIds, manifestData: providedManifestData } = req.body;
    
      if (!url) {
        return responseUtils.badRequest(res, 'Addon URL is required');
      }

      // Validate account context
      const accountValidation = validateAccountContext(req, AUTH_ENABLED);
      if (!accountValidation.isValid) {
        return sendError(res, 401, accountValidation.error);
      }

      // Use centralized URL sanitization
      const sanitizedUrl = sanitizeUrl(url);
      if (!sanitizedUrl) {
        return responseUtils.badRequest(res, 'Invalid URL provided');
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
          const resp = await fetch(sanitizedUrl)
          if (!resp.ok) {
            return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' })
          }
          manifestData = await resp.json()
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
          // Use the UI state (catalogs parameter) if available, otherwise fall back to manifest data
          const src = Array.isArray(catalogs) && catalogs.length > 0 ? catalogs : (Array.isArray(manifestData?.catalogs) ? manifestData.catalogs : [])
          const processedCatalogs = []
          
          for (const catalog of src) {
            if (!catalog?.type || !catalog?.id) continue
            
            // Check if catalog has search functionality enabled in UI state
            const hasSearch = catalog?.extra?.some((extra) => extra.name === 'search')
            const hasOtherExtras = catalog?.extra?.some((extra) => extra.name !== 'search')
            const isEmbeddedSearch = hasSearch && hasOtherExtras
            const isStandaloneSearch = hasSearch && !hasOtherExtras
            
            if (isStandaloneSearch) {
              // Standalone search catalog: add with original ID (no suffix)
              processedCatalogs.push({
                type: catalog.type,
                id: catalog.id
              })
            } else if (isEmbeddedSearch) {
              // Embedded search catalog: add both original and search versions
              processedCatalogs.push({
                type: catalog.type,
                id: catalog.id
              })
              processedCatalogs.push({
                type: catalog.type,
                id: `${catalog.id}-embed-search`
              })
            } else {
              // Regular catalog: add as-is
              processedCatalogs.push({
                type: catalog.type,
                id: catalog.id
              })
            }
          }
          
          return processedCatalogs
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
      const { autoSelectNewElements = true } = req.body; // Default to true to auto-select truly new elements
      
      // Use the shared reload helper function
      const result = await reloadAddon(prisma, getAccountId, id, req, { 
        filterManifestByResources, 
        filterManifestByCatalogs, 
        encrypt, 
        decrypt,
        getDecryptedManifestUrl, 
        manifestHash 
      }, autoSelectNewElements);

      res.json({
        message: 'Addon reloaded successfully',
        addon: result.addon
      });
    } catch (error) {
      console.error('Error reloading addon:', error);
      
      // Handle specific error cases
      if (error.message === 'Addon not found') {
        return responseUtils.notFound(res, 'Addon');
      }
      if (error.message === 'Addon is disabled') {
        return responseUtils.badRequest(res, 'Addon is disabled');
      }
      if (error.message === 'Addon has no manifest URL') {
        return responseUtils.badRequest(res, 'Addon has no manifest URL');
      }
      if (error.message === 'Failed to resolve addon URL') {
        return responseUtils.badRequest(res, 'Failed to resolve addon URL');
      }
      if (error.message.includes('Failed to fetch addon manifest')) {
        return responseUtils.badRequest(res, 'Failed to fetch addon manifest');
      }
      
      return responseUtils.internalError(res, error?.message || 'Failed to reload addon');
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
      
;
      
      // Find unique name for the clone
      const baseCloneName = `${originalAddon.name} (Copy)`
      let cloneName = baseCloneName
      let copyNumber = 1
      
      while (true) {
        const nameExists = await prisma.addon.findFirst({
          where: {
            name: cloneName,
            accountId: getAccountId(req)
          }
        })
        
        if (!nameExists) break
        
        cloneName = copyNumber === 1 ? `${originalAddon.name} (Copy)` : `${originalAddon.name} (Copy #${copyNumber})`
        copyNumber++
      }
      
      
      // Create a clone with a modified name
      const clonedAddon = await prisma.addon.create({
        data: {
          name: cloneName,
          description: originalAddon.description,
          manifestUrl: originalAddon.manifestUrl,
          manifestUrlHash: originalAddon.manifestUrlHash, // Copy the hash
          originalManifest: originalAddon.originalManifest, // Copy the original manifest
          manifest: originalAddon.manifest,
          manifestHash: originalAddon.manifestHash,
          version: originalAddon.version,
          iconUrl: originalAddon.iconUrl,
          stremioAddonId: originalAddon.stremioAddonId,
          resources: originalAddon.resources,
          catalogs: originalAddon.catalogs,
          isActive: true, // Clone as active by default
          accountId: getAccountId(req)
        }
      });
      
;
      
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
          
          if (original) {
            // Always set filtered when we have original manifest
            if (Array.isArray(original.resources)) {
              const selected = Array.isArray(resources) ? resources : []
              console.log('🔍 Filtering from original manifest with selected resources:', selected)
              filtered = filterManifestByResources(original, selected) || { ...original, catalogs: [], addonCatalogs: [] }
              console.log('🔍 Filtered manifest has catalogs:', Array.isArray(filtered?.catalogs) ? filtered.catalogs.length : 'no catalogs')
            } else {
              // No resources in original, use original as base
              filtered = original
              console.log('🔍 Using original manifest as base (no resources)')
            }
            
        // Note: Catalog filtering will be done after database update
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
            manifestUrlHash: manifestUrlHmac(req, nextUrl)
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
            catalogs: JSON.stringify(Array.isArray(catalogs) ? catalogs.map(c => {
              // Handle tuple format: [type, id, search]
              if (Array.isArray(c) && c.length >= 2) {
                return { type: c[0], id: c[1], search: c[2] || false }
              }
              // Handle object format: { type, id, search }
              else if (c && typeof c === 'object' && c.type && c.id) {
                return { type: c.type, id: c.id, search: c.search || false }
              }
              return null
            }).filter(Boolean) : []) 
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

      // Apply catalog filtering using database state if catalogs were updated
      if (catalogs !== undefined && filtered) {
        // Read catalogs from database to get the correct search state
        const updatedAddonWithCatalogs = await prisma.addon.findUnique({
          where: { id },
          select: { catalogs: true }
        })
        
        let databaseCatalogs = []
        if (updatedAddonWithCatalogs?.catalogs) {
          try {
            databaseCatalogs = JSON.parse(updatedAddonWithCatalogs.catalogs)
          } catch (e) {
            console.log('🔍 Failed to parse database catalogs:', e)
          }
        }
        
        console.log('🔍 Using database catalogs for filtering:', databaseCatalogs)
        console.log('🔍 Database catalogs type:', typeof databaseCatalogs, 'isArray:', Array.isArray(databaseCatalogs))
        if (Array.isArray(databaseCatalogs) && databaseCatalogs.length > 0) {
          console.log('🔍 First database catalog:', databaseCatalogs[0])
        }
        
        filtered = filterManifestByCatalogs(filtered, databaseCatalogs)
        console.log('🔍 After catalog filtering, manifest has catalogs:', Array.isArray(filtered?.catalogs) ? filtered.catalogs.length : 'no catalogs')
        
        // Update the manifest in the database with the filtered version
        await prisma.addon.update({
          where: { id },
          data: {
            manifest: encrypt(JSON.stringify(filtered), req),
            manifestHash: manifestHash(filtered)
          }
        })
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

  // Reload all addons
  router.post('/reload-all', async (req, res) => {
    try {
      const allAddons = await prisma.addon.findMany({
        where: scopedWhere(req, {}),
        select: { id: true, isActive: true, manifestUrl: true }
      });
      const addons = allAddons.filter(a => a.isActive && !!a.manifestUrl)

      if (addons.length === 0) {
        return res.json({
          message: 'No active addons found to reload',
          reloadedCount: 0,
          failedCount: 0,
          total: 0
        });
      }

      let reloadedCount = 0;
      let failedCount = 0;

      for (const addon of addons) {
        try {
          await reloadAddon(prisma, getAccountId, addon.id, req, {
            filterManifestByResources,
            filterManifestByCatalogs,
            encrypt,
            decrypt,
            getDecryptedManifestUrl,
            manifestHash,
            silent: true
          });
          reloadedCount++;
        } catch (error) {
          console.error(`Failed to reload addon ${addon.id}:`, error);
          failedCount++;
        }
      }

      res.json({
        message: `Reloaded ${reloadedCount} addons successfully, ${failedCount} failed`,
        reloaded: reloadedCount,
        failed: failedCount,
        total: addons.length
      });
    } catch (error) {
      console.error('Error reloading all addons:', error);
      res.status(500).json({ message: 'Failed to reload all addons', error: error?.message });
    }
  });

  return router;
};

// Export the reloadAddon helper function for use by other modules
module.exports.reloadAddon = reloadAddon;