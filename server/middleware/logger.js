const logger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();
    const { method, originalUrl, ip } = req;
    const { statusCode } = res;
    
    console.log(`[${timestamp}] ${method} ${originalUrl} ${statusCode} ${duration}ms - ${ip}`);
  });
  
  next();
};

module.exports = { logger };
