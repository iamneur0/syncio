// User expiration cleanup system
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

// Check if debug mode is enabled
const isDebugMode = process.env.DEBUG === 'true' || process.env.DEBUG === '1' || 
                    process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NEXT_PUBLIC_DEBUG === '1'

let expirationTimer = null
let isRunning = false

/**
 * Calculate next midnight from a given timestamp
 */
function nextMidnight(fromTs = Date.now()) {
  const d = new Date(fromTs)
  d.setHours(24, 0, 0, 0) // next local midnight
  return d.getTime()
}

/**
 * Reset user's Stremio addons (clear all addons)
 */
async function resetUserAddons(user, decrypt, StremioAPIClient) {
  if (!user.stremioAuthKey || !user.isActive) {
    return { success: false, error: 'User not connected to Stremio or inactive' }
  }

  try {
    // Create a mock req object for decrypt function
    const mockReq = { appAccountId: user.accountId || null }
    const authKeyPlain = decrypt(user.stremioAuthKey, mockReq)
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

    // Clear all addons
    const { clearAddons } = require('./addonHelpers')
    await clearAddons(apiClient)
    return { success: true }
  } catch (error) {
    console.error(`⚠️  Error resetting addons for user ${user.id}:`, error?.message || error)
    return { success: false, error: error?.message || 'Failed to reset addons' }
  }
}

/**
 * Delete expired users (where expiresAt is not null and has passed)
 */
async function deleteExpiredUsers(prisma, decrypt, StremioAPIClient) {
  if (isRunning) {
    console.log('⏭️  User expiration cleanup already running, skipping...')
    return
  }

  isRunning = true
  try {
    const now = new Date()
    
    // Find all users with expiresAt set and in the past
    const expiredUsers = await prisma.user.findMany({
      where: {
        expiresAt: {
          not: null,
          lte: now
        }
      },
      select: {
        id: true,
        accountId: true,
        username: true,
        email: true,
        expiresAt: true,
        stremioAuthKey: true,
        isActive: true
      }
    })

    if (expiredUsers.length === 0) {
      console.log('✅ No expired users to delete')
      return
    }

    console.log(`🗑️  Found ${expiredUsers.length} expired user(s) to delete`)

    // Group users by accountId for efficient group cleanup
    const usersByAccount = new Map()
    for (const user of expiredUsers) {
      const accountId = user.accountId || 'default'
      if (!usersByAccount.has(accountId)) {
        usersByAccount.set(accountId, [])
      }
      usersByAccount.get(accountId).push(user)
    }

    // Delete users and clean up groups for each account
    for (const [accountId, users] of usersByAccount.entries()) {
      for (const user of users) {
        try {
          // Reset user's addons before deletion
          if (user.stremioAuthKey && user.isActive && decrypt && StremioAPIClient) {
            const resetResult = await resetUserAddons(user, decrypt, StremioAPIClient)
            if (resetResult.success) {
              console.log(`🔄 Reset addons for expired user: ${user.username} (${user.email})`)
            } else {
              console.warn(`⚠️  Could not reset addons for ${user.username}: ${resetResult.error}`)
            }
          }

          // Remove user from all groups first
          const groups = await prisma.group.findMany({
            where: {
              accountId: accountId === 'default' ? null : accountId,
              userIds: {
                contains: user.id
              }
            }
          })

          for (const group of groups) {
            if (group.userIds) {
              const userIds = JSON.parse(group.userIds)
              const updatedUserIds = userIds.filter(id => id !== user.id)
              if (updatedUserIds.length !== userIds.length) {
                await prisma.group.update({
                  where: { id: group.id },
                  data: { userIds: JSON.stringify(updatedUserIds) }
                })
              }
            }
          }

          // Delete the user
          await prisma.user.delete({
            where: { id: user.id }
          })

          console.log(`✅ Deleted expired user: ${user.username} (${user.email})`)
        } catch (error) {
          console.error(`❌ Error deleting expired user ${user.id}:`, error)
        }
      }
    }

    console.log(`✅ User expiration cleanup completed: ${expiredUsers.length} user(s) deleted`)
  } catch (error) {
    console.error('❌ Error during user expiration cleanup:', error)
  } finally {
    isRunning = false
  }
}

/**
 * Schedule user expiration cleanup to run at midnight (or every minute in debug mode)
 */
function scheduleUserExpiration(prisma, decrypt, StremioAPIClient) {
  if (expirationTimer) {
    clearTimeout(expirationTimer)
    expirationTimer = null
  }

  const runCleanup = async () => {
    await deleteExpiredUsers(prisma, decrypt, StremioAPIClient)
    
    if (isDebugMode) {
      // In debug mode, run every minute
      const nextRun = Date.now() + MINUTE_MS
      expirationTimer = setTimeout(() => {
        runCleanup()
      }, MINUTE_MS)
      console.log(`🐛 [DEBUG MODE] Next user expiration cleanup in 1 minute: ${new Date(nextRun).toISOString()}`)
    } else {
      // In production, schedule next run at midnight
      const nextRun = nextMidnight(Date.now())
      const delay = Math.max(0, nextRun - Date.now())
      
      expirationTimer = setTimeout(() => {
        runCleanup()
      }, delay)
      
      console.log(`⏰ Next user expiration cleanup scheduled for: ${new Date(nextRun).toISOString()}`)
    }
  }

  if (isDebugMode) {
    // In debug mode, run immediately and then every minute
    console.log('🐛 [DEBUG MODE] User expiration cleanup will run every minute')
    runCleanup()
  } else {
    // In production, run immediately on startup, then schedule for midnight
    const now = Date.now()
    const nextMidnightTime = nextMidnight(now)
    const delay = Math.max(0, nextMidnightTime - now)

    // If it's already past midnight today, run immediately, otherwise wait until next midnight
    if (delay < 1000) {
      // Less than 1 second until midnight, run immediately
      runCleanup()
    } else {
      expirationTimer = setTimeout(() => {
        runCleanup()
      }, delay)
      console.log(`⏰ User expiration cleanup scheduled for: ${new Date(nextMidnightTime).toISOString()}`)
    }
  }
}

/**
 * Clear the user expiration schedule
 */
function clearUserExpirationSchedule() {
  if (expirationTimer) {
    clearTimeout(expirationTimer)
    expirationTimer = null
  }
  isRunning = false
}

module.exports = {
  scheduleUserExpiration,
  clearUserExpirationSchedule,
  deleteExpiredUsers
}

