import React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { Captions, Play, BookOpen, Info, Search } from 'lucide-react'

interface ResourceItemProps {
  resource: any
  isSelected: boolean
  onToggle: (resource: any) => void
}

export default function ResourceItem({ resource, isSelected, onToggle }: ResourceItemProps) {
  const { isDark, isMono } = useTheme()

  const getResourceIcon = (resource: any) => {
    const kind = ((): string => {
      if (typeof resource === 'string') return resource.toLowerCase().trim()
      const val = (resource?.type || resource?.name || '').toString()
      return val.toLowerCase().trim()
    })()

    if (kind === 'stream' || kind === 'streams') return <Play className="w-5 h-5" />
    if (kind === 'subtitles' || kind === 'subtitle' || kind === 'subs') return <Captions className="w-5 h-5" />
    if (kind === 'catalog' || kind === 'catalogs') return <BookOpen className="w-5 h-5" />
    if (kind === 'meta' || kind === 'metadata') return <Info className="w-5 h-5" />
    if (kind === 'search') return <Search className="w-5 h-5" />

    return <BookOpen className="w-5 h-5" />
  }

  const getResourceLabel = (resource: any) => {
    if (typeof resource === 'string') {
      // Special case for search - keep it lowercase
      if (resource.toLowerCase() === 'search') {
        return 'search'
      }
      return resource.charAt(0).toUpperCase() + resource.slice(1)
    }
    
    return resource?.name || resource?.type || 'Resource'
  }

  const getResourceDescription = (resource: any) => {
    if (typeof resource === 'string') {
      switch (resource) {
        case 'stream':
          return 'Streaming content'
        case 'subtitles':
          return 'Subtitle files'
        case 'catalog':
          return 'Content catalog'
        case 'meta':
          return 'Metadata information'
        case 'search':
          return 'Search functionality'
        default:
          return 'Resource'
      }
    }
    
    if (resource?.type === 'catalog' || resource?.name === 'catalog') {
      return 'Content catalog for browsing'
    }
    if (resource?.type === 'stream') {
      return 'Streaming content provider'
    }
    if (resource?.type === 'meta') {
      return 'Metadata provider'
    }
    if (resource?.type === 'subtitles') {
      return 'Subtitle provider'
    }
    if (resource?.type === 'search') {
      return 'Search provider'
    }
    
    return 'Resource provider'
  }

  const isCatalog = (typeof resource === 'string' && resource === 'catalog') || 
                   (resource?.type === 'catalog' || resource?.name === 'catalog')

  return (
    <div 
      className={`flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer ${
        isDark ? 'bg-gray-600 hover:bg-gray-550' : 'bg-white hover:bg-gray-50'
      } border ${
        isSelected 
          ? (isMono ? 'ring-2 ring-white/50 border-white/40' : 'ring-2 ring-gray-400 border-gray-400')
          : 'border-transparent'
      }`}
      onClick={() => onToggle(resource)}
    >
      <div className="flex items-center flex-1 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 ${
          isMono ? 'bg-black text-white' : 'bg-gray-500 text-white'
        }`}>
          {getResourceIcon(resource)}
        </div>
            <div className="min-w-0 flex-1">
              <h4 className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {getResourceLabel(resource)}
              </h4>
            </div>
      </div>
    </div>
  )
}
