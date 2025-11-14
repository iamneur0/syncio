/**
 * Webhook helper utilities for Discord notifications
 */

/**
 * Format a value as a Discord code block
 * @param {any} value - Value to format
 * @returns {string} Formatted code block
 */
function formatCodeBlock(value) {
  return '```' + (value ?? '') + '```'
}

/**
 * Format a date as a Discord relative timestamp
 * @param {Date|string|null} value - Date to format
 * @returns {string|null} Discord timestamp string or null
 */
function formatRelativeTime(value) {
  if (!value) return null
  try {
    const date = typeof value === 'string' ? new Date(value) : value
    return `<t:${Math.floor(date.getTime() / 1000)}:R>`
  } catch {
    return null
  }
}

/**
 * Parse sync configuration from account
 * @param {any} syncCfg - Raw sync config (string or object)
 * @returns {Object|null} Parsed sync config or null
 */
function parseSyncConfig(syncCfg) {
  if (!syncCfg) return null
  if (typeof syncCfg === 'object') return syncCfg
  if (typeof syncCfg === 'string') {
    try {
      return JSON.parse(syncCfg)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Get application version from environment or package.json
 * @returns {string} Application version
 */
function getAppVersion() {
  let appVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || ''
  if (!appVersion) {
    try {
      appVersion = require('../../package.json')?.version || ''
    } catch {}
  }
  return appVersion
}

module.exports = {
  formatCodeBlock,
  formatRelativeTime,
  parseSyncConfig,
  getAppVersion
}

