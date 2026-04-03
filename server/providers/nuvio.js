/**
 * Nuvio provider — Supabase REST implementation.
 * Translates between Supabase addon rows and the universal addon shape.
 */

const { supabaseGet, supabasePost, supabaseDelete, supabaseRpc } = require('./supabase')
const { refreshNuvioToken, isTokenExpired } = require('./nuvioAuth')

function createNuvioProvider({ refreshToken, userId }) {
  let accessToken = null

  async function ensureAuth() {
    if (accessToken && !isTokenExpired(accessToken)) return
    const result = await refreshNuvioToken(refreshToken)
    accessToken = result.access_token
  }

  return {
    type: 'nuvio',

    // --- Addon Transport ---

    async getAddons() {
      await ensureAuth()
      const rows = await supabaseGet('addons', {
        user_id: `eq.${userId}`,
        profile_id: 'eq.1',
        order: 'sort_order.asc,created_at.asc',
        select: '*'
      }, accessToken)

      // Transform to universal shape (minimal manifest — sync uses urlOnly mode)
      const addons = rows.map(row => ({
        transportUrl: row.url,
        transportName: '',
        manifest: {
          id: row.url,
          name: row.name || ''
        }
      }))
      return { addons }
    },

    async setAddons(addons) {
      await ensureAuth()
      // Delete all current addons, then insert desired set
      await supabaseDelete('addons', {
        user_id: `eq.${userId}`,
        profile_id: 'eq.1'
      }, accessToken)

      if (addons.length > 0) {
        const rows = addons.map((addon, i) => ({
          user_id: userId,
          profile_id: 1,
          url: addon.transportUrl,
          name: addon.manifest?.name || addon.transportName || addon.name || '',
          enabled: true,
          sort_order: i
        }))
        await supabasePost('addons', rows, accessToken)
      }
    },

    async addAddon(url, manifest) {
      await ensureAuth()
      // Get current max sort_order
      const current = await supabaseGet('addons', {
        user_id: `eq.${userId}`,
        profile_id: 'eq.1',
        select: 'sort_order',
        order: 'sort_order.desc',
        limit: '1'
      }, accessToken)
      const nextOrder = (current[0]?.sort_order ?? -1) + 1

      await supabasePost('addons', [{
        user_id: userId,
        profile_id: 1,
        url,
        name: manifest?.name || '',
        enabled: true,
        sort_order: nextOrder
      }], accessToken)
    },

    async clearAddons() {
      await ensureAuth()
      await supabaseDelete('addons', {
        user_id: `eq.${userId}`,
        profile_id: 'eq.1'
      }, accessToken)
    },

    // --- Content ---

    async getLibrary() {
      await ensureAuth()
      // Combine library + watch progress to build Stremio-compatible libraryItem shape
      const [library, progress] = await Promise.all([
        supabaseRpc('sync_pull_library', { p_profile_id: 1 }, accessToken),
        supabaseRpc('sync_pull_watch_progress', { p_profile_id: 1 }, accessToken)
      ])

      // Transform watch progress to Stremio libraryItem shape
      const items = progress.map(p => ({
        _id: p.content_id,
        name: '',
        type: p.content_type,
        state: {
          video_id: p.video_id,
          season: p.season,
          episode: p.episode,
          timeOffset: p.position,
          timeWatched: p.duration,
          overallTimeWatched: p.duration,
          lastWatched: new Date(p.last_watched).toISOString()
        },
        _mtime: p.last_watched,
        removed: false
      }))

      // Merge in any library-only items (bookmarked but no progress)
      if (Array.isArray(library)) {
        for (const item of library) {
          if (!items.find(i => i._id === item.content_id)) {
            items.push({
              _id: item.content_id,
              name: item.title || '',
              type: item.content_type,
              state: {},
              _mtime: Date.now(),
              removed: false
            })
          }
        }
      }

      return items
    },

    async getWatchedItems(page, pageSize) {
      await ensureAuth()
      return await supabaseRpc('sync_pull_watched_items', {
        p_page: page || 1,
        p_page_size: pageSize || 50,
        p_profile_id: 1
      }, accessToken)
    },

    async getWatchProgress() {
      await ensureAuth()
      return await supabaseRpc('sync_pull_watch_progress', {
        p_profile_id: 1
      }, accessToken)
    },

    // Library writes — NOOP (deferred)
    async addLibraryItem() { return null },
    async removeLibraryItem() { return null },

    // Likes — no Nuvio equivalent
    async getLikeStatus() { return null },
    async setLikeStatus() { return null }
  }
}

module.exports = { createNuvioProvider }
