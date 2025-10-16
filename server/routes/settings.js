const express = require('express');
const fs = require('fs');
const path = require('path');
const { decrypt } = require('../utils/encryption')

module.exports = ({ prisma, AUTH_ENABLED, getAccountDek, getDecryptedManifestUrl }) => {
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
