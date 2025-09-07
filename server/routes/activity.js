const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireGroupAccess, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get user's activity logs
router.get('/user', authenticateToken, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const action = req.query.action || '';

    const activities = await prisma.activityLog.findMany({
      where: {
        userId: req.user.id,
        ...(action && { action }),
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const totalCount = await prisma.activityLog.count({
      where: {
        userId: req.user.id,
        ...(action && { action }),
      },
    });

    res.json({
      activities,
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

// Get group activity logs
router.get('/group/:groupId', authenticateToken, requireGroupAccess, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const action = req.query.action || '';

    const activities = await prisma.activityLog.findMany({
      where: {
        groupId,
        ...(action && { action }),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const totalCount = await prisma.activityLog.count({
      where: {
        groupId,
        ...(action && { action }),
      },
    });

    res.json({
      activities,
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

// Get all activity logs (admin only)
router.get('/all', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const action = req.query.action || '';
    const userId = req.query.userId || '';
    const groupId = req.query.groupId || '';

    const activities = await prisma.activityLog.findMany({
      where: {
        ...(action && { action }),
        ...(userId && { userId }),
        ...(groupId && { groupId }),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const totalCount = await prisma.activityLog.count({
      where: {
        ...(action && { action }),
        ...(userId && { userId }),
        ...(groupId && { groupId }),
      },
    });

    res.json({
      activities,
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

// Get activity statistics
router.get('/statistics', authenticateToken, async (req, res, next) => {
  try {
    const timeframe = req.query.timeframe || '30d'; // 7d, 30d, 90d
    
    let dateFilter = {};
    const now = new Date();
    
    switch (timeframe) {
      case '7d':
        dateFilter = { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
        break;
      case '30d':
        dateFilter = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
        break;
      case '90d':
        dateFilter = { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
        break;
    }

    // Base filter - user can see their own activity or group activity they have access to
    let baseFilter = {};
    if (req.user.role !== 'ADMIN') {
      const userGroups = await prisma.groupMember.findMany({
        where: { userId: req.user.id },
        select: { groupId: true },
      });
      
      const ownedGroups = await prisma.group.findMany({
        where: { ownerId: req.user.id },
        select: { id: true },
      });

      const accessibleGroupIds = [
        ...userGroups.map(g => g.groupId),
        ...ownedGroups.map(g => g.id),
      ];

      baseFilter = {
        OR: [
          { userId: req.user.id },
          { groupId: { in: accessibleGroupIds } },
        ],
      };
    }

    const activityByAction = await prisma.activityLog.groupBy({
      by: ['action'],
      where: {
        ...baseFilter,
        createdAt: dateFilter,
      },
      _count: { action: true },
      orderBy: { _count: { action: 'desc' } },
    });

    const totalActivities = await prisma.activityLog.count({
      where: {
        ...baseFilter,
        createdAt: dateFilter,
      },
    });

    // Get daily activity for the timeframe
    const dailyActivity = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM activity_logs 
      WHERE created_at >= ${dateFilter.gte || new Date('1900-01-01')}
        ${req.user.role !== 'ADMIN' ? 
          `AND (user_id = '${req.user.id}' OR group_id IN (${baseFilter.OR[1]?.groupId?.in?.map(id => `'${id}'`).join(',') || 'NULL'}))` : 
          ''
        }
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    res.json({
      timeframe,
      totalActivities,
      activityByAction,
      dailyActivity,
    });
  } catch (error) {
    next(error);
  }
});

// Get available activity actions
router.get('/actions', authenticateToken, (req, res) => {
  const actions = [
    'USER_JOINED',
    'USER_LEFT',
    'ADDON_ADDED',
    'ADDON_REMOVED',
    'ADDON_CONFIGURED',
    'GROUP_CREATED',
    'GROUP_UPDATED',
    'INVITE_SENT',
    'INVITE_ACCEPTED',
  ];

  res.json({ actions });
});

module.exports = router;
