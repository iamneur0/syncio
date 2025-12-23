import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { SyncBadge } from '@/components/ui'
import UserAvatar from '@/components/ui/UserAvatar'
import { X } from 'lucide-react'

interface UserItemProps {
  user: {
    id: string
    username?: string
    email?: string
    colorIndex?: number
  }
  groupId: string
  onRemove: (id: string) => void
  onSync: (userId: string, groupId: string) => void
}

export default function UserItem({ user, groupId, onRemove, onSync }: UserItemProps) {
  const { hideSensitive } = useTheme()

  return (
    <div
      className={`relative rounded-lg card card-selectable p-4 hover:shadow-lg transition-all`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center flex-1 min-w-0">
          <div className="mr-3 flex-shrink-0">
            <UserAvatar
              email={user.email}
              username={user.username}
              colorIndex={user.colorIndex}
              size="sm"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-medium truncate`}>
                {user.username || user.email}
              </h4>
              <SyncBadge 
                userId={user.id} 
                groupId={groupId}
                onSync={() => onSync(user.id, groupId)}
                isSyncing={false}
              />
            </div>
            <p className={`text-sm truncate ${hideSensitive ? 'blur-sm select-none' : ''}`}>
              {hideSensitive ? '••••••••' : (user.email || 'No email')}
            </p>
          </div>
        </div>
        <button
          onClick={() => onRemove(user.id)}
          className={`p-2 rounded-lg border-0 outline-none focus:outline-none focus:ring-0 transition-colors color-text color-hover`}
          title="Remove user from group"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
