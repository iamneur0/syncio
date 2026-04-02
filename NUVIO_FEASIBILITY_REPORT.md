# Nuvio Integration Feasibility Report

## Executive Summary

**Verdict: Feasible and cleanly achievable.**

Adding Nuvio as a sync target alongside Stremio is a medium-effort refactor. Syncio's entire Stremio API surface reduces to just 2 operations (`addonCollectionGet` / `addonCollectionSet`), both of which have direct Nuvio equivalents via Supabase REST. The sync engine's core planning logic is already provider-agnostic — only the "fetch current addons" and "push desired addons" steps need abstraction.

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
  utils/          # Sync engine, encryption, Stremio helpers
client/
  src/services/   # Centralized API layer (api.ts - single file, 1200+ lines)
  src/components/ # React components (auth, modals, pages, entities)
  src/hooks/      # React Query hooks, auth state, sync status
prisma/           # Schema definitions (sqlite + postgres variants)
```

### Stremio API Surface (exhaustive)

Syncio uses exactly **2 Stremio API operations** across the entire codebase:

| Operation | Method | What it does |
|---|---|---|
| `addonCollectionGet` | Read | Returns `{ addons: [{ transportUrl, transportName, manifest: {...} }] }` |
| `addonCollectionSet` | Write | Accepts `{ addons: [...] }` — atomic full-collection replacement |

Plus auth operations: `login()`, `register()`, `getUser()` via `StremioAPIStore`.

### Where Stremio Calls Live (all call sites)

| File | Lines | Operations |
|---|---|---|
| `server/utils/sync.js` | 6-73 | `addonCollectionGet` — fetch user's current addons |
| `server/utils/addonHelpers.js` | 43-55 | `addonCollectionSet` — clear all addons |
| `server/utils/stremio.js` | 7-61 | `getUser`, `addonCollectionGet` — validate auth key |
| `server/routes/users.js` | ~115, 1376, 2800, 3137, 3456, 4516, 4560 | `addonCollectionGet` + `addonCollectionSet` — CRUD + sync |
| `server/routes/publicLibrary.js` | ~848, 881, 1098, 1479, 1492 | `addonCollectionGet` + `addonCollectionSet` — public library |
| `server/routes/stremio.js` | ~30-50, 381 | `login`, `register`, `pullAddonCollection` — auth flow |
| `server/routes/debug.js` | ~73 | `addonCollectionGet` — debug endpoint |
| `server/routes/invitations.js` | ~610 | `addonCollectionGet` — invitation flow |

**Total: ~15 call sites across 8 files.** All use the same `StremioAPIClient` pattern.

---

## 2. Nuvio API — Complete Mapping

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

### 2.1 Authentication

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
- Refresh token: Supabase default is **long-lived** (configurable, typically days/weeks)
- Syncio can store the refresh token (encrypted) and use it to get fresh JWTs before each sync

### 2.2 Addon Operations

**List addons:**
```
GET /rest/v1/addons?select=*&user_id=eq.<uuid>&profile_id=eq.1&order=sort_order.asc,created_at.asc
Response: [
  { "id": "uuid", "user_id": "uuid", "profile_id": 1, "url": "https://...", "name": "...", "enabled": true, "sort_order": 0, "created_at": "..." },
  ...
]
```

**Add addon(s):**
```
POST /rest/v1/addons
Headers: prefer: return=representation
Body: [{"user_id": "...", "profile_id": 1, "url": "<manifest_url>", "name": "...", "enabled": true, "sort_order": <int>}]
Response: (created rows)
```

**Update addon (reorder / toggle enabled):**
```
PATCH /rest/v1/addons?id=eq.<addon_uuid>&profile_id=eq.1
Headers: prefer: return=representation
Body: {"sort_order": <int>}  OR  {"enabled": false}  OR both
Response: (updated rows)
```

**Delete addon:**
```
DELETE /rest/v1/addons?id=eq.<addon_uuid>&profile_id=eq.1
Response: (empty, 200/204)
```

**Clear all addons (inferred from PostgREST patterns):**
```
DELETE /rest/v1/addons?user_id=eq.<uuid>&profile_id=eq.1
```

**Get addon manifest metadata:**
```
GET https://nuvioapp.space/api/addons/manifest-meta?url=<encoded_manifest_url>
(No auth required — same-origin Nuvio endpoint)
```

### 2.3 Additional Nuvio Endpoints (library/progress — not needed for addon sync)

| Endpoint | Purpose |
|---|---|
| `POST /rest/v1/rpc/sync_pull_library` | Pull media library (body: `{"p_profile_id": 1}`) |
| `POST /rest/v1/rpc/sync_pull_watched_items` | Pull watch history (paginated) |
| `POST /rest/v1/rpc/sync_pull_watch_progress` | Pull watch progress |

These are out of scope for addon sync but could be relevant for future library sync features.

---

## 3. Operation-by-Operation Feasibility

### Core Sync Operations

| Syncio Function | Stremio Approach | Nuvio Equivalent | Feasibility |
|---|---|---|---|
| **Get user's current addons** | `addonCollectionGet` → full manifest array | `GET /rest/v1/addons` → URL + metadata rows | **Full parity.** Nuvio returns URLs; manifests fetched separately via `manifest-meta` if needed. |
| **Set user's desired addons** (sync) | `addonCollectionSet` → atomic replacement | DELETE all + POST desired set | **Full parity.** Two-step instead of atomic, but achieves same result. |
| **Add single addon** | Read full collection → append → write back | `POST /rest/v1/addons` with single row | **Simpler in Nuvio** — direct insert, no read-modify-write. |
| **Remove single addon** | Read → filter out → write back | `DELETE /rest/v1/addons?id=eq.<id>` | **Simpler in Nuvio** — direct delete. |
| **Reorder addons** | Read → reorder array → write back | `PATCH` each addon's `sort_order` | **Equivalent.** Multiple PATCH calls or could batch. |
| **Clear all addons** | `addonCollectionSet({addons: []})` | `DELETE /rest/v1/addons?user_id=eq.<id>&profile_id=eq.1` | **Full parity.** |
| **Enable/disable addon** | N/A (Stremio has no concept) | `PATCH` with `{"enabled": false}` | **Nuvio is richer** — has native enable/disable. |

### Auth Operations

| Syncio Function | Stremio Approach | Nuvio Equivalent | Feasibility |
|---|---|---|---|
| **Validate credentials** | `StremioAPIStore.login(email, pwd)` | `POST /auth/v1/token?grant_type=password` | **Full parity.** |
| **Store auth for later sync** | Encrypt `authKey` (long-lived) | Encrypt `refresh_token` + `user_id` | **Full parity.** Refresh tokens are long-lived. |
| **Re-auth before sync** | Use stored `authKey` directly | `POST /auth/v1/token?grant_type=refresh_token` → fresh JWT | **Full parity.** One extra step. |
| **Get user info** | `client.request('getUser')` | Decoded from JWT payload or `GET /auth/v1/user` | **Full parity.** |

### Sync Engine (the planning layer)

| Component | Provider-specific? | Notes |
|---|---|---|
| `computeUserSyncPlan()` | **No** — operates on addon arrays | Core logic is generic: compare current vs desired by manifest URL fingerprint |
| `getDesiredAddons()` | **No** — reads from Syncio's own DB | Groups, protected addons, exclusions — all provider-agnostic |
| `getUserAddons()` | **Yes** — calls `StremioAPIClient` | Needs provider abstraction |
| `syncUserAddons()` | **Yes** — calls `addonCollectionSet` | Needs provider abstraction |
| `filterDefaultAddons()` | **Partially** — hardcoded Stremio defaults | Nuvio may have its own defaults to filter |

---

## 4. Data Model Differences

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
  id: "uuid",              // Supabase row ID
  user_id: "uuid",         // Nuvio user UUID
  profile_id: 1,           // Profile (always 1 for default)
  url: "https://addon.example/manifest.json",
  name: "My Addon",
  enabled: true,
  sort_order: 0,
  created_at: "2026-..."
}
```

**Key difference:** Stremio carries full manifests inline. Nuvio stores only the URL and name. For sync comparison, Syncio fingerprints manifests — for Nuvio, it would compare by URL (which is actually more reliable).

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

Alternative: a generic `providerCredentials` JSON field, but explicit fields are safer and easier to query.

---

## 5. Implementation Plan (High-Level)

### Phase 1: Provider Abstraction Layer

Create `server/providers/` with a common interface:

```javascript
// Each provider implements:
{
  async getAddons(credentials)          // → [{ url, name, manifest?, enabled?, sort_order? }]
  async setAddons(credentials, addons)  // → void (atomic sync)
  async addAddon(credentials, addon)    // → created addon
  async removeAddon(credentials, id)    // → void
  async clearAddons(credentials)        // → void
  async validateAuth(loginData)         // → { userId, credentials, userInfo }
  async refreshAuth(credentials)        // → fresh credentials (or same for Stremio)
}
```

**Files:** `server/providers/stremio.js`, `server/providers/nuvio.js`, `server/providers/index.js` (factory)

### Phase 2: Refactor Existing Code

Replace direct `StremioAPIClient` usage with provider calls. Touch points:
- `server/utils/sync.js` — `getUserAddons()` → `provider.getAddons()`
- `server/utils/addonHelpers.js` — `clearAddons()` → `provider.clearAddons()`
- `server/routes/users.js` — ~7 call sites → use provider factory
- `server/routes/publicLibrary.js` — ~5 call sites → use provider factory

### Phase 3: Nuvio Auth Flow

- New route: `server/routes/nuvio.js` (parallel to `stremio.js`)
- Client: Add Nuvio login option alongside Stremio OAuth in `LoginPage.tsx`
- Schema migration: Add `nuvioRefreshToken`, `nuvioUserId`, `providerType` to User model

### Phase 4: Client Updates

- `client/src/services/api.ts` — Add `nuvioAPI` namespace
- `LoginPage.tsx` / `StremioOAuthCard.tsx` — Add Nuvio auth card
- `UserAddModal.tsx` — Provider type selector when creating users
- `SyncBadge.tsx` — Show provider type indicator

---

## 6. Risks & Open Questions

### Resolved (from API capture)

| Question | Answer |
|---|---|
| Can we delete addons? | Yes — `DELETE /rest/v1/addons?id=eq.<id>&profile_id=eq.1` |
| Is there a refresh token? | Yes — login returns `refresh_token` field, standard Supabase flow |
| JWT lifetime? | 60 minutes, refresh token is long-lived |
| Bulk operations? | PostgREST supports array POST (confirmed from add-addon request body) |

### Remaining Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Refresh token expiry policy** | Medium | Supabase defaults to long-lived refresh tokens, but Nuvio's project config could override. Test by refreshing after 24hrs+. Fallback: store encrypted email/password for re-login. |
| **`profile_id` semantics** | Low | All observed requests use `profile_id=1`. If Nuvio adds multi-profile support, we'd need to handle it. For now, hardcode `1`. |
| **Rate limiting** | Low | Supabase free tier has generous limits. Bulk sync (many users) could hit PostgREST connection limits. Implement request queuing if needed. |
| **RLS policies** | Low | Supabase Row Level Security means the JWT can only access its own user's rows. This is fine — each user has their own credentials. But it means we can't do admin-level bulk operations. |
| **Nuvio API stability** | Medium | These are internal APIs, not documented. They could change. The Supabase REST layer is auto-generated from schema, so it's relatively stable as long as the table structure doesn't change. |

### Not Needed for Addon Sync (future scope)

- Library sync (`sync_pull_library`, `sync_pull_watched_items`, `sync_pull_watch_progress`) — interesting for future features but not needed for the addon management use case.
- Nuvio profile management — no evidence of multi-profile CRUD in the captured traffic.

---

## 7. Effort Estimate

| Component | Files | Complexity |
|---|---|---|
| Provider abstraction + Stremio provider | 3 new files | Medium |
| Nuvio provider | 1 new file | Low-Medium |
| Refactor existing Stremio call sites | 5 files, ~15 locations | Medium |
| Schema migration | 2 Prisma files | Low |
| Nuvio auth route | 1 new file | Low |
| Client auth flow | 2-3 components | Medium |
| Client API service | 1 file | Low |

**Conclusion:** This is a clean, well-scoped integration. The hardest part is the refactor of existing call sites (Phase 2), not the Nuvio implementation itself. The Nuvio API is actually simpler than Stremio's — direct CRUD vs read-modify-write.
