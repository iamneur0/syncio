/**
 * Library processing utilities
 * Contains shared logic for expanding and enriching library items
 */

/**
 * Find the latest episode from an array of episodes
 * @param {Array} episodes - Array of episode items
 * @param {Object} options - Options object
 * @param {boolean} options.inheritPoster - Whether to inherit poster from first episode if missing
 * @returns {Object|null} - The latest episode item, or null if no episodes
 */
function findLatestEpisode(episodes, options = {}) {
  if (!episodes || episodes.length === 0) return null
  
  const { inheritPoster = false } = options
  const firstEpisode = episodes[0]
  let latestEpisode = null
  
  // Try to find episode matching video_id (latest watched episode)
  if (firstEpisode.state?.video_id) {
    latestEpisode = episodes.find(ep => ep.state?.video_id === firstEpisode.state.video_id)
  }
  
  // If no match found, use the one with highest season/episode number
  if (!latestEpisode) {
    latestEpisode = episodes.reduce((latest, current) => {
      const latestSeason = latest.state?.season || 0
      const latestEpisodeNum = latest.state?.episode || 0
      const currentSeason = current.state?.season || 0
      const currentEpisodeNum = current.state?.episode || 0
      
      if (currentSeason > latestSeason || 
          (currentSeason === latestSeason && currentEpisodeNum > latestEpisodeNum)) {
        return current
      }
      return latest
    })
  }
  
  // Inherit poster from first episode if missing
  if (latestEpisode && inheritPoster && !latestEpisode.poster && firstEpisode.poster) {
    latestEpisode.poster = firstEpisode.poster
  }
  
  return latestEpisode
}

/**
 * Enrich library items with missing posters from Cinemeta
 * @param {Array} items - Array of library items
 * @param {Object} options - Options object
 * @param {number} options.timeout - Timeout in milliseconds (default: 3000)
 * @param {number} options.requestTimeout - Per-request timeout in milliseconds (default: 2000)
 * @returns {Promise<void>}
 */
async function enrichPostersFromCinemeta(items, options = {}) {
  const { timeout = 3000, requestTimeout = 2000 } = options
  
  // Only enrich items that don't have posters
  const enrichPromises = items
    .filter(item => !item.poster && (item._id || item.id))
    .map(async (item) => {
      try {
        let itemId = item._id || item.id
        const itemType = item.type || 'movie'
        
        // For episode items (format: "tt1234567:season:episode"), extract base show ID
        if (itemId.includes(':')) {
          itemId = itemId.split(':')[0]
        }
        
        // Only try Cinemeta for IMDb IDs (starting with "tt")
        if (!itemId.startsWith('tt')) {
          return
        }
        
        const endpoint = `https://v3-cinemeta.strem.io/meta/${itemType}/${itemId}.json`
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), requestTimeout)
        
        const response = await fetch(endpoint, {
          headers: { 'User-Agent': 'Syncio/1.0' },
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        if (response.ok) {
          const data = await response.json()
          const meta = data?.meta
          if (meta?.poster) {
            item.poster = meta.poster
          }
        }
      } catch (error) {
        // Silently fail - poster enrichment is optional
      }
    })
  
  // Wait for all enrichment to complete (with timeout)
  await Promise.race([
    Promise.all(enrichPromises),
    new Promise(resolve => setTimeout(resolve, timeout))
  ])
}

module.exports = {
  findLatestEpisode,
  enrichPostersFromCinemeta
}

