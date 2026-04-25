/**
 * Kitsu Metadata Utilities
 * Shared module for extracting anime season/episode info from Kitsu API
 * 
 * Used by: activityMonitor.js, sessionTracker.js, metricsBuilder.js
 */

/**
 * Extract season number from a title string
 * Handles patterns like "My Hero Academia Season 3" or "One-Punch Man 3"
 */
function extractSeasonFromTitle(title) {
  if (!title) return null
  
  // First try "Season X" pattern (e.g., "One-Punch Man Season 3")
  const seasonMatch = title.match(/Season\s+(\d+)/i)
  if (seasonMatch) {
    return parseInt(seasonMatch[1], 10)
  }
  
  // Then try number at the end (e.g., "One-Punch Man 3")
  // Match a space followed by 1-2 digits at the end (not 4 digits which would be a year)
  const numberAtEndMatch = title.match(/\s+(\d{1,2})$/i)
  if (numberAtEndMatch) {
    const num = parseInt(numberAtEndMatch[1], 10)
    // Only use if it's a reasonable season number (1-99, not a year)
    if (num >= 1 && num <= 99) {
      return num
    }
  }
  
  return null
}

/**
 * Fetch metadata from Kitsu API for an anime
 * @param {string} kitsuId - The Kitsu anime ID (e.g., "46676")
 * @returns {Promise<{baseTitle: string, season: number|null, titleEn: string}|null>}
 */
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
        
        // First try to get season from abbreviatedTitles (e.g., ["One-Punch Man Season 3", "One-Punch Man 3"])
        const abbreviatedTitles = attributes.abbreviatedTitles || []
        for (const abbrevTitle of abbreviatedTitles) {
          const extractedSeason = extractSeasonFromTitle(abbrevTitle)
          if (extractedSeason !== null) {
            season = extractedSeason
            titleToUse = abbrevTitle
            break
          }
        }
        
        // Fall back to titles.en if no season found in abbreviatedTitles
        if (season === null) {
          const extractedSeason = extractSeasonFromTitle(titleEn)
          if (extractedSeason !== null) {
            season = extractedSeason
          }
        }
        
        // Extract base title (without "Season X" or trailing number)
        const baseTitle = titleToUse
          .replace(/\s+Season\s+\d+.*$/i, '')
          .replace(/\s+\d{1,2}$/, '')
          .trim()
        
        return { baseTitle, season, titleEn: titleToUse }
      }
    } else {
      console.warn(`[KitsuUtils] Kitsu API returned status ${response.status} for ID ${kitsuId}`)
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`[KitsuUtils] Timeout fetching Kitsu metadata for ID ${kitsuId}`)
    } else {
      console.warn(`[KitsuUtils] Error fetching Kitsu metadata for ID ${kitsuId}:`, error.message)
    }
  }
  return null
}

/**
 * Extract season and episode from a video_id string
 * Supports multiple formats:
 * - Kitsu: "kitsu:46676:1" -> episode=1, season from API
 * - IMDb: "tt8080122:4:6" -> season=4, episode=6
 * - IMDb (episode only): "tt8080122:6" -> episode=6, season=null
 * 
 * @param {string} videoId - The video ID string
 * @returns {Promise<{season: number|null, episode: number|null}>}
 */
async function extractSeasonEpisode(videoId) {
  if (!videoId) return { season: null, episode: null }

  const parts = videoId.split(':')

  // Kitsu format: "kitsu:46676:1" -> episode = last segment, season from Kitsu API title
  if (videoId.startsWith('kitsu:') && parts.length >= 3) {
    const kitsuId = parts[1] // e.g., "46676"
    const episodePart = parts[parts.length - 1]
    const parsedEpisode = parseInt(episodePart, 10)
    
    let season = null
    let episode = !isNaN(parsedEpisode) ? parsedEpisode : null
    
    // Fetch season from Kitsu API
    if (kitsuId) {
      try {
        const kitsuData = await fetchKitsuMetadata(kitsuId)
        if (kitsuData && kitsuData.season !== null) {
          season = kitsuData.season
        } else {
          // Default to 1 if Kitsu API doesn't return a season
          season = 1
        }
      } catch (error) {
        console.warn(`[KitsuUtils] Failed to fetch Kitsu metadata for ID ${kitsuId}:`, error.message)
        // Default to 1 if API call fails
        season = 1
      }
    } else {
      season = 1
    }
    
    return { season, episode }
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

module.exports = {
  extractSeasonFromTitle,
  fetchKitsuMetadata,
  extractSeasonEpisode
}
