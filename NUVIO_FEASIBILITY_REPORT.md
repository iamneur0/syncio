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
| Validate auth key | `pullUser` (HTTP fallback) | `stremio.js:39-55` |
| OAuth link | `StremioAPIStore.createOAuthLink()` | `publicLibrary.js:149-173` |
| OAuth poll | `StremioAPIStore.getOAuthToken(code)` | `publicLibrary.js:176-200` |

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

### 3.3 Library & Watch History (PARTIALLY CONFIRMED)

**Read library:**
```
POST /rest/v1/rpc/sync_pull_library
Body: {"p_profile_id": 1}
Response: (library items — response shape needs capture)
```

**Read watched items (paginated):**
```
POST /rest/v1/rpc/sync_pull_watched_items
Body: {"p_page": 1, "p_page_size": 50, "p_profile_id": 1}
Response: (watched items — response shape needs capture)
```

**Read watch progress:**
```
POST /rest/v1/rpc/sync_pull_watch_progress
Body: {"p_profile_id": 1}
Response: (progress data — response shape needs capture)
```

**Write library items:** UNKNOWN — needs reverse-engineering (see section 5)

### 3.4 Sync Ownership

**Check sync owner (called frequently by Nuvio client):**
```
POST /rest/v1/rpc/get_sync_owner
Body: {}
Response: UNKNOWN — needs capture
```

This likely indicates Nuvio has its own concept of managed sync. Response body needed to understand implications for Syncio-managed users.

### 3.5 Likes/Favorites

**Nuvio equivalent:** UNKNOWN — Stremio uses a separate `likes.stremio.com` service. Nuvio may store this in Supabase or may not have the feature at all. Needs investigation.

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
| Read full library | `datastoreGet` collection=libraryItem | `rpc/sync_pull_library` | **LIKELY MAPS** — response shape needed |
| Read watch history | Filter library by `_mtime`/`lastWatched` | `rpc/sync_pull_watched_items` (paginated) | **LIKELY MAPS** — response shape needed |
| Read watch progress | `libraryItem.state.timeOffset` | `rpc/sync_pull_watch_progress` | **LIKELY MAPS** — response shape needed |
| Add to library | `datastorePut` with item data | **UNKNOWN** | **NEEDS CAPTURE** |
| Remove from library | `datastorePut` with `removed: true` | **UNKNOWN** | **NEEDS CAPTURE** |
| Activity detection | Poll library, compare `_mtime` | Poll `sync_pull_watched_items`, compare timestamps? | **NEEDS DESIGN** |

### Likes/Favorites

| Syncio Function | Stremio Approach | Nuvio Equivalent | Status |
|---|---|---|---|
| Get like status | `GET likes.stremio.com/api/get_status` | **UNKNOWN** | **NEEDS INVESTIGATION** |
| Set like/love | `POST likes.stremio.com/api/send` | **UNKNOWN** | **NEEDS INVESTIGATION** |

### Auth

| Syncio Function | Stremio Approach | Nuvio Equivalent | Status |
|---|---|---|---|
| Validate credentials | `StremioAPIStore.login()` | `POST /auth/v1/token?grant_type=password` | **CONFIRMED** |
| Store auth | Encrypt authKey (long-lived) | Encrypt refresh_token + user_id | **CONFIRMED** |
| Re-auth before sync | Use authKey directly | `POST /auth/v1/token?grant_type=refresh_token` | **CONFIRMED** |
| Get user info | `getUser` | JWT payload or `GET /auth/v1/user` | **CONFIRMED** |
| OAuth flow | `createOAuthLink` / `getOAuthToken` | N/A — Nuvio uses email/password only | **NO OAUTH** — email/pwd login form needed |

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

### Priority 1 (Required for feature parity)

| Operation | How to Capture |
|---|---|
| **Library write (add item)** | In Nuvio, add a movie/show to your library/watchlist. Look for POST/PATCH to an RPC or the library table. |
| **Library write (remove item)** | Remove/unmark a library item. Look for DELETE or PATCH with a removal flag. |
| **`sync_pull_library` response body** | Check the Response tab for one of those RPC calls — we need to see the field names (especially: does it include watch progress? modification timestamps? IMDb IDs?) |
| **`sync_pull_watch_progress` response body** | Same — what fields does it return? |
| **`get_sync_owner` response body** | This tells us if/how Nuvio enforces sync ownership — critical for understanding if Syncio-managed users will conflict with Nuvio's own sync. |

### Priority 2 (Nice to have)

| Operation | How to Capture |
|---|---|
| **Likes/favorites** | Does Nuvio have a like/love button? If so, capture the request. If not, it's a known feature gap. |
| **Bulk delete confirmation** | Try `DELETE /rest/v1/addons?user_id=eq.<id>&profile_id=eq.1` (no `id` filter) — does it work? |
| **Token refresh after 24hrs** | Wait a day, then try using the refresh token to get a new JWT. Confirms long-lived refresh tokens. |

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

### Library Item Shape: Nuvio — UNKNOWN

Need to capture `sync_pull_library` response to determine field mapping. Likely uses similar IMDb IDs but different field names.

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

- New route: `server/routes/nuvio.js` (parallel to `stremio.js`)
- Schema migration: Add `nuvioRefreshToken`, `nuvioUserId`, `providerType` to User model
- Client: Nuvio login form (email/password — no OAuth) alongside Stremio OAuth

### Phase 5: Client Updates

- `client/src/services/api.ts` — Add `nuvioAPI` namespace
- `LoginPage.tsx` — Add Nuvio login option (simple email/password form)
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
| **Library write API** | HIGH | Without this, we can't toggle/remove library items for Nuvio users |
| **`sync_pull_library` response shape** | HIGH | Need field mapping for activity monitoring + metrics |
| **`get_sync_owner` behavior** | MEDIUM | Could block writes if Nuvio thinks another account owns the sync |
| **Likes API in Nuvio** | LOW | Feature gap if absent — not critical for core sync |
| **Refresh token max lifetime** | LOW | Fallback: re-login with stored encrypted email/password |
| **`profile_id` semantics** | LOW | Hardcode `1` for now; handle multi-profile later if needed |
| **Rate limiting** | LOW | Supabase has generous limits; add request queuing if needed |
| **RLS policies** | LOW | JWT scoped to own rows — fine for per-user operations |

---

## 9. Effort Estimate

| Component | Files | Complexity |
|---|---|---|
| Provider interface + Stremio provider | 3 new files | Medium |
| Nuvio provider (addons) | 1 new file | Low-Medium |
| Nuvio provider (library) | Same file, pending API capture | Medium (blocked) |
| Refactor addon call sites | 5 files, ~15 locations | Medium |
| Refactor library call sites | 4 files, ~12 locations | Medium |
| Refactor likes call sites | 1 file, 2 locations | Low |
| Schema migration | 2 Prisma files | Low |
| Nuvio auth route | 1 new file | Low |
| Client auth flow | 2-3 components | Medium |
| Client API service | 1 file | Low |
| Activity monitor adaptation | 1 file | Medium |

---

## 10. Conclusion

**Addon sync is fully mappable today** — every operation has a confirmed Nuvio equivalent.

**Library/watch history is partially mapped** — the read operations exist (`sync_pull_*` RPCs) but we need:
1. Response shapes from those RPCs
2. Library write operations (add/remove items)
3. Clarity on `get_sync_owner` (sync ownership model)

**Likes may be a feature gap** — Stremio has a dedicated likes service. Nuvio may not have an equivalent.

**The code structure supports this** — while there's no formal provider abstraction today, Stremio calls are concentrated in ~8 files with a consistent pattern. The sync planning engine and all group/user management is already provider-agnostic.

**Recommended next step:** Capture the remaining Priority 1 items (library write, RPC response shapes, `get_sync_owner` response) to unblock the full implementation.
