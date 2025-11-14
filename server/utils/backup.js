// Backup system functions
const fs = require('fs');
const path = require('path');

// Persist backups under data/backup so Docker mount ./data captures them
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backup')
const BACKUP_CFG = path.join(BACKUP_DIR, 'schedule.json')
let backupTimer = null

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Calculate next midnight from a given timestamp
 */
function nextMidnight(fromTs = Date.now()) {
  const d = new Date(fromTs)
  d.setHours(24, 0, 0, 0) // next local midnight
  return d.getTime()
}

/**
 * Ensure backup directory exists
 */
function ensureBackupDir() {
  try { 
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true }) 
  } catch {}
}

/**
 * Read backup frequency from config file
 */
function readBackupFrequencyDays() {
  try {
    const raw = fs.readFileSync(BACKUP_CFG, 'utf8')
    const cfg = JSON.parse(raw)
    const days = Number(cfg?.days || 0)
    return Number.isFinite(days) ? days : 0
  } catch {
    return 0
  }
}

/**
 * Write backup frequency to config file
 */
function writeBackupFrequencyDays(days) {
  ensureBackupDir()
  try { 
    fs.writeFileSync(BACKUP_CFG, JSON.stringify({ days }), 'utf8') 
  } catch {}
}

/**
 * Perform a single backup
 */
async function performBackupOnce() {
  ensureBackupDir()
  const ts = new Date()
  const stamp = ts.toISOString().replace(/[:]/g, '-').split('.')[0]
  const filename = path.join(BACKUP_DIR, `config-backup-${stamp}.json`)

  try {
    // call export endpoints on this same server
    const baseUrl = `http://localhost:${process.env.PORT || 4000}`
    let data = null
    try {
      const rsp = await fetch(`${baseUrl}/api/public-auth/config-export`)
      if (rsp.ok) data = await rsp.json()
    } catch {}
    if (!data) {
      try {
        const rsp2 = await fetch(`${baseUrl}/api/public-auth/addon-export`)
        if (rsp2.ok) data = await rsp2.json()
      } catch {}
    }
    if (!data) throw new Error('No export data available')
    fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8')
    const QUIET = process.env.QUIET === 'true' || process.env.QUIET === '1'
    if (!QUIET) console.log(`📦 Backup written: ${filename}`)
  } catch (e) {
    const QUIET = process.env.QUIET === 'true' || process.env.QUIET === '1'
    if (!QUIET) console.warn('Backup failed:', e?.message || e)
  }
}

/**
 * Clear backup schedule
 */
function clearBackupSchedule() {
  if (backupTimer) { 
    clearTimeout(backupTimer); 
    backupTimer = null 
  }
}

/**
 * Schedule backups at specified interval
 * For day-based schedules, runs at midnight
 */
function scheduleBackups(days) {
  clearBackupSchedule()
  if (!days || days <= 0) return
  
  const scheduleNext = () => {
    const now = Date.now()
    
    let nextRun
    if (days === 1) {
      // Every day: next midnight
      nextRun = nextMidnight(now)
    } else {
      // Multi-day (7d, 15d, 30d): schedule at next midnight, then add (days - 1) more days
      // This ensures it runs at midnight every N days
      const nextMidnightTime = nextMidnight(now)
      nextRun = nextMidnightTime + (days - 1) * DAY_MS
    }
    
    const delay = Math.max(0, nextRun - now)
    
    // Schedule the backup
    backupTimer = setTimeout(async () => {
      await performBackupOnce()
      // Schedule the next run
      scheduleNext()
    }, delay)
  }
  
  // Start scheduling
  scheduleNext()
}

module.exports = {
  ensureBackupDir,
  readBackupFrequencyDays,
  writeBackupFrequencyDays,
  performBackupOnce,
  clearBackupSchedule,
  scheduleBackups
}
