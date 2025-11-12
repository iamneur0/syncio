import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { SyncBadge } from '@/components/ui'
import { getEntityColorStyles } from '@/utils/colorMapping'
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
  const { hideSensitive, theme } = useTheme()
  const colorStyles = getEntityColorStyles(theme, user.colorIndex || 0)

  return (
    <div
      className={`relative rounded-lg card card-selectable p-4 hover:shadow-lg transition-all`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center flex-1 min-w-0">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center mr-3 flex-shrink-0"
            style={{ 
              background: colorStyles.background, 
              color: colorStyles.textColor,
            }}
          >
            <span 
              className="font-semibold text-sm"
              style={{ color: colorStyles.textColor }}
            >
              {user.username ? user.username.charAt(0).toUpperCase() : 
               user.email ? user.email.charAt(0).toUpperCase() : 'U'}
            </span>
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
