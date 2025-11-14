const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs')
const { decrypt, encrypt } = require('../utils/encryption')
const { DEFAULT_ACCOUNT_ID, DEFAULT_ACCOUNT_UUID } = require('../utils/config')
const { postDiscord } = require('../utils/notify')

module.exports = ({ prisma, AUTH_ENABLED, getAccountDek, getDecryptedManifestUrl, getAccountId }) => {
  const router = express.Router();

  const ensureDefaultAccount = async () => {
    const privatePassword = process.env.PRIVATE_ACCOUNT_PASSWORD || 'private-mode'
    const defaultSyncPayload = JSON.stringify({ enabled: false, frequency: '0', safe: true, mode: 'normal', webhookUrl: null })

    let account = await prisma.appAccount.findUnique({ where: { id: DEFAULT_ACCOUNT_ID } })
    if (!account) {
      const passwordHash = await bcrypt.hash(privatePassword, 12)
      account = await prisma.appAccount.create({
        data: {
          id: DEFAULT_ACCOUNT_ID,
          uuid: DEFAULT_ACCOUNT_UUID,
          passwordHash,
          sync: defaultSyncPayload
        }
      })
      return account
    }

    const updates = {}
    if (!account.uuid || account.uuid !== DEFAULT_ACCOUNT_UUID) {
      updates.uuid = DEFAULT_ACCOUNT_UUID
    }
    if (!account.passwordHash) {
      updates.passwordHash = await bcrypt.hash(privatePassword, 12)
    }
    if (!account.sync) {
      updates.sync = defaultSyncPayload
    }

    if (Object.keys(updates).length) {
      account = await prisma.appAccount.update({ where: { id: DEFAULT_ACCOUNT_ID }, data: updates })
    }

    return account
  }

  router.get('/account-info', async (req, res) => {
    try {
      if (!AUTH_ENABLED) {
        const account = await ensureDefaultAccount()
        return res.json({
          id: DEFAULT_ACCOUNT_ID,
          uuid: account?.uuid || DEFAULT_ACCOUNT_UUID,
        })
      }

      if (!req.appAccountId) {
        return res.status(401).json({ message: 'Unauthorized' })
      }

      const account = await prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { id: true, uuid: true } })
      if (!account) {
        return res.status(404).json({ message: 'Account not found' })
      }
      return res.json(account)
    } catch (e) {
      return res.status(500).json({ message: 'Failed to load account info', error: e?.message })
    }
  })

  // Backup settings endpoints - only available in private mode
  if (!AUTH_ENABLED) {
    // Use centralized backup utilities
    const { 
      ensureBackupDir, 
      readBackupFrequencyDays, 
      writeBackupFrequencyDays, 
      performBackupOnce, 
      clearBackupSchedule, 
      scheduleBackups 
    } = require('../utils/backup');
    
    let backupTimer = null

    // Initialize backup schedule on startup
    scheduleBackups(readBackupFrequencyDays())

    // Get backup frequency setting
    router.get('/backup-frequency', async (req, res) => {
      try {
        return res.json({ days: readBackupFrequencyDays() })
      } catch {
        return res.status(500).json({ message: 'Failed to read backup frequency' })
      }
    })

    // Update backup frequency setting
    router.put('/backup-frequency', async (req, res) => {
      try {
        const days = Number(req.body?.days || 0)
        if (!Number.isFinite(days) || days < 0) return res.status(400).json({ message: 'Invalid days' })
        writeBackupFrequencyDays(days)
        scheduleBackups(days)
        return res.json({ message: 'Backup frequency updated', days })
      } catch {
        return res.status(500).json({ message: 'Failed to update backup frequency' })
      }
    })

    // Manual backup trigger
    router.post('/backup-now', async (req, res) => {
      try {
        await performBackupOnce()
        return res.json({ message: 'Backup started' })
      } catch {
        return res.status(500).json({ message: 'Failed to start backup' })
      }
    })
  }

  // Sync settings endpoints - available in all modes
  const { 
    readSyncFrequencyMinutes,
    writeSyncFrequencyMinutes,
    scheduleSyncs,
    performSyncOnce 
  } = require('../utils/syncScheduler');

  // Per-account sync settings (AUTH mode)
  router.get('/account-sync', async (req, res) => {
    try {
      if (!AUTH_ENABLED) {
        const account = await ensureDefaultAccount()
        let syncCfg = account?.sync
        if (syncCfg && typeof syncCfg === 'string') {
          try { syncCfg = JSON.parse(syncCfg) } catch { syncCfg = null }
        }

        const minutes = readSyncFrequencyMinutes()
        const derivedFrequency = minutes === 1 ? '1m' : (minutes >= 1440 ? `${Math.round(minutes / 1440)}d` : `${minutes}m`)

        const enabled = syncCfg && typeof syncCfg === 'object'
          ? syncCfg.enabled !== false
          : minutes > 0

        const response = {
          enabled,
          frequency: (syncCfg && typeof syncCfg === 'object' && syncCfg.frequency) ? String(syncCfg.frequency).trim() : derivedFrequency,
          safe: (syncCfg && typeof syncCfg === 'object' && typeof syncCfg.safe === 'boolean') ? syncCfg.safe : true,
          mode: (syncCfg && typeof syncCfg === 'object' && syncCfg.mode === 'advanced') ? 'advanced' : 'normal',
          webhookUrl: (syncCfg && typeof syncCfg === 'object' && typeof syncCfg.webhookUrl === 'string') ? syncCfg.webhookUrl : '',
          useCustomFields: (syncCfg && typeof syncCfg === 'object' && typeof syncCfg.useCustomFields === 'boolean') ? syncCfg.useCustomFields : ((syncCfg && typeof syncCfg === 'object' && typeof syncCfg.useCustomNames === 'boolean') ? syncCfg.useCustomNames : true)
        }

        return res.json(response)
      }
      const acc = await prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { sync: true } })
      let syncCfg = acc?.sync || null
      if (syncCfg && typeof syncCfg === 'string') {
        try { syncCfg = JSON.parse(syncCfg) } catch { syncCfg = null }
      }
      if (syncCfg && typeof syncCfg === 'object') {
        const safe = (typeof syncCfg.safe === 'boolean') ? syncCfg.safe : !syncCfg.unsafe
        const mode = syncCfg.mode === 'advanced' ? 'advanced' : 'normal'
        const frequency = (typeof syncCfg.frequency === 'string' && syncCfg.frequency.trim())
          ? syncCfg.frequency.trim()
          : '0'
        const resp = { enabled: syncCfg.enabled !== false, safe, mode, frequency, lastRunAt: syncCfg.lastRunAt, webhookUrl: syncCfg.webhookUrl || '', useCustomFields: (typeof syncCfg.useCustomFields === 'boolean') ? syncCfg.useCustomFields : ((typeof syncCfg.useCustomNames === 'boolean') ? syncCfg.useCustomNames : true) }
        return res.json(resp)
      }
      return res.json({ enabled: false, frequency: 0, safe: true, mode: 'normal', useCustomFields: true })
    } catch (e) {
      return res.status(500).json({ message: 'Failed to read account sync settings' })
    }
  })

  router.put('/account-sync', async (req, res) => {
    try {
      const { enabled, frequency, mode, unsafe, safe, webhookUrl, useCustomFields, useCustomNames } = req.body || {}
      // Support both useCustomFields (new) and useCustomNames (old) for backward compatibility
      const useCustomFieldsValue = useCustomFields !== undefined ? useCustomFields : useCustomNames
      if (!AUTH_ENABLED) {
        await ensureDefaultAccount()
        const safeMinutes = (() => {
          if (frequency === undefined || frequency === null) return null
          if (typeof frequency === 'number') return frequency
          if (typeof frequency === 'string') {
            const trimmed = frequency.trim().toLowerCase()
            if (trimmed.endsWith('d')) {
              const days = Number(trimmed.slice(0, -1))
              return Number.isFinite(days) && days > 0 ? days * 1440 : null
            }
            if (trimmed.endsWith('h')) {
              const hours = Number(trimmed.slice(0, -1))
              return Number.isFinite(hours) && hours > 0 ? hours * 60 : null
            }
            if (trimmed.endsWith('m')) {
              const mins = Number(trimmed.slice(0, -1))
              return Number.isFinite(mins) && mins >= 0 ? mins : null
            }
            const raw = Number(trimmed)
            return Number.isFinite(raw) && raw >= 0 ? raw : null
          }
          return null
        })()

        if (safeMinutes !== null && safeMinutes < 0) {
          return res.status(400).json({ message: 'Invalid frequency value' })
        }

        const nextMinutes = enabled === false ? 0 : (safeMinutes ?? readSyncFrequencyMinutes())
        if (!Number.isFinite(nextMinutes) || nextMinutes < 0) {
          return res.status(400).json({ message: 'Invalid minutes' })
        }

        writeSyncFrequencyMinutes(nextMinutes)

        const current = await prisma.appAccount.findUnique({ where: { id: DEFAULT_ACCOUNT_ID }, select: { sync: true } })
        let syncCfg = current?.sync
        if (syncCfg && typeof syncCfg === 'string') {
          try { syncCfg = JSON.parse(syncCfg) } catch { syncCfg = null }
        }
        const baseCfg = (syncCfg && typeof syncCfg === 'object') ? syncCfg : {}
        const nextCfg = {
          ...baseCfg,
          enabled: enabled === undefined ? baseCfg.enabled !== false : !!enabled,
          frequency: typeof frequency === 'string' && frequency.trim() ? frequency.trim() : baseCfg.frequency || '0',
          safe: safe !== undefined ? !!safe : (unsafe !== undefined ? !unsafe : baseCfg.safe !== false),
          mode: mode === 'advanced' ? 'advanced' : baseCfg.mode === 'advanced' ? 'advanced' : 'normal',
          webhookUrl: webhookUrl !== undefined ? (webhookUrl || null) : (baseCfg.webhookUrl || null),
          useCustomFields: useCustomFieldsValue !== undefined ? !!useCustomFieldsValue : ((baseCfg.useCustomFields !== undefined ? baseCfg.useCustomFields : (baseCfg.useCustomNames !== undefined ? baseCfg.useCustomNames : true)))
        }

        try {
          await prisma.appAccount.update({ where: { id: DEFAULT_ACCOUNT_ID }, data: { sync: nextCfg } })
        } catch {
          await prisma.appAccount.update({ where: { id: DEFAULT_ACCOUNT_ID }, data: { sync: JSON.stringify(nextCfg) } })
        }

        const { reloadGroupAddons } = require('../routes/users')
        const scopedWhere = require('../utils/helpers').scopedWhere
        const decrypt = require('../utils/encryption').decrypt
        const schedulerReq = { appAccountId: DEFAULT_ACCOUNT_ID }
        scheduleSyncs(nextMinutes, prisma, getAccountId, scopedWhere, decrypt, reloadGroupAddons, schedulerReq, false)
        return res.json({ message: 'Sync settings updated' })
      }
      // Load current config to preserve unspecified fields
      const acc = await prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { sync: true } })
      let current = acc?.sync || null
      if (current && typeof current === 'string') { try { current = JSON.parse(current) } catch { current = null } }
      const base = (current && typeof current === 'object') ? current : {}

      // Build partial update only for provided fields
      const partial = {}
      if (enabled !== undefined) partial.enabled = !!enabled
      if (frequency !== undefined) partial.frequency = String(frequency)
      if (mode !== undefined) partial.mode = (mode === 'advanced') ? 'advanced' : 'normal'
      if (safe !== undefined) partial.safe = !!safe
      else if (unsafe !== undefined) partial.safe = !unsafe
      if (webhookUrl !== undefined) partial.webhookUrl = webhookUrl || null
      if (useCustomFieldsValue !== undefined) partial.useCustomFields = !!useCustomFieldsValue

      const nextCfg = { ...base, ...partial }

      // Persist JSON (Postgres) or stringified (SQLite)
      try {
        await prisma.appAccount.update({ where: { id: req.appAccountId }, data: { sync: nextCfg } })
      } catch {
        await prisma.appAccount.update({ where: { id: req.appAccountId }, data: { sync: JSON.stringify(nextCfg) } })
      }
      // Reschedule heap with new config (scheduler will re-seed on next scheduleSyncs call)
      const { reloadGroupAddons } = require('../routes/users');
      const scopedWhere = require('../utils/helpers').scopedWhere;
      const decrypt = require('../utils/encryption').decrypt;
      scheduleSyncs(0, prisma, getAccountId, scopedWhere, decrypt, reloadGroupAddons, req, true) // clear
      scheduleSyncs(1, prisma, getAccountId, scopedWhere, decrypt, reloadGroupAddons, req, true) // re-seed; minutes ignored in AUTH mode
      return res.json({ message: 'Account sync settings updated' })
    } catch (e) {
      return res.status(500).json({ message: 'Failed to update account sync settings', error: e?.message })
    }
  })

  router.post('/account-sync/test-webhook', async (req, res) => {
    try {
      const providedUrl = typeof req.body?.webhookUrl === 'string' ? req.body.webhookUrl.trim() : ''
      let targetUrl = providedUrl

      const readAccountWebhook = async (accountId) => {
        const acc = await prisma.appAccount.findUnique({ where: { id: accountId }, select: { sync: true } })
        if (!acc) return null
        let syncCfg = acc.sync
        if (typeof syncCfg === 'string') {
          try { syncCfg = JSON.parse(syncCfg) } catch { syncCfg = null }
        }
        if (syncCfg && typeof syncCfg === 'object' && syncCfg.webhookUrl) {
          return String(syncCfg.webhookUrl)
        }
        return null
      }

      if (!targetUrl) {
        if (AUTH_ENABLED) {
          if (!req.appAccountId) {
            return res.status(401).json({ message: 'Unauthorized' })
          }
          targetUrl = await readAccountWebhook(req.appAccountId)
        } else {
          await ensureDefaultAccount()
          targetUrl = await readAccountWebhook(DEFAULT_ACCOUNT_ID)
        }
      }

      if (!targetUrl) {
        return res.status(400).json({ message: 'No webhook URL configured' })
      }

      await postDiscord(targetUrl, '🔬 Syncio test webhook message')
      return res.json({ message: 'Test message sent' })
    } catch (e) {
      console.error('Failed to send webhook test:', e)
      return res.status(500).json({ message: 'Failed to send test message', error: e?.message })
    }
  })

  // Manual sync trigger
  router.post('/sync-now', async (req, res) => {
    try {
      const { reloadGroupAddons } = require('../routes/users');
      const scopedWhere = require('../utils/helpers').scopedWhere;
      const decrypt = require('../utils/encryption').decrypt;
      
      const schedulerReq = {
        appAccountId: AUTH_ENABLED ? req.appAccountId : DEFAULT_ACCOUNT_ID
      };
      const result = await performSyncOnce(prisma, getAccountId, scopedWhere, decrypt, reloadGroupAddons, schedulerReq, AUTH_ENABLED)
      return res.json({ message: 'Sync started', result })
    } catch (e) {
      return res.status(500).json({ message: 'Failed to start sync', error: e?.message })
    }
  })

  // API Key management (generate/revoke)
  router.get('/account-api', async (req, res) => {
    try {
      const acc = await prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { apiKeyHash: true } })
      if (!acc?.apiKeyHash) {
        return res.json({ hasKey: false, apiKey: null })
      }
      // Decrypt using account-specific key (accountId + server key)
      try {
        const { getServerKey, aesGcmDecrypt } = require('../utils/encryption')
        const serverKey = getServerKey()
        const accountKey = require('crypto').createHash('sha256').update(Buffer.concat([Buffer.from(req.appAccountId || ''), serverKey])).digest()
        const decrypted = aesGcmDecrypt(accountKey, acc.apiKeyHash)
        return res.json({ hasKey: true, apiKey: decrypted })
      } catch (e) {
        // If decryption fails, key might be in old format - treat as no key
        return res.json({ hasKey: false, apiKey: null })
      }
    } catch {
      return res.status(500).json({ message: 'Failed to read API key status' })
    }
  })

  router.post('/account-api-key', async (req, res) => {
    try {
      if (!req.appAccountId) {
        return res.status(401).json({ message: 'Unauthorized' })
      }
      const { generateApiKey } = require('../utils/apiKey')
      const { getServerKey, aesGcmEncrypt } = require('../utils/encryption')
      const key = generateApiKey()
      // Encrypt using account-specific key (accountId + server key)
      const serverKey = getServerKey()
      const accountKey = require('crypto').createHash('sha256').update(Buffer.concat([Buffer.from(req.appAccountId || ''), serverKey])).digest()
      const encrypted = aesGcmEncrypt(accountKey, key)
      await prisma.appAccount.update({ where: { id: req.appAccountId }, data: { apiKeyHash: encrypted } })
      // Return the full key ONCE
      return res.json({ apiKey: key })
    } catch (e) {
      console.error('Error generating API key:', e)
      return res.status(500).json({ message: 'Failed to generate API key', error: e?.message })
    }
  })

  router.delete('/account-api-key', async (req, res) => {
    try {
      await prisma.appAccount.update({ where: { id: req.appAccountId }, data: { apiKeyHash: null } })
      return res.json({ message: 'API key revoked' })
    } catch (e) {
      return res.status(500).json({ message: 'Failed to revoke API key' })
    }
  })

  // Repair addons metadata (fill missing stremioAddonId and iconUrl from manifest)
  // Scopes to current account when AUTH is enabled
  router.post('/repair-addons', async (req, res) => {
    try {
      const whereScope = AUTH_ENABLED && req.appAccountId ? { accountId: req.appAccountId } : {}
      const addons = await prisma.addon.findMany({ where: whereScope })
      const { repairAddonsList } = require('../utils/repair')
      const result = await repairAddonsList({
        prisma,
        AUTH_ENABLED,
        getAccountDek,
        getDecryptedManifestUrl,
        filterManifestByResources: require('../utils/stremio').filterManifestByResources,
        filterManifestByCatalogs: require('../utils/stremio').filterManifestByCatalogs,
        manifestHash: require('../utils/stremio').manifestHash,
        encrypt: require('../utils/encryption').encrypt
      }, req, addons)

      return res.json({ message: 'Repair completed', ...result })
    } catch (e) {
      return res.status(500).json({ message: 'Failed to repair addons', error: e?.message })
    }
  })

  return router;
};
