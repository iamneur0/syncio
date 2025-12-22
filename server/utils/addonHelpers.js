/**
 * Helper functions for managing Stremio addons
 */

/**
 * Get the Local Files addon object (kept for reference but no longer used)
 * @returns {Object} Local Files addon object
 * @deprecated No longer used - addons are now cleared to empty array
 */
function getLocalFilesAddon() {
  return {
    transportUrl: 'http://127.0.0.1:11470/local-addon/manifest.json',
    transportName: '',
    manifest: {
      id: 'org.stremio.local',
      version: '1.10.0',
      description: 'Local add-on to find playable files: .torrent, .mp4, .mkv and .avi',
      name: 'Local Files (without catalog support)',
      resources: [
        {
          name: 'meta',
          types: ['other'],
          idPrefixes: ['local:', 'bt:']
        },
        {
          name: 'stream',
          types: ['movie', 'series'],
          idPrefixes: ['tt']
        }
      ],
      types: ['movie', 'series', 'other'],
      catalogs: []
    }
  }
}

/**
 * Clear all addons (set to empty array)
 * Previously added Local Files addon, but that workaround is no longer needed
 * @param {Object} apiClient - StremioAPIClient instance
 * @returns {Promise<void>}
 */
async function clearAddonsAndAddLocalFiles(apiClient) {
  // Just set to empty array - no longer need Local Files workaround
  await apiClient.request('addonCollectionSet', { addons: [] })
}

/**
 * Clear all addons (alias for clearAddonsAndAddLocalFiles)
 * @param {Object} apiClient - StremioAPIClient instance
 * @returns {Promise<void>}
 */
async function clearAddons(apiClient) {
  await apiClient.request('addonCollectionSet', { addons: [] })
}

module.exports = {
  getLocalFilesAddon,
  clearAddonsAndAddLocalFiles,
  clearAddons
}
