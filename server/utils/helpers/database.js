/**
 * Common database query patterns to reduce duplication
 */

/**
 * Find user by ID with account scoping
 */
async function findUserById(prisma, userId, accountId, include = {}) {
  return await prisma.user.findUnique({
    where: { 
      id: userId,
      accountId: accountId
    },
    include
  });
}

/**
 * Find group by ID with account scoping
 */
async function findGroupById(prisma, groupId, accountId, include = {}) {
  return await prisma.group.findUnique({
    where: { 
      id: groupId,
      accountId: accountId
    },
    include
  });
}

/**
 * Find addon by ID with account scoping
 */
async function findAddonById(prisma, addonId, accountId, include = {}) {
  return await prisma.addon.findUnique({
    where: { 
      id: addonId,
      accountId: accountId
    },
    include
  });
}

/**
 * Get all users for an account
 */
async function getAllUsers(prisma, accountId, include = {}) {
  return await prisma.user.findMany({
    where: { accountId },
    include,
    orderBy: { id: 'asc' }
  });
}

/**
 * Get all groups for an account
 */
async function getAllGroups(prisma, accountId, include = {}) {
  return await prisma.group.findMany({
    where: { accountId },
    include,
    orderBy: { id: 'asc' }
  });
}

/**
 * Get all addons for an account
 */
async function getAllAddons(prisma, accountId, include = {}) {
  return await prisma.addon.findMany({
    where: { accountId },
    include,
    orderBy: { id: 'asc' }
  });
}

/**
 * Check if user exists and is active
 */
async function isUserActive(prisma, userId, accountId) {
  const user = await prisma.user.findUnique({
    where: { 
      id: userId,
      accountId: accountId
    },
    select: { isActive: true }
  });
  return user?.isActive === true;
}

/**
 * Check if group exists and is active
 */
async function isGroupActive(prisma, groupId, accountId) {
  const group = await prisma.group.findUnique({
    where: { 
      id: groupId,
      accountId: accountId
    },
    select: { isActive: true }
  });
  return group?.isActive === true;
}

/**
 * Get groups that contain a specific user
 */
async function getUserGroups(prisma, userId, accountId, include = {}) {
  return await prisma.group.findMany({
    where: {
      accountId,
      userIds: {
        contains: userId
      }
    },
    include
  });
}

/**
 * Get users that belong to a specific group
 */
async function getGroupUsers(prisma, groupId, accountId, include = {}) {
  const group = await prisma.group.findUnique({
    where: { id: groupId, accountId },
    select: { userIds: true }
  });
  
  if (!group?.userIds) return [];
  
  const userIds = JSON.parse(group.userIds);
  return await prisma.user.findMany({
    where: {
      id: { in: userIds },
      accountId
    },
    include
  });
}

/**
 * Get account ID for private mode
 */
function getAccountId(req) {
  const { AUTH_ENABLED, DEFAULT_ACCOUNT_ID } = require('../config');
  
  if (AUTH_ENABLED) {
    return req.appAccountId || null;
  }
  return DEFAULT_ACCOUNT_ID;
}

/**
 * Create scoped where clause for account-based queries
 */
function scopedWhere(req, extra = {}) {
  const accId = getAccountId(req);
  if (!accId) return { id: 'impossible-match' }; // impossible match
  return { accountId: accId, ...extra };
}

/**
 * Get group addons with proper ordering and decryption
 */
async function getGroupAddons(prisma, groupId, req) {
  const accId = getAccountId(req);
  if (!accId) return [];
  
  const group = await prisma.group.findUnique({
    where: { id: groupId, accountId: accId },
    include: { addons: { include: { addon: true } } }
  });
  
  if (!group) return [];
  
  const { decrypt } = require('../encryption');
  
  const filtered = (group.addons || []).filter(ga => ga?.addon && ga.addon.isActive !== false && (!accId || ga.addon.accountId === accId))
  const sorted = filtered.slice().sort((a, b) => ((a?.position ?? 0) - (b?.position ?? 0)))
  return sorted.map(ga => ({
    id: ga.addon.id,
    name: ga.addon.name,
    description: ga.addon.description || '',
    manifestUrl: (() => { try { return decrypt(ga.addon.manifestUrl, req) } catch { return ga.addon.manifestUrl } })(),
    // Try to decrypt and parse the manifest for sync operations
    manifest: (() => {
      try {
        const raw = ga.addon.manifest
        if (!raw) return null
        let dec = null
        try { dec = decrypt(raw, req) } catch { dec = raw }
        try { return typeof dec === 'string' ? JSON.parse(dec) : dec } catch { return dec }
      } catch { return null }
    })(),
    version: ga.addon.version || null,
    isEnabled: ga.addon.isActive,
    iconUrl: ga.addon.iconUrl,
    position: ga.position ?? null,
  }))
}

/**
 * Assign a user to a group (removes from other groups first)
 */
async function assignUserToGroup(userId, groupId, req) {
  const accId = getAccountId(req);
  if (!accId) throw new Error('Account context required');

  // First, remove user from all other groups
  const allGroups = await prisma.group.findMany({
    where: { accountId: accId },
    select: { id: true, userIds: true }
  });

  for (const group of allGroups) {
    if (group.userIds) {
      const userIds = JSON.parse(group.userIds);
      const updatedUserIds = userIds.filter(id => id !== userId);
      if (updatedUserIds.length !== userIds.length) {
        await prisma.group.update({
          where: { id: group.id },
          data: { userIds: JSON.stringify(updatedUserIds) }
        });
      }
    }
  }

  // Then, add user to the target group
  const targetGroup = await prisma.group.findUnique({
    where: { id: groupId, accountId: accId },
    select: { id: true, userIds: true }
  });

  if (!targetGroup) {
    throw new Error('Target group not found');
  }

  const currentUserIds = targetGroup.userIds ? JSON.parse(targetGroup.userIds) : [];
  if (!currentUserIds.includes(userId)) {
    currentUserIds.push(userId);
    await prisma.group.update({
      where: { id: groupId },
      data: { userIds: JSON.stringify(currentUserIds) }
    });
  }
}

module.exports = {
  findUserById,
  findGroupById,
  findAddonById,
  getAllUsers,
  getAllGroups,
  getAllAddons,
  isUserActive,
  isGroupActive,
  getUserGroups,
  getGroupUsers,
  getAccountId,
  scopedWhere,
  getGroupAddons,
  assignUserToGroup
};
