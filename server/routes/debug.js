const express = require('express');
const { createHealthCheckHandler } = require('../utils/helpers');

module.exports = ({ prisma, getDecryptedManifestUrl, getAccountId }) => {
  const router = express.Router();

  // Create centralized health check handler
  const healthCheckHandler = createHealthCheckHandler(prisma);
  
  // Health check endpoints (both use same handler to eliminate duplication)
  router.get('/health', healthCheckHandler);
  router.get('/api/health', healthCheckHandler);

  // Debug endpoint to check addons in database
  router.get('/debug/addons', async (req, res) => {
    try {
      const allAddons = await prisma.addon.findMany({
        select: { id: true, name: true, accountId: true, manifestUrl: true, isActive: true }
      });
      const addons = allAddons.map(a => ({
        ...a,
        manifestUrl: getDecryptedManifestUrl(a)
      }))
      res.json({
        total: addons.length,
        addons,
        currentAccount: req.appAccountId || 'none'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Debug current addons for a specific user
  router.get('/debug/current-addons/:userId', async (req, res) => {
    try {
      const { userId } = req.params
      
      // Get user with Stremio connection
      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      // Find groups that contain this user using userIds JSON array
      const userGroups = await prisma.group.findMany({
        where: {
          userIds: {
            contains: userId
          }
        },
        include: {
          addons: {
            include: {
              addon: true
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

      // Get current Stremio addons
      let stremioAddons = []
      try {
        const authKeyPlain = decrypt(user.stremioAuthKey)
        const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
        const collection = await apiClient.request('addonCollectionGet', {})
        
        const rawAddons = collection?.addons || collection || {}
        stremioAddons = Array.isArray(rawAddons) ? rawAddons : (typeof rawAddons === 'object' ? Object.values(rawAddons) : [])
      } catch (error) {
        console.error('Error fetching Stremio addons for debug:', error)
        return res.status(500).json({ error: 'Failed to fetch Stremio addons' })
      }

      // Get expected addons from groups
      const expectedAddons = userGroups.flatMap(group => 
        group.addons
          .filter(ga => ga.addon && ga.addon.isActive !== false)
          .map(ga => ({
            id: ga.addon.id,
            name: ga.addon.name,
            manifestUrl: getDecryptedManifestUrl(ga.addon, req),
            version: ga.addon.version
          }))
      )

      res.json({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          isActive: user.isActive
        },
        groups: userGroups.map(group => ({
          id: group.id,
          name: group.name,
          addonCount: group.addons.length
        })),
        stremioAddons: stremioAddons.map(addon => ({
          id: addon.id || addon.manifest?.id,
          name: addon.name || addon.manifest?.name,
          manifestUrl: addon.transportUrl || addon.manifestUrl,
          version: addon.version || addon.manifest?.version
        })),
        expectedAddons,
        syncStatus: {
          stremioCount: stremioAddons.length,
          expectedCount: expectedAddons.length,
          isSynced: stremioAddons.length === expectedAddons.length
        }
      })
    } catch (error) {
      console.error('Error fetching debug current addons:', error)
      res.status(500).json({ error: 'Failed to fetch debug current addons' })
    }
  });

  return router;
};
