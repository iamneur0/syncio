const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(400).json({
      message: 'Duplicate entry',
      field: err.meta?.target?.[0] || 'unknown',
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      message: 'Record not found',
    });
  }

  // Validation errors
  if (err.isJoi) {
    return res.status(400).json({
      message: 'Validation error',
      details: err.details.map(detail => detail.message),
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      message: 'Invalid token',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      message: 'Token expired',
    });
  }

  // Default error
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { errorHandler };
