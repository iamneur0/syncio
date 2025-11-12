import React from 'react'
import { Clapperboard, Tv, Library, Panda } from 'lucide-react'

interface CatalogItemProps {
  catalog: any
  isSelected: boolean
  onToggle: (catalog: any) => void
  showSearchInfo?: boolean
  disabled?: boolean
}

export default function CatalogItem({ catalog, isSelected, onToggle, showSearchInfo = false, disabled = false }: CatalogItemProps) {

  const getCatalogIcon = (catalog: any) => {
    const type = catalog.type?.toLowerCase() || ''
    switch (type) {
      case 'movie':
        return <Clapperboard className="w-5 h-5" />
      case 'series':
        return <Tv className="w-5 h-5" />
      case 'anime':
        return <Panda className="w-5 h-5" />
      case 'collection':
        return <Library className="w-5 h-5" />
      default:
        return <Library className="w-5 h-5" />
    }
  }

  const getCatalogLabel = (catalog: any) => {
    return catalog.name || catalog.type || 'Catalog'
  }

  const getCatalogTypeDisplay = (catalog: any) => {
    const type = catalog.type?.toLowerCase() || ''
    switch (type) {
      case 'movie':
        return 'Movie'
      case 'series':
        return 'Series'
      case 'anime':
        return 'Anime'
      case 'collection':
        return 'Collection'
      default:
        return 'Other'
    }
  }

  // Extract provider from catalog ID (format: X.provider.X)
  const getProviderFromId = (catalog: any) => {
    const id = catalog.id || catalog.name
    if (!id || typeof id !== 'string') return null
    const parts = id.split('.')
    if (parts.length === 3) {
      return parts[1] // Return the middle part (provider)
    }
    return null
  }

  const provider = getProviderFromId(catalog) || 'Other'

  return (
    <div 
      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
        disabled 
          ? 'cursor-not-allowed opacity-50' 
          : 'cursor-pointer hover:shadow-lg'
      } card card-selectable color-hover ${
        isSelected 
          ? 'card-selected'
          : ''
      }`}
      onClick={disabled ? undefined : () => onToggle(catalog)}
    >
      <div className="flex items-center flex-1 min-w-0">
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 icon-bg-default"
          title={getCatalogTypeDisplay(catalog)}
        >
          {getCatalogIcon(catalog)}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className={`font-medium text-sm`}>
            {getCatalogLabel(catalog)}
          </h4>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium color-surface color-text`}>
              {provider}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
