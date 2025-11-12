import React, { useState, useRef, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface InlineEditProps {
  value: string
  onSave: (newValue: string) => Promise<void>
  placeholder?: string
  className?: string
  maxLength?: number
  disabled?: boolean
  // Optional mutation for automatic query invalidation
  mutationFn?: (newValue: string) => Promise<any>
  invalidateQueries?: string[][]
}

export default function InlineEdit({
  value,
  onSave,
  placeholder = 'Enter value...',
  className = '',
  maxLength,
  disabled = false,
  mutationFn,
  invalidateQueries = []
}: InlineEditProps) {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const [isSaving, setIsSaving] = useState(false)
  const [inputWidth, setInputWidth] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)

  // Use mutation if provided, otherwise fall back to onSave
  const mutation = useMutation({
    mutationFn: mutationFn || onSave,
    onSuccess: () => {
      // Invalidate specified queries
      invalidateQueries.forEach(queryKey => {
        queryClient.invalidateQueries({ queryKey })
      })
    }
  })

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      // Position cursor at the end instead of selecting all text
      const length = inputRef.current.value.length
      inputRef.current.setSelectionRange(length, length)
    }
  }, [isEditing])

  useEffect(() => {
    setEditValue(value)
  }, [value])

  // Measure text width for accurate input sizing
  useEffect(() => {
    if (measureRef.current) {
      const width = measureRef.current.offsetWidth
      setInputWidth(width)
    }
  }, [editValue, value])

  const handleStartEdit = () => {
    if (disabled) return
    setIsEditing(true)
    setEditValue(value)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditValue(value)
  }

  const handleSave = async () => {
    if (editValue.trim() === value.trim() || !editValue.trim()) {
      handleCancel()
      return
    }

    setIsSaving(true)
    try {
      if (mutationFn) {
        await mutation.mutateAsync(editValue.trim())
      } else {
        await onSave(editValue.trim())
      }
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save:', error)
      // Keep editing mode open on error
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  const handleBlur = () => {
    // Save on blur for better UX
    handleSave()
  }

  if (isEditing) {
    return (
      <div className="relative inline-block">
        {/* Hidden span to measure original text width */}
        <span
          ref={measureRef}
          className={`text-xl font-bold absolute opacity-0 pointer-events-none whitespace-nowrap ${className}`}
        >
          {value || placeholder}
        </span>
        {/* Placeholder span to maintain layout */}
        <span className={`text-xl font-bold opacity-0 ${className}`}>
          {value || placeholder}
        </span>
        {/* Input positioned absolutely over the text with constrained width */}
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={isSaving}
          className={`absolute top-0 left-0 text-xl font-bold bg-transparent border-none outline-none focus:ring-0 focus:outline-none p-0 m-0 overflow-hidden color-text placeholder:color-text-secondary ${isSaving ? 'opacity-50' : ''} ${className}`}
          style={{
            width: inputWidth > 0 ? `${inputWidth}px` : 'auto',
            minWidth: '20px',
            boxSizing: 'content-box',
            maxWidth: inputWidth > 0 ? `${inputWidth}px` : 'none'
          }}
        />
      </div>
    )
  }

  return (
    <span 
      onClick={handleStartEdit}
      className={`text-xl font-bold cursor-pointer hover:underline transition-all color-text hover:opacity-80 ${disabled ? 'cursor-default hover:no-underline' : ''} ${className}`}
      title={disabled ? '' : 'Click to edit'}
    >
      {value || placeholder}
    </span>
  )
}
