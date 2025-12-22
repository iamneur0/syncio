import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, User, Share2 } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useQuery } from '@tanstack/react-query'
import { usersAPI } from '@/services/api'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { EntityList } from '@/components/entities'
import UserAvatar from '@/components/ui/UserAvatar'
import toast from 'react-hot-toast'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string
  items: Array<{ itemId: string; itemName?: string; itemType?: string; poster?: string }>
  onShareComplete?: () => void
  existingShares?: Array<{ sharedWithUserId: string; itemId: string }>
}

export default function ShareModal({ 
  isOpen, 
  onClose, 
  userId,
  items,
  onShareComplete,
  existingShares = []
}: ShareModalProps) {
  const { hideSensitive, theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [isSharing, setIsSharing] = useState(false)

  useBodyScrollLock(isOpen)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('')
      setSelectedUserIds([])
    }
  }, [isOpen])

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

  // Fetch group members
  const { data: groupData, isLoading } = useQuery({
    queryKey: ['group-members', userId],
    queryFn: () => usersAPI.getGroupMembers(userId),
    enabled: isOpen && !!userId
  })

  const groupMembers = groupData?.members || []

  // Filter users based on search term
  const filteredUsers = groupMembers.filter((user: any) => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    return user.username?.toLowerCase().includes(searchLower) ||
           user.email?.toLowerCase().includes(searchLower)
  })

  // Check if a user already has all selected items shared with them
  const isAlreadySharedWithUser = (targetUserId: string) => {
    if (!existingShares.length || !items.length) return false
    // Check if ALL items are already shared with this user
    return items.every(item => 
      existingShares.some(share => 
        share.sharedWithUserId === targetUserId && 
        (share.itemId === item.itemId || share.itemId.split(':')[0] === item.itemId.split(':')[0])
      )
    )
  }

  const handleShare = async () => {
    if (selectedUserIds.length === 0 || items.length === 0) return

    setIsSharing(true)
    try {
      const result = await usersAPI.shareItems(userId, items, selectedUserIds)
      
      if (result.success) {
        toast.success(`Shared ${items.length} item${items.length > 1 ? 's' : ''} with ${selectedUserIds.length} user${selectedUserIds.length > 1 ? 's' : ''}`)
        onShareComplete?.()
        onClose()
      } else {
        toast.error(result.error || 'Failed to share items')
      }
    } catch (error: any) {
      console.error('Failed to share items:', error)
      toast.error(error?.response?.data?.error || error?.message || 'Failed to share items')
    } finally {
      setIsSharing(false)
    }
  }

  const handleItemClick = (userId: string) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId)
      } else {
        return [...prev, userId]
      }
    })
  }

  if (!isOpen || !mounted || typeof window === 'undefined' || !document.body) {
    return null
  }

  const renderUserItem = (user: any) => {
    const isSelected = selectedUserIds.includes(user.id)
    const alreadyShared = isAlreadySharedWithUser(user.id)
    return (
      <div 
        className={`p-3 rounded-lg transition-colors card ${
          alreadyShared 
            ? 'opacity-50 cursor-not-allowed' 
            : `cursor-pointer card-selectable color-hover hover:shadow-lg ${isSelected ? 'card-selected' : ''}`
        }`}
        onClick={() => !alreadyShared && handleItemClick(user.id)}
        title={alreadyShared ? 'Already shared with this user' : undefined}
      >
        <div className="flex items-center gap-3">
          <UserAvatar
            email={user.email}
            username={user.username}
            colorIndex={user.colorIndex || 0}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <h4 className={`font-medium truncate ${alreadyShared ? 'color-text-secondary' : ''}`}>
              {user.username || 'No username'}
              {alreadyShared && <span className="text-xs ml-2">(already shared)</span>}
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
            <div>
              <h2 className={`text-xl font-bold`}>
                Share {items.length} item{items.length > 1 ? 's' : ''}
              </h2>
              <p className={`text-sm color-text-secondary mt-1`}>
                Select users from your group to share with
              </p>
            </div>
            <button
              onClick={onClose}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-0 color-hover`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 color-text-secondary`} />
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
              emptyMessage={searchTerm ? 'No users found matching your search' : 'No users in your group'}
              getIsSelected={(user) => selectedUserIds.includes(user.id)}
              onClearSelection={() => setSelectedUserIds([])}
              layout="vertical"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              disabled={isSharing}
              className={`px-4 py-2 rounded-lg transition-colors color-hover`}
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              disabled={selectedUserIds.length === 0 || isSharing}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                selectedUserIds.length > 0 && !isSharing
                  ? 'color-surface'
                  : 'color-surface color-text-secondary cursor-not-allowed'
              }`}
            >
              <Share2 className="w-4 h-4" />
              {isSharing ? 'Sharing...' : `Share with ${selectedUserIds.length > 0 ? `${selectedUserIds.length} user${selectedUserIds.length > 1 ? 's' : ''}` : 'users'}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}


