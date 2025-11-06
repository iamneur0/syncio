'use client'

import React from 'react'
import { GenericEntityPage, createEntityPageConfig } from '@/components/layout'

export default function GroupsPage() {
  // Create the group page configuration
  const config = createEntityPageConfig('group')

    return (
    <GenericEntityPage 
      config={config}
    />
  )
}