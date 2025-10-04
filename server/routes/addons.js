const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireGroupAccess, requireGroupAdmin, requireAdmin } = require('../middleware/auth');
const { validate, addAddonSchema, updateAddonSettingsSchema } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// Get all available addons
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';

    const addons = await prisma.addon.findMany({
      where: {
        isActive: true,
        AND: [
          search ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { author: { contains: search, mode: 'insensitive' } },
            ],
          } : {},
          category ? { category } : {},
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        iconUrl: true,
        version: true,
        author: true,
        category: true,
        isOfficial: true,
        createdAt: true,
        _count: {
          select: { groupAddons: true },
        },
      },
      orderBy: [
        { isOfficial: 'desc' },
        { name: 'asc' },
      ],
      skip,
      take: limit,
    });

    const totalCount = await prisma.addon.count({
      where: {
        isActive: true,
        AND: [
          search ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { author: { contains: search, mode: 'insensitive' } },
            ],
          } : {},
          category ? { category } : {},
        ],
      },
    });

    res.json({
      addons,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get addon categories
router.get('/categories', authenticateToken, async (req, res, next) => {
  try {
    const categories = await prisma.addon.findMany({
      where: {
        isActive: true,
        category: { not: null },
      },
      select: { category: true },
      distinct: ['category'],
    });

    res.json({
      categories: categories.map(c => c.category).filter(Boolean),
    });
  } catch (error) {
    next(error);
  }
});

// Add new addon (admin only)
router.post('/', authenticateToken, requireAdmin, validate(addAddonSchema), async (req, res, next) => {
  try {
    const { name, manifestUrl, description, iconUrl, version, author, category } = req.body;

    // Validate manifest URL by fetching it
    try {
      const response = await axios.get(manifestUrl, { timeout: 10000 });
      const manifest = response.data;

      if (!manifest.id || !manifest.name || !manifest.resources) {
        return res.status(400).json({ message: 'Invalid Stremio addon manifest' });
      }

      // Use manifest data if not provided
      const addonData = {
        name: name || manifest.name,
        manifestUrl,
        description: description || manifest.description || '',
        iconUrl: iconUrl || manifest.logo || '',
        version: version || manifest.version || '1.0.0',
        author: author || manifest.author || '',
        category: category || 'Other',
        isOfficial: false,
      };

      const addon = await prisma.addon.create({
        data: addonData,
      });

      res.status(201).json({
        message: 'Addon added successfully',
        addon,
      });
    } catch (manifestError) {
      return res.status(400).json({ 
        message: 'Failed to fetch or validate addon manifest',
        error: manifestError.message,
      });
    }
  } catch (error) {
    next(error);
  }
});

// Get group addons
router.get('/groups/:groupId', authenticateToken, requireGroupAccess, async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const groupAddons = await prisma.groupAddon.findMany({
      where: { groupId },
      include: {
        addon: true,
      },
      orderBy: { id: 'desc' },
    });

    res.json({ addons: groupAddons });
  } catch (error) {
    next(error);
  }
});

// Add addon to group
router.post('/groups/:groupId/:addonId', authenticateToken, requireGroupAdmin, async (req, res, next) => {
  try {
    const { groupId, addonId } = req.params;
    const { settings = {} } = req.body;

    // Check if addon exists and is active
    const addon = await prisma.addon.findFirst({
      where: {
        id: addonId,
        isActive: true,
      },
    });

    if (!addon) {
      return res.status(404).json({ message: 'Addon not found or inactive' });
    }

    // Check if addon is already added to group
    const existingGroupAddon = await prisma.groupAddon.findFirst({
      where: {
        groupId,
        addonId,
      },
    });

    if (existingGroupAddon) {
      return res.status(400).json({ message: 'Addon already added to this group' });
    }

    const groupAddon = await prisma.groupAddon.create({
      data: {
        groupId,
        addonId,
        settings,
        isEnabled: true,
      },
      include: {
        addon: true,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'ADDON_ADDED',
        details: `Added addon "${addon.name}" to the group`,
        userId: req.user.id,
        groupId: groupId,
      },
    });

    res.status(201).json({
      message: 'Addon added to group successfully',
      groupAddon,
    });
  } catch (error) {
    next(error);
  }
});

// Update group addon settings
router.put('/groups/:groupId/:addonId', authenticateToken, requireGroupAdmin, validate(updateAddonSettingsSchema), async (req, res, next) => {
  try {
    const { groupId, addonId } = req.params;
    const { settings, isEnabled } = req.body;

    const groupAddon = await prisma.groupAddon.findFirst({
      where: {
        groupId,
        addonId,
      },
      include: {
        addon: true,
      },
    });

    if (!groupAddon) {
      return res.status(404).json({ message: 'Addon not found in this group' });
    }

    const updatedGroupAddon = await prisma.groupAddon.update({
      where: { id: groupAddon.id },
      data: {
        ...(settings !== undefined && { settings }),
        ...(isEnabled !== undefined && { isEnabled }),
      },
      include: {
        addon: true,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'ADDON_CONFIGURED',
        details: `Updated addon "${groupAddon.addon.name}" settings`,
        userId: req.user.id,
        groupId: groupId,
      },
    });

    res.json({
      message: 'Addon settings updated successfully',
      groupAddon: updatedGroupAddon,
    });
  } catch (error) {
    next(error);
  }
});

// Remove addon from group
router.delete('/groups/:groupId/:addonId', authenticateToken, requireGroupAdmin, async (req, res, next) => {
  try {
    const { groupId, addonId } = req.params;

    const groupAddon = await prisma.groupAddon.findFirst({
      where: {
        groupId,
        addonId,
      },
      include: {
        addon: true,
      },
    });

    if (!groupAddon) {
      return res.status(404).json({ message: 'Addon not found in this group' });
    }

    await prisma.groupAddon.delete({
      where: { id: groupAddon.id },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'ADDON_REMOVED',
        details: `Removed addon "${groupAddon.addon.name}" from the group`,
        userId: req.user.id,
        groupId: groupId,
      },
    });

    res.json({ message: 'Addon removed from group successfully' });
  } catch (error) {
    next(error);
  }
});

// Get user's personal addon settings
router.get('/user/settings', authenticateToken, async (req, res, next) => {
  try {
    const userSettings = await prisma.addonSetting.findMany({
      where: { userId: req.user.id },
      include: {
        addon: {
          select: {
            id: true,
            name: true,
            iconUrl: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ settings: userSettings });
  } catch (error) {
    next(error);
  }
});

// Update user's personal addon setting
router.put('/user/settings/:addonId', authenticateToken, async (req, res, next) => {
  try {
    const { addonId } = req.params;
    const { key, value } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ message: 'Key and value are required' });
    }

    // Check if addon exists
    const addon = await prisma.addon.findUnique({
      where: { id: addonId },
    });

    if (!addon) {
      return res.status(404).json({ message: 'Addon not found' });
    }

    const setting = await prisma.addonSetting.upsert({
      where: {
        userId_addonId_key: {
          userId: req.user.id,
          addonId,
          key,
        },
      },
      update: { value },
      create: {
        userId: req.user.id,
        addonId,
        key,
        value,
      },
      include: {
        addon: {
          select: {
            id: true,
            name: true,
            iconUrl: true,
          },
        },
      },
    });

    res.json({
      message: 'Setting updated successfully',
      setting,
    });
  } catch (error) {
    next(error);
  }
});

// Generate Stremio configuration URL for group
router.get('/groups/:groupId/stremio-config', authenticateToken, requireGroupAccess, async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const groupAddons = await prisma.groupAddon.findMany({
      where: {
        groupId,
        isEnabled: true,
      },
      include: {
        addon: true,
      },
    });

    const addonUrls = groupAddons.map(ga => ga.addon.manifestUrl);

    // Create a configuration object that can be imported into Stremio
    const config = {
      addons: addonUrls,
      metadata: {
        groupId,
        generatedAt: new Date().toISOString(),
        generatedBy: req.user.username,
      },
    };

    res.json({
      config,
      installUrl: `stremio://install/${encodeURIComponent(JSON.stringify(addonUrls))}`,
      message: 'Use this configuration to set up your Stremio client with group addons',
    });
  } catch (error) {
    next(error);
  }
});

// Get addon statistics (admin only)
router.get('/statistics', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const totalAddons = await prisma.addon.count({
      where: { isActive: true },
    });

    const officialAddons = await prisma.addon.count({
      where: {
        isActive: true,
        isOfficial: true,
      },
    });

    const addonsByCategory = await prisma.addon.groupBy({
      by: ['category'],
      where: { isActive: true },
      _count: { category: true },
    });

    const mostUsedAddons = await prisma.groupAddon.groupBy({
      by: ['addonId'],
      _count: { addonId: true },
      orderBy: { _count: { addonId: 'desc' } },
      take: 10,
    });

    const mostUsedAddonsWithDetails = await Promise.all(
      mostUsedAddons.map(async (item) => {
        const addon = await prisma.addon.findUnique({
          where: { id: item.addonId },
          select: {
            id: true,
            name: true,
            iconUrl: true,
            category: true,
          },
        });
        return {
          addon,
          usageCount: item._count.addonId,
        };
      })
    );

    res.json({
      totalAddons,
      officialAddons,
      communityAddons: totalAddons - officialAddons,
      addonsByCategory,
      mostUsedAddons: mostUsedAddonsWithDetails,
    });
  } catch (error) {
    next(error);
  }
});

// Toggle addon active status (admin only)
router.patch('/:addonId/toggle-active', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { addonId } = req.params;

    const addon = await prisma.addon.findUnique({
      where: { id: addonId },
      select: { id: true, isActive: true, name: true },
    });

    if (!addon) {
      return res.status(404).json({ message: 'Addon not found' });
    }

    const updatedAddon = await prisma.addon.update({
      where: { id: addonId },
      data: { isActive: !addon.isActive },
    });

    res.json({
      message: `Addon ${updatedAddon.isActive ? 'activated' : 'deactivated'} successfully`,
      addon: updatedAddon,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
