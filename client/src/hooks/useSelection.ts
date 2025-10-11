import { useState, useCallback } from 'react'

export interface UseSelectionOptions {
  onSelectionChange?: (selectedIds: string[]) => void
}

export function useSelection<T extends { id: string }>(items: T[], options: UseSelectionOptions = {}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const { onSelectionChange } = options

  const handleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSelection = prev.includes(id) 
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
      
      onSelectionChange?.(newSelection)
      return newSelection
    })
  }, [onSelectionChange])

  const handleSelectAll = useCallback(() => {
    const allIds = items.map(item => item.id)
    setSelectedIds(allIds)
    onSelectionChange?.(allIds)
  }, [items, onSelectionChange])

  const handleDeselectAll = useCallback(() => {
    setSelectedIds([])
    onSelectionChange?.([])
  }, [onSelectionChange])

  const handleToggleAll = useCallback(() => {
    if (selectedIds.length === items.length) {
      handleDeselectAll()
    } else {
      handleSelectAll()
    }
  }, [selectedIds.length, items.length, handleSelectAll, handleDeselectAll])

  const isSelected = useCallback((id: string) => {
    return selectedIds.includes(id)
  }, [selectedIds])

  const isAllSelected = selectedIds.length === items.length && items.length > 0
  const isPartiallySelected = selectedIds.length > 0 && selectedIds.length < items.length
  const hasSelection = selectedIds.length > 0

  return {
    selectedIds,
    selectedCount: selectedIds.length,
    isSelected,
    isAllSelected,
    isPartiallySelected,
    hasSelection,
    handleSelect,
    handleSelectAll,
    handleDeselectAll,
    handleToggleAll,
    clearSelection: handleDeselectAll
  }
}
