import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, User } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery } from '@tanstack/react-query'
import { usersAPI } from '@/services/api'
import { getEntityColorStyles } from '@/utils/colorMapping'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { EntityList } from '@/components/entities'

interface UserSelectModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectUser: (user: any) => void
  groupId: string
  excludeUserIds?: string[]
}

export default function UserSelectModal({ 
  isOpen, 
  onClose, 
  onSelectUser,
  groupId,
  excludeUserIds = []
}: UserSelectModalProps) {
  const { hideSensitive, theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])

  useBodyScrollLock(isOpen)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.stopPropagation()
        e.preventDefault()
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape, { capture: true })
      return () => document.removeEventListener('keydown', handleEscape, { capture: true })
    }
  }, [isOpen, onClose])

  // Fetch all users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersAPI.getAll(),
    enabled: isOpen
  })

  // Filter users based on search term and exclude already added users
  const filteredUsers = users.filter((user: any) => {
    const matchesSearch = !searchTerm || 
      user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const notExcluded = !excludeUserIds.includes(user.id)
    
    return matchesSearch && notExcluded
  })

  const handleSelect = async () => {
    if (selectedUserIds.length > 0) {
      const selectedUsers = users.filter((u: any) => selectedUserIds.includes(u.id))
      
      // Process all users sequentially to avoid race conditions
      for (const user of selectedUsers) {
        await onSelectUser(user)
      }
      
      onClose()
    }
  }

  const handleItemClick = (userId: string) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) {
        // If already selected, remove it
        return prev.filter(id => id !== userId)
      } else {
        // If not selected, add it
        return [...prev, userId]
      }
    })
  }

  if (!isOpen || !mounted || typeof window === 'undefined' || !document.body) {
    return null
  }

  const renderUserItem = (user: any) => {
    const colorStyles = getEntityColorStyles(theme, user.colorIndex || 0)
    const isSelected = selectedUserIds.includes(user.id)
    return (
    <div 
        className={`p-3 rounded-lg cursor-pointer transition-colors card card-selectable color-hover hover:shadow-lg ${
          isSelected ? 'card-selected' : ''
        }`}
      onClick={() => handleItemClick(user.id)}
    >
      <div className="flex items-center gap-3">
        <div 
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ 
              background: colorStyles.background,
              color: colorStyles.textColor,
            }}
        >
            <span className="font-semibold text-sm" style={{ color: colorStyles.textColor }}>
            {(user.username || user.email || 'U').charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium truncate`}>
            {user.username || 'No username'}
          </h4>
          <p className={`text-sm truncate color-text-secondary ${hideSensitive ? 'blur-sm select-none' : ''}`}>
            {hideSensitive ? '••••••••' : (user.email || 'No email')}
          </p>
        </div>
      </div>
    </div>
  )
  }

  return createPortal(
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1000] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div 
        className={`w-full max-w-2xl max-h-[80vh] rounded-lg shadow-xl card`}
        style={{ background: 'var(--color-background)' }}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-xl font-bold`}>
              Add User to Group
            </h2>
            <button
              onClick={onClose}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 color-hover`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
              'color-text-secondary'
            }`} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-lg input`}
            />
          </div>

          {/* EntityList */}
          <div className="max-h-96 overflow-y-auto">
            <EntityList
              title=""
              count={filteredUsers.length}
              items={filteredUsers}
              isLoading={isLoading}
              renderItem={renderUserItem}
              emptyIcon={<User className={`w-12 h-12 mx-auto mb-4 color-text-secondary`} />}
              emptyMessage={searchTerm ? 'No users found matching your search' : 'No users available to add'}
              getIsSelected={(user) => selectedUserIds.includes(user.id)}
              onClearSelection={() => setSelectedUserIds([])}
              layout="vertical"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg transition-colors color-hover`}
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              disabled={selectedUserIds.length === 0}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedUserIds.length > 0
                  ? 'color-surface'
                  : 'color-surface color-text-secondary cursor-not-allowed'
              }`}
            >
              Add to Group {selectedUserIds.length > 0 && `(${selectedUserIds.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
