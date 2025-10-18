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
    const rawAddons = collection?.addons || collection || {}
    const stremioAddons = Array.isArray(rawAddons) ? rawAddons : (typeof rawAddons === 'object' ? Object.values(rawAddons) : [])
    
    return { success: true, addons: stremioAddons, error: null }
  } catch (error) {
    return { success: false, addons: [], error: error.message || 'Failed to fetch Stremio addons' }
  }
}

/**
 * Get desired addons for a user (group addons + protected addons from Stremio)
 */
async function getDesiredAddons(user, req, { prisma, getAccountId, decrypt, parseAddonIds, parseProtectedAddons, canonicalizeManifestUrl, StremioAPIClient }) {
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
    const groupAddons = groups.length > 0 ? await getGroupAddons(prisma, groups[0].id, req) : []

    // Get user's Stremio addons
    const { success, addons: userAddons, error } = await getUserAddons(user, req, { decrypt, StremioAPIClient })
    if (!success) {
      return { success: false, addons: [], error }
    }

    // Parse excluded and protected addons
    const excludedAddons = parseAddonIds(user.excludedAddons)
    const protectedAddons = parseProtectedAddons(user.protectedAddons, req)
    
    // Include default addons as protected addons
    const { defaultAddons } = require('../utils/config')
    const normalizeUrl = (u) => {
      try {
        return canonicalizeManifestUrl ? canonicalizeManifestUrl(u) : String(u || '').trim().toLowerCase()
      } catch (e) {
        return String(u || '').trim().toLowerCase()
      }
    }
    
    const defaultProtectedUrls = defaultAddons.manifestUrls.map(normalizeUrl)
    const allProtectedUrls = [
      ...(Array.isArray(protectedAddons) ? protectedAddons : []).filter(Boolean).map(normalizeUrl),
      ...defaultProtectedUrls
    ]
    const protectedUrlSet = new Set(allProtectedUrls)

    // Create desired addons list
    const desiredAddons = []
    const addedUrls = new Set()

    // 1. Add group addons (excluding only excluded ones)
    const excludedSet = new Set((excludedAddons || []).map(id => String(id).trim()))
    
    for (const groupAddon of groupAddons) {
      const addonUrl = normalizeUrl(groupAddon.manifestUrl)
      if (!excludedSet.has(groupAddon.id)) {
        desiredAddons.push(groupAddon)
        addedUrls.add(addonUrl)
      }
    }

    // 2. Add protected addons from Stremio account (preserving their position)
    for (const userAddon of userAddons) {
      const addonUrl = normalizeUrl(userAddon.transportUrl || userAddon.manifestUrl)
      if (addonUrl && protectedUrlSet.has(addonUrl) && !addedUrls.has(addonUrl)) {
        // Convert Stremio addon format to match group addon format
        const desiredAddon = {
          id: userAddon.id || addonUrl,
          name: userAddon.name || userAddon.title || 'Unknown',
          manifestUrl: addonUrl,
          description: userAddon.description || '',
          version: userAddon.version || null,
          iconUrl: userAddon.icon || null,
          stremioAddonId: userAddon.id || null,
          // Add position info to maintain order
          _originalPosition: userAddons.indexOf(userAddon)
        }
        desiredAddons.push(desiredAddon)
        addedUrls.add(addonUrl)
      }
    }

    // Sort by original position to maintain Stremio order for protected addons
    desiredAddons.sort((a, b) => {
      if (a._originalPosition !== undefined && b._originalPosition !== undefined) {
        return a._originalPosition - b._originalPosition
      }
      if (a._originalPosition !== undefined) return -1
      if (b._originalPosition !== undefined) return 1
      return 0
    })

    // Remove position info before returning
    const finalDesiredAddons = desiredAddons.map(({ _originalPosition, ...addon }) => addon)

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

    const { success, addons: stremioAddons, error } = await getUserAddons(user, req, { decrypt, StremioAPIClient })
    if (!success) {
      return { isSynced: false, status: 'error', message: error }
    }

    const groupWhere = { accountId: getAccountId(req), userIds: { contains: user.id } }
    if (groupId) groupWhere.id = groupId
    const groups = await prisma.group.findMany({
      where: groupWhere,
      include: { addons: { where: { addon: { accountId: getAccountId(req) } }, include: { addon: true } } }
    })
    if (!groups || groups.length === 0) {
      return { isSynced: false, status: 'stale', message: 'User has no group assigned', stremioAddonsCount: stremioAddons.length, groupAddonsCount: 0 }
    }

    const excludedAddons = parseAddonIds(user.excludedAddons)
    const protectedAddons = parseProtectedAddons(user.protectedAddons, req)
    
    // Include default addons as protected addons (they should never be removed)
    const { defaultAddons } = require('../utils/config')
    const defaultProtectedUrls = defaultAddons.manifestUrls.map(normalizeUrl)
    const allProtectedUrls = [
      ...(Array.isArray(protectedAddons) ? protectedAddons : []).filter(Boolean).map(normalizeUrl),
      ...defaultProtectedUrls
    ]
    const protectedUrlSet = new Set(allProtectedUrls)

    try {
      for (const group of groups) {
        const sorted = [...(group.addons || [])]
          .sort((a, b) => ((a?.position ?? 0) - (b?.position ?? 0)))
          .filter(ga => ga.addon && ga.addon.isActive !== false)
        console.log(`📦 Group ${group.name || group.id} addons (by position):`)
        if (sorted.length === 0) {
          console.log('  [empty]')
        } else {
          sorted.forEach((ga, idx) => {
            let url = null
            try { url = getDecryptedManifestUrl(ga.addon, req) } catch {}
            const isProt = url ? protectedUrlSet.has(normalizeUrl(url)) : false
            console.log(`  ${idx + 1} - ${ga.addon.name}${isProt ? ' (protected)' : ''}`)
          })
        }
      }
    } catch {}

    // Use shared helper to ensure identical ordering and decryption
    const { getGroupAddons } = require('../utils/helpers')
    const groupedLists = await Promise.all(groups.map(g => getGroupAddons(prisma, g.id, req)))
    const groupAddons = groupedLists.flat()

    const excludedSet = new Set((excludedAddons || []).map(id => String(id).trim()))
    const filteredExpectedAddons = groupAddons.filter(addon => !excludedSet.has(addon.id))

    try {
      const desiredLines = filteredExpectedAddons.map((a, idx) => {
        const isProt = protectedUrlSet.has(normalizeUrl(a.manifestUrl))
        return `${idx + 1} - ${a.name}${isProt ? ' (protected)' : ''}`
      })
      console.log('📊 Desired collection (order):')
      if (desiredLines.length > 0) desiredLines.forEach(l => console.log(l)); else console.log('[empty]')
    } catch {}

    const stremioAddonUrls = new Set(stremioAddons.map(a => a.transportUrl || a.manifestUrl).filter(Boolean).map(normalizeUrl))
    const expectedAddonUrls = new Set(filteredExpectedAddons.map(a => a.manifestUrl).filter(Boolean).map(normalizeUrl))

    const missingAddons = filteredExpectedAddons.filter(exp => !stremioAddonUrls.has(normalizeUrl(exp.manifestUrl)))
    const extraAddons = stremioAddons.filter(stremioAddon => {
      const url = normalizeUrl(stremioAddon.transportUrl || stremioAddon.manifestUrl)
      if (!url) return false
      if (protectedUrlSet.has(url)) return false
      return !expectedAddonUrls.has(url)
    })

    const userOrder = stremioAddons.map(a => normalizeUrl(a.transportUrl || a.manifestUrl)).filter(Boolean).filter(u => !protectedUrlSet.has(u))
    const expectedOrder = filteredExpectedAddons.map(a => normalizeUrl(a.manifestUrl)).filter(u => !protectedUrlSet.has(u))
    const userGroupAddons = userOrder.filter(url => expectedAddonUrls.has(url))
    const orderMatches = JSON.stringify(userGroupAddons) === JSON.stringify(expectedOrder)

    const isSynced = missingAddons.length === 0 && extraAddons.length === 0 && orderMatches

    return {
      isSynced,
      status: isSynced ? 'synced' : 'unsynced',
      stremioAddonsCount: stremioAddons.length,
      groupAddonsCount: filteredExpectedAddons.length,
      excludedAddons,
      protectedAddons,
      orderMatches,
      debugInfo: process.env.NODE_ENV === 'development' ? { expectedOrder, actualOrder: userGroupAddons, orderMatches } : undefined,
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


