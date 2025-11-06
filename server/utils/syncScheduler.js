// Sync scheduler functions
const fs = require('fs')
const path = require('path')
const { sendSyncNotification } = require('./notify')

// Persist sync schedule under data/sync so Docker mount ./data captures it
const SYNC_DIR = path.join(process.cwd(), 'data', 'sync')
const SYNC_CFG = path.join(SYNC_DIR, 'schedule.json')

let syncTimer = null
// Priority queue (min-heap) of { accountId|null, nextRunAt:number, intervalMs:number }
let scheduleHeap = []
let isSchedulerRunning = false
// Track last configured global frequency (private mode)
let globalFrequencyStr = '0'

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

function nextMidnight(fromTs = Date.now()) {
  const d = new Date(fromTs)
  d.setHours(24, 0, 0, 0) // next local midnight
  return d.getTime()
}

function ensureSyncDir() {
  try {
    if (!fs.existsSync(SYNC_DIR)) fs.mkdirSync(SYNC_DIR, { recursive: true })
  } catch {}
}

function readSyncFrequencyMinutes() {
  try {
    const raw = fs.readFileSync(SYNC_CFG, 'utf8')
    const cfg = JSON.parse(raw)
    const minutes = Number(cfg?.minutes || 0)
    return Number.isFinite(minutes) ? minutes : 0
  } catch {
    return 0
  }
}

function writeSyncFrequencyMinutes(minutes) {
  ensureSyncDir()
  try {
    fs.writeFileSync(SYNC_CFG, JSON.stringify({ minutes }), 'utf8')
  } catch {}
}

async function performSyncOnce(prisma, getAccountId, scopedWhere, decrypt, reloadGroupAddons, req, AUTH_ENABLED = false) {
  try {
    const QUIET = process.env.QUIET === 'true' || process.env.QUIET === '1'
    if (!QUIET) console.log('🔄 Starting scheduled sync of all groups')

    if (!AUTH_ENABLED) {
      const groups = await prisma.group.findMany({ where: scopedWhere(req, {}), select: { id: true } })
      let syncedCount = 0
      let failedCount = 0
      for (const g of groups) {
        try { await reloadGroupAddons(prisma, getAccountId, g.id, req, decrypt); syncedCount++ } catch { failedCount++ }
      }
      if (!QUIET && syncedCount > 0) console.log(`✅ Scheduled sync completed: ${syncedCount} synced, ${failedCount} failed`)
      return { synced: syncedCount, failed: failedCount }
    }

    // AUTH: do per-account below (kept for backward compat; heap scheduler is primary)
    return { synced: 0, failed: 0 }
  } catch (e) {
    const QUIET = process.env.QUIET === 'true' || process.env.QUIET === '1'
    if (!QUIET) console.warn('Sync failed:', e?.message || e)
    return { synced: 0, failed: 0 }
  }
}

function clearSyncSchedule() {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null }
  scheduleHeap = []
  isSchedulerRunning = false
}

function scheduleSyncs(frequency, prisma, getAccountId, scopedWhere, decrypt, reloadGroupAddons, req, AUTH_ENABLED = false) {
  clearSyncSchedule()
  if (!frequency || String(frequency) === '0') return

  const now = Date.now()
  scheduleHeap = []
  globalFrequencyStr = String(frequency)

  const pushHeap = (node) => {
    scheduleHeap.push(node)
    let i = scheduleHeap.length - 1
    while (i > 0) {
      const p = Math.floor((i - 1) / 2)
      if (scheduleHeap[p].nextRunAt <= scheduleHeap[i].nextRunAt) break
      const t = scheduleHeap[p]; scheduleHeap[p] = scheduleHeap[i]; scheduleHeap[i] = t; i = p
    }
  }

  const popHeap = () => {
    if (scheduleHeap.length === 0) return null
    const top = scheduleHeap[0]
    const last = scheduleHeap.pop()
    if (scheduleHeap.length > 0) {
      scheduleHeap[0] = last
      let i = 0
      while (true) {
        const l = 2 * i + 1; const r = 2 * i + 2; let s = i
        if (l < scheduleHeap.length && scheduleHeap[l].nextRunAt < scheduleHeap[s].nextRunAt) s = l
        if (r < scheduleHeap.length && scheduleHeap[r].nextRunAt < scheduleHeap[s].nextRunAt) s = r
        if (s === i) break
        const t = scheduleHeap[i]; scheduleHeap[i] = scheduleHeap[s]; scheduleHeap[s] = t; i = s
      }
    }
    return top
  }

  const seedHeap = async () => {
    if (AUTH_ENABLED) {
      try {
        const accounts = await prisma.appAccount.findMany({ select: { id: true, sync: true } })
        for (const acc of accounts) {
          let syncCfg = acc.sync || null
          if (syncCfg && typeof syncCfg === 'string') { try { syncCfg = JSON.parse(syncCfg) } catch { syncCfg = null } }
          let enabled = false; let freqDays = null; let lastRunAt = null; let minuteMode = false
          if (syncCfg && typeof syncCfg === 'object') {
            enabled = syncCfg.enabled !== false
            const fRaw = String(syncCfg.frequency || '').trim()
            if (fRaw.endsWith('m')) { minuteMode = true }
            else if (fRaw.endsWith('d')) { const n = parseInt(fRaw, 10); if (n > 0) freqDays = n }
            if (syncCfg.lastRunAt) { const d = new Date(syncCfg.lastRunAt).getTime(); if (!Number.isNaN(d)) lastRunAt = d }
          }
          if (!enabled || (!minuteMode && !(Number(freqDays) > 0))) continue
          let firstRunAt
          let intervalMs
          if (minuteMode) {
            intervalMs = MINUTE_MS
            firstRunAt = (lastRunAt && lastRunAt > now) ? lastRunAt : (now + intervalMs)
          } else {
            intervalMs = Number(freqDays) * DAY_MS
            // First run at next midnight from now (ignore lastRunAt for first schedule)
            firstRunAt = nextMidnight(now)
          }
          pushHeap({ accountId: acc.id, nextRunAt: firstRunAt, intervalMs })
        }
      } catch {}
    } else {
      // Private mode: parse frequency string (e.g., '1m', '1d', '3d', '7d')
      let intervalMs
      let firstRunAt
      const fRaw = String(globalFrequencyStr).trim()
      if (fRaw.endsWith('m')) {
        intervalMs = MINUTE_MS
        firstRunAt = now + intervalMs
      } else if (fRaw.endsWith('d')) {
        const days = Math.max(1, parseInt(fRaw, 10) || 1)
        intervalMs = days * DAY_MS
        firstRunAt = nextMidnight(now)
      } else {
        // Fallback: treat as minutes number
        intervalMs = Number(globalFrequencyStr) * MINUTE_MS
        firstRunAt = now + intervalMs
      }
      pushHeap({ accountId: null, nextRunAt: firstRunAt, intervalMs })
    }
  }

  const runOnceAccount = async (accountIdOrNull) => {
    const QUIET = process.env.QUIET === 'true' || process.env.QUIET === '1'
    try {
      if (accountIdOrNull) {
        const accountReq = { appAccountId: accountIdOrNull, headers: {}, body: {} }
        let syncCfg = null
        try { const acc = await prisma.appAccount.findUnique({ where: { id: accountIdOrNull }, select: { sync: true } }); syncCfg = acc?.sync || null; if (typeof syncCfg === 'string') syncCfg = JSON.parse(syncCfg) } catch {}
        const mode = (syncCfg && syncCfg.mode === 'advanced') ? 'advanced' : 'normal'
        const unsafe = (syncCfg && typeof syncCfg.safe === 'boolean') ? !syncCfg.safe : !!(syncCfg && syncCfg.unsafe)
        accountReq.headers = { 'x-sync-mode': mode }
        accountReq.body = { unsafe }

        const groups = await prisma.group.findMany({ where: scopedWhere(accountReq, {}), select: { id: true, name: true, userIds: true } })
        try {
          let msg = '🗓️ Scheduled '
          if (mode === 'advanced') msg += 'advanced '
          msg += 'sync'
          const freq = String(syncCfg?.frequency || '').trim()
          if (freq) msg += ` (frequency: ${freq})`
          if (!QUIET) console.log(msg)
        } catch {}
        // Import syncGroupUsers - it's exported from groups router
        const { syncGroupUsers } = require('../routes/groups')
        let totalSynced = 0
        let totalFailed = 0
        const syncedGroupIds = []
        const allReloadDiffs = []
        
        for (const g of groups) {
          try {
            const result = await syncGroupUsers(prisma, getAccountId, scopedWhere, decrypt, g.id, accountReq)
            if (result && !result.error) {
              totalSynced += result.syncedUsers || 0
              totalFailed += result.failedUsers || 0
              syncedGroupIds.push(g.id)
              // Collect reload diffs if available
              if (Array.isArray(result.reloadDiffs) && result.reloadDiffs.length > 0) {
                if (!QUIET) console.log(`📊 Collected ${result.reloadDiffs.length} reload diff(s) from group ${g.id}`)
                allReloadDiffs.push(...result.reloadDiffs)
              } else if (mode === 'advanced' && (!result.reloadDiffs || result.reloadDiffs.length === 0)) {
                if (!QUIET) console.log(`⚠️ No reload diffs found for group ${g.id} (advanced mode enabled)`)
              }
            } else {
              totalFailed++
            }
          } catch (e) {
            totalFailed++
            if (!QUIET) console.warn('Group sync failed:', e?.message)
          }
        }
        
        if (!QUIET && mode === 'advanced') {
          console.log(`📊 Total reload diffs collected: ${allReloadDiffs.length}`)
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

        // Update lastRunAt
        try {
          const nowIso = new Date().toISOString()
          if (syncCfg && typeof syncCfg === 'object') {
            const nextCfg = { ...syncCfg, lastRunAt: nowIso }
            try { await prisma.appAccount.update({ where: { id: accountIdOrNull }, data: { sync: nextCfg } }) } catch { await prisma.appAccount.update({ where: { id: accountIdOrNull }, data: { sync: JSON.stringify(nextCfg) } }) }
          }
        } catch {}

        // Send webhook notification
        const webhookUrl = syncCfg?.webhookUrl
        if (webhookUrl && groups.length > 0) {
          try {
            if (!QUIET && mode === 'advanced') {
              console.log(`📤 Sending webhook notification with ${allReloadDiffs.length} diff(s)`)
            }
            await sendSyncNotification(webhookUrl, {
              groupsCount: groups.length,
              usersCount: totalUsers,
              syncMode: mode,
              diffs: allReloadDiffs,
              sourceLabel: 'Auto-Sync',
              sourceLogo: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png'
            })
          } catch {}
        }
      } else {
        const mode = (req?.headers?.['x-sync-mode'] === 'advanced') ? 'advanced' : 'normal'
        const unsafe = req?.body?.unsafe === true || req?.body?.safe === false
        const groups = await prisma.group.findMany({ where: scopedWhere(req, {}), select: { id: true, name: true } })
        try {
          let msg = '🗓️ Scheduled '
          if (mode === 'advanced') msg += 'advanced '
          msg += 'sync'
          if (unsafe) msg += ' (unsafe mode)'
          const f = String(globalFrequencyStr || '').trim()
          if (f) msg += ` (frequency: ${f})`
          if (!QUIET) console.log(msg)
        } catch {}
        const { syncGroupUsers } = require('../routes/groups')
        for (const g of groups) { await syncGroupUsers(prisma, getAccountId, scopedWhere, decrypt, g.id, req) }
      }
    } catch (e) {
      if (!QUIET) console.warn('Account sync failed:', e?.message)
    }
  }

  const schedulerLoop = async () => {
    if (isSchedulerRunning) return
    isSchedulerRunning = true
    try {
      while (scheduleHeap.length > 0) {
        const next = scheduleHeap[0]
        const delay = Math.max(0, next.nextRunAt - Date.now())
        await new Promise((r) => setTimeout(r, delay))
        const due = popHeap(); if (!due) continue
        await runOnceAccount(due.accountId)
        const jitterMs = Math.floor((Math.random() * 10000) - 5000)
        let nextRun
        if (due.intervalMs >= DAY_MS) {
          nextRun = nextMidnight(Date.now() + due.intervalMs)
        } else {
          nextRun = Date.now() + due.intervalMs + jitterMs
        }
        pushHeap({ accountId: due.accountId, nextRunAt: nextRun, intervalMs: due.intervalMs })
      }
    } finally {
      isSchedulerRunning = false
    }
  }

  seedHeap().then(() => { schedulerLoop() })
}

module.exports = {
  ensureSyncDir,
  readSyncFrequencyMinutes,
  writeSyncFrequencyMinutes,
  performSyncOnce,
  clearSyncSchedule,
  scheduleSyncs
}


