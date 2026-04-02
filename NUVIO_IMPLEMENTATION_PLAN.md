# Nuvio Integration — Implementation Plan

## Architecture

### The Role Separation

Syncio has three distinct concerns that must stay cleanly separated:

```
┌─────────────────────────────────────────────────────────┐
│                    SYNCIO CORE                          │
│  (Groups, Users, Addon DB, Sync Planning, Metrics)      │
│  Provider-agnostic. Works with universal addon shape.    │
└──────────────┬──────────────────────┬───────────────────┘
               │                      │
       ┌───────▼───────┐      ┌───────▼───────┐
       │  AddonTransport│      │  AddonTransport│
       │   (Stremio)    │      │   (Nuvio)      │
       └───────┬───────┘      └───────┬───────┘
               │                      │
       ┌───────▼───────┐      ┌───────▼───────┐
       │  AuthProvider  │      │  AuthProvider  │
       │   (Stremio)    │      │   (Nuvio)      │
       └───────────────┘      └───────────────┘
```

**Syncio Core** — The orchestrator. It decides WHAT addons a user should have (from groups, protected addons, exclusions). It doesn't know HOW to push them.

**AddonTransport** — The delivery mechanism. Given a list of addons, it knows how to read/write them to a specific platform. This is the only thing that differs between Stremio and Nuvio.

**AuthProvider** — How users prove their identity. Stremio uses OAuth + authKey. Nuvio uses email/password + JWT. Completely separate from addon transport.

### Why NOT a Single Fat Provider

A single `Provider` class with `getAddons()`, `getLibrary()`, `getLikeStatus()`, `validateAuth()` all mixed together is a god object. It conflates:
- Transport (how addons move)
- Content (library, watch history)
- Social (likes)
- Identity (auth)

These change for different reasons and at different rates. Keep them separate.

### The Interfaces

```
server/
  transports/
    index.js              # Factory: getTransport(user, deps)
    stremio.js            # StremioTransport
    nuvio.js              # NuvioTransport
    supabaseClient.js     # Low-level Supabase HTTP helper
  auth/
    index.js              # Factory: getAuthProvider(providerType)
    stremio.js            # Stremio OAuth + authKey validation
    nuvio.js              # Supabase email/password + JWT refresh
  content/
    index.js              # Factory: getContentReader(user, deps)
    stremio.js            # datastoreGet for library, likes.stremio.com
    nuvio.js              # sync_pull_* RPCs, NOOP for likes
```

---

## Design Principles

1. **Per-user provider** — Each user is `stremio` or `nuvio`. Both coexist in the same groups, same addon sets, same Syncio instance.
2. **Separate transports from auth from content** — Three focused interfaces, not one god object.
3. **Universal addon shape = Stremio's native format** — `{ transportUrl, transportName, manifest }`. The sync engine doesn't change at all. Only the Nuvio transport translates.
4. **No breaking changes** — `providerType` defaults to `"stremio"`. Existing code paths unchanged for Stremio users.
5. **Test before refactor** — Integration tests for critical paths before any code moves.
6. **Manifest resolution is infrastructure** — Both transports return the universal shape. Nuvio's transport fetches manifests as needed, using Syncio's existing addon DB as cache.

---

## Phase 0: Safety Net

### 0.1 — Test Framework

Install Jest. Write tests for the functions we're about to wrap:

```
server/__tests__/
  transports/
    stremio.test.js        # Mock StremioAPIClient, verify universal shape output
    nuvio.test.js          # Mock Supabase HTTP, verify universal shape output
    factory.test.js        # getTransport returns correct type per user.providerType
  auth/
    stremio.test.js        # Mock api.strem.io, verify validateStremioAuthKey
    nuvio.test.js          # Mock Supabase auth, verify login/refresh/validate
  content/
    stremio.test.js        # Mock datastoreGet, verify library item shape
    nuvio.test.js          # Mock sync_pull_*, verify translated shape
  sync/
    computePlan.test.js    # Test plan computation with mock transport data
    getUserAddons.test.js  # Test with mock transport
    syncUserAddons.test.js # Test full flow with mock transport
```

Tests mock at the HTTP boundary (mock `fetch`, mock `StremioAPIClient.request`), not at the transport level. This means tests verify the actual translation logic.

### 0.2 — ESLint

Create `.eslintrc.json`:
- `eslint:recommended`, `env: { node: true, es2022: true }`
- `no-unused-vars: warn`, `no-undef: error`
- Run `npm run lint`, fix anything that would mask refactor bugs.

### 0.3 — CLAUDE.md

Document:
- Architecture (transport / auth / content separation)
- Universal addon shape definition
- How to add a new provider (implement 3 interfaces)
- How to run tests and lint
- Encryption pattern for credentials

---

## Phase 1: Transport Layer

### 1.1 — AddonTransport Interface

Both transports implement:

```javascript
/**
 * AddonTransport — reads and writes addons to a user's account on a platform.
 *
 * All methods work with the universal addon shape:
 *   { transportUrl: string, transportName: string, manifest: { id, name, version, ... } }
 *
 * The transport handles authentication internally (authKey for Stremio, JWT for Nuvio).
 */
{
  async getAddons()              // → { addons: UniversalAddon[] }
  async setAddons(addons)        // → void (atomic full replace)
  async addAddon(url, manifest)  // → void (append one)
  async clearAddons()            // → void (remove all)
}
```

That's it. Four methods. Clean, focused, testable.

### 1.2 — `server/transports/index.js`

```javascript
const { createStremioTransport } = require('./stremio')
const { createNuvioTransport } = require('./nuvio')

/**
 * Factory: creates the correct addon transport for a user.
 * Returns null if user has no credentials for their provider.
 */
function getTransport(user, { decrypt, req }) {
  const type = user.providerType || 'stremio'

  if (type === 'nuvio') {
    if (!user.nuvioRefreshToken || !user.nuvioUserId) return null
    return createNuvioTransport({
      refreshToken: decrypt(user.nuvioRefreshToken, req),
      userId: user.nuvioUserId
    })
  }

  if (!user.stremioAuthKey) return null
  return createStremioTransport({
    authKey: decrypt(user.stremioAuthKey, req)
  })
}

module.exports = { getTransport }
```

### 1.3 — `server/transports/stremio.js`

Wraps existing `StremioAPIClient`. Moves the normalization logic (currently in `sync.js:14-62`) inside:

```javascript
const { StremioAPIClient } = require('stremio-api-client')

function createStremioTransport({ authKey }) {
  const client = new StremioAPIClient({
    endpoint: 'https://api.strem.io',
    authKey
  })

  return {
    async getAddons() {
      const collection = await client.request('addonCollectionGet', {})
      const addons = normalizeCollection(collection) // Existing logic from sync.js
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
    }
  }
}
```

### 1.4 — `server/transports/nuvio.js`

Translates between Supabase REST rows and the universal addon shape:

```javascript
const { supabaseGet, supabasePost, supabaseDelete } = require('./supabaseClient')
const { refreshNuvioToken, isTokenExpired } = require('../auth/nuvio')

function createNuvioTransport({ refreshToken, userId }) {
  let accessToken = null

  async function ensureAuth() {
    if (accessToken && !isTokenExpired(accessToken)) return
    const result = await refreshNuvioToken(refreshToken)
    accessToken = result.access_token
  }

  return {
    async getAddons() {
      await ensureAuth()
      const rows = await supabaseGet('addons', {
        user_id: `eq.${userId}`,
        profile_id: 'eq.1',
        order: 'sort_order.asc,created_at.asc',
        select: '*'
      }, accessToken)

      // Transform rows → universal shape
      // Manifest resolution uses Syncio's addon DB cache (not live fetch)
      const addons = rows.map(row => ({
        transportUrl: row.url,
        transportName: '',
        manifest: {
          id: row.url,    // Use URL as ID (manifests resolved by sync engine)
          name: row.name || '',
          version: '',
          description: ''
        }
      }))
      return { addons }
    },

    async setAddons(addons) {
      await ensureAuth()
      // Atomic-ish: delete then insert
      await supabaseDelete('addons', {
        user_id: `eq.${userId}`,
        profile_id: 'eq.1'
      }, accessToken)

      if (addons.length > 0) {
        const rows = addons.map((addon, i) => ({
          user_id: userId,
          profile_id: 1,
          url: addon.transportUrl,
          name: '',
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
        name: '',
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
    }
  }
}
```

### 1.5 — `server/transports/supabaseClient.js`

Thin HTTP wrapper for Supabase PostgREST. Single responsibility: make authenticated REST calls.

```javascript
const SUPABASE_URL = 'https://dpyhjjcoabcglfmgecug.supabase.co'
const SUPABASE_ANON_KEY = '...' // From env or config

async function supabaseGet(table, params, accessToken) { /* GET /rest/v1/{table}?{params} */ }
async function supabasePost(table, rows, accessToken) { /* POST /rest/v1/{table} */ }
async function supabaseDelete(table, params, accessToken) { /* DELETE /rest/v1/{table}?{params} */ }
async function supabasePatch(table, params, body, accessToken) { /* PATCH /rest/v1/{table}?{params} */ }
async function supabaseRpc(fn, body, accessToken) { /* POST /rest/v1/rpc/{fn} */ }

module.exports = { supabaseGet, supabasePost, supabaseDelete, supabasePatch, supabaseRpc }
```

### 1.6 — Manifest Resolution Strategy

**Problem:** Nuvio stores only URLs. The universal shape needs manifest data. Fetching manifests live adds latency.

**Solution:** The sync engine's comparison logic (`computeUserSyncPlan`) compares by **manifest URL** (via `canonicalizeManifestUrl`), not by manifest content. So the Nuvio transport can return a **stub manifest** (URL as ID, empty name) and the comparison still works correctly. Full manifests are only needed for display — and Syncio's addon DB already stores them.

For operations that need the manifest (like `addAddon`), the caller already has it (fetched from the manifest URL before calling the transport).

This means: **no live manifest fetching in the transport layer**. Clean separation.

---

## Phase 2: Auth Layer

### 2.1 — AuthProvider Interface

```javascript
/**
 * AuthProvider — validates user identity and manages credentials.
 * Separate from transport — auth happens at connection time, not on every sync.
 */
{
  async validate(credentials)    // → { user: { id, email }, tokens: { ... } }
  async refresh(refreshToken)    // → { accessToken, refreshToken }
}
```

### 2.2 — `server/auth/stremio.js`

Wraps existing `validateStremioAuthKey()` and `StremioAPIStore.login()`:

```javascript
module.exports = {
  async validate({ authKey }) {
    // Existing validateStremioAuthKey logic
    return { user: { id: user.id, email: user.email }, tokens: { authKey } }
  },
  async validateCredentials({ email, password }) {
    // Existing StremioAPIStore.login() logic
    return { user: { email }, tokens: { authKey } }
  },
  // Stremio authKeys don't expire, so refresh is identity
  async refresh(authKey) {
    return { accessToken: authKey, refreshToken: authKey }
  }
}
```

### 2.3 — `server/auth/nuvio.js`

```javascript
module.exports = {
  async validate({ email, password }) {
    // POST /auth/v1/token?grant_type=password
    return { user: { id, email }, tokens: { accessToken, refreshToken } }
  },
  async refresh(refreshToken) {
    // POST /auth/v1/token?grant_type=refresh_token
    return { accessToken, refreshToken }
  },
  isTokenExpired(jwt) {
    // Decode JWT, check exp claim vs now
  }
}
```

### 2.4 — `server/auth/index.js`

```javascript
function getAuthProvider(providerType) {
  if (providerType === 'nuvio') return require('./nuvio')
  return require('./stremio')
}

module.exports = { getAuthProvider }
```

---

## Phase 3: Content Layer

### 3.1 — ContentReader Interface

```javascript
/**
 * ContentReader — reads library/watch data from a user's platform.
 * Read-only for now (library writes are NOOP for Nuvio, deferred).
 */
{
  async getLibrary()                   // → Stremio libraryItem[] shape (normalized)
  async getWatchedItems(page, size)    // → WatchedItem[]
  async getWatchProgress()             // → WatchProgress[]
  async getLikeStatus(mediaId, type)   // → status | null
  async setLikeStatus(mediaId, type, status) // → void | null
  async addLibraryItem(item)           // → void | null (NOOP for Nuvio)
  async removeLibraryItem(id)          // → void | null (NOOP for Nuvio)
}
```

### 3.2 — Stremio ContentReader

Wraps existing `datastoreGet`/`datastorePut` and `likes.stremio.com` calls.

### 3.3 — Nuvio ContentReader

- `getLibrary()` → calls `rpc/sync_pull_library` + `rpc/sync_pull_watch_progress`, translates to Stremio libraryItem shape
- `getWatchedItems()` → calls `rpc/sync_pull_watched_items`
- `getWatchProgress()` → calls `rpc/sync_pull_watch_progress`
- `getLikeStatus()` → returns `null` (NOOP)
- `setLikeStatus()` → returns `null` (NOOP)
- `addLibraryItem()` → returns `null` (NOOP, deferred)
- `removeLibraryItem()` → returns `null` (NOOP, deferred)

### 3.4 — `server/content/index.js`

```javascript
function getContentReader(user, { decrypt, req }) {
  const type = user.providerType || 'stremio'
  if (type === 'nuvio') return createNuvioContentReader(user, { decrypt, req })
  return createStremioContentReader(user, { decrypt, req })
}

module.exports = { getContentReader }
```

---

## Phase 4: Schema Migration

```prisma
model User {
  // Existing (unchanged)
  stremioAuthKey     String?

  // New
  providerType       String    @default("stremio")  // "stremio" | "nuvio"
  nuvioRefreshToken  String?   // Encrypted Supabase refresh token
  nuvioUserId        String?   // Nuvio user UUID
}
```

Apply to both `schema.sqlite.prisma` and `schema.postgres.prisma`. Generate migration. Existing users get `providerType: "stremio"` automatically.

---

## Phase 5: Server Refactor

Replace direct `StremioAPIClient` usage with the three interfaces. The substitution pattern:

```diff
  // BEFORE (addon operations):
  const authKeyPlain = decrypt(user.stremioAuthKey, req)
  const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
  const collection = await apiClient.request('addonCollectionGet', {})

  // AFTER:
  const transport = getTransport(user, { decrypt, req })
  if (!transport) return res.status(400).json({ error: 'User not connected' })
  const { addons } = await transport.getAddons()
```

```diff
  // BEFORE (library operations):
  const items = await apiClient.request('datastoreGet', { collection: 'libraryItem', ... })

  // AFTER:
  const content = getContentReader(user, { decrypt, req })
  const items = await content.getLibrary()
```

```diff
  // BEFORE (auth validation):
  const validation = await validateStremioAuthKey(authKey)

  // AFTER:
  const authProvider = getAuthProvider(providerType)
  const validation = await authProvider.validate({ authKey })  // or { email, password }
```

### Files to refactor (in order):

**5.1 — Core sync** (lowest risk, highest value):
- `server/utils/sync.js` — `getUserAddons()` uses `getTransport`
- `server/utils/addonHelpers.js` — `clearAddons()` uses transport
- `server/routes/users.js:4470-4570` — `syncUserAddons()` uses transport

**5.2 — Addon CRUD in user routes**:
- `server/routes/users.js` — get/add/remove/reorder/clear addon endpoints (~11 sites)

**5.3 — Library and activity**:
- `server/utils/libraryToggle.js` — uses `getContentReader`
- `server/utils/libraryDelete.js` — uses `getContentReader`
- `server/utils/activityMonitor.js` — polls via `getContentReader`
- `server/utils/metricsBuilder.js` — reads via `getContentReader`

**5.4 — Likes**:
- `server/routes/users.js:2183,2247` — uses `getContentReader`

**5.5 — User expiration**:
- `server/utils/userExpiration.js` — uses `getTransport`

**5.6 — Public library**:
- `server/routes/publicLibrary.js` — uses `getTransport` + `getContentReader`

**5.7 — Invitations & auth routes**:
- `server/routes/invitations.js` — uses `getAuthProvider` + `getTransport`
- `server/routes/stremio.js` — keep as-is (Stremio-specific auth route)
- New: `server/routes/nuvio.js` — Nuvio-specific auth route

**5.8 — Dependency injection**:
- `server/index.js` — pass `getTransport`, `getContentReader`, `getAuthProvider` instead of `StremioAPIClient`

**5.9 — Supporting utilities**:
- `server/utils/stremio.js` — `filterDefaultAddons()` gets `providerType` param
- `server/utils/config.js` — provider-specific default addon lists
- `server/utils/helpers/validation.js` — `stremio://` conversion stays (harmless)

---

## Phase 6: Nuvio Auth Routes

### `server/routes/nuvio.js`

```javascript
// POST /api/nuvio/validate — validate Nuvio email+password
// POST /api/nuvio/connect  — connect user to Nuvio (store encrypted refresh token)
```

### Invitation flow changes in `server/routes/invitations.js`:

- `generate-oauth`: If provider is Nuvio, return `{ providerType: 'nuvio', requiresCredentials: true }` instead of OAuth link
- `complete`: If provider is Nuvio, accept `{ email, username, nuvioPassword }`, validate via `authProvider.validate()`, store tokens

---

## Phase 7: Client Changes

### 7.1 — New: `NuvioLoginCard.tsx`

Simple email/password form. Same callback shape as `StremioOAuthCard` but returns `{ email, tokens }` instead of `{ authKey }`.

### 7.2 — Provider-Aware Components

Pattern for all ~40 UI string changes:

```tsx
// Utility
function providerLabel(type: string) {
  return type === 'nuvio' ? 'Nuvio' : 'Stremio'
}

// Auth card selection
function ProviderAuthCard({ providerType, onAuth, ...props }) {
  if (providerType === 'nuvio') return <NuvioLoginCard onAuth={onAuth} {...props} />
  return <StremioOAuthCard onAuthKey={onAuth} {...props} />
}
```

Apply to: `LoginPage`, `UserAddModal`, `AccountMenuButton`, invite pages, `UserDetailModal`, `GenericEntityPage`, `GroupDetailModal`.

### 7.3 — UserAddModal

Add provider selector toggle (Stremio / Nuvio) at top of form. Conditionally render OAuth card or login form.

### 7.4 — Invite Page

User chooses provider type when accepting invite. Shows OAuth for Stremio, email/password for Nuvio.

### 7.5 — API Service

Add `nuvioAPI` namespace to `api.ts`. Update `usersAPI.create()` to pass `providerType`.

### 7.6 — Route Naming

Rename `/stremio-addons` → `/provider-addons` (generic). The handler reads `user.providerType` and dispatches to the correct transport. Keep `/stremio-addons` as alias for backward compat.

---

## Phase 8: Polish & Defaults

- `filterDefaultAddons()` — provider-specific default lists
- `get_sync_owner` check — warn on Nuvio user connection if owned by another account
- Nuvio `setAddons` atomicity — try/catch DELETE+INSERT, restore from Syncio state on failure
- Manifest caching — Nuvio transport uses Syncio's addon DB for manifest data

---

## Implementation Order

```
Phase 0  [Safety]      Tests + ESLint + CLAUDE.md
  ↓
Phase 1  [Transport]   server/transports/ (stremio.js, nuvio.js, supabaseClient.js)
  ↓
Phase 2  [Auth]        server/auth/ (stremio.js, nuvio.js)
  ↓
Phase 3  [Content]     server/content/ (stremio.js, nuvio.js)
  ↓
Phase 4  [Schema]      Prisma migration
  ↓
Phase 5  [Refactor]    Server — swap ~120 call sites to use factories
  ↓
Phase 6  [Routes]      Nuvio auth routes + invitation flow
  ↓
Phase 7  [Client]      NuvioLoginCard + provider-aware UI (~80 sites)
  ↓
Phase 8  [Polish]      Defaults, edge cases, final test pass
```

Each phase is independently testable. Tests must pass after each phase.

---

## Risk Mitigations

| Risk | Mitigation |
|---|---|
| Breaking Stremio users | `providerType` defaults to `"stremio"`. Stremio transport wraps existing code unchanged. Phase 0 tests verify Stremio path before refactor. |
| Nuvio manifest resolution | Transport returns stub manifests (URL as ID). Sync comparison uses URL, not manifest content. Full manifests from Syncio's addon DB cache. |
| JWT expiry mid-operation | `ensureAuth()` at start of every transport method. Transparent refresh. |
| Supabase rate limits | Sequential requests per user. No parallel Supabase calls within a single sync. |
| `get_sync_owner` conflict | Check on user connection. Warn if user is managed by another Nuvio account. |
| Nuvio DELETE+INSERT non-atomicity | try/catch around setAddons. On failure, log and return error (Syncio's DB still has the desired state for retry). |

---

## Why This Is Clean

1. **Single Responsibility** — Transport does addons. Auth does identity. Content does library/likes. No god objects.
2. **Open/Closed** — Adding a third provider (e.g., Stremio V5, another fork) means implementing 3 small interfaces and a factory case. Zero changes to sync engine, UI framework, or existing providers.
3. **Dependency Inversion** — Sync engine depends on transport interface, not on `StremioAPIClient`. Testable with mocks.
4. **Liskov Substitution** — Both transports return the same shape. Sync engine doesn't know or care which one it's talking to.
5. **Interface Segregation** — Components that only need addons get `getTransport()`. Components that only need library get `getContentReader()`. Nobody gets a fat interface they don't need.
