'use client';

import { useState, useEffect, useCallback } from 'react';

type ViewMode = 'grid' | 'list';

const STORAGE_KEY = 'syncio-default-view-mode';

function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
}

export function getStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'grid';
  // Always use grid on mobile
  if (isMobile()) return 'grid';
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

  // Force grid on mobile when window resizes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      if (isMobile() && viewMode !== 'grid') {
        setViewMode('grid');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  const toggleViewMode = useCallback(() => {
    // Don't allow list view on mobile
    if (isMobile()) return;
    
    setViewMode(prev => {
      const newMode = prev === 'grid' ? 'list' : 'grid';
      setStoredViewMode(newMode);
      return newMode;
    });
  }, []);

  const setViewModeDirect = useCallback((mode: ViewMode) => {
    // Don't allow list view on mobile
    if (isMobile()) {
      setViewMode('grid');
      return;
    }
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