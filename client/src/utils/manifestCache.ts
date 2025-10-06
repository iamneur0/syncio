// Manifest cache utility to prevent duplicate requests and rate limiting
import { debug } from './debug'
const manifestCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 1000 // 1 second between requests
const pendingRequests = new Set<string>() // Track pending requests to prevent duplicates

/**
 * Cached manifest fetching function with rate limiting
 * @param url - The manifest URL to fetch
 * @returns Promise<any | null> - The manifest data or null if failed
 */
export const fetchManifestCached = async (url: string): Promise<any | null> => {
  if (!url) return null
  
  // Check cache first
  const cached = manifestCache.get(url)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data
  }
  
  // Check if request is already pending for this URL
  if (pendingRequests.has(url)) {
    // Wait for the pending request to complete
    let attempts = 0
    while (pendingRequests.has(url) && attempts < 50) { // Max 5 seconds wait
      await new Promise(resolve => setTimeout(resolve, 100))
      attempts++
    }
    // Check cache again after waiting
    const cachedAfterWait = manifestCache.get(url)
    if (cachedAfterWait && Date.now() - cachedAfterWait.timestamp < CACHE_DURATION) {
      return cachedAfterWait.data
    }
  }
  
  // Mark request as pending
  pendingRequests.add(url)
  
  try {
    // Rate limiting: ensure minimum interval between requests
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
    }
    lastRequestTime = Date.now()
    
    const res = await fetch(url)
    if (!res.ok) {
      if (res.status === 429) {
        // If rate limited, wait longer before retrying
        debug.warn(`Rate limited for ${url}, waiting 5 seconds...`)
        await new Promise(resolve => setTimeout(resolve, 5000))
        return null
      }
      return null
    }
    const data = await res.json()
    
    // Cache the result
    manifestCache.set(url, { data, timestamp: Date.now() })
    return data
  } catch (error) {
    debug.warn(`Failed to fetch manifest from ${url}:`, error)
    return null
  } finally {
    // Remove from pending requests
    pendingRequests.delete(url)
  }
}

/**
 * Clear the manifest cache
 */
export const clearManifestCache = () => {
  manifestCache.clear()
  pendingRequests.clear()
}

/**
 * Get cache statistics
 */
export const getCacheStats = () => ({
  cacheSize: manifestCache.size,
  pendingRequests: pendingRequests.size,
  lastRequestTime
})
