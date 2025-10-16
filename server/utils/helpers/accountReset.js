/**
 * Account reset utilities for data cleanup operations
 */

/**
 * Reset all account data (users, groups, addons, groupAddons)
 * This function deletes all data associated with a specific account
 */
async function resetAccountData(prisma, accountId) {
  console.log('Resetting account data for:', accountId);
  
  // Delete in correct order to respect foreign key constraints
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
}

/**
 * Reset account data with error handling
 */
async function safeResetAccountData(prisma, accountId) {
  try {
    await resetAccountData(prisma, accountId);
    return { success: true, message: 'Account data reset successfully' };
  } catch (error) {
    console.error('Reset error:', error);
    return { 
      success: false, 
      message: 'Failed to reset account data', 
      error: error.message 
    };
  }
}

module.exports = {
  resetAccountData,
  safeResetAccountData
};
