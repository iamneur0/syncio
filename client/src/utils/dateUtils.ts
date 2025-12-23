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
 * Format a date string to separate date and time
 * @param dateString - ISO date string or null
 * @returns Object with formatted date and time strings
 */
export function formatDateSeparate(dateString: string | null): { date: string; time: string } {
  if (!dateString) return { date: 'Never', time: '' }
  const d = new Date(dateString)
  return {
    date: d.toLocaleDateString(),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
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

