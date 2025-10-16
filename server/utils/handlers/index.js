/**
 * Handler utilities - Process requests and generate responses
 */

const { handleError, handleStremioError, handleDatabaseError, sendError } = require('./errorHandler');
const { createRouteHandler, DatabaseTransactions, StremioAPIUtils } = require('./routeHandler');

module.exports = {
  // Error handling
  handleError,
  handleStremioError,
  handleDatabaseError,
  sendError,
  
  // Route handling
  createRouteHandler,
  DatabaseTransactions,
  StremioAPIUtils
};
