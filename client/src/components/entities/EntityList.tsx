import React from 'react'
import { SyncBadge } from '@/components/ui'
import { ConfirmDialog } from '@/components/modals'

interface ButtonConfig {
  type: 'exclude' | 'protect' | 'delete' | 'remove' | 'sync'
  onClick: (id: string) => void
  isActive?: (item: any) => boolean
  icon: React.ReactNode
  tooltip: string
}

interface EntityListProps {
  title: string
  count: number
  items: any[]
  isLoading?: boolean
  onClear?: () => void
  onRemove?: (id: string) => void
  onReorder?: (items: any[]) => void
  isDraggable?: boolean
  renderItem: (item: any, index: number) => React.ReactNode
  emptyIcon: React.ReactNode
  emptyMessage: string
  children?: React.ReactNode
  // Button configuration for different entity types
  buttons?: ButtonConfig[]
  // Action button (like + button)
  actionButton?: {
    icon: React.ReactNode
    onClick: () => void
    tooltip: string
  }
  // Optional custom right-side header content (e.g., selectors)
  headerRight?: React.ReactNode
  showSyncBadge?: boolean
  syncBadgeProps?: {
    userId?: string
    groupId?: string
    onSync?: (userId: string, groupId: string) => void
  }
  // Layout options
  layout?: 'vertical' | 'grid'
  // Confirmation dialog for reset action
  confirmReset?: {
    title?: string
    description?: string
    confirmText?: string
    isDanger?: boolean
  }
  // Optional: supply a predicate to tell EntityList when an item is selected
  getIsSelected?: (item: any) => boolean
  // Optional: callback to clear all selections when clicking on empty space
  onClearSelection?: () => void
}

export default function EntityList({
  title,
  count,
  items,
  isLoading = false,
  onClear,
  onRemove,
  onReorder,
  isDraggable = false,
  renderItem,
  emptyIcon,
  emptyMessage,
  children,
  buttons = [],
  actionButton,
  headerRight,
  showSyncBadge = false,
  syncBadgeProps,
  layout = 'vertical',
  confirmReset,
  getIsSelected,
  onClearSelection
}: EntityListProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  // Helper function to render action buttons
  const renderActionButtons = (item: any) => {
    if (buttons.length === 0) return null

    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        {buttons.map((button, index) => {
          const isActive = button.isActive ? button.isActive(item) : false
          const itemId = item.id || item.manifestUrl || item.transportUrl || item.url || 'unknown'
          
          return (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation()
                button.onClick(itemId)
              }}
              className={`p-2 rounded-lg transition-colors ${
                isActive
                  ? 'color-text color-hover'
                  : 'color-text-secondary color-hover'
              }`}
              title={button.tooltip}
            >
              {button.icon}
            </button>
          )
        })}
      </div>
    )
  }

  const handleContainerClick = (e: React.MouseEvent) => {
    // Only clear selection if clicking on the container itself, not on items
    if (e.target === e.currentTarget && onClearSelection) {
      onClearSelection()
    }
  }

  return (
    <div
      className={`p-4 rounded-lg mb-6 section-panel ${onClearSelection ? 'cursor-pointer' : ''}`}
      onClick={handleContainerClick}
    >
      <div className="flex items-center justify-between mb-3">
        {title && (
          <h3 className={`text-lg font-semibold`}>
            {count > 0 && `${count} `}{title}
          </h3>
        )}
        <div className="flex items-center gap-2">
          {headerRight}
          {actionButton && (
            <button
              onClick={actionButton.onClick}
              className={`p-2 rounded-lg transition-colors color-hover`}
              title={actionButton.tooltip}
            >
              {actionButton.icon}
            </button>
          )}
          {items.length > 0 && onClear && (
            <button
              onClick={() => setConfirmOpen(true)}
              className={`px-3 py-1 text-sm rounded transition-colors color-hover`}
              title={`Reset ${title.toLowerCase()} to default`}
            >
              Reset
            </button>
          )}
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 color-border"></div>
        </div>
      ) : items.length > 0 ? (
        <div className={layout === 'grid' ? 'grid [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] gap-3 max-w-full' : 'space-y-3'}>
          {isDraggable && children ? (
            children
          ) : (
            items.map((item, index) => {
              // If we have buttons configured, render a standard item with buttons
              if (buttons.length > 0) {
                return (
                  <div
                    key={`${item.id || item.manifestUrl || item.transportUrl || index}::${index}`}
                    className={`relative rounded-lg border p-4 hover:shadow-md transition-all card`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center flex-1 min-w-0">
                        {/* Item content - this would need to be customized per entity type */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className={`font-medium truncate`}>
                              {item.name || item.username || item.email || 'Unknown'}
                            </h4>
                            {showSyncBadge && syncBadgeProps && (
                            <SyncBadge
                              userId={syncBadgeProps.userId || item.id}
                              groupId={syncBadgeProps.groupId}
                              onSync={(id: string) => syncBadgeProps.onSync?.(id, syncBadgeProps.groupId as any)}
                              isSyncing={false}
                            />
                            )}
                          </div>
                          <p className={`text-sm truncate color-text-secondary`}>
                            {item.description || item.email || 'No description'}
                          </p>
                        </div>
                      </div>
                      {renderActionButtons(item)}
                    </div>
                  </div>
                )
              }
              // Otherwise use the custom renderItem function, optionally wrapping with a selection ring
              const isSelected = typeof getIsSelected === 'function' ? !!getIsSelected(item) : false
              const wrapperClass = isSelected ? 'card-selected' : ''

              return (
                <div
                  key={`${item.id || item.manifestUrl || item.transportUrl || index}::${index}`}
                  className={`${wrapperClass}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {renderItem(item, index)}
                </div>
              )
            })
          )}
        </div>
      ) : (
        <div className="text-center py-8">
          {emptyIcon}
          <p className={`color-text-secondary`}>
            {emptyMessage}
          </p>
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title={confirmReset?.title || `Reset ${title}?`}
        description={confirmReset?.description || `This will reset ${title.toLowerCase()} to default. This cannot be undone.`}
        confirmText={confirmReset?.confirmText || 'Reset'}
        isDanger={confirmReset?.isDanger !== false}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          const result = onClear?.()
          if (result && typeof (result as any).then === 'function') {
            ;(result as Promise<any>).finally(() => setConfirmOpen(false))
          } else {
            setConfirmOpen(false)
          }
        }}
      />
    </div>
  )
}
