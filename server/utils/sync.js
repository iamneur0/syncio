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

    // Return the API response but strip manifest.manifestUrl from each addon and set transportName to empty string
    const sanitized = collection && Array.isArray(collection.addons)
      ? {
          ...collection,
          addons: collection.addons.map((addon) => {
            const manifest = addon?.manifest
            if (manifest && typeof manifest === 'object') {
              const { manifestUrl, ...restManifest } = manifest
              return { ...addon, manifest: restManifest, transportName: "" }
            }
            return { ...addon, transportName: "" }
          })
        }
      : collection

    return { success: true, addons: sanitized, error: null }
  } catch (error) {
    return { success: false, addons: [], error: error.message || 'Failed to fetch Stremio addons' }
  }
}

/**
 * Get desired addons for a user (group addons + protected addons from Stremio)
 */
async function getDesiredAddons(user, req, { prisma, getAccountId, decrypt, parseAddonIds, parseProtectedAddons, canonicalizeManifestUrl, StremioAPIClient, unsafeMode = false }) {
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
    const userAddons = userAddonsResponse?.addons || userAddonsResponse || []

    // Parse excluded and protected addons
    const excludedAddons = parseAddonIds(user.excludedAddons)
    const protectedAddons = parseProtectedAddons(user.protectedAddons, req)
    
    
    // Include default addons as protected addons (only in safe mode)
    const { defaultAddons } = require('../utils/config')
    const normalizeUrl = (u) => {
      try {
        return canonicalizeManifestUrl ? canonicalizeManifestUrl(u) : String(u || '').trim().toLowerCase()
      } catch (e) {
        return String(u || '').trim().toLowerCase()
      }
    }
    
    // Only include default addons as protected in safe mode (not in unsafe/advanced mode)
    const defaultProtectedUrls = unsafeMode ? [] : defaultAddons.manifestUrls.map(normalizeUrl)
    const allProtectedUrls = [
      ...(Array.isArray(protectedAddons) ? protectedAddons : []).filter(Boolean).map(normalizeUrl),
      ...defaultProtectedUrls
    ]
    const protectedUrlSet = new Set(allProtectedUrls)
    

    // Helper function to check if an addon is protected
    const isProtected = (addon) => {
      const addonUrl = normalizeUrl(addon.transportUrl || addon.manifestUrl || addon?.manifest?.manifestUrl)
      return addonUrl && protectedUrlSet.has(addonUrl)
    }

    // Parse excluded addons - these are database IDs stored in the database
    const excludedAddonIds = (excludedAddons || []).map(id => String(id).trim()).filter(Boolean)
    const excludedAddonIdSet = new Set(excludedAddonIds)

    // 1) Remove excluded addons from groupAddons
    console.log('🔍 getDesiredAddons - excludedAddonIdSet:', Array.from(excludedAddonIdSet))
    console.log('🔍 getDesiredAddons - groupAddons count:', groupAddons.length)
    const groupAddonsFiltered = groupAddons.filter(groupAddon => {
      const addonId = groupAddon?.id
      const isExcluded = addonId && excludedAddonIdSet.has(addonId)
      console.log('🔍 getDesiredAddons - addon:', groupAddon?.transportName, 'addonId:', addonId, 'isExcluded:', isExcluded)
      return !isExcluded
    })
    console.log('🔍 getDesiredAddons - groupAddonsFiltered count:', groupAddonsFiltered.length)
    
    // Strip database fields from filtered group addons for clean JSON
    // Ensure manifest.name matches the addon name from DB
    const cleanGroupAddons = groupAddonsFiltered.map(addon => {
      const manifestObj = (addon && addon.manifest && typeof addon.manifest === 'object')
        ? { ...addon.manifest }
        : addon?.manifest ? addon.manifest : {}
      if (addon && typeof addon.name === 'string' && manifestObj && typeof manifestObj === 'object') {
        manifestObj.name = addon.name
      }
      return {
        transportUrl: addon.transportUrl,
        transportName: addon.transportName,
        manifest: manifestObj
      }
    })

    // 2) Keep only protected addons from userAddons
    const protectedUserAddons = (userAddons || []).filter(addon => isProtected(addon))

    // Build a protected URL set from userAddons (normalized)
    const protectedUserUrlSet = new Set(
      protectedUserAddons
        .map(a => normalizeUrl(a.transportUrl || a.manifestUrl))
        .filter(Boolean)
    )

    // 3) If an addon is protected and also present in groupAddons, remove it from groupAddons (compare by URL)
    const nonProtectedGroupAddons = cleanGroupAddons.filter(groupAddon => {
      const url = normalizeUrl(groupAddon.transportUrl || groupAddon.manifestUrl || groupAddon?.manifest?.manifestUrl)
      return url && !protectedUserUrlSet.has(url)
    })
    

    // Build locked positions map for protected addons from current Stremio account
    // IMPORTANT: positions must be taken from the FULL userAddons list, not the filtered protected subset
    const lockedByUrl = new Map()
    for (let i = 0; i < userAddons.length; i++) {
      const cur = userAddons[i]
      if (!isProtected(cur)) continue
      const url = normalizeUrl(cur.transportUrl || cur.manifestUrl)
      if (url) {
        lockedByUrl.set(url, i)
      }
    }

    // Start with an array sized to current addons length
    const finalLength = userAddons.length
    const finalDesiredCollection = new Array(finalLength).fill(null)

    // Place protected addons at their original positions
    for (const addon of protectedUserAddons) {
      const url = normalizeUrl(addon.transportUrl || addon.manifestUrl)
      if (url && lockedByUrl.has(url)) {
        const pos = lockedByUrl.get(url)
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
    const userAddons = userAddonsResponse?.addons || userAddonsResponse || []

    // Get desired addons (group addons + protected addons)
    const { success: desiredAddonsSuccess, addons: desiredAddons, error: desiredAddonsError } = await getDesiredAddons(user, req, {
      prisma,
      getAccountId,
      decrypt,
      parseAddonIds,
      parseProtectedAddons,
      canonicalizeManifestUrl,
      StremioAPIClient,
      unsafeMode: unsafe
    })
    if (!desiredAddonsSuccess) {
      return { isSynced: false, status: 'error', message: desiredAddonsError }
    }

    // Simple comparison: are the two JSON arrays equal?
    const isSynced = JSON.stringify(userAddons) === JSON.stringify(desiredAddons)

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

module.exports = {
  getUserAddons,
  getDesiredAddons,
  createGetUserSyncStatus,
  createGetGroupSyncStatus,
}


