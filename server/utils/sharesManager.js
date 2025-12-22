/**
 * Shares manager - stores user share data as JSON files
 * Organizes files by account ID: SHARES_DIR/account-{accountId}/user-{userId}.json
 */

const fs = require('fs')
const path = require('path')
const { randomBytes } = require('crypto')

// Use /app/data/shares in Docker, or relative path in development
const SHARES_DIR = process.env.SHARES_DIR || path.join(__dirname, '../../data/shares')

// Ensure shares directory exists
function ensureSharesDir() {
  if (!fs.existsSync(SHARES_DIR)) {
    fs.mkdirSync(SHARES_DIR, { recursive: true })
  }
}

/**
 * Get account-specific shares directory
 */
function getAccountSharesDir(accountId) {
  ensureSharesDir()
  const accountDir = path.join(SHARES_DIR, `account-${accountId}`)
  if (!fs.existsSync(accountDir)) {
    fs.mkdirSync(accountDir, { recursive: true })
  }
  return accountDir
}

/**
 * Get shares file path for a user within an account folder
 */
function getSharesFilePath(accountId, userId) {
  const accountDir = getAccountSharesDir(accountId)
  return path.join(accountDir, `user-${userId}.json`)
}

/**
 * Generate unique share ID
 */
function generateShareId() {
  return `share-${randomBytes(16).toString('hex')}`
}

/**
 * Read shares data for a user
 * @param {string} accountId - Account ID
 * @param {string} userId - User ID
 * @returns {Object|null} - { sent: [], received: [] } or null
 */
function getShares(accountId, userId) {
  try {
    const sharesPath = getSharesFilePath(accountId, userId)
    if (!fs.existsSync(sharesPath)) {
      return { sent: [], received: [] }
    }

    const data = fs.readFileSync(sharesPath, 'utf8')
    const parsed = JSON.parse(data)
    
    // Ensure structure
    return {
      sent: Array.isArray(parsed.sent) ? parsed.sent : [],
      received: Array.isArray(parsed.received) ? parsed.received : []
    }
  } catch (error) {
    console.warn(`Failed to read shares for user ${userId} in account ${accountId}:`, error.message)
    return { sent: [], received: [] }
  }
}

/**
 * Save shares data for a user
 * @param {string} accountId - Account ID
 * @param {string} userId - User ID
 * @param {Object} shares - { sent: [], received: [] }
 */
function setShares(accountId, userId, shares) {
  try {
    const sharesPath = getSharesFilePath(accountId, userId)
    const data = {
      sent: Array.isArray(shares.sent) ? shares.sent : [],
      received: Array.isArray(shares.received) ? shares.received : []
    }
    fs.writeFileSync(sharesPath, JSON.stringify(data, null, 2), 'utf8')
  } catch (error) {
    console.warn(`Failed to write shares for user ${userId} in account ${accountId}:`, error.message)
    throw error
  }
}

/**
 * Add a share (updates both sender and receiver)
 * @param {string} accountId - Account ID
 * @param {string} fromUserId - User ID sharing the item
 * @param {string} toUserId - User ID receiving the share
 * @param {Object} item - Item data { itemId, itemName, itemType, poster, etc. }
 * @param {string} fromUsername - Username of sender
 * @param {string} toUsername - Username of receiver
 * @returns {Object} - Created share object
 */
function addShare(accountId, fromUserId, toUserId, item, fromUsername, toUsername) {
  const shareId = generateShareId()
  const now = new Date().toISOString()
  
  // Create share objects
  const sentShare = {
    id: shareId,
    itemId: item.itemId || item._id || item.id,
    itemName: item.itemName || item.name || 'Unknown',
    itemType: item.itemType || item.type || 'unknown',
    poster: item.poster || null,
    sharedWithUserId: toUserId,
    sharedWithUsername: toUsername,
    sharedAt: now,
    viewed: false
  }
  
  const receivedShare = {
    id: shareId,
    itemId: item.itemId || item._id || item.id,
    itemName: item.itemName || item.name || 'Unknown',
    itemType: item.itemType || item.type || 'unknown',
    poster: item.poster || null,
    sharedByUserId: fromUserId,
    sharedByUsername: fromUsername,
    sharedAt: now,
    viewed: false
  }
  
  // Update sender's shares
  const senderShares = getShares(accountId, fromUserId)
  // Check for duplicate (same item to same user)
  const duplicateSent = senderShares.sent.find(s => 
    s.itemId === sentShare.itemId && s.sharedWithUserId === toUserId
  )
  if (duplicateSent) {
    throw new Error('Item already shared with this user')
  }
  senderShares.sent.push(sentShare)
  setShares(accountId, fromUserId, senderShares)
  
  // Update receiver's shares
  const receiverShares = getShares(accountId, toUserId)
  // Check for duplicate
  const duplicateReceived = receiverShares.received.find(s => 
    s.itemId === receivedShare.itemId && s.sharedByUserId === fromUserId
  )
  if (duplicateReceived) {
    throw new Error('Item already shared with this user')
  }
  receiverShares.received.push(receivedShare)
  setShares(accountId, toUserId, receiverShares)
  
  return { sentShare, receivedShare }
}

/**
 * Remove a share (updates both sender and receiver)
 * @param {string} accountId - Account ID
 * @param {string} userId - User ID (can be sender or receiver)
 * @param {string} shareId - Share ID to remove
 * @returns {boolean} - True if removed, false if not found
 */
function removeShare(accountId, userId, shareId) {
  const shares = getShares(accountId, userId)
  let removed = false
  let otherUserId = null
  
  // Find and remove from sent
  const sentIndex = shares.sent.findIndex(s => s.id === shareId)
  if (sentIndex !== -1) {
    otherUserId = shares.sent[sentIndex].sharedWithUserId
    shares.sent.splice(sentIndex, 1)
    removed = true
  }
  
  // Find and remove from received
  const receivedIndex = shares.received.findIndex(s => s.id === shareId)
  if (receivedIndex !== -1) {
    otherUserId = shares.received[receivedIndex].sharedByUserId
    shares.received.splice(receivedIndex, 1)
    removed = true
  }
  
  if (removed) {
    setShares(accountId, userId, shares)
    
    // Also remove from the other user's file
    if (otherUserId) {
      const otherShares = getShares(accountId, otherUserId)
      otherShares.sent = otherShares.sent.filter(s => s.id !== shareId)
      otherShares.received = otherShares.received.filter(s => s.id !== shareId)
      setShares(accountId, otherUserId, otherShares)
    }
  }
  
  return removed
}

/**
 * Mark a share as viewed
 * @param {string} accountId - Account ID
 * @param {string} userId - User ID
 * @param {string} shareId - Share ID to mark as viewed
 * @returns {boolean} - True if marked, false if not found
 */
function markShareAsViewed(accountId, userId, shareId) {
  const shares = getShares(accountId, userId)
  let marked = false
  
  // Mark in received shares
  const receivedShare = shares.received.find(s => s.id === shareId)
  if (receivedShare && !receivedShare.viewed) {
    receivedShare.viewed = true
    marked = true
  }
  
  if (marked) {
    setShares(accountId, userId, shares)
  }
  
  return marked
}

/**
 * Get users in the same group as a given user
 * @param {Object} prisma - Prisma client
 * @param {string} accountId - Account ID
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of user objects (excluding the given user)
 */
async function getGroupMembers(prisma, accountId, userId) {
  try {
    // Find all groups for this account
    const groups = await prisma.group.findMany({
      where: { accountId },
      select: { id: true, userIds: true }
    })
    
    // Find groups that contain this user
    const userGroups = groups.filter(group => {
      if (!group.userIds) return false
      const userIds = JSON.parse(group.userIds)
      return userIds.includes(userId)
    })
    
    if (userGroups.length === 0) {
      return []
    }
    
    // Collect all user IDs from these groups
    const allUserIds = new Set()
    userGroups.forEach(group => {
      const userIds = JSON.parse(group.userIds)
      userIds.forEach(id => {
        if (id !== userId) { // Exclude the user themselves
          allUserIds.add(id)
        }
      })
    })
    
      // Fetch user details (include activityVisibility for filtering)
      const users = await prisma.user.findMany({
        where: {
          id: { in: Array.from(allUserIds) },
          accountId,
          isActive: true
        },
        select: {
          id: true,
          username: true,
          email: true,
          colorIndex: true,
          activityVisibility: true
        }
      })
    
    return users
  } catch (error) {
    console.error(`Failed to get group members for user ${userId}:`, error.message)
    return []
  }
}

module.exports = {
  getShares,
  setShares,
  addShare,
  removeShare,
  markShareAsViewed,
  getGroupMembers
}


