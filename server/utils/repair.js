const { buildAddonDbData } = require('./stremio')
const { decrypt, encrypt } = require('./encryption')

async function ensureDek(req, prisma, AUTH_ENABLED, getAccountDek) {
  try {
    if (AUTH_ENABLED && !req.accountDek && typeof getAccountDek === 'function') {
      let dek = getAccountDek(req.appAccountId)
      if (!dek && req.appAccountId) {
        const acct = await prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { uuid: true } })
        if (acct?.uuid) dek = getAccountDek(acct.uuid)
      }
      if (dek) req.accountDek = dek
    }
  } catch {}
}

async function repairAddonsList({
  prisma,
  AUTH_ENABLED,
  getAccountDek,
  getDecryptedManifestUrl,
  filterManifestByResources,
  filterManifestByCatalogs,
  manifestHash,
  encrypt
}, req, addonsList) {
  await ensureDek(req, prisma, AUTH_ENABLED, getAccountDek)

  let updated = 0
  let inspected = 0

  for (const addon of addonsList) {
    inspected++
    try {
      const addonName = addon.name || 'Unknown'
      const transportUrl = getDecryptedManifestUrl(addon, req)
      if (!transportUrl) { continue }

      const resourcesArr = (() => { try { return addon.resources ? JSON.parse(addon.resources) : [] } catch { return [] } })()
      const catalogsArr = (() => { try { return addon.catalogs ? JSON.parse(addon.catalogs) : [] } catch { return [] } })()

      // Prefer stored manifests first
      let originalManifestObj = null
      if (addon.originalManifest) {
        try { originalManifestObj = JSON.parse(decrypt(addon.originalManifest, req)) } catch {}
      }
      let filteredFromDb = null
      if (addon.manifest) {
        try { filteredFromDb = JSON.parse(decrypt(addon.manifest, req)) } catch {}
      }
      if (!originalManifestObj) originalManifestObj = filteredFromDb

      const needsId = !addon.stremioAddonId || String(addon.stremioAddonId).toLowerCase() === 'unknown'
      const needsIcon = !addon.iconUrl
      const isEmptyResources = Array.isArray(resourcesArr) && resourcesArr.length === 0

      // Fetch latest manifest only if necessary
      if (!originalManifestObj || needsId || needsIcon || isEmptyResources) {
        try {
          const resp = await fetch(transportUrl)
          if (resp.ok) {
            originalManifestObj = await resp.json()
          }
        } catch {}
      }
      if (!originalManifestObj) continue

      // Build filtered manifest based on current selections
      let filteredManifest = originalManifestObj
      if (Array.isArray(resourcesArr) && resourcesArr.length > 0) {
        filteredManifest = filterManifestByResources(originalManifestObj, resourcesArr)
      }
      if (Array.isArray(catalogsArr) && catalogsArr.length > 0) {
        filteredManifest = filterManifestByCatalogs(filteredManifest, catalogsArr)
      }

      if (!(isEmptyResources || needsId || needsIcon)) continue

      const dbData = buildAddonDbData(req, {
        name: addon.name,
        description: addon.description,
        sanitizedUrl: transportUrl,
        manifestObj: originalManifestObj,
        filteredManifest,
        // When resources are empty in DB, omit inputs so builder derives from manifest
        resources: isEmptyResources ? undefined : resourcesArr,
        catalogs: isEmptyResources ? undefined : catalogsArr,
        version: originalManifestObj?.version,
        iconUrl: originalManifestObj?.logo,
        stremioAddonId: originalManifestObj?.id,
        isActive: addon.isActive === true
      })

      const updateData = {}
      if (isEmptyResources) {
        Object.assign(updateData, dbData)
      } else {
        if (needsId && dbData.stremioAddonId) updateData.stremioAddonId = dbData.stremioAddonId
        if (needsIcon && dbData.iconUrl) updateData.iconUrl = dbData.iconUrl
        if (!addon.originalManifest && dbData.originalManifest) updateData.originalManifest = dbData.originalManifest
        if (!addon.manifest && dbData.manifest) updateData.manifest = dbData.manifest
        if (!addon.manifestHash && dbData.manifestHash) updateData.manifestHash = dbData.manifestHash
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.addon.update({ where: { id: addon.id }, data: updateData })
        const reasons = []
        if (isEmptyResources) reasons.push('resources')
        if (needsIcon) reasons.push('iconUrl')
        if (needsId) reasons.push('stremioAddonId')
        try { console.log(`${addonName} - repaired: ${reasons.join(', ')}`) } catch {}
        updated++
      }
    } catch (e) {
      // swallow
    }
  }

  return { inspected, updated }
}

module.exports = { repairAddonsList }


