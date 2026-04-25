const fs = require('fs');
const path = require('path');

// Log file path
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
const PROXY_LOG_FILE = path.join(LOG_DIR, 'proxy.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Max log file size (10MB)
const MAX_LOG_SIZE = 10 * 1024 * 1024;

/**
 * Log a proxy request to file
 */
function logProxyRequest({ addon, path: requestPath, url, upstreamUrl, method, ip, userAgent, statusCode, cacheHit, responseTimeMs, error }) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    addonId: addon?.id,
    addonName: addon?.name,
    proxyUuid: addon?.proxyUuid,
    path: requestPath,
    url: url || null,
    upstreamUrl: upstreamUrl || null,
    method,
    ip: ip || null,
    userAgent: userAgent ? userAgent.substring(0, 200) : null, // Truncate long UA strings
    statusCode: statusCode || null,
    cacheHit: cacheHit || false,
    responseTimeMs: responseTimeMs || null,
    error: error || null
  };

  const logLine = JSON.stringify(logEntry) + '\n';

  // Write to file (append mode)
  fs.appendFile(PROXY_LOG_FILE, logLine, (err) => {
    if (err) {
      console.error('Error writing to proxy log:', err);
    }
  });

  // Check if rotation needed (async)
  rotateLogIfNeeded();
}

/**
 * Rotate log file if it exceeds max size
 */
async function rotateLogIfNeeded() {
  try {
    const stats = await fs.promises.stat(PROXY_LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      const rotatedFile = `${PROXY_LOG_FILE}.${Date.now()}`;
      await fs.promises.rename(PROXY_LOG_FILE, rotatedFile);
      console.log(`Rotated proxy log to ${rotatedFile}`);
    }
  } catch (e) {
    // File doesn't exist yet, ignore
  }
}

/**
 * Read proxy logs from file
 * @param {Object} options - Filter options
 * @param {string} options.addonId - Filter by addon ID
 * @param {string} options.proxyUuid - Filter by proxy UUID
 * @param {number} options.limit - Max number of entries to return (default 100)
 * @param {number} options.offset - Number of entries to skip (default 0)
 * @returns {Promise<{logs: Array, total: number}>}
 */
async function readProxyLogs(options = {}) {
  const { addonId, proxyUuid, limit = 100, offset = 0 } = options;

  try {
    // Check if file exists
    if (!fs.existsSync(PROXY_LOG_FILE)) {
      return { logs: [], total: 0 };
    }

    // Read file
    const content = await fs.promises.readFile(PROXY_LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Parse all logs (newest last in file, so reverse to get newest first)
    let logs = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();

    // Apply filters
    if (addonId) {
      logs = logs.filter(log => log.addonId === addonId);
    }
    if (proxyUuid) {
      logs = logs.filter(log => log.proxyUuid === proxyUuid);
    }

    const total = logs.length;

    // Apply pagination
    logs = logs.slice(offset, offset + limit);

    return { logs, total };
  } catch (e) {
    console.error('Error reading proxy logs:', e);
    return { logs: [], total: 0 };
  }
}

/**
 * Get log file stats
 */
async function getLogStats() {
  try {
    const stats = await fs.promises.stat(PROXY_LOG_FILE);
    return {
      exists: true,
      size: stats.size,
      sizeFormatted: formatBytes(stats.size),
      lastModified: stats.mtime
    };
  } catch (e) {
    return {
      exists: false,
      size: 0,
      sizeFormatted: '0 B',
      lastModified: null
    };
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  logProxyRequest,
  readProxyLogs,
  getLogStats,
  PROXY_LOG_FILE
};
