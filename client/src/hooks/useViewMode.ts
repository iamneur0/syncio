import { useState, useLayoutEffect } from 'react'

export type ViewMode = 'card' | 'list'

export function useViewMode() {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('global-view-mode') || 'card').toLowerCase().trim()
      return raw === 'list' ? 'list' : 'card'
    }
    return 'card'
  })

  // Ensure highlight persists after refresh/hydration
  useLayoutEffect(() => {
    try {
      const raw = String(localStorage.getItem('global-view-mode') || 'card').toLowerCase().trim()
      const stored = raw === 'list' ? 'list' : 'card'
      setViewMode(stored)
    } catch {}
  }, [])

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem('global-view-mode', mode)
    } catch {}
  }

  return {
    viewMode,
    setViewMode: handleViewModeChange
  }
}
