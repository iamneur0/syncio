/**
 * Format a date string to a localized string
 * @param dateString - ISO date string or null
 * @returns Formatted date string or 'Never' if null
 */
export function formatDate(dateString: string | null): string {
  if (!dateString) return 'Never'
  return new Date(dateString).toLocaleString()
}

/**
 * Check if a date has expired
 * @param expiresAt - ISO date string or null
 * @returns true if the date is in the past
 */
export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

