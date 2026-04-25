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
  const { getShares, getGroupMembers } = require('../utils/sharesManager')
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

  // Generate OAuth link (admin/public-library flow)
  router.post('/generate-oauth', async (req, res) => {
    try {
      // Mirror the working implementation used in invitations public router
      let oauthCode = null;
      let oauthLink = null;
      let oauthExpiresAt = null;

      try {
        const host = req.headers.host || req.headers.origin || 'syncio.local';
        const origin = req.headers.origin || (host.startsWith('http') ? host : `http://${host}`);

        const stremioResponse = await fetch('https://link.stremio.com/api/v2/create?type=Create', {
          headers: {
            'X-Requested-With': host,
            Origin: origin,
          },
          // Keep request minimal; Stremio ignores referrer for this endpoint
          referrerPolicy: 'no-referrer',
        });

        if (stremioResponse.ok) {
          const stremioData = await stremioResponse.json().catch(() => ({}));
          const result = stremioData?.result;
          if (result?.success && result?.code && result?.link) {
            oauthCode = result.code;
            oauthLink = result.link;
            // 5 min expiry - convert to ISO string for JSON serialization
            oauthExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          } else {
            return res.status(500).json({
              error: 'Failed to generate OAuth link - Stremio API returned invalid response',
              details: stremioData?.error?.message || 'Missing code or link in response',
            });
          }
        } else {
          const errorText = await stremioResponse.text();
          return res.status(500).json({
            error: 'Failed to generate OAuth link from Stremio',
            details: `HTTP ${stremioResponse.status}: ${errorText}`,
          });
        }
      } catch (error) {
        return res.status(500).json({
          error: 'Failed to generate OAuth link',
          details: error?.message || 'Unknown error',
        });
      }

      res.setHeader('Content-Type', 'application/json');
      res.json({
        success: true,
        code: oauthCode,
        link: oauthLink,
        expiresAt: oauthExpiresAt,
      });
    } catch (error) {
      console.error('Error generating OAuth link:', error);
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: 'Failed to generate OAuth link', message: error?.message });
    }
  });

  // Poll for OAuth completion (admin/public-library flow)
  router.post('/poll-oauth', async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ error: 'OAuth code is required' });
      }

      try {
        const host = req.headers.host || req.headers.origin || 'syncio.local';
        const origin = req.headers.origin || (host.startsWith('http') ? host : `http://${host}`);

        const stremioResponse = await fetch(
          `https://link.stremio.com/api/v2/read?type=Read&code=${encodeURIComponent(code)}`,
          {
            headers: {
              'X-Requested-With': host,
              Origin: origin,
            },
            referrerPolicy: 'no-referrer',
          }
        );

        const data = await stremioResponse.json().catch(() => ({}));
        const result = data?.result;

        if (result?.success && result?.authKey) {
          return res.json({
            success: true,
            authKey: result.authKey,
          });
        }

        // Pending or no auth key yet
        if (data?.error && data.error.code && data.error.code !== 101) {
          return res.json({
            success: false,
            authKey: null,
            error: data.error.message || 'Stremio reported an error while polling OAuth',
          });
        }

        return res.json({ success: false, authKey: null });
      } catch (error) {
        console.error('Error polling OAuth from Stremio:', error);
        return res.json({
          success: false,
          authKey: null,
          error: error?.message || 'Failed to poll OAuth status',
        });
      }
    } catch (error) {
      console.error('Error polling OAuth:', error);
      res.json({ success: false, authKey: null, error: error?.message });
    }
  });

  // Helper to extract auth key from header or query
  const getAuthKey = (req) => {
    return req.headers['x-stremio-auth'] || req.query.authKey || req.body?.authKey;
  };

  // Authenticate with OAuth and get/create user
  router.post('/authenticate', async (req, res) => {
    try {
      const authKey = getAuthKey(req);
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
      const { userId } = req.body;
      const authKey = getAuthKey(req);
      
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
      const { userId } = req.query;
      const authKey = getAuthKey(req);
      
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

  // Update activity visibility
  router.patch('/activity-visibility', async (req, res) => {
    try {
      const { userId, activityVisibility } = req.body;
      const authKey = getAuthKey(req);
      
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
      const authKey = getAuthKey(req);
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get target user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          stremioAuthKey: true,
          isActive: true,
          accountId: true,
          activityVisibility: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      // Security check: If requesting a different user's library, verify access
      if (requestingUserId && requestingUserId !== userId) {
        // Verify requesting user exists and belongs to same account
        const requestingUser = await prisma.user.findUnique({
          where: { id: requestingUserId },
          select: { id: true, accountId: true }
        });
        
        if (!requestingUser || requestingUser.accountId !== user.accountId) {
          return res.status(403).json({ error: 'Access denied: Invalid requesting user' });
        }
        
        // Check if requesting user is in the same group and target user is public
        const { getGroupMembers } = require('../utils/sharesManager');
        const groupMembers = await getGroupMembers(prisma, user.accountId, requestingUserId);
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
      let library = getCachedLibrary(user.accountId, user);
      
      // Check if cache only has removed items ( stale cache) - if so, refresh from Stremio
      // Active items: !item.removed (handles false, undefined, null, 0)
      const hasActiveItems = library && Array.isArray(library) && library.some(item => !item.removed);
      
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
        
        // Active items: !item.removed
        const activeFromStremio = library.filter(item => !item.removed).length
        console.log(`[Library Cache] Stremio returned: total=${library.length}, active=${activeFromStremio}`)
        
        if (Array.isArray(library) && library.length > 0) {
          setCachedLibrary(user.accountId, user, library);
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

      // Sort by watch date (lastWatched only)
      // IMPORTANT: Do NOT use _mtime - that's just when the library item was modified (e.g., added to library)
      allLibrary.sort((a, b) => {
        const getWatchDate = (item) => {
          if (item.state?.lastWatched) {
            const d = new Date(item.state.lastWatched)
            if (!isNaN(d.getTime())) return d.getTime()
          }
          return 0
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

  // Add an addon to Stremio and protect it
  router.post('/add-addon', async (req, res) => {
    try {
      const { userId, addonUrl, manifestData: providedManifestData } = req.body;
      const authKey = getAuthKey(req);
      
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

  // Get user's addons (group addons and Stremio addons)
  router.get('/addons', async (req, res) => {
    try {
      const { userId } = req.query;
      const authKey = getAuthKey(req);
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Validate user authentication - get authKey from header/query/body or from user's stored key
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
        // Check if it's a decryption error (encryption key mismatch or corrupted data)
        if (/unsupported state|unable to authenticate data|invalid encrypted data|decryption failed/i.test(errorMsg)) {
          console.error(`Error fetching Stremio addons for user ${userId}: ${errorMsg}`);
          // Return empty addons instead of failing - user needs to reconnect with correct encryption key
          stremioAddons = [];
        } else if (/session does not exist|invalid|expired|authentication/i.test(errorMsg)) {
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
      const authKey = getAuthKey(req);
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          stremioAuthKey: true,
          isActive: true,
          accountId: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      if (!user.stremioAuthKey) {
        return res.status(400).json({ error: 'User not connected to Stremio' });
      }

      // Decrypt auth key
      const mockReq = { appAccountId: user.accountId || DEFAULT_ACCOUNT_ID };
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
      clearCache(DEFAULT_ACCOUNT_ID, user);

      res.json({ 
        success: true,
        message: 'Library item deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting library item:', error);
      res.status(500).json({ error: 'Failed to delete library item', message: error?.message });
    }
  });

  // Toggle addon protection status
  router.post('/protect-addon', async (req, res) => {
    try {
      const { userId, name } = req.body;
      const { unsafe } = req.query;
      const authKey = getAuthKey(req);
      
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
      const authKey = getAuthKey(req);
      
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
      const authKey = getAuthKey(req);
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          accountId: true,
          isActive: true,
          stremioAuthKey: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      // Verify auth key
      if (!authKey) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      try {
        await getPublicUser(authKey, req);
      } catch (e) {
        return res.status(401).json({ error: 'Invalid auth key' });
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
      const authKey = getAuthKey(req);

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          apiKey: true,
          stremioAuthKey: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify auth key
      if (!authKey) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      try {
        await getPublicUser(authKey, req);
      } catch (e) {
        return res.status(401).json({ error: 'Invalid auth key' });
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
      const authKey = getAuthKey(req);

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          apiKey: true,
          stremioAuthKey: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify auth key
      if (!authKey) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      try {
        await getPublicUser(authKey, req);
      } catch (e) {
        return res.status(401).json({ error: 'Invalid auth key' });
      }

      res.json({ hasKey: !!user.apiKey });
    } catch (error) {
      console.error('Error checking user API key status:', error);
      res.status(500).json({ error: 'Failed to check API key status', message: error?.message });
    }
  });

  // Get user's activity (watch sessions and stats)
  router.get('/activity', async (req, res) => {
    try {
      const { userId, limit = 100 } = req.query;
      const authKey = getAuthKey(req);
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          colorIndex: true,
          accountId: true,
          isActive: true,
          stremioAuthKey: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      // Verify auth key
      if (!authKey) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      try {
        await getPublicUser(authKey, req);
      } catch (e) {
        return res.status(401).json({ error: 'Invalid auth key' });
      }

      // Fetch watch activity for this user (using WatchActivity table like old syncio)
      console.log('Fetching watch activity for user:', userId, 'account:', user.accountId);
      const watchActivities = await prisma.watchActivity.findMany({
        where: {
          userId: userId,
          accountId: user.accountId || DEFAULT_ACCOUNT_ID
        },
        orderBy: { date: 'desc' },
        take: parseInt(limit) || 100
      });
      console.log('Watch activities found:', watchActivities.length);

      // Load library cache to get item names and posters
      console.log('Loading library cache for account:', user.accountId);
      const libraryCache = getCachedLibrary(user.accountId || DEFAULT_ACCOUNT_ID, user) || [];
      console.log('Library cache items:', libraryCache.length);
      const libraryItemMap = new Map();
      libraryCache.forEach(item => {
        if (item._id || item.id) {
          libraryItemMap.set(item._id || item.id, item);
        }
      });
      console.log('Library item map size:', libraryItemMap.size);

      // Helper function to extract season/episode from itemId
      function extractSeasonEpisodeFromId(itemId) {
        if (!itemId) return { season: null, episode: null };
        const parts = itemId.split(':');
        
        // Kitsu format: "kitsu:46676:1"
        if (itemId.startsWith('kitsu:') && parts.length >= 3) {
          const episodePart = parts[parts.length - 1];
          const parsedEpisode = parseInt(episodePart, 10);
          return {
            season: 1,
            episode: !isNaN(parsedEpisode) ? parsedEpisode : null
          };
        }
        
        // IMDb format: "tt8080122:4:6" (season:episode)
        if (parts.length >= 3 && parts[0].startsWith('tt')) {
          return {
            season: parseInt(parts[1], 10) || null,
            episode: parseInt(parts[2], 10) || null
          };
        }
        
        // IMDb format: "tt8080122:6" (episode only)
        if (parts.length === 2 && parts[0].startsWith('tt')) {
          return {
            season: null,
            episode: parseInt(parts[1], 10) || null
          };
        }
        
        return { season: null, episode: null };
      }

      // Fetch episode watch history for additional detail
      const episodeHistory = await prisma.episodeWatchHistory.findMany({
        where: {
          userId: userId,
          accountId: user.accountId || DEFAULT_ACCOUNT_ID
        },
        orderBy: { watchedAt: 'desc' },
        take: parseInt(limit) || 100
      });

      // Transform watch activity into activity items (like old syncio)
      const activityItems = watchActivities.map(activity => {
        // Get item details from library cache
        const libraryItem = libraryItemMap.get(activity.itemId);
        const { season, episode } = extractSeasonEpisodeFromId(activity.itemId);
        
        // Calculate end time from date + watchTimeSeconds
        const startTime = new Date(activity.date);
        const endTime = new Date(startTime.getTime() + (activity.watchTimeSeconds * 1000));
        
        return {
          id: activity.id,
          type: 'session',
          userId: activity.userId,
          username: user.username || user.email || 'Unknown',
          userEmail: user.email,
          userColorIndex: user.colorIndex || 0,
          itemId: activity.itemId,
          videoId: activity.itemId, // Use itemId as videoId for series
          itemName: libraryItem?.name || activity.itemId,
          itemType: activity.itemType,
          season: season,
          episode: episode,
          poster: libraryItem?.poster || null,
          startTime: startTime,
          endTime: endTime,
          durationSeconds: activity.watchTimeSeconds,
          isActive: false, // Historical data, never active
          isSynthetic: false
        };
      });

      // Transform episode history into activity items (as fallback/additional data)
      const episodeItems = episodeHistory.map(history => ({
        id: history.id,
        type: 'episode',
        userId: history.userId,
        username: user.username || user.email || 'Unknown',
        userEmail: user.email,
        userColorIndex: user.colorIndex || 0,
        itemId: history.itemId,
        videoId: history.videoId,
        itemName: history.itemName,
        itemType: 'series',
        season: history.season,
        episode: history.episode,
        poster: history.poster,
        startTime: history.watchedAt,
        endTime: history.watchedAt,
        durationSeconds: history.durationSeconds || 0,
        isActive: false,
        isSynthetic: false
      }));

      // Calculate stats
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const oneWeekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Total watch time (all watch activities)
      const totalWatchTimeSeconds = watchActivities
        .reduce((sum, a) => sum + (a.watchTimeSeconds || 0), 0);

      // Watch time today
      const watchTimeTodaySeconds = watchActivities
        .filter(a => new Date(a.date) >= todayStart)
        .reduce((sum, a) => sum + (a.watchTimeSeconds || 0), 0);

      // Count movies and series from unique items
      const uniqueItems = new Map();
      watchActivities.forEach(a => {
        if (!uniqueItems.has(a.itemId)) {
          uniqueItems.set(a.itemId, a.itemType);
        }
      });
      const moviesCount = [...uniqueItems.values()].filter(t => t === 'movie').length;
      const seriesCount = [...uniqueItems.values()].filter(t => t === 'series').length;

      // Items watched this week
      const recentItemsCount = watchActivities
        .filter(a => new Date(a.date) >= oneWeekAgo)
        .length;

      // Watch time by day (last 7 days)
      const watchTimeByDay = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(todayStart);
        date.setDate(date.getDate() - i);
        const dayStart = new Date(date);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        const dayActivities = watchActivities.filter(a => {
          const activityDate = new Date(a.date);
          return activityDate >= dayStart && activityDate <= dayEnd;
        });

        const daySeconds = dayActivities.reduce((sum, a) => sum + (a.watchTimeSeconds || 0), 0);
        const dayMovies = dayActivities.filter(a => a.itemType === 'movie').length;
        const daySeries = dayActivities.filter(a => a.itemType === 'series').length;

        watchTimeByDay.push({
          date: date.toLocaleDateString('en-US', { weekday: 'short' }),
          hours: daySeconds / 3600,
          minutes: Math.round(daySeconds / 60),
          movies: dayMovies,
          series: daySeries,
          total: dayActivities.length
        });
      }

      // === ADDITIONAL STATS FOR USER HOME ===

      // Watched today count
      const watchedTodayCount = watchActivities
        .filter(a => new Date(a.date) >= todayStart)
        .length;

      // Calculate watch streak
      let currentStreak = 0;
      let longestStreak = 0;
      let tempStreak = 0;
      const activitiesByDay = new Map();
      
      // Group activities by date
      watchActivities.forEach(a => {
        const dateKey = new Date(a.date).toISOString().split('T')[0];
        if (!activitiesByDay.has(dateKey)) {
          activitiesByDay.set(dateKey, true);
        }
      });

      // Calculate current streak (consecutive days from today going backwards)
      const checkDate = new Date(todayStart);
      while (true) {
        const dateKey = checkDate.toISOString().split('T')[0];
        if (activitiesByDay.has(dateKey)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          // Allow 1 day gap only if today has no activity yet
          if (currentStreak === 0 && checkDate.getTime() === todayStart.getTime()) {
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
          }
          break;
        }
      }

      // Calculate longest streak
      const sortedDates = [...activitiesByDay.keys()].sort();
      tempStreak = 0;
      for (let i = 0; i < sortedDates.length; i++) {
        if (i === 0) {
          tempStreak = 1;
        } else {
          const prevDate = new Date(sortedDates[i - 1]);
          const currDate = new Date(sortedDates[i]);
          const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000));
          if (diffDays === 1) {
            tempStreak++;
          } else {
            if (tempStreak > longestStreak) longestStreak = tempStreak;
            tempStreak = 1;
          }
        }
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak;

      // Average watch time per day (last 7 days with activity)
      const daysWithActivity = watchTimeByDay.filter(d => d.total > 0);
      const avgWatchTimeSeconds = daysWithActivity.length > 0
        ? daysWithActivity.reduce((sum, d) => sum + (d.hours * 3600), 0) / daysWithActivity.length
        : 0;

      // Most watched item
      const itemCounts = new Map();
      watchActivities.forEach(a => {
        const key = a.itemId;
        const libraryItem = libraryItemMap.get(a.itemId);
        if (!itemCounts.has(key)) {
          itemCounts.set(key, { 
            count: 0, 
            name: libraryItem?.name || a.itemId, 
            type: a.itemType,
            poster: libraryItem?.poster || null,
            totalDuration: 0
          });
        }
        const item = itemCounts.get(key);
        item.count++;
        item.totalDuration += (a.watchTimeSeconds || 0);
      });
      
      const mostWatched = [...itemCounts.entries()]
        .sort((a, b) => b[1].totalDuration - a[1].totalDuration)
        .slice(0, 1)
        .map(([id, data]) => ({
          id,
          name: data.name,
          type: data.type,
          poster: data.poster,
          count: data.count,
          totalDuration: data.totalDuration
        }))[0] || null;

      // Binge watches (3+ episodes of same series in one day)
      const bingeWatches = [];
      const seriesActivitiesByDay = new Map();
      
      watchActivities.filter(a => a.itemType === 'series').forEach(a => {
        const dateKey = new Date(a.date).toISOString().split('T')[0];
        const seriesKey = `${dateKey}:${a.itemId}`;
        const libraryItem = libraryItemMap.get(a.itemId);
        const { season, episode } = extractSeasonEpisodeFromId(a.itemId);
        
        if (!seriesActivitiesByDay.has(seriesKey)) {
          seriesActivitiesByDay.set(seriesKey, { 
            name: libraryItem?.name || a.itemId, 
            poster: libraryItem?.poster || null,
            episodes: [],
            totalDuration: 0,
            date: dateKey
          });
        }
        const series = seriesActivitiesByDay.get(seriesKey);
        series.episodes.push({ season, episode });
        series.totalDuration += (a.watchTimeSeconds || 0);
      });

      for (const [key, data] of seriesActivitiesByDay.entries()) {
        if (data.episodes.length >= 3) {
          bingeWatches.push({
            name: data.name,
            poster: data.poster,
            episodeCount: data.episodes.length,
            totalDuration: data.totalDuration,
            date: data.date
          });
        }
      }
      bingeWatches.sort((a, b) => b.episodeCount - a.episodeCount);

      // Now playing - query watchSession for real-time active sessions
      const activeSessions = await prisma.watchSession.findMany({
        where: {
          userId: userId,
          accountId: user.accountId || DEFAULT_ACCOUNT_ID,
          isActive: true
        },
        orderBy: { startTime: 'desc' }
      });
      
      const nowPlaying = activeSessions.map(s => ({
        item: {
          id: s.itemId,
          name: s.itemName,
          type: s.itemType,
          poster: s.poster,
          season: s.season,
          episode: s.episode
        },
        startTime: s.startTime,
        videoId: s.videoId
      }));

      res.json({
        sessions: activityItems,
        episodeHistory: episodeItems,
        stats: {
          totalWatchTimeSeconds,
          totalWatchTimeHours: totalWatchTimeSeconds / 3600,
          watchTimeTodaySeconds,
          watchTimeTodayHours: watchTimeTodaySeconds / 3600,
          watchedTodayCount,
          moviesCount,
          seriesCount,
          recentItemsCount,
          totalSessions: watchActivities.length,
          currentStreak,
          longestStreak,
          avgWatchTimeSeconds,
          avgWatchTimeHours: avgWatchTimeSeconds / 3600
        },
        watchTimeByDay,
        nowPlaying,
        mostWatched,
        bingeWatches: bingeWatches.slice(0, 5),
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          colorIndex: user.colorIndex
        }
      });
    } catch (error) {
      console.error('Error fetching user activity:', error);
      res.status(500).json({ error: 'Failed to fetch activity', message: error?.message });
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

  // Sync user's addons (public endpoint)
  router.post('/sync', async (req, res) => {
    try {
      const { userId } = req.body;
      const authKey = getAuthKey(req);
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user and verify auth
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          accountId: true,
          isActive: true,
          stremioAuthKey: true,
          groupId: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      // Optionally verify authKey matches
      if (authKey && user.stremioAuthKey && authKey !== user.stremioAuthKey) {
        return res.status(403).json({ error: 'Invalid auth key' });
      }

      // Import syncUserAddons from users route
      const { syncUserAddons } = require('./users');
      
      // Perform sync
      const result = await syncUserAddons(prisma, userId, [], false, req, decrypt, getAccountId, true);
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: 'Sync completed successfully',
          details: result
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: result.error || 'Sync failed',
          details: result
        });
      }
    } catch (error) {
      console.error('Error syncing user:', error);
      res.status(500).json({ error: 'Failed to sync', message: error?.message });
    }
  });

  // Check if user is at risk (public endpoint)
  router.get('/at-risk-status', async (req, res) => {
    try {
      const { userId } = req.query;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user with sync status info
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          isActive: true,
          accountId: true,
          lastSyncedAt: true,
          syncStatus: true,
          syncErrorMessage: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      // Check last activity (from watch activity)
      const lastActivity = await prisma.watchActivity.findFirst({
        where: { userId },
        orderBy: { date: 'desc' },
        select: { date: true }
      });

      const now = new Date();
      const lastActivityDate = lastActivity?.date || user.lastSyncedAt;
      const daysSinceActivity = lastActivityDate 
        ? Math.floor((now.getTime() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Determine risk level
      let riskLevel = 'healthy'; // healthy, warning, critical
      let riskReason = null;

      if (user.syncStatus === 'error' || user.syncStatus === 'failed') {
        riskLevel = 'critical';
        riskReason = user.syncErrorMessage || 'Sync is failing';
      } else if (daysSinceActivity !== null) {
        if (daysSinceActivity >= 14) {
          riskLevel = 'critical';
          riskReason = `No activity for ${daysSinceActivity} days`;
        } else if (daysSinceActivity >= 7) {
          riskLevel = 'warning';
          riskReason = `No activity for ${daysSinceActivity} days`;
        }
      }

      res.json({
        userId,
        riskLevel,
        riskReason,
        lastActivity: lastActivityDate,
        daysSinceActivity,
        syncStatus: user.syncStatus,
        syncErrorMessage: user.syncErrorMessage,
        lastSyncedAt: user.lastSyncedAt
      });
    } catch (error) {
      console.error('Error checking at-risk status:', error);
      res.status(500).json({ error: 'Failed to check status', message: error?.message });
    }
  });

  // Public endpoint: Get user shares
  router.get('/shares', async (req, res) => {
    try {
      const { userId } = req.query;
      const authKey = getAuthKey(req);
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Verify auth key
      if (!authKey) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      try {
        await getPublicUser(authKey, req);
      } catch (e) {
        return res.status(401).json({ error: 'Invalid auth key' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, accountId: true, isActive: true }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      const shares = getShares(user.accountId, userId);
      res.json(shares);
    } catch (error) {
      console.error(`Failed to get shares for user ${req.query.userId}:`, error);
      res.status(500).json({ error: 'Failed to get shares', message: error?.message });
    }
  });

  // Public endpoint: Get user group members
  router.get('/group-members', async (req, res) => {
    try {
      const { userId } = req.query;
      const authKey = getAuthKey(req);
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Verify auth key
      if (!authKey) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      try {
        await getPublicUser(authKey, req);
      } catch (e) {
        return res.status(401).json({ error: 'Invalid auth key' });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, accountId: true, isActive: true }
      });

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      const groupMembers = await getGroupMembers(prisma, user.accountId, userId);
      res.json({ members: groupMembers });
    } catch (error) {
      console.error(`Failed to get group members for user ${req.query.userId}:`, error);
      res.status(500).json({ error: 'Failed to get group members', message: error?.message });
    }
  });

  return router;
};


