const express = require('express');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireGroupAccess, requireGroupAdmin } = require('../middleware/auth');
const { validate, createGroupSchema, updateGroupSchema, inviteUserSchema } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// Get user's groups
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const ownedGroups = await prisma.group.findMany({
      where: { ownerId: req.user.id },
      include: {
        _count: {
          select: { members: true, addons: true },
        },
        members: {
          take: 5,
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
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const memberGroups = await prisma.groupMember.findMany({
      where: { userId: req.user.id },
      include: {
        group: {
          include: {
            owner: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
            _count: {
              select: { members: true, addons: true },
            },
            members: {
              take: 5,
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
              },
              orderBy: { joinedAt: 'asc' },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    res.json({
      ownedGroups,
      memberGroups: memberGroups.map(membership => ({
        ...membership.group,
        membership: {
          role: membership.role,
          joinedAt: membership.joinedAt,
        },
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Create new group
router.post('/', authenticateToken, validate(createGroupSchema), async (req, res, next) => {
  try {
    const { name, description, maxMembers, colorIndex } = req.body;
    console.log('🔍 Backend received:', { name, colorIndex });

    const group = await prisma.group.create({
      data: {
        name,
        description,
        maxMembers,
        colorIndex,
        ownerId: req.user.id,
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        _count: {
          select: { members: true, addons: true },
        },
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'GROUP_CREATED',
        details: `Created group "${name}"`,
        userId: req.user.id,
        groupId: group.id,
      },
    });

    console.log('✅ Group created in DB:', { id: group.id, name: group.name, colorIndex: group.colorIndex });
    res.status(201).json({
      message: 'Group created successfully',
      group,
    });
  } catch (error) {
    next(error);
  }
});

// Get specific group
router.get('/:groupId', authenticateToken, requireGroupAccess, async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
                isActive: true,
              },
            },
          },
          orderBy: [
            { role: 'asc' },
            { joinedAt: 'asc' },
          ],
        },
        addons: {
          include: {
            addon: true,
          },
          orderBy: { id: 'desc' },
        },
        _count: {
          select: { members: true, addons: true },
        },
      },
    });

    res.json({ group });
  } catch (error) {
    next(error);
  }
});

// Update group
router.put('/:groupId', authenticateToken, requireGroupAdmin, validate(updateGroupSchema), async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { name, description, maxMembers, colorIndex } = req.body;

    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(maxMembers && { maxMembers }),
        ...(colorIndex !== undefined && { colorIndex }),
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        _count: {
          select: { members: true, addons: true },
        },
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'GROUP_UPDATED',
        details: `Updated group settings`,
        userId: req.user.id,
        groupId: groupId,
      },
    });

    res.json({
      message: 'Group updated successfully',
      group: updatedGroup,
    });
  } catch (error) {
    next(error);
  }
});

// Invite user to group
router.post('/:groupId/invite', authenticateToken, requireGroupAdmin, validate(inviteUserSchema), async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { email, role = 'MEMBER' } = req.body;

    // Check if group exists and get member count
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        _count: { select: { members: true } },
      },
    });

    if (group._count.members >= group.maxMembers) {
      return res.status(400).json({ message: 'Group has reached maximum member limit' });
    }

    // Check if user is already a member
    const existingMember = await prisma.groupMember.findFirst({
      where: {
        groupId,
        user: { email },
      },
    });

    if (existingMember) {
      return res.status(400).json({ message: 'User is already a member of this group' });
    }

    // Check for existing pending invite
    const existingInvite = await prisma.groupInvite.findFirst({
      where: {
        groupId,
        email,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      return res.status(400).json({ message: 'Invitation already sent to this email' });
    }

    // Create invitation
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await prisma.groupInvite.create({
      data: {
        email,
        role,
        token,
        expiresAt,
        groupId,
        inviterId: req.user.id,
      },
      include: {
        group: {
          select: { name: true },
        },
        inviter: {
          select: {
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'INVITE_SENT',
        details: `Invited ${email} to join the group`,
        userId: req.user.id,
        groupId: groupId,
      },
    });

    res.status(201).json({
      message: 'Invitation sent successfully',
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Accept group invitation
router.post('/invites/:token/accept', authenticateToken, async (req, res, next) => {
  try {
    const { token } = req.params;

    const invite = await prisma.groupInvite.findFirst({
      where: {
        token,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        group: true,
      },
    });

    if (!invite) {
      return res.status(404).json({ message: 'Invalid or expired invitation' });
    }

    if (invite.email !== req.user.email) {
      return res.status(403).json({ message: 'This invitation is not for your email address' });
    }

    // Check if group has space
    const memberCount = await prisma.groupMember.count({
      where: { groupId: invite.groupId },
    });

    if (memberCount >= invite.group.maxMembers) {
      return res.status(400).json({ message: 'Group has reached maximum member limit' });
    }

    // Add user to group
    await prisma.groupMember.create({
      data: {
        userId: req.user.id,
        groupId: invite.groupId,
        role: invite.role,
      },
    });

    // Update invite status
    await prisma.groupInvite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED' },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'USER_JOINED',
        details: `${req.user.username} joined the group`,
        userId: req.user.id,
        groupId: invite.groupId,
      },
    });

    res.json({
      message: 'Invitation accepted successfully',
      group: {
        id: invite.group.id,
        name: invite.group.name,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get group invitations
router.get('/:groupId/invites', authenticateToken, requireGroupAdmin, async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const invites = await prisma.groupInvite.findMany({
      where: { groupId },
      include: {
        inviter: {
          select: {
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ invites });
  } catch (error) {
    next(error);
  }
});

// Update member role
router.patch('/:groupId/members/:memberId/role', authenticateToken, requireGroupAdmin, async (req, res, next) => {
  try {
    const { groupId, memberId } = req.params;
    const { role } = req.body;

    if (!['ADMIN', 'MODERATOR', 'MEMBER'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const member = await prisma.groupMember.findFirst({
      where: {
        id: memberId,
        groupId,
      },
      include: {
        user: {
          select: { username: true },
        },
      },
    });

    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    const updatedMember = await prisma.groupMember.update({
      where: { id: memberId },
      data: { role },
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
      },
    });

    res.json({
      message: 'Member role updated successfully',
      member: updatedMember,
    });
  } catch (error) {
    next(error);
  }
});

// Remove member from group
router.delete('/:groupId/members/:memberId', authenticateToken, requireGroupAdmin, async (req, res, next) => {
  try {
    const { groupId, memberId } = req.params;

    const member = await prisma.groupMember.findFirst({
      where: {
        id: memberId,
        groupId,
      },
      include: {
        user: {
          select: { username: true },
        },
      },
    });

    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    await prisma.groupMember.delete({
      where: { id: memberId },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'USER_LEFT',
        details: `${member.user.username} was removed from the group`,
        userId: req.user.id,
        groupId: groupId,
      },
    });

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    next(error);
  }
});

// Leave group
router.delete('/:groupId/leave', authenticateToken, requireGroupAccess, async (req, res, next) => {
  try {
    const { groupId } = req.params;

    // Check if user is the owner
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { ownerId: true },
    });

    if (group.ownerId === req.user.id) {
      return res.status(400).json({ 
        message: 'Group owner cannot leave. Transfer ownership or delete the group first.' 
      });
    }

    const membership = await prisma.groupMember.findFirst({
      where: {
        userId: req.user.id,
        groupId,
      },
    });

    if (membership) {
      await prisma.groupMember.delete({
        where: { id: membership.id },
      });

      // Log activity
      await prisma.activityLog.create({
        data: {
          action: 'USER_LEFT',
          details: `${req.user.username} left the group`,
          userId: req.user.id,
          groupId: groupId,
        },
      });
    }

    res.json({ message: 'Left group successfully' });
  } catch (error) {
    next(error);
  }
});

// Delete group
router.delete('/:groupId', authenticateToken, async (req, res, next) => {
  try {
    const { groupId } = req.params;

    // Check if user is the owner
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { ownerId: true, name: true },
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (group.ownerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only group owner can delete the group' });
    }

    await prisma.group.delete({
      where: { id: groupId },
    });

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
