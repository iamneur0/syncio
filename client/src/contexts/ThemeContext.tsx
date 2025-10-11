'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'modern' | 'modern-dark' | 'mono'

export interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  isDark: boolean
  isModern: boolean
  isModernDark: boolean
  isMono: boolean
  isLoading: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

interface ThemeProviderProps {
  children: ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('light')
  const [isLoading, setIsLoading] = useState(false) // Start with false to prevent blocking

  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      // Get theme from localStorage or system preference
      const savedTheme = localStorage.getItem('theme') as Theme
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      
      // Fallback modern themes to dark theme since they're disabled
      let initialTheme = savedTheme || systemTheme
      if (initialTheme === 'modern' || initialTheme === 'modern-dark') {
        initialTheme = 'dark'
        // Update localStorage to reflect the fallback
        localStorage.setItem('theme', 'dark')
      }
      
      // Apply theme to document immediately and update theme-color
      updateDocumentClass(initialTheme)
      
      // Mark theme as loaded on body
      document.body.classList.add('theme-loaded')
      
      // Set theme state and mark as loaded
      setTheme(initialTheme)
      setIsLoading(false)
    } else {
      // On server side, don't block rendering
      setIsLoading(false)
    }
  }, [])

  const ensureThemeColorTag = (): HTMLMetaElement => {
    let tag = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (!tag) {
      tag = document.createElement('meta')
      tag.setAttribute('name', 'theme-color')
      document.head.appendChild(tag)
    }
    return tag
  }

  const updateDocumentClass = (newTheme: Theme) => {
    if (typeof window !== 'undefined') {
      const root = window.document.documentElement
      root.classList.remove('light', 'dark', 'modern', 'modern-dark', 'mono')
      root.classList.add(newTheme)
      // Update theme-color meta to match background precisely per theme
      const colors: Record<Theme, string> = {
        light: '#f9fafb',
        dark: '#111827',
        'modern': '#f9fafb',
        'modern-dark': '#111827',
        mono: '#000000',
      }
      const tag = ensureThemeColorTag()
      tag.setAttribute('content', colors[newTheme] || '#111827')
    }
  }

  const toggleTheme = () => {
    // Skip modern themes since they're disabled
    const newTheme: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'mono' : 'light'
    setTheme(newTheme)
    updateDocumentClass(newTheme)
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme)
    }
  }

  const setThemeValue = (newTheme: Theme) => {
    setTheme(newTheme)
    updateDocumentClass(newTheme)
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme)
    }
  }

  const value: ThemeContextType = {
    theme,
    toggleTheme,
    setTheme: setThemeValue,
    isDark: theme === 'dark',
    isModern: theme === 'modern',
    isModernDark: theme === 'modern-dark',
    isMono: theme === 'mono',
    isLoading,
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}
