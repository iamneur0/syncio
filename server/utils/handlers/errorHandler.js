/**
 * Consolidated error handling that replaces both middleware and utils error handlers
 */

/**
 * Handle all types of errors consistently
 */
function handleError(error, req, res, next) {
  console.error('Error:', error);

  // Prisma errors
  if (error.code === 'P2002') {
    const field = error.meta?.target?.[0];
    return res.status(409).json({
      message: `${field || 'Field'} already exists`,
      error: `This ${field || 'field'} is already in use`
    });
  }

  if (error.code === 'P2025') {
    return res.status(404).json({
      message: 'Record not found',
      error: 'The requested resource does not exist'
    });
  }

  // Stremio API errors
  if (error?.response?.data?.code === 2) {
    return res.status(401).json({ 
      message: 'User not found',
      error: 'No Stremio account found with this email. Please register first or check your credentials.'
    });
  }
  
  if (error?.response?.data?.code === 3) {
    return res.status(401).json({ 
      message: 'Invalid password',
      error: 'Incorrect password for this Stremio account.'
    });
  }
  
  if (error?.response?.data?.code === 26) {
    return res.status(400).json({ 
      message: 'Invalid email address',
      error: 'Please enter a valid email address'
    });
  }

  // Handle other Stremio API errors
  if (error?.response?.data?.message) {
    return res.status(400).json({ 
      message: error.response.data.message,
      error: 'Stremio authentication failed'
    });
  }

  // Network errors
  if (error.message?.includes('Network') || error.code === 'ENOTFOUND') {
    return res.status(503).json({ 
      message: 'Unable to connect to Stremio servers',
      error: 'Please check your internet connection and try again'
    });
  }

  // Authentication errors
  if (error.message === 'User not found') {
    return res.status(401).json({ 
      message: 'Invalid Stremio credentials',
      error: 'User not found (check email)'
    });
  }

  if (error.code === 3 || error.wrongPass || error.message?.includes('Wrong passphrase')) {
    return res.status(401).json({ 
      message: 'Invalid Stremio credentials',
      error: 'Wrong email or password'
    });
  }

  if (error.message?.includes('Authentication failed') || error.message?.includes('Wrong passphrase')) {
    return res.status(401).json({ 
      message: 'Invalid Stremio credentials',
      error: error.message
    });
  }

  // Validation errors
  if (error.isJoi) {
    return res.status(400).json({
      message: 'Validation error',
      error: error.details.map(detail => detail.message).join(', ')
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      message: 'Invalid token',
      error: 'Authentication token is invalid'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      message: 'Token expired',
      error: 'Authentication token has expired'
    });
  }

  // Default error
  res.status(error.status || 500).json({
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
}

/**
 * Legacy function for backward compatibility
 */
function handleStremioError(error, res) {
  return handleError(error, null, res, null);
}

/**
 * Legacy function for backward compatibility  
 */
function handleDatabaseError(error, res, context = 'operation') {
  console.error(`Database error during ${context}:`, error);
  return handleError(error, null, res, null);
}

/**
 * Standardized error response format
 */
function sendError(res, statusCode, message, error = null) {
  const response = { message };
  if (error) {
    response.error = error;
  }
  return res.status(statusCode).json(response);
}

module.exports = {
  handleError,
  handleStremioError,
  handleDatabaseError,
  sendError
};
