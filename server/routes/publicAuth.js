const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const { repairAddonsList } = require('../utils/repair');
const { responseUtils, dbUtils } = require('../utils/routeUtils');
const { validateStremioAuthKey } = require('../utils/stremio');
const { encrypt } = require('../utils/encryption');

module.exports = ({ prisma, getAccountId, AUTH_ENABLED, PRIVATE_AUTH_ENABLED, PRIVATE_AUTH_USERNAME, PRIVATE_AUTH_PASSWORD, DEFAULT_ACCOUNT_ID, issueAccessToken, issueRefreshToken, cookieName, isProdEnv, encrypt, decrypt, getDecryptedManifestUrl, scopedWhere, getAccountDek, decryptWithFallback, manifestUrlHmac, manifestHash, filterManifestByResources, filterManifestByCatalogs, parseCookies, JWT_SECRET }) => {
  console.log('PublicAuth router initialized, prisma available:', !!prisma);
  const router = express.Router();

  // Shared function to reset account data
  const resetAccountData = async (accountId) => {
    console.log('Resetting account data for:', accountId);
    await prisma.groupAddon.deleteMany({
      where: { group: { accountId } }
    });
    await prisma.group.deleteMany({
      where: { accountId }
    });
    await prisma.addon.deleteMany({
      where: { accountId }
    });
    await prisma.user.deleteMany({
      where: { accountId }
    });
    console.log('Account data reset completed');
  };

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
    },
  });

  // Use shared repair helper
  async function repairAddonsForAccount(addonsList, req) {
    return await repairAddonsList({
      prisma,
      AUTH_ENABLED,
      getAccountDek,
      getDecryptedManifestUrl,
      filterManifestByResources,
      filterManifestByCatalogs,
      manifestHash,
      encrypt
    }, req, addonsList)
  }

  // Helper function to generate random CSRF token
  function randomCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  async function generateUniqueAccountUuid() {
    const tryGenerate = () => {
      try {
        return crypto.randomUUID()
      } catch {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0
          const v = c === 'x' ? r : (r & 0x3 | 0x8)
          return v.toString(16)
        })
      }
    }

    for (let i = 0; i < 5; i += 1) {
      const candidate = tryGenerate()
      const exists = await prisma.appAccount.findUnique({ where: { uuid: candidate } })
      if (!exists) return candidate
    }

    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
  }

  async function ensureUniqueUsername(baseUsername, accountId) {
    const base = (String(baseUsername || '') || '')
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .toLowerCase() || 'stremio-user'
    let candidate = base
    let suffix = 1
    while (true) {
      const existing = await prisma.user.findFirst({
        where: { accountId, username: candidate }
      })
      if (!existing) return candidate
      candidate = `${base}${suffix}`
      suffix += 1
    }
  }

  async function validateUserStremioAuth(accountId, email, req) {
    const user = await prisma.user.findFirst({
      where: { accountId, email }
    })
    
    if (!user) {
      return { valid: false, user: null }
    }
    
    if (!user.stremioAuthKey) {
      return { valid: false, user }
    }
    
    try {
      const storedAuthKey = decrypt(user.stremioAuthKey, req)
      const storedAuthKeyInfo = await validateStremioAuthKey(storedAuthKey)
      const storedEmail = String(storedAuthKeyInfo?.user?.email || '').trim().toLowerCase()
      
      if (storedEmail !== email) {
        return { valid: false, user }
      }
      
      return { valid: true, user }
    } catch (error) {
      return { valid: false, user }
    }
  }

  // Generate unique UUID endpoint
  router.get('/generate-uuid', async (req, res) => {
    try {
      let uuid
      try {
        uuid = crypto.randomUUID()
      } catch {
        // Fallback for older Node.js versions
        uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0
          const v = c == 'x' ? r : (r & 0x3 | 0x8)
          return v.toString(16)
        })
      }

      res.json({
        success: true,
        uuid: uuid
      })
    } catch (error) {
      console.error('Error generating UUID:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to generate UUID'
      })
    }
  })

  // Public auth endpoints
  router.post('/register', async (req, res) => {
    try {
      const { uuid, password } = req.body || {};
      if (!uuid || !password) {
        return responseUtils.badRequest(res, 'uuid and password are required');
      }
      // Enforce RFC 4122 UUID format (any version, correct variant)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(String(uuid))) {
        return responseUtils.badRequest(res, 'Invalid UUID format');
      }
      if (String(password).length < 4) {
        return responseUtils.badRequest(res, 'Password must be at least 4 characters');
      }

      const existing = await prisma.appAccount.findUnique({ where: { uuid } });
      if (existing) {
        return res.status(409).json({ message: 'Account already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const account = await prisma.appAccount.create({
        data: { uuid, passwordHash },
      });

      // Set access/refresh and CSRF cookies
      const at = issueAccessToken(account.id);
      const rt = issueRefreshToken(account.id);
      const csrf = randomCsrfToken();
      res.cookie(cookieName('sfm_at'), at, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
      res.cookie(cookieName('sfm_rt'), rt, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });
      res.cookie(cookieName('sfm_csrf'), csrf, { httpOnly: false, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
      return res.status(201).json({
        message: 'Registered successfully',
        account: { id: account.id, uuid: account.uuid, email: account.email || null },
      });
    } catch (error) {
      console.error('Registration error:', error);
      return responseUtils.internalError(res, String(error && error.message || error));
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const { uuid, password } = req.body || {};
      if (!uuid || !password) {
        return responseUtils.badRequest(res, 'uuid and password are required');
      }

      const account = await prisma.appAccount.findUnique({ where: { uuid } });
      if (!account) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const isValid = await bcrypt.compare(password, account.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Set access/refresh and CSRF cookies
      const at = issueAccessToken(account.id);
      const rt = issueRefreshToken(account.id);
      const csrf = randomCsrfToken();
      res.cookie(cookieName('sfm_at'), at, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
      res.cookie(cookieName('sfm_rt'), rt, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });
      res.cookie(cookieName('sfm_csrf'), csrf, { httpOnly: false, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
      return res.json({
        message: 'Login successful',
        account: { id: account.id, uuid: account.uuid, email: account.email || null },
      });
    } catch (error) {
      console.error('Login error:', error);
      return responseUtils.internalError(res, String(error && error.message || error));
    }
  });

  // Private instance username/password login
  router.post('/private-login', async (req, res) => {
    try {
      if (!PRIVATE_AUTH_ENABLED) {
        return res.status(400).json({ message: 'Private auth is not enabled' });
      }

      const { username, password } = req.body || {};
      if (!username || !password) {
        return responseUtils.badRequest(res, 'username and password are required');
      }

      // Compare with env vars (trim whitespace)
      const trimmedUsername = (username || '').trim();
      const trimmedPassword = (password || '').trim();
      if (trimmedUsername !== PRIVATE_AUTH_USERNAME || trimmedPassword !== PRIVATE_AUTH_PASSWORD) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Use DEFAULT_ACCOUNT_ID for private instances
      const accountId = DEFAULT_ACCOUNT_ID;

      // Set access/refresh and CSRF cookies
      const at = issueAccessToken(accountId);
      const rt = issueRefreshToken(accountId);
      const csrf = randomCsrfToken();
      res.cookie(cookieName('sfm_at'), at, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
      res.cookie(cookieName('sfm_rt'), rt, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });
      res.cookie(cookieName('sfm_csrf'), csrf, { httpOnly: false, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
      
      return res.json({
        message: 'Login successful',
        account: { id: accountId, uuid: null, email: null },
      });
    } catch (error) {
      console.error('Private login error:', error);
      return responseUtils.internalError(res, String(error && error.message || error));
    }
  });

  router.post('/stremio-login', async (req, res) => {
    try {
      if (!AUTH_ENABLED) {
        return res.status(400).json({ message: 'Stremio login is only available in public auth mode' })
      }

      const { authKey } = req.body || {}
      if (!authKey || typeof authKey !== 'string' || !authKey.trim()) {
        return responseUtils.badRequest(res, 'authKey is required')
      }

      let stremioInfo
      try {
        stremioInfo = await validateStremioAuthKey(authKey.trim())
      } catch (err) {
        const code = err?.code
        const message = err?.message || 'Failed to validate Stremio auth key'
        if (code === 1) {
          return res.status(401).json({ message: 'Invalid or expired Stremio session' })
        }
        return res.status(400).json({ message })
      }

      const email = String(stremioInfo?.user?.email || '').trim().toLowerCase()
      if (!email) {
        return res.status(400).json({ message: 'Stremio account email not available' })
      }
      
      // Extract account ID from session cookies (since route is allowlisted, middleware might not set it)
      // Only extract if user is actually logged in (has valid session)
      let originalAccountId = req.appAccountId
      if (!originalAccountId && AUTH_ENABLED && parseCookies && JWT_SECRET) {
        try {
          const cookies = parseCookies(req)
          const accessCookie = cookies[cookieName('sfm_at')] || cookies['sfm_at']
          const refreshCookie = cookies[cookieName('sfm_rt')] || cookies['sfm_rt']
          const token = accessCookie || refreshCookie
          if (token) {
            const jwt = require('jsonwebtoken')
            const decoded = jwt.verify(token, JWT_SECRET)
            if (decoded && decoded.accId) {
              // Verify the account actually exists before setting originalAccountId
              const accountExists = await prisma.appAccount.findUnique({ where: { id: decoded.accId } })
              if (accountExists) {
                originalAccountId = decoded.accId
                req.appAccountId = originalAccountId
              }
            }
          }
        } catch (e) {
          // If we can't extract account ID from cookies, user is not logged in - that's OK
          // This is expected for normal login flow
        }
      }
      
      let account
      let isNewAccount = false
      
      // FIRST CHECK: If user is logged in and trying to link, verify Stremio account is not already linked to another account
      if (originalAccountId) {
        // Verify current account exists - if it doesn't, treat as not logged in (normal login flow)
        const currentAccount = await prisma.appAccount.findUnique({ where: { id: originalAccountId } })
        if (!currentAccount) {
          // Account doesn't exist - treat as not logged in, proceed with normal login flow
          originalAccountId = undefined
        } else {
          // Account exists - user is logged in, check if Stremio account is already linked elsewhere
          const existingAccountWithEmail = await prisma.appAccount.findUnique({ where: { email } })
          if (existingAccountWithEmail && existingAccountWithEmail.id !== originalAccountId) {
            return res.status(409).json({ 
              message: 'This Stremio account is already linked to another Syncio account',
              error: 'EMAIL_ALREADY_LINKED'
            })
          }
          
          // Check for legacy account with this email (uuid format: stremio:${email})
          const legacyUuid = `stremio:${email}`
          const legacyAccount = await prisma.appAccount.findUnique({ where: { uuid: legacyUuid } })
          if (legacyAccount && legacyAccount.id !== originalAccountId) {
            return res.status(409).json({ 
              message: 'This Stremio account is already linked to another Syncio account',
              error: 'EMAIL_ALREADY_LINKED'
            })
          }
          
          // If current account already has an email, it must match
          if (currentAccount.email && currentAccount.email !== email) {
            return res.status(409).json({ 
              message: 'Your account is already linked to a different Stremio account',
              error: 'ACCOUNT_ALREADY_LINKED'
            })
          }
          
          const validation = await validateUserStremioAuth(currentAccount.id, email, req)
          
          if (!validation.user) {
            return res.status(400).json({
              message: 'No user found with this email address. Please create a user with this email first before linking your Stremio account.',
              error: 'NO_USER_WITH_EMAIL'
            })
          }
          
          if (!validation.user.stremioAuthKey) {
            return res.status(400).json({
              message: 'User exists but has no Stremio authentication. Please connect the user to Stremio first before linking the account.',
              error: 'USER_NO_STREMIO_AUTH'
            })
          }
          
          if (!validation.valid) {
            const errorMsg = validation.user.stremioAuthKey 
              ? 'A user with this email already exists in your account, but their Stremio authentication does not match. Please contact support.'
              : 'User exists but the stored Stremio authentication is invalid or expired. Please reconnect the user to Stremio first.'
            const errorCode = validation.user.stremioAuthKey 
              ? 'STORED_AUTHKEY_EMAIL_MISMATCH'
              : 'INVALID_STORED_AUTHKEY'
            return res.status(validation.user.stremioAuthKey ? 409 : 400).json({
              message: errorMsg,
              error: errorCode
            })
          }
          
          if (currentAccount.email == null) {
            account = await prisma.appAccount.update({
              where: { id: currentAccount.id },
              data: { email }
            })
          } else {
            account = currentAccount
          }
          req.appAccountId = account.id
          
          const encryptedAuthKey = encrypt(authKey.trim(), req)
          await prisma.user.update({
            where: { id: validation.user.id },
            data: { stremioAuthKey: encryptedAuthKey, isActive: true }
          })
          
          const at = issueAccessToken(account.id)
          const rt = issueRefreshToken(account.id)
          const csrf = randomCsrfToken()
          res.cookie(cookieName('sfm_at'), at, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 })
          res.cookie(cookieName('sfm_rt'), rt, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 })
          res.cookie(cookieName('sfm_csrf'), csrf, { httpOnly: false, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 })
          
          return res.json({
            message: 'Account already linked',
            account: { id: account.id, uuid: account.uuid, email: account.email || null }
          })
        }
      }
      
      // Normal login flow (user not logged in, or account from cookie doesn't exist)
      if (!account) {
        // Not logged in - normal login flow (find or create account with email)
        
        account = await prisma.appAccount.findUnique({ where: { email } })
        
        if (account) {
          const validation = await validateUserStremioAuth(account.id, email, req)
          if (!validation.valid) {
            await prisma.appAccount.update({
              where: { id: account.id },
              data: { email: null }
            })
            account = null
          }
        }
        
        if (!account) {
          const legacyUuid = `stremio:${email}`
          const legacyAccount = await prisma.appAccount.findUnique({ where: { uuid: legacyUuid } })
          if (legacyAccount) {
            const validation = await validateUserStremioAuth(legacyAccount.id, email, req)
            if (!validation.valid) {
              const newUuid = await generateUniqueAccountUuid()
              await prisma.appAccount.update({
                where: { id: legacyAccount.id },
                data: { uuid: newUuid, email: null }
              })
              account = null
            } else {
              const newUuid = await generateUniqueAccountUuid()
              account = await prisma.appAccount.update({
                where: { id: legacyAccount.id },
                data: { uuid: newUuid, email }
              })
            }
          }
        }

        // Create new account if none found or all were unlinked
        if (!account) {
          const randomSecret = crypto.randomBytes(32).toString('hex')
          const passwordHash = await bcrypt.hash(randomSecret, 12)
          const newUuid = await generateUniqueAccountUuid()
          account = await prisma.appAccount.create({
            data: {
              uuid: newUuid,
              email,
              passwordHash
            }
          })
          isNewAccount = true
        } else if (account.email == null) {
          // Account exists but email was unlinked - set it now
          account = await prisma.appAccount.update({
            where: { id: account.id },
            data: { email }
          })
        }
        
        req.appAccountId = account.id
      }

      const encryptedAuthKey = encrypt(authKey.trim(), req)

      // Ensure email uniqueness across all accounts
      const { ensureEmailUniqueness } = require('../utils/helpers/database')
      await ensureEmailUniqueness(prisma, email, account.id)

      let user = null
      const existingUser = await prisma.user.findFirst({
        where: { accountId: account.id },
        orderBy: { id: 'asc' }
      })

      if (isNewAccount) {
        const baseUsername = stremioInfo?.user?.username || stremioInfo?.user?.name || (email.split('@')[0] || 'stremio-user')
        const username = await ensureUniqueUsername(baseUsername, account.id)
        const createdUser = await prisma.user.create({
          data: {
            accountId: account.id,
            email,
            username,
            isActive: true,
            stremioAuthKey: encryptedAuthKey
          }
        })
        user = { id: createdUser.id, email: createdUser.email, username: createdUser.username }
      } else if (existingUser) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { stremioAuthKey: encryptedAuthKey, isActive: true }
        })
      }

      const at = issueAccessToken(account.id);
      const rt = issueRefreshToken(account.id);
      const csrf = randomCsrfToken();
      res.cookie(cookieName('sfm_at'), at, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
      res.cookie(cookieName('sfm_rt'), rt, { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });
      res.cookie(cookieName('sfm_csrf'), csrf, { httpOnly: false, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });

      return res.json({
        message: 'Login successful',
        account: { id: account.id, uuid: account.uuid, email: account.email || null },
        ...(user ? { user } : {})
      })
    } catch (error) {
      console.error('Stremio login error:', error);
      return responseUtils.internalError(res, String(error && error.message || error));
    }
  })

  // Unlink Stremio account from current account
  router.post('/unlink-stremio', async (req, res) => {
    try {
      if (!AUTH_ENABLED) {
        return res.status(400).json({ message: 'Unlinking is only available in public auth mode' })
      }

      const accountId = req.appAccountId
      if (!accountId) {
        return res.status(401).json({ message: 'Authentication required' })
      }

      const account = await prisma.appAccount.findUnique({ where: { id: accountId } })
      if (!account) {
        return res.status(404).json({ message: 'Account not found' })
      }

      if (!account.email) {
        return res.status(400).json({ message: 'Account is not linked to a Stremio account' })
      }

      await prisma.appAccount.update({
        where: { id: accountId },
        data: { email: null }
      })

      return res.json({ message: 'Stremio account unlinked successfully' })
    } catch (error) {
      console.error('Unlink Stremio error:', error)
      return responseUtils.internalError(res, String(error && error.message || error))
    }
  })

  // Session info endpoint
  router.get('/me', async (req, res) => {
    try {
      if (!AUTH_ENABLED && !PRIVATE_AUTH_ENABLED) {
        return res.json({ account: null, message: 'Auth disabled' });
      }

      if (!req.appAccountId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // For private auth, return a simple account object
      if (PRIVATE_AUTH_ENABLED && !AUTH_ENABLED) {
        return res.json({ 
          account: { 
            id: req.appAccountId, 
            uuid: null, 
            email: null 
          } 
        });
      }

      const account = await prisma.appAccount.findUnique({
        where: { id: req.appAccountId },
        select: { id: true, uuid: true, email: true }
      });

      if (!account) {
        return responseUtils.notFound(res, 'Account');
      }

      res.json({ account });
    } catch (error) {
      console.error('Session error:', error);
      return responseUtils.internalError(res, String(error && error.message || error));
    }
  });

  router.post('/logout', (req, res) => {
    const opts = { httpOnly: true, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', expires: new Date(0) };
    res.cookie(cookieName('sfm_at'), '', opts);
    res.cookie(cookieName('sfm_rt'), '', opts);
    res.cookie(cookieName('sfm_csrf'), '', { httpOnly: false, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', expires: new Date(0) });
    return res.json({ message: 'Logged out' });
  });

  // Export all data for the logged-in account (config export)
  router.get('/config-export', async (req, res) => {
    try {
      const whereScope = AUTH_ENABLED ? { accountId: req.appAccountId } : {}
      if (AUTH_ENABLED && !req.appAccountId) return res.status(401).json({ error: 'Unauthorized' })
      // Ensure request-scoped DEK is available for decryption in public mode
      try {
        if (AUTH_ENABLED && !req.accountDek && typeof getAccountDek === 'function') {
          let dek = getAccountDek(req.appAccountId)
          if (!dek) {
            const acct = await prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { uuid: true } })
            if (acct?.uuid) {
              dek = getAccountDek(acct.uuid)
            }
          }
          if (dek) req.accountDek = dek
        }
      } catch {}
      const [users, groups, addons, accountRec] = await Promise.all([
        prisma.user.findMany({ where: whereScope }),
        prisma.group.findMany({ 
          where: whereScope, 
          include: { 
            addons: { include: { addon: true } }
          } 
        }),
        prisma.addon.findMany({ where: whereScope, include: { groupAddons: true } }),
        AUTH_ENABLED ? prisma.appAccount.findUnique({ where: { id: req.appAccountId }, select: { sync: true } }) : null
      ])
      // Build addon id -> name map for user excludedAddons name resolution
      const addonIdToName = new Map(addons.map(a => [a.id, a.name]))
      
      // Decrypt stremioAuthKey for each user before exporting
      const decryptedUsers = users.map(user => {
        const decryptedUser = { ...user }
        if (user.stremioAuthKey) {
          try {
            decryptedUser.stremioAuthKey = decrypt(user.stremioAuthKey, req)
          } catch (e) {
            console.warn(`Failed to decrypt auth key for user ${user.id}:`, e.message)
            decryptedUser.stremioAuthKey = null
          }
        }
        // Normalize excludedAddons to addon NAMES for export (keep JSON string format for compatibility)
        try {
          const parsedExcluded = user.excludedAddons ? JSON.parse(user.excludedAddons) : []
          if (Array.isArray(parsedExcluded)) {
            const names = parsedExcluded
              .map(id => addonIdToName.get(id))
              .filter(Boolean)
            decryptedUser.excludedAddons = JSON.stringify(names)
          }
        } catch {}
        // Ensure protectedAddons remains a JSON string of names
        try {
          if (Array.isArray(user.protectedAddons)) {
            decryptedUser.protectedAddons = JSON.stringify(user.protectedAddons)
          } else if (typeof user.protectedAddons !== 'string' && user.protectedAddons) {
            decryptedUser.protectedAddons = JSON.stringify([])
          }
        } catch {}
        // Omit internal fields
        delete decryptedUser.id
        delete decryptedUser.accountId
        // Omit stremioAddons from export (not needed in exported config)
        delete decryptedUser.stremioAddons
        return decryptedUser
      })
      
      // Build addons with originalManifest and simplified resources/catalogs
      const exportedAddons = await Promise.all(addons.map(async (addon) => {
        // Get the original manifest (full, unfiltered)
        let originalManifest = null
        if (addon.originalManifest) {
          try { 
            originalManifest = JSON.parse(decrypt(addon.originalManifest, req)) 
          } catch (e) {
            console.warn(`Failed to decrypt originalManifest for ${addon.name}:`, e.message)
          }
        }
        
        // Fallback: if no originalManifest, try to get from current manifest
        if (!originalManifest && addon.manifest) {
          try { 
            originalManifest = JSON.parse(decrypt(addon.manifest, req)) 
          } catch (e) {
            console.warn(`Failed to decrypt manifest for ${addon.name}:`, e.message)
          }
        }
        
        // Last resort: fetch from URL if available
        if (!originalManifest) {
          const transportUrl = getDecryptedManifestUrl(addon, req)
          if (transportUrl) {
            try {
              const rsp = await fetch(transportUrl)
              if (rsp.ok) { 
                originalManifest = await rsp.json()
                console.log(`Fetched originalManifest for config export: ${originalManifest?.name}`)
              }
            } catch (err) {
              console.warn(`Failed to fetch manifest for ${transportUrl}:`, err?.message)
            }
          }
        }

        // Create fallback manifest if nothing else works
        if (!originalManifest) {
          originalManifest = {
            id: addon.name || 'unknown.addon',
            name: addon.name || 'Unknown',
            version: addon.version || null,
            description: addon.description || null,
            logo: addon.iconUrl || null,
            resources: [],
            catalogs: [],
            types: []
          }
        }

        // Get current resource and catalog selections (already in simplified format)
        const currentResources = (() => { 
          try { return addon.resources ? JSON.parse(addon.resources) : [] } catch { return [] } 
        })()
        
        const currentCatalogs = (() => { 
          try { return addon.catalogs ? JSON.parse(addon.catalogs) : [] } catch { return [] } 
        })()

        // cleanedGroupAddons is only calculated for reference if needed but not exported in main payload
        const cleanedGroupAddons = (addon.groupAddons || []).map(ga => ({
          name: addon.name,
          isEnabled: ga.isEnabled
          // omit groupId, addonId and settings
        }))
        
        return {
          name: addon.name,
          description: addon.description,
          manifestUrl: getDecryptedManifestUrl(addon, req),
          originalManifest, // Full manifest with all available resources
          resources: currentResources, // Simplified resource names: ["stream", "catalog"]
          catalogs: currentCatalogs,   // Simplified catalog (type,id) pairs: [{"type":"movie","id":"123"}]
          stremioAddonId: addon.stremioAddonId || (originalManifest && originalManifest.id) || null,
          version: addon.version,
          isActive: addon.isActive,
          iconUrl: addon.iconUrl,
          // drop internal ids and relations from export
        }
      }))

      // Build quick userId->username map for groups export
      const userIdToUsername = new Map(users.map(u => [u.id, u.username]))

      // Clean groups: export addons as ordered list of { name, isEnabled }
      const cleanedGroups = await Promise.all(groups.map(async g => {
        // Use getGroupAddons to get addons in correct order
        const { getGroupAddons } = require('../utils/helpers')
        const orderedAddons = await getGroupAddons(prisma, g.id, req)
        // Build name->isEnabled map from group include as fallback
        const enabledByName = new Map()
        for (const ga of (g.addons || [])) {
          const ref = ga && ga.addon ? ga.addon : null
          if (ref && ref.name) enabledByName.set(ref.name, ga.isEnabled !== false)
        }
        const addonsOrdered = orderedAddons.map(a => ({
          name: a.name,
          isEnabled: (typeof a.isEnabled === 'boolean') ? a.isEnabled : (enabledByName.has(a.name) ? enabledByName.get(a.name) : true)
        }))

        const usersArr = (() => {
          try {
            const ids = g.userIds ? JSON.parse(g.userIds) : []
            return ids.map(id => userIdToUsername.get(id)).filter(Boolean)
          } catch { return [] }
        })()

        return {
          name: g.name,
          description: g.description,
          isActive: g.isActive,
          colorIndex: g.colorIndex,
          users: usersArr,
          addons: addonsOrdered
        }
      }))

      // Normalize account sync for export
      let accountSync = null
      try {
        const rawSync = accountRec?.sync
        if (rawSync != null) {
          if (typeof rawSync === 'string') {
            try { accountSync = JSON.parse(rawSync) } catch { accountSync = { frequency: '0' } }
          } else if (typeof rawSync === 'object') {
            accountSync = rawSync
          }
        }
      } catch {}
      
      // Ensure useCustomFields is included in export (default to true if not present)
      // Migrate old useCustomNames to useCustomFields if present
      if (accountSync && typeof accountSync === 'object') {
        if (typeof accountSync.useCustomFields !== 'boolean') {
          if (typeof accountSync.useCustomNames === 'boolean') {
            accountSync.useCustomFields = accountSync.useCustomNames
            delete accountSync.useCustomNames
          } else {
            accountSync.useCustomFields = true
          }
        }
      } else if (accountSync === null) {
        // If no sync config exists, create a minimal one with useCustomFields
        accountSync = { useCustomFields: true }
      }

      const payload = { users: decryptedUsers, groups: cleanedGroups, addons: exportedAddons, sync: accountSync }
      res.setHeader('Content-Disposition', 'attachment; filename="syncio-export.json"')
      return res.json(payload)
    } catch (e) {
      console.error('Export failed:', e)
      return res.status(500).json({ error: 'Export failed' })
    }
  });

  // Export only addons for the logged-in account
  router.get('/addon-export', async (req, res) => {
    try {
      const whereScope = AUTH_ENABLED ? { accountId: req.appAccountId } : {}
      if (AUTH_ENABLED && !req.appAccountId) return res.status(401).json({ error: 'Unauthorized' })
      const addons = await prisma.addon.findMany({ where: whereScope })

      // Build addon objects with originalManifest and current selections
      const exported = await Promise.all(
        addons.map(async (addon) => {
          const transportUrl = getDecryptedManifestUrl(addon, req)
          
          // Get the original manifest (full, unfiltered)
          let originalManifest = null
          if (addon.originalManifest) {
            try { 
              originalManifest = JSON.parse(decrypt(addon.originalManifest, req)) 
            } catch (e) {
              console.warn(`Failed to decrypt originalManifest for ${addon.name}:`, e.message)
            }
          }
          
          // Fallback: if no originalManifest, try to get from current manifest
          if (!originalManifest && addon.manifest) {
            try { 
              originalManifest = JSON.parse(decrypt(addon.manifest, req)) 
            } catch (e) {
              console.warn(`Failed to decrypt manifest for ${addon.name}:`, e.message)
            }
          }
          
          // Last resort: fetch from URL if available
          if (!originalManifest && transportUrl) {
          try {
            const rsp = await fetch(transportUrl)
              if (rsp.ok) { 
                originalManifest = await rsp.json()
                console.log(`Fetched originalManifest for export: ${originalManifest?.name}`)
              }
          } catch (err) {
            console.warn(`Failed to fetch manifest for ${transportUrl}:`, err?.message)
            }
          }

          // Create fallback manifest if nothing else works
          if (!originalManifest) {
            originalManifest = {
              id: addon.name || 'unknown.addon',
              version: addon.version || null,
              name: addon.name || '',
              description: addon.description || null,
              logo: addon.iconUrl || null,
              background: null,
              types: [],
              resources: (() => { try { return addon.resources ? JSON.parse(addon.resources) : [] } catch { return [] } })(),
              idPrefixes: null,
              catalogs: [],
              addonCatalogs: [],
              behaviorHints: { configurable: false, configurationRequired: false },
            }
          }

          // Get current resource and catalog selections (already in simplified format)
          const currentResources = (() => { 
            try { return addon.resources ? JSON.parse(addon.resources) : [] } catch { return [] } 
          })()
          
          const currentCatalogs = (() => { 
            try { return addon.catalogs ? JSON.parse(addon.catalogs) : [] } catch { return [] } 
          })()

          return {
            name: addon.name || '',
            manifestUrl: transportUrl,
            originalManifest, // Full manifest with all available resources
            resources: currentResources, // Simplified resource names: ["stream", "catalog"]
            catalogs: currentCatalogs,   // Simplified catalog (type,id) pairs: [{"type":"movie","id":"123"}]
            stremioAddonId: addon.stremioAddonId || (originalManifest && originalManifest.id) || null,
            flags: { protected: false },
          }
        })
      )

      res.setHeader('Content-Disposition', 'attachment; filename="syncio-addon-export.json"')
      return res.json(exported)
    } catch (e) {
      console.error('Export addons failed:', e)
      return res.status(500).json({ error: 'Export addons failed' })
    }
  });

  // Import full configuration with an account-scoped reset first (canonical path)
  router.post('/config-import', upload.single('file'), async (req, res) => {
    try {
      console.log('Config import started');
      if (AUTH_ENABLED && !req.appAccountId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      let jsonData;
      if (req.file) {
        // Handle file upload
        console.log('Processing uploaded file');
        jsonData = JSON.parse(req.file.buffer.toString('utf8'));
      } else if (req.body.jsonData) {
        // Handle JSON string in body
        console.log('Processing JSON data from body');
        jsonData = JSON.parse(req.body.jsonData);
      } else {
        return responseUtils.badRequest(res, 'No file or jsonData provided');
      }

      // Handle both wrapped and direct config formats
      let configData = jsonData.data || jsonData;
      console.log('Config data structure:', Object.keys(configData));
      
      if (!configData || (!configData.users && !configData.addons)) {
        return responseUtils.badRequest(res, 'Invalid config format');
      }

      const { users, groups, addons, sync: importedSync } = configData;
      const accountId = req.appAccountId || 'default';

      // Reset existing data for this account using shared function
      await resetAccountData(accountId);

      // Apply account sync settings if provided
      try {
        if (importedSync && (typeof importedSync === 'object' || typeof importedSync === 'string')) {
          const acct = await prisma.appAccount.findUnique({ where: { id: accountId }, select: { sync: true } })
          let parsedSync = importedSync
          if (typeof importedSync === 'string') {
            try { parsedSync = JSON.parse(importedSync) } catch { parsedSync = { enabled: true, frequency: '0' } }
          }
          
          // Ensure useCustomFields is included (default to true if not present for backward compatibility)
          // Migrate old useCustomNames to useCustomFields if present
          if (typeof parsedSync === 'object' && parsedSync !== null) {
            if (typeof parsedSync.useCustomFields !== 'boolean') {
              if (typeof parsedSync.useCustomNames === 'boolean') {
                parsedSync.useCustomFields = parsedSync.useCustomNames
                delete parsedSync.useCustomNames
              } else {
                parsedSync.useCustomFields = true
              }
            }
          }
          
          let valueToStore = parsedSync
          if (typeof acct?.sync === 'string') {
            // DB expects string (SQLite)
            valueToStore = JSON.stringify(parsedSync)
          } else {
            // DB expects JSON (Postgres)
            valueToStore = parsedSync
          }
          await prisma.appAccount.update({ where: { id: accountId }, data: { sync: valueToStore } })
        }
      } catch (e) {
        console.warn('Failed to apply imported sync settings:', e?.message)
      }

      // Import in correct order: groups → addons → users
      
      // 1. Import groups first (always new IDs, defer userIds mapping)
      const importedGroups = [];
      if (groups && Array.isArray(groups)) {
        for (const groupData of groups) {
          const { id: _exportGroupId, addons, userIds: _legacyUserIds, users, ...groupFields } = groupData;
          const group = await prisma.group.create({
            data: {
              ...groupFields,
              accountId,
              // do not include userIds yet; we will remap after users are created
            }
          });
          const groupWithAddons = { 
            ...group, 
            addons: Array.isArray(addons) ? addons : [],
            users: Array.isArray(users) ? users : [] // Expect usernames only
          };
          console.log(`🔍 Storing group "${groupWithAddons.name}" with addons:`, groupWithAddons.addons);
          importedGroups.push(groupWithAddons);
        }
      }

      // 2. Import addons
      const importedAddons = [];
      console.log(`Starting addon import, found ${addons ? addons.length : 0} addons`);
      if (addons && Array.isArray(addons)) {
        // Use the same logic as the addon-import endpoint
        for (const addonData of addons) {
          try {
            // Get URL from manifestUrl (preferred) or legacy transportUrl
            const transportUrl = addonData.manifestUrl || addonData.transportUrl;
            
            // Validate required fields
            if (!transportUrl) {
              console.warn('Skipping addon with missing URL:', addonData);
              continue;
            }

            // Use the new approach: prefer originalManifest from export, fallback to fetching
            let originalManifestObj = addonData.originalManifest || null
            
            // If no originalManifest in export, try to fetch from URL
            if (!originalManifestObj) {
              try {
                const resp = await fetch(transportUrl)
                if (resp.ok) {
                  originalManifestObj = await resp.json()
                  console.log(`Fetched originalManifest for config import: ${originalManifestObj?.name}`)
                }
              } catch (e) {
                console.warn(`Failed to fetch manifest for ${transportUrl}:`, e.message)
              }
            }

            // Create fallback manifest if nothing else works
            if (!originalManifestObj) {
              originalManifestObj = {
                id: addonData.name || 'unknown.addon',
                name: addonData.name || 'Unknown',
                version: addonData.version || null,
                description: addonData.description || null,
                logo: addonData.iconUrl || null,
                resources: [],
                catalogs: [],
                types: []
              }
            }

            const transportName = addonData.name || addonData.transportName || originalManifestObj.name || 'Unknown';

            // Check if addon already exists BY NAME ONLY
            let existingAddon = await prisma.addon.findFirst({
              where: {
                accountId: getAccountId(req),
                name: transportName
              }
            })

            // Get selected resources and catalogs from export data
            const selectedResources = (() => {
              const resources = Array.isArray(addonData.resources) ? addonData.resources : []
              // Ensure we only store resource names, not full objects
              return resources.map(r => {
                if (typeof r === 'string') return r
                if (r && typeof r === 'object' && r.name) return r.name
                return null
              }).filter(Boolean)
            })()
            
            const selectedCatalogs = Array.isArray(addonData.catalogs) ? addonData.catalogs : []
            
            console.log(`Importing ${transportName} with resources:`, selectedResources, 'catalogs:', selectedCatalogs)

            // Apply filtering to create the filtered manifest (same logic as AddonDetailModal)
            let filteredManifest = originalManifestObj
            if (selectedResources.length > 0) {
              filteredManifest = filterManifestByResources(originalManifestObj, selectedResources)
              console.log(`Filtered manifest has ${filteredManifest?.catalogs?.length || 0} catalogs after resource filtering`)
            }
            if (selectedCatalogs.length > 0 && filteredManifest) {
              filteredManifest = filterManifestByCatalogs(filteredManifest, selectedCatalogs)
              console.log(`Filtered manifest has ${filteredManifest?.catalogs?.length || 0} catalogs after catalog filtering`)
            }

            // Convert selected catalogs to simplified (type, id, search) format for storage
            const simplifiedCatalogs = (() => {
              try {
                // If selectedCatalogs are already simplified (from export), use them directly
                if (selectedCatalogs.length > 0 && typeof selectedCatalogs[0] === 'object' && selectedCatalogs[0].type && selectedCatalogs[0].id) {
                  return selectedCatalogs.map(c => ({ 
                    type: c.type, 
                    id: c.id,
                    search: c.search !== undefined ? c.search : false
                  }))
                }
                // If they're just IDs, try to match them with originalManifest catalogs
                if (selectedCatalogs.length > 0 && typeof selectedCatalogs[0] === 'string') {
                  const originalCatalogs = Array.isArray(originalManifestObj?.catalogs) ? originalManifestObj.catalogs : []
                  const processedCatalogs = []
                  
                  for (const id of selectedCatalogs) {
                    const catalog = originalCatalogs.find(c => c.id === id)
                    if (!catalog) continue
                    
                    // Check if catalog has search functionality
                    const hasSearch = catalog?.extra?.some((extra) => extra.name === 'search')
                    const hasOtherExtras = catalog?.extra?.some((extra) => extra.name !== 'search')
                    const isEmbeddedSearch = hasSearch && hasOtherExtras
                    const isStandaloneSearch = hasSearch && !hasOtherExtras
                    
                    if (isStandaloneSearch) {
                      // Standalone search catalog: add with original ID (no suffix)
                      processedCatalogs.push({
                        type: catalog.type,
                        id: catalog.id
                      })
                    } else if (isEmbeddedSearch) {
                      // Embedded search catalog: add both original and search versions
                      processedCatalogs.push({
                        type: catalog.type,
                        id: catalog.id
                      })
                      processedCatalogs.push({
                        type: catalog.type,
                        id: `${catalog.id}-embed-search`
                      })
                    } else {
                      // Regular catalog: add as-is
                      processedCatalogs.push({
                        type: catalog.type,
                        id: catalog.id
                      })
                    }
                  }
                  
                  return processedCatalogs
                }
                return []
              } catch { return [] }
            })()

            // If addon exists by name, update it, else create
            if (existingAddon) {
              const updated = await prisma.addon.update({
                where: { id: existingAddon.id },
                data: {
                  description: addonData.description || existingAddon.description || '',
                  version: originalManifestObj.version || existingAddon.version || null,
                  iconUrl: addonData.iconUrl || originalManifestObj.logo || existingAddon.iconUrl || null,
                  stremioAddonId: originalManifestObj.id || existingAddon.stremioAddonId || null,
                  isActive: addonData.isActive !== false,
                  manifestUrl: encrypt(transportUrl, req),
                  manifestUrlHash: manifestUrlHmac(req, transportUrl),
                  originalManifest: encrypt(JSON.stringify(originalManifestObj), req),
                  manifest: encrypt(JSON.stringify(filteredManifest), req),
                  manifestHash: manifestHash(filteredManifest),
                  resources: JSON.stringify(selectedResources),
                  catalogs: JSON.stringify(simplifiedCatalogs)
                }
              })
              console.log(`Successfully updated existing addon: ${transportName}`)
              importedAddons.push(updated)
            } else {
              const newAddon = await prisma.addon.create({
                data: {
                  accountId: getAccountId(req),
                  name: transportName,
                  description: originalManifestObj.description || '',
                  version: originalManifestObj.version || null,
                  iconUrl: originalManifestObj.logo || null,
                  stremioAddonId: originalManifestObj.id || null,
                  isActive: true,
                  manifestUrl: encrypt(transportUrl, req),
                  manifestUrlHash: manifestUrlHmac(req, transportUrl),
                  originalManifest: encrypt(JSON.stringify(originalManifestObj), req),
                  manifest: encrypt(JSON.stringify(filteredManifest), req),
                  manifestHash: manifestHash(filteredManifest),
                  resources: JSON.stringify(selectedResources),
                  catalogs: JSON.stringify(simplifiedCatalogs)
                }
              });
              console.log(`Successfully imported addon: ${transportName}`);
              importedAddons.push(newAddon);
            }

          } catch (addonError) {
            console.error(`Failed to import addon ${addonData.name}:`, addonError);
            // Continue with next addon instead of failing entire import
            console.log(`Skipping addon ${addonData.name} due to error`);
          }
        }
      }

      // 3. Import users (always new IDs) and build export->new map
      const importedUsers = [];
      const exportUserIdToNewId = new Map();
      if (users && Array.isArray(users)) {
        // Build addon lookup maps for normalization
        const nameToAddonId = new Map();
        const stremioIdToAddonId = new Map();
        for (const a of importedAddons) {
          if (a?.name && a?.id) nameToAddonId.set(a.name, a.id)
          if (a?.stremioAddonId && a?.id) stremioIdToAddonId.set(a.stremioAddonId, a.id)
        }

        for (const userData of users) {
          const { id: _exportUserId, stremioAuthKey, protectedAddons, excludedAddons, ...userFields } = userData;

          // Parse protectedAddons and excludedAddons if they're JSON strings
          const parsedProtectedAddons = (() => {
            try {
              if (typeof protectedAddons === 'string') {
                return JSON.parse(protectedAddons);
              }
              return Array.isArray(protectedAddons) ? protectedAddons : [];
            } catch {
              return [];
            }
          })();

          const parsedExcludedAddons = (() => {
            try {
              if (typeof excludedAddons === 'string') {
                return JSON.parse(excludedAddons);
              }
              return Array.isArray(excludedAddons) ? excludedAddons : [];
            } catch {
              return [];
            }
          })();

          // Normalize protectedAddons to plaintext addon names present in DB
          const normalizedProtectedNames = parsedProtectedAddons
            .map(x => (typeof x === 'string' ? x : null))
            .filter(Boolean)
            .filter(name => nameToAddonId.has(name));

          // Normalize excludedAddons to current DB addon IDs
          const normalizedExcludedIds = []
          for (const raw of parsedExcludedAddons) {
            const val = typeof raw === 'string' ? raw : null
            if (!val) continue
            // If looks like an existing DB id, keep as-is (we don't know format, but try fast path by lookup)
            let resolvedId = null
            if (nameToAddonId.has(val)) {
              resolvedId = nameToAddonId.get(val)
            } else if (stremioIdToAddonId.has(val)) {
              resolvedId = stremioIdToAddonId.get(val)
            } else {
              // Try DB lookup by name within account scope
              try {
                const byName = await prisma.addon.findFirst({ where: { accountId: getAccountId(req), name: val }, select: { id: true } })
                if (byName?.id) resolvedId = byName.id
              } catch {}
              // As a last resort, if val corresponds to an addon id in DB, accept it
              if (!resolvedId) {
                try {
                  const byId = await prisma.addon.findFirst({ where: { accountId: getAccountId(req), id: val }, select: { id: true } })
                  if (byId?.id) resolvedId = byId.id
                } catch {}
              }
            }
            if (resolvedId) normalizedExcludedIds.push(resolvedId)
          }

          const user = await prisma.user.create({
            data: {
              ...userFields,
              accountId,
              stremioAuthKey: stremioAuthKey ? encrypt(stremioAuthKey, req) : null,
              protectedAddons: normalizedProtectedNames.length > 0 ? JSON.stringify(normalizedProtectedNames) : null,
              excludedAddons: normalizedExcludedIds.length > 0 ? JSON.stringify(normalizedExcludedIds) : null
            }
          });
          importedUsers.push(user);
          if (_exportUserId) exportUserIdToNewId.set(_exportUserId, user.id)
        }
      }

      // Build username to user ID map
      const usernameToUserId = new Map()
      for (const user of importedUsers) {
        if (user.username) {
          usernameToUserId.set(user.username, user.id)
        }
      }

      // 3b. Update groups.userIds with new user IDs (from usernames only)
      for (const g of importedGroups) {
        let newUserIds = []
        if (Array.isArray(g.users) && g.users.length > 0) {
          newUserIds = g.users.map(username => usernameToUserId.get(username)).filter(Boolean)
        }
        
        if (newUserIds.length > 0) {
          try {
            await prisma.group.update({
              where: { id: g.id },
              data: { userIds: JSON.stringify(newUserIds) }
            })
          } catch (e) {
            console.warn(`Failed to update userIds for group ${g.name}:`, e?.message)
          }
        }
      }

      // Build quick-lookup map by NAME ONLY for linking between exported and imported addons
      const exportAddonNameToNewId = new Map(); // map: addon.name -> dbAddon.id
      for (const a of addons || []) {
        const matched = importedAddons.find(x => x.name === a.name)
        if (matched && a.name) exportAddonNameToNewId.set(a.name, matched.id)
      }

      // Repair newly imported addons before linking users/groups
      if (importedAddons.length > 0) {
        await repairAddonsForAccount(importedAddons, req)
      }

      // Import group-addon relationships from groups (addons by name only)
      let importedGroupAddons = 0;
      for (const group of importedGroups) {
        const addedAddonIds = new Set()
        const addonsToImport = Array.isArray(group.addons) ? group.addons : []

        for (let index = 0; index < addonsToImport.length; index++) {
          try {
            const addonRef = addonsToImport[index];
            let resolvedAddonId = null;
            // Use array index as position if not explicitly set
            let position = addonRef.position !== undefined ? addonRef.position : index;
            let isEnabled = addonRef.isEnabled !== undefined ? addonRef.isEnabled : true;

            // Resolve by NAME ONLY
            if (addonRef.name) {
              resolvedAddonId = exportAddonNameToNewId.get(addonRef.name)
            } else if (addonRef.addon && addonRef.addon.name) {
              resolvedAddonId = exportAddonNameToNewId.get(addonRef.addon.name)
            }
            
            if (resolvedAddonId) {
              if (addedAddonIds.has(resolvedAddonId)) {
                // Skip duplicates from mixed sources (addonIds + addons arrays)
                continue
              }
              await prisma.groupAddon.create({
                data: {
                  groupId: group.id,
                  addonId: resolvedAddonId,
                  isEnabled: isEnabled,
                  position: position
                }
              });
              addedAddonIds.add(resolvedAddonId)
              importedGroupAddons++;
            } else {
              console.warn(`Could not resolve addon for group-addon relationship from export ref:`, addonRef);
            }
          } catch (error) {
            console.error(`Failed to create group-addon relationship:`, error);
          }
        }
      }

      res.json({
        message: 'Configuration imported successfully',
        imported: {
          users: importedUsers.length,
          groups: importedGroups.length,
          addons: importedAddons.length,
          groupAddons: importedGroupAddons
        },
        // Backward-compatible aliases expected by older clients
        addons: { created: importedAddons.length, reused: 0 },
        users: { created: importedUsers.length },
        groups: { created: importedGroups.length }
      });
    } catch (error) {
      console.error('Config import error:', error);
      res.status(500).json({ message: 'Failed to import config', error: error.message });
    }
  });

  // Reset (wipe) all data for the logged-in account, but keep the account
  router.post('/reset', async (req, res) => {
    try {
      console.log('Reset endpoint called, prisma available:', !!prisma);
      const accountId = req.appAccountId || 'default';
      console.log('Account ID for reset:', accountId);
      
      await resetAccountData(accountId);

      res.json({ message: 'Account data reset successfully' });
    } catch (error) {
      console.error('Reset error:', error);
      res.status(500).json({ message: 'Failed to reset account data', error: error.message });
    }
  });

  // Import addons from JSON file
  router.post('/addon-import', upload.single('file'), async (req, res) => {
    try {
      if (AUTH_ENABLED && !req.appAccountId) {
        return res.status(401).json({ message: 'Unauthorized' })
      }
      // Check if file was uploaded
      if (!req.file) {
        return responseUtils.badRequest(res, 'No file uploaded');
      }

      const file = req.file;
      const fileData = file.buffer.toString('utf8');
      
      let importData;
      try {
        importData = JSON.parse(fileData);
      } catch (parseError) {
        return responseUtils.badRequest(res, 'Invalid JSON file');
      }

      // Normalize input: accept either root array or { addons: [...] }
      const addonsArray = Array.isArray(importData) ? importData : importData.addons
      if (!Array.isArray(addonsArray)) {
        return responseUtils.badRequest(res, 'Invalid JSON structure. Expected an array or an object with "addons" array.');
      }

      let successful = 0;
      let failed = 0;
      let redundant = 0;
      const imported = []

      // Process each addon
      for (const addonData of addonsArray) {
        try {
          // Get URL from manifestUrl (preferred) or legacy transportUrl
          const transportUrl = addonData.manifestUrl || addonData.transportUrl;
          
          // Validate required fields
          if (!transportUrl) {
            console.warn('Skipping addon with missing URL:', addonData);
            failed++;
            continue;
          }

          // Use the new approach: prefer originalManifest from export, fallback to fetching
          let originalManifestObj = addonData.originalManifest || null
          
          // If no originalManifest in export, try to fetch from URL
          if (!originalManifestObj) {
          try {
            const resp = await fetch(transportUrl)
            if (resp.ok) {
              originalManifestObj = await resp.json()
                console.log(`Fetched originalManifest for import: ${originalManifestObj?.name}`)
              }
            } catch (e) {
              console.warn(`Failed to fetch manifest for ${transportUrl}:`, e.message)
            }
          }

          // Create fallback manifest if nothing else works
          if (!originalManifestObj) {
            originalManifestObj = {
                id: addonData.name || 'unknown.addon',
                name: addonData.name || 'Unknown',
                version: addonData.version || null,
              description: addonData.description || null,
              logo: addonData.iconUrl || null,
              resources: [],
              catalogs: [],
              types: []
            }
          }

          const transportName = addonData.name || addonData.transportName || originalManifestObj.name || 'Unknown';

          // Resolve a unique name within this account (allow duplicate URLs)
          let finalName = transportName || 'Unknown'
          try {
            const existingByName = await prisma.addon.findFirst({ where: { accountId: getAccountId(req), name: finalName }, select: { id: true } })
            if (existingByName) {
              const base = finalName
              let copyNumber = 1
              while (true) {
                const candidate = copyNumber === 1 ? `${base} (Copy)` : `${base} (Copy #${copyNumber})`
                const exists = await prisma.addon.findFirst({ where: { accountId: getAccountId(req), name: candidate }, select: { id: true } })
                if (!exists) { finalName = candidate; break }
                copyNumber++
              }
            }
          } catch {}

          // Get selected resources and catalogs from export data
          const selectedResources = (() => {
            const resources = Array.isArray(addonData.resources) ? addonData.resources : []
            // Ensure we only store resource names, not full objects
            return resources.map(r => {
              if (typeof r === 'string') return r
              if (r && typeof r === 'object' && r.name) return r.name
              return null
            }).filter(Boolean)
          })()
          const selectedCatalogs = Array.isArray(addonData.catalogs) ? addonData.catalogs : []
          
          console.log(`Importing ${transportName} with resources:`, selectedResources, 'catalogs:', selectedCatalogs)

          // Apply filtering to create the filtered manifest (same logic as AddonDetailModal)
          let filteredManifest = originalManifestObj
          if (selectedResources.length > 0) {
            filteredManifest = filterManifestByResources(originalManifestObj, selectedResources)
            console.log(`Filtered manifest has ${filteredManifest?.catalogs?.length || 0} catalogs after resource filtering`)
          }
          if (selectedCatalogs.length > 0 && filteredManifest) {
            filteredManifest = filterManifestByCatalogs(filteredManifest, selectedCatalogs)
            console.log(`Filtered manifest has ${filteredManifest?.catalogs?.length || 0} catalogs after catalog filtering`)
          }

          // Convert selected catalogs to simplified (type, id, search) format for storage
          const simplifiedCatalogs = (() => {
            try {
              // If selectedCatalogs are already simplified (from export), use them directly
              if (selectedCatalogs.length > 0 && typeof selectedCatalogs[0] === 'object' && selectedCatalogs[0].type && selectedCatalogs[0].id) {
                return selectedCatalogs.map(c => ({ 
                  type: c.type, 
                  id: c.id,
                  search: c.search !== undefined ? c.search : false
                }))
              }
              // If they're just IDs, try to match them with originalManifest catalogs
              if (selectedCatalogs.length > 0 && typeof selectedCatalogs[0] === 'string') {
                const originalCatalogs = Array.isArray(originalManifestObj?.catalogs) ? originalManifestObj.catalogs : []
                return selectedCatalogs.map(id => {
                  const catalog = originalCatalogs.find(c => c.id === id)
                  return catalog ? { type: catalog.type, id: catalog.id } : null
                }).filter(Boolean)
              }
              return []
            } catch { return [] }
          })()

          // Create new addon with both original and filtered manifests
          const newAddon = await prisma.addon.create({
            data: {
              accountId: getAccountId(req),
              name: finalName,
              description: originalManifestObj.description || '',
              version: originalManifestObj.version || null,
              iconUrl: originalManifestObj.logo || null,
              stremioAddonId: originalManifestObj.id || null,
              isActive: true,
              manifestUrl: encrypt(transportUrl, req),
              manifestUrlHash: manifestUrlHmac(req, transportUrl),
              originalManifest: encrypt(JSON.stringify(originalManifestObj), req), // Full manifest
              manifest: encrypt(JSON.stringify(filteredManifest), req), // Filtered manifest
              manifestHash: manifestHash(filteredManifest),
              resources: JSON.stringify(selectedResources), // Just names: ["stream", "catalog"]
              catalogs: JSON.stringify(simplifiedCatalogs), // Just (type,id) pairs: [{"type":"movie","id":"123"}]
            }
          });

          console.log(`Successfully imported addon: ${transportName}`);
          successful++;
          const created = await prisma.addon.findFirst({ where: { accountId: getAccountId(req), manifestUrlHash: manifestUrlHmac(req, transportUrl) } })
          if (created) imported.push(created)

        } catch (addonError) {
          console.error(`Failed to import addon:`, addonError);
          failed++;
        }
      }

      // Optional repair step when query ?repair=true
      if (req.query && String(req.query.repair).toLowerCase() === 'true' && imported.length > 0) {
        await repairAddonsForAccount(imported, req)
      }

      res.json({
        message: 'Import completed',
        successful,
        failed,
        redundant,
        total: addonsArray.length
      });
    } catch (error) {
      console.error('Addon import error:', error);
      res.status(500).json({ message: 'Failed to import addons', error: error.message });
    }
  });

  // Delete the logged-in account and all scoped data
  router.delete('/account', async (req, res) => {
    try {
      if (!AUTH_ENABLED) return res.status(400).json({ error: 'Auth disabled' })
      
      if (!req.appAccountId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // Delete all data for this account
      await prisma.groupAddon.deleteMany({
        where: { group: { accountId: req.appAccountId } }
      });
      await prisma.group.deleteMany({
        where: { accountId: req.appAccountId }
      });
      await prisma.addon.deleteMany({
        where: { accountId: req.appAccountId }
      });
      await prisma.user.deleteMany({
        where: { accountId: req.appAccountId }
      });

      // Delete the account itself
      await prisma.appAccount.delete({
        where: { id: req.appAccountId }
      });

      res.json({ message: 'Account deleted successfully' });
    } catch (error) {
      console.error('Account deletion error:', error);
      res.status(500).json({ message: 'Failed to delete account', error: error.message });
    }
  });

  return router;
};
