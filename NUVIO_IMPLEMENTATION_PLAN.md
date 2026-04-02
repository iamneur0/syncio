# Nuvio Integration — Implementation Plan

## Honest Design Constraints

Before the architecture, here are the realities of THIS codebase that drive the design:

1. **Plain JS, no TypeScript.** No formal interfaces, no class hierarchies. Functional style with `require`, plain objects. The design must feel native to this codebase.

2. **One credential = everything.** In Stremio, one `authKey` creates one `StremioAPIClient` that does addons, library, likes, and user validation. In Nuvio, one JWT does the same. Splitting into multiple factory patterns that each decrypt the credential separately is wasteful.

3. **We're adding ONE new provider.** Not five. Don't over-abstract for a future that may never come.

4. **The fingerprint compares full manifests.** `createManifestFingerprint()` in `sync.js:404-446` hashes `url + '|' + JSON.stringify(normalizedManifest)`. This means the transport CANNOT return stub manifests — the Nuvio side must return manifests that match what `getDesiredAddons()` produces, or every sync will rewrite all addons even when nothing changed.

5. **The sync engine's "desired" addons come from Syncio's DB** (`getDesiredAddons()` in `sync.js:78-256`). These already have full manifests stored (encrypted) in the Addon table. The "current" addons come from the provider. For the fingerprint comparison to work, both sides must have equivalent manifest data.

---

## Architecture

### One Provider, Grouped Methods

A single `createProvider(user, deps)` returns a plain object with methods grouped by concern. Not three separate factories — one object, one credential decryption, clear groupings:

```javascript
const provider = createProvider(user, { decrypt, req })

// Addon transport
provider.getAddons()
provider.setAddons(addons)
provider.addAddon(url, manifest)
provider.clearAddons()

// Content (library, likes)
provider.getLibrary()
provider.getWatchedItems(page, size)
provider.getWatchProgress()
provider.getLikeStatus(mediaId, type)
provider.setLikeStatus(mediaId, type, status)
provider.addLibraryItem(item)
provider.removeLibraryItem(id)
```

Auth is NOT on the provider instance — it's a module-level function used at connection time (invitations, login), not during sync operations.

```javascript
// Auth (module-level, not instance)
const stremioAuth = require('./providers/stremioAuth')
const nuvioAuth = require('./providers/nuvioAuth')
```

### Directory Structure

```
server/providers/
  index.js              # Factory: createProvider(user, deps) → provider
  stremio.js            # Stremio provider implementation
  nuvio.js              # Nuvio provider implementation
  supabase.js           # Low-level Supabase HTTP client
  stremioAuth.js        # Stremio auth validation (module-level)
  nuvioAuth.js          # Nuvio auth validation (module-level)
```

6 files. One directory. No over-abstraction.

---

## The Fingerprint Problem — Solved

### The Problem

`computeUserSyncPlan()` compares current addons (from provider) against desired addons (from Syncio DB). The comparison uses `createManifestFingerprint()` which hashes `url + '|' + JSON.stringify(manifest)`.

- **Stremio** returns full manifests from `addonCollectionGet` → fingerprints match desired (also full manifests) ✓
- **Nuvio** only stores URLs + names → stub manifests won't match → every sync rewrites everything ✗

### The Solution

Two options, in order of preference:

**Option A (recommended): URL-only fingerprint for Nuvio users.**

Add a `providerType` parameter to `computeUserSyncPlan`. For Nuvio users, use a URL-only fingerprint:

```javascript
function createManifestFingerprint(canonicalizeManifestUrl, urlOnly = false) {
  return (addon) => {
    const url = normalizeUrl(addon?.transportUrl || addon?.manifestUrl || addon?.url || '')
    if (urlOnly) return url  // Nuvio: compare by URL only
    const manifestNorm = normalizeManifest(addon?.manifest || addon)
    return url + '|' + JSON.stringify(manifestNorm)
  }
}
```

This is correct because: Syncio manages addon URLs. If the URL set and order matches, the user is synced. Manifest content changes (e.g., addon author updates description) are detected by Syncio's addon reload mechanism, not by the sync plan.

**Option B: Nuvio provider fetches manifests.**

`getAddons()` in the Nuvio provider fetches each manifest from its URL, caching in Syncio's addon DB. Returns full universal shape. Fingerprints match. Downside: adds N HTTP requests per sync check for Nuvio users.

**Decision: Option A.** URL-only comparison is more correct anyway — it separates "right addons installed?" from "addon manifest changed?". One line change to the fingerprint function. Minimal sync engine impact.

---

## Phase 0: Safety Net

### 0.1 — Jest Setup

```bash
npm install --save-dev jest
```

Write tests for the exact code paths we're wrapping:

```
server/__tests__/
  providers/
    stremio.test.js          # Mock StremioAPIClient, verify getAddons/setAddons
    nuvio.test.js            # Mock supabase HTTP, verify getAddons/setAddons
    factory.test.js          # createProvider returns correct type
  sync/
    fingerprint.test.js      # Test URL-only vs full fingerprint modes
    computePlan.test.js      # Test with mock provider data
  auth/
    stremioAuth.test.js      # Mock api.strem.io
    nuvioAuth.test.js        # Mock supabase auth
```

Mock at the HTTP boundary. Tests verify that:
- Stremio provider normalizes `addonCollectionGet` response correctly
- Nuvio provider transforms Supabase rows to universal shape
- Factory dispatches on `user.providerType`
- URL-only fingerprint correctly detects synced state
- Full fingerprint still works for Stremio users (no regression)

### 0.2 — ESLint

Create `.eslintrc.json`: `eslint:recommended`, `node: true`, `es2022: true`. Fix blocking errors.

### 0.3 — CLAUDE.md

Document architecture, universal addon shape, how to run tests/lint.

---

## Phase 1: Provider Layer

### 1.1 — `server/providers/index.js`

```javascript
const { createStremioProvider } = require('./stremio')
const { createNuvioProvider } = require('./nuvio')

/**
 * Creates the correct provider for a user based on their providerType.
 * Returns null if user has no credentials.
 *
 * Usage:
 *   const provider = createProvider(user, { decrypt, req })
 *   const { addons } = await provider.getAddons()
 *   await provider.setAddons(desiredAddons)
 */
function createProvider(user, { decrypt, req }) {
  const type = user.providerType || 'stremio'

  if (type === 'nuvio') {
    if (!user.nuvioRefreshToken || !user.nuvioUserId) return null
    return createNuvioProvider({
      refreshToken: decrypt(user.nuvioRefreshToken, req),
      userId: user.nuvioUserId
    })
  }

  if (!user.stremioAuthKey) return null
  return createStremioProvider({
    authKey: decrypt(user.stremioAuthKey, req)
  })
}

module.exports = { createProvider }
```

### 1.2 — `server/providers/stremio.js`

Wraps existing code. Moves normalization logic from `sync.js:14-62` into `getAddons()`:

```javascript
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
      // Normalization logic currently in sync.js:16-62
      // Handles null collection, non-array responses, etc.
      const addons = normalizeAddonCollection(collection)
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
      return await client.request('datastoreGet', {
        collection: 'libraryItem', ids: [], all: true
      })
    },

    async addLibraryItem(changes) {
      await client.request('datastorePut', {
        collection: 'libraryItem', changes
      })
    },

    async removeLibraryItem(changes) {
      await client.request('datastorePut', {
        collection: 'libraryItem', changes
      })
    },

    async getLikeStatus(authToken, mediaId, mediaType) {
      const resp = await fetch(
        `https://likes.stremio.com/api/get_status?authToken=${authToken}&mediaId=${mediaId}&mediaType=${mediaType}`
      )
      return await resp.json()
    },

    async setLikeStatus(authToken, mediaId, mediaType, status) {
      await fetch('https://likes.stremio.com/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken, mediaId, mediaType, status })
      })
    },

    // Raw client access (for edge cases during migration)
    get client() { return client }
  }
}
```

### 1.3 — `server/providers/nuvio.js`

```javascript
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

      // Transform to universal shape
      // Manifest is minimal — sync comparison uses URL-only mode for Nuvio
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

    async addAddon(url) {
      await ensureAuth()
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
    },

    // --- Content ---

    async getLibrary() {
      await ensureAuth()
      const items = await supabaseRpc('sync_pull_library', { p_profile_id: 1 }, accessToken)
      return items  // Shape TBD when library sync is implemented
    },

    async getWatchProgress() {
      await ensureAuth()
      return await supabaseRpc('sync_pull_watch_progress', { p_profile_id: 1 }, accessToken)
    },

    async getWatchedItems(page = 1, pageSize = 50) {
      await ensureAuth()
      return await supabaseRpc('sync_pull_watched_items', {
        p_page: page, p_page_size: pageSize, p_profile_id: 1
      }, accessToken)
    },

    // Library writes — NOOP (deferred)
    async addLibraryItem() { return null },
    async removeLibraryItem() { return null },

    // Likes — no Nuvio equivalent
    async getLikeStatus() { return null },
    async setLikeStatus() { return null },
  }
}
```

### 1.4 — `server/providers/supabase.js`

Thin HTTP wrapper. One file, four functions:

```javascript
const SUPABASE_URL = process.env.NUVIO_SUPABASE_URL || 'https://dpyhjjcoabcglfmgecug.supabase.co'
const SUPABASE_ANON_KEY = process.env.NUVIO_SUPABASE_ANON_KEY || '...'

function headers(accessToken) {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'authorization': `Bearer ${accessToken}`,
    'content-type': 'application/json',
    'prefer': 'return=representation'
  }
}

async function supabaseGet(table, params, accessToken) { /* ... */ }
async function supabasePost(table, rows, accessToken) { /* ... */ }
async function supabaseDelete(table, params, accessToken) { /* ... */ }
async function supabaseRpc(fn, body, accessToken) { /* ... */ }

module.exports = { supabaseGet, supabasePost, supabaseDelete, supabaseRpc }
```

### 1.5 — Auth Modules (separate from provider instance)

**`server/providers/stremioAuth.js`** — wraps existing `validateStremioAuthKey()` and `StremioAPIStore.login()`. Used by invitation completion and user login routes. Not on the provider instance.

**`server/providers/nuvioAuth.js`** — Supabase email/password login, JWT refresh, token expiry check. Used by Nuvio invitation completion and user login.

```javascript
async function validateNuvioCredentials(email, password) { /* POST /auth/v1/token?grant_type=password */ }
async function refreshNuvioToken(refreshToken) { /* POST /auth/v1/token?grant_type=refresh_token */ }
function isTokenExpired(jwt) { /* decode, check exp vs now */ }
module.exports = { validateNuvioCredentials, refreshNuvioToken, isTokenExpired }
```

---

## Phase 2: Schema Migration

Both Prisma schemas:

```prisma
model User {
  stremioAuthKey     String?                          // Keep (Stremio users)
  providerType       String    @default("stremio")    // "stremio" | "nuvio"
  nuvioRefreshToken  String?                          // Encrypted (Nuvio users)
  nuvioUserId        String?                          // Nuvio UUID (Nuvio users)
}
```

Existing users get `providerType: "stremio"` by default. Zero disruption.

---

## Phase 3: Sync Engine Tweak

One surgical change to `createManifestFingerprint()` in `sync.js`:

```diff
- function createManifestFingerprint(canonicalizeManifestUrl) {
+ function createManifestFingerprint(canonicalizeManifestUrl, { urlOnly = false } = {}) {
    // ... existing normalizeUrl and normalizeManifest helpers ...

    return (addon) => {
      const url = normalizeUrl(addon?.transportUrl || addon?.manifestUrl || addon?.url || '')
+     if (urlOnly) return url
      const manifestNorm = normalizeManifest(addon?.manifest || addon)
      return url + '|' + JSON.stringify(manifestNorm)
    }
  }
```

Then in `computeUserSyncPlan`:

```diff
- const fingerprint = createManifestFingerprint(canonicalizeManifestUrl)
+ const urlOnly = (user.providerType || 'stremio') === 'nuvio'
+ const fingerprint = createManifestFingerprint(canonicalizeManifestUrl, { urlOnly })
```

**Why this is correct:** Syncio controls what URL each user should have. If the URL set and order match, the user is synced. Manifest content changes are detected by addon reload, not sync comparison.

**Why this is safe:** Stremio users still get the full manifest fingerprint (no regression). Only Nuvio users get URL-only.

---

## Phase 4: Server Refactor

The bulk of the work. Substitution pattern at every call site:

```diff
  // BEFORE:
  const authKeyPlain = decrypt(user.stremioAuthKey, req)
  const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
  const collection = await apiClient.request('addonCollectionGet', {})

  // AFTER:
  const provider = createProvider(user, { decrypt, req })
  if (!provider) return res.status(400).json({ error: 'User not connected' })
  const { addons } = await provider.getAddons()
```

### Refactor order (lowest risk first):

1. **`sync.js`** — `getUserAddons()` (2 changes)
2. **`addonHelpers.js`** — `clearAddons()` (2 changes)
3. **`users.js:4470-4570`** — `syncUserAddons()` (3 changes)
4. **`users.js`** — addon CRUD endpoints (11 changes)
5. **`users.js`** — likes endpoints (2 changes, NOOP branch for Nuvio)
6. **`libraryToggle.js`** + **`libraryDelete.js`** (4 changes)
7. **`activityMonitor.js`** — library polling (3 changes)
8. **`metricsBuilder.js`** — library reads (2 changes)
9. **`userExpiration.js`** — addon clearing on expiry (2 changes)
10. **`publicLibrary.js`** — public user operations (8 changes)
11. **`invitations.js`** — addon fetch on completion (2 changes)
12. **`debug.js`** — debug endpoint (1 change)
13. **`index.js`** — dependency injection (pass `createProvider` instead of `StremioAPIClient`)

Each step: make the change, run tests, commit.

### Where `user.stremioAuthKey` is checked:

Every `if (!user.stremioAuthKey)` becomes:

```diff
- if (!user.stremioAuthKey) {
-   return { error: 'User not connected to Stremio' }
- }
+ const provider = createProvider(user, { decrypt, req })
+ if (!provider) {
+   return { error: 'User not connected' }
+ }
```

The factory already checks for credentials internally. Call sites don't need to know which field to check.

### Where `stremioAuthKey: { not: null }` appears in Prisma queries:

```diff
- where: { isActive: true, stremioAuthKey: { not: null } }
+ where: {
+   isActive: true,
+   OR: [
+     { stremioAuthKey: { not: null } },
+     { nuvioRefreshToken: { not: null } }
+   ]
+ }
```

Or add a helper: `hasProviderCredentials()` that builds the query.

---

## Phase 5: Nuvio Auth Routes

### `server/routes/nuvio.js`

- `POST /api/nuvio/validate` — call `validateNuvioCredentials(email, password)`, return `{ valid: true/false, user }`
- `POST /api/nuvio/connect` — validate, encrypt refresh token, store on user

### Invitation flow (`invitations.js`)

- `generate-oauth`: If `providerType === 'nuvio'`, return `{ providerType: 'nuvio' }` — no OAuth link
- `complete`: If `providerType === 'nuvio'`, accept `{ email, username, nuvioEmail, nuvioPassword }`, call `validateNuvioCredentials()`, verify email match, store encrypted tokens

---

## Phase 6: Client Changes

### 6.1 — `NuvioLoginCard.tsx` (new)

Email/password form. Calls `/api/nuvio/validate`. Returns credentials to parent via callback.

### 6.2 — Provider-aware rendering

```tsx
function ProviderAuthCard({ providerType, onAuth, ...props }) {
  if (providerType === 'nuvio') return <NuvioLoginCard onAuth={onAuth} {...props} />
  return <StremioOAuthCard onAuthKey={onAuth} {...props} />
}

const label = providerType === 'nuvio' ? 'Nuvio' : 'Stremio'
```

Apply to: `LoginPage`, `UserAddModal`, `AccountMenuButton`, invite pages, detail modals, entity pages.

### 6.3 — UserAddModal

Add provider toggle at top: `[Stremio] [Nuvio]`. Shows OAuth card or login form accordingly. Passes `providerType` with create request.

### 6.4 — Invite page

User chooses provider when accepting invite. Stremio → OAuth flow. Nuvio → email/password form.

### 6.5 — Route naming

Rename `/stremio-addons` → `/provider-addons`. Handler reads `user.providerType` from DB, dispatches to provider. Old routes kept as aliases.

### 6.6 — api.ts

Add `nuvioAPI` namespace. Update `usersAPI.create()` to pass `providerType`.

---

## Phase 7: Polish

- `filterDefaultAddons()` — pass `providerType`, empty defaults for Nuvio
- `get_sync_owner` check — warn on Nuvio connection if owned by another account
- Nuvio `setAddons` error handling — if INSERT fails after DELETE, return error (Syncio DB has desired state for retry)
- Env vars: `NUVIO_SUPABASE_URL`, `NUVIO_SUPABASE_ANON_KEY`

---

## Implementation Order

```
Phase 0  [Safety]       Tests + ESLint + CLAUDE.md
Phase 1  [Providers]    server/providers/ (6 files)
Phase 2  [Schema]       Prisma migration (3 fields)
Phase 3  [Sync tweak]   URL-only fingerprint for Nuvio (1 function, ~5 lines)
Phase 4  [Refactor]     Server call site swap (~45 locations across 13 files)
Phase 5  [Auth routes]  Nuvio auth + invitation flow
Phase 6  [Client]       NuvioLoginCard + provider-aware UI
Phase 7  [Polish]       Defaults, edge cases, env vars
```

---

## What Makes This Clean

1. **One provider object per user.** Not three factories. One `createProvider()` call, one credential decryption.
2. **Factory encapsulates credential logic.** Call sites don't know about `stremioAuthKey` vs `nuvioRefreshToken`. They just get a provider or null.
3. **Auth is separate from the instance.** Login/validation is module-level (used at connection time). Provider instance is for operations (used at sync time). Different lifecycles.
4. **Minimal sync engine changes.** One parameter added to `createManifestFingerprint()`. No rewrite.
5. **The fingerprint problem is solved, not hidden.** URL-only comparison for Nuvio is explicitly designed and tested, not a stub that "should work".
6. **Matches codebase style.** Plain objects, `require`, functional factories. No classes, no TypeScript interfaces, no abstract patterns the codebase doesn't use.
7. **Each phase is independently shippable.** Phase 1 (providers) can be merged without any call site changes. Phase 3 (fingerprint) is a 5-line diff. Phase 4 is mechanical substitution.
