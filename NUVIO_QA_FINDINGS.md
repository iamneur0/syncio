# Nuvio Integration — QA Test Findings

## Critical Bugs

### BUG-1: NuvioLoginCard "Validate" button submits outer form instead of validating (CRITICAL) ✅ FIXED

**Reproduce:**
1. Go to `/users` → click "Add new item" (+ button)
2. Click "Nuvio" provider toggle
3. Fill in Nuvio Email + Password
4. Click "Validate Nuvio Credentials"
5. **Result:** Modal closes immediately. No API call to `/nuvio/validate` is made.

**Root cause:** `NuvioLoginCard.tsx` wraps its fields in a `<form onSubmit={handleSubmit}>` with a `<button type="submit">`. However, this inner form is **nested inside** `UserAddModal`'s outer `<form>`. Nested `<form>` elements are invalid HTML — the browser ignores the inner `<form>` tag entirely. So the `type="submit"` button submits the **outer** modal form, which triggers the modal's own submit handler and closes it.

**Evidence:**
- `document.querySelectorAll('form')` shows outer form at `action="http://localhost:3000/users"` with `childForms: 1`
- Both "Validate Nuvio Credentials" and "Add User" are `type="submit"` buttons inside the outer form
- No `/api/nuvio/validate` network request is ever made

**Fix options:**
1. **Best:** In `NuvioLoginCard.tsx`, remove the `<form>` wrapper entirely. Change the button to `type="button"` and call `handleSubmit` via `onClick` instead of relying on form submission.
2. **Alternative:** In `UserAddModal.tsx`, don't wrap the modal content in a `<form>`. Use `onClick` handlers on the "Add User" button instead.

**File:** `client/src/components/auth/NuvioLoginCard.tsx:47,77-78`
**Also affects:** Any page that embeds NuvioLoginCard inside a form — check `RequestAcceptedPage.tsx` and `RequestRenewedPage.tsx` too.

### BUG-2: `createProvider is not defined` — user sync fails (CRITICAL) ✅ FIXED

**Reproduce:**
1. Create a Nuvio user via the invite flow (or any user)
2. Add user to a group with addons
3. Click sync (either user sync badge or group sync)
4. **Result:** `POST /api/users/:id/sync` returns 400 with `{"message":"createProvider is not defined"}`

**Group sync also fails silently:** `POST /api/groups/:id/sync` returns 200 but with `syncedUsers: 0, failedUsers: 1`.

**Root cause:** The `createProvider` function is not being injected/passed correctly to the sync route handler. The route handler references `createProvider` but it's undefined in scope.

**Evidence:**
- `POST /api/users/cmnibliob0004us98fxupvmuo/sync` → 400 `{"message":"createProvider is not defined"}`
- `POST /api/groups/.../sync` → 200 `{"syncedUsers":0,"failedUsers":1,"message":"Group sync completed: 0/1 users synced"}`

**Fix:** Check `server/index.js` where the users router is initialized — verify `createProvider` is passed as a dependency. Also check `server/routes/users.js` where the sync endpoint uses `createProvider`.

**Impact:** No user can be synced at all — both Stremio and Nuvio users are affected. This is not a Nuvio-specific bug but a general integration issue.

---

## String Issues (Hardcoded "Stremio" references)

### F1: Login page subtitle ✅ FIXED
- **Was:** "Manage your Stremio library and addons" → **Now:** "Manage your library and addons"

### F2: Users page description ✅ FIXED
- **Was:** "Manage Stremio users for your group" → **Now:** "Manage users for your group"

### F3: Groups page description ✅ FIXED
- **Was:** "Manage your Stremio groups" → **Now:** "Manage your groups"

### F4: Addons page description ✅ FIXED
- **Was:** "Manage your Stremio addons" → **Now:** "Manage your addons"

### F5: No Nuvio login option on `/login` user mode ✅ FIXED
- Added provider toggle [Stremio][Nuvio] to user mode on login page
- Added `handleNuvioAuth` handler calling `publicLibraryAPI.authenticateNuvio()`
- Added `authenticateNuvio` method to `api.ts`
- Extended server `/public-library/authenticate` to accept `{ nuvioEmail, nuvioPassword }`
- **Verified:** Nuvio user can log in and reaches `/user/home`

### F6: Delete account page — "Clear all your Stremio addons" ✅ FIXED
- **Was:** "Clear all your Stremio addons" → **Now:** "Clear all your addons"

### F8: Delete account page — no Nuvio path — OPEN
- **Location:** `/invite/delete` — only Stremio OAuth flow
- **Impact:** Nuvio users cannot delete their accounts

### F11: Tasks page — Stremio-specific export label ✅ FIXED
- **Was:** "Export a user's Stremio library to a JSON file." → **Now:** "Export a user's library to a JSON file."

### F12: UserAddModal username field ✅ FIXED
- **Was:** "Stremio Username" → **Now:** "Username"

### F13: UserAddModal subtitle ✅ FIXED
- **Was:** Always "Authenticate with Stremio OAuth" → **Now:** Shows "Authenticate with Nuvio" when Nuvio selected

### F14: No provider type indicator in users list or detail view — OPEN
- **Location:** `/users` list and user detail panel
- **Current:** No badge, label, or column showing whether a user is Stremio or Nuvio
- **Expected:** A "Stremio"/"Nuvio" badge on the user card and in the detail view
- **Impact:** Admin has no way to tell which provider a user is connected to

### F15: User detail "Stremio Account Addons" heading ✅ FIXED
- **Was:** "Stremio Account Addons" → **Now:** "Account Addons"

### F16: "Clear all stremio account addons" confirm dialog ✅ FIXED
- **Was:** "Reset Stremio Addons" / "clear all addons from this user's Stremio account" → **Now:** "Reset Account Addons" / generic

### F17: "No Stremio addons found for this user" ✅ FIXED
- **Was:** "No Stremio addons found for this user" → **Now:** "No addons found for this user"

---

## Test Execution Log

### Phase 1: Smoke Test — All Pages Load ✅
| # | URL | Result | Issues |
|---|-----|--------|--------|
| 1.1 | `/login` | ✅ Loads | F1: Stremio subtitle |
| 1.2 | `/users` | ✅ Loads | F2: "Manage Stremio users" |
| 1.3 | `/groups` | ✅ Loads | F3: "Manage your Stremio groups" |
| 1.4 | `/addons` | ✅ Loads | F4: "Manage your Stremio addons" |
| 1.5 | `/invitations` | ✅ Loads | None |
| 1.6 | `/activity` | ✅ Loads | Minor: 404 on static asset |
| 1.7 | `/metrics` | ✅ Loads | None |
| 1.8 | `/settings` | ✅ Loads | None |
| 1.9 | `/tasks` | ✅ Loads | F11: "Stremio library" label |
| 1.10 | `/changelog` | ✅ Loads | None |

### Phase 2: Login Page ✅
| # | Result | Issues |
|---|--------|--------|
| 2.1 | ✅ User mode default | — |
| 2.2 | ✅ Subtitle present | F1: "Manage your Stremio library and addons" |
| 2.3 | ✅ Admin: "Go to Admin Panel" button | — |
| 2.4 | ✅ User: StremioOAuthCard with "Sign in with Stremio" | F5: No Nuvio option |
| 2.5 | ❌ No Nuvio login | F5 confirmed |
| 2.6 | ✅ Admin access works | — |
| 2.7 | N/A (no creds needed) | — |
| 2.8 | ✅ No console errors | — |

### Phase 3: UserAddModal — Provider Toggle
| # | Result | Issues |
|---|--------|--------|
| 3.1 | ✅ Modal opens | — |
| 3.2 | ✅ Provider toggle [Stremio][Nuvio] | — |
| 3.3 | ✅ Stremio selected state | — |
| 3.4 | ✅ Auth mode toggle [OAuth][Credentials] | — |
| 3.5 | ✅ StremioOAuthCard renders | — |
| 3.7 | ✅ Nuvio toggle shows NuvioLoginCard | F12: Username still says "Stremio Username", F13: Subtitle still says "Authenticate with Stremio OAuth" |
| 3.8 | ✅ Nuvio fields: "Nuvio Email", "Nuvio Password" | — |
| 3.9 | ✅ Button disabled when fields empty | — |
| 3.10 | ❌ **BUG-1: Validate button closes modal** | Critical — nested form bug |
| 3.10b | ❌ Cannot test — blocked by BUG-1 | — |
| 3.11 | ✅ Add User disabled when no nuvioUserId | — |
| 3.12 | ✅ Group dropdown present | — |

### Phase 4: Invitation Flow ✅ (with notes)
| # | Result | Issues |
|---|--------|--------|
| 4.1-4.2 | ✅ Invitation created (code: 559SZQ) | — |
| 4.4-4.6 | ✅ RequestAccessForm renders | — |
| 4.8-4.9 | ✅ Request submitted, "Request Pending" shown | — |
| 4.10-4.11 | ✅ Request accepted from admin | Toast: "Request accepted" |
| 4.12 | ⚠️ Shows "Request Renewed!" instead of "Request Accepted!" | See NOTE-1 below |
| 4.14 | ✅ "Choose a provider and authenticate to be added to Syncio." | — |
| 4.15 | ✅ Provider toggle [Stremio][Nuvio] present | — |
| 4.16 | ✅ Stremio: "Connect to Stremio" | — |
| 4.17 | ✅ Nuvio: NuvioLoginCard with "Sign in with Nuvio" | — |
| 4.18 | ✅ Fields: "Nuvio Email" + "Nuvio Password" | — |
| Nuvio complete | ✅ **Nuvio user created via invite flow!** | — |
| API verify | ✅ `/nuvio/validate` → 200, `/complete` → 200 | Correct request/response shapes |

**NOTE-1:** After accepting request and navigating back to `/invite/[code]`, the page showed "Request Renewed!" instead of "Request Accepted!". This may be because the page re-submitted the request form (409 duplicate), then polled status and got "accepted" but with no OAuth link, so it rendered the Renewed page. The end result works — user can still select provider and complete — but the title is confusing.

### Phase 7: User Detail — Nuvio User
| # | Result | Issues |
|---|--------|--------|
| 7.1 | ✅ Nuvio user "testuser" appears in users list | — |
| 7.2 | ❌ No provider type indicator | F14 |
| 7.3-7.4 | ✅ Detail panel opens, shows email/membership/invite | F14: no provider badge |
| 7.5 | — | Not tested yet |
| 7.6 | — | Not tested yet |
| Detail strings | ❌ "Stremio Account Addons" heading for Nuvio user | F15, F16, F17 |

---

## Tests Blocked by BUG-1

The following tests cannot be completed until BUG-1 is fixed:
- 3.10b: Valid Nuvio credentials validation in UserAddModal
- 3.11: Add User button enabled after validation
- Creating a Nuvio user via UserAddModal
- Any flow that uses NuvioLoginCard inside UserAddModal's form

**Note:** NuvioLoginCard works correctly on invite pages (no outer form nesting). BUG-1 is specific to UserAddModal.

### Phase 6: API Response Validation ✅
| # | Endpoint | Result |
|---|----------|--------|
| 6.1 | `POST /nuvio/validate` with `{}` | ✅ 400: `{"valid":false,"error":"Email and password are required"}` |
| 6.2 | `POST /nuvio/validate` with bad creds | ✅ 200: `{"valid":false,"error":"Invalid email or password"}` |
| 6.2b | `POST /nuvio/validate` with real creds | ✅ 200: `{"valid":true,"user":{"id":"fd0f5240-...","email":"themarvelfox@gmail.com"}}` |
| 6.3 | `POST /nuvio/connect` with `{}` | ✅ 400: `{"error":"userId, email, and password are required"}` |
| 6.4 | `POST /nuvio/connect-authkey` with `{}` | ✅ 400: `{"error":"Email and password are required"}` |

### Phase 10: Delete Account Flow
| # | Result | Issues |
|---|--------|--------|
| 10.1 | ✅ Page renders, title "Delete Your User" | — |
| 10.2 | ✅ Warning text present | — |
| 10.3 | ❌ "Clear all your Stremio addons" | F6 confirmed |
| 10.4 | ❌ Only "Connect to Stremio" button | F8 confirmed |
| 10.5 | ❌ No Nuvio delete path exists | F8 — Nuvio users cannot delete accounts |

### Phase 11: Edge Cases
| # | Result | Issues |
|---|--------|--------|
| 11.1 | ✅ Invalid invite code → "Wrong Invite Link" | Correct error message |
| 11.5 | ✅ Mobile responsive at 375px | Layout adapts, card view works, nav collapses to hamburger |
| 11.2-11.4 | Not tested (would need additional setup) | — |

### Phase 12: Network & Console Audit
| # | Result |
|---|--------|
| 12.1 | ✅ No 500 responses across all tested flows |
| 12.2 | ✅ No unexpected 404s on API calls |
| 12.3 | ✅ No CORS errors |
| 12.4 | ⚠️ Minor: 404 on favicon variants (android-chrome-192x192.png) |
| 12.5 | ✅ No unhandled promise rejections |
| 12.6 | ✅ No React key warnings observed |

---

## Full Issue Summary

### Critical (blocks core functionality)
| # | Issue | Fix Location |
|---|-------|-------------|
| **BUG-1** | NuvioLoginCard nested form in UserAddModal — validate button submits outer form | `NuvioLoginCard.tsx:47,77-78` — remove `<form>` wrapper, use `type="button"` + `onClick` |
| **BUG-2** | `createProvider is not defined` — ALL user syncs fail (Stremio + Nuvio) | `server/index.js` or `server/routes/users.js` — `createProvider` not injected into sync handler |
| **F5** | No Nuvio login option on `/login` user mode — Nuvio users can't log in | `LoginPage.tsx` — add provider toggle like invite pages |
| **F8** | Delete account page has no Nuvio path — Nuvio users can't delete accounts | `DeleteAccountPage.tsx` — add provider toggle + Nuvio auth |

### Medium (incorrect strings visible to users)
| # | Issue | Fix Location |
|---|-------|-------------|
| **F1** | Login subtitle: "Manage your Stremio library and addons" | `LoginPage.tsx` |
| **F2** | Users page: "Manage Stremio users for your group" | `GenericEntityPage.tsx` |
| **F3** | Groups page: "Manage your Stremio groups" | `GenericEntityPage.tsx` |
| **F4** | Addons page: "Manage your Stremio addons" | `GenericEntityPage.tsx` |
| **F6** | Delete page: "Clear all your Stremio addons" | `DeleteAccountPage.tsx` |
| **F11** | Tasks page: "Export a user's Stremio library" | Tasks page component |
| **F12** | UserAddModal: "Stremio Username" placeholder (even for Nuvio) | `UserAddModal.tsx` |
| **F13** | UserAddModal: "Authenticate with Stremio OAuth" subtitle doesn't update for Nuvio | `UserAddModal.tsx` |
| **F14** | No provider type badge in users list or detail view | User card/detail components |
| **F15** | User detail: "Stremio Account Addons" heading for Nuvio users | User detail component |
| **F16** | User detail: "Clear all stremio account addons" tooltip for Nuvio users | User detail component |
| **F17** | User detail: "No Stremio addons found" for Nuvio users | User detail component |

### Sync & Display Fixes ✅ FIXED
| # | Issue | Fix |
|---|-------|-----|
| **Badge stays "Unsynced"** | Cache key mismatch — `exact: true` didn't match full query key | Removed `exact: true` from `useSyncStatusRefresh.ts` |
| **"Unknown Addon" names** | Nuvio `setAddons()` stored `name: ''` for all addons | Pass addon name through in `nuvio.js` `setAddons()` and `addAddon()` |

### Low (cosmetic / edge cases)
| # | Issue |
|---|-------|
| Minor | 404 on `android-chrome-192x192.png` favicon |
| NOTE-1 | Completed invite page shows blank page (no "already completed" message) |
