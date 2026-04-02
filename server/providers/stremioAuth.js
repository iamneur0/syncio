/**
 * Stremio authentication — wraps existing validateStremioAuthKey.
 * Module-level functions, not on the provider instance.
 * Re-exports from the existing utils/stremio.js to keep things centralized.
 */

const { validateStremioAuthKey } = require('../utils/stremio')

module.exports = { validateStremioAuthKey }
