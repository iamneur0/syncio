import { useState, useEffect } from 'react'

/**
 * Common state management hooks to reduce duplication
 */

/**
 * Hook for managing modal state with mounting logic
 */
export const useModalState = (initialOpen = false) => {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const open = () => setIsOpen(true)
  const close = () => setIsOpen(false)
  const toggle = () => setIsOpen(prev => !prev)

  return {
    isOpen,
    setIsOpen,
    mounted,
    open,
    close,
    toggle
  }
}

/**
 * Hook for managing loading states
 */
export const useLoadingState = (initialLoading = false) => {
  const [isLoading, setIsLoading] = useState(initialLoading)
  const [loadingMessage, setLoadingMessage] = useState<string>('')

  const startLoading = (message?: string) => {
    setIsLoading(true)
    if (message) setLoadingMessage(message)
  }

  const stopLoading = () => {
    setIsLoading(false)
    setLoadingMessage('')
  }

  return {
    isLoading,
    loadingMessage,
    setIsLoading,
    startLoading,
    stopLoading
  }
}

/**
 * Hook for managing form state with validation
 */
export const useFormState = <T extends Record<string, any>>(initialState: T) => {
  const [formData, setFormData] = useState<T>(initialState)
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateField = <K extends keyof T>(field: K, value: T[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when field is updated
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const setError = (field: keyof T, message: string) => {
    setErrors(prev => ({ ...prev, [field]: message }))
  }

  const clearErrors = () => {
    setErrors({})
  }

  const reset = () => {
    setFormData(initialState)
    setErrors({})
    setIsSubmitting(false)
  }

  const hasErrors = Object.values(errors).some(error => error !== undefined)

  return {
    formData,
    errors,
    isSubmitting,
    setIsSubmitting,
    updateField,
    setError,
    clearErrors,
    reset,
    hasErrors
  }
}

/**
 * Hook for managing selection state
 */
export const useSelectionState = <T = string>(initialSelection: T[] = []) => {
  const [selectedItems, setSelectedItems] = useState<T[]>(initialSelection)

  const selectItem = (item: T) => {
    setSelectedItems(prev => [...prev, item])
  }

  const deselectItem = (item: T) => {
    setSelectedItems(prev => prev.filter(i => i !== item))
  }

  const toggleItem = (item: T) => {
    setSelectedItems(prev => 
      prev.includes(item) 
        ? prev.filter(i => i !== item)
        : [...prev, item]
    )
  }

  const selectAll = (items: T[]) => {
    setSelectedItems(items)
  }

  const deselectAll = () => {
    setSelectedItems([])
  }

  const isSelected = (item: T) => selectedItems.includes(item)

  return {
    selectedItems,
    setSelectedItems,
    selectItem,
    deselectItem,
    toggleItem,
    selectAll,
    deselectAll,
    isSelected
  }
}

/**
 * Hook for managing unsafe mode state
 */
export const useUnsafeMode = () => {
  const [isUnsafeMode, setIsUnsafeMode] = useState(false)

  useEffect(() => {
    try {
      const mode = localStorage.getItem('sfm_delete_mode')
      setIsUnsafeMode(mode === 'unsafe')
    } catch {
      setIsUnsafeMode(false)
    }
  }, [])

  return { isUnsafeMode, setIsUnsafeMode }
}
