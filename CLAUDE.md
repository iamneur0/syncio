# Syncio Development Guide

## Philosophy: Wrap, Don't Rewrite

Syncio is adding Nuvio as a second provider alongside Stremio. The guiding principle:

**The existing Stremio code works. Don't refactor it, rename its variables, or restructure its files.** Put a thin factory in front of it that routes to either existing code (Stremio) or new code (Nuvio) based on `user.providerType`.

### Rules

1. **The Stremio provider is a pass-through.** It creates `StremioAPIClient` exactly like the current code does. Same methods, same shapes, same behavior. We're extracting the existing 3-line pattern (`decrypt → new client → request`) into a function.

2. **New code goes in new files.** `server/providers/` is all new. Existing files only change at the specific lines where `StremioAPIClient` is instantiated.

3. **No renames, no cleanup, no "improvements".** `stremioAuthKey` stays as a field name. `stremio.js` route file stays. Variable names in existing code stay. We add, we don't reorganize.

4. **No docstrings, comments, or type annotations on code you didn't write.** Don't touch lines adjacent to your change unless they're broken.

5. **The sync engine gets one new parameter.** `urlOnly` on the fingerprint function. That's it. No rewrite of `computeUserSyncPlan`, `getDesiredAddons`, or comparison logic.

6. **Call sites change from 3 lines to 2 lines.** From `decrypt + new StremioAPIClient + request` to `createProvider + method call`. Same behavior, now provider-aware.

---

## Architecture

```
Syncio Core (groups, users, addon DB, sync planning)
  │
  └── createProvider(user, deps) ──┬── stremioProvider (wraps StremioAPIClient)
                                   └── nuvioProvider (Supabase REST)
```

### Provider Interface

`createProvider(user, { decrypt, req })` returns a plain object:

```javascript
// Addon transport
provider.getAddons()              // → { addons: [{ transportUrl, transportName, manifest }] }
provider.setAddons(addons)        // → void
provider.addAddon(url, manifest)  // → void
provider.clearAddons()            // → void

// Content (library, likes)
provider.getLibrary()             // → libraryItem[]
provider.getLikeStatus(...)       // → status | null (null = not supported)
provider.setLikeStatus(...)       // → void | null
provider.addLibraryItem(...)      // → void | null (null = not supported)
provider.removeLibraryItem(...)   // → void | null
```

Auth is separate — module-level functions in `stremioAuth.js` / `nuvioAuth.js`, not on the provider instance. Auth is used at connection time (invitations, login), providers are used at operation time (sync, CRUD).

### Universal Addon Shape

The sync engine works with Stremio's native addon format. This is the universal shape:

```javascript
{
  transportUrl: "https://example.com/manifest.json",
  transportName: "",
  manifest: {
    id: "com.example.addon",
    name: "Addon Name",
    version: "1.0.0",
    description: "...",
    resources: [...],
    catalogs: [...],
    types: [...]
  }
}
```

The Nuvio provider returns a minimal version (URL + stub manifest). Sync comparison uses URL-only fingerprinting for Nuvio users.

### Fingerprint Comparison

`createManifestFingerprint()` in `sync.js` has a `urlOnly` flag:
- **Stremio users:** `url + '|' + JSON.stringify(manifest)` (full comparison, existing behavior)
- **Nuvio users:** `url` only (Syncio controls the URL set; manifest content changes detected by addon reload)

---

## Files

### Provider layer (new)

```
server/providers/
  index.js              # Factory: createProvider(user, deps)
  stremio.js            # Wraps StremioAPIClient
  nuvio.js              # Supabase REST calls
  supabase.js           # Low-level HTTP helper for Supabase PostgREST
  stremioAuth.js        # validateStremioAuthKey, login (module-level)
  nuvioAuth.js          # validateNuvioCredentials, refreshToken (module-level)
```

### Schema additions

```prisma
model User {
  stremioAuthKey     String?                        // Existing, unchanged
  providerType       String    @default("stremio")  // NEW: "stremio" | "nuvio"
  nuvioRefreshToken  String?                        // NEW: encrypted
  nuvioUserId        String?                        // NEW: Supabase user UUID
}
```

### Key existing files (touch minimally)

- `server/utils/sync.js` — Add `urlOnly` param to fingerprint. Change `getUserAddons` to use `createProvider`.
- `server/routes/users.js` — Swap ~11 `StremioAPIClient` instantiations with `createProvider`.
- `server/routes/publicLibrary.js` — Swap ~4 sites.
- `server/utils/activityMonitor.js` — Swap ~2 sites + update Prisma query.
- `server/index.js` — Pass `createProvider` instead of `StremioAPIClient` to routers.

---

## Commands

```bash
npm run dev              # Run server + client in dev mode
npm test                 # Run Jest tests
npm run lint             # ESLint check
npm run lint:fix         # ESLint autofix
npm run build            # Next.js production build
```

---

## Adding a New Provider

1. Create `server/providers/{name}.js` — implement the provider interface
2. Create `server/providers/{name}Auth.js` — implement validate/refresh
3. Add a case to `server/providers/index.js` factory
4. Add credential fields to Prisma schema
5. Add auth route `server/routes/{name}.js`
6. Add client login component
7. Update Prisma queries that filter by credentials (add OR clause)
