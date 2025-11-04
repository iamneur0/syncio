const express = require('express');
const fs = require('fs');
const path = require('path');
const { decrypt, encrypt } = require('../utils/encryption')

module.exports = ({ prisma, AUTH_ENABLED, getAccountDek, getDecryptedManifestUrl, getAccountId }) => {
  const router = express.Router();

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
        // Private mode: return global file-based schedule for backward compat
        return res.json({
          enabled: readSyncFrequencyMinutes() > 0,
          frequency: readSyncFrequencyMinutes() === 1 ? '1m' : (readSyncFrequencyMinutes() >= 1440 ? `${Math.round(readSyncFrequencyMinutes()/1440)}d` : `${readSyncFrequencyMinutes()}m`),
          safe: true,
          mode: 'normal'
        })
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
        const resp = { enabled: syncCfg.enabled !== false, safe, mode, frequency, lastRunAt: syncCfg.lastRunAt, webhookUrl: syncCfg.webhookUrl || '' }
        return res.json(resp)
      }
      return res.json({ enabled: false, frequency: 0, safe: true, mode: 'normal' })
    } catch (e) {
      return res.status(500).json({ message: 'Failed to read account sync settings' })
    }
  })

  router.put('/account-sync', async (req, res) => {
    try {
      const { enabled, frequency, mode, unsafe, safe, webhookUrl } = req.body || {}
      if (!AUTH_ENABLED) {
        // Private mode: update global schedule
        const minutes = Number(frequencyMinutes || 0)
        if (!Number.isFinite(minutes) || minutes < 0) return res.status(400).json({ message: 'Invalid minutes' })
        writeSyncFrequencyMinutes(enabled === false ? 0 : minutes)
        const { reloadGroupAddons } = require('../routes/users');
        const scopedWhere = require('../utils/helpers').scopedWhere;
        const decrypt = require('../utils/encryption').decrypt;
        const { DEFAULT_ACCOUNT_ID } = require('../utils/config');
        const schedulerReq = { appAccountId: DEFAULT_ACCOUNT_ID }
        scheduleSyncs(enabled === false ? 0 : minutes, prisma, getAccountId, scopedWhere, decrypt, reloadGroupAddons, schedulerReq, false)
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
