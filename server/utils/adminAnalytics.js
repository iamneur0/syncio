// Phase 2 Admin Analytics - Addon Performance & Server Health
// These functions extend the admin dashboard with operational insights

const fs = require('fs').promises;
const path = require('path');

/**
 * Calculate addon performance analytics
 * Tracks usage, errors, and popularity across the server
 */
async function calculateAddonAnalytics(prisma, accountId) {
  // Get all addons for this account
  const addons = await prisma.addon.findMany({
    where: { accountId },
    include: {
      groupAddons: {
        include: {
          group: true
        }
      }
    }
  })

  // Calculate usage statistics
  const addonStats = addons.map(addon => {
    const enabledGroups = addon.groupAddons.filter(ga => ga.isEnabled)
    const totalGroups = addon.groupAddons.length
    
    // Count unique users across all groups
    const userIds = new Set()
    enabledGroups.forEach(ga => {
      if (ga.group.userIds) {
        try {
          const ids = JSON.parse(ga.group.userIds)
          ids.forEach(id => userIds.add(id))
        } catch (e) {
          // Invalid JSON, skip
        }
      }
    })
    
    return {
      id: addon.id,
      name: addon.name,
      manifestUrl: addon.manifestUrl,
      iconUrl: addon.iconUrl,
      isActive: addon.isActive,
      totalGroups,
      enabledGroups: enabledGroups.length,
      userCount: userIds.size,
      usageRate: totalGroups > 0 ? Math.round((enabledGroups.length / totalGroups) * 100) : 0,
      // Parse resources for display
      resources: addon.resources ? JSON.parse(addon.resources) : [],
      catalogs: addon.catalogs ? JSON.parse(addon.catalogs) : []
    }
  })

  // Sort by user count (popularity)
  const sortedByUsage = addonStats.sort((a, b) => b.userCount - a.userCount)
  
  return {
    totalAddons: addons.length,
    activeAddons: addons.filter(a => a.isActive).length,
    topAddons: sortedByUsage.slice(0, 10),
    underutilized: sortedByUsage.filter(a => a.usageRate < 50 && a.totalGroups > 0),
    byResource: calculateResourceBreakdown(addonStats)
  }
}

/**
 * Calculate resource breakdown (streams, catalogs, metadata, etc.)
 */
function calculateResourceBreakdown(addonStats) {
  const resources = {}
  
  addonStats.forEach(addon => {
    if (addon.resources && Array.isArray(addon.resources)) {
      addon.resources.forEach(resource => {
        resources[resource] = (resources[resource] || 0) + 1
      })
    }
  })
  
  return Object.entries(resources)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }))
}

/**
 * Calculate server health metrics
 * Monitors sync status, storage, and system health
 */
async function calculateServerHealth(prisma, accountId) {
  const health = {
    status: 'healthy', // healthy, warning, critical
    checks: {},
    metrics: {}
  }
  
  // 1. Check sync queue (users needing library sync)
  try {
    const usersNeedingSync = await prisma.user.count({
      where: {
        accountId,
        isActive: true,
        OR: [
          { stremioAuthKey: { not: null } }
        ]
      }
    })
    
    // Estimate based on last activity
    const staleUsers = await prisma.watchSession.groupBy({
      by: ['userId'],
      where: {
        accountId: accountId || 'default',
        startTime: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // Not active in last 24h
        }
      },
      _max: {
        startTime: true
      }
    })
    
    health.checks.syncQueue = {
      status: staleUsers.length > 10 ? 'warning' : 'healthy',
      totalUsers: usersNeedingSync,
      staleUsers: staleUsers.length,
      message: staleUsers.length > 10 
        ? `${staleUsers.length} users need library sync`
        : 'Sync queue is healthy'
    }
    
    if (staleUsers.length > 20) {
      health.status = 'warning'
    }
  } catch (error) {
    health.checks.syncQueue = {
      status: 'unknown',
      message: 'Unable to check sync queue'
    }
  }
  
  // 2. Check storage utilization
  try {
    const dataDir = path.join(process.cwd(), 'data', 'libraries')
    let storageSize = 0
    let fileCount = 0
    
    try {
      const stats = await fs.stat(dataDir)
      if (stats.isDirectory()) {
        const files = await fs.readdir(dataDir, { recursive: true })
        for (const file of files) {
          const filePath = path.join(dataDir, file)
          try {
            const fileStat = await fs.stat(filePath)
            if (fileStat.isFile()) {
              storageSize += fileStat.size
              fileCount++
            }
          } catch (e) {
            // Skip files we can't access
          }
        }
      }
    } catch (e) {
      // Directory might not exist
    }
    
    const sizeInMB = Math.round(storageSize / (1024 * 1024))
    
    health.checks.storage = {
      status: sizeInMB > 500 ? 'warning' : 'healthy',
      sizeMB: sizeInMB,
      fileCount,
      message: sizeInMB > 500 
        ? `Library cache using ${sizeInMB}MB`
        : `Storage healthy (${sizeInMB}MB)`
    }
    
    if (sizeInMB > 1000) {
      health.status = 'warning'
    }
  } catch (error) {
    health.checks.storage = {
      status: 'unknown',
      message: 'Unable to check storage'
    }
  }
  
  // 3. Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`
    health.checks.database = {
      status: 'healthy',
      message: 'Database connection OK'
    }
  } catch (error) {
    health.checks.database = {
      status: 'critical',
      message: 'Database connection failed'
    }
    health.status = 'critical'
  }
  
  // 4. Check user activity metrics
  try {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    
    const activeSessions = await prisma.watchSession.count({
      where: {
        accountId: accountId || 'default',
        isActive: true,
        updatedAt: {
          gte: oneHourAgo
        }
      }
    })
    
    health.metrics.activeSessions = activeSessions
    health.metrics.serverTime = now.toISOString()
    
    health.checks.activity = {
      status: 'healthy',
      activeSessions,
      message: `${activeSessions} active viewing sessions`
    }
  } catch (error) {
    health.checks.activity = {
      status: 'unknown',
      message: 'Unable to check activity'
    }
  }
  
  return health
}

/**
 * Generate operational alerts based on health checks
 */
function generateOperationalAlerts(health, addonAnalytics) {
  const alerts = []
  
  // Critical alerts
  if (health.checks.database?.status === 'critical') {
    alerts.push({
      type: 'database_down',
      severity: 'critical',
      message: 'Database connection failed - immediate attention required'
    })
  }
  
  // Warning alerts
  if (health.checks.syncQueue?.status === 'warning') {
    alerts.push({
      type: 'sync_queue_high',
      severity: 'warning',
      message: health.checks.syncQueue.message,
      count: health.checks.syncQueue.staleUsers
    })
  }
  
  if (health.checks.storage?.status === 'warning') {
    alerts.push({
      type: 'storage_high',
      severity: 'warning',
      message: health.checks.storage.message,
      sizeMB: health.checks.storage.sizeMB
    })
  }
  
  // Addon alerts
  if (addonAnalytics.underutilized.length > 0) {
    alerts.push({
      type: 'underutilized_addons',
      severity: 'info',
      message: `${addonAnalytics.underutilized.length} addons are underutilized (< 50% usage)`,
      count: addonAnalytics.underutilized.length,
      addons: addonAnalytics.underutilized.slice(0, 3).map(a => a.name)
    })
  }
  
  return alerts
}

module.exports = {
  calculateAddonAnalytics,
  calculateServerHealth,
  generateOperationalAlerts
}
