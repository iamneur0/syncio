const express = require('express');
const { StremioAPIStore, StremioAPIClient } = require('stremio-api-client');
const { handleStremioError, handleDatabaseError, StremioAPIUtils } = require('../utils/handlers');
const { validateStremioCredentials, sanitizeUrl } = require('../utils/helpers');

module.exports = ({ prisma, getAccountId, encrypt, decrypt, assignUserToGroup, AUTH_ENABLED }) => {
  const router = express.Router();

  // Helper function to validate Stremio auth key
  async function validateStremioAuthKey(authKey) {
    try {
      const client = new StremioAPIClient({ authKey });
      const user = await client.getUser();
      const addons = await client.getAddonCollection();
      return { user, addons };
    } catch (error) {
      throw error;
    }
  }

  // Validate Stremio credentials
  router.post('/validate', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Use centralized validation
      const validation = validateStremioCredentials(email, password);
      if (!validation.isValid) {
        return res.status(400).json({ 
          valid: false, 
          error: validation.errors.join(', ') 
        });
      }

      // Use centralized Stremio API store creation
      const { store: apiStore, tempStorage } = StremioAPIUtils.createAPIStore();

      // Try to authenticate with Stremio
      let authResult
      let lastErr
      for (const attempt of [
        () => apiStore.login({ email, password }),
        () => apiStore.login(email, password),
      ]) {
        try { authResult = await attempt(); lastErr = null; break } catch (e) { lastErr = e }
      }
      
      if (authResult && (apiStore.authKey || tempStorage.auth)) {
        res.json({ valid: true });
      } else {
        res.json({ valid: false, error: 'Invalid Stremio credentials' });
      }
    } catch (error) {
      console.error('Stremio validation error:', error);
      
      // Check for specific error types
      const msg = String(error?.message || '').toLowerCase()
      if (msg.includes('passphrase') || msg.includes('wrong password')) {
        res.json({ valid: false, error: 'Invalid password' });
      } else if (msg.includes('no such user') || msg.includes('user not found') || msg.includes('invalid email')) {
        res.json({ valid: false, error: 'Invalid email' });
      } else if (error.message && error.message.includes('network')) {
        res.json({ valid: false, error: 'Network error - please try again' });
      } else {
        res.json({ valid: false, error: 'Failed to validate credentials' });
      }
    }
  });

  // Register a new Stremio account
  router.post('/register', async (req, res) => {
    try {
      const { email, password, username, groupName, colorIndex } = req.body
      if (!email || !password) {
        return res.status(400).json({ message: !email ? 'Invalid email' : 'Password is required' })
      }
      if (typeof password !== 'string' || password.length < 4) {
        return res.status(400).json({ message: 'Password must be at least 4 characters' })
      }

      // Temporary storage for StremioAPIStore
      const tempStorage = {}
      const apiStore = new StremioAPIStore({
        endpoint: 'https://api.strem.io',
        storage: {
          getJSON: (key) => tempStorage[key] || null,
          setJSON: (key, value) => { tempStorage[key] = value }
        }
      })

      // Perform registration
      // Support both possible signatures just in case
      let lastErr
      for (const attempt of [
        () => apiStore.register({ email, password }),
        () => apiStore.register(email, password),
      ]) {
        try {
          await attempt()
          lastErr = null
          break
        } catch (e) {
          lastErr = e
        }
      }
      if (lastErr) throw lastErr

      // Optional: immediately login to retrieve authKey (useful for client flows)
      try {
        for (const attempt of [
          () => apiStore.login({ email, password }),
          () => apiStore.login(email, password),
        ]) {
          try { await attempt(); break } catch {}
        }
      } catch {}

      const authKey = apiStore.authKey || tempStorage.auth || tempStorage.authKey || null

      // If authenticated to Syncio (public-auth), persist user like connect does
      try {
        const accId = getAccountId(req)
        if (authKey && accId) {
          // Encrypt
          const encryptedAuthKey = encrypt(authKey, req)
          const finalUsername = (username && String(username).trim()) || email.split('@')[0]
          // Create user in current account
          const newUser = await prisma.user.create({
            data: {
              accountId: accId,
              username: finalUsername,
              email,
              stremioAuthKey: encryptedAuthKey,
              isActive: true,
              colorIndex: typeof colorIndex === 'number' ? colorIndex : 0
            }
          })
          // Assign to group if provided
          if (groupName && String(groupName).trim()) {
            try {
              let group = await prisma.group.findFirst({ where: { name: String(groupName).trim(), accountId: accId } })
              if (!group) {
                group = await prisma.group.create({ data: { name: String(groupName).trim(), accountId: accId } })
              }
              await assignUserToGroup(newUser.id, group.id, req)
            } catch {}
          }
          return res.status(201).json({ message: 'Stremio account registered and user created', authKey, user: { id: newUser.id, username: newUser.username } })
        }
      } catch {}

      // Fallback: no Syncio session, return authKey only
      return res.json({ message: 'Stremio account registered successfully', authKey })
    } catch (e) {
      console.error('stremio/register failed:', e)
      
      // Handle specific Stremio API errors
      if (e?.response?.data?.code === 26) {
        return res.status(400).json({ 
          message: 'Invalid email address',
          error: 'Please enter a valid email address'
        })
      }
      
      if (e?.response?.data?.code === 27) {
        return res.status(400).json({ 
          message: 'Email already exists',
          error: 'This email is already registered with Stremio'
        })
      }
      
      if (e?.response?.data?.code === 28) {
        return res.status(400).json({ 
          message: 'Password too weak',
          error: 'Password must be at least 6 characters long'
        })
      }
      
      // Handle other Stremio API errors
      if (e?.response?.data?.message) {
        return res.status(400).json({ 
          message: e.response.data.message,
          error: 'Stremio registration failed'
        })
      }
      
      const msg = typeof e?.message === 'string' ? e.message : 'Failed to register Stremio account'
      return res.status(500).json({ message: msg })
    }
  })

  // Connect with email/password
  router.post('/connect', async (req, res) => {
    try {
      const { email, password, username, groupName } = req.body;
      console.log(`🔍 POST /api/stremio/connect called with:`, { email, username, groupName })
      console.log(`🔍 Password length:`, password ? password.length : 'undefined')
      console.log(`🔍 Full request body:`, req.body)
      // Redact any sensitive fields from logs
      try {
        const { password: _pw, authKey: _ak, ...rest } = (req.body || {})
        console.log(`🔍 Request fields (redacted):`, rest)
      } catch {}
      
      if (!email || !password) {
        return res.status(400).json({ message: !email ? 'Invalid email' : 'Password is required' });
      }
      if (typeof password !== 'string' || password.length < 4) {
        return res.status(400).json({ message: 'Password must be at least 4 characters' })
      }

      // Use provided username, or fallback to email prefix (Stremio username will be set later)
      const finalUsername = username || email.split('@')[0];

      // Check if user with this email already exists
      let existingUser = null
      try {
        existingUser = await prisma.user.findFirst({
          where: {
            accountId: getAccountId(req),
            OR: [
              { email: email },
              { username: finalUsername }
            ]
          }
        });
      } catch (e) {
        // Gracefully handle missing appAccountId
        return res.status(401).json({ message: 'Authentication required' })
      }

      // Check if user has a valid Stremio connection
      let hasValidStremioConnection = false
      if (existingUser && existingUser.stremioAuthKey) {
        try {
          const decryptedKey = decrypt(existingUser.stremioAuthKey, req)
          const validation = await validateStremioAuthKey(decryptedKey)
          hasValidStremioConnection = !!(validation && validation.user)
        } catch (e) {
          // Invalid auth key - allow reconnection
          hasValidStremioConnection = false
        }
      }

      if (existingUser) {
        // If user exists with valid Stremio connection, return conflict
        if (hasValidStremioConnection) {
          if (AUTH_ENABLED && req.appAccountId && existingUser.accountId === req.appAccountId) {
            return res.status(409).json({
              message: 'User with this email already exists',
              error: 'Email already exists in this account'
            })
          }
          
          // Determine which field caused the conflict
          if (existingUser.username === finalUsername) {
            return res.status(409).json({ 
              message: 'Username already exists',
              error: 'Please choose a different username'
            });
          }
          if (existingUser.email === email) {
            return res.status(409).json({ 
              message: 'User with this email already exists',
              error: 'Email already exists in this account'
            });
          }
          
          return res.status(409).json({ message: 'User already exists' });
        }
        
        // User exists but has invalid/no Stremio connection - allow reconnection
        // We'll update the existing user instead of creating a new one
        console.log(`🔄 User exists with invalid Stremio connection, allowing reconnection: ${existingUser.id}`)
      }

      // Create a temporary storage object for this authentication session
      const tempStorage = {};
      
      // Create Stremio API store for this user
      const apiStore = new StremioAPIStore({
        endpoint: 'https://api.strem.io',
        storage: {
          getJSON: (key) => {
            // Return stored values or appropriate defaults
            if (tempStorage[key] !== undefined) {
              return tempStorage[key];
            }
            switch (key) {
              case 'addons':
                return [];
              case 'user':
                return null;
              case 'auth':
                return null;
              default:
                return null;
            }
          },
          setJSON: (key, value) => {
            // Store in temporary storage during authentication
            tempStorage[key] = value;
            console.log(`Stremio storage set: ${key}`, typeof value);
          }
        }
      });

      // Authenticate with Stremio using email/password only (try both supported signatures)
      const loginEmailOnly = async () => {
        let lastErr
        for (const attempt of [
          () => apiStore.login({ email, password }),
          () => apiStore.login(email, password),
        ]) {
          try {
            await attempt()
            return
          } catch (e) {
            lastErr = e
          }
        }
        throw lastErr
      }
      
      try {
        await loginEmailOnly()
      } catch (e) {
        console.error('Stremio connection error:', e);
        // Auto-register if the user is not found and client didn't explicitly disable it
        const code = e?.response?.data?.code || e?.code
        const registerIfMissing = req.body?.registerIfMissing !== false
        if (code === 2 && registerIfMissing) {
          try {
            // Try to register then login again
            for (const attempt of [
              () => apiStore.register({ email, password }),
              () => apiStore.register(email, password),
            ]) {
              try { await attempt(); break } catch {}
            }
            await loginEmailOnly()
          } catch (regErr) {
            return res.status(401).json({ 
              message: 'User not found',
              error: 'No Stremio account found with this email. Registration attempt failed.'
            });
          }
        } else {
          // Handle specific Stremio API errors
          if (code === 2) {
            return res.status(401).json({ 
              message: 'User not found',
              error: 'No Stremio account found with this email. Please register first or check your credentials.'
            });
          }
          if (code === 3 || e?.wrongPass) {
            return res.status(401).json({ 
              message: 'Invalid password',
              error: 'Incorrect password for this Stremio account.'
            });
          }
          if (code === 26) {
            return res.status(400).json({ 
              message: 'Invalid email address',
              error: 'Please enter a valid email address'
            });
          }
          if (e?.response?.data?.message) {
            return res.status(400).json({ 
              message: e.response.data.message,
              error: 'Stremio authentication failed'
            });
          }
          return res.status(401).json({ message: 'Invalid Stremio credentials' });
        }
      }

      // Pull user's addon collection from Stremio
      await apiStore.pullAddonCollection();

      // Get authentication data from the API store (support both possible keys)
      const authKey = apiStore.authKey || tempStorage.auth || tempStorage.authKey;
      const userData = apiStore.user || tempStorage.user;
      const rawAddonsData = apiStore.addons || tempStorage.addons || {};

      // Serialize addons data to remove functions and keep only serializable data
      const addonsData = JSON.parse(JSON.stringify(rawAddonsData));

      // Verify we have the required authentication data
      if (!authKey || !userData) {
        console.log('Auth debug - authKey:', !!authKey, 'userData:', !!userData);
        console.log('tempStorage keys:', Object.keys(tempStorage));
        return res.status(502).json({
          message: 'Failed to connect to Stremio',
          error: 'Authenticated but missing user data'
        })
      }

      // Encrypt the auth key for secure storage
      const encryptedAuthKey = encrypt(authKey, req);

      // Create or update user in database
      let newUser;
      if (existingUser && !hasValidStremioConnection) {
        // Update existing user with new Stremio connection
        newUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            username: finalUsername,
            email,
            stremioAuthKey: encryptedAuthKey,
            isActive: true,
            colorIndex: req.body.colorIndex || existingUser.colorIndex || 0
          }
        });
        console.log(`✅ Updated existing user with new Stremio connection: ${newUser.id}`)
      } else {
        // Create new user
        newUser = await prisma.user.create({
          data: {
            // Scope to current AppAccount when auth is enabled
            accountId: getAccountId(req),
            username: finalUsername,
            email,
            stremioAuthKey: encryptedAuthKey,
            isActive: true,
            colorIndex: req.body.colorIndex || 0
          }
        });
        console.log(`✅ Created new user: ${newUser.id}`)
      }

      // Handle group assignment if provided
      let assignedGroup = null;
      console.log(`🔍 Group assignment - groupName: "${groupName}", type: ${typeof groupName}`)
      if (groupName && groupName.trim()) {
        try {
          console.log(`🔍 Assigning user to group: "${groupName}"`)
          // Find or create group
          assignedGroup = await prisma.group.findFirst({
            where: {
              name: groupName.trim(),
              accountId: getAccountId(req)
            }
          });
          
          if (!assignedGroup) {
            assignedGroup = await prisma.group.create({
              data: {
                name: groupName.trim(),
                description: `Group created for ${finalUsername}`,
                accountId: getAccountId(req)
              }
            });
          }
          console.log(`🔍 Group found/created:`, assignedGroup)

          // Assign user to group (persist in group's userIds JSON)
          await assignUserToGroup(newUser.id, assignedGroup.id, req)
          console.log(`🔍 User added to group successfully`)
        } catch (groupError) {
          console.error(`❌ Failed to assign user to group:`, groupError)
          // Don't fail the entire user creation if group assignment fails
          console.log(`⚠️ Continuing with user creation despite group assignment failure`)
        }
      } else {
        console.log(`🔍 No group assignment - groupName is empty or undefined`)
      }

      res.status(201).json({
        message: 'Successfully connected to Stremio',
        user: {
          id: newUser.id,
          username: newUser.username
        },
        addonsCount: Object.keys(addonsData).length,
        group: assignedGroup ? {
          id: assignedGroup.id,
          name: assignedGroup.name
        } : null
      });

    } catch (error) {
      // Use centralized error handling
      return handleStremioError(error, res);
    }
  });

  // Connect using existing Stremio authKey (create new Syncio user)
  router.post('/connect-authkey', async (req, res) => {
    try {
      const { username, email, authKey, groupName } = req.body
      if (!authKey) return res.status(400).json({ message: 'authKey is required' })

      // Validate auth key against Stremio (must be an active session)
      let addonsData = {}
      let verifiedUser = null
      try {
        const validation = await validateStremioAuthKey(authKey)
        addonsData = (validation && validation.addons) || {}
        verifiedUser = validation && validation.user ? validation.user : null
      } catch (e) {
        const msg = (e && (e.message || e.error || '')) || ''
        const code = (e && e.code) || 0
        if (code === 1 || /session does not exist/i.test(String(msg))) {
          return res.status(401).json({ message: 'Invalid or expired Stremio auth key' })
        }
        // Treat unknown function/other errors as invalid
        return res.status(400).json({ message: 'Could not validate auth key' })
      }

      // Encrypt and persist
      const encryptedAuthKey = encrypt(authKey, req)

      // Ensure username uniqueness
      const baseUsername = (username || `user_${Math.random().toString(36).slice(2, 8)}`).toLowerCase()
      let finalUsername = baseUsername
      let attempt = 0
      while (await prisma.user.findFirst({ 
        where: { 
          username: finalUsername,
          accountId: getAccountId(req)
        }
      })) {
        attempt += 1
        finalUsername = `${baseUsername}${attempt}`
        if (attempt > 50) break
      }

      const created = await prisma.user.create({
        data: {
          accountId: getAccountId(req),
          email: (verifiedUser?.email || email || `${Date.now()}@example.invalid`).toLowerCase(),
          username: finalUsername,
          stremioAuthKey: encryptedAuthKey,
          isActive: true
        },
      })

      // Optional: create group and add user
      if (groupName) {
        let group = await prisma.group.findFirst({ where: { name: groupName, accountId: getAccountId(req) } })
        if (!group) {
          group = await prisma.group.create({ data: { name: groupName, accountId: getAccountId(req) } })
        }
        // Assign user to group (ensures user is only in one group)
        await assignUserToGroup(created.id, group.id, req)
      }

      // Hide sensitive fields
      delete created.password
      delete created.stremioAuthKey
      return res.json(created)
    } catch (e) {
      console.error('connect-authkey failed:', e)
      return res.status(500).json({ message: 'Failed to connect with authKey' })
    }
  })

  return router;
};
