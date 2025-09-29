const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === '1'

const logger = (req, res, next) => {
  if (!DEBUG) return next();
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const ts = new Date().toISOString();
    const { method, originalUrl } = req;
    const { statusCode } = res;
    console.log(`[${ts}] ${method} ${originalUrl} -> ${statusCode} (${duration}ms)`);
  });
  
  next();
};

module.exports = { logger };
