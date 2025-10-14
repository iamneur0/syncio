'use client'

import React from 'react'
import { GenericEntityPage, createEntityPageConfig } from '../common'

export default function GroupsPage() {
  // Create the group page configuration
  const config = createEntityPageConfig('group')

    return (
    <GenericEntityPage 
      config={config}
    />
  )
}