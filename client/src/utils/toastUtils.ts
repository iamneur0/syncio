import toast from 'react-hot-toast'

/**
 * Utility functions for consistent toast messages
 */

/**
 * Show success toast with consistent formatting
 */
export const showSuccessToast = (action: string, entityType: string, count?: number) => {
  const entityText = count && count > 1 ? `${entityType}s` : entityType
  const message = count 
    ? `${count} ${entityText} ${action} successfully`
    : `${entityType} ${action} successfully`
  
  toast.success(message)
}

/**
 * Common success messages for different operations
 */
export const SUCCESS_MESSAGES = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
  SYNCED: 'synced',
  RELOADED: 'reloaded',
  CLONED: 'cloned',
  IMPORTED: 'imported',
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  INCLUDED: 'included',
  EXCLUDED: 'excluded'
} as const

/**
 * Entity-specific success handlers
 */
export const userSuccessHandlers = {
  create: () => showSuccessToast(SUCCESS_MESSAGES.CREATED, 'User'),
  update: () => showSuccessToast(SUCCESS_MESSAGES.UPDATED, 'User'),
  delete: () => showSuccessToast(SUCCESS_MESSAGES.DELETED, 'User'),
  sync: () => showSuccessToast(SUCCESS_MESSAGES.SYNCED, 'User'),
  bulkDelete: (count: number) => showSuccessToast(SUCCESS_MESSAGES.DELETED, 'user', count),
  toggle: (isActive: boolean) => showSuccessToast(
    isActive ? SUCCESS_MESSAGES.ENABLED : SUCCESS_MESSAGES.DISABLED, 
    'User'
  )
}

export const groupSuccessHandlers = {
  create: () => showSuccessToast(SUCCESS_MESSAGES.CREATED, 'Group'),
  update: () => showSuccessToast(SUCCESS_MESSAGES.UPDATED, 'Group'),
  delete: () => showSuccessToast(SUCCESS_MESSAGES.DELETED, 'Group'),
  bulkDelete: (count: number) => showSuccessToast(SUCCESS_MESSAGES.DELETED, 'group', count),
  toggle: (isActive: boolean) => showSuccessToast(
    isActive ? SUCCESS_MESSAGES.ENABLED : SUCCESS_MESSAGES.DISABLED, 
    'Group'
  )
}

export const addonSuccessHandlers = {
  create: () => showSuccessToast(SUCCESS_MESSAGES.CREATED, 'Addon'),
  update: () => showSuccessToast(SUCCESS_MESSAGES.UPDATED, 'Addon'),
  delete: () => showSuccessToast(SUCCESS_MESSAGES.DELETED, 'Addon'),
  reload: () => showSuccessToast(SUCCESS_MESSAGES.RELOADED, 'Addon'),
  clone: () => showSuccessToast(SUCCESS_MESSAGES.CLONED, 'Addon'),
  bulkDelete: (count: number) => showSuccessToast(SUCCESS_MESSAGES.DELETED, 'addon', count),
  toggle: (isActive: boolean) => showSuccessToast(
    isActive ? SUCCESS_MESSAGES.ENABLED : SUCCESS_MESSAGES.DISABLED, 
    'Addon'
  )
}

/**
 * Generic success handlers for common operations
 */
export const genericSuccessHandlers = {
  reload: (entityType: string, count?: number, failed?: number) => {
    if (count !== undefined && failed !== undefined) {
      toast.success(`${count}/${count + failed} ${entityType}s reloaded successfully (${failed} failed)`)
    } else if (count !== undefined) {
      toast.success(`${count} ${entityType}s reloaded successfully`)
    } else {
      toast.success(`${entityType} reloaded successfully`)
    }
  },
  import: (entityType: string, count?: number) => {
    if (count !== undefined) {
      toast.success(`${count} ${entityType}s imported successfully`)
    } else {
      toast.success(`${entityType} imported successfully`)
    }
  },
  sync: (entityType: string) => {
    toast.success(`${entityType} synced successfully`)
  },
  bulkSync: (entityType: string, count: number) => {
    toast.success(`All ${entityType}s synced successfully`)
  }
}
