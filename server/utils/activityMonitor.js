// Activity monitor - checks for new watch activity and sends Discord notifications
const { StremioAPIClient } = require('stremio-api-client')
const { postDiscord } = require('./notify')
const { setCachedLibrary } = require('./libraryCache')

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const ACTIVITY_WINDOW_MS = 5 * 60 * 1000 // Check items watched in last 5 minutes

let activityTimer = null
// Track notified items: Map<accountId, Set<itemId>>
const notifiedItems = new Map()

function clearActivityMonitor() {
  if (activityTimer) {
    clearInterval(activityTimer)
    activityTimer = null
  }
  notifiedItems.clear()
}

function getWatchDate(item) {
  // Use the earliest of _mtime and lastWatched (if both exist) as watch date
  let candidates = []
  if (item._mtime) {
    const d = new Date(item._mtime)
    if (!isNaN(d.getTime())) candidates.push(d.getTime())
  }
  if (item.state?.lastWatched) {
    const d = new Date(item.state.lastWatched)
    if (!isNaN(d.getTime())) candidates.push(d.getTime())
  }
  if (candidates.length === 0) return null
  return Math.min(...candidates)
}

function isActuallyWatched(item) {
  // Check if the item was actually watched vs just added to library
  // An item is considered watched if:
  // 1. It has timeWatched > 0 or overallTimeWatched > 0
  // 2. OR it has a non-empty video_id (indicates specific content was played)
  const state = item.state || {}
  
  if (state.timeWatched > 0 || state.overallTimeWatched > 0) {
    return true
  }
  
  // For series, video_id indicates which episode was watched (e.g., "tt123:1:1")
  // For movies, video_id might be the movie ID itself
  if (state.video_id && state.video_id.trim() !== '') {
    return true
  }
  
  return false
}

async function checkActivityForAccount(prisma, accountId, decrypt, getAccountId) {
  try {
    // Get account sync config to check for webhook URL
    const account = await prisma.appAccount.findUnique({
      where: { id: accountId },
      select: { sync: true }
    })

    if (!account) return

    let syncCfg = account.sync || null
    if (syncCfg && typeof syncCfg === 'string') {
      try { syncCfg = JSON.parse(syncCfg) } catch { syncCfg = null }
    }

    const webhookUrl = syncCfg?.webhookUrl

    // Get all active users with Stremio connections for this account
    const users = await prisma.user.findMany({
      where: {
        accountId: accountId,
        isActive: true,
        stremioAuthKey: { not: null }
      },
      select: {
        id: true,
        username: true,
        email: true,
        stremioAuthKey: true,
        colorIndex: true
      }
    })

    if (users.length === 0) return

    // Process metrics for all users (regardless of webhook configuration)
    // This runs every 5 minutes to compute accurate watch time deltas
    try {
      const { processAccountMetrics } = require('./metricsProcessor')
      const { getCachedLibrary } = require('./libraryCache')
      const { StremioAPIClient } = require('stremio-api-client')
      
      // Helper function to get library for a user
      // Always fetch fresh from Stremio for metrics processing to ensure we catch new items
      const getLibraryForUser = async (user) => {
        try {
          const mockReq = { appAccountId: accountId }
          const authKeyPlain = decrypt(user.stremioAuthKey, mockReq)
          const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
          
          const libraryItems = await apiClient.request('datastoreGet', {
            collection: 'libraryItem',
            ids: [],
            all: true
          })
          
          const library = Array.isArray(libraryItems) ? libraryItems : (libraryItems?.result || libraryItems?.library || [])
          
          // Update cache with fresh data
          if (Array.isArray(library) && library.length > 0) {
            setCachedLibrary(accountId, user.id, library)
          }
          
          return library || []
        } catch (error) {
          console.warn(`[ActivityMonitor] Failed to fetch library for user ${user.id}:`, error.message)
          // Fallback to cache if API call fails
          const cachedLibrary = getCachedLibrary(accountId, user.id)
          return cachedLibrary || []
        }
      }

      // Process metrics for all users
      console.log(`[ActivityMonitor] Starting metrics processing for account ${accountId}, ${users.length} users`)
      await processAccountMetrics(prisma, accountId, users, getLibraryForUser, new Date())
      console.log(`[ActivityMonitor] Completed metrics processing for account ${accountId}`)
    } catch (metricsError) {
      console.error(`[ActivityMonitor] Error during metrics processing for account ${accountId}:`, metricsError.message)
      console.error(`[ActivityMonitor] Error stack:`, metricsError.stack)
    }

    // Only process Discord notifications if webhook is configured
    if (!webhookUrl) return

    const now = Date.now()
    const cutoffTime = now - ACTIVITY_WINDOW_MS
    const newActivities = []

    // Initialize notified items set for this account if needed
    if (!notifiedItems.has(accountId)) {
      notifiedItems.set(accountId, new Set())
    }
    const accountNotifiedItems = notifiedItems.get(accountId)

    // Check each user's library for new activity
    for (const user of users) {
      try {
        // Create a mock request object for decrypt
        const mockReq = { appAccountId: accountId }
        const authKeyPlain = decrypt(user.stremioAuthKey, mockReq)
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

        const libraryItems = await apiClient.request('datastoreGet', {
          collection: 'libraryItem',
          ids: [],
          all: true
        })

        let library = Array.isArray(libraryItems) ? libraryItems : (libraryItems?.result || libraryItems?.library || [])
        
        // Cache the library data for metrics queries
        if (Array.isArray(library) && library.length > 0) {
          setCachedLibrary(accountId, user.id, library)
        }

        // Check each item for recent activity
        for (const item of library) {
          const watchDate = getWatchDate(item)
          if (!watchDate || watchDate < cutoffTime) continue // Not recent enough
          
          // Skip items that weren't actually watched (e.g., just added to library from share)
          if (!isActuallyWatched(item)) continue

          // Create unique item ID (for movies: just _id, for series: _id:season:episode)
          let itemId = item._id || item.id
          if (item.type === 'series' && item.state?.season !== undefined && item.state?.episode !== undefined) {
            itemId = `${item._id}:${item.state.season}:${item.state.episode}`
          }

          // Check if we've already notified about this item
          const notificationKey = `${user.id}:${itemId}`
          if (accountNotifiedItems.has(notificationKey)) continue

          // Extract season/episode from video_id if available
          // Format: "tt8080122:4:6" = season 4, episode 6
          // Format: "tt8080122:6" = episode 6 only (no season or season 0)
          let season = item.state?.season
          let episode = item.state?.episode
          
          if (item.state?.video_id) {
            const videoId = item.state.video_id
            const videoIdParts = videoId.split(':')

            // Special handling for kitsu ids:
            // - Format: "kitsu:46676:1" -> episode = last segment ("1"), season from Kitsu API title
            if (videoId.startsWith('kitsu:') && videoIdParts.length >= 2) {
              const kitsuId = videoIdParts[1] // e.g., "46676"
              const episodePart = videoIdParts[videoIdParts.length - 1]
              const parsedEpisode = parseInt(episodePart, 10)
              if (!isNaN(parsedEpisode)) {
                episode = parsedEpisode
              }
              // Fetch season from Kitsu API title (e.g., "My Hero Academia Season 3" -> 3)
              const kitsuData = await fetchKitsuMetadata(kitsuId)
              if (kitsuData && kitsuData.season !== null) {
                season = kitsuData.season
              }
            } else {
              // Default handling for normal ids:
              // Format: "tt8080122:4:6" (2 colons = 3 parts)
              if (videoIdParts.length === 3) {
                season = parseInt(videoIdParts[1], 10) || season
                episode = parseInt(videoIdParts[2], 10) || episode
              }
              // Format: "tt8080122:6" (1 colon = 2 parts)
              else if (videoIdParts.length === 2) {
                episode = parseInt(videoIdParts[1], 10) || episode
                // No season specified, keep existing or default to 0
                if (season === undefined) season = 0
              }
            }
          }

          // This is a new activity!
          newActivities.push({
            user: {
              id: user.id,
              username: user.username || user.email,
              email: user.email,
              colorIndex: user.colorIndex || 0
            },
            item: {
              id: itemId,
              _id: item._id || item.id, // Original ID for link generation
              name: item.name,
              type: item.type,
              year: item.year,
              poster: item.poster,
              season: season,
              episode: episode,
              video_id: item.state?.video_id // Keep video_id for reference
            },
            watchDate: watchDate,
            notificationKey: notificationKey
          })

          // Mark as notified
          accountNotifiedItems.add(notificationKey)
        }
      } catch (error) {
        // Skip user if there's an error fetching their library
        continue
      }
    }

    // Send Discord notification if there are new activities
    // Only notify for the latest item per user (to avoid spamming)
    if (newActivities.length > 0) {
      // Group activities by user and keep only the latest one per user
      const latestByUser = new Map()
      for (const activity of newActivities) {
        const userId = activity.user.id
        const existing = latestByUser.get(userId)
        if (!existing || activity.watchDate > existing.watchDate) {
          latestByUser.set(userId, activity)
        }
      }
      
      // Convert map values to array for notification
      const latestActivities = Array.from(latestByUser.values())
      await sendActivityNotification(webhookUrl, latestActivities)
    }
  } catch (error) {
    // Silently fail - don't spam logs
  }
}

function generateDatabaseLink(itemId, itemType) {
  if (!itemId) return null
  
  // Check for IMDB (starts with 'tt')
  if (itemId.startsWith('tt') && /^tt\d+$/.test(itemId)) {
    return `https://www.imdb.com/title/${itemId}`
  }
  
  // Check for TMDB (format: 'tmdb:12345')
  if (itemId.startsWith('tmdb:')) {
    const tmdbId = itemId.replace('tmdb:', '')
    if (itemType === 'series') {
      return `https://www.themoviedb.org/tv/${tmdbId}`
    } else {
      return `https://www.themoviedb.org/movie/${tmdbId}`
    }
  }
  
  // Check for TVDB (format: 'tvdb:12345')
  if (itemId.startsWith('tvdb:')) {
    const tvdbId = itemId.replace('tvdb:', '')
    if (itemType === 'series') {
      return `https://thetvdb.com/series/${tvdbId}`
    } else {
      return `https://thetvdb.com/movies/${tvdbId}`
    }
  }
  
  return null
}

async function fetchKitsuMetadata(kitsuId) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
    
    const response = await fetch(`https://kitsu.app/api/edge/anime/${kitsuId}`, {
      headers: {
        'User-Agent': 'Syncio/1.0'
      },
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (response.ok) {
      const data = await response.json()
      const attributes = data?.data?.attributes
      if (attributes) {
        const titleEn = attributes.titles?.en || ''
        let season = null
        let titleToUse = titleEn
        
        // First try to get season from abbreviatedTitles (e.g., ["Boku no Hero Academia Season 8", "My Hero Academia Season 8"])
        const abbreviatedTitles = attributes.abbreviatedTitles || []
        for (const abbrevTitle of abbreviatedTitles) {
          const seasonMatch = abbrevTitle.match(/Season\s+(\d+)/i)
          if (seasonMatch) {
            season = parseInt(seasonMatch[1], 10)
            titleToUse = abbrevTitle
            break
          }
        }
        
        // Fall back to titles.en if no season found in abbreviatedTitles
        if (season === null) {
          const seasonMatch = titleEn.match(/Season\s+(\d+)/i)
          if (seasonMatch) {
            season = parseInt(seasonMatch[1], 10)
          }
        }
        
        // Extract base title (without "Season X")
        const baseTitle = titleToUse.replace(/\s+Season\s+\d+.*$/i, '').trim()
        return { baseTitle, season, titleEn: titleToUse }
      }
    }
  } catch (error) {
    // Silently fail
  }
  return null
}

async function fetchMetadata(itemId, itemType, videoId) {
  if (!itemId) return null
  
  try {
    // Extract base ID and episode info from video_id if available (format: "tt8080122:season:episode")
    // Otherwise extract from itemId
    let baseId = itemId
    let season = undefined
    let episode = undefined
    
    // Check if video_id is a Kitsu ID (format: "kitsu:50008:4")
    if (videoId && videoId.startsWith('kitsu:')) {
      const videoIdParts = videoId.split(':')
      if (videoIdParts.length >= 2) {
        const kitsuId = videoIdParts[1] // e.g., "50008"
        const episodePart = videoIdParts[videoIdParts.length - 1] // e.g., "4"
        episode = parseInt(episodePart, 10)
        
        console.log(`[ActivityMonitor] Processing Kitsu ID: ${videoId}, kitsuId=${kitsuId}, episode=${episode}`)
        
        // Fetch metadata from Kitsu API
        const kitsuData = await fetchKitsuMetadata(kitsuId)
        if (kitsuData) {
          // Default season to 1 when Kitsu returns null (common for anime without explicit season numbers)
          season = kitsuData.season !== null ? kitsuData.season : 1
          console.log(`[ActivityMonitor] Kitsu metadata: title="${kitsuData.titleEn}", baseTitle="${kitsuData.baseTitle}", season=${season} (original: ${kitsuData.season})`)
          // Now we need to find the IMDb ID for the base title
          // Try to use itemId if it's an IMDb ID, otherwise we'll need to search
          if (itemId && itemId.startsWith('tt') && /^tt\d+$/.test(itemId)) {
            baseId = itemId
            console.log(`[ActivityMonitor] Using IMDb ID from itemId: ${baseId}`)
          } else {
            // If itemId is not an IMDb ID, we'll try to use it anyway
            // The item should have an IMDb ID in its _id field
            baseId = itemId
            console.log(`[ActivityMonitor] Using itemId as baseId: ${baseId}`)
          }
        } else {
          console.log(`[ActivityMonitor] Failed to fetch Kitsu metadata for kitsuId=${kitsuId}`)
        }
      }
    }
    // If video_id is provided and in the format "tt8080122:season:episode", use it
    else if (videoId && videoId.includes(':')) {
      const videoIdParts = videoId.split(':')
      if (videoIdParts.length >= 3 && videoIdParts[0].startsWith('tt') && /^tt\d+$/.test(videoIdParts[0])) {
        baseId = videoIdParts[0]
        season = parseInt(videoIdParts[1], 10)
        episode = parseInt(videoIdParts[2], 10)
      }
    }
    
    // If we don't have season/episode from video_id, try to extract from itemId
    if ((season === undefined || episode === undefined) && itemId.includes(':')) {
      const parts = itemId.split(':')
      // Check if first part is IMDB ID (starts with 'tt')
      if (parts[0].startsWith('tt') && /^tt\d+$/.test(parts[0])) {
        baseId = parts[0] // Use IMDB ID
        // If itemId has format "tt8080122:season:episode", extract season/episode
        if (parts.length >= 3) {
          season = parseInt(parts[1], 10)
          episode = parseInt(parts[2], 10)
        }
      } else {
        // For tmdb: or tvdb: formats, use the number part
        // But Cinemeta works best with IMDB IDs, so this might not work
        baseId = parts[1] || parts[0]
      }
    }
    
    // Only try Cinemeta if we have an IMDB ID (starts with 'tt')
    if (!baseId.startsWith('tt') || !/^tt\d+$/.test(baseId)) {
      return null // Cinemeta primarily works with IMDB IDs
    }
    
    // Try fetching from Cinemeta Live (works best with IMDB IDs)
    // For movies: https://cinemeta-live.strem.io/meta/movie/{id}.json
    // For series: https://cinemeta-live.strem.io/meta/series/{id}.json
    const endpoint = itemType === 'movie' 
      ? `https://cinemeta-live.strem.io/meta/movie/${baseId}.json`
      : `https://cinemeta-live.strem.io/meta/series/${baseId}.json`
    
    // Use AbortController for timeout (Node.js fetch doesn't support timeout directly)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
    
    try {
      const response = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Syncio/1.0'
        },
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const data = await response.json()
        const meta = data?.meta
        if (meta) {
          const result = {
            description: meta.description || null,
            cast: meta.credits_cast || meta.cast || [],
            imdb_id: meta.imdb_id || null,
            moviedb_id: meta.moviedb_id || null,
            genres: meta.genres || [],
            released: meta.released || null
          }
          
          // For series, find the specific episode by video_id, season, and episode number
          if (itemType === 'series' && meta.videos && Array.isArray(meta.videos)) {
            let episodeData = null
            
            // Ensure season and episode are numbers
            // Default season to 1 if null/undefined (common for anime without explicit season numbers)
            const seasonNum = season !== undefined && season !== null ? Number(season) : 1
            const episodeNum = episode !== undefined && episode !== null ? Number(episode) : undefined
            
            // First try to match by video_id if provided (it already has the format "tt22202452:1:1")
            // Skip this for Kitsu IDs since they don't match Cinemeta's format
            if (videoId && !videoId.startsWith('kitsu:')) {
              episodeData = meta.videos.find(v => v.id === videoId)
              if (episodeData) {
                console.log(`[ActivityMonitor] Found episode by video_id: ${videoId}`)
              }
            }
            
            // If not found, try to match by constructing the episode ID format: "tt8080122:1:1"
            if (!episodeData && seasonNum !== undefined && episodeNum !== undefined && !isNaN(seasonNum) && !isNaN(episodeNum) && baseId) {
              const constructedId = `${baseId}:${seasonNum}:${episodeNum}`
              episodeData = meta.videos.find(v => v.id === constructedId)
              if (episodeData) {
                console.log(`[ActivityMonitor] Found episode by constructed ID: ${constructedId}`)
              }
            }
            
            // If still not found, try to match by season and episode number directly
            // Cinemeta uses 1-indexed seasons/episodes with both 'episode' and 'number' fields
            if (!episodeData && seasonNum !== undefined && episodeNum !== undefined && !isNaN(seasonNum) && !isNaN(episodeNum)) {
              episodeData = meta.videos.find(v => {
                // Match by season and episode (exact numeric match)
                if (v.season === seasonNum && v.episode === episodeNum) return true
                // Match by season and number (some entries use 'number' instead of 'episode')
                if (v.season === seasonNum && v.number === episodeNum) return true
                return false
              })
              if (episodeData) {
                console.log(`[ActivityMonitor] Found episode by season/episode: S${seasonNum}E${episodeNum}`)
              }
            }
            
            if (episodeData) {
              // Debug: Log what we found
              console.log(`[ActivityMonitor] Episode found: id=${episodeData.id}, title="${episodeData.title}", hasTitle=${!!episodeData.title}, keys=${Object.keys(episodeData).join(',')}`)
              
              result.episode = {
                title: episodeData.title || episodeData.name || null,
                released: episodeData.released || null,
                overview: episodeData.overview || episodeData.description || null,
                thumbnail: episodeData.thumbnail || null
              }
              
              // Debug: Log what we're setting
              console.log(`[ActivityMonitor] Setting episode title to: "${result.episode.title}"`)
            } else {
              console.log(`[ActivityMonitor] Episode NOT found: Looking for video_id=${videoId || 'none'}, season=${season}, episode=${episode}, baseId=${baseId}`)
              if (meta.videos && meta.videos.length > 0) {
                console.log(`[ActivityMonitor] Available video IDs (first 5): ${meta.videos.slice(0, 5).map(v => v.id).join(', ')}`)
              }
            }
          }
          
          return result
        }
      }
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        // Timeout - silently fail
      } else {
        throw fetchError
      }
    }
  } catch (error) {
    // Silently fail - metadata is optional
  }
  
  return null
}

// Import shared avatar utility
const { getUserAvatarUrl } = require('./avatarUtils')

async function sendActivityNotification(webhookUrl, activities) {
  try {
    // Send one embed per activity (one notification per item)
    for (const activity of activities) {
      const user = activity.user
      const item = activity.item
      const watchDate = new Date(activity.watchDate)
      
      // Build title with show/movie name and SXXEXX for shows
      let itemTitle = item.name || 'Unknown'
      if (item.year) {
        const yearStr = String(item.year).replace(/–\s*$/, '').replace(/-\s*$/, '')
        itemTitle += ` (${yearStr})`
      }
      
      if (item.type === 'series' && item.season !== undefined && item.episode !== undefined) {
        itemTitle += ` (S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')})`
      }
      
      // Fetch metadata from Cinemeta API (description, cast, episode info)
      // Use video_id if available (it already contains season:episode), otherwise use _id with season/episode
      const metadata = await fetchMetadata(item._id, item.type, item.video_id)
      
      const fields = []
      
      // Field 1: Overview - use episode overview for series, show description for movies
      let overviewText = null
      if (item.type === 'series' && metadata?.episode?.overview) {
        overviewText = metadata.episode.overview
      } else if (metadata?.description) {
        overviewText = metadata.description
      }
      
      if (overviewText) {
        fields.push({
          name: 'Overview',
          value: overviewText.length > 1024 ? overviewText.substring(0, 1021) + '...' : overviewText,
          inline: false
        })
      }
      
      // Field 2: Title (episode title for series) - inline
      if (item.type === 'series' && metadata?.episode?.title) {
        fields.push({
          name: 'Title',
          value: metadata.episode.title,
          inline: true
        })
      }
      
      // Field 3: Played (timestamp) - inline (same row as Title)
      fields.push({
        name: 'Played',
        value: `<t:${Math.floor(watchDate.getTime() / 1000)}:R>`,
        inline: true
      })
      
      // Field 4: Genres - inline
      if (metadata?.genres && Array.isArray(metadata.genres) && metadata.genres.length > 0) {
        fields.push({
          name: 'Genres',
          value: metadata.genres.join(' ∙ '),
          inline: true
        })
      }
      
      // Field 5: Links (combined TMDb and IMDb) - inline
      const links = []
      if (metadata?.moviedb_id) {
        const tmdbUrl = item.type === 'movie' 
          ? `https://www.themoviedb.org/movie/${metadata.moviedb_id}`
          : `https://www.themoviedb.org/tv/${metadata.moviedb_id}`
        links.push(`[TMDb](${tmdbUrl})`)
      }
      if (metadata?.imdb_id) {
        const imdbUrl = `https://www.imdb.com/title/${metadata.imdb_id}`
        links.push(`[IMDb](${imdbUrl})`)
      }
      
      if (links.length > 0) {
        fields.push({
          name: 'Links',
          value: links.join(' ∙ '),
          inline: true
        })
      }
      
      // Field 6: Released date - inline
      // For series, use episode release date; for movies, use show/movie release date
      let releasedDate = null
      if (item.type === 'series' && metadata?.episode?.released) {
        releasedDate = new Date(metadata.episode.released)
      } else if (metadata?.released) {
        releasedDate = new Date(metadata.released)
      }
      
      if (releasedDate && !isNaN(releasedDate.getTime())) {
        fields.push({
          name: 'Released',
          value: `<t:${Math.floor(releasedDate.getTime() / 1000)}:D>`,
          inline: true
        })
      }

      // Generate user avatar URL (tries Gravatar first, falls back to colored initial)
      const avatarUrl = await getUserAvatarUrl(user.username, user.email, user.colorIndex)

      const embed = {
        title: itemTitle, // Just the show/movie name with SXXEXX for shows
        author: {
          name: `${user.username} played`,
          icon_url: avatarUrl || undefined
        },
        description: '', // Empty description, using Overview field instead
        color: 0x00ff00, // Green
        fields: fields,
        timestamp: new Date().toISOString()
      }
      
      // Add thumbnail (use poster, not episode thumbnail)
      if (item.poster) {
        embed.thumbnail = {
          url: item.poster
        }
      }

      // Add footer with Syncio version
      let appVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || ''
      if (!appVersion) {
        try { appVersion = require('../../package.json')?.version || '' } catch {}
      }
      if (appVersion) {
        embed.footer = { text: `Syncio v${appVersion}` }
      }

      await postDiscord(webhookUrl, null, {
        embeds: [embed],
        avatar_url: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png'
      })
    }


    // After refreshing libraries, precompute metrics for common periods
    // This ensures both /users/metrics and /ext/metrics.json are immediately available
    try {
      const { setCachedMetrics } = require('./metricsCache')
      const { buildMetricsForAccount } = require('./metricsBuilder')
      const periods = ['1h', '12h', '1d', '3d', '7d', '30d', '90d', '1y', 'all']
      
      for (const period of periods) {
        try {
          const metrics = await buildMetricsForAccount({
            prisma,
            accountId,
            period,
            decrypt
          })
          setCachedMetrics(accountId, period, metrics)
        } catch (metricsError) {
          console.warn(`[ActivityMonitor] Failed to precompute metrics for account ${accountId}, period ${period}:`, metricsError.message)
        }
      }
    } catch (metricsError) {
      console.warn(`[ActivityMonitor] Error during metrics precomputation for account ${accountId}:`, metricsError.message)
    }
  } catch (error) {
    // Silently fail
  }
}

async function checkAllAccounts(prisma, decrypt, getAccountId, AUTH_ENABLED) {
  try {
    if (AUTH_ENABLED) {
      // Check all accounts
      const accounts = await prisma.appAccount.findMany({
        select: { id: true }
      })
      for (const account of accounts) {
        await checkActivityForAccount(prisma, account.id, decrypt, getAccountId)
      }
    } else {
      // Private mode: check default account
      const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID || 'default'
      await checkActivityForAccount(prisma, DEFAULT_ACCOUNT_ID, decrypt, getAccountId)
    }
  } catch (error) {
    // Silently fail
  }
}

function scheduleActivityMonitor(prisma, decrypt, getAccountId, AUTH_ENABLED) {
  clearActivityMonitor()
  
  // Run immediately on startup to update library database
  checkAllAccounts(prisma, decrypt, getAccountId, AUTH_ENABLED)
  
  // Then run every 5 minutes
  activityTimer = setInterval(() => {
    checkAllAccounts(prisma, decrypt, getAccountId, AUTH_ENABLED)
  }, CHECK_INTERVAL_MS)
}

// Send share notification to a user's Discord webhook
async function sendShareNotification(webhookUrl, sharerUsername, sharerEmail, sharerColorIndex, item) {
  try {
    // Build title with show/movie name
    let itemTitle = item.itemName || 'Unknown'
    
    // Extract base ID for metadata lookup
    const itemId = item.itemId || ''
    const baseId = itemId.split(':')[0]
    
    // Fetch metadata from Cinemeta API
    const metadata = await fetchMetadata(baseId, item.itemType, null)
    
    const fields = []
    
    // Field 1: Overview/Description
    if (metadata?.description) {
      fields.push({
        name: 'Overview',
        value: metadata.description.length > 1024 ? metadata.description.substring(0, 1021) + '...' : metadata.description,
        inline: false
      })
    }
    
    // Field 2: Shared timestamp - inline
    fields.push({
      name: 'Shared',
      value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
      inline: true
    })
    
    // Field 3: Genres - inline
    if (metadata?.genres && Array.isArray(metadata.genres) && metadata.genres.length > 0) {
      fields.push({
        name: 'Genres',
        value: metadata.genres.join(' ∙ '),
        inline: true
      })
    }
    
    // Field 4: Links (combined TMDb and IMDb) - inline
    const links = []
    if (metadata?.moviedb_id) {
      const tmdbUrl = item.itemType === 'movie' 
        ? `https://www.themoviedb.org/movie/${metadata.moviedb_id}`
        : `https://www.themoviedb.org/tv/${metadata.moviedb_id}`
      links.push(`[TMDb](${tmdbUrl})`)
    }
    if (metadata?.imdb_id) {
      const imdbUrl = `https://www.imdb.com/title/${metadata.imdb_id}`
      links.push(`[IMDb](${imdbUrl})`)
    }
    
    if (links.length > 0) {
      fields.push({
        name: 'Links',
        value: links.join(' ∙ '),
        inline: true
      })
    }
    
    // Field 5: Released date - inline
    if (metadata?.released) {
      const releasedDate = new Date(metadata.released)
      if (!isNaN(releasedDate.getTime())) {
        fields.push({
          name: 'Released',
          value: `<t:${Math.floor(releasedDate.getTime() / 1000)}:D>`,
          inline: true
        })
      }
    }

    // Generate sharer's avatar URL
    const avatarUrl = await getUserAvatarUrl(sharerUsername, sharerEmail, sharerColorIndex)

    const embed = {
      title: itemTitle,
      author: {
        name: `${sharerUsername} shared`,
        icon_url: avatarUrl || undefined
      },
      description: '',
      color: 0x5865F2, // Discord Blurple for shares (different from green for plays)
      fields: fields,
      timestamp: new Date().toISOString()
    }
    
    // Add thumbnail (poster)
    if (item.poster) {
      embed.thumbnail = {
        url: item.poster
      }
    }

    // Add footer with Syncio version
    let appVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || ''
    if (!appVersion) {
      try { appVersion = require('../../package.json')?.version || '' } catch {}
    }
    if (appVersion) {
      embed.footer = { text: `Syncio v${appVersion}` }
    }

    await postDiscord(webhookUrl, null, {
      embeds: [embed],
      avatar_url: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png'
    })
    
    return true
  } catch (error) {
    console.error('[ShareNotification] Failed to send:', error.message)
    return false
  }
}

module.exports = {
  scheduleActivityMonitor,
  clearActivityMonitor,
  sendShareNotification
}






