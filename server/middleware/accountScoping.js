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
      // Exclude appAccount from account scoping as it doesn't have accountId
      if (typeof originalMethod === 'object' && originalMethod !== null && prop !== 'appAccount') {
        return new Proxy(originalMethod, {
          get(modelTarget, methodName) {
            const originalQuery = modelTarget[methodName]
            
            if (typeof originalQuery === 'function') {
              return function(...args) {
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
                
                return originalQuery.apply(this, args)
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
      // If auth is disabled, use default account ID
      const AUTH_ENABLED = String(process.env.AUTH_ENABLED || 'false').toLowerCase() === 'true'
      if (!AUTH_ENABLED) {
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
