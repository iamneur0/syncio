import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { SyncBadge } from './'
import { getColorBgClass, getColorHexValue } from '@/utils/colorMapping'
import { X } from 'lucide-react'

interface MemberItemProps {
  member: {
    id: string
    username?: string
    email?: string
    colorIndex?: number
  }
  groupId: string
  onRemove: (id: string) => void
  onSync: (userId: string, groupId: string) => void
}

export default function MemberItem({ member, groupId, onRemove, onSync }: MemberItemProps) {
  const { isDark, isMono, hideSensitive } = useTheme()

  return (
    <div
      className={`relative rounded-lg border p-4 hover:shadow-md transition-all ${
        isDark 
          ? 'bg-gray-600 border-gray-500 hover:bg-gray-550' 
          : 'bg-white border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center flex-1 min-w-0">
          <div 
            className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${
              getColorBgClass(member.colorIndex || 0, isMono ? 'mono' : isDark ? 'dark' : 'light')
            }`}
            style={{ backgroundColor: getColorHexValue(member.colorIndex || 0, isMono ? 'mono' : isDark ? 'dark' : 'light') }}
          >
            <span className="text-white font-semibold text-sm">
              {member.username ? member.username.charAt(0).toUpperCase() : 
               member.email ? member.email.charAt(0).toUpperCase() : 'U'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {member.username || member.email}
              </h4>
              <SyncBadge 
                userId={member.id} 
                groupId={groupId}
                onSync={() => onSync(member.id, groupId)}
                isSyncing={false}
              />
            </div>
            <p className={`text-sm truncate ${isDark ? 'text-gray-400' : 'text-gray-500'} ${hideSensitive ? 'blur-sm select-none' : ''}`}>
              {hideSensitive ? '••••••••' : (member.email || 'No email')}
            </p>
          </div>
        </div>
        <button
          onClick={() => onRemove(member.id)}
          className={`p-2 rounded-lg border-0 outline-none focus:outline-none focus:ring-0 transition-colors ${
            isDark 
              ? 'text-red-400 hover:bg-red-900/20' 
              : 'text-red-600 hover:bg-red-50'
          }`}
          title="Remove member from group"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
