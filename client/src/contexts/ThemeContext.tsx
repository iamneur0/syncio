'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'modern' | 'modern-dark' | 'mono'

interface ThemeContextType {
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
      
      // Apply theme to document immediately
      const root = window.document.documentElement
      root.classList.remove('light', 'dark', 'modern', 'modern-dark', 'mono')
      root.classList.add(initialTheme)
      
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

  const updateDocumentClass = (newTheme: Theme) => {
    if (typeof window !== 'undefined') {
      const root = window.document.documentElement
      root.classList.remove('light', 'dark', 'modern', 'modern-dark', 'mono')
      root.classList.add(newTheme)
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
