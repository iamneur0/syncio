'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// Theme IDs
export const themeIds = ['midnight', 'ember', 'nord', 'verdant', 'slate', 'rose', 'daylight'] as const;
export type ThemeId = (typeof themeIds)[number];

// Theme metadata for UI (settings page, etc.)
export const themeMeta: Record<ThemeId, { 
  name: string; 
  description: string; 
  preview: string;
  colors: { bg: string; surface: string; primary: string; secondary: string };
}> = {
  midnight: {
    name: 'Midnight',
    description: 'Deep blue-black with warm amber accents',
    preview: '#f0a500',
    colors: { bg: '#0d1117', surface: '#1c2128', primary: '#f0a500', secondary: '#d4a500' },
  },
  ember: {
    name: 'Ember',
    description: 'Charcoal warmth with fiery accents',
    preview: '#ff5722',
    colors: { bg: '#1a1615', surface: '#292420', primary: '#ff5722', secondary: '#ffab40' },
  },
  nord: {
    name: 'Nord',
    description: 'Arctic cool with icy blue tones',
    preview: '#88c0d0',
    colors: { bg: '#2e3440', surface: '#3b4252', primary: '#88c0d0', secondary: '#81a1c1' },
  },
  verdant: {
    name: 'Verdant',
    description: 'Deep forest with emerald greens',
    preview: '#4caf50',
    colors: { bg: '#0f1a14', surface: '#1a2a1e', primary: '#4caf50', secondary: '#26a69a' },
  },
  slate: {
    name: 'Slate',
    description: 'Minimal grayscale with blue accents',
    preview: '#3b82f6',
    colors: { bg: '#18181b', surface: '#27272a', primary: '#3b82f6', secondary: '#60a5fa' },
  },
  rose: {
    name: 'Rose',
    description: 'Elegant dark with rose gold',
    preview: '#f472b6',
    colors: { bg: '#1c1618', surface: '#2a2124', primary: '#f472b6', secondary: '#ec4899' },
  },
  daylight: {
    name: 'Daylight',
    description: 'Light theme with soft neutrals and blue accents',
    preview: '#2563eb',
    colors: { bg: '#f3f4f6', surface: '#ffffff', primary: '#2563eb', secondary: '#3b82f6' },
  },
};

interface ThemeContextValue {
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  hideSensitive: boolean;
  toggleHideSensitive: () => void;
}

const defaultContextValue: ThemeContextValue = {
  themeId: 'midnight',
  setTheme: () => {},
  hideSensitive: false,
  toggleHideSensitive: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(defaultContextValue);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>('midnight');
  const [hideSensitive, setHideSensitive] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load saved theme and settings on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('syncio-theme') as ThemeId | null;
    const savedHideSensitive = localStorage.getItem('syncio-hide-sensitive') === 'true';
    const initial = savedTheme && themeIds.includes(savedTheme) ? savedTheme : 'midnight';
    setThemeId(initial);
    setHideSensitive(savedHideSensitive);
    document.documentElement.className = initial;
    setMounted(true);
  }, []);

  // Apply theme class when changed
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.className = themeId;
    localStorage.setItem('syncio-theme', themeId);
  }, [themeId, mounted]);

  // Save hideSensitive preference
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('syncio-hide-sensitive', String(hideSensitive));
  }, [hideSensitive, mounted]);

  const setTheme = (id: ThemeId) => {
    if (themeIds.includes(id)) {
      setThemeId(id);
    }
  };

  const toggleHideSensitive = () => {
    setHideSensitive(prev => !prev);
  };

  return (
    <ThemeContext.Provider value={{ themeId, setTheme, hideSensitive, toggleHideSensitive }}>
      <div style={{ visibility: mounted ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
