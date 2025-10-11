import { useState, useEffect } from 'react'

export default function useAddonModals() {
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window === 'undefined') return 'card'
    return (localStorage.getItem('addons-view-mode') as 'card' | 'list') || 'card'
  })
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingAddon, setEditingAddon] = useState<any>(null)

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem('addons-view-mode', viewMode)
  }, [viewMode])

  // Clear selection when switching view modes
  useEffect(() => {
    setSelectedAddons([])
  }, [viewMode])

  return {
    searchTerm,
    setSearchTerm,
    viewMode,
    setViewMode,
    selectedAddons,
    setSelectedAddons,
    showAddModal,
    setShowAddModal,
    showEditModal,
    setShowEditModal,
    editingAddon,
    setEditingAddon
  }
}
