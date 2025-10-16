/**
 * Centralized health check functionality
 */

const serverStartTime = new Date().toISOString();

/**
 * Get comprehensive health status
 */
async function getHealthStatus(prisma) {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Get basic counts
    const [userCount, addonCount, groupCount] = await Promise.all([
      prisma.user.count(),
      prisma.addon.count(),
      prisma.group.count()
    ]);
    
    return {
      status: 'OK',
      message: 'Syncio with Database',
      timestamp: new Date().toISOString(),
      serverStartTime: serverStartTime,
      uptime: process.uptime(),
      database: 'connected',
      users: userCount,
      addons: addonCount,
      groups: groupCount
    };
  } catch (error) {
    return {
      status: 'ERROR',
      message: 'Database connection failed',
      timestamp: new Date().toISOString(),
      serverStartTime: serverStartTime,
      uptime: process.uptime(),
      database: 'disconnected',
      error: error.message
    };
  }
}

/**
 * Create health check endpoint handler
 */
function createHealthCheckHandler(prisma) {
  return async (req, res) => {
    const healthStatus = await getHealthStatus(prisma);
    const statusCode = healthStatus.status === 'OK' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  };
}

module.exports = {
  getHealthStatus,
  createHealthCheckHandler
};
