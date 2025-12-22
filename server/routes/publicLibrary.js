const express = require('express');
const { StremioAPIClient } = require('stremio-api-client');
const { validateStremioAuthKey } = require('../utils/stremio');
const { encrypt, decrypt } = require('../utils/encryption');
const { canonicalizeManifestUrl } = require('../utils/validation');

/**
 * Public Library Router - Allows users to access their library via OAuth
 * without requiring account authentication. Addons added are marked as protected.
 */
module.exports = ({ prisma, DEFAULT_ACCOUNT_ID, encrypt, decrypt, getCachedLibrary, setCachedLibrary }) => {
  const { findLatestEpisode } = require('../utils/libraryHelpers')
  const router = express.Router();

  // Helper to get existing user from Stremio auth (does NOT create new users)
  async function getPublicUser(authKey, req) {
    try {
      // Validate auth key
      const validation = await validateStremioAuthKey(authKey);
      if (!validation || !validation.user) {
        throw new Error('Invalid or expired Stremio auth key');
      }

      const stremioUser = validation.user;
      const stremioEmail = stremioUser.email || null;

      // Try to find existing user by email (search across all accounts first to get the user's accountId)
      let user = null
      if (stremioEmail) {
        user = await prisma.user.findFirst({
          where: {
            email: stremioEmail.toLowerCase(),
            isActive: true  // Only find active users
          },
          select: {
            id: true,
            username: true,
            email: true,
            accountId: true,  // Include accountId to use for group lookup
            stremioAuthKey: true,
            isActive: true,
            protectedAddons: true
          }
        });
      }

      // If user not found, throw error
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Check if user is active (double check even though we filtered)
      if (!user.isActive) {
        throw new Error('USER_NOT_ACTIVE');
      }

      // Check if user belongs to at least one active group
      // Check across all accounts (not just user's accountId) to handle cases where
      // user's accountId might be 'default' but groups are in other accounts
      const groups = await prisma.group.findMany({
        where: {
          isActive: true
        },
        select: {
          id: true,
          userIds: true,
          accountId: true
        }
      });

      // Find groups that contain this user (same logic as getGroupMembers)
      const userGroups = groups.filter(group => {
        if (!group.userIds) return false
        try {
          const userIds = JSON.parse(group.userIds)
          return Array.isArray(userIds) && userIds.includes(user.id)
        } catch (e) {
          console.error(`[getPublicUser] Error parsing userIds for group ${group.id}:`, e)
          return false
        }
      })

      if (userGroups.length === 0) {
        const userAccountId = user.accountId || DEFAULT_ACCOUNT_ID;
        console.error(`[getPublicUser] User ${user.id} (${user.email}) not found in any active group. User accountId: ${userAccountId}, Total groups checked: ${groups.length}`)
        throw new Error('USER_NOT_IN_GROUP');
      }

      // Use the user's accountId for encryption/decryption
      const userAccountId = user.accountId || DEFAULT_ACCOUNT_ID;

      // Check if found user's auth key matches
      if (user.stremioAuthKey) {
        try {
          // Create a mock request for decrypt (needs accountId)
          const mockReq = { appAccountId: userAccountId };
          const storedAuthKey = decrypt(user.stremioAuthKey, mockReq);
          if (storedAuthKey === authKey) {
            // User exists, is active, and auth key matches
            return user;
          }
        } catch (e) {
          // Decryption failed, might be different encryption or user
          // Still allow login if user exists (auth key might have been updated)
        }
      }

      // If user exists but auth key doesn't match, update it
      const mockReq = { appAccountId: userAccountId };
      const encryptedAuthKey = encrypt(authKey, mockReq);
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          stremioAuthKey: encryptedAuthKey,
          isActive: true  // Ensure user is active
        },
        select: {
          id: true,
          username: true,
          email: true,
          stremioAuthKey: true,
          isActive: true,
          protectedAddons: true
        }
      });
      return user;
    } catch (error) {
      console.error('Error in getPublicUser:', error);
      throw error;
    }
  }

  // Helper to get or create user from Stremio auth (kept for backward compatibility if needed elsewhere)
  async function getOrCreatePublicUser(authKey, req) {
    try {
      // First try to get existing user
      return await getPublicUser(authKey, req);
    } catch (error) {
      // If user not found, don't create - rethrow the error
      if (error.message === 'USER_NOT_FOUND') {
        throw error;
      }
      // For other errors, also rethrow
      throw error;
    }
  }

  // Generate OAuth link
  router.post('/generate-oauth', async (req, res) => {
    try {
      const { StremioAPIStore } = require('stremio-api-client');
      const store = new StremioAPIStore();
      
      const result = await store.createOAuthLink();
      
      if (!result || !result.success || !result.code || !result.link) {
        return res.status(500).json({
          error: 'Failed to generate OAuth link - Stremio API returned invalid response',
          details: result
        });
      }

      res.json({
        success: true,
        code: result.code,
        link: result.link,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      });
    } catch (error) {
      console.error('Error generating OAuth link:', error);
      res.status(500).json({ error: 'Failed to generate OAuth link', message: error?.message });
    }
  });

  // Poll for OAuth completion
  router.post('/poll-oauth', async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ error: 'OAuth code is required' });
      }

      const { StremioAPIStore } = require('stremio-api-client');
      const store = new StremioAPIStore();
      
      const result = await store.getOAuthToken(code);
      
      if (!result || !result.authKey) {
        return res.json({ success: false, authKey: null });
      }

      res.json({
        success: true,
        authKey: result.authKey
      });
    } catch (error) {
      console.error('Error polling OAuth:', error);
      res.json({ success: false, authKey: null, error: error?.message });
    }
  });

  // Authenticate with OAuth and get/create user
  router.post('/authenticate', async (req, res) => {
    try {
      const { authKey } = req.body;
      if (!authKey) {
        return res.status(400).json({ error: 'Auth key is required' });
      }

      const user = await getPublicUser(authKey, req);
      
      // Fetch full user details including createdAt and expiresAt
      const fullUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          username: true,
          email: true,
          colorIndex: true,
          createdAt: true,
          expiresAt: true
        }
      });
      
      // Return user info (without sensitive data)
      res.json({
        success: true,
        user: {
          id: fullUser.id,
          username: fullUser.username,
          email: fullUser.email,
          colorIndex: fullUser.colorIndex || 0,
          createdAt: fullUser.createdAt,
          expiresAt: fullUser.expiresAt
        }
      });
    } catch (error) {
      console.error('Error authenticating:', error);
      
      // Handle specific error for user not found
      if (error?.message === 'USER_NOT_FOUND') {
        return res.status(403).json({ 
          error: 'USER_NOT_FOUND',
          message: 'Your account is not registered with Syncio. Please contact an administrator to be added to a Syncio group first.' 
        });
      }
      
      // Handle specific error for user not active
      if (error?.message === 'USER_NOT_ACTIVE') {
        return res.status(403).json({ 
          error: 'USER_NOT_ACTIVE',
          message: 'Your account has been disabled. Please contact an administrator to reactivate your account.' 
        });
      }
      
      // Handle specific error for user not in group
      if (error?.message === 'USER_NOT_IN_GROUP') {
        return res.status(403).json({ 
          error: 'USER_NOT_IN_GROUP',
          message: 'Your account is not part of any Syncio group. Please contact an administrator to be added to a group first.' 
        });
      }
      
      res.status(401).json({ 
        error: 'Authentication failed', 
        message: error?.message || 'Invalid Stremio auth key' 
      });
    }
  });

  // Validate user session (check if user exists, is active, and is in a group)
  router.post('/validate', async (req, res) => {
    try {
      const { authKey, userId } = req.body;
      
      if (!authKey && !userId) {
        return res.status(400).json({ error: 'Auth key or user ID is required' });
      }

      // If userId is provided, we need to get the authKey from the user
      let authKeyToValidate = authKey;
      if (!authKeyToValidate && userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { stremioAuthKey: true, accountId: true }
        });
        
        if (!user || !user.stremioAuthKey) {
          return res.status(403).json({ 
            error: 'USER_NOT_FOUND',
            message: 'Your account is not registered with Syncio. Please contact an administrator to be added to a Syncio group first.' 
          });
        }
        
        // Decrypt the auth key
        const mockReq = { appAccountId: user.accountId || DEFAULT_ACCOUNT_ID };
        authKeyToValidate = decrypt(user.stremioAuthKey, mockReq);
      }

      // Validate using getPublicUser which checks existence, active status, and group membership
      const user = await getPublicUser(authKeyToValidate, req);
      
      res.json({
        success: true,
        valid: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      });
    } catch (error) {
      console.error('Error validating user:', error);
      
      // Handle specific errors
      if (error?.message === 'USER_NOT_FOUND') {
        return res.status(403).json({ 
          error: 'USER_NOT_FOUND',
          message: 'Your account is not registered with Syncio. Please contact an administrator to be added to a Syncio group first.' 
        });
      }
      
      if (error?.message === 'USER_NOT_ACTIVE') {
        return res.status(403).json({ 
          error: 'USER_NOT_ACTIVE',
          message: 'Your account has been disabled. Please contact an administrator to reactivate your account.' 
        });
      }
      
      if (error?.message === 'USER_NOT_IN_GROUP') {
        return res.status(403).json({ 
          error: 'USER_NOT_IN_GROUP',
          message: 'Your account is not part of any Syncio group. Please contact an administrator to be added to a group first.' 
        });
      }
      
      res.status(401).json({ 
        error: 'Validation failed',
        message: error?.message || 'Invalid user session'
      });
    }
  });

  // Get current user's info (including activityVisibility)
  router.get('/user-info', async (req, res) => {
    try {
      const { userId, authKey } = req.query;
      
      if (!userId && !authKey) {
        return res.status(400).json({ error: 'User ID or auth key is required' });
      }

      let user;
      if (authKey) {
        // Get user from auth key (getPublicUser doesn't return activityVisibility, so fetch it separately)
        const publicUser = await getPublicUser(authKey, req);
        // Fetch full user data including activityVisibility
        const fullUser = await prisma.user.findUnique({
          where: { id: publicUser.id },
          select: {
            id: true,
            username: true,
            email: true,
            activityVisibility: true,
            colorIndex: true,
            createdAt: true,
            expiresAt: true
          }
        });
        if (!fullUser) {
          return res.status(404).json({ error: 'User not found' });
        }
        user = fullUser;
      } else if (userId) {
        // Get user from userId - need to validate they exist and are active
        const foundUser = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            email: true,
            accountId: true,
            stremioAuthKey: true,
            isActive: true,
            activityVisibility: true,
            colorIndex: true,
            createdAt: true,
            expiresAt: true
          }
        });

        if (!foundUser) {
          return res.status(404).json({ error: 'User not found' });
        }

        if (!foundUser.isActive) {
          return res.status(403).json({ error: 'User account is disabled' });
        }

        // Verify user belongs to default account (public users)
        if (foundUser.accountId !== DEFAULT_ACCOUNT_ID) {
          return res.status(403).json({ error: 'Access denied' });
        }

        // Check if user belongs to at least one active group
        const { getGroupMembers } = require('../utils/sharesManager');
        const groupMembers = await getGroupMembers(prisma, foundUser.accountId, foundUser.id);
        if (groupMembers.length === 0) {
          return res.status(403).json({ error: 'User is not part of any group' });
        }

        user = foundUser;
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        activityVisibility: user.activityVisibility || 'private',
        colorIndex: user.colorIndex || 0,
        createdAt: user.createdAt,
        expiresAt: user.expiresAt
      });
    } catch (error) {
      console.error('Error getting user info:', error);
      res.status(500).json({ error: 'Failed to get user info', message: error?.message });
    }
  });

  // Update current user's activity visibility
  router.patch('/activity-visibility', async (req, res) => {
    try {
      const { userId, authKey, activityVisibility } = req.body;
      
      if (!userId || !authKey) {
        return res.status(400).json({ error: 'User ID and auth key are required' });
      }

      if (!activityVisibility || !['public', 'private'].includes(activityVisibility)) {
        return res.status(400).json({ error: 'Invalid activityVisibility value. Must be "public" or "private".' });
      }

      // Validate user using getPublicUser (checks existence, active status, and group membership)
      const user = await getPublicUser(authKey, req);
      
      // Verify the userId matches the authenticated user
      if (user.id !== userId) {
        return res.status(403).json({ error: 'Access denied: Cannot update another user\'s visibility' });
      }

      // Update the user's activity visibility
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { activityVisibility }
      });

      res.json({ 
        message: `Activity visibility set to ${activityVisibility}`,
        activityVisibility: updatedUser.activityVisibility 
      });
    } catch (error) {
      console.error('Error updating activity visibility:', error);
      
      // Handle specific errors
      if (error?.message === 'USER_NOT_FOUND') {
        return res.status(403).json({ 
          error: 'USER_NOT_FOUND',
          message: 'Your account is not registered with Syncio.' 
        });
      }
      
      if (error?.message === 'USER_NOT_ACTIVE') {
        return res.status(403).json({ 
          error: 'USER_NOT_ACTIVE',
          message: 'Your account has been disabled.' 
        });
      }
      
      if (error?.message === 'USER_NOT_IN_GROUP') {
        return res.status(403).json({ 
          error: 'USER_NOT_IN_GROUP',
          message: 'Your account is not part of any Syncio group.' 
        });
      }
      
      res.status(500).json({ error: 'Failed to update activity visibility', message: error?.message });
    }
  });

  // Get user's library
  router.get('/library', async (req, res) => {
    try {
      const userId = req.query.userId || req.query.user;
      const requestingUserId = req.query.requestingUserId; // Optional: ID of user making the request
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get target user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          stremioAuthKey: true,
          isActive: true,
          accountId: true,
          activityVisibility: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      // Verify user belongs to default account (public users)
      if (user.accountId !== DEFAULT_ACCOUNT_ID) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Security check: If requesting a different user's library, verify access
      if (requestingUserId && requestingUserId !== userId) {
        // Verify requesting user exists and belongs to same account
        const requestingUser = await prisma.user.findUnique({
          where: { id: requestingUserId },
          select: { id: true, accountId: true }
        });
        
        if (!requestingUser || requestingUser.accountId !== DEFAULT_ACCOUNT_ID) {
          return res.status(403).json({ error: 'Access denied: Invalid requesting user' });
        }
        
        // Check if requesting user is in the same group and target user is public
        const { getGroupMembers } = require('../utils/sharesManager');
        const groupMembers = await getGroupMembers(prisma, DEFAULT_ACCOUNT_ID, requestingUserId);
        const requestingUserInGroup = groupMembers.some(m => m.id === userId);
        
        if (!requestingUserInGroup || user.activityVisibility !== 'public') {
          return res.status(403).json({ error: 'Access denied: User library is private or you are not in the same group' });
        }
      } else if (!requestingUserId && user.activityVisibility !== 'public') {
        // If no requesting user ID provided and target user is private, deny access
        // This prevents anonymous access to private libraries
        return res.status(403).json({ error: 'Access denied: User library is private' });
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ error: 'User not connected to Stremio' });
      }

      // Get library from cache or fetch
      let library = getCachedLibrary(user.accountId, user.id);
      
      // Check if cache only has removed items (stale cache) - if so, refresh from Stremio
      // Active items: removed === false (or missing/undefined, treated as in library)
      const hasActiveItems = library && Array.isArray(library) && library.some(item => {
        return item.removed === false || item.removed === undefined || item.removed === null;
      });
      
      console.log(`[Library Cache] User ${user.id}: cache items=${library?.length || 0}, hasActiveItems=${hasActiveItems}`)
      
      if (!library || !Array.isArray(library) || library.length === 0 || !hasActiveItems) {
        console.log(`[Library Cache] Refreshing from Stremio for user ${user.id}`)
        const mockReq = { appAccountId: user.accountId };
        const authKeyPlain = decrypt(user.stremioAuthKey, mockReq);
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain });

        const libraryItems = await apiClient.request('datastoreGet', {
          collection: 'libraryItem',
          ids: [],
          all: true
        });

        library = Array.isArray(libraryItems) ? libraryItems : (libraryItems?.result || libraryItems?.library || []);
        
        // Active items: removed === false (or missing/undefined, treated as in library)
        const activeFromStremio = library.filter(item => {
          return item.removed === false || item.removed === undefined || item.removed === null;
        }).length
        console.log(`[Library Cache] Stremio returned: total=${library.length}, active=${activeFromStremio}`)
        
        if (Array.isArray(library) && library.length > 0) {
          setCachedLibrary(user.accountId, user.id, library);
        }
      }

      // Process and expand library (similar to single user endpoint)
      const expandedLibrary = []
      const episodeItemsByShow = new Map()
      
      for (const item of library) {
        if (item.type === 'movie') {
          expandedLibrary.push(item)
          continue
        }
        
        const isEpisodeItem = item._id && item._id.includes(':') && item._id.split(':').length >= 3
        
        if (isEpisodeItem) {
          const showId = item._id.split(':')[0]
          if (!episodeItemsByShow.has(showId)) {
            episodeItemsByShow.set(showId, [])
          }
          episodeItemsByShow.get(showId).push(item)
          continue
        }
        
        if (item.type === 'series' && item.state?.watched) {
          try {
            const showId = item._id || item.id
            const metaResponse = await fetch(`https://v3-cinemeta.strem.io/meta/series/${showId}.json`)
            if (metaResponse.ok) {
              const metaData = await metaResponse.json()
              const meta = metaData.meta
              
              if (meta && meta.videos && Array.isArray(meta.videos)) {
                const videoIds = meta.videos.map(v => v.id)
                const watchedStr = item.state.watched
                
                if (watchedStr && videoIds.length > 0) {
                  const parts = watchedStr.split(':')
                  let bitfieldLength, bitfieldData
                  
                  if (parts.length >= 3) {
                    bitfieldLength = parseInt(parts[1], 10)
                    bitfieldData = parts.slice(2).join(':')
                  } else if (parts.length === 1) {
                    bitfieldLength = videoIds.length
                    bitfieldData = parts[0]
                  } else {
                    expandedLibrary.push(item)
                    continue
                  }
                  
                  if (bitfieldLength > 0 && bitfieldData) {
                    try {
                      const bitfieldBuffer = Buffer.from(bitfieldData, 'base64')
                      const watchedEpisodes = []
                      const actualLength = Math.min(videoIds.length, bitfieldLength)
                      
                      for (let i = 0; i < actualLength; i++) {
                        const byteIndex = Math.floor(i / 8)
                        const bitIndex = i % 8
                        
                        if (byteIndex < bitfieldBuffer.length) {
                          const byte = bitfieldBuffer[byteIndex]
                          const isWatched = (byte & (1 << bitIndex)) !== 0
                          
                          if (isWatched) {
                            const videoId = videoIds[i]
                            const videoIdParts = videoId.split(':')
                            if (videoIdParts.length >= 3) {
                              const season = parseInt(videoIdParts[1], 10)
                              const episode = parseInt(videoIdParts[2], 10)
                              
                              const episodeItem = {
                                ...item,
                                _id: `${item._id}:${season}:${episode}`,
                                _mtime: item._mtime,
                                _ctime: item._ctime,
                                state: {
                                  ...item.state,
                                  season: season,
                                  episode: episode,
                                  video_id: videoId
                                }
                              }
                              watchedEpisodes.push(episodeItem)
                            }
                          }
                        }
                      }
                      
                      if (watchedEpisodes.length > 0) {
                        let latestEpisode = null
                        if (item.state?.video_id) {
                          latestEpisode = watchedEpisodes.find(ep => ep.state?.video_id === item.state.video_id)
                        }
                        if (!latestEpisode) {
                          latestEpisode = watchedEpisodes[watchedEpisodes.length - 1]
                        }
                        
                        if (latestEpisode) {
                          expandedLibrary.push(latestEpisode)
                        } else {
                          expandedLibrary.push(item)
                        }
                      } else {
                        expandedLibrary.push(item)
                      }
                    } catch (bitfieldError) {
                      expandedLibrary.push(item)
                    }
                  } else {
                    expandedLibrary.push(item)
                  }
                } else {
                  expandedLibrary.push(item)
                }
              } else {
                expandedLibrary.push(item)
              }
            } else {
              expandedLibrary.push(item)
            }
          } catch (metaError) {
            expandedLibrary.push(item)
          }
        } else {
          expandedLibrary.push(item)
        }
      }

      // Process episode items: only keep the latest episode per show
      episodeItemsByShow.forEach((episodes, showId) => {
        const latestEpisode = findLatestEpisode(episodes)
        if (latestEpisode) {
          expandedLibrary.push(latestEpisode)
        }
      })

      // Return all items (both active and removed) - frontend will filter based on view type
      // This allows history view to show all watched items regardless of removed status
      const allLibrary = expandedLibrary

      console.log(`[Library API] User ${user.id}: expanded=${expandedLibrary.length}, total=${allLibrary.length}`)

      // Sort by watch date (least recent of _mtime vs lastWatched)
      allLibrary.sort((a, b) => {
        const getWatchDate = (item) => {
          const dates = []
          if (item._mtime) {
            const d = new Date(item._mtime)
            if (!isNaN(d.getTime())) dates.push(d.getTime())
          }
          if (item.state?.lastWatched) {
            const d = new Date(item.state.lastWatched)
            if (!isNaN(d.getTime())) dates.push(d.getTime())
          }
          if (dates.length === 0) return 0
          return Math.min(...dates)
        }

        const dateA = getWatchDate(a)
        const dateB = getWatchDate(b)

        if (dateB === dateA) return 0
        return dateB - dateA
      })

      res.json({
        library: allLibrary,
        count: allLibrary.length
      });
    } catch (error) {
      console.error('Error fetching library:', error);
      res.status(500).json({ error: 'Failed to fetch library', message: error?.message });
    }
  });

  // Add addon and mark as protected
  router.post('/add-addon', async (req, res) => {
    try {
      const { userId, addonUrl, manifestData: providedManifestData } = req.body;
      
      if (!userId || !addonUrl) {
        return res.status(400).json({ 
          error: 'User ID and addon URL are required',
          message: 'User ID and addon URL are required' 
        });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          stremioAuthKey: true,
          isActive: true,
          accountId: true,
          protectedAddons: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      // Verify user belongs to default account (public users)
      if (user.accountId !== DEFAULT_ACCOUNT_ID) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ 
          error: 'User not connected to Stremio',
          message: 'User not connected to Stremio. Please connect your Stremio account first.' 
        });
      }

      // Use provided manifest data if available (fetched client-side), otherwise fetch it server-side
      let manifest = providedManifestData;
      if (!manifest) {
        try {
          console.log(`[public-library] Fetching manifest from server: ${addonUrl}`);
          const manifestResponse = await fetch(addonUrl, {
            headers: {
              'User-Agent': 'Syncio/1.0',
              'Accept': 'application/json'
            }
          });
          if (!manifestResponse.ok) {
            console.error(`[public-library] Failed to fetch manifest: ${manifestResponse.status} ${manifestResponse.statusText}`);
            return res.status(400).json({ 
              error: `Failed to fetch manifest: ${manifestResponse.status}`, 
              message: `Failed to fetch manifest from URL. Status: ${manifestResponse.status}. Please try again or ensure the URL is accessible.` 
            });
          }
          manifest = await manifestResponse.json();
          console.log(`[public-library] Successfully fetched manifest server-side: ${manifest?.name || 'Unknown'}`);
        } catch (fetchError) {
          console.error('[public-library] Error fetching manifest:', fetchError);
          return res.status(400).json({ 
            error: 'Failed to fetch addon manifest', 
            message: fetchError?.message || 'Unable to fetch manifest from the provided URL. Please check the URL is correct and accessible.' 
          });
        }
      } else {
        console.log(`[public-library] Using provided manifest data: ${manifest?.name || 'Unknown'}`);
      }

      // Validate manifest structure
      if (!manifest || typeof manifest !== 'object') {
        console.error('[public-library] Invalid manifest structure:', manifest);
        return res.status(400).json({ 
          error: 'Invalid manifest format', 
          message: 'The manifest is not a valid JSON object.' 
        });
      }

      // Add to Stremio using the same approach as sync (get current, add new, set collection)
      const mockReq = { appAccountId: user.accountId };
      const authKeyPlain = decrypt(user.stremioAuthKey, mockReq);
      const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain });
      
      try {
        console.log(`[public-library] Getting current Stremio addon collection`);
        // Get current addons
        const currentCollection = await apiClient.request('addonCollectionGet', {});
        const rawAddons = currentCollection?.addons || currentCollection || [];
        const currentAddons = Array.isArray(rawAddons)
          ? rawAddons
          : (typeof rawAddons === 'object' ? Object.values(rawAddons) : []);
        
        console.log(`[public-library] Current addons count: ${currentAddons.length}`);
        
        // Check if addon already exists (by URL)
        const normalizedUrl = canonicalizeManifestUrl(addonUrl);
        const addonExists = currentAddons.some((a) => {
          const existingUrl = a?.transportUrl || a?.manifestUrl || a?.url;
          return existingUrl && canonicalizeManifestUrl(existingUrl) === normalizedUrl;
        });
        
        if (addonExists) {
          console.log(`[public-library] Addon already exists in collection`);
          // Still mark as protected even if it already exists
        } else {
          // Create addon object in the format Stremio expects (same as sync)
          const newAddon = {
            transportUrl: addonUrl,
            transportName: manifest.name || '',
            manifest: manifest
          };
          
          // Add new addon to the collection
          const updatedAddons = [...currentAddons, newAddon];
          
          console.log(`[public-library] Setting Stremio collection with ${updatedAddons.length} addons`);
          console.log(`[public-library] New addon: ${manifest?.name || addonUrl}`);
          
          // Set the entire collection (like sync does)
          await apiClient.request('addonCollectionSet', { addons: updatedAddons });
          
          console.log(`[public-library] Successfully added addon to Stremio collection`);
        }
      } catch (stremioError) {
        console.error('[public-library] Error adding addon to Stremio:', stremioError);
        console.error('[public-library] Stremio error details:', JSON.stringify(stremioError, null, 2));
        console.error('[public-library] Stremio error stack:', stremioError?.stack);
        
        // Check if it's a specific Stremio API error
        let errorMessage = 'Failed to add addon to Stremio';
        if (stremioError?.message) {
          errorMessage = stremioError.message;
        } else if (stremioError?.error) {
          errorMessage = typeof stremioError.error === 'string' ? stremioError.error : JSON.stringify(stremioError.error);
        } else if (stremioError?.response?.data) {
          const data = stremioError.response.data;
          errorMessage = data.error || data.message || JSON.stringify(data);
        }
        
        return res.status(400).json({ 
          error: 'Failed to add addon to Stremio', 
          message: errorMessage 
        });
      }

      // Mark as protected by adding to protectedAddons
      const addonName = manifest.name || addonUrl;
      const currentProtected = user.protectedAddons ? JSON.parse(user.protectedAddons) : [];
      
      // Add to protected list if not already there
      const normalizedName = addonName.trim().toLowerCase();
      if (!currentProtected.some(name => name.trim().toLowerCase() === normalizedName)) {
        currentProtected.push(addonName);
        
        await prisma.user.update({
          where: { id: userId },
          data: {
            protectedAddons: JSON.stringify(currentProtected)
          }
        });
      }

      res.json({
        success: true,
        message: 'Addon added and marked as protected',
        addon: {
          url: addonUrl,
          name: addonName
        }
      });
    } catch (error) {
      console.error('[public-library] Error adding addon:', error);
      console.error('[public-library] Error stack:', error?.stack);
      console.error('[public-library] Error details:', JSON.stringify(error, null, 2));
      
      // Return more detailed error information
      const statusCode = error?.response?.status || error?.status || 500;
      let errorMessage = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Failed to add addon';
      
      // If it's a Stremio API error, extract more details
      if (error?.error || error?.response?.data) {
        const stremioError = error?.error || error?.response?.data;
        if (typeof stremioError === 'string') {
          errorMessage = stremioError;
        } else if (stremioError?.error) {
          errorMessage = stremioError.error;
        } else if (stremioError?.message) {
          errorMessage = stremioError.message;
        }
      }
      
      res.status(statusCode < 500 ? statusCode : 400).json({ 
        error: errorMessage, 
        message: errorMessage
      });
    }
  });

  // Get user's addons (group addons and current Stremio addons)
  router.get('/addons', async (req, res) => {
    try {
      const { userId, authKey } = req.query;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Validate user authentication - get authKey from query or from user's stored key
      let authKeyToValidate = authKey;
      if (!authKeyToValidate) {
        // If no authKey provided, get it from the user's stored key (for backward compatibility)
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { stremioAuthKey: true, accountId: true, isActive: true }
        });
        
        if (!user || !user.isActive) {
          return res.status(404).json({ error: 'User not found or inactive' });
        }
        
        if (!user.stremioAuthKey) {
          return res.status(400).json({ error: 'User not connected to Stremio' });
        }
        
        // Decrypt the stored auth key
        const mockReq = { appAccountId: user.accountId || DEFAULT_ACCOUNT_ID };
        authKeyToValidate = decrypt(user.stremioAuthKey, mockReq);
      }

      // Validate user exists, is active, and is in a group
      let validatedUser;
      try {
        validatedUser = await getPublicUser(authKeyToValidate, req);
      } catch (error) {
        const errorMsg = error?.message || String(error || '');
        if (errorMsg === 'USER_NOT_FOUND') {
          return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
        }
        if (errorMsg === 'USER_NOT_ACTIVE') {
          return res.status(403).json({ error: 'USER_NOT_ACTIVE', message: 'User account is inactive' });
        }
        if (errorMsg === 'USER_NOT_IN_GROUP') {
          return res.status(403).json({ error: 'USER_NOT_IN_GROUP', message: 'User is not in any active group' });
        }
        if (errorMsg.includes('Invalid or expired Stremio auth key')) {
          return res.status(401).json({ error: 'INVALID_AUTH_KEY', message: 'Invalid or expired Stremio auth key' });
        }
        console.error('Error validating user in /addons:', error);
        return res.status(403).json({ error: 'Access denied', message: errorMsg });
      }
      
      if (!validatedUser || validatedUser.id !== userId) {
        return res.status(403).json({ error: 'Access denied', message: 'User ID mismatch' });
      }

      // Get full user data
      const fullUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          stremioAuthKey: true,
          isActive: true,
          accountId: true,
          excludedAddons: true,
          protectedAddons: true
        }
      });

      if (!fullUser || !fullUser.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      if (!fullUser.stremioAuthKey) {
        return res.status(400).json({ error: 'User not connected to Stremio' });
      }

      // Use the user's accountId (not just DEFAULT_ACCOUNT_ID)
      const userAccountId = fullUser.accountId || DEFAULT_ACCOUNT_ID;

      // Get user's groups (check across all accounts to find groups containing this user)
      const allGroups = await prisma.group.findMany({
        where: {
          isActive: true
        },
        select: {
          id: true,
          userIds: true,
          accountId: true
        }
      });

      // Find groups that contain this user
      const userGroups = allGroups.filter(group => {
        if (!group.userIds) return false
        try {
          const userIds = JSON.parse(group.userIds)
          return Array.isArray(userIds) && userIds.includes(userId)
        } catch (e) {
          return false
        }
      })

      // Get group addons from the first group the user belongs to
      let groupAddons = [];
      if (userGroups.length > 0) {
        // Get full group details with addons
        const groupWithAddons = await prisma.group.findUnique({
          where: { id: userGroups[0].id },
          include: {
            addons: {
              include: {
                addon: true
              }
            }
          }
        });

        if (groupWithAddons) {
          const { getGroupAddons } = require('../utils/helpers');
          // Create a mock request object with appAccountId for getGroupAddons
          // getGroupAddons expects req with appAccountId and getAccountId
          const mockReq = { 
            appAccountId: groupWithAddons.accountId || userAccountId,
            getAccountId: () => groupWithAddons.accountId || userAccountId
          };
          groupAddons = await getGroupAddons(prisma, groupWithAddons.id, mockReq);
        }
      }

      // Get user's current Stremio addons with proper error handling
      let stremioAddons = [];
      try {
        const mockReq = { appAccountId: userAccountId };
        const authKeyPlain = decrypt(fullUser.stremioAuthKey, mockReq);
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain });
        
        const stremioAddonsResponse = await apiClient.request('addonCollectionGet', {});
        stremioAddons = Array.isArray(stremioAddonsResponse) 
          ? stremioAddonsResponse 
          : (stremioAddonsResponse?.addons || []);
      } catch (stremioError) {
        const errorMsg = stremioError?.message || stremioError?.error || String(stremioError || '');
        // Check if it's a session/auth error
        if (/session does not exist|invalid|expired|authentication/i.test(errorMsg)) {
          console.error(`Error fetching Stremio addons for user ${userId}: Session does not exist`);
          // Return empty addons instead of failing - user can reconnect later
          stremioAddons = [];
        } else {
          // For other errors, rethrow to be caught by outer catch
          throw stremioError;
        }
      }

      // Parse excluded addons
      // excludedAddons is stored as JSON string in DB
      let excludedAddonIds = [];
      try {
        excludedAddonIds = fullUser.excludedAddons ? JSON.parse(fullUser.excludedAddons) : [];
      } catch {
        excludedAddonIds = [];
      }

      // Parse protected addons
      let protectedAddons = [];
      try {
        protectedAddons = fullUser.protectedAddons ? JSON.parse(fullUser.protectedAddons) : [];
      } catch {
        protectedAddons = [];
      }

      res.json({
        groupAddons: groupAddons || [],
        stremioAddons: stremioAddons || [],
        excludedAddonIds: excludedAddonIds || [],
        protectedAddons: protectedAddons || []
      });
    } catch (error) {
      console.error('Error fetching addons:', error);
      res.status(500).json({ error: 'Failed to fetch addons', message: error?.message });
    }
  });

  // Exclude addon from group
  router.post('/exclude-addon', async (req, res) => {
    try {
      const { userId, addonId } = req.body;
      
      if (!userId || !addonId) {
        return res.status(400).json({ error: 'User ID and addon ID are required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          accountId: true,
          excludedAddons: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify user belongs to default account (public users)
      if (user.accountId !== DEFAULT_ACCOUNT_ID) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Parse current excluded addons
      let currentExcluded = [];
      try {
        currentExcluded = user.excludedAddons ? JSON.parse(user.excludedAddons) : [];
      } catch {
        currentExcluded = [];
      }
      
      // Add addon ID if not already excluded
      if (!currentExcluded.includes(addonId)) {
        currentExcluded.push(addonId);
        
        await prisma.user.update({
          where: { id: userId },
          data: {
            excludedAddons: JSON.stringify(currentExcluded)
          }
        });
      }

      res.json({
        success: true,
        message: 'Addon excluded from group',
        excludedAddonIds: currentExcluded
      });
    } catch (error) {
      console.error('Error excluding addon:', error);
      res.status(500).json({ error: 'Failed to exclude addon', message: error?.message });
    }
  });

  // Remove exclusion (include addon back in group)
  router.post('/include-addon', async (req, res) => {
    try {
      const { userId, addonId } = req.body;
      
      if (!userId || !addonId) {
        return res.status(400).json({ error: 'User ID and addon ID are required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          accountId: true,
          excludedAddons: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify user belongs to default account (public users)
      if (user.accountId !== DEFAULT_ACCOUNT_ID) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Parse current excluded addons
      let currentExcluded = [];
      try {
        currentExcluded = user.excludedAddons ? JSON.parse(user.excludedAddons) : [];
      } catch {
        currentExcluded = [];
      }
      
      // Remove addon ID from excluded list
      const updatedExcluded = currentExcluded.filter(id => id !== addonId);
      
      await prisma.user.update({
        where: { id: userId },
        data: {
          excludedAddons: JSON.stringify(updatedExcluded)
        }
      });

      res.json({
        success: true,
        message: 'Addon included back in group',
        excludedAddonIds: updatedExcluded
      });
    } catch (error) {
      console.error('Error including addon:', error);
      res.status(500).json({ error: 'Failed to include addon', message: error?.message });
    }
  });

  // Delete library item
  router.delete('/library/:itemId', async (req, res) => {
    try {
      const { userId } = req.query;
      const { itemId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          stremioAuthKey: true,
          isActive: true,
          accountId: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      // Verify user belongs to default account (public users)
      if (user.accountId !== DEFAULT_ACCOUNT_ID) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ error: 'User not connected to Stremio' });
      }

      // Decrypt auth key
      const mockReq = { appAccountId: DEFAULT_ACCOUNT_ID };
      const authKeyPlain = decrypt(user.stremioAuthKey, mockReq);

      const { markLibraryItemRemoved } = require('../utils/libraryDelete');

      try {
        await markLibraryItemRemoved({
          authKey: authKeyPlain,
          itemId,
          logPrefix: '[public-library]'
        });
      } catch (deleteError) {
        if (deleteError.code === 'NOT_FOUND') {
          return res.status(404).json({
            error: 'Library item not found',
            itemId: deleteError.meta?.itemId,
            totalItems: deleteError.meta?.totalItems
          });
        }
        console.error('[public-library] Error deleting library item via helper:', deleteError);
        return res.status(500).json({ error: 'Failed to delete library item', message: deleteError?.message });
      }

      // Clear the cache for this user
      const { clearCache } = require('../utils/libraryCache');
      clearCache(DEFAULT_ACCOUNT_ID, userId);

      res.json({ 
        success: true,
        message: 'Library item deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting library item:', error);
      res.status(500).json({ error: 'Failed to delete library item', message: error?.message });
    }
  });

  // Protect/unprotect addon
  router.post('/protect-addon', async (req, res) => {
    try {
      const { userId, name } = req.body;
      const { unsafe } = req.query;
      
      if (!userId || !name) {
        return res.status(400).json({ error: 'User ID and addon name are required' });
      }

      // Default Stremio addons (name-based) in safe mode
      const { defaultAddons } = require('../utils/config');
      const normalizeName = (n) => String(n || '').trim().toLowerCase();
      const isDefaultAddon = defaultAddons.names.some((n) => normalizeName(name).includes(normalizeName(n)));
      
      if (isDefaultAddon && unsafe !== 'true') {
        return res.status(403).json({ 
          error: 'This addon is protected by default and cannot be unprotected in safe mode',
          isDefaultAddon: true
        });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          accountId: true,
          protectedAddons: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify user belongs to default account (public users)
      if (user.accountId !== DEFAULT_ACCOUNT_ID) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Parse current protected addons (plaintext names)
      let currentList = [];
      try {
        currentList = user.protectedAddons ? JSON.parse(user.protectedAddons) : [];
      } catch {
        currentList = [];
      }

      const targetName = name.trim();
      const targetNorm = normalizeName(targetName);
      const nextList = [...currentList];
      const idx = nextList.findIndex((n) => normalizeName(n) === targetNorm);
      
      if (idx >= 0) {
        nextList.splice(idx, 1);
      } else {
        nextList.push(targetName);
      }

      // Update user
      await prisma.user.update({
        where: { id: userId },
        data: {
          protectedAddons: JSON.stringify(nextList)
        }
      });
      
      const isProtected = nextList.findIndex((n) => normalizeName(n) === targetNorm) >= 0;
      
      res.json({ 
        message: `Addon ${isProtected ? 'protected' : 'unprotected'}`,
        protectedAddons: nextList,
        isProtected
      });
    } catch (error) {
      console.error('Error toggling protect addon:', error);
      res.status(500).json({ error: 'Failed to toggle protect addon', message: error?.message });
    }
  });

  // Remove addon from Stremio (for user portal - always allowed, no protection check)
  router.delete('/stremio-addons/:addonName', async (req, res) => {
    try {
      const { userId } = req.query;
      const { addonName } = req.params;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          accountId: true,
          stremioAuthKey: true,
          isActive: true,
          protectedAddons: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      // Verify user belongs to default account (public users)
      if (user.accountId !== DEFAULT_ACCOUNT_ID) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ error: 'User not connected to Stremio' });
      }

      const normalizeName = (n) => String(n || '').trim().toLowerCase();
      const targetNameNormalized = normalizeName(addonName);
      
      // First, unprotect the addon if it's in the protected list (so user can delete their own protected addons)
      let userProtectedNames = [];
      try {
        const parsed = user.protectedAddons ? JSON.parse(user.protectedAddons) : [];
        if (Array.isArray(parsed)) {
          userProtectedNames = parsed;
        }
      } catch {
        userProtectedNames = [];
      }
      
      // Remove from protected list if present
      const updatedProtectedNames = userProtectedNames.filter(n => normalizeName(n) !== targetNameNormalized);
      if (updatedProtectedNames.length !== userProtectedNames.length) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            protectedAddons: JSON.stringify(updatedProtectedNames)
          }
        });
      }

      // Decrypt auth key and delete from Stremio
      const mockReq = { appAccountId: DEFAULT_ACCOUNT_ID };
      const authKeyPlain = decrypt(user.stremioAuthKey, mockReq);
      const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain });

      // Get current collection
      const current = await apiClient.request('addonCollectionGet', {});
      const currentAddonsRaw = current?.addons || current || [];
      const currentAddons = Array.isArray(currentAddonsRaw)
        ? currentAddonsRaw
        : (typeof currentAddonsRaw === 'object' ? Object.values(currentAddonsRaw) : []);

      // Filter out the target addon by matching name (normalized)
      const filteredAddons = currentAddons.filter((a) => {
        const aName = a?.manifest?.name || a?.transportName || a?.name || '';
        return normalizeName(aName) !== targetNameNormalized;
      });

      // Set the filtered addons
      await apiClient.request('addonCollectionSet', { addons: filteredAddons });

      res.json({ message: 'Addon removed from Stremio account successfully' });
    } catch (error) {
      console.error('Error removing Stremio addon:', error);
      res.status(500).json({ error: 'Failed to remove addon', message: error?.message });
    }
  });

  // Generate/rotate user API key (user-specific, for accessing own metrics only)
  router.post('/user-api-key', async (req, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          accountId: true,
          isActive: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      // Generate new API key
      const { generateApiKey } = require('../utils/apiKey');
      const { getServerKey, aesGcmEncrypt } = require('../utils/encryption');
      const key = generateApiKey();
      
      // Encrypt using user-specific key (userId + server key) - same pattern as account API keys
      const serverKey = getServerKey();
      const crypto = require('crypto');
      const userKey = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(userId), serverKey])).digest();
      const encrypted = aesGcmEncrypt(userKey, key);
      
      await prisma.user.update({
        where: { id: userId },
        data: { apiKey: encrypted }
      });

      // Return the key
      res.json({ apiKey: key });
    } catch (error) {
      console.error('Error generating user API key:', error);
      res.status(500).json({ error: 'Failed to generate API key', message: error?.message });
    }
  });

  // Get user API key (retrieve existing key)
  router.get('/user-api-key', async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          apiKey: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.apiKey) {
        return res.json({ hasKey: false, apiKey: null });
      }

      // Decrypt using user-specific key (userId + server key)
      try {
        const { getServerKey, aesGcmDecrypt } = require('../utils/encryption');
        const serverKey = getServerKey();
        const crypto = require('crypto');
        const userKey = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(userId), serverKey])).digest();
        const decrypted = aesGcmDecrypt(userKey, user.apiKey);
        return res.json({ hasKey: true, apiKey: decrypted });
      } catch (e) {
        // If decryption fails, key might be in old format (hashed) - treat as no key
        console.error('Failed to decrypt user API key:', e.message);
        return res.json({ hasKey: false, apiKey: null });
      }
    } catch (error) {
      console.error('Error getting user API key:', error);
      res.status(500).json({ error: 'Failed to get API key', message: error?.message });
    }
  });

  // Check if user has an API key (legacy endpoint, kept for compatibility)
  router.get('/user-api-key-status', async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          apiKey: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ hasKey: !!user.apiKey });
    } catch (error) {
      console.error('Error checking user API key status:', error);
      res.status(500).json({ error: 'Failed to check API key status', message: error?.message });
    }
  });

  // Delete user API key
  router.delete('/user-api-key', async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { apiKey: null }
      });

      res.json({ message: 'API key revoked' });
    } catch (error) {
      console.error('Error revoking user API key:', error);
      res.status(500).json({ error: 'Failed to revoke API key', message: error?.message });
    }
  });

  return router;
};


