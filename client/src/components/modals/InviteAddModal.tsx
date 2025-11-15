'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import DateTimePicker from '@/components/ui/DateTimePicker'
import { groupsAPI } from '@/services/api'
import { useQuery } from '@tanstack/react-query'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

interface InviteAddModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (data: { maxUses?: number; expiresAt?: string; groupName?: string }) => void
  isCreating: boolean
}

export default function InviteAddModal({
  isOpen,
  onClose,
  onCreate,
  isCreating
}: InviteAddModalProps) {
  const [maxUses, setMaxUses] = React.useState<number>(1)
  const [expiresAt, setExpiresAt] = React.useState<string>('')
  const [selectedGroupForCreate, setSelectedGroupForCreate] = React.useState<string>('')

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll
  })

  useBodyScrollLock(isOpen)

  React.useEffect(() => {
    if (!isOpen) {
      setMaxUses(1)
      setExpiresAt('')
      setSelectedGroupForCreate('')
    }
  }, [isOpen])

  React.useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleCreate = () => {
    if (!expiresAt) {
      return
    }

    const finalMaxUses = Math.min(Math.max(maxUses || 1, 1), 10)
    onCreate({
      maxUses: finalMaxUses,
      expiresAt: expiresAt,
      groupName: selectedGroupForCreate || undefined
    })
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75" onClick={onClose}>
      <div 
        className="card max-w-md w-full mx-4" 
        style={{ background: 'var(--color-background)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Create New Invite</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Group (optional)</label>
              <select
                value={selectedGroupForCreate}
                onChange={(e) => setSelectedGroupForCreate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none input"
              >
                <option value="">No group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.name}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Maximum Uses</label>
              <input
                type="number"
                min="1"
                max="10"
                value={maxUses}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1
                  setMaxUses(Math.min(Math.max(value, 1), 10))
                }}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Expires At</label>
              <DateTimePicker
                value={expiresAt}
                onChange={setExpiresAt}
                min={new Date()}
                placeholder="Select expiration date and time"
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const date = new Date()
                    date.setMinutes(date.getMinutes() + 5)
                    setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                  }}
                  className="px-3 py-1 text-xs rounded transition-colors color-hover"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  5m
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const date = new Date()
                    date.setMinutes(date.getMinutes() + 30)
                    setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                  }}
                  className="px-3 py-1 text-xs rounded transition-colors color-hover"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  30m
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const date = new Date()
                    date.setHours(date.getHours() + 1)
                    setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                  }}
                  className="px-3 py-1 text-xs rounded transition-colors color-hover"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  1h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const date = new Date()
                    date.setHours(date.getHours() + 12)
                    setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                  }}
                  className="px-3 py-1 text-xs rounded transition-colors color-hover"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  12h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const date = new Date()
                    date.setDate(date.getDate() + 1)
                    setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                  }}
                  className="px-3 py-1 text-xs rounded transition-colors color-hover"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  1d
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const date = new Date()
                    date.setDate(date.getDate() + 7)
                    setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                  }}
                  className="px-3 py-1 text-xs rounded transition-colors color-hover"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  1w
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const date = new Date()
                    date.setDate(date.getDate() + 14)
                    setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                  }}
                  className="px-3 py-1 text-xs rounded transition-colors color-hover"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  2w
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const date = new Date()
                    date.setDate(date.getDate() + 30)
                    setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                  }}
                  className="px-3 py-1 text-xs rounded transition-colors color-hover"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  30d
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors color-text-secondary color-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating || !expiresAt}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 color-surface hover:opacity-90"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

