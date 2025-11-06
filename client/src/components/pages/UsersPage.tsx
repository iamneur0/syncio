'use client'

import React from 'react'
import { GenericEntityPage, createEntityPageConfig } from '@/components/layout'

export default function UsersPage() {
  // Create the user page configuration
  const config = createEntityPageConfig('user')

  return (
    <GenericEntityPage 
      config={config}
    />
  )
}