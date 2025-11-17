'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import DateTimePicker from '@/components/ui/DateTimePicker'
import { ToggleSwitch } from '@/components/ui'
import { groupsAPI } from '@/services/api'
import { useQuery } from '@tanstack/react-query'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

interface InviteAddModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (data: { maxUses?: number; expiresAt?: string; groupName?: string; syncOnJoin?: boolean; membershipExpiresAt?: string }) => void
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
  const [membershipExpiresAt, setMembershipExpiresAt] = React.useState<string>('')
  const [selectedGroupForCreate, setSelectedGroupForCreate] = React.useState<string>('')
  const [syncOnJoin, setSyncOnJoin] = React.useState<boolean>(false)

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.getAll
  })

  useBodyScrollLock(isOpen)

  React.useEffect(() => {
    if (!isOpen) {
      setMaxUses(1)
      setExpiresAt('')
      setMembershipExpiresAt('')
      setSelectedGroupForCreate('')
      setSyncOnJoin(false)
    }
  }, [isOpen])

  // Reset syncOnJoin when group is cleared
  React.useEffect(() => {
    if (!selectedGroupForCreate) {
      setSyncOnJoin(false)
    }
  }, [selectedGroupForCreate])

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
      membershipExpiresAt: membershipExpiresAt || undefined,
      groupName: selectedGroupForCreate || undefined,
      syncOnJoin: selectedGroupForCreate ? syncOnJoin : false
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
              <label className="block text-sm font-medium mb-1">Invitation Expires At</label>
              <DateTimePicker
                value={expiresAt}
                onChange={setExpiresAt}
                min={new Date()}
                placeholder="Select expiration date and time"
              />
              <div className="flex gap-1.5 mt-2 flex-nowrap overflow-x-auto">
                {[
                  { label: '5m', minutes: 5 },
                  { label: '30m', minutes: 30 },
                  { label: '1h', hours: 1 },
                  { label: '12h', hours: 12 },
                  { label: '1d', days: 1 },
                  { label: '1w', days: 7 },
                  { label: '2w', days: 14 },
                  { label: '30d', days: 30 }
                ].map(({ label, minutes, hours, days }) => {
                  const isSelected = (() => {
                    if (!expiresAt) return false
                    const selectedDate = new Date(expiresAt)
                    const now = new Date()
                    const diff = selectedDate.getTime() - now.getTime()
                    if (minutes) {
                      return Math.abs(diff - minutes * 60 * 1000) < 60000 // within 1 minute
                    }
                    if (hours) {
                      return Math.abs(diff - hours * 60 * 60 * 1000) < 60000 // within 1 minute
                    }
                    if (days) {
                      const diffDays = Math.round(diff / (1000 * 60 * 60 * 24))
                      return diffDays === days
                    }
                    return false
                  })()
                  
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        const date = new Date()
                        if (minutes) date.setMinutes(date.getMinutes() + minutes)
                        else if (hours) date.setHours(date.getHours() + hours)
                        else if (days) date.setDate(date.getDate() + days)
                        setExpiresAt(format(date, "yyyy-MM-dd'T'HH:mm"))
                      }}
                      className="px-2 py-1 rounded transition-all color-hover flex-shrink-0"
                      style={{
                        color: isSelected ? 'var(--color-text)' : 'var(--color-text-secondary)',
                        fontSize: '0.75rem',
                        fontWeight: isSelected ? '600' : '400',
                        width: '2.5rem',
                        textAlign: 'center'
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">User Membership Expires At (optional)</label>
              <p className="text-xs color-text-secondary mb-2">Users created from this invite will be automatically deleted after this date. Leave empty for permanent membership.</p>
              <DateTimePicker
                value={membershipExpiresAt}
                onChange={setMembershipExpiresAt}
                min={new Date()}
                placeholder="Select date and time (optional)"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">Sync on Join</label>
              <ToggleSwitch
                checked={syncOnJoin}
                onChange={() => setSyncOnJoin(!syncOnJoin)}
                disabled={!selectedGroupForCreate}
                title={selectedGroupForCreate ? "Automatically sync user addons when they join via this invite" : "Select a group to enable sync on join"}
              />
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

