// Addon health check scheduler
// Periodically checks if addon manifests are reachable
// When primary is offline, adds backup addon to groups
// When primary comes back online, removes backup addon from groups

const { performance } = require('perf_hooks');
const { decrypt } = require('./encryption');

const MINUTE_MS = 60 * 1000;

let healthCheckTimer = null;
let isRunning = false;

/**
 * Get decrypted manifest URL from addon
 * @param {Object} addon - The addon object
 * @returns {string|null} - Decrypted URL or null
 */
function getDecryptedManifestUrl(addon) {
  if (!addon.manifestUrl) return null;
  
  // URLs are ALWAYS encrypted, so always try to decrypt
  try {
    const mockReq = { 
      appAccountId: addon.accountId,
      headers: {}
    };
    const decrypted = decrypt(addon.manifestUrl, mockReq);
    return decrypted;
  } catch (error) {
    console.error(`[AddonHealthCheck] Failed to decrypt URL for ${addon.name}:`, error.message);
    return addon.manifestUrl;
  }
}

/**
 * Check a single URL's health
 * @param {string} url - The URL to check
 * @param {string} name - Name for logging
 * @returns {Promise<{isOnline: boolean, error: string|null, responseTime: number}>}
 */
async function checkUrlHealth(url, name) {
  const startTime = performance.now();
  
  if (!url) {
    return { isOnline: false, error: 'No URL provided', responseTime: 0 };
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    
    clearTimeout(timeout);
    const responseTime = Math.round(performance.now() - startTime);
    
    if (response.status >= 200 && response.status < 400) {
      return { isOnline: true, error: null, responseTime };
    }
    
    return { isOnline: false, error: `HTTP ${response.status}`, responseTime };
  } catch (error) {
    const responseTime = Math.round(performance.now() - startTime);
    if (error.name === 'AbortError') {
      return { isOnline: false, error: 'Timeout', responseTime };
    }
    return { isOnline: false, error: error.message || 'Network error', responseTime };
  }
}

/**
 * Perform health check on all addons
 * @param {Object} prisma - Prisma client
 * @param {string|null} accountId - Optional account ID
 */
async function performHealthChecks(prisma, accountId = null) {
  if (isRunning) {
    console.log('[AddonHealthCheck] Health check already in progress, skipping...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const where = accountId ? { accountId } : {};

    // Get all active addons
    const addons = await prisma.addon.findMany({
      where: {
        ...where,
        isActive: true,
      },
    });

    console.log(`[AddonHealthCheck] Checking ${addons.length} addons...`);

    let onlineCount = 0;
    let offlineCount = 0;

    for (const addon of addons) {
      try {
        const manifestUrl = getDecryptedManifestUrl(addon);
        let result = await checkUrlHealth(manifestUrl, addon.name);

        // Retry once if failed
        if (!result.isOnline) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          result = await checkUrlHealth(manifestUrl, addon.name);
        }

        // Check if status changed
        const statusChanged = addon.isOnline !== result.isOnline;

        // Update addon status
        await prisma.addon.update({
          where: { id: addon.id },
          data: {
            isOnline: result.isOnline,
            lastHealthCheck: new Date(),
            healthCheckError: result.error,
          },
        });

        // Record history
        await prisma.addonHealthHistory.create({
          data: {
            addonId: addon.id,
            isOnline: result.isOnline,
            error: result.error,
            responseTimeMs: result.responseTime,
            checkedAt: new Date(),
          },
        });

        // Log status changes and reload addon when it comes back online
        if (statusChanged) {
          if (result.isOnline) {
            console.log(`[AddonHealthCheck] ${addon.name} is now ONLINE`);
            
            // Reload addon to refresh manifest data
            try {
              const { reloadAddon } = require('../routes/addons');
              const { getAccountId } = require('./helpers');
              const { filterManifestByResources, filterManifestByCatalogs } = require('./validation');
              const { encrypt, getDecryptedManifestUrl } = require('./encryption');
              const { manifestHash } = require('./hashing');
              
              // Create mock request for reloadAddon
              const mockReq = {
                appAccountId: addon.accountId,
                headers: {}
              };
              
              await reloadAddon(prisma, getAccountId, addon.id, mockReq, {
                filterManifestByResources,
                filterManifestByCatalogs,
                encrypt,
                decrypt,
                getDecryptedManifestUrl,
                manifestHash,
                silent: true
              }, false);
              
              console.log(`[AddonHealthCheck] Reloaded ${addon.name} to refresh manifest`);
            } catch (reloadError) {
              console.error(`[AddonHealthCheck] Failed to reload ${addon.name}:`, reloadError.message);
            }
          } else {
            console.log(`[AddonHealthCheck] ${addon.name} is now OFFLINE: ${result.error}`);
          }
        }

        // Count for summary
        if (result.isOnline) {
          onlineCount++;
        } else {
          offlineCount++;
        }
      } catch (error) {
        console.error(`[AddonHealthCheck] Failed to check ${addon.name}:`, error.message);
        offlineCount++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[AddonHealthCheck] Completed in ${duration}ms: ${onlineCount} online, ${offlineCount} offline`);

  } catch (error) {
    console.error('[AddonHealthCheck] Health check batch failed:', error);
  } finally {
    isRunning = false;
  }
}

function getHealthCheckIntervalMinutes() {
  const envInterval = process.env.ADDON_HEALTH_CHECK_INTERVAL_MINUTES;
  if (envInterval) {
    const parsed = parseInt(envInterval, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      return parsed;
    }
  }
  return 30;
}

function startHealthCheckScheduler(prisma, accountId = null) {
  const intervalMinutes = getHealthCheckIntervalMinutes();
  
  if (intervalMinutes < 1) {
    console.log('[AddonHealthCheck] Health check is disabled');
    return;
  }
  
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
  }
  
  const intervalMs = intervalMinutes * MINUTE_MS;
  
  console.log(`[AddonHealthCheck] Starting scheduler with ${intervalMinutes} minute interval`);
  
  setTimeout(() => {
    performHealthChecks(prisma, accountId);
  }, 10000);
  
  healthCheckTimer = setInterval(() => {
    performHealthChecks(prisma, accountId);
  }, intervalMs);
}

function stopHealthCheckScheduler() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
    console.log('[AddonHealthCheck] Scheduler stopped');
  }
}

async function triggerManualHealthCheck(prisma, accountId = null) {
  console.log('[AddonHealthCheck] Manual health check triggered');
  await performHealthChecks(prisma, accountId);
}

module.exports = {
  performHealthChecks,
  startHealthCheckScheduler,
  stopHealthCheckScheduler,
  triggerManualHealthCheck,
  getHealthCheckIntervalMinutes,
  checkUrlHealth,
  getDecryptedManifestUrl,
};
