// Simple in-memory cache for precomputed metrics, keyed by account + period
// This is populated periodically (every 5 minutes) by the activity monitor
// and read by both /users/metrics and /ext/metrics.json routes.

const metricsCache = new Map()
const METRICS_TTL_MS = 60 * 1000 // 1 minute TTL for cached metrics

function makeKey(accountId, period) {
  return `${accountId || 'default'}::${period || '30d'}`
}

/**
 * Get cached metrics for an account and period.
 * Returns the cached object or null if not present.
 */
function getCachedMetrics(accountId, period) {
  const key = makeKey(accountId, period)
  const entry = metricsCache.get(key)
  if (!entry) return null

  // Expire stale entries so metrics stay reasonably fresh
  const age = Date.now() - entry.updatedAt
  if (age > METRICS_TTL_MS) {
    metricsCache.delete(key)
    return null
  }

  return entry.data
}

/**
 * Set cached metrics for an account and period.
 */
function setCachedMetrics(accountId, period, data) {
  const key = makeKey(accountId, period)
  metricsCache.set(key, {
    data,
    updatedAt: Date.now()
  })
}

/**
 * Clear all cached metrics for a given account.
 */
function clearMetricsForAccount(accountId) {
  const prefix = `${accountId || 'default'}::`
  for (const key of metricsCache.keys()) {
    if (key.startsWith(prefix)) {
      metricsCache.delete(key)
    }
  }
}

module.exports = {
  getCachedMetrics,
  setCachedMetrics,
  clearMetricsForAccount
}











