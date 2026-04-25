const https = require('https')
const { getUserAvatarUrl } = require('./avatarUtils')
const { fetchKitsuMetadata } = require('./kitsuUtils')

async function postDiscord(webhookUrl, content, options = {}) {
  try {
    if (!webhookUrl) return
    const url = new URL(webhookUrl)
    
    // If embeds are provided, use embeds format, otherwise use content
    let payload
    if (options.embeds && Array.isArray(options.embeds)) {
      payload = { embeds: options.embeds }
    } else {
      payload = { content }
    }
    
    // Legacy avatar_url support (for backward compatibility)
    if (options.avatar_url) {
      payload.avatar_url = options.avatar_url
    }
    
    const body = JSON.stringify(payload)
    const httpOptions = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }
    await new Promise((resolve, reject) => {
      const req = https.request(httpOptions, (res) => {
        res.on('data', () => {})
        res.on('end', resolve)
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  } catch {}
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

async function sendActivityNotification(webhookUrl, activities, prisma, accountId, decrypt) {
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
        try { appVersion = require('../../package.json')?.version || '' } catch { }
      }
      if (appVersion) {
        embed.footer = { text: `Syncio v${appVersion}` }
      }

      await postDiscord(webhookUrl, null, {
        embeds: [embed],
        avatar_url: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png'
      })
    }
  } catch (error) {
    // Silently fail
  }
}

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
      try { appVersion = require('../../package.json')?.version || '' } catch { } 
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

/**
 * Creates a Discord embed for sync notifications
 * @param {Object} options
 * @param {number} options.groupsCount - Number of groups synced
 * @param {number} options.usersCount - Total number of users across all groups
 * @param {string} options.syncMode - 'normal' or 'advanced'
 * @param {Array} options.diffs - Array of { name, diffs: { addedResources, removedResources, addedCatalogs, removedCatalogs } }
 * @param {string} [options.sourceLabel] - Optional source label (e.g., 'AIOStreams')
 * @param {string} [options.sourceLogo] - Optional source logo URL
 * @returns {Object} Discord embed object
 */
function createSyncEmbed({ groupsCount, usersCount, syncMode, diffs = [], sourceLabel, sourceLogo, accountUuid }) {
  const fields = []
  
  // Format diffs as one code block per addon (Resources / Catalogs)
  if (Array.isArray(diffs) && diffs.length > 0) {
    for (const item of diffs) {
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
        fields.push({ name: addonName, value: '```' + sections.join('\n') + '```', inline: false })
      }
    }
  }

  const embed = {
    title: `Sync Succeeded on ${groupsCount} Groups (${usersCount} Users)`,
    color: 0x808080,
    fields: fields,
    timestamp: new Date().toISOString()
  }

  // Add author block if source/logo provided
  if (sourceLabel && sourceLabel !== 'API') {
    embed.author = {
      name: sourceLabel
    }
    if (sourceLogo) {
      embed.author.icon_url = sourceLogo
    }
  }
  // Add account as a dedicated field (copy-friendly, no spoiler)
  if (accountUuid) {
    // Use code block for easy copy on all clients
    fields.unshift({ name: 'Account', value: '```' + accountUuid + '```', inline: false })
  }

  // Footer: Syncio version (use same source as UI; fall back to package.json)
  let appVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || ''
  if (!appVersion) {
    try { appVersion = require('../../package.json')?.version || '' } catch {}
  }
  if (appVersion) {
    embed.footer = { text: `Syncio v${appVersion}` }
  }

  return embed
}

/**
 * Sends a sync notification to Discord
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Object} options - Same options as createSyncEmbed
 */
async function sendSyncNotification(webhookUrl, options) {
  if (!webhookUrl) return
  
  const embed = createSyncEmbed(options)
  await postDiscord(webhookUrl, null, { 
    embeds: [embed], 
    avatar_url: 'https://raw.githubusercontent.com/iamneur0/syncio/refs/heads/main/client/public/logo-black.png' 
  })
}

module.exports = { 
  postDiscord, 
  createSyncEmbed, 
  sendSyncNotification, 
  fetchMetadata, 
  sendActivityNotification, 
  sendShareNotification 
}