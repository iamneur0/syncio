/**
 * Helper utilities - Perform specific tasks and return data
 */

const { 
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
} = require('./database');

const { 
  isValidEmail, 
  isValidPassword, 
  sanitizeUrl, 
  validateRequiredFields, 
  validateStremioCredentials, 
  hasPermission, 
  validateAccountContext, 
  createValidationMiddleware 
} = require('./validation');

const { getHealthStatus, createHealthCheckHandler } = require('./health');
const { createMulterInstance, standardUpload, largeFileUpload, anyFileUpload } = require('./multer');
const { resetAccountData, safeResetAccountData } = require('./accountReset');
const { createStremioClient, createStremioStore, validateStremioAuthKey, createStremioAPI } = require('./stremio');

module.exports = {
  // Database helpers
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
  assignUserToGroup,
  
  // Validation helpers
  isValidEmail,
  isValidPassword,
  sanitizeUrl,
  validateRequiredFields,
  validateStremioCredentials,
  hasPermission,
  validateAccountContext,
  createValidationMiddleware,
  
  // Health helpers
  getHealthStatus,
  createHealthCheckHandler,
  
  // Multer helpers
  createMulterInstance,
  standardUpload,
  largeFileUpload,
  anyFileUpload,
  
  // Account reset helpers
  resetAccountData,
  safeResetAccountData,
  
  // Stremio API helpers
  createStremioClient,
  createStremioStore,
  validateStremioAuthKey,
  createStremioAPI
};
