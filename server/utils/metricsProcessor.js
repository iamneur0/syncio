/**
 * Metrics Processor - Computes and stores watch snapshots and deltas
 *
 * This module processes library items to:
 * 1. Store daily snapshots (only when values change)
 * 2. Compute deltas (watch time changes) for accurate daily/weekly stats
 * 3. Store watch activity events
 * 4. Track episode-level watch history for series
 */

/**
 * Extract season/episode from video_id
 * Handles various formats:
 * - "tt8080122:4:6" -> season 4, episode 6
 * - "kitsu:46676:1" -> season 1 (default), episode 1
 * - "tt8080122:6" -> episode 6 (no season)
 */
function extractSeasonEpisode(videoId) {
  if (!videoId) return { season: null, episode: null }

  const parts = videoId.split(':')

  // Kitsu format: "kitsu:46676:1"
  if (videoId.startsWith('kitsu:') && parts.length >= 3) {
    const episodePart = parts[parts.length - 1]
    const parsedEpisode = parseInt(episodePart, 10)
    return {
      season: 1, // Default to season 1 for anime
      episode: !isNaN(parsedEpisode) ? parsedEpisode : null
    }
  }

  // IMDb format: "tt8080122:4:6" (season:episode)
  if (parts.length >= 3 && parts[0].startsWith('tt')) {
    return {
      season: parseInt(parts[1], 10) || null,
      episode: parseInt(parts[2], 10) || null
    }
  }

  // IMDb format: "tt8080122:6" (episode only)
  if (parts.length === 2 && parts[0].startsWith('tt')) {
    return {
      season: null,
      episode: parseInt(parts[1], 10) || null
    }
  }

  return { season: null, episode: null }
}

/**
 * Record episode watch in history (for series items)
 */
async function recordEpisodeWatch(prisma, accountId, userId, item) {
  try {
    // Only process series items with video_id
    if (item.type !== 'series' || !item.state?.video_id) return

    const videoId = item.state.video_id
    const showId = item._id || item.id
    const showName = item.name || 'Unknown Show'
    const poster = item.poster || null
    const { season, episode } = extractSeasonEpisode(videoId)

    // Get watch date from item
    // IMPORTANT: Only use state.lastWatched - this is the actual watch timestamp
    // Do NOT use _mtime - that's just when the library item was modified (e.g., added to library)
    let watchedAt = new Date()
    if (item.state?.lastWatched) {
      const d = new Date(item.state.lastWatched)
      if (!isNaN(d.getTime())) watchedAt = d
    }

    // Upsert the episode watch (updates watchedAt if already exists)
    await prisma.episodeWatchHistory.upsert({
      where: {
        accountId_userId_videoId: {
          accountId: accountId || 'default',
          userId,
          videoId
        }
      },
      create: {
        accountId: accountId || 'default',
        userId,
        showId,
        showName,
        videoId,
        season,
        episode,
        poster,
        watchedAt
      },
      update: {
        watchedAt, // Update watch time if re-watching
        showName, // Update in case show name changed
        poster // Update in case poster changed
      }
    })

    return true
  } catch (error) {
    // Silently fail - episode history is optional
    if (error.code !== 'P2002') { // Ignore unique constraint errors
      console.warn(`[MetricsProcessor] Error recording episode watch:`, error.message)
    }
    return false
  }
}

/**
 * Get the most recent snapshot for an item on or before today.
 * This lets us compute deltas within the same day as well as across days.
 */
async function getPreviousSnapshot(prisma, accountId, userId, itemId, today) {
  const todayDate = today.toISOString().split('T')[0]

  try {
    const snapshot = await prisma.watchSnapshot.findFirst({
      where: {
        accountId: accountId || 'default',
        userId,
        itemId,
        date: {
          lte: new Date(todayDate)
        }
      },
      orderBy: {
        date: 'desc'
      }
    })
    return snapshot
  } catch (error) {
    console.warn(
      `[MetricsProcessor] Error fetching previous snapshot for ${userId}/${itemId}:`,
      error.message
    )
    return null
  }
}

/**
 * Check if snapshot values have changed
 */
function hasChanged(previous, current) {
  if (!previous) return true // First time seeing this item

  const prevOverall = previous.overallTimeWatched ? BigInt(previous.overallTimeWatched) : 0n
  const currOverall = current.overallTimeWatched ? BigInt(current.overallTimeWatched) : 0n

  const prevOffset = previous.timeOffset ? BigInt(previous.timeOffset) : 0n
  const currOffset = current.timeOffset ? BigInt(current.timeOffset) : 0n

  // Changed if overallTimeWatched or timeOffset changed
  return prevOverall !== currOverall || prevOffset !== currOffset
}

/**
 * Process a single library item and store snapshot/delta
 */
async function processLibraryItem(prisma, accountId, userId, item, today) {
  try {
    const itemId = item._id || item.id
    if (!itemId || !item.type) return { snapshotCreated: false, activityCreated: false }

    const todayDate = today.toISOString().split('T')[0]
    const accountIdValue = accountId || 'default'

    // Get previous snapshot (for baseline comparison)
    const previous = await getPreviousSnapshot(prisma, accountIdValue, userId, itemId, today)

    // Current state
    const current = {
      overallTimeWatched: item.state?.overallTimeWatched ? String(item.state.overallTimeWatched) : null,
      timeOffset: item.state?.timeOffset ? String(item.state.timeOffset) : null,
      lastWatched: item.state?.lastWatched ? new Date(item.state.lastWatched) : null,
      mtime: item._mtime ? new Date(item._mtime) : null
    }

    // Always fetch the latest snapshot for today (if it exists)
    let latestSnapshot = await prisma.watchSnapshot.findFirst({
      where: {
        accountId: accountIdValue,
        userId,
        itemId,
        date: new Date(todayDate)
      }
    })

    // If no snapshot for today exists, use previous (from yesterday or earlier)
    if (!latestSnapshot) {
      latestSnapshot = previous
    }

    // Store the old snapshot value for delta calculation
    const oldSnapshotValue = latestSnapshot?.overallTimeWatched || null

    let snapshotCreated = false
    let activityCreated = false

    // Check if current library value differs from latest snapshot
    const snapshotChanged = !latestSnapshot || 
      !latestSnapshot.overallTimeWatched || 
      BigInt(latestSnapshot.overallTimeWatched) !== BigInt(current.overallTimeWatched || '0')

    // CRITICAL: Calculate delta and create activity BEFORE updating snapshot
    // This ensures the snapshot always represents the baseline we've already accounted for
    if (current.overallTimeWatched && snapshotChanged) {
      let totalDeltaSeconds = 0
      
      if (oldSnapshotValue) {
        // Existing item: calculate delta from previous snapshot
        const snapshotOverall = BigInt(oldSnapshotValue)
        const currOverall = BigInt(current.overallTimeWatched)
        const totalDeltaMs = currOverall - snapshotOverall
        
        // Only create activity if delta is significant (> 60 seconds) and positive
        if (totalDeltaMs > 0) {
          totalDeltaSeconds = Number(totalDeltaMs / 1000n)
        }
      } else {
        // First-time watch: use current watch time as delta
        const currOverall = BigInt(current.overallTimeWatched)
        totalDeltaSeconds = Number(currOverall / 1000n)
      }
      
      // Get the most recent activity for this item to see when we last recorded
      // We only want to subtract activities that were recorded AFTER the snapshot baseline was set
      const mostRecentActivity = await prisma.watchActivity.findFirst({
        where: {
          accountId: accountIdValue,
          userId,
          itemId,
          date: new Date(todayDate)
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
      
      // If we have a recent activity, check if it was created very recently (within last 30 seconds)
      // This prevents double-counting if we just created an activity in a previous processing cycle
      let shouldSubtractRecent = false
      let recentRecordedSeconds = 0
      
      if (mostRecentActivity) {
        const secondsSinceLastActivity = (new Date() - mostRecentActivity.createdAt) / 1000
        // Only subtract if activity was created in the last 30 seconds (very recent, might be duplicate)
        if (secondsSinceLastActivity < 30) {
          shouldSubtractRecent = true
          recentRecordedSeconds = mostRecentActivity.watchTimeSeconds
        }
      }
      
      // Calculate remaining delta: total delta minus what we've very recently recorded (if any)
      const remainingDeltaSeconds = totalDeltaSeconds - recentRecordedSeconds
      
      // Create activity for the remaining delta (if >= 60 seconds)
      // Note: We create activity for the FULL delta, not just remaining, because:
      // 1. The snapshot represents the baseline we've accounted for
      // 2. When snapshot updates, it means library increased, so we should record that increase
      // 3. The only exception is if we JUST created an activity (within 30 seconds), then we skip to avoid duplicates
      if (remainingDeltaSeconds >= 60 && !shouldSubtractRecent) {
        try {
          await prisma.watchActivity.create({
            data: {
              accountId: accountIdValue,
              userId,
              itemId,
              date: new Date(todayDate),
              watchTimeSeconds: totalDeltaSeconds, // Record the full delta
              itemType: item.type
            }
          })
          activityCreated = true
        } catch (error) {
          // Ignore duplicate key errors (idempotent)
          if (!error.message.includes('Unique constraint')) {
            console.warn(`[MetricsProcessor] Error storing watch activity for ${userId}/${itemId}:`, error.message)
          }
        }
      } else if (shouldSubtractRecent) {
        // Log when we skip creating activity due to very recent activity
        console.log(`[MetricsProcessor] Skipping activity creation for ${userId}/${itemId}: recent activity created ${Math.floor((new Date() - mostRecentActivity.createdAt) / 1000)}s ago`)
      }
    }

    // NOW update snapshot to match current library value
    // This ensures snapshot always represents the baseline we've accounted for
    if (snapshotChanged && current.overallTimeWatched) {
      try {
        await prisma.watchSnapshot.upsert({
          where: {
            accountId_userId_itemId_date: {
              accountId: accountIdValue,
              userId,
              itemId,
              date: new Date(todayDate)
            }
          },
          create: {
            accountId: accountIdValue,
            userId,
            itemId,
            date: new Date(todayDate),
            overallTimeWatched: current.overallTimeWatched,
            timeOffset: current.timeOffset,
            lastWatched: current.lastWatched,
            mtime: current.mtime
          },
          update: {
            overallTimeWatched: current.overallTimeWatched,
            timeOffset: current.timeOffset,
            lastWatched: current.lastWatched,
            mtime: current.mtime
          }
        })
        snapshotCreated = true
        // Debug: Log snapshot updates for items with significant changes
        if (latestSnapshot && latestSnapshot.overallTimeWatched) {
          const deltaMs = BigInt(current.overallTimeWatched) - BigInt(latestSnapshot.overallTimeWatched)
          const deltaSeconds = Number(deltaMs / 1000n)
          if (deltaSeconds >= 60) {
            console.log(`[MetricsProcessor] Updated snapshot for ${userId}/${itemId}: ${latestSnapshot.overallTimeWatched} -> ${current.overallTimeWatched} (delta: ${deltaSeconds}s, activity created: ${activityCreated})`)
          }
        }
      } catch (error) {
        console.warn(`[MetricsProcessor] Error storing snapshot for ${userId}/${itemId}:`, error.message)
        console.warn(`[MetricsProcessor] Error stack:`, error.stack)
      }
    }

    // Record episode watch history for series items
    // This runs regardless of whether snapshot changed, to capture all watched episodes
    if (item.type === 'series' && item.state?.video_id) {
      await recordEpisodeWatch(prisma, accountIdValue, userId, item)
    }

    return { snapshotCreated, activityCreated }
  } catch (error) {
    console.warn(`[MetricsProcessor] Error processing item ${item._id || item.id} for user ${userId}:`, error.message)
    return { snapshotCreated: false, activityCreated: false }
  }
}

/**
 * Process all library items for a user
 */
async function processUserLibrary(prisma, accountId, userId, library, today = new Date()) {
  if (!library || !Array.isArray(library) || library.length === 0) {
    console.log(`[MetricsProcessor] No library items for user ${userId}`)
    return { snapshotsCreated: 0, activitiesCreated: 0 }
  }

  let processed = 0
  let errors = 0
  let snapshotsCreated = 0
  let activitiesCreated = 0

  for (const item of library) {
    try {
      const result = await processLibraryItem(prisma, accountId, userId, item, today)
      processed++
      if (result?.snapshotCreated) snapshotsCreated++
      if (result?.activityCreated) activitiesCreated++
    } catch (error) {
      errors++
      console.warn(`[MetricsProcessor] Error processing item ${item._id || item.id} for user ${userId}:`, error.message)
    }
  }

  if (processed > 0 || errors > 0) {
    console.log(`[MetricsProcessor] User ${userId}: Processed ${processed} items, ${snapshotsCreated} snapshots, ${activitiesCreated} activities (${errors} errors)`)
  }

  return { snapshotsCreated, activitiesCreated }
}

/**
 * Process metrics for all users in an account
 */
async function processAccountMetrics(prisma, accountId, users, getLibraryForUser, today = new Date()) {
  const accountIdValue = accountId || 'default'
  let totalProcessed = 0
  let totalErrors = 0
  let totalSnapshots = 0
  let totalActivities = 0

  console.log(`[MetricsProcessor] Processing metrics for account ${accountIdValue}, ${users.length} users`)

  for (const user of users) {
    try {
      const library = await getLibraryForUser(user)
      if (library && Array.isArray(library) && library.length > 0) {
        console.log(`[MetricsProcessor] Processing ${library.length} items for user ${user.id}`)
        const result = await processUserLibrary(prisma, accountIdValue, user.id, library, today)
        totalProcessed += library.length
        if (result) {
          totalSnapshots += result.snapshotsCreated || 0
          totalActivities += result.activitiesCreated || 0
        }
      } else {
        console.log(`[MetricsProcessor] No library items for user ${user.id}`)
      }
    } catch (error) {
      totalErrors++
      console.error(`[MetricsProcessor] Error processing user ${user.id}:`, error.message)
      console.error(`[MetricsProcessor] Error stack:`, error.stack)
    }
  }

  console.log(`[MetricsProcessor] Account ${accountIdValue}: Processed ${totalProcessed} items across ${users.length} users, ${totalSnapshots} snapshots, ${totalActivities} activities (${totalErrors} errors)`)
}

module.exports = {
  processLibraryItem,
  processUserLibrary,
  processAccountMetrics,
  getPreviousSnapshot
}

