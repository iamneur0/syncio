/**
 * Common validation utilities to reduce duplication
 */

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
function isValidPassword(password) {
  if (typeof password !== 'string') return false;
  return password.length >= 4;
}

/**
 * Sanitize and normalize URL
 */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  
  let sanitized = String(url).trim();
  
  // Remove leading @ symbols
  sanitized = sanitized.replace(/^@+/, '');
  
  // Convert stremio:// scheme to https://
  if (sanitized.toLowerCase().startsWith('stremio://')) {
    sanitized = sanitized.replace(/^stremio:\/\//i, 'https://');
  }
  
  return sanitized;
}

/**
 * Validate required fields in request body
 */
function validateRequiredFields(body, requiredFields) {
  const missing = [];
  const invalid = [];
  
  for (const field of requiredFields) {
    if (!body[field]) {
      missing.push(field);
    } else if (field === 'email' && !isValidEmail(body[field])) {
      invalid.push(`${field} format is invalid`);
    } else if (field === 'password' && !isValidPassword(body[field])) {
      invalid.push(`${field} must be at least 4 characters`);
    }
  }
  
  return { missing, invalid, isValid: missing.length === 0 && invalid.length === 0 };
}

/**
 * Validate Stremio credentials format
 */
function validateStremioCredentials(email, password) {
  const errors = [];
  
  if (!email) {
    errors.push('Email is required');
  } else if (!isValidEmail(email)) {
    errors.push('Invalid email format');
  }
  
  if (!password) {
    errors.push('Password is required');
  } else if (!isValidPassword(password)) {
    errors.push('Password must be at least 4 characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Check if user has required permissions
 */
function hasPermission(user, requiredPermission) {
  // Add permission logic here based on your role system
  // For now, just check if user exists and is active
  return user && user.isActive !== false;
}

/**
 * Validate account context for authenticated requests
 */
function validateAccountContext(req, AUTH_ENABLED) {
  if (AUTH_ENABLED && !req.appAccountId) {
    return {
      isValid: false,
      error: 'Unauthorized - missing account context'
    };
  }
  return { isValid: true };
}

/**
 * Common validation middleware factory
 */
function createValidationMiddleware(validationFn) {
  return (req, res, next) => {
    const result = validationFn(req.body);
    if (!result.isValid) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: result.errors || result.missing || result.invalid
      });
    }
    next();
  };
}

module.exports = {
  isValidEmail,
  isValidPassword,
  sanitizeUrl,
  validateRequiredFields,
  validateStremioCredentials,
  hasPermission,
  validateAccountContext,
  createValidationMiddleware
};
