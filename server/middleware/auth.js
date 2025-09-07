const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid or inactive user' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

const requireGroupAccess = async (req, res, next) => {
  const { groupId } = req.params;
  
  try {
    const membership = await prisma.groupMember.findFirst({
      where: {
        userId: req.user.id,
        groupId: groupId,
      },
      include: {
        group: true,
      },
    });

    if (!membership && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied to this group' });
    }

    req.groupMembership = membership;
    next();
  } catch (error) {
    return res.status(500).json({ message: 'Error checking group access' });
  }
};

const requireGroupAdmin = async (req, res, next) => {
  const { groupId } = req.params;
  
  try {
    const membership = await prisma.groupMember.findFirst({
      where: {
        userId: req.user.id,
        groupId: groupId,
        role: { in: ['ADMIN'] },
      },
    });

    const isGroupOwner = await prisma.group.findFirst({
      where: {
        id: groupId,
        ownerId: req.user.id,
      },
    });

    if (!membership && !isGroupOwner && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Group admin access required' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ message: 'Error checking group admin access' });
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireGroupAccess,
  requireGroupAdmin,
};
