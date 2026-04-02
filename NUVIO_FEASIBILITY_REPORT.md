# Nuvio Integration Feasibility Report

## Executive Summary

**Verdict: Feasible and cleanly achievable.**

Adding Nuvio as a sync target alongside Stremio is a medium-effort refactor. Syncio's Stremio API surface covers **4 major areas**: addon management, library/watch history, likes/favorites, and auth. All have Nuvio equivalents via Supabase REST, though library write operations and likes still need reverse-engineering.

---

## 1. Syncio Architecture Overview

### Tech Stack
- **Backend:** Node.js + Express.js
- **Frontend:** Next.js 15 + React 19, TailwindCSS, React Query (TanStack)
- **Database:** Prisma ORM with SQLite (private) or PostgreSQL (public)
- **Stremio client:** `stremio-api-client` npm package

### Directory Layout
```
server/
  routes/         # Express route handlers (addons, users, groups, stremio, etc.)
  middleware/     # Auth, validation, error handling
  utils/          # Sync engine, encryption, Stremio helpers, activity monitor, metrics
client/
  src/services/   # Centralized API layer (api.ts - single file, 1200+ lines)
  src/components/ # React components (auth, modals, pages, entities)
  src/hooks/      # React Query hooks, auth state, sync status
prisma/           # Schema definitions (sqlite + postgres variants)
```

---

## 2. Complete Stremio API Surface in Syncio

Syncio uses **6 distinct Stremio API operations** plus 3 external metadata APIs:

### 2.1 Addon Management

| Operation | Stremio API | Call Sites |
|---|---|---|
| Read addon collection | `addonCollectionGet` | `sync.js:14`, `users.js:~115,1376,2800,3456`, `publicLibrary.js:~848,1098`, `debug.js:73`, `invitations.js:610` |
| Write addon collection | `addonCollectionSet` | `users.js:~2815,3169,4560`, `addonHelpers.js:45,54`, `publicLibrary.js:~881,1479,1492` |
| Add single addon | `addonCollectionAdd` | `users.js:1952` |

### 2.2 Library & Watch History

| Operation | Stremio API | Call Sites |
|---|---|---|
| Read library items | `datastoreGet` collection=`libraryItem` | `publicLibrary.js:567-573`, `users.js:2050-2056,2342-2354,2489-2495,2563-2570`, `libraryToggle.js:38-51`, `libraryDelete.js:30-51`, `activityMonitor.js:106-112,158-164`, `metricsBuilder.js:314-324` |
| Write library items | `datastorePut` collection=`libraryItem` | `libraryToggle.js:189-191`, `libraryDelete.js:72-74` |

**Data tracked per library item:**
- `name`, `type`, `poster`, `posterShape`
- `state.timeWatched`, `state.overallTimeWatched`, `state.timeOffset` (resume position)
- `state.lastWatched`, `state.video_id`, `state.season`, `state.episode`
- `_mtime` (modification timestamp — used for activity detection)

### 2.3 Likes/Favorites

| Operation | External API | Call Sites |
|---|---|---|
| Get like status | `GET https://likes.stremio.com/api/get_status?authToken={}&mediaId={}&mediaType={}` | `users.js:2183-2206` |
| Set like status | `POST https://likes.stremio.com/api/send` body: `{authToken, mediaId, mediaType, status}` | `users.js:2247-2275` |

### 2.4 Auth & User Validation

| Operation | Stremio API | Call Sites |
|---|---|---|
| Login | `StremioAPIStore.login(email, password)` | `stremio.js:~30-34` |
| Register | `StremioAPIStore.register(email, password)` | `stremio.js` |
| Get user | `StremioAPIClient.request('getUser')` | `stremio.js:12` |
| Validate auth key | `validateStremioAuthKey()` / `pullUser` fallback | `stremio.js:7-61`, `invitations.js:1017`, `publicLibrary.js:14-130` |
| OAuth create link | `fetch('https://link.stremio.com/api/v2/create')` | `invitations.js:876`, `publicLibrary.js:149-173` |
| OAuth poll for token | `fetch('https://link.stremio.com/api/v2/read')` | `invitations.js (client-side)`, `publicLibrary.js:176-200` |
| Invite completion (identity) | `validateStremioAuthKey(authKey)` → extract email → match | `invitations.js:930-1300` |
| User login (identity) | `validateStremioAuthKey(authKey)` → extract email → lookup | `publicLibrary.js:202-268` |
| Admin Stremio login | `validateStremioAuthKey(authKey)` → link account | `publicAuth.js:271-535` |

### 2.5 Activity Monitoring (reads library, enriches with metadata)

| Operation | External API | Call Sites |
|---|---|---|
| Detect new watches | Polls `datastoreGet` every 5 minutes, compares `_mtime` | `activityMonitor.js:106-112,158-164` |
| Movie/series metadata | `GET https://cinemeta-live.strem.io/meta/{movie|series}/{id}.json` | `activityMonitor.js:445-546` |
| Anime metadata | `GET https://kitsu.app/api/edge/anime/{id}` | `activityMonitor.js:319-364` |
| Discord notifications | Webhook POST to user's/account's Discord URL | `activityMonitor.js:762-875` |

### 2.6 Features That Are Already Provider-Agnostic

| Feature | Storage | Notes |
|---|---|---|
| Shares | JSON files on disk (`/data/shares/`) | No external API — works for any provider |
| Backup | Internal config export | Reads from Syncio DB only |
| Metrics/stats | `WatchActivity` + `WatchSnapshot` DB tables | Computed from locally-stored activity data |
| Groups & user management | Syncio DB (Prisma) | Fully generic |
| Discord notifications | Webhook URLs in DB | Generic — sends metadata from any source |

---

## 3. Nuvio API — Complete Mapping

### Constants

```
Supabase URL:  https://dpyhjjcoabcglfmgecug.supabase.co
Nuvio App URL: https://nuvioapp.space
Anon API Key:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRweWhqamNvYWJjZ2xmbWdlY3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODYyNDcsImV4cCI6MjA4NjM2MjI0N30.U-3QSNDdpsnvRk_7ZL419AFTOtggHJJcmkodxeXjbkg
```

### Required Headers (all Supabase requests)

```
apikey: <anon key above>
authorization: Bearer <user JWT>
content-type: application/json
```

### 3.1 Authentication (CONFIRMED)

**Login (email/password):**
```
POST /auth/v1/token?grant_type=password
Body: {"email": "...", "password": "..."}
Response: {
  "access_token": "<JWT, 60 min TTL>",
  "refresh_token": "<short opaque token>",
  "expires_in": 3600,
  "expires_at": <unix timestamp>,
  "user": { "id": "<uuid>", "email": "...", ... }
}
```

**Refresh token:**
```
POST /auth/v1/token?grant_type=refresh_token
Body: {"refresh_token": "..."}
Response: (same shape as login — new access_token + new refresh_token)
```

**Logout:**
```
POST /auth/v1/logout
Headers: authorization: Bearer <JWT>
Body: (empty)
```

**Token lifecycle:**
- Access token: **60-minute TTL** (confirmed from JWT `exp - iat`)
- Refresh token: long-lived (Supabase default)
- Strategy: store encrypted refresh token, get fresh JWT before each operation

### 3.2 Addon Operations (ALL CONFIRMED)

**List addons:**
```
GET /rest/v1/addons?select=*&user_id=eq.<uuid>&profile_id=eq.1&order=sort_order.asc,created_at.asc
Response: [{ "id": "uuid", "user_id": "uuid", "profile_id": 1, "url": "https://...", "name": "...", "enabled": true, "sort_order": 0 }, ...]
```

**Add addon(s):**
```
POST /rest/v1/addons
Headers: prefer: return=representation
Body: [{"user_id": "...", "profile_id": 1, "url": "<manifest_url>", "name": "" (optional override), "enabled": true, "sort_order": <int>}]
```

**Update addon (reorder / toggle enabled):**
```
PATCH /rest/v1/addons?id=eq.<addon_uuid>&profile_id=eq.1
Headers: prefer: return=representation
Body: {"sort_order": <int>} OR {"enabled": false} OR both
```

**Delete addon:**
```
DELETE /rest/v1/addons?id=eq.<addon_uuid>&profile_id=eq.1
```

**Clear all addons (inferred):**
```
DELETE /rest/v1/addons?user_id=eq.<uuid>&profile_id=eq.1
```

**Get addon manifest metadata:**
```
GET https://nuvioapp.space/api/addons/manifest-meta?url=<encoded_manifest_url>
(No auth required)
```

### 3.3 Library & Watch History (CONFIRMED)

**Read library (bookmarks/saved items):**
```
POST /rest/v1/rpc/sync_pull_library
Body: {"p_profile_id": 1}
Response: [] (empty for test user — library = saved/bookmarked items, separate from watch history)
```

**Read watched items (paginated) — PRIMARY activity source:**
```
POST /rest/v1/rpc/sync_pull_watched_items
Body: {"p_page": 1, "p_page_size": 50, "p_profile_id": 1}
Response: [
  {
    "id": "uuid",
    "user_id": "uuid",
    "content_id": "tt14824792",        // IMDb ID
    "content_type": "series",           // "movie" or "series"
    "title": "ted",                     // Human-readable title (Stremio lacks this)
    "season": 1,                        // null for movies
    "episode": 4,                       // null for movies
    "watched_at": 1775044288655,        // Unix ms — equivalent to Stremio _mtime
    "created_at": "2026-04-01T...",     // Row creation timestamp
    "profile_id": 1
  }, ...
]
```

**Read watch progress (resume positions):**
```
POST /rest/v1/rpc/sync_pull_watch_progress
Body: {"p_profile_id": 1}
Response: [
  {
    "id": "uuid",
    "user_id": "uuid",
    "content_id": "tt14824792",         // IMDb ID
    "content_type": "series",
    "video_id": "tt14824792:1:4",       // SAME format as Stremio state.video_id
    "season": 1,
    "episode": 4,
    "position": 2280000,               // ms — equivalent to Stremio state.timeOffset
    "duration": 2280000,               // ms — total duration (Stremio lacks this)
    "last_watched": 1775044288640,     // Unix ms
    "progress_key": "tt14824792_s1e4", // Nuvio convenience key
    "profile_id": 1
  }, ...
]
```

**Resolve watch metadata (enrich with poster/title from addons):**
```
POST https://nuvioapp.space/api/addons/resolve-watch-metadata
Body: {
  "items": [{"progress_key": "tt14824792_s1e4", "content_id": "tt14824792", "content_type": "series"}, ...],
  "addons": [<user's addon list>]
}
(No Supabase auth required — Nuvio app endpoint. Equivalent to Syncio's Cinemeta enrichment.)
```

**Write library items:** NOOP for now (per decision). Will be needed later for library sync feature.

### 3.4 Profiles (CONFIRMED)

**List profiles:**
```
POST /rest/v1/rpc/sync_pull_profiles
Body: {}
Response: [
  {
    "id": "uuid",
    "user_id": "uuid",
    "profile_index": 1,                // This is what profile_id maps to in queries
    "name": "Rory",
    "avatar_color_hex": "#A80808",
    "uses_primary_addons": false,       // If true, inherits addons from primary profile
    "uses_primary_plugins": false,
    "avatar_id": "avatar_dexter",
    "pin_enabled": false,
    "pin_locked_until": null,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

**Profile locks:**
```
POST /rest/v1/rpc/sync_pull_profile_locks
Body: {}
Response: [{"profile_index": 1, "pin_enabled": false, "pin_locked_until": null}]
```

### 3.5 Sync Ownership (CONFIRMED — no blocker)

**Check sync owner:**
```
POST /rest/v1/rpc/get_sync_owner
Body: {}
Response: "9f7d49dc-97be-4869-a645-13d2dca86f7b"  (returns the user's own UUID)
```

Returns the user's own ID when they own their own sync. This means Syncio writing to addon collections won't conflict with Nuvio's sync ownership model. If a user were managed by another Nuvio account, this would return a different UUID — Syncio should check this and warn before overwriting.

### 3.6 Likes/Favorites

**No Nuvio equivalent.** Stremio uses a separate `likes.stremio.com` service. Nuvio does not have this feature. Known feature gap — likes operations will NOOP for Nuvio users.

---

## 4. Operation-by-Operation Feasibility

### Addon Sync (FULLY MAPPED)

| Syncio Function | Stremio Approach | Nuvio Equivalent | Status |
|---|---|---|---|
| Get user's current addons | `addonCollectionGet` → full manifest array | `GET /rest/v1/addons` → URL + metadata rows | **CONFIRMED** |
| Set user's desired addons (sync) | `addonCollectionSet` → atomic replacement | DELETE all + POST desired set | **CONFIRMED** |
| Add single addon | Read → append → write back | `POST /rest/v1/addons` | **CONFIRMED** |
| Remove single addon | Read → filter → write back | `DELETE /rest/v1/addons?id=eq.<id>` | **CONFIRMED** |
| Reorder addons | Read → reorder → write back | `PATCH` each addon's `sort_order` | **CONFIRMED** |
| Clear all addons | `addonCollectionSet({addons: []})` | `DELETE ...?user_id=eq.<id>&profile_id=eq.1` | **INFERRED** |
| Enable/disable addon | N/A (Stremio lacks this) | `PATCH` with `{"enabled": false}` | **NUVIO RICHER** |

### Library & Watch History

| Syncio Function | Stremio Approach | Nuvio Equivalent | Status |
|---|---|---|---|
| Read full library | `datastoreGet` collection=libraryItem | `rpc/sync_pull_library` | **CONFIRMED** (empty for test user — bookmarks/saved items) |
| Read watch history | Filter library by `_mtime`/`lastWatched` | `rpc/sync_pull_watched_items` (paginated) | **CONFIRMED** — includes title, IMDb ID, season/episode, timestamp |
| Read watch progress | `libraryItem.state.timeOffset` | `rpc/sync_pull_watch_progress` | **CONFIRMED** — position/duration in ms, same video_id format |
| Activity detection | Poll library, compare `_mtime` | Poll `sync_pull_watched_items`, compare `watched_at` | **MAPS CLEANLY** — `watched_at` is equivalent to Stremio's `_mtime` |
| Metadata enrichment | Cinemeta (`cinemeta-live.strem.io`) | `nuvioapp.space/api/addons/resolve-watch-metadata` | **CONFIRMED** — takes IMDb IDs + addon list, returns enriched metadata |
| Add to library | `datastorePut` with item data | **NOOP for now** | Deferred — will need reverse-engineering later |
| Remove from library | `datastorePut` with `removed: true` | **NOOP for now** | Deferred |

#### Watch Progress Field Mapping (Stremio → Nuvio)

| Stremio (`libraryItem`) | Nuvio (`watch_progress`) | Notes |
|---|---|---|
| `_id` | `content_id` | IMDb ID (e.g. `tt14824792`) |
| `type` | `content_type` | `movie` or `series` |
| `state.video_id` | `video_id` | Same format: `tt14824792:1:4` |
| `state.season` | `season` | Direct match (null for movies) |
| `state.episode` | `episode` | Direct match (null for movies) |
| `state.timeOffset` | `position` | Milliseconds — direct match |
| `state.timeWatched` | `duration` | Nuvio tracks total duration (Stremio doesn't) |
| `state.lastWatched` / `_mtime` | `last_watched` | Unix timestamp in ms — direct match |
| `name` | (via `watched_items.title`) | Nuvio includes title in watched items, not progress |
| `poster` | (via `resolve-watch-metadata`) | Enrichment needed separately |

### Likes/Favorites

| Syncio Function | Stremio Approach | Nuvio Equivalent | Status |
|---|---|---|---|
| Get like status | `GET likes.stremio.com/api/get_status` | N/A | **NO NUVIO EQUIVALENT** — NOOP |
| Set like/love | `POST likes.stremio.com/api/send` | N/A | **NO NUVIO EQUIVALENT** — NOOP |

### Auth & User Lifecycle

| Syncio Function | Stremio Approach | Nuvio Equivalent | Status |
|---|---|---|---|
| Validate credentials | `StremioAPIStore.login()` | `POST /auth/v1/token?grant_type=password` | **CONFIRMED** |
| Store auth | Encrypt authKey (long-lived) | Encrypt refresh_token + user_id | **CONFIRMED** |
| Re-auth before sync | Use authKey directly | `POST /auth/v1/token?grant_type=refresh_token` | **CONFIRMED** |
| Get user info | `client.request('getUser')` | JWT payload or `GET /auth/v1/user` | **CONFIRMED** |
| OAuth flow (invite) | `link.stremio.com/api/v2/create` → poll `read` → get authKey | N/A | **REPLACED** — email/password form |
| OAuth flow (user login) | `validateStremioAuthKey(authKey)` → lookup by email | `POST /auth/v1/token` → lookup by email | **CONFIRMED** — same email-based identity |
| OAuth flow (admin login) | Stremio OAuth to link admin account | N/A for Nuvio users | UUID/password admin auth still works |
| Email identity matching | Stremio email = Syncio email (exact match) | Nuvio email = Syncio email (exact match) | **SAME PATTERN** |

### Invitation Flow

| Step | Stremio Approach | Nuvio Equivalent | Status |
|---|---|---|---|
| 1. Admin creates invite | Generic (no provider API) | Same | No change |
| 2. User submits email+username | Generic | Same | No change |
| 3. Admin approves | Generic | Same | No change |
| 4. User connects provider | Stremio OAuth: redirect to `link.stremio.com` → user authorizes → poll for authKey | Nuvio login: user enters existing Nuvio email+password → `POST /auth/v1/token` → get JWT+refresh_token | **DIFFERENT UX** — form instead of OAuth |
| 5. Complete signup | `validateStremioAuthKey(authKey)` → extract email → verify match → store encrypted authKey | Validate JWT → extract email from token → verify match → store encrypted refresh_token | **SAME PATTERN** different credential type |

**Key insight:** Stremio auth is the **identity layer**, not just a sync credential. The Stremio email is the user's identity in Syncio. For Nuvio, email is also the identity (from Supabase auth), so the matching logic is identical — only the credential type changes (authKey → refresh_token).

### User Login (Post-Signup)

| Step | Stremio | Nuvio |
|---|---|---|
| User visits login page | Clicks "Sign in with Stremio" → OAuth flow → gets authKey | Enters Nuvio email+password → `POST /auth/v1/token` → gets JWT |
| Server validates | `validateStremioAuthKey(authKey)` → extracts email | Decode JWT → extract email from `user.email` |
| Lookup user | `WHERE email = stremioEmail` | `WHERE email = nuvioEmail` |
| Update credentials | Store new authKey (encrypted) | Store new refresh_token (encrypted) |
| Return session | Syncio JWT cookie | Same |

### Features Requiring No External API Changes

| Feature | Why |
|---|---|
| Shares | Stored in Syncio (JSON files), no external API |
| Backup | Internal config export |
| Metrics/stats | Computed from Syncio's `WatchActivity` DB table |
| Groups | Syncio DB only |
| Discord notifications | Generic webhook calls |
| Cinemeta/Kitsu metadata enrichment | Same APIs work regardless of provider — they use IMDb/TMDB IDs |

---

## 5. What Still Needs Reverse-Engineering

### Priority 1 — RESOLVED

All priority 1 items have been captured:
- Watch progress response shape: CONFIRMED (position/duration in ms, same video_id format as Stremio)
- Watched items response shape: CONFIRMED (includes title, IMDb ID, watched_at timestamp)
- `get_sync_owner` response: CONFIRMED (returns own UUID — no conflict with Syncio)
- Likes: CONFIRMED absent — no Nuvio equivalent

### Remaining (Nice to have, non-blocking)

| Operation | How to Capture |
|---|---|
| **Library write (add/remove item)** | Deferred (NOOP for now). Will need capture when library sync is implemented. |
| **Bulk delete confirmation** | Try `DELETE /rest/v1/addons?user_id=eq.<id>&profile_id=eq.1` (no `id` filter). |
| **Token refresh after 24hrs** | Wait a day, then try using the refresh token to get a new JWT. |
| **`uses_primary_addons` behavior** | If a profile has `uses_primary_addons: true`, does writing to its addon list work or is it read-only? |
| **`get_sync_owner` for managed users** | What happens if user is managed by another account? Syncio should check this. |

---

## 6. Data Model Differences

### Addon Shape: Stremio vs Nuvio

```
Stremio addon (in-memory during sync):
{
  transportUrl: "https://addon.example/manifest.json",
  transportName: "",
  manifest: {
    id: "com.example.addon",
    name: "My Addon",
    version: "1.0.0",
    description: "...",
    resources: [...],
    catalogs: [...],
    types: [...]
  }
}

Nuvio addon (Supabase row):
{
  id: "uuid",
  user_id: "uuid",
  profile_id: 1,
  url: "https://addon.example/manifest.json",
  name: "" (optional override — Nuvio resolves from manifest if empty),
  enabled: true,
  sort_order: 0,
  created_at: "2026-..."
}
```

**Key difference:** Stremio carries full manifests inline. Nuvio stores only the URL. Sync comparison for Nuvio would use URL matching (more reliable than manifest fingerprinting).

### Library Item Shape: Stremio

```javascript
// Stremio libraryItem (from datastoreGet)
{
  _id: "tt1234567",           // IMDb ID
  name: "Movie Title",
  type: "movie",              // or "series"
  poster: "https://...",
  posterShape: "poster",
  state: {
    timeWatched: 5400000,     // ms watched
    timeOffset: 3200000,      // resume position (ms)
    overallTimeWatched: 5400000,
    timesWatched: 1,
    lastWatched: "2026-04-01T20:00:00Z",
    video_id: "tt1234567:1:3", // series: imdb:season:episode
    season: 1,
    episode: 3
  },
  _mtime: 1743544800000,     // modification timestamp (ms)
  _ctime: 1743000000000,     // creation timestamp (ms)
  removed: false,            // true = removed from library
  behaviorHints: {
    defaultVideoId: "tt1234567"
  }
}
```

### Library Item Shape: Nuvio (CONFIRMED)

Nuvio splits what Stremio combines into one `libraryItem` into two separate concepts:

**Watch Progress (`sync_pull_watch_progress`):**
```json
{
  "id": "uuid", "user_id": "uuid", "content_id": "tt14824792",
  "content_type": "series", "video_id": "tt14824792:1:4",
  "season": 1, "episode": 4,
  "position": 2280000, "duration": 2280000,
  "last_watched": 1775044288640, "progress_key": "tt14824792_s1e4",
  "profile_id": 1
}
```

**Watched Items (`sync_pull_watched_items`):**
```json
{
  "id": "uuid", "user_id": "uuid", "content_id": "tt14824792",
  "content_type": "series", "title": "ted",
  "season": 1, "episode": 4,
  "watched_at": 1775044288655, "created_at": "2026-04-01T...",
  "profile_id": 1
}
```

**Library (`sync_pull_library`):** Returns `[]` — appears to be for saved/bookmarked items (Nuvio equivalent of Stremio's `removed: false` bookmark list). Separate from watch history.

### User Model Changes Needed

```prisma
model User {
  // Existing
  stremioAuthKey     String?   // Keep for Stremio users

  // New fields for Nuvio
  nuvioRefreshToken  String?   // Encrypted Supabase refresh token
  nuvioUserId        String?   // Nuvio/Supabase user UUID
  providerType       String    @default("stremio")  // "stremio" | "nuvio"
}
```

---

## 7. Implementation Plan (High-Level)

### Phase 1: Provider Abstraction Layer

Create `server/providers/` with a common interface:

```javascript
// Each provider implements:
{
  // Addon operations
  async getAddons(credentials)          // → [{ url, name, manifest?, enabled?, sort_order? }]
  async setAddons(credentials, addons)  // → void (atomic sync)
  async addAddon(credentials, addon)    // → created addon
  async removeAddon(credentials, id)    // → void
  async clearAddons(credentials)        // → void

  // Library operations
  async getLibrary(credentials)         // → [{ id, name, type, poster, state, ... }]
  async getWatchProgress(credentials)   // → [{ id, timeOffset, timeWatched, ... }]
  async getWatchedItems(credentials, page, pageSize) // → paginated watched items
  async addLibraryItem(credentials, item)    // → void
  async removeLibraryItem(credentials, id)   // → void

  // Likes (if supported by provider)
  async getLikeStatus(credentials, mediaId, mediaType)   // → status or null
  async setLikeStatus(credentials, mediaId, mediaType, status) // → void or null

  // Auth
  async validateAuth(loginData)         // → { userId, credentials, userInfo }
  async refreshAuth(credentials)        // → fresh credentials
}
```

**Files:** `server/providers/stremio.js`, `server/providers/nuvio.js`, `server/providers/index.js` (factory)

### Phase 2: Refactor Existing Code

Replace direct `StremioAPIClient` usage with provider calls:
- `server/utils/sync.js` — `getUserAddons()` → `provider.getAddons()`
- `server/utils/addonHelpers.js` — `clearAddons()` → `provider.clearAddons()`
- `server/utils/libraryToggle.js` — library read/write → `provider.getLibrary()` / `provider.addLibraryItem()`
- `server/utils/libraryDelete.js` — library delete → `provider.removeLibraryItem()`
- `server/utils/activityMonitor.js` — library polling → `provider.getLibrary()` or `provider.getWatchedItems()`
- `server/utils/metricsBuilder.js` — library read → `provider.getLibrary()`
- `server/routes/users.js` — ~10+ call sites → use provider factory
- `server/routes/publicLibrary.js` — ~8+ call sites → use provider factory

### Phase 3: Nuvio Provider Implementation

- Implement all provider methods using Supabase REST calls
- Handle JWT refresh transparently (refresh before each operation if token near expiry)
- Map Nuvio's flat addon format to/from Syncio's internal format

### Phase 4: Auth & Schema

- New route: `server/routes/nuvio.js` (parallel to `stremio.js`) — validate Nuvio credentials, extract email
- New util: `server/utils/nuvio.js` — `validateNuvioAuth(email, password)` that calls Supabase login, returns `{ user, refreshToken }`
- Schema migration: Add `nuvioRefreshToken`, `nuvioUserId`, `providerType` to User model
- Refactor `server/routes/invitations.js`:
  - Step 4 (generate-oauth): For Nuvio users, skip OAuth link generation — return a flag indicating email/password auth instead
  - Step 5 (complete): For Nuvio users, accept `{ email, username, nuvioPassword }` instead of `{ authKey }`, call Supabase login to validate, store refresh_token
  - Lines ~876-928 (OAuth create) and ~930-1300 (complete) need provider branching

### Phase 5: Client Updates

- `client/src/services/api.ts` — Add `nuvioAPI` namespace
- `LoginPage.tsx` — Add Nuvio login option (email/password form alongside Stremio OAuth card)
- New component: `NuvioLoginCard.tsx` — simple email/password form (replaces `StremioOAuthCard` for Nuvio users)
- Invite page (`client/src/app/invite/[inviteCode]/`): Add provider toggle — show OAuth card for Stremio, email/password form for Nuvio
- `UserAddModal.tsx` — Provider type selector when creating users
- `SyncBadge.tsx` — Show provider type indicator
- Activity/library pages — handle different data shapes per provider

---

## 8. Risks & Open Questions

### Resolved (from API capture)

| Question | Answer |
|---|---|
| Can we delete addons? | Yes — `DELETE /rest/v1/addons?id=eq.<id>&profile_id=eq.1` |
| Is there a refresh token? | Yes — login returns `refresh_token` field |
| JWT lifetime? | 60 minutes, refresh token is long-lived |
| Bulk addon insert? | Yes — POST accepts array body |
| Addon name field? | Optional override — Nuvio resolves from manifest if empty |

### Remaining Unknowns

| Question | Severity | Impact |
|---|---|---|
| **Library write API** | LOW (deferred) | NOOPing for now — only needed when library sync is implemented |
| **Refresh token max lifetime** | LOW | Fallback: re-login with stored encrypted email/password |
| **`uses_primary_addons` behavior** | LOW | May affect addon writes for secondary profiles |
| **Rate limiting** | LOW | Supabase has generous limits; add request queuing if needed |
| **RLS policies** | LOW | JWT scoped to own rows — fine for per-user operations |

### Known Feature Gaps (Nuvio vs Stremio)

| Feature | Status |
|---|---|
| Likes/favorites | No Nuvio equivalent — NOOP |
| OAuth login | Nuvio uses email/password only — need login form instead of OAuth card |
| Library write (add/remove bookmarks) | Deferred — NOOP for now |

---

## 9. Effort Estimate

| Component | Files | Complexity |
|---|---|---|
| Provider interface + Stremio provider | 3 new files | Medium |
| Nuvio provider (addons + library reads) | 1 new file | Low-Medium |
| Refactor addon call sites | 5 files, ~15 locations | Medium |
| Refactor library call sites | 4 files, ~12 locations | Medium |
| Refactor likes call sites | 1 file, 2 locations | Low |
| Schema migration | 2 Prisma files | Low |
| Nuvio auth util + route | 2 new files | Medium |
| **Invitation flow refactor** | `invitations.js` (~4 endpoints) | **Medium-High** |
| **User login refactor** | `publicLibrary.js`, `publicAuth.js` | **Medium** |
| Client: NuvioLoginCard component | 1 new component | Medium |
| Client: Invite page provider toggle | 1 page + subcomponents | Medium |
| Client API service | 1 file | Low |
| Activity monitor adaptation | 1 file | Medium |

---

## 10. Deep Dive: Complete Stremio Dependency Audit

Exhaustive search of every external API call, Stremio reference, and provider-specific assumption in the codebase.

### 10.1 All Stremio API Methods Used

| Method | Description | Call Sites | Notes |
|---|---|---|---|
| `addonCollectionGet` | Read addon list | ~17 sites | Already documented |
| `addonCollectionSet` | Write addon list (full replace) | ~9 sites | Already documented |
| `addonCollectionAdd` | Add single addon | 1 site (`users.js:1952`) | **NEW** — distinct from Set |
| `datastoreGet` | Read library items | ~11 sites | Already documented |
| `datastorePut` | Write library items | ~3 sites | Already documented (NOOP for Nuvio) |
| `getUser` | Validate auth / get user info | ~2 sites | Already documented |

### 10.2 Previously Undocumented Call Sites

| File | Line | What | Impact |
|---|---|---|---|
| `server/utils/userExpiration.js` | 33 | Creates `StremioAPIClient` to clear addons on membership expiry | **Must add to provider abstraction** |
| `server/utils/helpers/stremio.js` | 10, 38 | Factory: `createStremioClient()`, validates via `getUser` | **Must add to provider abstraction** |
| `server/utils/libraryHelpers.js` | 78 | Fetches `v3-cinemeta.strem.io/meta/{type}/{id}.json` for library enrichment | Can use Nuvio's `resolve-watch-metadata` or keep Cinemeta (IMDb IDs work for both) |
| `server/utils/helpers/validation.js` | 32-34 | Converts `stremio://` URL scheme to `https://` | Nuvio uses `https://` only — this can be kept as-is (harmless passthrough) |

### 10.3 All External APIs Called (Complete List)

| Service | URL Pattern | Files | Nuvio Impact |
|---|---|---|---|
| **Stremio API** | `https://api.strem.io` | 15+ server files | **REPLACE** with Supabase REST |
| **Stremio OAuth** | `https://link.stremio.com/api/v2/` | `invitations.js`, `publicLibrary.js`, + 4 client files | **REPLACE** with email/password form |
| **Stremio Likes** | `https://likes.stremio.com/api/` | `users.js:2183,2247` | **NOOP** — no Nuvio equivalent |
| **Cinemeta** | `https://v3-cinemeta.strem.io/meta/` | `publicLibrary.js:610`, `libraryHelpers.js:78` | **KEEP** — uses IMDb IDs, provider-agnostic |
| **Cinemeta Live** | `https://cinemeta-live.strem.io/meta/` | `activityMonitor.js:445-546` | **KEEP** — same reason |
| **Kitsu** | `https://kitsu.app/api/edge/anime/` | `activityMonitor.js:319-364` | **KEEP** — anime metadata, provider-agnostic |
| **Gravatar** | `https://www.gravatar.com/avatar/` | `avatarUtils.js:16`, `client/gravatar.ts:37` | **KEEP** — unrelated to provider |
| **UI Avatars** | `https://ui-avatars.com/api/` | `avatarUtils.js:62` | **KEEP** — unrelated to provider |
| **Discord Webhooks** | User-provided URLs | `notify.js:28-35` | **KEEP** — unrelated to provider |
| **GitHub API** | `https://api.github.com/repos/` | `client/useGithubReleases.ts:199` | **KEEP** — changelog display |
| **GitHub Raw** | `https://raw.githubusercontent.com/` | `invitations.js`, `activityMonitor.js`, `notify.js` | **KEEP** — logo for Discord embeds |
| **Stremio pullUser** | `https://api.strem.io/api/pullUser` | `stremio.js:39` | **REPLACE** — auth validation fallback |

### 10.4 Client-Side Stremio OAuth (ALL Locations)

| Component | File | Lines | What it does |
|---|---|---|---|
| `StremioOAuthCard` | `auth/StremioOAuthCard.tsx` | 181, 308 | Creates + polls OAuth link (core component) |
| `LoginPage` | `auth/LoginPage.tsx` | 91, 103, 407-450 | Uses StremioOAuthCard for user + admin login |
| `Invite Page` | `app/invite/[inviteCode]/page.tsx` | 609 | Polls OAuth during invite completion |
| `RequestAcceptedPage` | invite subcomponent | 45, 55 | "Connect to Stremio" button text |
| `RequestRenewedPage` | invite subcomponent | 45, 55 | "Connect to Stremio" button text |
| `DeleteAccountPage` | invite subcomponent | 91, 102 | "Clear all your Stremio addons" |
| `UserInviteModal` | `modals/UserInviteModal.tsx` | 267, 327 | Admin creates user via OAuth invite |
| `InviteDetailModal` | `modals/InviteDetailModal.tsx` | 422 | Admin views/polls invite OAuth |
| `AccountMenuButton` | `auth/AccountMenuButton.tsx` | 291-322 | Admin links Stremio account |
| `UserAddModal` | `modals/UserAddModal.tsx` | 299-408 | Create user with OAuth or credentials |

### 10.5 User-Facing UI Strings Containing "Stremio" (~40+)

| Component | String | Type |
|---|---|---|
| `LoginPage` | `'Manage your Stremio library and addons'` | Subtitle |
| `LoginPage` | `'Sign in with Stremio'` | Button |
| `LoginPage` | `'Connect with Stremio to get started'` | Description |
| `StremioOAuthCard` | `'Sign in with Stremio'` | Default button label |
| `StremioOAuthCard` | `'Authorize Syncio'` | Default authorize label |
| `StremioOAuthCard` | `'Stremio link expired...'` | Error |
| `StremioOAuthCard` | `'Stremio account email does not match...'` | Error |
| `StremioOAuthCard` | `'Stremio responded with ${status}'` | Error |
| `StremioOAuthCard` | `'Network error while checking Stremio status'` | Error |
| `RequestAcceptedPage` | `'...authenticate with Stremio and be added to Syncio'` | Instruction |
| `RequestAcceptedPage` | `'Connect to Stremio'` | Button |
| `RequestRenewedPage` | `'...authenticate with Stremio and be added to Syncio'` | Instruction |
| `RequestRenewedPage` | `'Connect to Stremio'` | Button |
| `DeleteAccountPage` | `'Clear all your Stremio addons'` | Checkbox label |
| `DeleteAccountPage` | `'Connect to Stremio'` | Button |
| `InvitePage` | `'Wrong Stremio Account'` | Error title |
| `InvitePage` | `'...different email than your Stremio account'` | Error message |
| `InvitePage` | `'Failed to verify Stremio authentication'` | Error |
| `UserAddModal` | `'Stremio Username'` | Label |
| `UserAddModal` | `'Authenticate with Stremio OAuth'` | Subtitle |
| `UserAddModal` | `'Authenticate with an Auth Key'` | Subtitle |
| `UserAddModal` | `'Stremio OAuth'` | Tab button |
| `UserAddModal` | `'Stremio Auth Key'` | Placeholder |
| `UserDetailModal` | `'Stremio addons cleared'` | Toast |
| `AccountMenuButton` | `'Link Stremio Account'` | Button |
| `AccountMenuButton` | `'Unlink Stremio account'` | Tooltip |
| `AccountMenuButton` | `'This Stremio account is already linked...'` | Error |
| `AccountMenuButton` | `'...linked to a different Stremio account'` | Error |
| `AccountMenuButton` | `'...Stremio authentication does not match...'` | Error |
| `AccountMenuButton` | `'User exists but has no Stremio authentication...'` | Error |
| `AccountMenuButton` | `'...stored Stremio authentication is invalid...'` | Error |
| `AccountMenuButton` | `'Stremio account linked successfully!'` | Toast |
| `GenericEntityPage` | `'Manage your Stremio addons'` | Page description |
| `GenericEntityPage` | `'Manage Stremio users for your group'` | Page description |
| `GenericEntityPage` | `'Manage your Stremio groups'` | Page description |
| `UserDetailModal` | `'Cinemeta'` | Default addon name filter |

### 10.6 Backend Route Names Containing "stremio"

| Route | Method | File |
|---|---|---|
| `/api/stremio/validate` | POST | `stremio.js` |
| `/api/stremio/register` | POST | `stremio.js` |
| `/api/stremio/connect` | POST | `stremio.js` |
| `/api/stremio/connect-authkey` | POST | `stremio.js` |
| `/api/users/:id/stremio-addons` | GET | `users.js` |
| `/api/users/:id/stremio-addons/add` | POST | `users.js` |
| `/api/users/:id/stremio-addons/:name` | DELETE | `users.js` |
| `/api/users/:id/stremio-addons/clear` | POST | `users.js` |
| `/api/users/:id/stremio-addons/reorder` | POST | `users.js` |
| `/api/public-auth/stremio-login` | POST | `publicAuth.js` |
| `/api/public-auth/unlink-stremio` | POST | `publicAuth.js` |
| `/api/public-library/stremio-addons/:name` | DELETE | `publicLibrary.js` |

### 10.7 localStorage Keys Containing "stremio"

From `AccountMenuButton.tsx`:
- `stremio_user`
- `stremio_addons`
- `stremio_auth_key`
- Any key matching `/^stremio_/` or containing `"stremio"`

### 10.8 Database Fields

| Table | Field | Usage |
|---|---|---|
| `User` | `stremioAuthKey` | Encrypted Stremio auth key |
| `Addon` | `stremioAddonId` | Stremio addon manifest ID (e.g. `com.linvo.cinemeta`) |

### 10.9 Hardcoded Stremio Default Addons

| ID/URL | Name | Where Filtered |
|---|---|---|
| `com.linvo.cinemeta` | Cinemeta | `stremio.js:78`, `config.js:22` |
| `org.stremio.local` | Local Files | `stremio.js:79`, `config.js:23` |
| `http://127.0.0.1:11470/local-addon/manifest.json` | Local Files URL | `stremio.js:82`, `config.js:26`, `addonHelpers.js:12`, `addons.js:53` |
| `https://v3-cinemeta.strem.io/manifest.json` | Cinemeta URL | `stremio.js:83`, `config.js:27` |

These are filtered out during sync (`filterDefaultAddons()`). Nuvio may have its own default addons to filter.

### 10.10 NPM Dependencies

| Package | Version | Stremio-Specific? |
|---|---|---|
| `stremio-api-client` | ^1.6.0 | **YES** — only Stremio-specific npm package |

No WebSocket connections. No streaming connections. All env vars are generic (no Stremio-specific env vars — endpoints are hardcoded).

---

## 11. Conclusion

**Addon sync is fully mappable today** — every operation has a confirmed Nuvio equivalent.

**Library/watch history reads are fully mapped** — all three `sync_pull_*` RPCs have confirmed response shapes with clean field mappings to Stremio equivalents. Activity monitoring can use `sync_pull_watched_items` (has timestamps + titles). Watch progress uses same `video_id` format as Stremio. Library writes are deferred (NOOP).

**Likes are a known gap** — Nuvio has no equivalent. NOOP for Nuvio users.

**Auth/identity flow is mappable** — Stremio OAuth becomes Nuvio email/password. Email is the identity in both systems. Invitation flow needs provider branching at the OAuth step.

**The full Stremio dependency surface is:**
- ~90 server-side call sites across ~15 files (API calls)
- ~10 client-side external URL calls (OAuth)
- ~40 user-facing UI strings saying "Stremio"
- ~12 backend route names containing "stremio"
- 2 database fields (`stremioAuthKey`, `stremioAddonId`)
- 4 hardcoded default addon IDs/URLs
- 1 npm package (`stremio-api-client`)

**Metadata enrichment (Cinemeta, Kitsu) is provider-agnostic** — uses IMDb IDs which both Stremio and Nuvio share.

**No remaining blockers.** All API surfaces are mapped. Ready for implementation.

---

## Appendix A: Precise Line-by-Line Change List

### A.1 Schema Changes (2 files)

| File | Line | Current | Change |
|---|---|---|---|
| `prisma/schema.sqlite.prisma` | 16 | `stremioAuthKey String?` | Add `providerType String @default("stremio")`, keep `stremioAuthKey`, add `nuvioRefreshToken String?`, `nuvioUserId String?` |
| `prisma/schema.postgres.prisma` | 16 | `stremioAuthKey String?` | Same as above |

### A.2 Server: API Client Creation (~28 sites)

Every `new StremioAPIClient({ endpoint: 'https://api.strem.io', authKey })` needs provider branching.

| File | Lines | Context |
|---|---|---|
| `server/utils/sync.js` | 13 | `getUserAddons()` — fetch current addons |
| `server/utils/stremio.js` | 10 | `validateStremioAuthKey()` — auth validation |
| `server/utils/addonHelpers.js` | 45, 54 | `clearAddons()` — clear user's addons |
| `server/utils/libraryToggle.js` | 30 | Library item toggle |
| `server/utils/libraryDelete.js` | 22 | Library item deletion |
| `server/utils/activityMonitor.js` | 104, 156 | Activity polling (2 loops) |
| `server/utils/metricsBuilder.js` | 312 | Metrics computation |
| `server/utils/userExpiration.js` | 33 | Membership expiry addon clear |
| `server/utils/helpers/stremio.js` | 10 | `createStremioClient()` factory |
| `server/routes/users.js` | 114, 1375, 1937, 2048, 2341, 2486, 2560, 2703, 2797, 3136, 4516 | Various addon/library ops (11 sites) |
| `server/routes/publicLibrary.js` | 565, 843, 1096, 1476 | Public user addon/library ops (4 sites) |
| `server/routes/invitations.js` | 603 | Invite completion addon fetch |
| `server/routes/debug.js` | 72 | Debug addon fetch |

### A.3 Server: Auth Key Field Access (~47 sites)

Every `user.stremioAuthKey` read/write/check needs provider branching.

| File | Lines | Pattern |
|---|---|---|
| `server/utils/sync.js` | 7, 270, 273 | `if (!user.stremioAuthKey)` + select clause |
| `server/utils/activityMonitor.js` | 78, 103, 155 | Prisma filter `stremioAuthKey: { not: null }` + decrypt |
| `server/utils/metricsBuilder.js` | 66, 95, 305 | Select + filter + decrypt |
| `server/utils/userExpiration.js` | 25, 32, 72 | Check + decrypt + select |
| `server/routes/users.js` | 108, 144, 918, 1308, 1317, 1353, 1360, 1367, 1438, 1938, 2047, 2180, 2340, 4500 | Check + decrypt across many endpoints (~14 sites) |
| `server/routes/publicLibrary.js` | 40, 93, 97, 114, 565 | Check + decrypt + update (~5 sites) |
| `server/routes/invitations.js` | 470, 1135 | Validate + store |
| `server/routes/stremio.js` | 126, 238, 413, 427, 582 | Auth flow store + validate (~5 sites) |
| `server/routes/groups.js` | 90 | Select clause |
| `server/routes/debug.js` | 64 | Check + error message |

### A.4 Server: Stremio API Requests (~30 sites)

Every `.request('addonCollectionGet/Set/Add')` and `.request('datastoreGet/Put')`.

| Method | Call Count | Files |
|---|---|---|
| `addonCollectionGet` | ~17 | `sync.js`, `users.js` (7), `publicLibrary.js` (3), `debug.js`, `invitations.js`, `stremio.js` |
| `addonCollectionSet` | ~9 | `users.js` (4), `publicLibrary.js` (3), `addonHelpers.js` (2) |
| `addonCollectionAdd` | 1 | `users.js:1952` |
| `datastoreGet` | ~11 | `users.js` (4), `publicLibrary.js` (1), `libraryToggle.js`, `libraryDelete.js`, `activityMonitor.js` (2), `metricsBuilder.js` |
| `datastorePut` | ~3 | `libraryToggle.js`, `libraryDelete.js` (NOOP for Nuvio) |
| `getUser` | ~2 | `stremio.js`, `helpers/stremio.js` |

### A.5 Server: External URL Calls

| URL | File:Line | Change |
|---|---|---|
| `https://api.strem.io` | 28+ sites (via StremioAPIClient) | Provider factory |
| `https://api.strem.io/api/pullUser` | `stremio.js:39` | Stremio-only fallback |
| `https://link.stremio.com/api/v2/create` | `invitations.js:513,876` | Skip for Nuvio (email/pwd form) |
| `https://likes.stremio.com/api/get_status` | `users.js:2183` | NOOP for Nuvio |
| `https://likes.stremio.com/api/send` | `users.js:2247` | NOOP for Nuvio |
| `https://v3-cinemeta.strem.io/meta/` | `publicLibrary.js:610`, `libraryHelpers.js:78` | KEEP (IMDb IDs, provider-agnostic) |
| `https://cinemeta-live.strem.io/meta/` | `activityMonitor.js:445-546` | KEEP |

### A.6 Server: Hardcoded Defaults

| File | Lines | What | Change |
|---|---|---|---|
| `server/utils/stremio.js` | 72-85 | Default addon filter (Cinemeta, Local Files) | Add Nuvio defaults if any |
| `server/utils/config.js` | 22-27 | `com.linvo.cinemeta`, `org.stremio.local`, URLs | Provider-specific defaults |
| `server/utils/addonHelpers.js` | 12-34 | Local Files addon object | Stremio-only, skip for Nuvio |
| `server/routes/addons.js` | 53 | Skip reload for local addon URL | Keep (harmless) |

### A.7 Server: Route Names Containing "stremio"

| Route | File | Change |
|---|---|---|
| `POST /api/stremio/validate` | `stremio.js` | Add parallel `/api/nuvio/validate` |
| `POST /api/stremio/register` | `stremio.js` | Stremio-only (Nuvio has no register-via-Syncio) |
| `POST /api/stremio/connect` | `stremio.js` | Add `/api/nuvio/connect` |
| `POST /api/stremio/connect-authkey` | `stremio.js` | Add `/api/nuvio/connect` |
| `GET /api/users/:id/stremio-addons` | `users.js` | Rename to `/provider-addons` or keep + add `/nuvio-addons` |
| `POST /api/users/:id/stremio-addons/add` | `users.js` | Same |
| `DELETE /api/users/:id/stremio-addons/:name` | `users.js` | Same |
| `POST /api/users/:id/stremio-addons/clear` | `users.js` | Same |
| `POST /api/users/:id/stremio-addons/reorder` | `users.js` | Same |
| `POST /api/public-auth/stremio-login` | `publicAuth.js` | Admin-only, can keep (UUID/pwd for Nuvio admins) |
| `POST /api/public-auth/unlink-stremio` | `publicAuth.js` | Admin-only, can keep |
| `DELETE /api/public-library/stremio-addons/:name` | `publicLibrary.js` | Rename or add parallel route |

### A.8 Server: Dependency Injection (server/index.js)

| Line | Current | Change |
|---|---|---|
| 18 | `require('stremio-api-client')` | Keep + add Nuvio client |
| 40 | `require('./utils/stremio')` | Keep + add `require('./utils/nuvio')` |
| 179 | Passes `StremioAPIClient` to users router | Pass provider factory instead |
| 243 | Passes `StremioAPIClient` to `scheduleUserExpiration` | Pass provider factory |

---

### A.9 Client: StremioOAuthCard.tsx (core component, ~80 lines to change)

| Lines | What | Change |
|---|---|---|
| 5 | `interface StremioOAuthCardProps` | Rename or add `provider` prop |
| 41 | `startButtonLabel = 'Sign in with Stremio'` | Dynamic: `'Sign in with ${provider}'` |
| 45 | `instructionLinkHref = 'https://link.stremio.com'` | Dynamic per provider |
| 74-77 | `stremioLink/stremioCode/stremioExpiresAt/stremioError` state vars | Rename to `providerLink/providerCode/...` |
| 181 | `fetch('https://link.stremio.com/api/v2/create...')` | Provider-specific endpoint |
| 308 | `fetch('https://link.stremio.com/api/v2/read...')` | Provider-specific polling |
| 297-354 | Error messages: "Stremio link expired", "Stremio account email does not match", "Network error while checking Stremio status" | Dynamic provider name in all errors |

**For Nuvio users:** This component is NOT used at all — replaced by `NuvioLoginCard` (email/password form). The `StremioOAuthCard` only renders when `providerType === 'stremio'`.

### A.10 Client: LoginPage.tsx (~20 lines to change)

| Lines | What | Change |
|---|---|---|
| 7 | `import StremioOAuthCard` | Keep + add NuvioLoginCard import |
| 42 | `showStremioLogin` state | Rename to `showProviderLogin` |
| 91 | `publicAuthAPI.loginWithStremio({ authKey })` | Branch: Stremio → OAuth, Nuvio → email/pwd |
| 103 | `publicLibraryAPI.authenticate(authKey)` | Branch on provider type |
| 328 | `'Manage your Stremio library and addons'` | Dynamic provider name |
| 407-450 | StremioOAuthCard rendering | Conditional: show OAuth for Stremio, login form for Nuvio |
| 417 | `'Sign in with Stremio'` button | Dynamic |
| 441-443 | `'Connect with Stremio to get started'` | Dynamic |

### A.11 Client: AccountMenuButton.tsx (~25 lines to change)

| Lines | What | Change |
|---|---|---|
| 34-36 | `showStremioLink/isLinkingStremio/isUnlinkingStremio` | Rename to generic |
| 214-234 | `logoutFromStremio()` — clears `stremio_*` localStorage keys | Clear provider-specific keys |
| 291-322 | `handleStremioAuthKey()` — admin Stremio linking | Admin-only, can keep Stremio-specific |
| 295 | `'Stremio account linked successfully!'` toast | Dynamic |
| 304-311 | 6 error messages mentioning "Stremio" | Dynamic |
| 475, 518 | `'Unlink Stremio account'`, `'Link Stremio Account'` | Dynamic |

### A.12 Client: UserAddModal.tsx (~30 lines to change)

| Lines | What | Change |
|---|---|---|
| 50-53, 62 | `stremioEmail/stremioPassword/stremioAuthKey/stremioUsername/stremioRegisterNew` | Add provider type selector to form, rename vars |
| 147 | `usersAPI.verifyAuthKey({ authKey })` | Add provider type param |
| 298 | `'Stremio Username'` label | Dynamic |
| 317 | `'Authenticate with Stremio OAuth'` | Dynamic |
| 342 | `'Stremio OAuth'` tab button | Dynamic |
| 406 | `'Stremio Auth Key'` placeholder | Dynamic |
| Form | No provider selector exists | **NEW:** Add Stremio/Nuvio toggle at top of form |

### A.13 Client: UserDetailModal.tsx (~10 lines to change)

| Lines | What | Change |
|---|---|---|
| 35-36 | `stremioUsername/stremioEmail` interface fields | Add `providerType` to user interface |
| 109 | `hasStremioConnection` check | Check `hasProviderConnection` |
| 192-208 | `stremioAddons` query + variable | Rename, add provider-aware query |
| 215 | `handleDebugStremioAddons` | Rename |
| 294 | `'Stremio addons cleared'` toast | Dynamic |
| 471 | `'Cinemeta'` default addon filter | Provider-specific defaults |

### A.14 Client: Invite Flow Components (~15 lines to change)

| File | Lines | What | Change |
|---|---|---|---|
| `UserInviteModal.tsx` | 267, 327 | `link.stremio.com` fetch calls | Provider-specific or route through backend |
| `UserInviteModal.tsx` | 274, 280, 340, 524 | Error messages mentioning "Stremio" | Dynamic |
| `InviteDetailModal.tsx` | 422 | `link.stremio.com` polling | Provider-specific |
| `invite/[inviteCode]/page.tsx` | 609 | `link.stremio.com` polling | Provider-specific |
| `RequestAcceptedPage` | 45, 55 | "authenticate with Stremio", "Connect to Stremio" | Dynamic |
| `RequestRenewedPage` | 45, 55 | Same text | Dynamic |
| `DeleteAccountPage` | 91, 102 | "Clear all your Stremio addons", "Connect to Stremio" | Dynamic |

### A.15 Client: GenericEntityPage.tsx (~3 lines)

| Lines | What | Change |
|---|---|---|
| ~954 | `'Manage your Stremio addons'` | Remove "Stremio" — just "Manage your addons" |
| ~978 | `'Manage Stremio users for your group'` | Remove "Stremio" |
| ~1003 | `'Manage your Stremio groups'` | Remove "Stremio" |

### A.16 Client: GroupDetailModal.tsx

| Lines | What | Change |
|---|---|---|
| ~620 | `'Syncing will delete all Stremio addons from its users'` | Dynamic provider name or generic "provider addons" |

### A.17 Client: api.ts (~10 lines to change)

| Lines | What | Change |
|---|---|---|
| 43-47 | Error handler skips `/stremio/` endpoints | Add `/nuvio/` to skip list |
| 106-112 | `StremioAuthVerification` interface | Rename to `ProviderAuthVerification` |
| 220-231 | `usersAPI.create()` calls `/stremio/connect-authkey` | Route based on provider type |
| 249-261 | `stremioAPI.register/connect/verify` | Add `nuvioAPI` namespace |
| 346-349 | `/stremio-addons` endpoint refs | Provider-aware routing |
| 815 | `loginWithStremio` | Keep (admin-only) |

### A.18 Client: hooks/useUserAuth.ts

| Lines | What | Change |
|---|---|---|
| 9, 22, 35, 42 | `public-library-user` localStorage | Add `providerType` to stored object |

### A.19 Client: URL Scheme Handling (NO CHANGE)

| File | Lines | What | Decision |
|---|---|---|---|
| `AddonAddModal.tsx` | 75, 89-92 | `stremio://` → `https://` conversion | **KEEP** — URL scheme, not provider-specific |
| `AddonDetailModal.tsx` | 22-23 | Same conversion | **KEEP** |
| `UserHomePage.tsx` | 67, 81 | Same conversion | **KEEP** |

---

### A.20 New Files to Create

| File | Purpose |
|---|---|
| `server/providers/index.js` | Provider factory: `getProvider(user)` returns Stremio or Nuvio provider |
| `server/providers/stremio.js` | Wraps existing StremioAPIClient calls |
| `server/providers/nuvio.js` | Supabase REST implementation |
| `server/routes/nuvio.js` | Nuvio auth routes (validate, connect) |
| `server/utils/nuvio.js` | `validateNuvioAuth(email, password)`, `refreshNuvioToken(refreshToken)` |
| `client/src/components/auth/NuvioLoginCard.tsx` | Email/password login form for Nuvio users |

---

### Summary Counts

| Category | Server | Client | Total |
|---|---|---|---|
| API client creation sites | 28 | 0 | 28 |
| Auth key field access sites | 47 | 5 | 52 |
| API request call sites | 30 | 0 | 30 |
| External URL calls | 7 unique URLs | 4 unique URLs | 11 |
| UI strings mentioning "Stremio" | 0 | ~40 | ~40 |
| Route names with "stremio" | 12 | 0 | 12 |
| localStorage keys | 0 | 4 | 4 |
| New files to create | 5 | 1 | 6 |
| **Total files to modify** | **~18** | **~16** | **~34** |
| **Total individual change sites** | **~120** | **~80** | **~200** |
