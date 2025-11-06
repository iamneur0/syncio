'use client'

import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { GenericEntityPage, createEntityPageConfig } from '@/components/layout'

export default function AddonsPage() {
  const { isDark, isModern, isModernDark, isMono } = useTheme()

  // Create the addon page configuration
  const config = createEntityPageConfig('addon')
  
  // Add custom content (Discovery Card) to the config
  const configWithCustomContent = {
    ...config,
    customContent: undefined
  }

  return (
    <GenericEntityPage 
      config={configWithCustomContent}
    />
  )
}