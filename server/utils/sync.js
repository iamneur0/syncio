// Sync utilities: factories for user and group sync-status helpers

/**
 * Get addons from Stremio for a user
 */
async function getUserAddons(user, req, { decrypt, StremioAPIClient }) {
  if (!user.stremioAuthKey) {
    return { success: false, addons: [], error: 'User not connected to Stremio' }
  }

  try {
    const authKeyPlain = decrypt(user.stremioAuthKey, req)
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
    const collection = await apiClient.request('addonCollectionGet', {})

    // CRITICAL FIX: If collection.addons is null (corrupted account), repair it immediately
    // Stremio expects addons to always be an array, never null
    if (collection && collection.addons === null) {
      console.warn('⚠️ Detected corrupted addon collection (addons: null), repairing...')
      try {
        // Repair by clearing addons
        const { clearAddons } = require('./addonHelpers')
        await clearAddons(apiClient)
        // Re-fetch to get the repaired collection
        const repairedCollection = await apiClient.request('addonCollectionGet', {})
        if (repairedCollection && repairedCollection.addons !== null) {
          console.log('✅ Successfully repaired corrupted addon collection')
          // Use the repaired collection
          Object.assign(collection, repairedCollection)
        }
      } catch (repairError) {
        console.error('❌ Failed to repair corrupted addon collection:', repairError)
        // Continue with null handling below
      }
    }

    // Handle the case where collection.addons might be null (empty account) or not an array
    // Use the same logic as /stremio-addons endpoint: try collection.addons first, then fall back to collection itself
    const rawAddons = collection?.addons !== undefined ? collection.addons : collection
    let addonsArray = []
    
    if (rawAddons !== null && rawAddons !== undefined) {
      if (Array.isArray(rawAddons)) {
        addonsArray = rawAddons
      } else if (typeof rawAddons === 'object') {
        // If it's an object (not an array), try to convert it to an array
        addonsArray = Object.values(rawAddons)
      }
    }

    // Ensure addons is always an array in the response (never null)
    const sanitized = {
      ...collection,
      addons: addonsArray.map((addon) => {
        const manifest = addon?.manifest
        if (manifest && typeof manifest === 'object') {
          const { manifestUrl, ...restManifest } = manifest
          return { ...addon, manifest: restManifest, transportName: "" }
        }
        return { ...addon, transportName: "" }
      })
    }

    // Final safety check: ensure addons is always an array
    if (sanitized.addons === null || sanitized.addons === undefined) {
      sanitized.addons = []
    }

    return { success: true, addons: sanitized, error: null }
  } catch (error) {
    return { success: false, addons: [], error: error.message || 'Failed to fetch Stremio addons' }
  }
}

/**
 * Get desired addons for a user (group addons + protected addons from Stremio)
 */
async function getDesiredAddons(user, req, { prisma, getAccountId, decrypt, parseAddonIds, parseProtectedAddons, canonicalizeManifestUrl, StremioAPIClient, unsafeMode = false, useCustomFields = true }) {
  try {
    // Get group addons
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

    const { getGroupAddons } = require('../utils/helpers')
    // groupAddons are returned in collection shape: { transportUrl, transportName, manifest }
    const groupAddons = groups.length > 0 ? await getGroupAddons(prisma, groups[0].id, req) : []

    // Get user's Stremio addons
    const { success, addons: userAddonsResponse, error } = await getUserAddons(user, req, { decrypt, StremioAPIClient })
    if (!success) {
      return { success: false, addons: [], error }
    }
    
    // Extract the addons array from the complete response (collection shape)
    // Ensure we always get an array, even if the response structure is unexpected
    let userAddons = []
    if (Array.isArray(userAddonsResponse)) {
      userAddons = userAddonsResponse
    } else if (userAddonsResponse && typeof userAddonsResponse === 'object') {
      // Handle collection shape: { addons: [...] }
      if (Array.isArray(userAddonsResponse.addons)) {
        userAddons = userAddonsResponse.addons
      }
    }

    // Parse excluded addons (DB addon IDs)
    const excludedAddons = parseAddonIds(user.excludedAddons)
    // Parse protected addons as PLAINTEXT NAMES from DB
    let protectedNames = []
    try {
      protectedNames = user.protectedAddons ? JSON.parse(user.protectedAddons) : []
    } catch {
      protectedNames = []
    }
    
    
    // Include default addons as protected addons (names, only in safe mode)
    const { defaultAddons } = require('../utils/config')
    const normalizeName = (n) => String(n || '').trim().toLowerCase()
    const defaultProtectedNames = unsafeMode ? [] : (defaultAddons.names || [])
    const protectedNameSet = new Set([
      ...protectedNames.map(normalizeName),
      ...defaultProtectedNames.map(normalizeName)
    ])
    

    // Helper function to check if an addon is protected (by name)
    const isProtected = (addon) => {
      const n = addon?.manifest?.name || addon?.transportName || addon?.name
      return n && protectedNameSet.has(normalizeName(n))
    }

    // Parse excluded addons - these are database IDs stored in the database
    const excludedAddonIds = (excludedAddons || []).map(id => String(id).trim()).filter(Boolean)
    const excludedAddonIdSet = new Set(excludedAddonIds)
    
    const groupAddonsFiltered = groupAddons.filter(groupAddon => {
      const addonId = groupAddon?.id
      const isExcluded = addonId && excludedAddonIdSet.has(addonId)
      return !isExcluded
    })
    
    // Strip database fields from filtered group addons for clean JSON
    // Ensure manifest.name and manifest.description match the addon name and description from DB
    const cleanGroupAddons = groupAddonsFiltered.map((addon, index) => {
      const manifestObj = (addon && addon.manifest && typeof addon.manifest === 'object')
        ? { ...addon.manifest }
        : addon?.manifest ? addon.manifest : {}
      
      if (addon && manifestObj && typeof manifestObj === 'object') {
        // Use custom name and description from DB if useCustomFields is enabled
        if (useCustomFields && typeof addon.name === 'string') {
          manifestObj.name = addon.name
        }
        // Update description if useCustomFields is enabled and it exists (even if empty string, preserve it)
        if (useCustomFields && addon.description !== undefined && addon.description !== null) {
          manifestObj.description = addon.description
        }
        // Apply custom logo if it exists (only set logo field, like the original manifest)
        if (addon.customLogo && addon.customLogo.trim()) {
          manifestObj.logo = addon.customLogo.trim()
        }
      }
      
      return {
        transportUrl: addon.transportUrl,
        transportName: addon.transportName,
        manifest: manifestObj
      }
    })

    // 2) Keep only protected addons from userAddons
    // Ensure userAddons is an array before filtering
    const userAddonsArray = Array.isArray(userAddons) ? userAddons : []
    const protectedUserAddons = userAddonsArray.filter(addon => isProtected(addon))

    // Build a protected NAME set from userAddons (normalized)
    const protectedUserNameSet = new Set(
      protectedUserAddons
        .map(a => normalizeName(a?.manifest?.name || a?.transportName || a?.name))
        .filter(Boolean)
    )

    // 3) If an addon is protected and also present in groupAddons, remove it from groupAddons (compare by NAME)
    const nonProtectedGroupAddons = cleanGroupAddons.filter(groupAddon => {
      const n = normalizeName(groupAddon?.manifest?.name || groupAddon?.transportName || groupAddon?.name)
      return n && !protectedUserNameSet.has(n)
    })
    

    // Build locked positions map for protected addons from current Stremio account (by name)
    // IMPORTANT: positions must be taken from the FULL userAddons list
    const lockedByUrl = new Map()
    for (let i = 0; i < userAddons.length; i++) {
      const cur = userAddons[i]
      const name = normalizeName(cur?.manifest?.name || cur?.transportName || cur?.name)
      if (name && isProtected(cur)) {
        lockedByUrl.set(name, i)
      }
    }

    // Start with an array sized to current addons length
    const finalLength = userAddons.length
    const finalDesiredCollection = new Array(finalLength).fill(null)

    // Place protected addons at their original positions
    for (const addon of protectedUserAddons) {
      const name = normalizeName(addon?.manifest?.name || addon?.transportName || addon?.name)
      if (name && lockedByUrl.has(name)) {
        const pos = lockedByUrl.get(name)
        if (pos < finalLength) {
          finalDesiredCollection[pos] = addon
        }
      }
    }

    // Fill remaining positions with non-protected group addons
    let groupAddonIndex = 0
    for (let i = 0; i < finalLength && groupAddonIndex < nonProtectedGroupAddons.length; i++) {
      if (finalDesiredCollection[i] === null) {
        finalDesiredCollection[i] = nonProtectedGroupAddons[groupAddonIndex++]
      }
    }

    // Add any remaining group addons at the end
    while (groupAddonIndex < nonProtectedGroupAddons.length) {
      finalDesiredCollection.push(nonProtectedGroupAddons[groupAddonIndex++])
    }

    // If current is empty (finalLength = 0), ensure we still add all group addons
    if (finalLength === 0 && nonProtectedGroupAddons.length > 0) {
      // When current is empty, just return all non-protected group addons
      return { success: true, addons: nonProtectedGroupAddons, error: null }
    }

    // Remove nulls and return
    const finalDesiredAddons = finalDesiredCollection.filter(Boolean)
    
    return { success: true, addons: finalDesiredAddons, error: null }
  } catch (error) {
    return { success: false, addons: [], error: error.message || 'Failed to get desired addons' }
  }
}

function createGetUserSyncStatus({ prisma, getAccountId, decrypt, parseAddonIds, parseProtectedAddons, getDecryptedManifestUrl, canonicalizeManifestUrl, StremioAPIClient }) {
  const normalizeUrl = (u) => {
    try {
      return canonicalizeManifestUrl ? canonicalizeManifestUrl(u) : String(u || '').trim().toLowerCase()
    } catch (e) {
      return String(u || '').trim().toLowerCase()
    }
  }

  return async function getUserSyncStatus(userId, { groupId = undefined, unsafe = false } = {}, req) {
    const user = await prisma.user.findUnique({
      where: { id: userId, accountId: getAccountId(req) },
      select: { id: true, stremioAuthKey: true, isActive: true, excludedAddons: true, protectedAddons: true }
    })
    if (!user) return { status: 'error', isSynced: false, message: 'User not found' }
    if (!user.stremioAuthKey) return { isSynced: false, status: 'connect', message: 'User not connected to Stremio' }

    // Derive unsafe and useCustomFields from DB-backed account sync (single source of truth)
    let useCustomFields = true
    try {
      const acc = await prisma.appAccount.findUnique({ where: { id: getAccountId(req) }, select: { sync: true } })
      let cfg = acc?.sync
      if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch { cfg = null } }
      if (cfg && typeof cfg === 'object') {
        if (typeof cfg.safe === 'boolean') unsafe = !cfg.safe
        if (typeof cfg.useCustomFields === 'boolean') {
          useCustomFields = cfg.useCustomFields
        } else if (typeof cfg.useCustomNames === 'boolean') {
          // Backward compatibility: migrate old useCustomNames to useCustomFields
          useCustomFields = cfg.useCustomNames
        } else {
          useCustomFields = true
        }
      }
    } catch {}

    // Get user's current Stremio addons
    const { success: userAddonsSuccess, addons: userAddonsResponse, error: userAddonsError } = await getUserAddons(user, req, { decrypt, StremioAPIClient })
    if (!userAddonsSuccess) {
      // If the error is related to authentication, treat it as "connect" status
      if (userAddonsError && (
        userAddonsError.includes('Unsupported state or unable to authenticate') ||
        userAddonsError.includes('authentication') ||
        userAddonsError.includes('auth') ||
        userAddonsError.includes('invalid') ||
        userAddonsError.includes('corrupted')
      )) {
        return { isSynced: false, status: 'connect', message: 'Stremio connection invalid - please reconnect' }
      }
      return { isSynced: false, status: 'error', message: userAddonsError }
    }
    
    // Extract the addons array from the complete response
    // Ensure we always get an array, even if the response structure is unexpected
    let userAddons = []
    if (Array.isArray(userAddonsResponse)) {
      userAddons = userAddonsResponse
    } else if (userAddonsResponse && typeof userAddonsResponse === 'object') {
      // Handle collection shape: { addons: [...] }
      if (Array.isArray(userAddonsResponse.addons)) {
        userAddons = userAddonsResponse.addons
      }
    }

    // Get desired addons (group addons + protected addons)
    const { success: desiredAddonsSuccess, addons: desiredAddons, error: desiredAddonsError } = await getDesiredAddons(user, req, {
      prisma,
      getAccountId,
      decrypt,
      parseAddonIds,
      parseProtectedAddons,
      canonicalizeManifestUrl,
      StremioAPIClient,
      unsafeMode: unsafe,
      useCustomFields
    })
    if (!desiredAddonsSuccess) {
      return { isSynced: false, status: 'error', message: desiredAddonsError }
    }

    // Unified comparison using manifest fingerprint (order-sensitive)
    const fingerprint = createManifestFingerprint(canonicalizeManifestUrl)
    const currentKeys = userAddons.map(fingerprint)
    const desiredKeys = desiredAddons.map(fingerprint)
    const isSynced = currentKeys.length === desiredKeys.length && currentKeys.every((k, i) => k === desiredKeys[i])

    return {
      isSynced,
      status: isSynced ? 'synced' : 'unsynced',
      stremioAddonsCount: userAddons.length,
      groupAddonsCount: desiredAddons.length,
      excludedAddons: parseAddonIds(user.excludedAddons),
      protectedAddons: parseProtectedAddons(user.protectedAddons, req),
    }
  }
}

function createGetGroupSyncStatus(deps) {
  const getUserSyncStatus = createGetUserSyncStatus(deps)
  const { prisma, getAccountId } = deps
  return async function getGroupSyncStatus(groupId, req) {
    const group = await prisma.group.findUnique({ where: { id: groupId, accountId: getAccountId(req) } })
    if (!group) return { error: 'Group not found' }
    let userIds = []
    try { userIds = Array.isArray(group.userIds) ? group.userIds : JSON.parse(group.userIds || '[]') } catch {}
    const userStatuses = []
    for (const uid of userIds) {
      try {
        const status = await getUserSyncStatus(uid, { groupId: groupId }, req)
        userStatuses.push({ userId: uid, ...status })
      } catch (e) {
        userStatuses.push({ userId: uid, status: 'error', isSynced: false, message: e?.message || 'Failed' })
      }
    }
    const groupStatus = userStatuses.every(s => s.status === 'synced') ? 'synced' : 'unsynced'
    return { groupStatus, userStatuses }
  }
}

/**
 * Compute a user's sync plan (shared by sync-status and actual sync)
 * Returns: { alreadySynced, current, desired }
 */
async function computeUserSyncPlan(user, req, { prisma, getAccountId, decrypt, parseAddonIds, parseProtectedAddons, canonicalizeManifestUrl, StremioAPIClient, unsafeMode = false, useCustomFields = true, useCustomNames = undefined }) {
  // Backward compatibility: support both useCustomFields (new) and useCustomNames (old)
  const useCustomFieldsValue = useCustomFields !== undefined ? useCustomFields : (useCustomNames !== undefined ? useCustomNames : true)
  
  // 1) Current - getUserAddons already has repair logic built in
  const currentRes = await getUserAddons(user, req, { decrypt, StremioAPIClient })
  if (!currentRes.success) return { success: false, error: currentRes.error, alreadySynced: false, current: [], desired: [] }
  const current = currentRes.addons?.addons || currentRes.addons || []
  // 2) Desired
  const desiredRes = await getDesiredAddons(user, req, { prisma, getAccountId, decrypt, parseAddonIds, parseProtectedAddons, canonicalizeManifestUrl, StremioAPIClient, unsafeMode, useCustomFields: useCustomFieldsValue })
  if (!desiredRes.success) return { success: false, error: desiredRes.error, alreadySynced: false, current, desired: [] }
  const desired = desiredRes.addons || []
  
  // Ensure desired is always an array, never null
  const safeDesired = Array.isArray(desired) ? desired : []
  // 3) Compare (set + order) using manifest fingerprint
  const fingerprint = createManifestFingerprint(canonicalizeManifestUrl)
  const aKeys = current.map(fingerprint)
  const bKeys = desired.map(fingerprint)
  const alreadySynced = aKeys.length === bKeys.length && aKeys.every((k, i) => k === bKeys[i])
  return { success: true, alreadySynced, current, desired }
}

// Build a stable fingerprint for an addon entry based on its manifest and canonical URL
function createManifestFingerprint(canonicalizeManifestUrl) {
  const normalizeUrl = (u) => {
    try { return canonicalizeManifestUrl ? canonicalizeManifestUrl(u) : String(u || '').trim().toLowerCase() } catch { return String(u || '').trim().toLowerCase() }
  }
  
  // Normalize manifest for comparison - sort arrays to ensure consistent comparison
  const normalizeManifest = (m) => {
    try {
      if (!m || typeof m !== 'object') return {}
      
      // Deep clone to avoid mutating original
      const normalized = JSON.parse(JSON.stringify(m))
      
      // Sort arrays that should be order-independent for comparison
      if (Array.isArray(normalized.catalogs)) {
        normalized.catalogs = normalized.catalogs
          .map(c => ({ type: c?.type, id: c?.id, name: c?.name, extra: c?.extra, extraSupported: c?.extraSupported }))
          .sort((a, b) => String(a.type + a.id).localeCompare(String(b.type + b.id)))
      }
      if (Array.isArray(normalized.types)) {
        normalized.types = normalized.types.slice().sort()
      }
      if (Array.isArray(normalized.resources)) {
        // Sort resources by name for consistency
        normalized.resources = normalized.resources
          .map(r => ({ name: r?.name, types: Array.isArray(r?.types) ? r.types.slice().sort() : r?.types, idPrefixes: Array.isArray(r?.idPrefixes) ? r.idPrefixes.slice().sort() : r?.idPrefixes }))
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      }
      
      return normalized
    } catch {
      return m || {}
    }
  }
  
  return (addon) => {
    const url = normalizeUrl(addon?.transportUrl || addon?.manifestUrl || addon?.url || '')
    const manifestNorm = normalizeManifest(addon?.manifest || addon)
    // Compare entire manifest - this catches all changes including name, description, and any other fields
    return url + '|' + JSON.stringify(manifestNorm)
  }
}

module.exports = {
  getUserAddons,
  getDesiredAddons,
  createGetUserSyncStatus,
  createGetGroupSyncStatus,
  computeUserSyncPlan,
}


