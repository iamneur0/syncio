/**
 * Stremio provider — wraps StremioAPIClient.
 * This is a thin pass-through. The existing normalization logic from sync.js
 * is moved here so it's encapsulated in the provider.
 */

const { StremioAPIClient } = require('stremio-api-client')

function createStremioProvider({ authKey }) {
  const client = new StremioAPIClient({
    endpoint: 'https://api.strem.io',
    authKey
  })

  return {
    type: 'stremio',

    // --- Addon Transport ---

    async getAddons() {
      const collection = await client.request('addonCollectionGet', {})

      // Normalization logic from sync.js:16-62 — handles null, non-array, corrupted responses
      if (collection && collection.addons === null) {
        try {
          await client.request('addonCollectionSet', { addons: [] })
          const repaired = await client.request('addonCollectionGet', {})
          if (repaired && repaired.addons !== null) {
            Object.assign(collection, repaired)
          }
        } catch (_) { /* continue with null handling below */ }
      }

      const rawAddons = collection?.addons !== undefined ? collection.addons : collection
      let addonsArray = []
      if (rawAddons !== null && rawAddons !== undefined) {
        if (Array.isArray(rawAddons)) {
          addonsArray = rawAddons
        } else if (typeof rawAddons === 'object') {
          addonsArray = Object.values(rawAddons)
        }
      }

      const addons = addonsArray.map((addon) => {
        const manifest = addon?.manifest
        if (manifest && typeof manifest === 'object') {
          const { manifestUrl, ...restManifest } = manifest
          return { ...addon, manifest: restManifest, transportName: '' }
        }
        return { ...addon, transportName: '' }
      })

      if (!Array.isArray(addons)) return { addons: [] }
      return { addons }
    },

    async setAddons(addons) {
      await client.request('addonCollectionSet', { addons })
    },

    async addAddon(url, manifest) {
      await client.request('addonCollectionAdd', { addonId: url, manifest })
    },

    async clearAddons() {
      await client.request('addonCollectionSet', { addons: [] })
    },

    // --- Content ---

    async getLibrary() {
      const items = await client.request('datastoreGet', {
        collection: 'libraryItem',
        ids: [],
        all: true
      })
      return items
    },

    async addLibraryItem(changes) {
      await client.request('datastorePut', {
        collection: 'libraryItem',
        changes
      })
    },

    async removeLibraryItem(changes) {
      await client.request('datastorePut', {
        collection: 'libraryItem',
        changes
      })
    },

    async getLikeStatus(authToken, mediaId, mediaType) {
      const res = await fetch(
        `https://likes.stremio.com/api/get_status?authToken=${encodeURIComponent(authToken)}&mediaId=${encodeURIComponent(mediaId)}&mediaType=${encodeURIComponent(mediaType)}`
      )
      if (!res.ok) return null
      return await res.json()
    },

    async setLikeStatus(authToken, mediaId, mediaType, status) {
      await fetch('https://likes.stremio.com/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken, mediaId, mediaType, status })
      })
    },

    // Raw client access for edge cases during migration
    get client() { return client }
  }
}

module.exports = { createStremioProvider }
