const express = require('express')
const { parsePresentedKey } = require('../utils/apiKey')
const crypto = require('crypto')
const { getServerKey, aesGcmDecrypt } = require('../utils/encryption')
const { postDiscord } = require('../utils/notify')

module.exports = ({ prisma, getAccountId, scopedWhere, reloadDeps, syncGroupUsers }) => {
  const router = express.Router()

  // API key auth middleware - iterate accounts to find matching key
  router.use(async (req, res, next) => {
    try {
      const presented = parsePresentedKey(req.headers['authorization'] || '')
      if (!presented) return res.status(401).json({ message: 'Missing or invalid API key' })
      
      // Find account by decrypting stored keys and comparing
      const accounts = await prisma.appAccount.findMany({ where: { apiKeyHash: { not: null } }, select: { id: true, apiKeyHash: true } })
      const serverKey = getServerKey()
      for (const acct of accounts) {
        try {
          // Derive account-specific key and decrypt
          const accountKey = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(acct.id || ''), serverKey])).digest()
          const decrypted = aesGcmDecrypt(accountKey, acct.apiKeyHash)
          if (decrypted === presented) {
            req.appAccountId = acct.id
            return next()
          }
        } catch {
          // Decryption failed for this account, try next
          continue
        }
      }
      return res.status(401).json({ message: 'Invalid API key' })
    } catch (e) {
      return res.status(401).json({ message: 'Unauthorized' })
    }
  })

  // GET /ext/account - brief stats
  router.get('/account', async (req, res) => {
    try {
      const account = await prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { sync: true } })
      const sync = account?.sync && typeof account.sync === 'string' ? JSON.parse(account.sync) : account?.sync || {}
      const [usersCount, groupsCount, addonsCount] = await Promise.all([
        prisma.user.count({ where: { accountId: req.appAccountId } }),
        prisma.group.count({ where: { accountId: req.appAccountId } }),
        prisma.addon.count({ where: { accountId: req.appAccountId } }),
      ])
      return res.json({ lastRunAt: sync?.lastRunAt || null, usersCount, groupsCount, addonsCount })
    } catch (e) {
      return res.status(500).json({ message: 'Failed to get account info' })
    }
  })

  // POST /ext/addons/reload
  router.post('/addons/reload', async (req, res) => {
    try {
      const { stremioAddonId } = req.body || {}
      if (!stremioAddonId) return res.status(400).json({ message: 'stremioAddonId is required' })
      const addons = await prisma.addon.findMany({ where: { accountId: req.appAccountId, stremioAddonId }, select: { id: true, name: true } })
      if (!addons || addons.length === 0) return res.status(404).json({ message: 'No addons found' })
      const { reloadAddon } = require('./addons')
      const { decrypt, encrypt, getDecryptedManifestUrl, filterManifestByResources, filterManifestByCatalogs, manifestHash } = reloadDeps
      let reloaded = 0
      const diffsByAddon = []
      for (const a of addons) {
        try {
          const r = await reloadAddon(
            prisma,
            getAccountId,
            a.id,
            req,
            { filterManifestByResources, filterManifestByCatalogs, encrypt, decrypt, getDecryptedManifestUrl, manifestHash, silent: false }
          )
          reloaded++
          if (r?.diffs && (r.diffs.addedResources?.length || r.diffs.removedResources?.length || r.diffs.addedCatalogs?.length || r.diffs.removedCatalogs?.length)) {
            diffsByAddon.push({ id: a.id, name: a.name, diffs: r.diffs })
          }
        } catch {}
      }
      return res.json({ message: 'Addons reloaded', reloaded, total: addons.length, diffs: diffsByAddon })
    } catch (e) {
      return res.status(500).json({ message: 'Failed to reload addon', error: e?.message })
    }
  })

  // POST /ext/addons/sync
  // Reload all addons in this account that share the given stremioAddonId,
  // then sync all groups that contain any of those addons (no reload during sync)
  router.post('/addons/sync', async (req, res) => {
    try {
      const { stremioAddonId } = req.body || {}
      if (!stremioAddonId) return res.status(400).json({ message: 'stremioAddonId is required' })

      // Find all matching addons for this account
      const addons = await prisma.addon.findMany({ where: { accountId: req.appAccountId, stremioAddonId }, select: { id: true, name: true } })
      if (!addons || addons.length === 0) return res.status(404).json({ message: 'No addons found for this stremioAddonId' })

      // Reload each addon using the shared helper
      const { reloadAddon } = require('./addons')
      const { decrypt, encrypt, getDecryptedManifestUrl, filterManifestByResources, filterManifestByCatalogs, manifestHash } = reloadDeps
      let reloaded = 0
      const diffsByAddon = []
      for (const a of addons) {
        try {
          const r = await reloadAddon(
            prisma,
            getAccountId,
            a.id,
            req,
            { filterManifestByResources, filterManifestByCatalogs, encrypt, decrypt, getDecryptedManifestUrl, manifestHash, silent: false }
          )
          reloaded++
          if (r?.diffs && (r.diffs.addedResources?.length || r.diffs.removedResources?.length || r.diffs.addedCatalogs?.length || r.diffs.removedCatalogs?.length)) {
            diffsByAddon.push({ id: a.id, name: a.name, diffs: r.diffs })
          }
        } catch {}
      }

      // Find all groups (account-scoped) that contain any of these addon IDs
      const addonIds = addons.map(a => a.id)
      const groups = await prisma.group.findMany({
        where: {
          accountId: req.appAccountId,
          addons: { some: { addonId: { in: addonIds } } }
        },
        select: { id: true, userIds: true }
      })
      const groupIds = groups.map(g => g.id)

      // Resolve unsafe from account config (DB-backed)
      let unsafe = false
      try {
        const acc = await prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { sync: true } })
        let cfg = acc?.sync
        if (cfg && typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch { cfg = null } }
        if (cfg && typeof cfg.safe === 'boolean') unsafe = !cfg.safe
      } catch {}

      // Sync those groups WITHOUT reload: use exported syncGroupUsers helper with x-sync-mode=normal
      let groupsSynced = 0
      let totalUsersSynced = 0
      const allReloadDiffs = []
      for (const gid of groupIds) {
        try {
          const reqLike = { appAccountId: req.appAccountId, headers: { 'x-sync-mode': 'normal' }, body: { unsafe } }
          const r = await syncGroupUsers(prisma, getAccountId, scopedWhere, reloadDeps.decrypt, gid, reqLike)
          if (r && !r.error) {
            groupsSynced++
            totalUsersSynced += r?.syncedUsers || 0
            if (Array.isArray(r.reloadDiffs) && r.reloadDiffs.length) {
              allReloadDiffs.push(...r.reloadDiffs)
            }
          }
        } catch {}
      }

      // Count total users across all attempted groups
      let totalUsers = 0
      const allUserIds = new Set()
      for (const g of groups) {
        if (g.userIds) {
          try {
            const userIds = Array.isArray(g.userIds) ? g.userIds : JSON.parse(g.userIds || '[]')
            if (Array.isArray(userIds)) {
              userIds.forEach(id => allUserIds.add(id))
            }
          } catch {}
        }
      }
      totalUsers = allUserIds.size

      // Count total addons from all attempted groups
      let totalAddons = 0
      if (groupIds.length > 0) {
        try {
          const groupAddons = await prisma.groupAddon.findMany({
            where: { groupId: { in: groupIds } },
            select: { addonId: true }
          })
          totalAddons = new Set(groupAddons.map(ga => ga.addonId)).size
        } catch {}
      }

      // Send webhook notification
      try {
        const account = await prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { sync: true } })
        let syncCfg = account?.sync
        if (syncCfg && typeof syncCfg === 'string') { try { syncCfg = JSON.parse(syncCfg) } catch { syncCfg = null } }
        const webhookUrl = syncCfg?.webhookUrl
        
        if (webhookUrl && (groupIds.length > 0 || diffsByAddon.length > 0)) {
          const syncSource = req.headers['source'] || req.headers['x-sync-source'] || req.headers['x-app-name'] || null
          const sourceLogo = req.headers['source-logo'] || req.headers['x-source-logo'] || null
          const sourceLabel = syncSource || 'API'
          
          const fields = []
          
          // Description line: since we reloaded addons before syncing, show this
          const description = undefined

          const embed = {
            title: `Sync Succeeded on ${groups.length} Groups (${totalUsers} Users)`,
            color: 0x808080,
            description: description,
            fields: fields,
            timestamp: new Date().toISOString()
          }
          // Add diffs as one code block per addon (Resources / Catalogs)
          if (Array.isArray(diffsByAddon) && diffsByAddon.length) {
            for (const item of diffsByAddon) {
              const addonName = item?.name || item?.id
              const d = item?.diffs || {}
              const sections = []
              const resLines = []
              const catLines = []
              if (Array.isArray(d.addedResources)) d.addedResources.forEach(r => resLines.push(`+ ${r}`))
              if (Array.isArray(d.removedResources)) d.removedResources.forEach(r => resLines.push(`- ${r}`))
              if (Array.isArray(d.addedCatalogs)) d.addedCatalogs.forEach(label => catLines.push(`+ ${label}`))
              if (Array.isArray(d.removedCatalogs)) d.removedCatalogs.forEach(label => catLines.push(`- ${label}`))
              if (resLines.length) {
                sections.push('Resources:')
                sections.push(...resLines)
              }
              if (catLines.length) {
                if (resLines.length) sections.push('')
                sections.push('Catalogs:')
                sections.push(...catLines)
              }
              if (sections.length) {
                embed.fields.push({ name: addonName, value: '```' + sections.join('\n') + '```', inline: false })
              }
            }
          }
          
          // Add author block if source/logo provided
          if (sourceLabel !== 'API' || sourceLogo) {
            embed.author = {
              name: sourceLabel
            }
            if (sourceLogo) {
              embed.author.icon_url = sourceLogo
            }
          }
          
          // Always use Syncio logo as avatar; author icon (when provided) comes from Source-Logo
          await postDiscord(webhookUrl, null, { embeds: [embed], avatar_url: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png' })
        }
      } catch {}

      return res.json({ message: 'Reload and sync completed', reloaded, groupsSynced, totalUsersSynced, diffs: diffsByAddon })
    } catch (e) {
      return res.status(500).json({ message: 'Failed to reload and sync by stremioAddonId', error: e?.message })
    }
  })

  // POST /ext/groups/sync
  router.post('/groups/sync', async (req, res) => {
    try {
      const groups = await prisma.group.findMany({ where: { accountId: req.appAccountId }, select: { id: true, name: true, userIds: true } })
      let totalSynced = 0
      let totalFailed = 0
      const attemptedGroupIds = groups.map(g => g.id)
      
      // Count total users across all attempted groups
      let totalUsers = 0
      const allUserIds = new Set()
      for (const g of groups) {
        if (g.userIds) {
          try {
            const userIds = Array.isArray(g.userIds) ? g.userIds : JSON.parse(g.userIds || '[]')
            if (Array.isArray(userIds)) {
              userIds.forEach(id => allUserIds.add(id))
            }
          } catch {}
        }
      }
      totalUsers = allUserIds.size
      
      // Get sync mode from account config
      let syncMode = 'normal'
      try {
        const account = await prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { sync: true } })
        let syncCfg = account?.sync
        if (syncCfg && typeof syncCfg === 'string') { try { syncCfg = JSON.parse(syncCfg) } catch { syncCfg = null } }
        if (syncCfg && syncCfg.mode === 'advanced') syncMode = 'advanced'
      } catch {}
      
      const allReloadDiffs = []
      for (const g of groups) {
        try {
          const r = await syncGroupUsers(prisma, getAccountId, scopedWhere, reloadDeps.decrypt, g.id, req)
          if (r && !r.error) {
            totalSynced += r.syncedUsers || 0
            totalFailed += r.failedUsers || 0
            if (Array.isArray(r.reloadDiffs) && r.reloadDiffs.length) {
              allReloadDiffs.push(...r.reloadDiffs)
            }
          } else {
            console.error(`Failed to sync group ${g.id}:`, r?.error || 'Unknown error')
            totalFailed++
          }
        } catch (e) {
          console.error(`Error syncing group ${g.id}:`, e?.message || e)
          totalFailed++
        }
      }
      
      // Count total addons from all attempted groups (even if some failed)
      let totalAddons = 0
      if (attemptedGroupIds.length > 0) {
        try {
          const groupAddons = await prisma.groupAddon.findMany({
            where: { groupId: { in: attemptedGroupIds } },
            select: { addonId: true }
          })
          totalAddons = new Set(groupAddons.map(ga => ga.addonId)).size
        } catch {}
      }
      
      // Send webhook notification
      try {
        const account = await prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { sync: true } })
        let syncCfg = account?.sync
        if (syncCfg && typeof syncCfg === 'string') { try { syncCfg = JSON.parse(syncCfg) } catch { syncCfg = null } }
        const webhookUrl = syncCfg?.webhookUrl
        const unsafe = (syncCfg && typeof syncCfg.safe === 'boolean') ? !syncCfg.safe : !!(syncCfg && syncCfg.unsafe)
        
        if (webhookUrl && groups.length > 0) {
          const syncSource = req.headers['source'] || req.headers['x-sync-source'] || req.headers['x-app-name'] || null
          const sourceLogo = req.headers['source-logo'] || req.headers['x-source-logo'] || null
          const sourceLabel = syncSource || 'API'
          
          const fields = []
          
          // Optional description line for advanced mode
          const description = syncMode === 'advanced' ? 'All Group Addons Reloaded' : undefined

          const embed = {
            title: `Sync Succeeded on ${groups.length} Groups (${totalUsers} Users)`,
            color: 0x808080,
            fields: fields,
            timestamp: new Date().toISOString()
          }
          if (description) embed.description = description
          if (syncMode === 'advanced' && allReloadDiffs.length) {
            for (const item of allReloadDiffs) {
              const addonName = item?.name || item?.id
              const d = item?.diffs || {}
              const sections = []
              const resLines = []
              const catLines = []
              if (Array.isArray(d.addedResources)) d.addedResources.forEach(r => resLines.push(`+ ${r}`))
              if (Array.isArray(d.removedResources)) d.removedResources.forEach(r => resLines.push(`- ${r}`))
              if (Array.isArray(d.addedCatalogs)) d.addedCatalogs.forEach(label => catLines.push(`+ ${label}`))
              if (Array.isArray(d.removedCatalogs)) d.removedCatalogs.forEach(label => catLines.push(`- ${label}`))
              if (resLines.length) {
                sections.push('Resources:')
                sections.push(...resLines)
              }
              if (catLines.length) {
                if (resLines.length) sections.push('')
                sections.push('Catalogs:')
                sections.push(...catLines)
              }
              if (sections.length) {
                embed.fields.push({ name: addonName, value: '```' + sections.join('\n') + '```', inline: false })
              }
            }
          }
          
          // Add author block if source/logo provided
          if (sourceLabel !== 'API' || sourceLogo) {
            embed.author = {
              name: sourceLabel
            }
            if (sourceLogo) {
              embed.author.icon_url = sourceLogo
            }
          }
          
          // Always use Syncio logo as avatar; author icon (when provided) comes from Source-Logo
          await postDiscord(webhookUrl, null, { embeds: [embed], avatar_url: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png' })
        }
      } catch {}
      
      const ok = Math.max(0, groups.length - totalFailed)
      return res.json({ message: 'Sync triggered', ok, fail: totalFailed, totalSynced, totalFailed })
    } catch (e) {
      return res.status(500).json({ message: 'Failed to sync all groups', error: e?.message })
    }
  })

  return router
}


