/**
 * Global Account Scoping Middleware
 * 
 * This middleware automatically adds accountId filters to all Prisma queries
 * for routes that require account isolation. This prevents cross-account
 * data access at the database level.
 */

const { PrismaClient } = require('@prisma/client')

// Create a proxy around Prisma Client to intercept queries
function createAccountScopedPrisma(originalPrisma, accountId) {
  return new Proxy(originalPrisma, {
    get(target, prop) {
      const originalMethod = target[prop]
      
      // Only intercept model methods (user, group, addon, etc.)
      // Exclude models that don't have accountId
      const unscopedModels = ['appAccount', 'groupAddon']
      if (typeof originalMethod === 'object' && originalMethod !== null && !unscopedModels.includes(prop)) {
        if (typeof prop === 'string' && prop !== 'constructor' && !prop.startsWith('_')) {
           // console.log(`🔍 Scoping Prisma model: ${prop}`)
        }
        return new Proxy(originalMethod, {
          get(modelTarget, methodName) {
            const originalQuery = modelTarget[methodName]
            
            if (typeof originalQuery === 'function') {
              return function(...args) {
                // For findUnique, we must switch to findFirst if we're adding accountId
                // because findUnique only allows unique fields.
                const queryMethod = methodName === 'findUnique' ? 'findFirst' : methodName;
                const queryFn = modelTarget[queryMethod];

                // Add accountId filter to the query
                const [queryArgs] = args
                
                if (queryArgs && typeof queryArgs === 'object') {
                  // For findUnique, findFirst, findMany, etc.
                  if (queryArgs.where) {
                    queryArgs.where.accountId = accountId
                  } else {
                    queryArgs.where = { accountId }
                  }
                } else {
                  // If no query args, create them
                  args[0] = { where: { accountId } }
                }
                
                return queryFn.apply(this, args)
              }
            }
            
            return originalQuery
          }
        })
      }
      
      return originalMethod
    }
  })
}

// Override the global prisma instance for account scoping
function overrideGlobalPrisma(prismaInstance, accountId) {
  const scopedPrisma = createAccountScopedPrisma(prismaInstance, accountId)
  
  // Override the global prisma instance
  const originalPrisma = global.prisma
  global.prisma = scopedPrisma
  
  return function restoreGlobalPrisma() {
    global.prisma = originalPrisma
  }
}

/**
 * Account Scoping Middleware Factory
 * 
 * This middleware should be applied to routes that require account isolation:
 * - /api/groups/*
 * - /api/users/* 
 * - /api/addons/*
 */
function createAccountScopingMiddleware(prismaInstance) {
  return function accountScopingMiddleware(req, res, next) {
    // Skip if no accountId and auth is disabled
    if (!req.appAccountId) {
      // If instance is private, use default account ID
      const { INSTANCE_TYPE } = require('../utils/config')
      if (INSTANCE_TYPE !== 'public') {
        req.appAccountId = 'default'
      } else {
        console.error('🚨 Account scoping middleware called without appAccountId!')
        return res.status(401).json({ error: 'Authentication required' })
      }
    }
    
    // Override global prisma instance with account-scoped version
    const restorePrisma = overrideGlobalPrisma(prismaInstance, req.appAccountId)
    
    // Store restore function on request for cleanup
    req._restorePrisma = restorePrisma
    
    // console.log(`🔒 Account scoping applied for account: ${req.appAccountId}`)
    next()
  }
}

module.exports = {
  createAccountScopingMiddleware,
  createAccountScopedPrisma
}
