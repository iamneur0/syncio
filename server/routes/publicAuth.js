const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const { repairAddonsList } = require('../utils/repair');
const { responseUtils, dbUtils } = require('../utils/routeUtils');

module.exports = ({ prisma, getAccountId, AUTH_ENABLED, issueAccessToken, issueRefreshToken, cookieName, isProdEnv, encrypt, decrypt, getDecryptedManifestUrl, scopedWhere, getAccountDek, decryptWithFallback, manifestUrlHmac, manifestHash, filterManifestByResources, filterManifestByCatalogs }) => {
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
      res.cookie(cookieName('sfm_csrf'), csrf, { httpOnly: false, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });
      return res.status(201).json({
        message: 'Registered successfully',
        account: { id: account.id, uuid: account.uuid },
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
      res.cookie(cookieName('sfm_csrf'), csrf, { httpOnly: false, secure: isProdEnv(), sameSite: isProdEnv() ? 'strict' : 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });
      return res.json({
        message: 'Login successful',
        account: { id: account.id, uuid: account.uuid },
      });
    } catch (error) {
      console.error('Login error:', error);
      return responseUtils.internalError(res, String(error && error.message || error));
    }
  });

  // Session info endpoint
  router.get('/me', async (req, res) => {
    try {
      if (!AUTH_ENABLED) {
        return res.json({ account: null, message: 'Auth disabled' });
      }

      if (!req.appAccountId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const account = await prisma.appAccount.findUnique({
        where: { id: req.appAccountId },
        select: { id: true, uuid: true }
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
      const [users, groups, addons] = await Promise.all([
        prisma.user.findMany({ where: whereScope }),
        prisma.group.findMany({ 
          where: whereScope, 
          include: { 
            addons: { include: { addon: true } }
          } 
        }),
        prisma.addon.findMany({ where: whereScope, include: { groupAddons: true } })
      ])
      
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

        const cleanedGroupAddons = (addon.groupAddons || []).map(ga => ({
          id: ga.id,
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

      const payload = { users: decryptedUsers, groups: cleanedGroups, addons: exportedAddons }
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

      const { users, groups, addons, groupAddons } = configData;
      const accountId = req.appAccountId || 'default';

      // Reset existing data for this account using shared function
      await resetAccountData(accountId);

      // Import in correct order: groups → addons → users
      
      // 1. Import groups first (always new IDs, defer userIds mapping)
      const importedGroups = [];
      if (groups && Array.isArray(groups)) {
        for (const groupData of groups) {
          const { id: _exportGroupId, addons, userIds: exportUserIds, addonIds, ...groupFields } = groupData;
          const group = await prisma.group.create({
            data: {
              ...groupFields,
              accountId,
              // do not include userIds yet; we will remap after users are created
            }
          });
          // keep original userIds (string or array) for later remap
          let exportUserIdsArr = []
          try {
            if (Array.isArray(exportUserIds)) exportUserIdsArr = exportUserIds
            else if (typeof exportUserIds === 'string' && exportUserIds.trim()) exportUserIdsArr = JSON.parse(exportUserIds)
          } catch {}
          importedGroups.push({ 
            ...group, 
            addons: addons || [], 
            _exportUserIds: exportUserIdsArr,
            _exportAddonIds: addonIds || []
          });
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

            // Check if addon already exists using per-account HMAC of manifestUrl
            const existingAddon = await prisma.addon.findFirst({
              where: {
                accountId: getAccountId(req),
                manifestUrlHash: manifestUrlHmac(req, transportUrl)
              }
            });

            if (existingAddon) {
              console.log(`Addon already exists: ${transportName}`);
              importedAddons.push(existingAddon);
              continue;
            }

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

            // Convert selected catalogs to simplified (type, id) format for storage
            const simplifiedCatalogs = (() => {
              try {
                // If selectedCatalogs are already simplified, use them
                if (selectedCatalogs.length > 0 && typeof selectedCatalogs[0] === 'object' && selectedCatalogs[0].type && selectedCatalogs[0].id) {
                  return selectedCatalogs.map(c => ({ type: c.type, id: c.id }))
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
                name: transportName,
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
            importedAddons.push(newAddon);

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
          
          const user = await prisma.user.create({
            data: {
              ...userFields,
              accountId,
              stremioAuthKey: stremioAuthKey ? encrypt(stremioAuthKey, req) : null,
                protectedAddons: parsedProtectedAddons.length > 0 ? JSON.stringify(parsedProtectedAddons.map(url => encrypt(url, req))) : null,
                excludedAddons: parsedExcludedAddons.length > 0 ? JSON.stringify(parsedExcludedAddons.map(url => encrypt(url, req))) : null
            }
          });
          importedUsers.push(user);
          if (_exportUserId) exportUserIdToNewId.set(_exportUserId, user.id)
        }
      }

      // 3b. Update groups.userIds with new user IDs
      for (const g of importedGroups) {
        if (Array.isArray(g._exportUserIds) && g._exportUserIds.length > 0) {
          const newUserIds = g._exportUserIds.map(uid => exportUserIdToNewId.get(uid)).filter(Boolean)
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

      // Build quick-lookup maps for reliable linking between exported addon IDs and newly created IDs
      const exportAddonIdToNewId = new Map(); // map: exportAddon.id -> dbAddon.id
      const exportStremioIdToNewId = new Map(); // map: stremioAddonId -> dbAddon.id
      const exportManifestUrlHmacToNewId = new Map(); // map: hmac(manifestUrl) -> dbAddon.id
      const exportAddonNameToNewId = new Map(); // map: addon.name -> dbAddon.id (names are unique per your rule)
      for (const a of addons || []) {
        // Find the created addon by stremioAddonId first, then manifestUrl, then name
        const byStremio = a.stremioAddonId
          ? importedAddons.find(x => x.stremioAddonId === a.stremioAddonId)
          : null
        const byUrlHmac = (!byStremio && a.manifestUrl)
          ? importedAddons.find(x => {
              try { return x.manifestUrlHash && manifestUrlHmac(req, a.manifestUrl) === x.manifestUrlHash } catch { return false }
            })
          : null
        const byName = (!byStremio && !byUrlHmac)
          ? importedAddons.find(x => x.name === a.name)
          : null

        const matched = byStremio || byUrlHmac || byName
        if (matched) {
          if (a.id) exportAddonIdToNewId.set(a.id, matched.id)
          if (a.stremioAddonId) exportStremioIdToNewId.set(a.stremioAddonId, matched.id)
          if (a.manifestUrl) exportManifestUrlHmacToNewId.set(manifestUrlHmac(req, a.manifestUrl), matched.id)
          if (a.name) exportAddonNameToNewId.set(a.name, matched.id)
        }
      }

      // Repair newly imported addons before linking users/groups
      if (importedAddons.length > 0) {
        await repairAddonsForAccount(importedAddons, req)
      }

      // Import group-addon relationships from groups
      let importedGroupAddons = 0;
      for (const group of importedGroups) {
        const addedAddonIds = new Set()
        // Use addonIds array for proper ordering if available, otherwise fall back to addons array
        const addonsToImport = group._exportAddonIds && Array.isArray(group._exportAddonIds) 
          ? group._exportAddonIds.map((addonId, index) => ({ 
              id: addonId, 
              position: index,
              isEnabled: true // Default to enabled, will be overridden if found in addons array
            }))
          : (group.addons && Array.isArray(group.addons) ? group.addons : []);

        // If using addonIds, try to get isEnabled from the addons array
        if (group._exportAddonIds && group.addons) {
          const addonsMap = new Map();
          for (const addonRef of group.addons) {
            const ref = addonRef && addonRef.addon ? addonRef.addon : addonRef;
            if (ref?.id) {
              addonsMap.set(ref.id, addonRef.isEnabled !== undefined ? addonRef.isEnabled : true);
            }
          }
          // Update isEnabled from addons array
          for (const addon of addonsToImport) {
            if (addonsMap.has(addon.id)) {
              addon.isEnabled = addonsMap.get(addon.id);
            }
          }
        }

        for (const addonRef of addonsToImport) {
          try {
            let resolvedAddonId = null;
            let position = addonRef.position !== undefined ? addonRef.position : null;
            let isEnabled = addonRef.isEnabled !== undefined ? addonRef.isEnabled : true;

            // If using addonIds array, the ID should be directly mappable
            if (group._exportAddonIds && addonRef.id) {
              resolvedAddonId = exportAddonIdToNewId.get(addonRef.id);
              // Fallback: resolve by name when id mapping is missing
              if (!resolvedAddonId && Array.isArray(group.addons)) {
                try {
                  const named = group.addons.find((ga) => {
                    const ref = ga && ga.addon ? ga.addon : ga
                    return ref && ref.id === addonRef.id && ref.name
                  })
                  const addonName = named && (named.addon ? named.addon.name : named.name)
                  if (addonName && exportAddonNameToNewId.has(addonName)) {
                    resolvedAddonId = exportAddonNameToNewId.get(addonName)
                  }
                } catch {}
              }
              // Extra fallback: try importedAddons by name directly
              if (!resolvedAddonId && Array.isArray(group.addons)) {
                try {
                  const named = group.addons.find((ga) => {
                    const ref = ga && ga.addon ? ga.addon : ga
                    return ref && ref.id === addonRef.id && ref.name
                  })
                  const addonName = named && (named.addon ? named.addon.name : named.name)
                  if (addonName) {
                    const found = importedAddons.find(x => x.name === addonName)
                    if (found) resolvedAddonId = found.id
                  }
                } catch {}
              }
            } else {
              // Fallback to old logic for backward compatibility
              const ref = addonRef && addonRef.addon ? addonRef.addon : addonRef;
              
              // 1) Try explicit export ID map
              if (ref?.id && exportAddonIdToNewId.has(ref.id)) {
                resolvedAddonId = exportAddonIdToNewId.get(ref.id);
              }
              // 2) Try stremioAddonId map
              if (!resolvedAddonId && ref?.stremioAddonId && exportStremioIdToNewId.has(ref.stremioAddonId)) {
                resolvedAddonId = exportStremioIdToNewId.get(ref.stremioAddonId);
              }
              // 3) Try manifestUrl HMAC map
              if (!resolvedAddonId && ref?.manifestUrl) {
                try {
                  const h = manifestUrlHmac(req, ref.manifestUrl)
                  if (exportManifestUrlHmacToNewId.has(h)) resolvedAddonId = exportManifestUrlHmacToNewId.get(h)
                } catch {}
              }
              // 4) Try name map (explicit per your rule that names are unique)
              if (!resolvedAddonId && ref?.name && exportAddonNameToNewId.has(ref.name)) {
                resolvedAddonId = exportAddonNameToNewId.get(ref.name)
              }
              // 4) Last resort: relaxed match on stremioAddonId or name
              if (!resolvedAddonId) {
                const loose = importedAddons.find(x => (ref?.stremioAddonId && x.stremioAddonId === ref.stremioAddonId))
                  || importedAddons.find(x => ref?.name && x.name === ref.name);
                resolvedAddonId = loose ? loose.id : null;
              }
              
              // For old format, position will be null (no ordering preserved)
              if (addonRef.isEnabled !== undefined) {
                isEnabled = addonRef.isEnabled;
              }
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
        // Backward-compatible alias for older UIs expecting `created`
        created: {
          users: importedUsers.length,
          groups: importedGroups.length,
          addons: importedAddons.length,
          groupAddons: importedGroupAddons
        },
        // Legacy top-level fields for older clients expecting { addons: { created, reused }, users: { created }, groups: { created } }
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

          // Check if addon already exists using per-account HMAC of manifestUrl
          const existingAddon = await prisma.addon.findFirst({
            where: {
              accountId: getAccountId(req),
              manifestUrlHash: manifestUrlHmac(req, transportUrl)
            }
          });

          if (existingAddon) {
            console.log(`Addon already exists: ${transportName}`);
            redundant++;
            continue;
          }

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

          // Convert selected catalogs to simplified (type, id) format for storage
          const simplifiedCatalogs = (() => {
            try {
              // If selectedCatalogs are already simplified, use them
              if (selectedCatalogs.length > 0 && typeof selectedCatalogs[0] === 'object' && selectedCatalogs[0].type && selectedCatalogs[0].id) {
                return selectedCatalogs.map(c => ({ type: c.type, id: c.id }))
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
              name: transportName,
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
      await prisma.groupUser.deleteMany({
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
