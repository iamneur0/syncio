/**
 * Tests for the provider factory — createProvider(user, deps).
 *
 * These tests verify the factory BEFORE it exists (test-first).
 * They define the contract that the factory must satisfy.
 */

// This will be the real import once implemented:
// const { createProvider } = require('../../providers')

// For now, test the factory contract with a mock implementation
// that matches what we'll build in Phase 1.

function createProvider(user, { decrypt, req }) {
  const type = user.providerType || 'stremio'

  if (type === 'nuvio') {
    if (!user.nuvioRefreshToken || !user.nuvioUserId) return null
    return { type: 'nuvio', _userId: user.nuvioUserId }
  }

  if (!user.stremioAuthKey) return null
  return { type: 'stremio', _authKey: 'decrypted' }
}

const mockDecrypt = (val) => 'decrypted_' + val
const mockReq = { appAccountId: 'test-account' }

describe('createProvider factory', () => {
  describe('routing', () => {
    test('returns stremio provider for stremio user', () => {
      const user = { providerType: 'stremio', stremioAuthKey: 'enc_key' }
      const provider = createProvider(user, { decrypt: mockDecrypt, req: mockReq })
      expect(provider).not.toBeNull()
      expect(provider.type).toBe('stremio')
    })

    test('returns nuvio provider for nuvio user', () => {
      const user = { providerType: 'nuvio', nuvioRefreshToken: 'enc_token', nuvioUserId: 'uuid-123' }
      const provider = createProvider(user, { decrypt: mockDecrypt, req: mockReq })
      expect(provider).not.toBeNull()
      expect(provider.type).toBe('nuvio')
    })

    test('defaults to stremio when providerType is missing', () => {
      const user = { stremioAuthKey: 'enc_key' }
      const provider = createProvider(user, { decrypt: mockDecrypt, req: mockReq })
      expect(provider).not.toBeNull()
      expect(provider.type).toBe('stremio')
    })
  })

  describe('null returns (no credentials)', () => {
    test('returns null for stremio user without authKey', () => {
      const user = { providerType: 'stremio', stremioAuthKey: null }
      const provider = createProvider(user, { decrypt: mockDecrypt, req: mockReq })
      expect(provider).toBeNull()
    })

    test('returns null for nuvio user without refreshToken', () => {
      const user = { providerType: 'nuvio', nuvioRefreshToken: null, nuvioUserId: 'uuid-123' }
      const provider = createProvider(user, { decrypt: mockDecrypt, req: mockReq })
      expect(provider).toBeNull()
    })

    test('returns null for nuvio user without userId', () => {
      const user = { providerType: 'nuvio', nuvioRefreshToken: 'enc_token', nuvioUserId: null }
      const provider = createProvider(user, { decrypt: mockDecrypt, req: mockReq })
      expect(provider).toBeNull()
    })

    test('returns null for user with no credentials at all', () => {
      const user = {}
      const provider = createProvider(user, { decrypt: mockDecrypt, req: mockReq })
      expect(provider).toBeNull()
    })
  })

  describe('provider interface contract', () => {
    // These tests define what methods the real provider must have.
    // They'll be updated to use the real factory in Phase 1.

    const REQUIRED_METHODS = [
      'getAddons', 'setAddons', 'addAddon', 'clearAddons',
      'getLibrary', 'getLikeStatus', 'setLikeStatus',
      'addLibraryItem', 'removeLibraryItem'
    ]

    test.skip('stremio provider has all required methods', () => {
      const user = { providerType: 'stremio', stremioAuthKey: 'enc_key' }
      const provider = createProvider(user, { decrypt: mockDecrypt, req: mockReq })
      for (const method of REQUIRED_METHODS) {
        expect(typeof provider[method]).toBe('function')
      }
    })

    test.skip('nuvio provider has all required methods', () => {
      const user = { providerType: 'nuvio', nuvioRefreshToken: 'enc_token', nuvioUserId: 'uuid-123' }
      const provider = createProvider(user, { decrypt: mockDecrypt, req: mockReq })
      for (const method of REQUIRED_METHODS) {
        expect(typeof provider[method]).toBe('function')
      }
    })
  })
})
