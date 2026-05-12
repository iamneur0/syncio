'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { FilterTabs, FilterTabsResponsive, FilterTabOption } from './FilterTabs';
import { SearchInput } from './Input';
import { SelectAllCheckbox } from './SelectAllCheckbox';
import { ViewModeToggle } from './ViewModeToggle';
import { Card } from './Card';

export interface PageToolbarSelectionConfig {
  totalCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export interface PageToolbarSearchConfig {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export interface PageToolbarFilterConfig {
  options: FilterTabOption[];
  activeKey: string;
  onChange: (key: string) => void;
  /** Unique layout ID for Framer Motion (use different IDs for multiple toolbars) */
  layoutId?: string;
  /** Control visibility for animated show/hide (defaults to true) */
  visible?: boolean;
}

export interface PageToolbarPrimaryTabsConfig {
  options: FilterTabOption[];
  activeKey: string;
  onChange: (key: string) => void;
  /** Unique layout ID for Framer Motion */
  layoutId?: string;
}

export interface PageToolbarViewConfig {
  mode: 'grid' | 'list';
  onChange: (mode: 'grid' | 'list') => void;
  showLabels?: boolean;
}

export interface PageToolbarProps {
  /** Selection checkbox configuration */
  selectionConfig?: PageToolbarSelectionConfig;
  
  /** Search input configuration */
  searchConfig?: PageToolbarSearchConfig;
  
  /** Primary navigation tabs (larger, always visible) - used for top-level view switching */
  primaryTabs?: PageToolbarPrimaryTabsConfig;
  
  /** Filter tabs configuration (smaller, can be conditionally shown) */
  filterTabs?: PageToolbarFilterConfig;
  
  /** View mode toggle configuration (grid/list) */
  viewModeConfig?: PageToolbarViewConfig;
  
  /** Additional actions to render on the right side (before view toggle) */
  rightActions?: React.ReactNode;
  
  /** Custom content for the left section (replaces selection + search) */
  leftContent?: React.ReactNode;
  
  /** Custom content for the center section (replaces filter tabs) */
  centerContent?: React.ReactNode;
  
  /** Custom content for the right section (replaces view toggle + actions) */
  rightContent?: React.ReactNode;
  
  /** Visual variant */
  variant?: 'default' | 'card';
  
  /** Additional CSS classes */
  className?: string;
  
  /** Whether to animate on mount */
  animate?: boolean;
  
  /** Animation delay (in seconds) */
  animationDelay?: number;
}

/**
 * PageToolbar - A unified toolbar component for management pages
 * 
 * Features:
 * - 3-column responsive grid layout
 * - Optional selection checkbox with count
 * - Search input with consistent sizing
 * - Primary tabs for top-level navigation (larger, with icons)
 * - Filter tabs with animated sliding indicator (smaller, contextual)
 * - Grid/List view toggle
 * - Support for custom content in any section
 * - Card variant for visual separation
 * 
 * @example
 * ```tsx
 * <PageToolbar
 *   searchConfig={{
 *     value: searchQuery,
 *     onChange: setSearchQuery,
 *     placeholder: "Search items...",
 *   }}
 *   primaryTabs={{
 *     options: [
 *       { key: 'watch', label: 'Watch', icon: <PlayIcon /> },
 *       { key: 'tasks', label: 'Tasks', icon: <ClockIcon /> },
 *     ],
 *     activeKey: viewMode,
 *     onChange: setViewMode,
 *   }}
 *   filterTabs={{
 *     options: [{ key: 'all', label: 'All' }, { key: 'active', label: 'Active' }],
 *     activeKey: filter,
 *     onChange: setFilter,
 *     visible: viewMode === 'watch', // Only show when watch is active
 *   }}
 *   viewModeConfig={{
 *     mode: viewMode,
 *     onChange: setViewMode,
 *   }}
 * />
 * ```
 */
export function PageToolbar({
  selectionConfig,
  searchConfig,
  primaryTabs,
  filterTabs,
  viewModeConfig,
  rightActions,
  leftContent,
  centerContent,
  rightContent,
  variant = 'default',
  className = '',
  animate = true,
  animationDelay = 0,
}: PageToolbarProps) {
  const hasLeftSection = leftContent || selectionConfig || searchConfig;
  const hasCenterSection = centerContent || primaryTabs || filterTabs;
  const hasRightSection = rightContent || rightActions || viewModeConfig;
  
  // Determine if filter tabs should be visible
  const showFilterTabs = filterTabs && filterTabs.visible !== false;

  const toolbarContent = (
    <div className="flex flex-row items-center justify-between gap-2 min-h-[40px] max-w-full">
      {/* Left Section: Selection + Search + Filter */}
      <div className="flex items-center gap-2 shrink min-w-0">
        {leftContent ? (
          leftContent
        ) : (
          <>
            {selectionConfig && (
              <SelectAllCheckbox
                totalCount={selectionConfig.totalCount}
                selectedCount={selectionConfig.selectedCount}
                onSelectAll={selectionConfig.onSelectAll}
                onDeselectAll={selectionConfig.onDeselectAll}
                title={
                  selectionConfig.selectedCount === 0
                    ? 'Select all'
                    : selectionConfig.selectedCount === selectionConfig.totalCount
                      ? 'Deselect all'
                      : 'Deselect all'
                }
              />
            )}
            {searchConfig && (
              <div className="min-w-[100px] max-w-[200px] sm:min-w-[120px] sm:max-w-[240px] md:min-w-[140px] md:max-w-[280px] lg:min-w-[180px] lg:max-w-[320px] shrink">
                <SearchInput
                  size="sm"
                  value={searchConfig.value}
                  onChange={(e) => searchConfig.onChange(e.target.value)}
                  placeholder={searchConfig.placeholder || 'Search...'}
                />
              </div>
            )}
            {/* Filter - component handles showing dropdown on mobile, tabs on desktop */}
            {filterTabs && (
              <FilterTabsResponsive
                options={filterTabs.options}
                activeKey={filterTabs.activeKey}
                onChange={filterTabs.onChange}
                layoutId={filterTabs.layoutId}
                size="sm"
              />
            )}
          </>
        )}
      </div>

      {/* Right Section: Primary Tabs (if any) + View Toggle */}
      <div className="flex items-center gap-2 shrink-0">
        {centerContent ? (
          centerContent
        ) : (
          <>
            {/* Primary Tabs (larger tabs for top-level navigation) - show on desktop only */}
            {primaryTabs && (
              <div className="hidden md:block">
                <FilterTabs
                  options={primaryTabs.options}
                  activeKey={primaryTabs.activeKey}
                  onChange={primaryTabs.onChange}
                  layoutId={primaryTabs.layoutId || 'primary-tabs'}
                  size="md"
                />
              </div>
            )}

            {/* Filter tabs that accompany primary tabs - component handles mobile/desktop */}
            {primaryTabs && showFilterTabs && (
              <AnimatePresence mode="wait">
                <motion.div
                  initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                  animate={{ opacity: 1, width: 'auto', marginLeft: 12 }}
                  exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="flex items-center gap-3 overflow-hidden"
                >
                  <div className="h-6 w-px bg-default/50 shrink-0 hidden md:block" />
                  <FilterTabsResponsive
                    options={filterTabs.options}
                    activeKey={filterTabs.activeKey}
                    onChange={filterTabs.onChange}
                    layoutId={filterTabs.layoutId || 'filter-tabs'}
                    size="sm"
                  />
                </motion.div>
              </AnimatePresence>
            )}
          </>
        )}
      </div>

      {/* Right Section: Actions + View Toggle */}
      <div className="flex justify-end items-center gap-2 shrink-0">
        {rightContent ? (
          rightContent
        ) : (
          <>
            {rightActions}
            {viewModeConfig && (
              <ViewModeToggle
                mode={viewModeConfig.mode}
                onChange={viewModeConfig.onChange}
                showLabels={viewModeConfig.showLabels ?? false}
              />
            )}
          </>
        )}
      </div>
    </div>
  );

  // Wrap in motion div for animation
  const animatedContent = animate ? (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: animationDelay }}
      className={`mb-8 ${className}`}
    >
      {toolbarContent}
    </motion.div>
  ) : (
    <div className={`mb-8 ${className}`}>{toolbarContent}</div>
  );

  // Wrap in Card if variant is 'card'
  if (variant === 'card') {
    return (
      <div className={`mb-6 ${className}`}>
        {animate ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: animationDelay }}
          >
            <Card padding="md">
              {toolbarContent}
            </Card>
          </motion.div>
        ) : (
          <Card padding="md">
            {toolbarContent}
          </Card>
        )}
      </div>
    );
  }

  return animatedContent;
}

/**
 * PageToolbarCompact - A simplified single-row toolbar for pages with minimal filtering needs
 */
export function PageToolbarCompact({
  searchConfig,
  viewModeConfig,
  rightActions,
  className = '',
}: Pick<PageToolbarProps, 'searchConfig' | 'viewModeConfig' | 'rightActions' | 'className'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center justify-between gap-4 mb-8 ${className}`}
    >
      {/* Search */}
      {searchConfig && (
        <div className="flex-1 max-w-md">
          <SearchInput
            size="sm"
            value={searchConfig.value}
            onChange={(e) => searchConfig.onChange(e.target.value)}
            placeholder={searchConfig.placeholder || 'Search...'}
          />
        </div>
      )}

      {/* Right side */}
      <div className="flex items-center gap-2">
        {rightActions}
        {viewModeConfig && (
          <ViewModeToggle
            mode={viewModeConfig.mode}
            onChange={viewModeConfig.onChange}
            showLabels={false}
          />
        )}
      </div>
    </motion.div>
  );
}
