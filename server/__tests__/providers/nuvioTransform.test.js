/**
 * Tests for Nuvio data transformation — Supabase rows ↔ universal addon shape.
 *
 * These test the exact transformations the Nuvio provider must perform.
 */

// Transformation functions (will be extracted into nuvio.js)

function supabaseRowsToUniversalAddons(rows) {
  return rows.map(row => ({
    transportUrl: row.url,
    transportName: '',
    manifest: {
      id: row.url,
      name: row.name || ''
    }
  }))
}

function universalAddonsToSupabaseRows(addons, userId) {
  return addons.map((addon, i) => ({
    user_id: userId,
    profile_id: 1,
    url: addon.transportUrl,
    name: '',
    enabled: true,
    sort_order: i
  }))
}

// -- Test data --

const SUPABASE_ROWS = [
  {
    id: '80ce7b5f-4990-49e3-8638-0676bae7580c',
    user_id: '9f7d49dc-97be-4869-a645-13d2dca86f7b',
    url: 'https://torrentio.strem.fun/manifest.json',
    name: 'Torrentio',
    enabled: true,
    sort_order: 0,
    created_at: '2026-04-02T09:22:06.503862+00:00',
    profile_id: 1
  },
  {
    id: 'e04ed397-b1cc-42a0-8f8b-be3ffdaa5511',
    user_id: '9f7d49dc-97be-4869-a645-13d2dca86f7b',
    url: 'https://v3-cinemeta.strem.io/manifest.json',
    name: '',
    enabled: true,
    sort_order: 1,
    created_at: '2026-04-02T09:26:38.315493+00:00',
    profile_id: 1
  }
]

const UNIVERSAL_ADDONS = [
  {
    transportUrl: 'https://torrentio.strem.fun/manifest.json',
    transportName: '',
    manifest: {
      id: 'com.stremio.torrentio.addon',
      name: 'Torrentio',
      version: '0.0.14',
      description: 'Provides torrent streams',
      resources: [{ name: 'stream', types: ['movie', 'series'] }],
      catalogs: [],
      types: ['movie', 'series']
    }
  },
  {
    transportUrl: 'https://v3-cinemeta.strem.io/manifest.json',
    transportName: '',
    manifest: {
      id: 'com.linvo.cinemeta',
      name: 'Cinemeta',
      version: '3.0.0',
      description: 'Provides metadata'
    }
  }
]

describe('Nuvio data transformations', () => {
  describe('supabaseRowsToUniversalAddons', () => {
    test('transforms rows to universal shape', () => {
      const result = supabaseRowsToUniversalAddons(SUPABASE_ROWS)

      expect(result).toHaveLength(2)
      expect(result[0].transportUrl).toBe('https://torrentio.strem.fun/manifest.json')
      expect(result[0].transportName).toBe('')
      expect(result[0].manifest.id).toBe('https://torrentio.strem.fun/manifest.json')
      expect(result[0].manifest.name).toBe('Torrentio')
    })

    test('handles empty name', () => {
      const result = supabaseRowsToUniversalAddons(SUPABASE_ROWS)
      expect(result[1].manifest.name).toBe('')
    })

    test('handles empty array', () => {
      expect(supabaseRowsToUniversalAddons([])).toEqual([])
    })

    test('preserves URL exactly', () => {
      const rows = [{ url: 'https://example.com/some/path/manifest.json', name: 'Test' }]
      const result = supabaseRowsToUniversalAddons(rows)
      expect(result[0].transportUrl).toBe('https://example.com/some/path/manifest.json')
    })
  })

  describe('universalAddonsToSupabaseRows', () => {
    const userId = '9f7d49dc-97be-4869-a645-13d2dca86f7b'

    test('transforms universal addons to Supabase rows', () => {
      const result = universalAddonsToSupabaseRows(UNIVERSAL_ADDONS, userId)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        user_id: userId,
        profile_id: 1,
        url: 'https://torrentio.strem.fun/manifest.json',
        name: '',
        enabled: true,
        sort_order: 0
      })
      expect(result[1].sort_order).toBe(1)
    })

    test('sort_order is sequential from 0', () => {
      const result = universalAddonsToSupabaseRows(UNIVERSAL_ADDONS, userId)
      result.forEach((row, i) => {
        expect(row.sort_order).toBe(i)
      })
    })

    test('name is always empty (let Nuvio resolve from manifest)', () => {
      const result = universalAddonsToSupabaseRows(UNIVERSAL_ADDONS, userId)
      result.forEach(row => {
        expect(row.name).toBe('')
      })
    })

    test('profile_id is always 1', () => {
      const result = universalAddonsToSupabaseRows(UNIVERSAL_ADDONS, userId)
      result.forEach(row => {
        expect(row.profile_id).toBe(1)
      })
    })

    test('handles empty array', () => {
      expect(universalAddonsToSupabaseRows([], userId)).toEqual([])
    })

    test('extracts URL from transportUrl', () => {
      const addons = [{ transportUrl: 'https://custom.addon.com/manifest.json', manifest: { name: 'Custom' } }]
      const result = universalAddonsToSupabaseRows(addons, userId)
      expect(result[0].url).toBe('https://custom.addon.com/manifest.json')
    })
  })

  describe('round-trip consistency', () => {
    test('rows → universal → rows preserves URLs and order', () => {
      const userId = 'test-user'
      const universal = supabaseRowsToUniversalAddons(SUPABASE_ROWS)
      const roundTripped = universalAddonsToSupabaseRows(universal, userId)

      expect(roundTripped).toHaveLength(SUPABASE_ROWS.length)
      roundTripped.forEach((row, i) => {
        expect(row.url).toBe(SUPABASE_ROWS[i].url)
        expect(row.sort_order).toBe(i)
      })
    })
  })
})
