const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { StremioAPIStore, StremioAPIClient } = require('stremio-api-client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const prisma = new PrismaClient();

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));

// Rate limiting (disabled in dev/local to avoid 429 during hot reload)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'), // generous default
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
});

// Rate limiting is disabled for personal use
// const RATE_LIMIT_ENABLED = (process.env.RATE_LIMIT_ENABLED || 'false').toLowerCase() === 'true';
// if (RATE_LIMIT_ENABLED) {
//   app.use(limiter);
// }

app.use(express.json({ limit: '10mb' }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'), false);
    }
  }
});

// Encryption helpers for sensitive data
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
  ? Buffer.from(process.env.ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32)) 
  : Buffer.from('syncio-default-key-32chars-please-change!!'.substring(0, 32), 'utf8');
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts[0], 'hex');
  const encryptedText = textParts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Validate Stremio auth key by calling official API
async function validateStremioAuthKey(authKey) {
  // 1) Try via official client: request('getUser') and require email
  try {
    const client = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey })
    if (client && typeof client.request === 'function') {
      const userRes = await client.request('getUser')
      if (userRes && userRes.email) {
        return { user: userRes }
      }
      const err = new Error('Missing user email')
      err.code = 1
      throw err
    }
  } catch (e) {
    const msg = (e && (e.message || e.error || '')) || ''
    if (/session does not exist|invalid/i.test(msg) || e.code === 1) {
      const err = new Error('Invalid or expired Stremio auth key')
      err.code = 1
      throw err
    }
    // fall through to HTTP fallback
  }

  // 2) Fallback to HTTP pullUser to verify session
  const resp = await fetch('https://api.strem.io/api/pullUser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authKey })
  })
  const data = await resp.json().catch(() => null)
  if (!resp.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${resp.status}`
    const err = new Error(msg)
    throw err
  }
  if (data && (data.code === 1 || /session does not exist/i.test(String(data.message || '')))) {
    const err = new Error('Invalid or expired Stremio auth key')
    err.code = 1
    throw err
  }
  if (data && data.user && data.user.email) {
    return { user: data.user }
  }
  const err = new Error('Could not validate auth key (no user email)')
  err.code = 1
  throw err
}

// Health check endpoint
const serverStartTime = new Date().toISOString()
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const userCount = await prisma.user.count();
    const addonCount = await prisma.addon.count();
    const groupCount = await prisma.group.count();
    
    res.json({
      status: 'OK',
      message: 'Syncio with Database',
      timestamp: new Date().toISOString(),
      serverStartTime: serverStartTime,
      uptime: process.uptime(),
      database: 'connected',
      users: userCount,
      addons: addonCount,
      groups: groupCount
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// API Routes

// Users API
app.get('/api/users', async (req, res) => {
  console.log('🔍 GET /api/users called');
  try {
    const users = await prisma.user.findMany({
      include: {
        memberships: { 
          include: { 
            group: {
              include: {
                addons: {
                  include: {
                    addon: true
                  },
                  orderBy: { addedAt: 'asc' }
                }
              }
            }
          } 
        },
      },
      orderBy: { createdAt: 'asc' }
    });

    // Transform data for frontend compatibility
    const transformedUsers = await Promise.all(users.map(async (user) => {
      // Calculate addon count from user's group
      const userGroup = user.memberships?.[0]?.group
      const addonCount = userGroup?.addons?.length || 0
      
      // Calculate Stremio addons count by fetching live data
      let stremioAddonsCount = 0
      if (user.stremioAuthKey) {
        try {
          // Decrypt stored auth key
          const authKeyPlain = decrypt(user.stremioAuthKey)
          
          // Use stateless client with authKey to fetch addon collection directly
          const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
          const collection = await apiClient.request('addonCollectionGet', {})
          
          const rawAddons = collection?.addons || collection || {}
          const addonsNormalized = Array.isArray(rawAddons)
            ? rawAddons
            : (typeof rawAddons === 'object' ? Object.values(rawAddons) : [])
          
          stremioAddonsCount = addonsNormalized.length
        } catch (error) {
          console.error(`Error fetching Stremio addons for user ${user.id}:`, error.message)
          // Fallback to database value if live fetch fails
          if (user.stremioAddons) {
            try {
              const parsedAddons = JSON.parse(user.stremioAddons)
              if (Array.isArray(parsedAddons)) {
                stremioAddonsCount = parsedAddons.length
              } else if (typeof parsedAddons === 'object') {
                stremioAddonsCount = Object.keys(parsedAddons).length
              }
            } catch (e) {
              // Fallback for old data format
              if (Array.isArray(user.stremioAddons)) {
                stremioAddonsCount = user.stremioAddons.length
              } else if (typeof user.stremioAddons === 'object') {
                stremioAddonsCount = Object.keys(user.stremioAddons).length
              }
            }
          }
        }
      }
      
      // Parse excluded and protected addons
      let excludedAddons = []
      let protectedAddons = []
      
      try {
        if (user.excludedAddons) {
          excludedAddons = JSON.parse(user.excludedAddons)
        }
      } catch (e) {
        console.error('Error parsing excluded addons for user', user.id, ':', e)
      }
      
      try {
        if (user.protectedAddons) {
          protectedAddons = JSON.parse(user.protectedAddons)
        }
      } catch (e) {
        console.error('Error parsing protected addons for user', user.id, ':', e)
      }
      
      return {
        id: user.id,
        username: user.username || user.stremioUsername,
        email: user.stremioEmail || user.email,
        groupName: userGroup?.name || null,
        status: user.isActive ? 'active' : 'inactive',
        addons: addonCount,
        stremioAddonsCount: stremioAddonsCount,
        groups: user.memberships?.length || 0,
        lastActive: user.lastStremioSync || user.createdAt,
        avatar: null,
        hasStremioConnection: !!user.stremioAuthKey,
        isActive: user.isActive,
        excludedAddons: excludedAddons,
        protectedAddons: protectedAddons
      }
    }));

    res.json(transformedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});


// Get single user with detailed information
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params
    console.log(`🔍 GET /api/users/${id} called`)
    
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            group: {
              include: {
                addons: {
                  include: { addon: true },
                  orderBy: { addedAt: 'asc' }
                }
              }
            }
          }
        }
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Group addons come from the user's primary group assignment
    const familyGroup = user.memberships?.[0]?.group
    const addons = Array.isArray(familyGroup?.addons)
      ? familyGroup.addons
          .map((ga) => ({
            id: ga.addon.id,
            name: ga.addon.name,
            description: ga.addon.description || '',
            manifestUrl: ga.addon.manifestUrl,
            version: ga.addon.version || null,
            isEnabled: ga.addon.isActive,
          }))
      : []

    // Get all groups the user belongs to
    const userGroups = [
      ...user.memberships.map(m => ({ id: m.group.id, name: m.group.name, role: 'member' }))
    ]

    // Calculate Stremio addons count and parse addons data
    let stremioAddonsCount = 0
    let stremioAddons = []
    if (user.stremioAddons) {
      try {
        const parsedAddons = JSON.parse(user.stremioAddons)
        if (Array.isArray(parsedAddons)) {
          stremioAddonsCount = parsedAddons.length
          stremioAddons = parsedAddons
        } else if (typeof parsedAddons === 'object') {
          stremioAddonsCount = Object.keys(parsedAddons).length
          stremioAddons = Object.values(parsedAddons)
        }
      } catch (e) {
        // Fallback for old data format
        if (Array.isArray(user.stremioAddons)) {
          stremioAddonsCount = user.stremioAddons.length
          stremioAddons = user.stremioAddons
        } else if (typeof user.stremioAddons === 'object') {
          stremioAddonsCount = Object.keys(user.stremioAddons).length
          stremioAddons = Object.values(user.stremioAddons)
        }
      }
    }

    // Parse excluded and protected addons from database
    let excludedAddons = []
    let protectedAddons = []
    
    try {
      if (user.excludedAddons) {
        excludedAddons = JSON.parse(user.excludedAddons)
      }
    } catch (e) {
      console.error('Error parsing excluded addons:', e)
    }
    
    try {
      if (user.protectedAddons) {
        protectedAddons = JSON.parse(user.protectedAddons)
      }
    } catch (e) {
      console.error('Error parsing protected addons:', e)
    }

    // Transform for frontend
    const transformedUser = {
      id: user.id,
      displayName: user.displayName,
      email: user.stremioEmail || user.email,
      username: user.stremioUsername || user.username,
      stremioEmail: user.stremioEmail,
      stremioUsername: user.stremioUsername,
      hasStremioConnection: !!user.stremioAuthKey,
      role: user.role.toLowerCase(),
      status: user.isActive ? 'active' : 'inactive',
      addons: addons,
      groups: userGroups,
      groupName: user.memberships?.[0]?.group?.name || null,
      lastActive: user.lastStremioSync || user.updatedAt,
      avatar: null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      stremioAddonsCount: stremioAddonsCount,
      stremioAddons: stremioAddons,
      excludedAddons: excludedAddons,
      protectedAddons: protectedAddons
    }

    res.json(transformedUser)
  } catch (error) {
    console.error('Error fetching user details:', error)
    res.status(500).json({ error: 'Failed to fetch user details' })
  }
})

// Update user excluded addons
app.put('/api/users/:id/excluded-addons', async (req, res) => {
  try {
    const { id } = req.params
    const { excludedAddons } = req.body
    
    console.log(`🔍 PUT /api/users/${id}/excluded-addons called with:`, excludedAddons)
    
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        excludedAddons: JSON.stringify(excludedAddons || [])
      }
    })
    
    res.json({ 
      message: 'Excluded addons updated successfully',
      excludedAddons: excludedAddons || []
    })
  } catch (error) {
    console.error('Error updating excluded addons:', error)
    res.status(500).json({ error: 'Failed to update excluded addons' })
  }
})

// Update user protected addons
app.put('/api/users/:id/protected-addons', async (req, res) => {
  try {
    const { id } = req.params
    const { protectedAddons } = req.body
    
    console.log(`🔍 PUT /api/users/${id}/protected-addons called with:`, protectedAddons)
    
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        protectedAddons: JSON.stringify(protectedAddons || [])
      }
    })
    
    res.json({ 
      message: 'Protected addons updated successfully',
      protectedAddons: protectedAddons || []
    })
  } catch (error) {
    console.error('Error updating protected addons:', error)
    res.status(500).json({ error: 'Failed to update protected addons' })
  }
})

// Get live addons from Stremio for a given user
app.get('/api/users/:id/stremio-addons', async (req, res) => {
  try {
    const { id } = req.params
    console.log('🔍 Fetching Stremio addons for user:', id)
    // Fetch the user's stored Stremio auth
    const user = await prisma.user.findUnique({
      where: { id },
      select: { stremioEmail: true, stremioUsername: true, stremioAuthKey: true, stremioUserId: true }
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (!user.stremioAuthKey) {
      return res.status(400).json({ message: 'User is not connected to Stremio' })
    }

    // Decrypt stored auth key
    let authKeyPlain
    try {
      console.log('🔍 Attempting to decrypt stremioAuthKey for user:', id)
      console.log('🔍 stremioAuthKey length:', user.stremioAuthKey?.length)
      console.log('🔍 stremioAuthKey first 20 chars:', user.stremioAuthKey?.substring(0, 20))
      authKeyPlain = decrypt(user.stremioAuthKey)
      console.log('🔍 Decryption successful, authKey length:', authKeyPlain?.length)
    } catch (e) {
      console.error('🔍 Decryption failed:', e.message)
      return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' })
    }

    // Use stateless client with authKey to fetch addon collection directly
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
    const collection = await apiClient.request('addonCollectionGet', {})

    const rawAddons = collection?.addons || collection || {}
    const addonsNormalized = Array.isArray(rawAddons)
      ? rawAddons
      : (typeof rawAddons === 'object' ? Object.values(rawAddons) : [])

    // Keep only safe serializable fields and fetch manifest data if needed
    const addons = await Promise.all(addonsNormalized.map(async (a) => {
      let manifestData = null
      
      // Always try to fetch manifest if we have a URL and no proper manifest data
      if ((a?.manifestUrl || a?.transportUrl || a?.url) && (!a?.manifest || !a?.name || a.name === 'Unknown')) {
        try {
          const manifestUrl = a?.manifestUrl || a?.transportUrl || a?.url
          console.log(`🔍 Fetching manifest for: ${manifestUrl}`)
          const response = await fetch(manifestUrl)
          if (response.ok) {
            manifestData = await response.json()
            console.log(`✅ Fetched manifest:`, manifestData?.name, manifestData?.version)
          }
        } catch (e) {
          console.warn(`⚠️ Failed to fetch manifest:`, e.message)
        }
      }

      return {
        id: a?.id || a?.manifest?.id || manifestData?.id || 'unknown',
        name: a?.name || a?.manifest?.name || manifestData?.name || 'Unknown',
        manifestUrl: a?.manifestUrl || a?.transportUrl || a?.url || null,
        version: a?.version || a?.manifest?.version || manifestData?.version || null,
        description: a?.description || a?.manifest?.description || manifestData?.description || '',
        // Include manifest object for frontend compatibility - ensure it's never null
        manifest: manifestData || a?.manifest || {
          id: manifestData?.id || a?.manifest?.id || a?.id || 'unknown',
          name: manifestData?.name || a?.manifest?.name || a?.name || 'Unknown',
          version: manifestData?.version || a?.manifest?.version || a?.version || null,
          description: manifestData?.description || a?.manifest?.description || a?.description || '',
          // Include other essential manifest fields to prevent null errors
          types: manifestData?.types || a?.manifest?.types || ['other'],
          resources: manifestData?.resources || a?.manifest?.resources || [],
          catalogs: manifestData?.catalogs || a?.manifest?.catalogs || []
        }
      }
    }))

    return res.json({
      userId: id,
      stremioUsername: user.stremioUsername || null,
      stremioEmail: user.stremioEmail || null,
      count: addons.length,
      addons
    })
  } catch (error) {
    console.error('Error fetching live Stremio addons:', error)
    
    // If Stremio API is down, return empty addons instead of error
    if (error?.message?.includes('response has no result') || 
        error?.message?.toLowerCase().includes('network') ||
        error?.message?.toLowerCase().includes('timeout')) {
      console.warn('⚠️ Stremio API unavailable, returning empty addons')
      return res.json({
        userId: id,
        stremioUsername: user.stremioUsername || null,
        stremioEmail: user.stremioEmail || null,
        count: 0,
        addons: []
      })
    }
    
    return res.status(502).json({ message: 'Failed to fetch addons from Stremio', error: error?.message })
  }
})

// Sync all enabled users' Stremio addons with their group addons
app.post('/api/users/sync-all', async (req, res) => {
  try {
    console.log('🚀 Sync all users endpoint called')
    
    // Get all enabled users
    const users = await prisma.user.findMany({
      where: { isActive: true },
      include: {
        memberships: {
          include: {
            group: {
              include: {
                addons: {
                  include: { addon: true },
                  orderBy: { addedAt: 'asc' }
                }
              }
            }
          }
        }
      }
    })
    
    if (users.length === 0) {
      return res.json({ 
        message: 'No enabled users found to sync',
        syncedCount: 0,
        totalUsers: 0
      })
    }
    
    let syncedCount = 0
    let totalAddons = 0
    const errors = []
    
    console.log(`🔄 Starting sync for ${users.length} enabled users`)
    
    // Sync each user
    for (const user of users) {
      try {
        console.log(`🔄 Syncing user: ${user.username || user.email}`)
        
        // Use the reusable sync function
        const syncResult = await syncUserAddons(user.id, [], 'normal')
        
        if (syncResult.success) {
          syncedCount++
          console.log(`✅ Successfully synced user: ${user.username || user.email}`)
          
          // Collect reload progress if available
          if (syncResult.reloadedCount !== undefined && syncResult.totalAddons !== undefined) {
            totalAddons += syncResult.totalAddons
          }
        } else {
          errors.push(`${user.username || user.email}: ${syncResult.error}`)
          console.log(`❌ Failed to sync user: ${user.username || user.email} - ${syncResult.error}`)
        }
      } catch (error) {
        errors.push(`${user.username || user.email}: ${error.message}`)
        console.error(`❌ Error syncing user ${user.username || user.email}:`, error)
      }
    }
    
    let message = `All users sync completed.\n${syncedCount}/${users.length} users synced`
    
    // Add reload progress if available (show even when 0 reloaded)
    if (totalAddons > 0) {
      message += `\n${totalAddons} addons reloaded`
    }
    
    if (errors.length > 0) {
      console.log('⚠️ Some users failed to sync:', errors)
    }
    
    res.json({
      message,
      syncedCount,
      totalUsers: users.length,
      errors: errors.length > 0 ? errors : undefined
    })
    
  } catch (error) {
    console.error('Error syncing all users:', error)
    res.status(500).json({ 
      message: 'Failed to sync all users', 
      error: error.message 
    })
  }
})

// Sync a user's Stremio addons with their group addons
app.post('/api/users/:id/sync', async (req, res) => {
  try {
    console.log('🚀 Sync endpoint called with:', req.params.id, req.body)
    console.log('🔍 Request headers:', {
      'user-agent': req.headers['user-agent'],
      'origin': req.headers['origin'],
      'x-sync-mode': req.headers['x-sync-mode']
    })
    const { id } = req.params
    const { excludedManifestUrls = [] } = req.body || {}
    const syncMode = getSyncMode(req)

    // Use the reusable sync function
    const syncResult = await syncUserAddons(id, excludedManifestUrls, syncMode)
    
    if (syncResult.success) {
      if (syncResult.alreadySynced) {
        if (syncResult.reloadedCount !== undefined) {
          return res.json({ 
            message: `User is already synced (${syncResult.reloadedCount}/${syncResult.totalAddons} addons reloaded)`, 
            total: syncResult.total 
          })
        }
        return res.json({ message: 'User is already synced', total: syncResult.total })
      }
      if (syncResult.reloadedCount !== undefined) {
        return res.json({ 
          message: `Sync complete (${syncResult.reloadedCount}/${syncResult.totalAddons} addons reloaded)`, 
          total: syncResult.total 
        })
      }
      return res.json({ 
        message: 'Sync complete', 
        total: syncResult.total 
      })
    } else {
      return res.status(500).json({ 
        message: 'Failed to sync addons', 
        error: syncResult.error 
      })
    }
  } catch (error) {
    console.error('Error syncing addons:', error)
    return res.status(500).json({ message: 'Failed to sync addons', error: error?.message })
  }
})

// Add specific addons to user's Stremio account
app.post('/api/users/:id/stremio-addons/add', async (req, res) => {
  try {
    const { id } = req.params
    const { addonUrls } = req.body

    if (!Array.isArray(addonUrls) || addonUrls.length === 0) {
      return res.status(400).json({ message: 'addonUrls array is required' })
    }

    // Load user
    const user = await prisma.user.findUnique({
      where: { id }
    })

    if (!user) return res.status(404).json({ message: 'User not found' })
    if (!user.stremioAuthKey) return res.status(400).json({ message: 'User is not connected to Stremio' })

    // Decrypt auth
    let authKeyPlain
    try { authKeyPlain = decrypt(user.stremioAuthKey) } catch { return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' }) }

    // Use StremioAPIClient with proper addon collection format
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

    // Get current addons
    const current = await apiClient.request('addonCollectionGet', {})
    const currentAddons = current?.addons || []

    // Fetch manifests for new addons to create full addon objects
    const newAddons = []
    for (const url of addonUrls) {
      try {
        console.log(`🔍 Fetching manifest for new addon: ${url}`)
        const manifestResponse = await fetch(url)
        const manifest = await manifestResponse.json()
        
        const addonObject = {
          transportUrl: url,
          transportName: manifest.name || '',
          manifest: manifest
        }
        newAddons.push(addonObject)
        console.log(`✅ Created addon object for: ${manifest.name} ${manifest.version}`)
      } catch (e) {
        console.error(`❌ Failed to fetch manifest for ${url}:`, e.message)
        // Fallback to just transportUrl
        newAddons.push({ transportUrl: url })
      }
    }
    
    // Combine current addons with new addons, preserving full structure
    const updatedAddons = [
      ...currentAddons,
      ...newAddons
    ]

    // Set the updated collection using the proper format
    try {
      await apiClient.request('addonCollectionSet', { addons: updatedAddons })
      console.log(`✅ Successfully added ${addonUrls.length} addons for user ${user.username}`)
      
      // Wait a moment for Stremio to resolve manifests
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (e) {
      console.error(`❌ Failed to add addons:`, e.message)
      throw e
    }

    return res.json({ message: `Successfully added ${addonUrls.length} addons` })
  } catch (error) {
    console.error('Error adding Stremio addons:', error)
    return res.status(500).json({ message: 'Failed to add addons', error: error?.message })
  }
})

// Clear all Stremio addons from user's account
app.post('/api/users/:id/stremio-addons/clear', async (req, res) => {
  try {
    const { id } = req.params

    // Load user
    const user = await prisma.user.findUnique({
      where: { id }
    })

    if (!user) return res.status(404).json({ message: 'User not found' })
    if (!user.stremioAuthKey) return res.status(400).json({ message: 'User is not connected to Stremio' })

    // Decrypt auth
    let authKeyPlain
    try { authKeyPlain = decrypt(user.stremioAuthKey) } catch { return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' }) }

    // Use StremioAPIClient with proper addon collection format
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

    // Clear the entire addon collection using the proper format
    try {
      await apiClient.request('addonCollectionSet', { addons: [] })
      console.log(`✅ Successfully cleared all addons for user ${user.username}`)
    } catch (e) {
      console.error(`❌ Failed to clear addons:`, e.message)
      throw e
    }

    // Update the user's stremioAddons field in the database to empty array
    await prisma.user.update({
      where: { id },
      data: { stremioAddons: JSON.stringify([]) }
    })

    return res.json({ message: 'All addons cleared successfully' })
  } catch (error) {
    console.error('Error clearing Stremio addons:', error)
    return res.status(500).json({ message: 'Failed to clear addons', error: error?.message })
  }
})

// Delete Stremio addon from user's account
app.delete('/api/users/:id/stremio-addons/:addonId', async (req, res) => {
  try {
    const { id, addonId } = req.params
    
    // Define protected addon IDs and URLs that should never be deleted
    const protectedAddonIds = [
      'com.linvo.cinemeta', // Cinemeta
      'org.stremio.local', // Local Files
      'com.stremio.opensubtitles', // OpenSubtitles
      'com.stremio.youtube', // YouTube
    ]
    
    const protectedManifestUrls = [
      'https://v3-cinemeta.strem.io/manifest.json',
      'http://127.0.0.1:11470/local-addon/manifest.json',
      'https://v3-opensubtitles.strem.io/manifest.json',
      'https://v3-youtube.strem.io/manifest.json',
    ]
    
    // Check if the addon being deleted is protected
    const isProtected = protectedAddonIds.some(protectedId => addonId.includes(protectedId)) ||
                       protectedManifestUrls.some(protectedUrl => addonId === protectedUrl)
    
    if (isProtected) {
      return res.status(403).json({ message: 'This addon is protected and cannot be deleted' })
    }
    
    // Fetch the user's stored Stremio auth
    const user = await prisma.user.findUnique({
      where: { id },
      select: { stremioEmail: true, stremioUsername: true, stremioAuthKey: true, stremioUserId: true }
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (!user.stremioAuthKey) {
      return res.status(400).json({ message: 'User is not connected to Stremio' })
    }

    // Decrypt stored auth key
    let authKeyPlain
    try {
      authKeyPlain = decrypt(user.stremioAuthKey)
    } catch (e) {
      return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' })
    }

    // Use StremioAPIClient with proper addon collection format
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

    // 1) Pull current collection
    const current = await apiClient.request('addonCollectionGet', {})
    const currentAddonsRaw = current?.addons || current || []
    const currentAddons = Array.isArray(currentAddonsRaw)
      ? currentAddonsRaw
      : (typeof currentAddonsRaw === 'object' ? Object.values(currentAddonsRaw) : [])

    // Find the target by manifestUrl since all addons have id: "unknown"
    const target = currentAddons.find((a) => (a?.manifestUrl || a?.transportUrl || a?.url || '') === addonId)
    const targetUrl = target?.transportUrl || target?.manifestUrl || target?.url

    // Use proper format to remove the addon
    let filteredAddons = currentAddons
    try {
      // Filter out the target addon (if not found, keep list as-is)
      filteredAddons = currentAddons.filter((a) => {
        const curUrl = a?.manifestUrl || a?.transportUrl || a?.url || ''
        return curUrl !== addonId
      })

      // Set the filtered addons using the proper format
      await apiClient.request('addonCollectionSet', { addons: filteredAddons })
      console.log(`✅ Successfully removed addon using proper format`)
    } catch (e) {
      console.error(`❌ Failed to remove addon:`, e.message)
      throw e
    }

    // Update the user's stremioAddons field in the database with the filtered addons
    await prisma.user.update({
      where: { id },
      data: { stremioAddons: JSON.stringify(filteredAddons || []) }
    })

    return res.json({ message: 'Addon removed from Stremio account successfully' })
  } catch (error) {
    console.error('Error removing Stremio addon:', error)
    return res.status(502).json({ message: 'Failed to remove addon from Stremio', error: error?.message })
  }
})

// Update user
app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { username, email, password, groupName } = req.body
    
    console.log(`🔍 PUT /api/users/${id} called with:`, { username, email, groupName })

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
      include: { memberships: true }
    })

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Prepare update data
    const updateData = {}
    
    if (username !== undefined) {
      updateData.username = username
    }
    
    if (email !== undefined) {
      // Check if email is already taken by another user
      const emailExists = await prisma.user.findFirst({
        where: { 
          AND: [
            { OR: [{ email }, { stremioEmail: email }] },
            { id: { not: id } }
          ]
        }
      })
      
      if (emailExists) {
        return res.status(400).json({ error: 'Email already exists' })
      }
      
      // Update both email fields if it's a Stremio user
      if (existingUser.stremioEmail) {
        updateData.stremioEmail = email
      } else {
        updateData.email = email
      }
    }

    if (password !== undefined && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 12)
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    })

    // Handle group assignment
    console.log(`🔍 Group assignment - groupName: "${groupName}", type: ${typeof groupName}`)
    if (groupName !== undefined) {
      // Always remove user from current member groups first
      await prisma.groupMember.deleteMany({
        where: { userId: id }
      })
      console.log(`🔍 Removed user from all groups`)

      // If a group name is provided and not empty, assign to that group
      if (groupName.trim() !== '') {
        console.log(`🔍 Assigning user to group: "${groupName}"`)
        // Find or create the new group
        let group = await prisma.group.findFirst({
          where: { name: groupName.trim() }
        })
        
        if (!group) {
          group = await prisma.group.create({
            data: {
              name: groupName.trim(),
              description: `Group for ${groupName.trim()}`
            }
          })
        }

        // Add user to the new group
        await prisma.groupMember.create({
          data: {
            userId: id,
            groupId: group.id
          }
        })
      } else {
        console.log(`🔍 Group name is empty, user will have no groups`)
      }
      // If groupName is empty, user is removed from all groups (no additional action needed)
    } else {
      console.log(`🔍 No group assignment - groupName is undefined`)
    }

    // Fetch updated user for response
    const userWithGroups = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        email: true,
        username: true,
        stremioEmail: true,
        stremioUsername: true,
        stremioAddons: true,
        role: true,
        isActive: true,
        lastStremioSync: true,
        createdAt: true,
        _count: {
          select: {
            memberships: true
          }
        }
      }
    })

    // Transform for frontend response
    const transformedUser = {
      id: userWithGroups.id,
      username: userWithGroups.username || userWithGroups.stremioUsername,
      email: userWithGroups.stremioEmail || userWithGroups.email,
      role: userWithGroups.role.toLowerCase(),
      status: userWithGroups.isActive ? 'active' : 'inactive',
      addons: userWithGroups.stremioAddons ? 
        (Array.isArray(userWithGroups.stremioAddons) ? userWithGroups.stremioAddons.length : Object.keys(userWithGroups.stremioAddons).length) : 0,
      groups: userWithGroups._count?.memberships || 0,
      lastActive: userWithGroups.lastStremioSync || userWithGroups.createdAt,
      avatar: null
    }

    // Log activity (temporarily disabled for debugging)
    // try {
    //   await prisma.activityLog.create({
    //     data: {
    //       userId: id,
    //       action: 'GROUP_UPDATED',
    //       details: `User ${transformedUser.username} updated`,
    //       metadata: { updatedFields: Object.keys(updateData), groupName }
    //     }
    //   })
    // } catch (activityLogError) {
    //   console.error('Activity log error (non-critical):', activityLogError)
    //   // Continue without failing the request
    // }

    res.json(transformedUser)
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Patch user (for partial updates like username only)
app.patch('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { username, email, password } = req.body
    
    console.log(`🔍 PATCH /api/users/${id} called with:`, { username, email })
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
      include: { memberships: true }
    })
    
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Prepare update data
    const updateData = {}
    
    if (username !== undefined) {
      // Check if username is already taken by another user
      const usernameExists = await prisma.user.findFirst({
        where: { 
          username,
          id: { not: id }
        }
      })
      
      if (usernameExists) {
        return res.status(400).json({ error: 'Username already exists' })
      }
      
      updateData.username = username
    }
    
    if (email !== undefined) {
      // Check if email is already taken by another user
      const emailExists = await prisma.user.findFirst({
        where: { 
          AND: [
            { OR: [{ email }, { stremioEmail: email }] },
            { id: { not: id } }
          ]
        }
      })
      
      if (emailExists) {
        return res.status(400).json({ error: 'Email already exists' })
      }
      
      // Update both email fields if it's a Stremio user
      if (existingUser.stremioEmail) {
        updateData.stremioEmail = email
      } else {
        updateData.email = email
      }
    }
    
    if (password !== undefined && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10)
      updateData.password = hashedPassword
    }
    
    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        memberships: {
          include: {
            group: true
          }
        }
      }
    })
    
    // Remove sensitive data
    delete updatedUser.password
    delete updatedUser.stremioAuthKey
    
    res.json(updatedUser)
  } catch (error) {
    console.error('Error patching user:', error)
    res.status(500).json({ error: 'Failed to update user', details: error?.message })
  }
})

// Toggle user status (enable/disable)
app.patch('/api/users/:id/toggle-status', async (req, res) => {
  try {
    const { id } = req.params
    const { isActive } = req.body
    
    console.log(`🔍 PATCH /api/users/${id}/toggle-status called with:`, { isActive })
    
    // Update user status
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive: !isActive },
      include: {
        memberships: {
          include: {
            group: true
          }
        }
      }
    })
    
    // Remove sensitive data
    delete updatedUser.password
    delete updatedUser.stremioAuthKey
    
    res.json(updatedUser)
  } catch (error) {
    console.error('Error toggling user status:', error)
    res.status(500).json({ error: 'Failed to toggle user status', details: error?.message })
  }
})

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Ensure user exists
    const existingUser = await prisma.user.findUnique({ where: { id } })
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Delete related records first to avoid FK constraint errors
    await prisma.$transaction([
      prisma.groupMember.deleteMany({ where: { userId: id } }),
      prisma.activityLog.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } })
    ])

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

// Stremio Integration
// Stremio validation endpoint
app.post('/api/stremio/validate', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ valid: false, error: 'Email and password are required' });
    }

    // Create temporary storage for validation
    const tempStorage = {
      user: null,
      auth: null,
      addons: []
    };

    // Initialize StremioAPIStore with temporary storage
    const apiStore = new StremioAPIStore({
      getJSON: (key) => tempStorage[key] || null,
      setJSON: (key, value) => { tempStorage[key] = value; }
    });

    // Try to authenticate with Stremio
    const authResult = await apiStore.login(email, password);
    
    if (authResult && (apiStore.authKey || tempStorage.auth)) {
      res.json({ valid: true });
    } else {
      res.json({ valid: false, error: 'Invalid Stremio credentials' });
    }
  } catch (error) {
    console.error('Stremio validation error:', error);
    
    // Check for specific error types
    if (error.code === 3 || error.message === 'Wrong passphrase') {
      res.json({ valid: false, error: 'Wrong email or password' });
    } else if (error.message && error.message.includes('network')) {
      res.json({ valid: false, error: 'Network error - please try again' });
    } else {
      res.json({ valid: false, error: 'Failed to validate credentials' });
    }
  }
});

app.post('/api/stremio/connect', async (req, res) => {
  try {
    const { displayName, email, password, username, groupName } = req.body;
    console.log(`🔍 POST /api/stremio/connect called with:`, { displayName, email, username, groupName })
    console.log(`🔍 Full request body:`, req.body)
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Use provided username, or fallback to email prefix (Stremio username will be set later)
    const finalUsername = username || email.split('@')[0];

    // Check if user with this email already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email },
          { stremioEmail: email }
        ]
      }
    });

    if (existingUser) {
      return res.status(409).json({ message: 'User with this email already exists' });
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
    await loginEmailOnly()

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
    const encryptedAuthKey = encrypt(authKey);

    // Create user in database
    const newUser = await prisma.user.create({
      data: {
        displayName: finalUsername,
        username: finalUsername,
        email,
        stremioEmail: email,
        stremioUsername: userData?.username || email.split('@')[0],
        stremioAuthKey: encryptedAuthKey,
        stremioUserId: userData?.id,
        stremioAddons: JSON.stringify(addonsData || {}),
        lastStremioSync: new Date(),
        role: 'USER'
      }
    });

    // Handle group assignment if provided
    let assignedGroup = null;
    console.log(`🔍 Group assignment - groupName: "${groupName}", type: ${typeof groupName}`)
    if (groupName && groupName.trim()) {
      try {
        console.log(`🔍 Assigning user to group: "${groupName}"`)
        // Find or create group
        assignedGroup = await prisma.group.findFirst({
          where: { name: groupName.trim() }
        });
        
        if (!assignedGroup) {
          assignedGroup = await prisma.group.create({
            data: {
              name: groupName.trim(),
              description: `Group created for ${finalUsername}`,
            }
          });
        }
        console.log(`🔍 Group found/created:`, assignedGroup)

        // Add user to group
        const groupMember = await prisma.groupMember.create({
          data: {
            userId: newUser.id,
            groupId: assignedGroup.id,
            role: 'MEMBER'
          }
        });
        console.log(`🔍 User added to group successfully:`, groupMember)
      } catch (groupError) {
        console.error(`❌ Failed to assign user to group:`, groupError)
        // Don't fail the entire user creation if group assignment fails
        console.log(`⚠️ Continuing with user creation despite group assignment failure`)
      }
    } else {
      console.log(`🔍 No group assignment - groupName is empty or undefined`)
    }

    // Log activity (non-blocking)
    try {
      await prisma.activityLog.create({
        data: {
          userId: newUser.id,
          action: 'USER_JOINED',
          details: `User connected Stremio account: ${email}${assignedGroup ? ` and joined group: ${assignedGroup.name}` : ''}`,
          metadata: {
            stremioUsername: userData?.username,
            addonCount: Object.keys(addonsData).length,
            groupName: assignedGroup?.name
          }
        }
      });
    } catch (activityErr) {
      console.error('Activity log error (non-critical):', activityErr)
    }

    res.status(201).json({
      message: 'Successfully connected to Stremio',
      user: {
        id: newUser.id,
        username: newUser.username,
        stremioUsername: newUser.stremioUsername
      },
      addonsCount: Object.keys(addonsData).length,
      group: assignedGroup ? {
        id: assignedGroup.id,
        name: assignedGroup.name
      } : null
    });

  } catch (error) {
    console.error('Stremio connection error:', error);
    
    // Handle specific Stremio authentication errors
    if (error.message === 'User not found') {
      return res.status(401).json({ 
        message: 'Invalid Stremio credentials',
        error: 'User not found (check email)'
      });
    }
    if (error.code === 3 || error.wrongPass || error.message?.includes('Wrong passphrase')) {
      return res.status(401).json({ 
        message: 'Invalid Stremio credentials',
        error: 'Wrong email or password'
      });
    }
    
    if (error.message?.includes('Authentication failed') || error.message?.includes('Wrong passphrase')) {
      return res.status(401).json({ 
        message: 'Invalid Stremio credentials',
        error: error.message
      });
    }

    if (error.message?.includes('Network') || error.code === 'ENOTFOUND') {
      return res.status(503).json({ 
        message: 'Unable to connect to Stremio servers',
        error: 'Please check your internet connection and try again'
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to connect to Stremio', 
      error: error.message || 'Unknown error occurred'
    });
  }
});

// Connect using existing Stremio authKey (create new Syncio user)
app.post('/api/stremio/connect-authkey', async (req, res) => {
  try {
    const { displayName, username, email, authKey, groupName } = req.body
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
    const encryptedAuthKey = encrypt(authKey)

    // Ensure username uniqueness
    const baseUsername = (username || `user_${Math.random().toString(36).slice(2, 8)}`).toLowerCase()
    let finalUsername = baseUsername
    let attempt = 0
    while (await prisma.user.findFirst({ where: { username: finalUsername } })) {
      attempt += 1
      finalUsername = `${baseUsername}${attempt}`
      if (attempt > 50) break
    }

    const created = await prisma.user.create({
      data: {
        displayName: displayName || (verifiedUser?.name || verifiedUser?.username || verifiedUser?.email || email || finalUsername || 'User'),
        email: (verifiedUser?.email || email || `${Date.now()}@example.invalid`).toLowerCase(),
        username: finalUsername,
        role: 'USER',
        stremioEmail: verifiedUser?.email || email || null,
        // Stremio does not provide a stable username; keep Syncio username only
        stremioUsername: null,
        stremioAuthKey: encryptedAuthKey,
        stremioAddons: JSON.stringify(addonsData || {}),
      },
    })

    // Optional: create group and add user
    if (groupName) {
      let group = await prisma.group.findFirst({ where: { name: groupName } })
      if (!group) {
        group = await prisma.group.create({ data: { name: groupName } })
      }
      await prisma.groupMember.create({ data: { userId: created.id, groupId: group.id } })
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

// Connect existing user to Stremio using authKey
app.post('/api/users/:id/connect-stremio-authkey', async (req, res) => {
  try {
    const { id } = req.params
    const { authKey } = req.body
    if (!authKey) return res.status(400).json({ message: 'authKey is required' })

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return res.status(404).json({ message: 'User not found' })

    // Validate auth key
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
      return res.status(400).json({ message: 'Could not validate auth key' })
    }

    const encryptedAuthKey = encrypt(authKey)

    const updated = await prisma.user.update({
      where: { id },
      data: {
        stremioAuthKey: encryptedAuthKey,
        stremioAddons: JSON.stringify(addonsData || {}),
        stremioEmail: verifiedUser?.email || undefined,
        // Do not override Syncio username from Stremio
        stremioUsername: undefined,
        email: verifiedUser?.email ? verifiedUser.email.toLowerCase() : undefined,
      },
    })

    delete updated.password
    delete updated.stremioAuthKey
    return res.json(updated)
  } catch (e) {
    console.error('connect-stremio-authkey failed:', e)
    return res.status(500).json({ message: 'Failed to connect existing user with authKey' })
  }
})

// Addons API
app.get('/api/addons', async (req, res) => {
  try {
    const addons = await prisma.addon.findMany({
      // return all addons, both active and inactive
      include: {
        groupAddons: {
          include: {
            group: {
              include: {
                _count: {
                  select: {
                    members: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const transformedAddons = addons.map(addon => {
      // Calculate total users across all groups that have this addon
      const totalUsers = addon.groupAddons.reduce((sum, groupAddon) => {
        return sum + (groupAddon.group._count.members || 0)
      }, 0)
      
      return {
        id: addon.id,
        name: addon.name,
        description: addon.description,
        url: addon.manifestUrl,
        version: addon.version,
        tags: addon.tags || [],
        iconUrl: addon.iconUrl,
        status: addon.isActive ? 'active' : 'inactive',
        users: totalUsers,
        groups: addon.groupAddons.length
      }
    });

    res.json(transformedAddons);
  } catch (error) {
    console.error('Error fetching addons:', error);
    res.status(500).json({ message: 'Failed to fetch addons' });
  }
});


// Enable addon (set isActive=true)
app.put('/api/addons/:id/enable', async (req, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.addon.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Addon not found' })

    const updated = await prisma.addon.update({ where: { id }, data: { isActive: true } })
    return res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      url: updated.manifestUrl,
      version: updated.version,
      tags: updated.tags || [],
      status: updated.isActive ? 'active' : 'inactive',
      users: 0,
      groups: 0
    })
  } catch (error) {
    console.error('Error enabling addon:', error)
    return res.status(500).json({ message: 'Failed to enable addon' })
  }
})

// Disable addon (soft disable, stays in DB and groups)
app.put('/api/addons/:id/disable', async (req, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.addon.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Addon not found' })

    const updated = await prisma.addon.update({ where: { id }, data: { isActive: false } })
    return res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      url: updated.manifestUrl,
      version: updated.version,
      tags: updated.tags || [],
      status: updated.isActive ? 'active' : 'inactive',
      users: 0,
      groups: 0
    })
  } catch (error) {
    console.error('Error disabling addon:', error)
    return res.status(500).json({ message: 'Failed to disable addon' })
  }
})

// Helper: canonicalize manifest URL for duplicate checks
function canonicalizeManifestUrl(raw) {
  if (!raw) return ''
  try {
    let s = String(raw).trim()
    // Remove any leading @ characters users may paste from chats
    s = s.replace(/^@+/, '')
    // Lowercase and strip protocol
    let u = s.replace(/^https?:\/\//i, '').toLowerCase()
    // Strip query string and hash fragments
    u = u.split('?')[0].split('#')[0]
    // Remove trailing '/manifest.json'
    u = u.replace(/\/manifest\.json$/i, '')
    // Remove trailing slashes
    u = u.replace(/\/+$/g, '')
    return u
  } catch {
    return String(raw).trim().toLowerCase()
  }
}

app.post('/api/addons', async (req, res) => {
  try {
    const { url, tags, name, description } = req.body;
    
    if (!url) {
      return res.status(400).json({ message: 'Addon URL is required' });
    }

    const trimmedUrl = String(url).trim()
    const sanitizedUrl = trimmedUrl.replace(/^@+/, '')
    const lowerUrl = sanitizedUrl.toLowerCase()

    // Disallow stremio:// scheme and guide user
    if (lowerUrl.startsWith('stremio://')) {
      return res.status(400).json({ message: 'Invalid URL scheme. Please use http:// or https:// for the manifest URL.' });
    }

    // Exact URL duplicate detection (no canonical fuzzy matching)
    const existingByUrl = await prisma.addon.findFirst({ where: { manifestUrl: sanitizedUrl } })

    // Fetch manifest to populate fields (also used if reactivating)
    let manifestData = null
    try {
      console.log(`🔍 Fetching manifest for new addon: ${sanitizedUrl}`)
      const resp = await fetch(sanitizedUrl)
      if (!resp.ok) {
        return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' })
      }
      manifestData = await resp.json()
      console.log(`✅ Fetched manifest:`, manifestData?.name, manifestData?.version)
    } catch (e) {
      return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' })
    }

    if (existingByUrl) {
      if (existingByUrl.isActive) {
        // Exact same URL already exists and is active: do not modify it; just report conflict
        return res.status(409).json({ message: 'Addon already exists.' })
      }
      // Reactivate and refresh meta for inactive record
      const reactivated = await prisma.addon.update({
        where: { id: existingByUrl.id },
        data: {
          isActive: true,
          // Use provided name or manifest name when reactivating
          name: (name && name.trim()) ? name.trim() : (manifestData?.name || existingByUrl.name),
          description: description || manifestData?.description || existingByUrl.description || '',
          version: manifestData?.version || existingByUrl.version || null,
          tags: Array.isArray(tags) ? tags : (existingByUrl.tags || []),
          iconUrl: manifestData?.logo || existingByUrl.iconUrl || null // Store logo URL from manifest
        },
        select: { id: true, name: true, description: true, manifestUrl: true, version: true, tags: true, isActive: true }
      })
      return res.status(200).json({
        id: reactivated.id,
        name: reactivated.name,
        description: reactivated.description,
        url: reactivated.manifestUrl,
        version: reactivated.version,
        tags: reactivated.tags || [],
        status: reactivated.isActive ? 'active' : 'inactive',
        users: 0,
        groups: 0
      })
    }

    // Auto-unique the name if necessary so different URLs can coexist
    let baseName = name || manifestData?.name || 'Unknown Addon'
    let finalName = baseName
    let suffix = 2
    // Try to avoid Prisma unique constraint on name by adjusting
    while (true) {
      const clash = await prisma.addon.findFirst({ where: { name: { equals: finalName } } })
      if (!clash) break
      finalName = `${baseName} (${suffix})`
      suffix += 1
      if (suffix > 50) break
    }

    // Create new addon (store sanitized URL)
    const addon = await prisma.addon.create({
      data: {
        name: finalName,
        description: description || manifestData?.description || '',
        manifestUrl: sanitizedUrl,
        version: manifestData?.version || null,
        tags: Array.isArray(tags) ? tags.join(',') : (tags || ''),
        iconUrl: manifestData?.logo || null, // Store logo URL from manifest
        isActive: true,
      }
    });

    res.status(201).json({
      id: addon.id,
      name: addon.name,
      description: addon.description,
      url: addon.manifestUrl,
      version: addon.version,
      tags: addon.tags,
      iconUrl: addon.iconUrl,
      status: 'active',
      users: 0,
      groups: 0
    });
  } catch (error) {
    console.error('Error creating addon:', error);
    if (error?.code === 'P2002') {
      // If unique constraint (likely manifestUrl) tripped, return a friendly conflict
      return res.status(409).json({ message: 'Addon already exists.' })
    }
    res.status(500).json({ message: 'Failed to create addon', error: error?.message });
  }
});

// Reload addon manifest and update content
app.post('/api/addons/:id/reload', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the addon
    const addon = await prisma.addon.findUnique({
      where: { id }
    });

    if (!addon) {
      return res.status(404).json({ error: 'Addon not found' });
    }

    if (!addon.manifestUrl) {
      return res.status(400).json({ error: 'Addon has no manifest URL' });
    }

    // Fetch the latest manifest
    let manifestData = null;
    try {
      console.log(`🔍 Reloading manifest for addon: ${addon.name} (${addon.manifestUrl})`);
      const manifestResponse = await fetch(addon.manifestUrl);
      if (manifestResponse.ok) {
        manifestData = await manifestResponse.json();
        console.log(`✅ Reloaded manifest:`, manifestData?.name, manifestData?.version);
      } else {
        throw new Error(`HTTP ${manifestResponse.status}: ${manifestResponse.statusText}`);
      }
    } catch (e) {
      console.error(`❌ Failed to fetch manifest:`, e.message);
      return res.status(400).json({ 
        error: 'Failed to fetch addon manifest',
        details: e.message 
      });
    }

    // Update the addon with fresh manifest data but preserve display name
    const updatedAddon = await prisma.addon.update({
      where: { id },
      data: {
        name: addon.name, // explicitly preserve name
        description: manifestData?.description || addon.description,
        version: manifestData?.version || addon.version,
        // Update logo URL from manifest
        iconUrl: manifestData?.logo || addon.iconUrl || null,
      }
    });

    res.json({
      message: 'Addon reloaded successfully',
      addon: {
        id: updatedAddon.id,
        name: updatedAddon.name,
        description: updatedAddon.description,
        url: updatedAddon.manifestUrl,
        version: updatedAddon.version,
        iconUrl: updatedAddon.iconUrl,
        status: updatedAddon.isActive ? 'active' : 'inactive'
      }
    });
  } catch (error) {
    console.error('Error reloading addon:', error);
    res.status(500).json({ error: 'Failed to reload addon', details: error?.message });
  }
});

app.delete('/api/addons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Ensure addon exists
    const existing = await prisma.addon.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ message: 'Addon not found' })
    }

    // Hard delete: remove relations then delete addon (transaction requires Prisma promises only)
    await prisma.$transaction([
      prisma.groupAddon.deleteMany({ where: { addonId: id } }),
      prisma.addonSetting.deleteMany({ where: { addonId: id } }),
      prisma.addon.delete({ where: { id } })
    ])

    res.json({ message: 'Addon deleted successfully' });
  } catch (error) {
    console.error('Error deleting addon:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Addon not found' })
    }
    res.status(500).json({ message: 'Failed to delete addon', error: error?.message });
  }
});

// Import addons from JSON file
app.post('/api/addons/import', upload.single('file'), async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const file = req.file;
    const fileData = file.buffer.toString('utf8');
    
    let importData;
    try {
      importData = JSON.parse(fileData);
    } catch (parseError) {
      return res.status(400).json({ message: 'Invalid JSON file' });
    }

    // Validate JSON structure
    if (!importData.addons || !Array.isArray(importData.addons)) {
      return res.status(400).json({ message: 'Invalid JSON structure. Expected "addons" array.' });
    }

    let successful = 0;
    let failed = 0;
    let redundant = 0;

    // Process each addon
    for (const addonData of importData.addons) {
      try {
        // Validate required fields
        if (!addonData.transportUrl || !addonData.manifest) {
          console.warn('Skipping addon with missing required fields:', addonData);
          failed++;
          continue;
        }

        const manifest = addonData.manifest;
        const transportUrl = addonData.transportUrl;
        const transportName = addonData.transportName || manifest.name || 'Unknown';

        // Check if addon already exists (by manifestUrl or manifest.id)
        const existingAddon = await prisma.addon.findFirst({
          where: {
            OR: [
              { manifestUrl: transportUrl },
              { manifestUrl: { contains: manifest.id } }
            ]
          }
        });

        if (existingAddon) {
          console.log(`Addon already exists: ${transportName}`);
          redundant++;
          continue;
        }

        // Create new addon
        const newAddon = await prisma.addon.create({
          data: {
            name: transportName,
            description: manifest.description || '',
            manifestUrl: transportUrl,
            version: manifest.version || null,
            tags: [],
            iconUrl: manifest.logo || null,
            isActive: true,
          }
        });

        console.log(`Successfully imported addon: ${transportName}`);
        successful++;

      } catch (addonError) {
        console.error(`Failed to import addon:`, addonError);
        failed++;
      }
    }

    res.json({
      message: 'Import completed',
      successful,
      failed,
      redundant,
      total: importData.addons.length
    });

  } catch (error) {
    console.error('Error importing addons:', error);
    res.status(500).json({ message: 'Failed to import addons', error: error?.message });
  }
});

// Import addons from JSON text
app.post('/api/addons/import-text', async (req, res) => {
  try {
    const { jsonData } = req.body;
    
    if (!jsonData) {
      return res.status(400).json({ message: 'No JSON data provided' });
    }

    let importData;
    try {
      importData = JSON.parse(jsonData);
    } catch (parseError) {
      return res.status(400).json({ message: 'Invalid JSON format' });
    }

    // Validate JSON structure
    if (!importData.addons || !Array.isArray(importData.addons)) {
      return res.status(400).json({ message: 'Invalid JSON structure. Expected "addons" array.' });
    }

    let successful = 0;
    let failed = 0;
    let redundant = 0;

    // Process each addon
    for (const addonData of importData.addons) {
      try {
        // Validate required fields
        if (!addonData.transportUrl || !addonData.manifest) {
          console.warn('Skipping addon with missing required fields:', addonData);
          failed++;
          continue;
        }

        const manifest = addonData.manifest;
        const transportUrl = addonData.transportUrl;
        const transportName = addonData.transportName || manifest.name || 'Unknown';

        // Check if addon already exists (by manifestUrl or manifest.id)
        const existingAddon = await prisma.addon.findFirst({
          where: {
            OR: [
              { manifestUrl: transportUrl },
              { manifestUrl: { contains: manifest.id } }
            ]
          }
        });

        if (existingAddon) {
          console.log(`Addon already exists: ${transportName}`);
          redundant++;
          continue;
        }

        // Create new addon
        const newAddon = await prisma.addon.create({
          data: {
            name: transportName,
            description: manifest.description || '',
            manifestUrl: transportUrl,
            version: manifest.version || null,
            tags: [],
            iconUrl: manifest.logo || null,
            isActive: true,
          }
        });

        console.log(`Successfully imported addon: ${transportName}`);
        successful++;

      } catch (addonError) {
        console.error(`Failed to import addon:`, addonError);
        failed++;
      }
    }

    res.json({
      message: 'Import completed',
      successful,
      failed,
      redundant,
      total: importData.addons.length
    });

  } catch (error) {
    console.error('Error importing addons from text:', error);
    res.status(500).json({ message: 'Failed to import addons', error: error?.message });
  }
});

// Get individual addon details
app.get('/api/addons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const addon = await prisma.addon.findUnique({
      where: { id },
      include: {
        groupAddons: {
          include: {
            group: {
              include: {
                _count: {
                  select: {
                    members: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!addon) {
      return res.status(404).json({ error: 'Addon not found' });
    }

    // Calculate total users across all groups that have this addon
    const totalUsers = addon.groupAddons.reduce((sum, groupAddon) => {
      return sum + (groupAddon.group._count.members || 0)
    }, 0)

    const transformedAddon = {
      id: addon.id,
      name: addon.name,
      description: addon.description,
      url: addon.manifestUrl,
      version: addon.version,
      category: addon.category || 'Other',
      status: addon.isActive ? 'active' : 'inactive',
      users: totalUsers,
      groups: addon.groupAddons.map(ga => ({
        id: ga.group.id,
        name: ga.group.name
      }))
    };

    res.json(transformedAddon);
  } catch (error) {
    console.error('Error fetching addon details:', error);
    res.status(500).json({ error: 'Failed to fetch addon details' });
  }
});

// Update addon
app.put('/api/addons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, url, version, groupIds } = req.body;
    
    console.log(`🔍 PUT /api/addons/${id} called with:`, { name, description, url, groupIds });

    // Check if addon exists
    const existingAddon = await prisma.addon.findUnique({
      where: { id },
      include: { groupAddons: true }
    });

    if (!existingAddon) {
      return res.status(404).json({ error: 'Addon not found' });
    }

    // If URL is provided, validate scheme and fetch manifest to refresh fields
    let manifestData = null;
    let nextUrl = undefined;
    if (url !== undefined) {
      const trimmedUrl = String(url).trim()
      const sanitizedUrl = trimmedUrl.replace(/^@+/, '')
      const lowerUrl = sanitizedUrl.toLowerCase()
      if (lowerUrl.startsWith('stremio://')) {
        return res.status(400).json({ message: 'Invalid URL scheme. Please use http:// or https:// for the manifest URL.' });
      }

      // If changing URL, ensure no other addon already uses it (including canonical similarity)
      const prevCanon = canonicalizeManifestUrl(existingAddon.manifestUrl || '')
      const nextCanon = canonicalizeManifestUrl(sanitizedUrl)
      if (nextCanon !== prevCanon) {
        const all = await prisma.addon.findMany({ select: { id: true, manifestUrl: true } })
        const conflict = all.find((a) => a.id !== id && canonicalizeManifestUrl(a.manifestUrl) === nextCanon)
        if (conflict) {
          return res.status(409).json({ message: 'Another addon already exists with this (similar) URL.' })
        }
      }

      nextUrl = sanitizedUrl;
      try {
        console.log(`🔍 Reloading manifest for updated URL: ${sanitizedUrl}`);
        const resp = await fetch(sanitizedUrl);
        if (!resp.ok) {
          return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' });
        }
        manifestData = await resp.json();
      } catch (e) {
        return res.status(400).json({ message: 'Failed to fetch addon manifest. The add-on URL may be incorrect.' });
      }
    }

    // Prepare update data
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (version !== undefined) updateData.version = version;
    if (nextUrl !== undefined) updateData.manifestUrl = nextUrl;

    if (manifestData) {
      updateData.name = name ?? (existingAddon.name);
      updateData.description = description ?? (manifestData?.description || existingAddon.description || '');
      updateData.version = version ?? (manifestData?.version || existingAddon.version || null);
    }

    const updatedAddon = await prisma.addon.update({
      where: { id },
      data: updateData
    });

    if (groupIds !== undefined) {
      await prisma.groupAddon.deleteMany({ where: { addonId: id } });
      if (Array.isArray(groupIds) && groupIds.length > 0) {
        await prisma.groupAddon.createMany({
          data: groupIds.map((groupId) => ({ addonId: id, groupId }))
        });
      }
    }

    const addonWithGroups = await prisma.addon.findUnique({
      where: { id },
      include: { groupAddons: { include: { group: { include: { _count: { select: { members: true } } } } } } }
    });

    const totalUsers = addonWithGroups.groupAddons.reduce((sum, ga) => sum + (ga.group._count.members || 0), 0)

    const transformedAddon = {
      id: addonWithGroups.id,
      name: addonWithGroups.name,
      description: addonWithGroups.description,
      url: addonWithGroups.manifestUrl,
      version: addonWithGroups.version,
      tags: addonWithGroups.tags || [],
      status: addonWithGroups.isActive ? 'active' : 'inactive',
      users: totalUsers,
      groups: addonWithGroups.groupAddons.length
    };

    res.json(transformedAddon);
  } catch (error) {
    console.error('Error updating addon:', error);
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Conflict: duplicate field' })
    }
    res.status(500).json({ error: 'Failed to update addon' });
  }
});

// Groups API
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      include: {
        _count: {
          select: {
            members: true,
            addons: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc' // Consistent ordering by creation date
      }
    });

    const transformedGroups = groups.map(group => ({
      id: group.id,
      name: group.name,
      description: group.description,
      members: group._count.members,
      addons: group._count.addons,
      restrictions: 'none', // TODO: Implement restrictions logic
      createdAt: group.createdAt,
      isActive: group.isActive,
      // Expose color for UI. We reuse `avatar` column to store the color token/hex.
      color: group.avatar || 'purple'
    }));

    res.json(transformedGroups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Failed to fetch groups' });
  }
});

// Debug endpoint to inspect addon data
app.get('/api/debug/addon/:name', async (req, res) => {
  try {
    const { name } = req.params
    const addon = await prisma.addon.findFirst({
      where: {
        OR: [
          { name: { contains: name } }
        ]
      }
    })
    
    if (!addon) {
      return res.status(404).json({ error: 'Addon not found' })
    }
    
    res.json({
      id: addon.id,
      name: addon.name,
      version: addon.version,
      description: addon.description,
      manifestUrl: addon.manifestUrl,
      manifest: addon.manifest,
      createdAt: addon.createdAt,
      updatedAt: addon.updatedAt
    })
  } catch (error) {
    console.error('Error fetching addon debug info:', error)
    res.status(500).json({ error: 'Failed to fetch addon debug info' })
  }
})

// Debug endpoint to update addon data
app.put('/api/debug/addon/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, version, description, manifest } = req.body
    
    const updatedAddon = await prisma.familyAddon.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(version && { version }),
        ...(description && { description }),
        ...(manifest && { manifest })
      }
    })
    
    res.json({
      id: updatedAddon.id,
      name: updatedAddon.name,
      version: updatedAddon.version,
      description: updatedAddon.description,
      manifestUrl: updatedAddon.manifestUrl,
      manifest: updatedAddon.manifest,
      updatedAt: updatedAddon.updatedAt
    })
  } catch (error) {
    console.error('Error updating addon:', error)
    res.status(500).json({ error: 'Failed to update addon' })
  }
})

// Debug endpoint to inspect current addons from Stremio
app.get('/api/debug/current-addons/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    
    // Get user with Stremio connection
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            group: {
              include: {
                addons: {
                  include: {
                    addon: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!user.stremioAuthKey) {
      return res.status(400).json({ error: 'User not connected to Stremio' })
    }

    // Decrypt auth
    let authKeyPlain
    try { 
      authKeyPlain = decrypt(user.stremioAuthKey) 
    } catch { 
      return res.status(400).json({ error: 'Failed to decrypt Stremio credentials' })
    }

    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
    
    // Get current addons from Stremio
    const current = await apiClient.request('addonCollectionGet', {})
    const currentAddonsRaw = current?.addons || current || []
    const currentAddons = Array.isArray(currentAddonsRaw) ? currentAddonsRaw : (typeof currentAddonsRaw === 'object' ? Object.values(currentAddonsRaw) : [])

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      currentAddons: currentAddons.map(a => ({
        name: a?.manifest?.name || a?.name,
        transportName: a?.transportName,
        id: a?.manifest?.id || a?.id,
        version: a?.manifest?.version,
        description: a?.manifest?.description,
        transportUrl: a?.transportUrl,
        manifestUrl: a?.manifestUrl,
        url: a?.url,
        manifest: a?.manifest
      }))
    })
  } catch (error) {
    console.error('Error in debug current addons:', error)
    res.status(500).json({ error: 'Failed to get current addons' })
  }
})

// Debug endpoint to test sync without actually syncing
app.get('/api/debug/sync/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    
    // Get user with group and addons
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            group: {
              include: {
                addons: {
                  include: {
                    addon: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const familyGroup = user.memberships?.[0]?.group
    const familyAddons = Array.isArray(familyGroup?.addons)
      ? familyGroup.addons
          .filter((ga) => (ga?.isEnabled !== false) && (ga?.addon?.isActive !== false))
          .map((ga) => ({
            id: ga.addon.id,
            name: ga.addon.name,
            version: ga.addon.version,
            description: ga.addon.description,
            manifestUrl: ga.addon.manifestUrl,
            manifest: ga.addon.manifest,
          }))
      : []

    // Test manifest fetching
    const testResults = []
    for (const fa of familyAddons) {
      try {
        const resp = await fetch(fa.manifestUrl)
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
        }
        const manifest = await resp.json()
        
        const safeManifest = {
          id: manifest?.id || 'unknown',
          name: manifest?.name || fa.name || 'Unknown',
          version: manifest?.version || '1.0.0',
          description: manifest?.description || fa.description || '',
          ...manifest
        }
        
        testResults.push({
          databaseData: fa,
          liveManifest: manifest,
          safeManifest: safeManifest,
          finalAddon: {
            transportUrl: fa.manifestUrl,
            transportName: safeManifest.name,
            manifest: safeManifest,
          }
        })
      } catch (e) {
        testResults.push({
          databaseData: fa,
          error: e.message,
          fallbackManifest: {
            id: fa.id || 'unknown',
            name: fa.name || 'Unknown',
            version: fa.version || '1.0.0',
            description: fa.description || '',
          }
        })
      }
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      group: {
        id: familyGroup?.id,
        name: familyGroup?.name
      },
      familyAddons: familyAddons,
      testResults: testResults
    })
  } catch (error) {
    console.error('Error in debug sync:', error)
    res.status(500).json({ error: 'Failed to debug sync' })
  }
})

// Create new group
app.post('/api/groups', async (req, res) => {
  try {
    const { name, description, color } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    // Check if group with same name exists
    const existingGroup = await prisma.group.findFirst({
      where: { name: name.trim() }
    });

    if (existingGroup) {
      return res.status(400).json({ message: 'Group with this name already exists' });
    }

    const newGroup = await prisma.group.create({
      data: {
        name: name.trim(),
        description: description || '',
        // Store selected color token or hex in `avatar` field
        avatar: color || 'purple',
      }
    });

    res.status(201).json({
      id: newGroup.id,
      name: newGroup.name,
      description: newGroup.description,
      members: 0,
      addons: 0,
      restrictions: 'none',
      createdAt: newGroup.createdAt,
      isActive: newGroup.isActive,
      color: newGroup.avatar || 'purple',
    });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ message: 'Failed to create group', error: error?.message });
  }
});

// Clone group
app.post('/api/groups/clone', async (req, res) => {
  try {
    const { originalGroupId } = req.body;
    
    if (!originalGroupId) {
      return res.status(400).json({ message: 'Original group ID is required' });
    }

    // Get the original group with its addons
    const originalGroup = await prisma.group.findUnique({
      where: { id: originalGroupId },
      include: {
        addons: {
          include: {
            addon: true
          }
        }
      }
    });

    if (!originalGroup) {
      return res.status(404).json({ message: 'Original group not found' });
    }

    // Generate unique name with Copy #X pattern
    let newName = `${originalGroup.name} Copy`;
    let copyNumber = 1;
    
    while (true) {
      const existingGroup = await prisma.group.findFirst({
        where: { name: newName }
      });
      
      if (!existingGroup) {
        break;
      }
      
      copyNumber++;
      newName = `${originalGroup.name} Copy #${copyNumber}`;
    }

    // Create the new group
    const clonedGroup = await prisma.group.create({
      data: {
        name: newName.trim(),
        description: `Copy of ${originalGroup.name}`,
      }
    });

    // Clone all addons from the original group
    if (originalGroup.addons && originalGroup.addons.length > 0) {
      const addonData = originalGroup.addons.map(groupAddon => ({
        groupId: clonedGroup.id,
        addonId: groupAddon.addonId,
        isEnabled: groupAddon.isEnabled || true,
        settings: groupAddon.settings
      }));

      await prisma.groupAddon.createMany({
        data: addonData
      });
    }

    // Return the cloned group with addons
    const clonedGroupWithAddons = await prisma.group.findUnique({
      where: { id: clonedGroup.id },
      include: {
        addons: {
          include: {
            addon: true
          }
        }
      }
    });

    res.status(201).json({
      message: 'Group cloned successfully',
      group: clonedGroupWithAddons
    });
  } catch (error) {
    console.error('Error cloning group:', error);
    res.status(500).json({ message: 'Failed to clone group', error: error?.message });
  }
});

// Find or create group
app.post('/api/groups/find-or-create', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    const group = await prisma.group.upsert({
      where: { name: name.trim() },
      update: {},
      create: {
        name: name.trim(),
        description: `Auto-created group: ${name.trim()}`,
      }
    });

    res.json(group);
  } catch (error) {
    console.error('Error finding/creating group:', error);
    res.status(500).json({ message: 'Failed to find or create group' });
  }
});

// Get group details with users and addons
app.get('/api/groups/:id', async (req, res) => {
  try {
    const { id } = req.params
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        members: { include: { user: true } },
        addons: { 
          include: { addon: true },
          orderBy: { addedAt: 'asc' }
        },
      }
    })
    if (!group) return res.status(404).json({ message: 'Group not found' })
    const memberUsers = group.members.map((m) => ({ id: m.user.id, username: m.user.username, email: m.user.email }))
    res.json({
      id: group.id,
      name: group.name,
      description: group.description,
      createdAt: group.createdAt,
      users: memberUsers,
      addons: group.addons.map((ga) => ({ 
        id: ga.addon.id, 
        name: ga.addon.name, 
        description: ga.addon.description || '',
        url: ga.addon.manifestUrl,
        version: ga.addon.version || null,
        isEnabled: ga.addon.isActive,
      })),
    })
  } catch (error) {
    console.error('Error fetching group detail:', error)
    res.status(500).json({ message: 'Failed to fetch group detail', error: error?.message })
  }
})

// Update group fields and membership/addons
app.put('/api/groups/:id', async (req, res) => {
  const { id } = req.params
  const { name, description, userIds = [], addonIds = [] } = req.body
  try {
    const group = await prisma.group.findUnique({ 
      where: { id }, 
      include: { 
        members: true, 
        addons: {
          include: {
            addon: true
          }
        }
      } 
    })
    if (!group) return res.status(404).json({ message: 'Group not found' })

    // Update basic fields (ignore empty strings)
    const nextName = (typeof name === 'string' && name.trim() === '') ? undefined : name
    const nextDesc = (typeof description === 'string' && description.trim() === '') ? undefined : description
    await prisma.group.update({ where: { id }, data: { name: nextName ?? group.name, description: nextDesc ?? group.description } })

    // Sync members
    const currentUserIds = new Set(group.members.map((m) => m.userId))
    const desiredUserIds = new Set(Array.isArray(userIds) ? userIds : [])
    const toRemoveMembers = group.members.filter((m) => !desiredUserIds.has(m.userId)).map((m) => m.userId)
    const toAddMembers = [...desiredUserIds].filter((uid) => !currentUserIds.has(uid))

    // Enforce one-group-per-user rule:
    // - remove desired users from any other groups
    // - then ensure membership in this group
    await prisma.$transaction([
      prisma.groupMember.deleteMany({ where: { groupId: id, userId: { in: toRemoveMembers } } }),
      // Remove all memberships for users we are adding (from other groups)
      prisma.groupMember.deleteMany({ where: { userId: { in: toAddMembers } } }),
      ...toAddMembers.map((uid) => prisma.groupMember.upsert({
        where: { userId_groupId: { userId: uid, groupId: id } },
        update: { role: 'MEMBER' },
        create: { groupId: id, userId: uid, role: 'MEMBER' },
      })),
    ])

    // Sync addons only if addonIds is provided
    if (addonIds !== undefined) {
      const currentAddonIds = new Set(group.addons.map((ga) => ga.addonId))
      const desiredAddonIds = new Set(Array.isArray(addonIds) ? addonIds : [])
      const toRemoveAddons = group.addons.filter((ga) => !desiredAddonIds.has(ga.addonId)).map((ga) => ga.addonId)
      const toAddAddons = [...desiredAddonIds].filter((aid) => !currentAddonIds.has(aid))

      await prisma.$transaction([
        prisma.groupAddon.deleteMany({ where: { groupId: id, addonId: { in: toRemoveAddons } } }),
        ...toAddAddons.map((aid) => prisma.groupAddon.upsert({
          where: { groupId_addonId: { groupId: id, addonId: aid } },
          update: { isEnabled: true },
          create: { groupId: id, addonId: aid, isEnabled: true },
        })),
      ])
    }

    return res.json({ message: 'Group updated successfully' })
  } catch (error) {
    console.error('Error updating group:', error)
    res.status(500).json({ message: 'Failed to update group', error: error?.message })
  }
})

// Delete a group (hard delete and detach users/addons)
app.delete('/api/groups/:id', async (req, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.group.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ message: 'Group not found' })
    }

    await prisma.$transaction([
      prisma.groupMember.deleteMany({ where: { groupId: id } }),
      prisma.groupAddon.deleteMany({ where: { groupId: id } }),
      prisma.activityLog.deleteMany({ where: { groupId: id } }),
      prisma.group.delete({ where: { id } }),
    ])

    return res.json({ message: 'Group deleted and members/addons detached' })
  } catch (error) {
    console.error('Error deleting group:', error)
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Group not found' })
    }
    return res.status(500).json({ message: 'Failed to delete group', error: error?.message })
  }
})

// Toggle group status (enable/disable)
app.patch('/api/groups/:id/toggle-status', async (req, res) => {
  try {
    const { id } = req.params
    const { isActive } = req.body
    
    console.log(`🔍 PATCH /api/groups/${id}/toggle-status called with:`, { isActive })
    
    // Update group status
    const updatedGroup = await prisma.group.update({
      where: { id },
      data: { isActive: !isActive },
      include: {
        members: {
          include: {
            user: true
          }
        },
        addons: {
          include: {
            addon: true
          }
        }
      }
    })
    
    res.json(updatedGroup)
  } catch (error) {
    console.error('Error toggling group status:', error)
    res.status(500).json({ error: 'Failed to toggle group status', details: error?.message })
  }
})

// Helper function to get sync mode from request headers or default to normal
function getSyncMode(req) {
  const syncMode = req?.headers?.['x-sync-mode'] || 'normal'
  return syncMode === 'advanced' ? 'advanced' : 'normal'
}

// Reusable function to sync a single user's addons
async function syncUserAddons(userId, excludedManifestUrls = [], syncMode = 'normal') {
  try {
    console.log('🚀 Syncing user addons:', userId, { excludedManifestUrls })

    // Load user, their first group and its addons
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            group: {
              include: {
                addons: { 
                  include: { addon: true },
                  orderBy: { addedAt: 'asc' }
                }
              }
            }
          }
        }
      }
    })

    if (!user) return { success: false, error: 'User not found' }
    if (!user.isActive) return { success: false, error: 'User is disabled' }
    if (!user.stremioAuthKey) return { success: false, error: 'User is not connected to Stremio' }

    const excludedSet = new Set(
      Array.isArray(excludedManifestUrls) ? excludedManifestUrls.map((u) => String(u).trim()) : []
    )

    const familyGroup = user.memberships?.[0]?.group
    const familyAddons = Array.isArray(familyGroup?.addons)
      ? familyGroup.addons
          .sort((a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0)) // Sort by addedAt to match API order
          .filter((ga) => ga?.addon?.isActive !== false)
          .map((ga) => ({
            id: ga.addon.id,
            name: ga.addon.name,
            version: ga.addon.version,
            description: ga.addon.description,
            manifestUrl: ga.addon.manifestUrl,
            manifest: ga.addon.manifest,
          }))
          .filter((fa) => fa?.manifestUrl && !excludedSet.has(fa.manifestUrl))
      : []

    console.log('🔍 Group addons from database:', JSON.stringify(familyAddons, null, 2))

    // Advanced sync: reload all group addons first
    let reloadedCount = 0
    let totalAddons = familyAddons.length
    
    if (syncMode === 'advanced') {
      console.log('🔄 Advanced sync mode: reloading all group addons first...')
      for (const fa of familyAddons) {
        try {
          console.log(`🔄 Reloading addon: ${fa.name} (${fa.manifestUrl})`)
          
          // Fetch fresh manifest
          const response = await fetch(fa.manifestUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000)
          })
          
          if (response.ok) {
            const manifestData = await response.json()
            
            // Update the addon in database with fresh data
            await prisma.addon.update({
              where: { id: fa.id },
              data: {
                name: manifestData?.name || fa.name,
                description: manifestData?.description || fa.description,
                version: manifestData?.version || fa.version,
                manifest: manifestData,
                iconUrl: manifestData?.logo || null,
              }
            })
            
            console.log(`✅ Successfully reloaded: ${fa.name}`)
            reloadedCount++
          } else {
            console.warn(`⚠️ Failed to reload ${fa.name}: ${response.status}`)
          }
        } catch (error) {
          console.warn(`⚠️ Error reloading ${fa.name}:`, error.message)
        }
      }
      
      // Reload the group addons from database to get updated data
      const updatedFamilyGroup = await prisma.group.findUnique({
        where: { id: familyGroup.id },
        include: {
          addons: { 
            include: { addon: true },
            where: { isEnabled: { not: false } }
          }
        }
      })
      
      const updatedFamilyAddons = Array.isArray(updatedFamilyGroup?.addons)
        ? updatedFamilyGroup.addons
            .filter((ga) => (ga?.isEnabled !== false) && (ga?.addon?.isActive !== false))
            .map((ga) => ({
              id: ga.addon.id,
              name: ga.addon.name,
              version: ga.addon.version,
              description: ga.addon.description,
              manifestUrl: ga.addon.manifestUrl,
              manifest: ga.addon.manifest,
            }))
            .filter((fa) => fa?.manifestUrl && !excludedSet.has(fa.manifestUrl))
        : []
      
      console.log('🔍 Updated group addons after reload:', JSON.stringify(updatedFamilyAddons, null, 2))
      
      // Use updated addons for sync
      familyAddons.splice(0, familyAddons.length, ...updatedFamilyAddons)
    }

    // Decrypt auth
    let authKeyPlain
    try { authKeyPlain = decrypt(user.stremioAuthKey) } catch { return { success: false, error: 'Failed to decrypt Stremio credentials' } }

    // Create StremioAPIClient for this user
    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

    // Helper function for URL normalization
    const normalize = (s) => (s || '').toString().trim().toLowerCase()

    // Protected Stremio addons (never remove)
    const protectedAddonIds = new Set([
      'com.linvo.cinemeta',
      'org.stremio.local',
      'com.stremio.opensubtitles',
      'com.stremio.youtube',
    ])
    const protectedManifestUrls = new Set([
      'https://v3-cinemeta.strem.io/manifest.json',
      'http://127.0.0.1:11470/local-addon/manifest.json',
      'https://v3-opensubtitles.strem.io/manifest.json',
      'https://v3-youtube.strem.io/manifest.json',
    ].map(normalize))

    const isProtected = (a) => {
      const aid = a?.id || a?.manifest?.id || ''
      const url = normalize(a?.manifestUrl || a?.transportUrl || a?.url)
      return protectedAddonIds.has(aid) || protectedManifestUrls.has(url)
    }

    // Pull current collection
    const current = await apiClient.request('addonCollectionGet', {})
    const currentAddonsRaw = current?.addons || current || []
    const currentAddons = Array.isArray(currentAddonsRaw) ? currentAddonsRaw : (typeof currentAddonsRaw === 'object' ? Object.values(currentAddonsRaw) : [])
    console.log('📥 Current addons from Stremio:', currentAddons?.length || 0)
    console.log('📊 Current addons details:', currentAddons.map(a => ({ 
      name: a?.manifest?.name || a?.name, 
      transportName: a?.transportName,
      id: a?.manifest?.id || a?.id,
      url: normalize(a?.transportUrl || a?.manifestUrl || a?.url),
      protected: isProtected(a)
    })))

    // Build desired group addon objects (fetch manifests with fallback to stored data)
    const desiredGroup = []
    for (const fa of familyAddons) {
      try {
        const resp = await fetch(fa.manifestUrl)
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
        }
        const manifest = await resp.json()
        console.log(`🔍 Live manifest fetched for ${fa.name}:`, JSON.stringify(manifest, null, 2))
        
        // Ensure manifest has required fields
        const safeManifest = {
          id: manifest?.id || 'unknown',
          name: manifest?.name || fa.name || 'Unknown',
          version: manifest?.version || '1.0.0', // Default version if null
          description: manifest?.description || fa.description || '',
          ...manifest // Include all other manifest fields
        }
        console.log(`🔍 Safe manifest created:`, JSON.stringify(safeManifest, null, 2))
        
        desiredGroup.push({
          transportUrl: fa.manifestUrl,
          transportName: safeManifest.name,
          manifest: safeManifest,
        })
      } catch (e) {
        console.warn(`⚠️ Failed to fetch manifest for ${fa.manifestUrl}:`, e.message)
        
        // Always include the addon, even if we can't fetch the live manifest
        // Use stored manifest from the database as fallback
        let fallbackManifest
        if (fa.manifest && typeof fa.manifest === 'object') {
          // Use the stored manifest JSON if available
          fallbackManifest = {
            id: fa.manifest.id || fa.id || 'unknown',
            name: fa.manifest.name || fa.name || 'Unknown',
            version: fa.manifest.version || fa.version || '1.0.0',
            description: fa.manifest.description || fa.description || '',
            types: fa.manifest.types || ['other'],
            resources: fa.manifest.resources || [],
            catalogs: fa.manifest.catalogs || [],
            ...fa.manifest // Include all other manifest fields
          }
          console.log(`🔍 Using stored manifest for ${fa.name}:`, JSON.stringify(fallbackManifest, null, 2))
        } else {
          // Fallback to database fields if no stored manifest
          fallbackManifest = {
            id: fa.id || 'unknown',
            name: fa.name || 'Unknown',
            version: fa.version || '1.0.0',
            description: fa.description || '',
            types: ['other'],
            resources: [],
            catalogs: []
          }
          console.log(`🔍 Using database fields for ${fa.name}:`, JSON.stringify(fallbackManifest, null, 2))
        }
        
        desiredGroup.push({ 
          transportUrl: fa.manifestUrl,
          transportName: fallbackManifest.name,
          manifest: fallbackManifest
        })
        
        if (e.message.includes('429') || e.message.includes('Too Many Requests')) {
          console.warn(`⏭️ Using stored manifest due to rate limiting: ${fallbackManifest.name}`)
        } else {
          console.warn(`⏭️ Using stored manifest due to fetch error: ${fallbackManifest.name}`)
        }
      }
    }

    // Filter out protected group addons - only sync non-protected group addons
    const nonProtectedGroupAddons = desiredGroup.filter(addon => !isProtected(addon))
    console.log('📊 Group addons details:', nonProtectedGroupAddons.map(a => ({ 
      name: a?.manifest?.name || a?.name, 
      id: a?.manifest?.id || a?.id,
      url: normalize(a?.transportUrl || a?.manifestUrl || a?.url)
    })))

    // Build desired collection: first add all protected addons, then add all group addons
    const desiredCollection = []
    
    console.log('🔍 Current addons order:', currentAddons.map(a => ({ 
      name: a?.manifest?.name || a?.name, 
      protected: isProtected(a),
      url: normalize(a?.transportUrl || a?.manifestUrl || a?.url)
    })))
    console.log('🔍 Excluded addons:', excludedManifestUrls)
    console.log('🔍 Current addons count:', currentAddons.length)
    
    console.log('🔍 Group addons order:', nonProtectedGroupAddons.map(a => ({ 
      name: a?.manifest?.name || a?.name, 
      url: normalize(a?.transportUrl || a?.manifestUrl || a?.url)
    })))

    // First, add all protected addons from current addons
    for (const currentAddon of currentAddons) {
      if (isProtected(currentAddon)) {
        console.log(`🔒 Preserved protected addon: ${currentAddon?.manifest?.name || currentAddon?.name}`)
        desiredCollection.push(currentAddon)
      }
    }

    // Then, add all group addons in their defined order (only non-excluded ones)
    for (const groupAddon of nonProtectedGroupAddons) {
      console.log(`➕ Added group addon: ${groupAddon?.manifest?.name || groupAddon?.name}`)
      desiredCollection.push(groupAddon)
    }

    // Remove any current addons that are excluded (not in the desired collection)
    // This ensures excluded addons are removed from the user's account
    const desiredUrls = new Set(desiredCollection.map(a => normalize(a?.transportUrl || a?.manifestUrl || a?.url)))
    const excludedUrls = new Set(excludedManifestUrls.map(url => normalize(url)))
    
    console.log('🔍 Excluded URLs to remove:', Array.from(excludedUrls))
    console.log('🔍 Desired URLs to keep:', Array.from(desiredUrls))
    
    // Filter out any current addons that are excluded and not protected
    const filteredCurrentAddons = currentAddons.filter(currentAddon => {
      const currentUrl = normalize(currentAddon?.transportUrl || currentAddon?.manifestUrl || currentAddon?.url)
      const isExcluded = excludedUrls.has(currentUrl)
      const isCurrentAddonProtected = isProtected(currentAddon)
      
      if (isExcluded && !isCurrentAddonProtected) {
        console.log(`➖ Removing excluded addon: ${currentAddon?.manifest?.name || currentAddon?.name}`)
        return false
      }
      
      return true
    })
    
    // Update the desired collection to only include non-excluded addons
    const finalDesiredCollection = desiredCollection.filter(addon => {
      const addonUrl = normalize(addon?.transportUrl || addon?.manifestUrl || addon?.url)
      return !excludedUrls.has(addonUrl)
    })
    
    console.log('🔍 Final desired collection (excluding excluded addons):', finalDesiredCollection.map(a => ({ 
      name: a?.manifest?.name || a?.name, 
      protected: isProtected(a),
      url: normalize(a?.transportUrl || a?.manifestUrl || a?.url)
    })))
    
    console.log('🔒 Protected addons preserved in their positions:', currentAddons.filter(a => isProtected(a)).map(a => ({ 
      name: a?.manifest?.name || a?.name, 
      transportName: a?.transportName,
      id: a?.manifest?.id || a?.id,
      version: a?.manifest?.version
    })))

    // Early no-op check: if current collection already equals desired, skip update
    // Compare the entire desired collection with current collection
    const toKey = (a) => {
      const id = a?.manifest?.id || a?.id || ''
      const url = normalize(a?.transportUrl || a?.manifestUrl || a?.url)
      return `${id}@@${url}`
    }
    const currentKeys = new Set(currentAddons.map(toKey))
    const desiredKeys = new Set(finalDesiredCollection.map(toKey))
    const sameSize = currentKeys.size === desiredKeys.size
    let allMatch = sameSize
    if (allMatch) {
      for (const k of desiredKeys) { if (!currentKeys.has(k)) { allMatch = false; break } }
    }
    // If sets match, also ensure order matches exactly
    let curSeq, desSeq
    if (allMatch) {
      curSeq = currentAddons.map((a) => normalize(a?.transportUrl || a?.manifestUrl || a?.url))
      desSeq = finalDesiredCollection.map((a) => normalize(a?.transportUrl || a?.manifestUrl || a?.url))
      if (curSeq.length !== desSeq.length) {
        allMatch = false
      } else {
        for (let i = 0; i < curSeq.length; i++) {
          if (curSeq[i] !== desSeq[i]) { allMatch = false; break }
        }
      }
    }
    if (allMatch) {
      console.log('✅ Collections match, but ensuring Stremio API is updated...')
      console.log('🔍 Current sequence:', curSeq)
      console.log('🔍 Desired sequence:', desSeq)
      
      // Even if collections match, push to Stremio API to ensure order is correct
      try {
        await apiClient.request('addonCollectionSet', { addons: finalDesiredCollection })
        console.log('✅ Pushed addon collection to Stremio API')
      } catch (error) {
        console.error('Error pushing to Stremio API:', error)
        return res.status(502).json({ message: 'Failed to update Stremio addons', error: error?.message })
      }
      
      const total = currentAddons.length
      
      // Update user's stremioAddons field
      try {
        await prisma.user.update({
          where: { id: userId },
          data: {
            stremioAddons: JSON.stringify(finalDesiredCollection || [])
          }
        })
        console.log('💾 Updated user stremioAddons in database')
      } catch (updateError) {
        console.warn('⚠️ Failed to update user stremioAddons:', updateError.message)
      }
      
      if (syncMode === 'advanced') {
        return { 
          success: true, 
          total, 
          alreadySynced: false, 
          reloadedCount, 
          totalAddons 
        }
      }
      return { success: true, total, alreadySynced: false }
    }

    // Set the addon collection using the proper format (replaces, removes extras not included)
    try {
      console.log('🔄 Setting addon collection (preserve protected addons + add group addons, exclude excluded addons)')
      console.log('📊 Desired collection addons:', finalDesiredCollection.map(a => ({ 
        name: a?.manifest?.name || a?.name, 
        id: a?.manifest?.id || a?.id,
        version: a?.manifest?.version,
        description: a?.manifest?.description,
        url: normalize(a?.transportUrl || a?.manifestUrl || a?.url)
      })))
      console.log('🔍 Full desired collection being sent to Stremio:', JSON.stringify(finalDesiredCollection, null, 2))
      
      // Set the addon collection using the proper format (replaces, removes extras not included)
      await apiClient.request('addonCollectionSet', { addons: finalDesiredCollection })
      
      // small wait for propagation
      await new Promise((r) => setTimeout(r, 1500))
    } catch (e) {
      console.error('❌ Failed to set addon collection:', e.message)
      return { success: false, error: `Failed to sync addons: ${e?.message}` }
    }

    // Pull after to report counts
    const after = await apiClient.request('addonCollectionGet', {})
    const total = Array.isArray(after?.addons) ? after.addons.length : (after?.addons ? Object.keys(after.addons).length : 0)

    // Update user's stremioAddons field with current addon collection
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          stremioAddons: JSON.stringify(after?.addons || [])
        }
      })
      console.log('💾 Updated user stremioAddons in database')
    } catch (updateError) {
      console.warn('⚠️ Failed to update user stremioAddons:', updateError.message)
    }

    console.log('✅ Sync complete, total addons:', total)
    if (syncMode === 'advanced') {
      return { success: true, total, reloadedCount, totalAddons }
    }
    return { success: true, total }
  } catch (error) {
    console.error('Error in syncUserAddons:', error)
    return { success: false, error: error?.message || 'Unknown error' }
  }
}

// Sync all users in a group
app.post('/api/groups/:id/sync', async (req, res) => {
  try {
    const { id: groupId } = req.params
    const { excludedManifestUrls = [] } = req.body
    const syncMode = getSyncMode(req)
    
    console.log('🚀 Group sync endpoint called with:', groupId, { excludedManifestUrls })
    
    // Get the group with its users
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: true
          }
        }
      }
    })
    
    if (!group) {
      return res.status(404).json({ message: 'Group not found' })
    }
    
    if (!group.isActive) {
      return res.status(400).json({ message: 'Group is disabled' })
    }
    
    const groupUsers = group.members.map(member => member.user).filter(user => user.stremioAuthKey)
    
    if (groupUsers.length === 0) {
      return res.json({ 
        message: 'No users with Stremio connections found in this group',
        syncedUsers: 0
      })
    }
    
    console.log(`👥 Found ${groupUsers.length} users with Stremio connections in group "${group.name}"`)
    
    let syncedCount = 0
    const errors = []
    let totalReloaded = 0
    let totalAddons = 0
    
    // Sync each user in the group
    for (const user of groupUsers) {
      try {
        console.log(`🔄 Syncing user: ${user.username || user.email}`)
        
        // Use the reusable sync function
        const syncResult = await syncUserAddons(user.id, excludedManifestUrls, syncMode)
        
        if (syncResult.success) {
          syncedCount++
          console.log(`✅ Successfully synced user: ${user.username || user.email}`)
          
          // Collect reload progress if available
          if (syncResult.reloadedCount !== undefined && syncResult.totalAddons !== undefined) {
            totalReloaded += syncResult.reloadedCount
            totalAddons += syncResult.totalAddons
          }
        } else {
          errors.push(`${user.username || user.email}: ${syncResult.error}`)
          console.log(`❌ Failed to sync user: ${user.username || user.email} - ${syncResult.error}`)
        }
      } catch (error) {
        errors.push(`${user.username || user.email}: ${error.message}`)
        console.error(`❌ Error syncing user ${user.username || user.email}:`, error)
      }
    }
    
    let message = `Group "${group.name}" sync completed.\n${syncedCount}/${groupUsers.length} users synced`
    
    // Add reload progress if available (show even when 0 reloaded)
    if (totalAddons > 0) {
      message += `\n${totalReloaded}/${totalAddons} addons reloaded`
    }
    
    if (errors.length > 0) {
      console.log('⚠️ Some users failed to sync:', errors)
    }
    
    res.json({
      message,
      syncedUsers: syncedCount,
      totalUsers: groupUsers.length,
      errors: errors.length > 0 ? errors : undefined,
      ...(totalAddons > 0 && { reloadedAddons: totalReloaded, totalAddons })
    })
    
  } catch (error) {
    console.error('Error syncing group:', error)
    res.status(500).json({ message: 'Failed to sync group', error: error?.message })
  }
})

// Clear corrupted Stremio credentials
// Reorder addons in a group
app.post('/api/groups/:id/addons/reorder', async (req, res) => {
  try {
    const { id: groupId } = req.params
    const { orderedManifestUrls } = req.body || {}
    
    console.log(`🔄 Reordering addons for group ${groupId}:`, orderedManifestUrls)
    
    if (!Array.isArray(orderedManifestUrls) || orderedManifestUrls.length === 0) {
      return res.status(400).json({ message: 'orderedManifestUrls array is required' })
    }
    
    // Get the group with its current addons
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        addons: {
          include: {
            addon: true
          }
        }
      }
    })
    
    if (!group) {
      return res.status(404).json({ message: 'Group not found' })
    }
    
    // Create a map of manifest URLs to addon IDs
    const manifestToAddonId = new Map()
    group.addons.forEach(groupAddon => {
      const manifestUrl = groupAddon.addon.manifestUrl
      if (manifestUrl) {
        manifestToAddonId.set(manifestUrl, groupAddon.addon.id)
      }
    })
    
    // Validate that all provided URLs exist in the group
    const invalidUrls = orderedManifestUrls.filter(url => !manifestToAddonId.has(url))
    if (invalidUrls.length > 0) {
      return res.status(400).json({ 
        message: `Invalid manifest URLs: ${invalidUrls.join(', ')}` 
      })
    }
    
    // Update the order by updating the GroupAddon records
    // Since we don't have an order field, we'll use the addedAt timestamp
    // to maintain order by updating it based on the new order
    const now = new Date()
    for (let i = 0; i < orderedManifestUrls.length; i++) {
      const manifestUrl = orderedManifestUrls[i]
      const addonId = manifestToAddonId.get(manifestUrl)
      
      // Find the GroupAddon record
      const groupAddon = group.addons.find(ga => ga.addon.id === addonId)
      if (groupAddon) {
        // Update the addedAt timestamp to reflect the new order
        // We use a small offset to maintain the order
        const newAddedAt = new Date(now.getTime() + (i * 1000)) // 1 second apart
        
        await prisma.groupAddon.update({
          where: { id: groupAddon.id },
          data: { addedAt: newAddedAt }
        })
      }
    }
    
    console.log(`✅ Successfully reordered ${orderedManifestUrls.length} addons for group ${groupId}`)
    
    res.json({ 
      message: 'Addons reordered successfully',
      orderedCount: orderedManifestUrls.length
    })
    
  } catch (error) {
    console.error('Error reordering group addons:', error)
    return res.status(500).json({ message: 'Failed to reorder addons', error: error?.message })
  }
})

app.post('/api/users/:id/clear-stremio-credentials', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id }
    });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Clear Stremio credentials
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        stremioAuthKey: null,
        stremioUserId: null,
        stremioUsername: null,
        stremioEmail: null,
        stremioAddons: null,
        lastStremioSync: null,
      },
    });

    res.json({ message: 'Stremio credentials cleared successfully', userId: updatedUser.id });
  } catch (error) {
    console.error('Error clearing Stremio credentials:', error);
    res.status(500).json({ message: 'Failed to clear Stremio credentials', error: error?.message });
  }
});

// Connect existing user to Stremio
app.post('/api/users/:id/connect-stremio', async (req, res) => {
  console.log('🚀 Connect Stremio endpoint called with:', req.params.id, req.body);
  try {
    const { id } = req.params;
    const { email, password, username } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id }
    });
    
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user already has Stremio credentials
    console.log('🔍 User stremioAuthKey:', existingUser.stremioAuthKey);
    console.log('🔍 User stremioAuthKey type:', typeof existingUser.stremioAuthKey);
    console.log('🔍 User stremioAuthKey truthy:', !!existingUser.stremioAuthKey);
    
    if (existingUser.stremioAuthKey) {
      return res.status(409).json({ message: 'User already connected to Stremio' });
    }
    
    // Create a temporary storage object for this authentication session
    const tempStorage = {};
    
    // Create Stremio API store for this user
    const apiStore = new StremioAPIStore({
      endpoint: 'https://api.strem.io',
      storage: {
        getJSON: (key) => {
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
          tempStorage[key] = value;
        }
      }
    });
    
    // Create Stremio API client
    const apiClient = new StremioAPIClient(apiStore);
    
    // Authenticate with Stremio using the same method as new user creation
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
      return res.status(401).json({ message: 'Invalid Stremio credentials' });
    }
    
    // Pull user's addon collection from Stremio
    await apiStore.pullAddonCollection();
    
    // Get authentication data from the API store (support both possible keys)
    const authKey = apiStore.authKey || tempStorage.auth || tempStorage.authKey;
    const userData = apiStore.user || tempStorage.user;
    
    // Debug: Check what's available
    console.log('🔍 apiStore.authKey:', !!apiStore.authKey);
    console.log('🔍 tempStorage.auth:', !!tempStorage.auth);
    console.log('🔍 apiStore.user:', !!apiStore.user);
    console.log('🔍 tempStorage.user:', !!tempStorage.user);
    
    if (!authKey || !userData) {
      console.error('🔍 Missing auth data - authKey:', !!authKey, 'userData:', !!userData);
      return res.status(401).json({ message: 'Failed to get Stremio authentication data' });
    }
    
    // Get user's addons using the same logic as stremio-addons endpoint
    let addonsData = [];
    try {
      const collection = await apiClient.request('addonCollectionGet', {});
      const rawAddons = collection?.addons || collection || {};
      const addonsNormalized = Array.isArray(rawAddons)
        ? rawAddons
        : (typeof rawAddons === 'object' ? Object.values(rawAddons) : []);
      
      // Process addons to get the actual count (same as stremio-addons endpoint)
      addonsData = await Promise.all(addonsNormalized.map(async (a) => {
        let manifestData = null;
        
        // Always try to fetch manifest if we have a URL and no proper manifest data
        if ((a?.manifestUrl || a?.transportUrl || a?.url) && (!a?.manifest || !a?.name || a.name === 'Unknown')) {
          try {
            const manifestUrl = a?.manifestUrl || a?.transportUrl || a?.url;
            const response = await fetch(manifestUrl);
            if (response.ok) {
              manifestData = await response.json();
            }
          } catch (e) {
            // Ignore manifest fetch errors for counting
          }
        }

        return {
          id: a?.id || a?.manifest?.id || manifestData?.id || 'unknown',
          name: a?.name || a?.manifest?.name || manifestData?.name || 'Unknown',
          manifestUrl: a?.manifestUrl || a?.transportUrl || a?.url || null,
          version: a?.version || a?.manifest?.version || manifestData?.version || null,
          description: a?.description || a?.manifest?.description || manifestData?.description || '',
          manifest: manifestData || a?.manifest || {
            id: manifestData?.id || a?.manifest?.id || a?.id || 'unknown',
            name: manifestData?.name || a?.manifest?.name || a?.name || 'Unknown',
            version: manifestData?.version || a?.manifest?.version || a?.version || null,
            description: manifestData?.description || a?.manifest?.description || a?.description || '',
            types: manifestData?.types || a?.manifest?.types || ['other'],
            resources: manifestData?.resources || a?.manifest?.resources || [],
            catalogs: manifestData?.catalogs || a?.manifest?.catalogs || []
          }
        };
      }));
      
      console.log('🔍 Processed addonsData length:', addonsData.length);
    } catch (e) {
      console.log('Could not fetch addons:', e.message);
    }
    
    // Encrypt the auth key for secure storage
    const encryptedAuthKey = encrypt(authKey);
    
    // Update user with Stremio credentials
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        stremioEmail: email,
        stremioUsername: username || userData?.username || email.split('@')[0],
        stremioAuthKey: encryptedAuthKey,
        stremioUserId: userData?.id,
        stremioAddons: JSON.stringify(addonsData || {}),
        lastStremioSync: new Date(),
      }
    });
    
    return res.json({ 
      message: 'Successfully connected to Stremio', 
      addonsCount: addonsData.length,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        stremioEmail: updatedUser.stremioEmail,
        stremioUsername: updatedUser.stremioUsername
      }
    });
    
  } catch (error) {
    console.error('Stremio connection error:', error);
    return res.status(500).json({ 
      message: 'Failed to connect to Stremio', 
      error: error?.message || 'Unknown error' 
    });
  }
});

// Test endpoint to manually set Stremio credentials (for testing only)
app.post('/api/test/set-stremio-credentials/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { authKey } = req.body;
    
    if (!authKey) {
      return res.status(400).json({ message: 'Auth key is required' });
    }
    
    // Encrypt the auth key
    const encryptedAuthKey = encrypt(authKey);
    
    // Update user with Stremio credentials
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        stremioAuthKey: encryptedAuthKey,
        stremioUserId: 'test-user-id',
        stremioUsername: 'testuser',
        stremioEmail: 'test@example.com'
      }
    });
    
    res.json({ message: 'Stremio credentials set successfully', userId: updatedUser.id });
  } catch (error) {
    console.error('Error setting Stremio credentials:', error);
    res.status(500).json({ message: 'Failed to set Stremio credentials', error: error?.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    message: 'Internal server error',
    error: error.message
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// Test endpoint to create users (for development only)
app.post('/api/test/users', async (req, res) => {
  try {
    const { displayName, email, username, firstName, lastName, role = 'USER', groupName } = req.body;
    
    if (!displayName || !email || !username) {
      return res.status(400).json({ message: 'displayName, email, and username are required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }

    // Create user
    const newUser = await prisma.user.create({
      data: {
        displayName,
        username,
        email,
        firstName,
        lastName,
        role,
        password: null, // No password for test users
        isActive: true
      }
    });

    // Assign to group if specified
    if (groupName) {
      const group = await prisma.group.findFirst({
        where: { name: groupName.trim() }
      });
      
      if (group) {
        await prisma.groupMember.create({
          data: {
            userId: newUser.id,
            groupId: group.id,
            role: 'MEMBER'
          }
        });
      }
    }

    res.status(201).json({
      message: 'Test user created successfully',
      user: {
        id: newUser.id,
        displayName: newUser.displayName,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        groupName: groupName || null
      }
    });
  } catch (error) {
    console.error('Error creating test user:', error);
    res.status(500).json({ message: 'Failed to create test user', error: error?.message });
  }
});

// Bind explicitly to 0.0.0.0 so it is reachable inside Docker even when ::1 is resolved
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Syncio (Database) running on port', PORT);
  console.log('📊 Health check: http://127.0.0.1:' + PORT + '/health');
  console.log('🔌 API endpoints: http://127.0.0.1:' + PORT + '/api/');
  console.log('🎬 Stremio integration: ENABLED');
  console.log('💾 Storage: PostgreSQL with Prisma');
});

// Reorder Stremio addons in user's account
app.post('/api/users/:id/stremio-addons/reorder', async (req, res) => {
  try {
    const { id } = req.params
    const { orderedManifestUrls } = req.body || {}

    if (!Array.isArray(orderedManifestUrls) || orderedManifestUrls.length === 0) {
      return res.status(400).json({ message: 'orderedManifestUrls array is required' })
    }

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return res.status(404).json({ message: 'User not found' })
    if (!user.stremioAuthKey) return res.status(400).json({ message: 'User is not connected to Stremio' })

    let authKeyPlain
    try { authKeyPlain = decrypt(user.stremioAuthKey) } catch { return res.status(500).json({ message: 'Failed to decrypt Stremio credentials' }) }

    const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })

    // Pull current collection
    const current = await apiClient.request('addonCollectionGet', {})
    const currentAddonsRaw = current?.addons || current || []
    const currentAddons = Array.isArray(currentAddonsRaw) ? currentAddonsRaw : (typeof currentAddonsRaw === 'object' ? Object.values(currentAddonsRaw) : [])

    const normalize = (s) => (s || '').toString().trim().toLowerCase()

    // Build map from normalized URL to addon object
    const urlToAddon = new Map()
    for (const a of currentAddons) {
      const url = normalize(a?.manifestUrl || a?.transportUrl || a?.url)
      if (url) urlToAddon.set(url, a)
    }

    // Construct new ordered list using provided order first, then append any remaining
    const desiredOrder = []
    const seen = new Set()
    for (const rawUrl of orderedManifestUrls) {
      const key = normalize(rawUrl)
      if (key && urlToAddon.has(key) && !seen.has(key)) {
        desiredOrder.push(urlToAddon.get(key))
        seen.add(key)
      }
    }
    for (const [key, addon] of urlToAddon.entries()) {
      if (!seen.has(key)) desiredOrder.push(addon)
    }

    // No-op check
    const sameLen = desiredOrder.length === currentAddons.length
    let identical = sameLen
    if (identical) {
      for (let i = 0; i < desiredOrder.length; i++) {
        const a = desiredOrder[i]
        const b = currentAddons[i]
        const au = normalize(a?.manifestUrl || a?.transportUrl || a?.url)
        const bu = normalize(b?.manifestUrl || b?.transportUrl || b?.url)
        if (au !== bu) { identical = false; break }
      }
    }
    if (identical) {
      return res.json({ message: 'Order unchanged', total: desiredOrder.length })
    }

    await apiClient.request('addonCollectionSet', { addons: desiredOrder })
    await new Promise((r) => setTimeout(r, 1000))

    return res.json({ message: 'Order updated', total: desiredOrder.length })
  } catch (error) {
    console.error('Error reordering addons:', error)
    return res.status(500).json({ message: 'Failed to reorder addons', error: error?.message })
  }
})
