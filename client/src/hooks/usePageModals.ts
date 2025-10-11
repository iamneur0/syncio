import { useState } from 'react'

export interface BaseModalState {
  searchTerm: string
  setSearchTerm: (term: string) => void
  viewMode: 'card' | 'list'
  setViewMode: (mode: 'card' | 'list') => void
  selectedItems: string[]
  setSelectedItems: (items: string[]) => void
  showAddModal: boolean
  setShowAddModal: (show: boolean) => void
  showEditModal: boolean
  setShowEditModal: (show: boolean) => void
  editingItem: any
  setEditingItem: (item: any) => void
  showDetailModal: boolean
  setShowDetailModal: (show: boolean) => void
  selectedItem: any
  setSelectedItem: (item: any) => void
}

export function useBaseModals(): BaseModalState {
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const raw = String(localStorage.getItem('global-view-mode') || 'card').toLowerCase().trim()
      return raw === 'list' ? 'list' : 'card'
    }
    return 'card'
  })
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<any>(null)

  return {
    searchTerm,
    setSearchTerm,
    viewMode,
    setViewMode,
    selectedItems,
    setSelectedItems,
    showAddModal,
    setShowAddModal,
    showEditModal,
    setShowEditModal,
    editingItem,
    setEditingItem,
    showDetailModal,
    setShowDetailModal,
    selectedItem,
    setSelectedItem
  }
}

export interface DragDropState {
  isDndActive: boolean
  setIsDndActive: (active: boolean) => void
  activeId: string | null
  setActiveId: (id: string | null) => void
  itemOrder: string[]
  setItemOrder: (order: string[]) => void
}

export function useDragDrop(): DragDropState {
  const [isDndActive, setIsDndActive] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [itemOrder, setItemOrder] = useState<string[]>([])

  return {
    isDndActive,
    setIsDndActive,
    activeId,
    setActiveId,
    itemOrder,
    setItemOrder
  }
}
