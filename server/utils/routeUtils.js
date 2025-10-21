/**
 * Utility functions for server routes to reduce duplication
 */

/**
 * Validate that an entity exists and return it
 */
const validateEntityExists = async (prisma, entityType, id, accountId) => {
  const entity = await prisma[entityType].findUnique({
    where: { 
      id, 
      accountId 
    }
  })
  
  if (!entity) {
    throw new Error(`${entityType} not found`)
  }
  
  return entity
}

/**
 * Standardized error responses
 */
const sendNotFound = (res, entityType) => {
  return res.status(404).json({ message: `${entityType} not found` })
}

const sendBadRequest = (res, message) => {
  return res.status(400).json({ message })
}

const sendInternalError = (res, message = 'Internal server error') => {
  return res.status(500).json({ message })
}

/**
 * Common route handlers with error handling
 */
const createRouteHandler = (handler) => {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (error) {
      console.error('Route error:', error)
      
      if (error.message.includes('not found')) {
        const entityType = error.message.split(' ')[0]
        return sendNotFound(res, entityType)
      }
      
      if (error.message.includes('already exists')) {
        return sendBadRequest(res, error.message)
      }
      
      return sendInternalError(res, error.message)
    }
  }
}

/**
 * Entity validation middleware
 */
const validateEntity = (entityType) => {
  return async (req, res, next) => {
    try {
      const { id } = req.params
      const accountId = req.appAccountId || req.accountId
      
      if (!id) {
        return sendBadRequest(res, `${entityType} ID is required`)
      }
      
      const entity = await validateEntityExists(prisma, entityType, id, accountId)
      req.entity = entity
      next()
    } catch (error) {
      if (error.message.includes('not found')) {
        return sendNotFound(res, entityType)
      }
      return sendInternalError(res, error.message)
    }
  }
}

/**
 * Common response patterns
 */
const responseUtils = {
  success: (res, data, message) => {
    return res.json({ 
      success: true, 
      message, 
      data 
    })
  },
  
  created: (res, data, message) => {
    return res.status(201).json({ 
      success: true, 
      message, 
      data 
    })
  },
  
  notFound: (res, entityType) => {
    return sendNotFound(res, entityType)
  },
  
  badRequest: (res, message) => {
    return sendBadRequest(res, message)
  },
  
  internalError: (res, message) => {
    return sendInternalError(res, message)
  }
}

/**
 * Common validation functions
 */
const validationUtils = {
  validateRequired: (fields, req) => {
    const missing = fields.filter(field => !req.body[field])
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`)
    }
  },
  
  validateEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email address')
    }
  },
  
  validateId: (id) => {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new Error('Invalid ID provided')
    }
  }
}

/**
 * Common database operations
 */
const dbUtils = {
  findEntity: async (prisma, entityType, id, accountId) => {
    return await prisma[entityType].findUnique({
      where: { id, accountId }
    })
  },
  
  findEntityWithRelations: async (prisma, entityType, id, accountId, include = {}) => {
    return await prisma[entityType].findUnique({
      where: { id, accountId },
      include
    })
  },
  
  updateEntity: async (prisma, entityType, id, data, accountId) => {
    return await prisma[entityType].update({
      where: { id, accountId },
      data
    })
  },
  
  deleteEntity: async (prisma, entityType, id, accountId) => {
    return await prisma[entityType].delete({
      where: { id, accountId }
    })
  }
}

module.exports = {
  validateEntityExists,
  sendNotFound,
  sendBadRequest,
  sendInternalError,
  createRouteHandler,
  validateEntity,
  responseUtils,
  validationUtils,
  dbUtils
}
