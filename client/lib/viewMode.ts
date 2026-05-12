'use client';

import { useState, useEffect, useCallback } from 'react';

type ViewMode = 'grid' | 'list';

const STORAGE_KEY = 'syncio-default-view-mode';

export function getStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'grid';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'grid' || stored === 'list') return stored;
  return 'grid';
}

export function setStoredViewMode(mode: ViewMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, mode);
}

export function useDefaultViewMode() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setViewMode(getStoredViewMode());
    setIsLoaded(true);
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => {
      const newMode = prev === 'grid' ? 'list' : 'grid';
      setStoredViewMode(newMode);
      return newMode;
    });
  }, []);

  const setViewModeDirect = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setStoredViewMode(mode);
  }, []);

  return {
    viewMode,
    setViewMode: setViewModeDirect,
    toggleViewMode,
    isLoaded,
  };
}