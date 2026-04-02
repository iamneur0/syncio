# Nuvio Integration — Implementation Plan

## Design Principles

1. **Per-user provider** — Each user is either `stremio` or `nuvio`. Both coexist in the same Syncio instance, same groups, same addon sets.
2. **Provider abstraction at the transport layer** — The sync engine works with a universal addon shape. Providers translate to/from their native format.
3. **No breaking changes to existing Stremio users** — The refactor wraps existing code, doesn't rewrite it.
4. **Test before refactor** — Critical paths get integration tests before any code moves.

---

## Phase 0: Safety Net

Before touching any implementation code, establish the quality infrastructure that's currently missing.

### 0.1 — Integration Tests for Critical Sync Path

Install Jest. Write tests that cover the exact functions we're about to refactor:

```
server/__tests__/
  providers/
    stremio.test.js      # Wraps existing StremioAPIClient calls, verifies shape
    nuvio.test.js         # Tests Nuvio provider against mock Supabase responses
  sync/
    computePlan.test.js   # Tests computeUserSyncPlan with mock provider data
    getUserAddons.test.js # Tests getUserAddons with mock API client
    syncUserAddons.test.js# Tests full sync flow with mock provider
  auth/
    stremioAuth.test.js   # Tests validateStremioAuthKey with mock responses
    nuvioAuth.test.js     # Tests Nuvio login/refresh with mock Supabase
```

What to test:
- `getUserAddons()` returns correct shape from mock Stremio response
- `getDesiredAddons()` correctly merges group addons + protected addons
- `computeUserSyncPlan()` detects synced vs out-of-sync correctly
- Provider factory returns correct provider based on `user.providerType`
- Nuvio provider transforms Supabase rows to universal addon shape
- Nuvio provider transforms universal addon shape to Supabase rows
- Auth validation works for both providers

### 0.2 — ESLint Configuration

Create `.eslintrc.json` at root:
- Extend `eslint:recommended`
- Set `env: { node: true, es2022: true }`
- Add `no-unused-vars: warn`, `no-undef: error`
- Client already has `eslint-config-next`

Run `npm run lint`, fix any errors that would mask real bugs during refactor.

### 0.3 — CLAUDE.md

Create project-level development guide:
- How to run tests (`npm test`)
- How to lint (`npm run lint`)
- Provider abstraction pattern (how to add a provider)
- Universal addon shape definition
- Encryption/decryption pattern for credentials

---

## Phase 1: Provider Abstraction Layer

The core architectural change. Create the provider interface and wrap existing Stremio code behind it without changing any behavior.

### 1.1 — Define the Universal Addon Shape

This is what flows through the sync engine. Both providers translate to/from this shape.

```javascript
// server/providers/types.js

/**
 * Universal addon shape used by the sync engine.
 * Matches Stremio's native format (which is the existing internal format).
 * Nuvio provider translates to/from this shape.
 */
const ADDON_SHAPE = {
  transportUrl: 'string',     // Manifest URL
  transportName: 'string',    // Usually ""
  manifest: {
    id: 'string',             // e.g. "com.example.addon"
    name: 'string',
    version: 'string',
    description: 'string',
    // ... other manifest fields pass through
  }
}
```

Decision: Use Stremio's native shape as the universal shape. This means zero changes to the sync engine, group addon logic, addon DB, or any comparison/filtering code. The Nuvio provider is the only thing that translates.

### 1.2 — Create Provider Interface

```
server/providers/
  index.js          # Factory: getProvider(user, deps) → provider instance
  stremio.js        # Wraps existing StremioAPIClient calls
  nuvio.js          # Supabase REST implementation
```

**`server/providers/index.js`** — Factory function:

```javascript
function getProvider(user, { decrypt, req }) {
  const type = user.providerType || 'stremio'
  if (type === 'nuvio') return createNuvioProvider(user, { decrypt, req })
  return createStremioProvider(user, { decrypt, req })
}
```

**Provider interface** (both must implement):

```javascript
{
  // Addon operations
  async getAddons()                    // → { addons: UniversalAddon[] }
  async setAddons(addons)              // → void (full replace)
  async addAddon(url, manifest)        // → void (single add)
  async clearAddons()                  // → void

  // Library operations (read-only for now)
  async getLibrary()                   // → LibraryItem[]
  async getWatchedItems(page, size)    // → WatchedItem[]
  async getWatchProgress()             // → WatchProgress[]

  // Likes (Stremio-only, NOOP for Nuvio)
  async getLikeStatus(mediaId, type)   // → status | null
  async setLikeStatus(mediaId, type, status) // → void | null

  // Auth (static methods on the module, not instance methods)
  // validateAuth(credentials) → { user, tokens }
  // refreshAuth(refreshToken) → { accessToken, refreshToken }
}
```

### 1.3 — Stremio Provider

Wraps existing `StremioAPIClient` calls. Minimal code — mostly delegates:

```javascript
function createStremioProvider(user, { decrypt, req }) {
  const authKeyPlain = decrypt(user.stremioAuthKey, req)
  const apiClient = new StremioAPIClient({
    endpoint: 'https://api.strem.io',
    authKey: authKeyPlain
  })

  return {
    async getAddons() {
      const collection = await apiClient.request('addonCollectionGet', {})
      // ... existing normalization logic from sync.js:14-62
      return { addons: normalized }
    },
    async setAddons(addons) {
      await apiClient.request('addonCollectionSet', { addons })
    },
    async addAddon(url, manifest) {
      await apiClient.request('addonCollectionAdd', { addonId: url, manifest })
    },
    async clearAddons() {
      await apiClient.request('addonCollectionSet', { addons: [] })
    },
    async getLibrary() {
      const items = await apiClient.request('datastoreGet', {
        collection: 'libraryItem', ids: [], all: true
      })
      return items
    },
    // ... etc
  }
}
```

### 1.4 — Nuvio Provider

Translates between Supabase REST and the universal addon shape:

```javascript
function createNuvioProvider(user, { decrypt, req }) {
  const refreshToken = decrypt(user.nuvioRefreshToken, req)
  const nuvioUserId = user.nuvioUserId
  // Get fresh JWT (refresh if needed)
  let accessToken = null

  async function ensureAuth() {
    if (accessToken && !isExpired(accessToken)) return
    const result = await refreshNuvioToken(refreshToken)
    accessToken = result.access_token
    // Optionally update stored refresh token if rotated
  }

  return {
    async getAddons() {
      await ensureAuth()
      // GET /rest/v1/addons?user_id=eq.{id}&profile_id=eq.1&order=sort_order.asc
      const rows = await supabaseGet('/rest/v1/addons', {
        user_id: `eq.${nuvioUserId}`,
        profile_id: 'eq.1',
        order: 'sort_order.asc,created_at.asc',
        select: '*'
      }, accessToken)

      // Transform to universal shape
      const addons = await Promise.all(rows.map(async (row) => {
        // Fetch manifest from URL (or cache)
        const manifest = await fetchManifest(row.url)
        return {
          transportUrl: row.url,
          transportName: '',
          manifest: {
            ...manifest,
            name: row.name || manifest?.name || 'Unknown'
          }
        }
      }))
      return { addons }
    },

    async setAddons(addons) {
      await ensureAuth()
      // DELETE all current addons
      await supabaseDelete('/rest/v1/addons', {
        user_id: `eq.${nuvioUserId}`,
        profile_id: 'eq.1'
      }, accessToken)
      // INSERT desired addons
      if (addons.length > 0) {
        const rows = addons.map((addon, i) => ({
          user_id: nuvioUserId,
          profile_id: 1,
          url: addon.transportUrl,
          name: '', // Let Nuvio resolve from manifest
          enabled: true,
          sort_order: i
        }))
        await supabasePost('/rest/v1/addons', rows, accessToken)
      }
    },

    async addAddon(url, manifest) {
      await ensureAuth()
      const currentAddons = await this.getAddons()
      const maxOrder = Math.max(0, ...currentAddons.addons.map(a => a.sort_order || 0))
      await supabasePost('/rest/v1/addons', [{
        user_id: nuvioUserId,
        profile_id: 1,
        url: url,
        name: '',
        enabled: true,
        sort_order: maxOrder + 1
      }], accessToken)
    },

    async clearAddons() {
      await ensureAuth()
      await supabaseDelete('/rest/v1/addons', {
        user_id: `eq.${nuvioUserId}`,
        profile_id: 'eq.1'
      }, accessToken)
    },

    // Library reads — translate Nuvio watch data to Stremio libraryItem shape
    async getLibrary() { /* ... sync_pull_library + sync_pull_watch_progress → libraryItem shape */ },
    async getWatchedItems(page, size) { /* ... sync_pull_watched_items */ },
    async getWatchProgress() { /* ... sync_pull_watch_progress */ },

    // Likes — NOOP
    async getLikeStatus() { return null },
    async setLikeStatus() { return null },
  }
}
```

**Key design decision:** `getAddons()` must fetch manifests to build the universal shape. This adds latency for Nuvio users. Mitigation: cache manifests in Syncio's addon DB (they're already stored there for Syncio's own addon records).

---

## Phase 2: Schema Migration

### 2.1 — Add Provider Fields to User Model

Both Prisma schemas (sqlite + postgres):

```prisma
model User {
  // Existing (keep as-is for backward compat)
  stremioAuthKey     String?

  // New
  providerType       String    @default("stremio")  // "stremio" | "nuvio"
  nuvioRefreshToken  String?   // Encrypted Supabase refresh token
  nuvioUserId        String?   // Nuvio/Supabase user UUID
}
```

### 2.2 — Migration

Generate and apply Prisma migration. Existing users get `providerType: "stremio"` by default. Zero disruption.

---

## Phase 3: Server Refactor — Swap Direct Calls for Provider

This is the bulk of the work. Replace ~120 direct `StremioAPIClient` usages with provider calls.

### 3.1 — Core Sync Utilities

**`server/utils/sync.js`** — `getUserAddons()`:

```diff
- async function getUserAddons(user, req, { decrypt, StremioAPIClient }) {
-   if (!user.stremioAuthKey) {
-     return { success: false, addons: [], error: 'User not connected to Stremio' }
-   }
-   const authKeyPlain = decrypt(user.stremioAuthKey, req)
-   const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
-   const collection = await apiClient.request('addonCollectionGet', {})
-   // ... 50 lines of normalization ...
+ async function getUserAddons(user, req, { decrypt, getProvider }) {
+   const provider = getProvider(user, { decrypt, req })
+   if (!provider) {
+     return { success: false, addons: [], error: 'User not connected to a provider' }
+   }
+   const collection = await provider.getAddons()
+   // Normalization already done inside provider
```

The normalization logic moves INTO `stremioProvider.getAddons()` so it's encapsulated.

**`server/utils/addonHelpers.js`** — `clearAddons()`:

```diff
- async function clearAddons(apiClient) {
-   await apiClient.request('addonCollectionSet', { addons: [] })
- }
+ async function clearAddons(provider) {
+   await provider.clearAddons()
+ }
```

### 3.2 — User Routes (the biggest file)

Pattern for each endpoint that uses StremioAPIClient:

```diff
  // Before: 
  const authKeyPlain = decrypt(user.stremioAuthKey, req)
  const apiClient = new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey: authKeyPlain })
  const collection = await apiClient.request('addonCollectionGet', {})

  // After:
  const provider = getProvider(user, { decrypt, req })
  const collection = await provider.getAddons()
```

Apply this pattern to all ~11 sites in `users.js`. The sync, remove, reorder, clear operations all follow the same substitution.

**Special case — `addonCollectionAdd` (line 1952):**
```diff
- await apiClient.request('addonCollectionAdd', { addonId: addonUrl, manifest })
+ await provider.addAddon(addonUrl, manifest)
```

**Special case — Likes (lines 2183, 2247):**
```diff
  // Before:
  const resp = await fetch(`https://likes.stremio.com/api/get_status?authToken=${authKey}&...`)

  // After:
  const status = await provider.getLikeStatus(mediaId, mediaType)
  if (status === null) return res.json({ status: null }) // Nuvio NOOP
```

### 3.3 — Library Operations

**`server/utils/libraryToggle.js`**, **`server/utils/libraryDelete.js`**:

```diff
- const apiClient = new StremioAPIClient(...)
- const items = await apiClient.request('datastoreGet', { collection: 'libraryItem', ... })
+ const provider = getProvider(user, { decrypt, req })
+ const items = await provider.getLibrary()
```

For `datastorePut` (library writes): Nuvio provider returns NOOP. Stremio provider calls `datastorePut` as before.

### 3.4 — Activity Monitor & Metrics

**`server/utils/activityMonitor.js`** — Polls all active users' libraries:

```diff
- const users = await prisma.user.findMany({ where: { stremioAuthKey: { not: null } } })
+ const users = await prisma.user.findMany({ where: {
+   OR: [
+     { stremioAuthKey: { not: null } },
+     { nuvioRefreshToken: { not: null } }
+   ]
+ }})
  // Then for each user:
- const apiClient = new StremioAPIClient(...)
- const items = await apiClient.request('datastoreGet', ...)
+ const provider = getProvider(user, { decrypt, mockReq })
+ const items = await provider.getLibrary()
```

### 3.5 — User Expiration

**`server/utils/userExpiration.js`**:

```diff
- const apiClient = new StremioAPIClient(...)
- await clearAddons(apiClient)
+ const provider = getProvider(user, { decrypt, mockReq })
+ await provider.clearAddons()
```

### 3.6 — Dependency Injection (server/index.js)

```diff
  // Before: passes StremioAPIClient to routers
  const usersRouter = require('./routes/users')({
    prisma, ..., StremioAPIClient
  })

  // After: passes getProvider factory
  const { getProvider } = require('./providers')
  const usersRouter = require('./routes/users')({
    prisma, ..., getProvider
  })
```

---

## Phase 4: Nuvio Auth Routes

### 4.1 — Server Auth Utilities

**`server/utils/nuvio.js`**:

```javascript
const SUPABASE_URL = 'https://dpyhjjcoabcglfmgecug.supabase.co'
const SUPABASE_ANON_KEY = '...'

async function validateNuvioCredentials(email, password) {
  // POST /auth/v1/token?grant_type=password
  // Returns: { access_token, refresh_token, user: { id, email } }
}

async function refreshNuvioToken(refreshToken) {
  // POST /auth/v1/token?grant_type=refresh_token
  // Returns: { access_token, refresh_token }
}

async function getNuvioUser(accessToken) {
  // Decode JWT or GET /auth/v1/user
  // Returns: { id, email }
}
```

### 4.2 — Nuvio Auth Route

**`server/routes/nuvio.js`** (parallel to `stremio.js`):

- `POST /api/nuvio/validate` — Validate Nuvio email+password
- `POST /api/nuvio/connect` — Connect user to Nuvio (stores encrypted refresh token + userId)

### 4.3 — Invitation Flow Changes

**`server/routes/invitations.js`**:

The invite flow needs a `providerType` field on the invitation or request:

- Step 4 (`generate-oauth`): If `providerType === 'nuvio'`, skip OAuth link generation. Return a flag telling the client to show email/password form instead.
- Step 5 (`complete`): If `providerType === 'nuvio'`, accept `{ email, username, nuvioPassword }` instead of `{ authKey }`. Call `validateNuvioCredentials()`, verify email match, store encrypted refresh token.

---

## Phase 5: Client Changes

### 5.1 — New Component: NuvioLoginCard

Simple email/password form. Used wherever `StremioOAuthCard` is used, conditionally rendered based on provider type.

```tsx
function NuvioLoginCard({ onAuth, disabled }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Submit → call backend /api/nuvio/validate → onAuth({ email, refreshToken, userId })
}
```

### 5.2 — Provider-Aware Components

For each component that currently shows `StremioOAuthCard` or "Stremio" text:

```tsx
// Pattern:
const providerLabel = user?.providerType === 'nuvio' ? 'Nuvio' : 'Stremio'

// In JSX:
{providerType === 'stremio' ? (
  <StremioOAuthCard onAuthKey={handleAuth} />
) : (
  <NuvioLoginCard onAuth={handleAuth} />
)}

// For labels:
<button>{`Sign in with ${providerLabel}`}</button>
```

Apply to: `LoginPage`, `UserAddModal`, `AccountMenuButton`, invite pages, `UserDetailModal`, `GenericEntityPage`, `GroupDetailModal`.

### 5.3 — UserAddModal Provider Selector

Add a Stremio/Nuvio toggle at the top of the user creation form:

```tsx
<div>
  <button onClick={() => setProviderType('stremio')} active={providerType === 'stremio'}>Stremio</button>
  <button onClick={() => setProviderType('nuvio')} active={providerType === 'nuvio'}>Nuvio</button>
</div>

{providerType === 'stremio' ? (
  // Existing OAuth + credentials form
) : (
  // Nuvio email/password form
)}
```

### 5.4 — API Service Updates

**`client/src/services/api.ts`**:

```typescript
export const nuvioAPI = {
  validate: (data: { email: string; password: string }) =>
    api.post('/nuvio/validate', data),
  connect: (userId: string, data: { email: string; password: string }) =>
    api.post('/nuvio/connect', { userId, ...data }),
}
```

Update `usersAPI.create()` to pass `providerType` in the request body.

### 5.5 — Invite Page

The invite page needs to know the provider type. Options:
- Admin selects provider type when creating the invitation
- OR the invite page lets the user choose (Stremio OAuth vs Nuvio login)

Recommended: Let the user choose on the invite page. Simpler for admins, more flexible.

---

## Phase 6: Backend Route Naming

Two approaches:

**Option A (recommended): Generic routes with provider parameter**
```
POST /api/users/:id/provider-addons       # replaces /stremio-addons
DELETE /api/users/:id/provider-addons/:name
POST /api/users/:id/provider-addons/clear
POST /api/users/:id/provider-addons/reorder
```
The route handler reads `user.providerType` from DB and dispatches to the correct provider. No route duplication.

Keep old `/stremio-addons` routes as aliases for backward compatibility (or remove if no external consumers).

**Option B: Parallel routes**
```
/api/users/:id/stremio-addons/...  (existing)
/api/users/:id/nuvio-addons/...    (new)
```
More duplication, but zero risk to existing clients.

---

## Phase 7: Default Addon Filtering

`filterDefaultAddons()` in `server/utils/stremio.js` hardcodes Stremio defaults (Cinemeta, Local Files). Make it provider-aware:

```javascript
function filterDefaultAddons(addons, providerType, unsafeMode) {
  if (unsafeMode) return addons

  const defaults = providerType === 'nuvio'
    ? { names: [], ids: [], manifestUrls: [] }  // Nuvio has no known defaults yet
    : {
        names: ['Cinemeta', 'Local Files'],
        ids: ['com.linvo.cinemeta', 'org.stremio.local'],
        manifestUrls: ['http://127.0.0.1:11470/local-addon/manifest.json', 'https://v3-cinemeta.strem.io/manifest.json']
      }

  return addons.filter(addon => { /* existing filter logic */ })
}
```

---

## Implementation Order

```
Phase 0  [Safety]     Tests + ESLint + CLAUDE.md
  ↓
Phase 1  [Core]       Provider abstraction (index.js, stremio.js, nuvio.js)
  ↓
Phase 2  [Schema]     Prisma migration (providerType, nuvioRefreshToken, nuvioUserId)
  ↓
Phase 3  [Refactor]   Server swap (~120 call sites)
  ├── 3.1  Sync utilities (sync.js, addonHelpers.js)
  ├── 3.2  User routes (users.js — biggest chunk)
  ├── 3.3  Library operations (libraryToggle.js, libraryDelete.js)
  ├── 3.4  Activity monitor + metrics
  ├── 3.5  User expiration
  └── 3.6  Dependency injection (index.js)
  ↓
Phase 4  [Auth]       Nuvio auth routes + invitation flow
  ↓
Phase 5  [Client]     NuvioLoginCard + provider-aware components (~80 sites)
  ↓
Phase 6  [Routes]     Rename/alias backend route names
  ↓
Phase 7  [Polish]     Default addon filtering, edge cases, final test pass
```

Each phase should be a separate commit (or set of commits). Tests from Phase 0 should pass after each phase — if they break, stop and fix before continuing.

---

## Risk Mitigations

| Risk | Mitigation |
|---|---|
| Breaking existing Stremio users | Phase 0 tests cover Stremio path. `providerType` defaults to `"stremio"`. All existing code paths unchanged unless provider is `"nuvio"`. |
| Nuvio manifest fetch latency | Cache manifests in Syncio's addon DB (already stored there). Only fetch on first encounter or reload. |
| JWT expiry mid-operation | `ensureAuth()` called at start of every provider method. Refresh token stored encrypted, rotated on each refresh. |
| Supabase rate limiting | Queue Nuvio API calls. Max 1 concurrent request per user. |
| `get_sync_owner` conflict | Check sync ownership on Nuvio user connection. Warn if user is managed by another Nuvio account. |
| Stremio `addonCollectionSet` atomicity vs Nuvio DELETE+INSERT | Wrap Nuvio operations in a try/catch. If INSERT fails after DELETE, retry or restore from Syncio's known-good state. |
