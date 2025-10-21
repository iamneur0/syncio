import toast from 'react-hot-toast'

/**
 * Utility functions for consistent error handling
 */

/**
 * Extract error message from various error formats
 */
export const getErrorMessage = (error: any, defaultMessage: string): string => {
  if (error?.response?.data?.message) {
    return error.response.data.message
  }
  if (error?.message) {
    return error.message
  }
  return defaultMessage
}

/**
 * Handle mutation errors with consistent toast messages
 */
export const handleMutationError = (error: any, defaultMessage: string) => {
  const message = getErrorMessage(error, defaultMessage)
  toast.error(message)
}

/**
 * Common error messages for different operations
 */
export const ERROR_MESSAGES = {
  CREATE_USER: 'Failed to create user',
  UPDATE_USER: 'Failed to update user',
  DELETE_USER: 'Failed to delete user',
  SYNC_USER: 'Failed to sync user',
  CREATE_GROUP: 'Failed to create group',
  UPDATE_GROUP: 'Failed to update group',
  DELETE_GROUP: 'Failed to delete group',
  CREATE_ADDON: 'Failed to create addon',
  UPDATE_ADDON: 'Failed to update addon',
  DELETE_ADDON: 'Failed to delete addon',
  RELOAD_ADDON: 'Failed to reload addon',
  GENERIC: 'An error occurred'
} as const

/**
 * Create error handlers for common operations
 */
export const createErrorHandler = (defaultMessage: string) => {
  return (error: any) => handleMutationError(error, defaultMessage)
}

/**
 * Error handlers for different entity types
 */
export const userErrorHandlers = {
  create: createErrorHandler(ERROR_MESSAGES.CREATE_USER),
  update: createErrorHandler(ERROR_MESSAGES.UPDATE_USER),
  delete: createErrorHandler(ERROR_MESSAGES.DELETE_USER),
  sync: createErrorHandler(ERROR_MESSAGES.SYNC_USER)
}

export const groupErrorHandlers = {
  create: createErrorHandler(ERROR_MESSAGES.CREATE_GROUP),
  update: createErrorHandler(ERROR_MESSAGES.UPDATE_GROUP),
  delete: createErrorHandler(ERROR_MESSAGES.DELETE_GROUP)
}

export const addonErrorHandlers = {
  create: createErrorHandler(ERROR_MESSAGES.CREATE_ADDON),
  update: createErrorHandler(ERROR_MESSAGES.UPDATE_ADDON),
  delete: createErrorHandler(ERROR_MESSAGES.DELETE_ADDON),
  reload: createErrorHandler(ERROR_MESSAGES.RELOAD_ADDON)
}
