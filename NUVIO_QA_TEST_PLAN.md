# Nuvio Integration — QA Test Plan

## Context

Syncio has completed a Nuvio provider integration alongside the existing Stremio provider. This test plan systematically validates every user-facing change: page rendering, provider toggling, invitation flows, string correctness, API responses, error handling, and edge cases.

**Environment:** Private mode (SQLite, `AUTH_ENABLED=false`, no admin credentials)
- Frontend: http://localhost:3000
- Backend: http://localhost:4000

**Tools:** Chrome DevTools MCP for browser automation, screenshots, network/console inspection.

### Test Data

**Nuvio Account:**
- Email: `themarvelfox@gmail.com`
- Password: `password123`

**Addon Manifest URLs:**
- `https://848b3516657c-usatv.baby-beamup.club/manifest.json`
- `https://torrentio.strem.fun/manifest.json`
- `https://comet.elfhosted.com/manifest.json`

**Admin Access:** No `SYNCIO_PRIVATE_USERNAME`/`SYNCIO_PRIVATE_PASSWORD` set — login page shows "Go to Admin Panel" button for direct access.

---

## Phase 1: Smoke Test — All Pages Load

For each page: navigate, take screenshot, check `list_console_messages` for JS errors.

| # | URL | Expected |
|---|-----|----------|
| 1.1 | `/login` | Login page renders. Title: "Welcome to Syncio". Mode toggle: "User" / "Admin" buttons. |
| 1.2 | `/users` | Users page loads. Title: "Users", description: "Manage Stremio users for your group". Empty state: "No users yet" / "Add your first user to get started." |
| 1.3 | `/groups` | Groups page loads. Title: "Groups", description: "Manage your Stremio groups". Empty state: "No groups yet" / "Create your first group to get started." |
| 1.4 | `/addons` | Addons page loads. Title: "Addons", description: "Manage your Stremio addons". Empty state: "No addons yet" / "Add your first addon to get started." |
| 1.5 | `/invitations` | Invitations page loads. |
| 1.6 | `/activity` | Activity page loads. |
| 1.7 | `/metrics` | Metrics dashboard loads. |
| 1.8 | `/settings` | Settings page loads. Theme selector present. |
| 1.9 | `/tasks` | Tasks page loads. |
| 1.10 | `/changelog` | Changelog page loads. |

**Known string issues to flag:**
- 1.2: Description says "Manage Stremio users" — should be generic now
- 1.3: Description says "Manage your Stremio groups" — should be generic now
- 1.4: Description says "Manage your Stremio addons" — should be generic now

---

## Phase 2: Login Page Deep Inspection

| # | Action | Expected Result |
|---|--------|-----------------|
| 2.1 | Navigate to `/login` | Page renders with "User" mode active by default |
| 2.2 | Check subtitle text | "Manage your Stremio library and addons" — **FLAG: Stremio-only language** |
| 2.3 | Click "Admin" mode toggle | "Go to Admin Panel" button appears (no credentials needed in private mode) |
| 2.4 | Click "User" mode toggle | StremioOAuthCard appears, button: "Sign in with Stremio" |
| 2.5 | Check for any Nuvio login option on user mode | **FLAG if missing:** No way for Nuvio users to log in from `/login` |
| 2.6 | Click "Go to Admin Panel" | Redirects to `/users` (admin dashboard) |
| 2.8 | Check console for errors | No unhandled exceptions |

---

## Phase 3: UserAddModal — Provider Toggle

| # | Action | Expected Result |
|---|--------|-----------------|
| 3.1 | Navigate to `/users`, click "Add User" button | Modal opens |
| 3.2 | Screenshot modal | Provider toggle visible: **[Stremio]** and **[Nuvio]** buttons in `grid grid-cols-2 gap-2` layout. Stremio selected by default. |
| 3.3 | Verify Stremio is selected state | Border: `border-blue-500`, bg: `bg-blue-50 dark:bg-blue-900/20`, font: `font-semibold` |
| 3.4 | Below provider toggle, verify auth mode toggle | **[Stremio OAuth]** and **[Credentials]** buttons. OAuth selected by default. |
| 3.5 | StremioOAuthCard renders | Button text: "Sign in with Stremio", loading state: "Generating link..." |
| 3.6 | Click "Credentials" auth mode | Shows: Email (placeholder: "Email"), Password (placeholder: "Password"), Auth Key (placeholder: "Auth Key") with "or" separator |
| 3.7 | Click **"Nuvio"** provider toggle | NuvioLoginCard appears |
| 3.8 | Verify NuvioLoginCard fields | Email label: "Nuvio Email", placeholder: "your@email.com". Password label: "Nuvio Password", placeholder: "Password". Button: "Validate Nuvio Credentials" |
| 3.9 | Submit Nuvio form with empty fields | Error: "Email and password are required" |
| 3.10 | Submit Nuvio form with invalid creds (e.g. `bad@test.com` / `wrong`) | API call to `POST /api/nuvio/validate`. Error displayed: "Invalid email or password" or "Invalid credentials" |
| 3.10b | Submit Nuvio form with real creds (`themarvelfox@gmail.com` / `password123`) | Success: "Nuvio account verified successfully." (green text). Submit button becomes enabled. |
| 3.11 | Verify submit button is disabled | "Add User" button should be disabled (opacity-50) when `nuvioUserId` is not set |
| 3.12 | Verify group dropdown present | "Group (optional)" with existing groups + "+ Create new group..." option |
| 3.13 | Check console for errors | No unhandled exceptions during all interactions |

---

## Phase 4: Invitation Flow — Full Lifecycle

### 4a: Create Invitation & Submit Request

| # | Action | Expected Result |
|---|--------|-----------------|
| 4.1 | Navigate to `/invitations`, click "Create Invitation" | Invitation form/modal appears |
| 4.2 | Create invitation with defaults | Invitation created, invite code visible |
| 4.3 | Copy invite link URL | URL format: `/invite/[inviteCode]` |
| 4.4 | Navigate to `/invite/[code]` in browser | RequestAccessForm renders |
| 4.5 | Verify form fields | Email (placeholder: "Email"), Username (placeholder: "Username") |
| 4.6 | Verify header | Icon: Mail, Title: "Request Access", Subtitle: "Enter your details to request access to this Syncio instance" |
| 4.7 | Submit with empty fields | Validation prevents submission |
| 4.8 | Fill email: "themarvelfox@gmail.com", username: "testuser", submit | Button: "Submit Request" → "Submitting..." → success |
| 4.9 | Verify pending state | Icon: Clock (yellow), Title: "Request Pending", Message: "Your request is pending approval. This page will automatically update when your request is reviewed." |

### 4b: Accept Request & Verify Provider Toggle

| # | Action | Expected Result |
|---|--------|-----------------|
| 4.10 | Navigate to `/invitations`, find the request | Request visible with "themarvelfox@gmail.com" / "testuser" |
| 4.11 | Click "Accept" on the request | Request status changes to accepted |
| 4.12 | Navigate back to `/invite/[code]` | **RequestAcceptedPage** renders |
| 4.13 | Verify header | Icon: CheckCircle (blue #3b82f6), Title: "Request Accepted!" |
| 4.14 | Verify instruction text | "Your request has been accepted. Choose a provider and authenticate to be added to Syncio." |
| 4.15 | Verify provider toggle present | **[Stremio]** and **[Nuvio]** buttons, Stremio selected by default |
| 4.16 | With Stremio selected | Button: "Connect to Stremio" or StremioOAuthCard auto-starts |
| 4.17 | Click **"Nuvio"** | NuvioLoginCard appears, button: "Sign in with Nuvio" |
| 4.18 | Verify NuvioLoginCard fields | "Nuvio Email" + "Nuvio Password" fields present |
| 4.19 | Toggle back to Stremio | StremioOAuthCard reappears |
| 4.20 | Check console for errors | No errors during toggle |

### 4c: Clear OAuth & Verify Renewed Page

| # | Action | Expected Result |
|---|--------|-----------------|
| 4.21 | Back to `/invitations`, find the accepted request | Request visible |
| 4.22 | Click "Clear OAuth" on the request | OAuth link cleared |
| 4.23 | Navigate to `/invite/[code]` | **RequestRenewedPage** renders |
| 4.24 | Verify header | Icon: RefreshCw (blue #3b82f6), Title: "Request Renewed!" |
| 4.25 | Verify instruction text | "Your request has been renewed. Choose a provider and authenticate to be added to Syncio." |
| 4.26 | Verify provider toggle | **[Stremio]** and **[Nuvio]** present, same layout as accepted page |
| 4.27 | Click Nuvio, verify card | NuvioLoginCard with "Sign in with Nuvio" |

---

## Phase 5: String Audit

Systematic check for hardcoded "Stremio" references that should be generic or provider-aware.

| # | Location | Current String | Issue? |
|---|----------|---------------|--------|
| 5.1 | `/login` subtitle (user mode) | "Manage your Stremio library and addons" | **YES** — Nuvio users see this too |
| 5.2 | `/login` user auth section | "Connect with Stremio to get started" | **YES** — no Nuvio option on login page |
| 5.3 | `/users` page description | "Manage Stremio users for your group" | **YES** — should be generic |
| 5.4 | `/groups` page description | "Manage your Stremio groups" | **YES** — should be generic |
| 5.5 | `/addons` page description | "Manage your Stremio addons" | **YES** — should be generic |
| 5.6 | UserAddModal Stremio tab | "Sign in with Stremio" | OK — provider-specific |
| 5.7 | UserAddModal Nuvio tab | "Validate Nuvio Credentials" | OK — provider-specific |
| 5.8 | NuvioLoginCard success | "Nuvio account verified successfully." | OK |
| 5.9 | RequestAcceptedPage instruction | "Choose a provider and authenticate to be added to Syncio." | OK — generic |
| 5.10 | RequestRenewedPage instruction | "Choose a provider and authenticate to be added to Syncio." | OK — generic |
| 5.11 | Delete account page warning | "Clear all your Stremio addons" | **YES** — Nuvio users see this too |
| 5.12 | User home toast | "Addon removed from Stremio account" | **YES** — should be generic |
| 5.13 | Email mismatch error (server) | "The Stremio account email does not match..." | **CHECK** — is this message used for Nuvio completion too? |
| 5.14 | Server error response | "User not connected to Stremio" vs "User not connected to a provider" | **CHECK** — should be generic |
| 5.15 | API route name | `/stremio-addons` | **CHECK** — was this renamed or aliased? |

---

## Phase 6: API Response Validation

Use `evaluate_script` with `fetch()` or `list_network_requests` + `get_network_request` to verify API responses.

### 6a: Nuvio Validate Endpoint

| # | Request | Expected Status | Expected Body |
|---|---------|----------------|---------------|
| 6.1 | `POST /api/nuvio/validate` with `{}` | 400 | `{ "valid": false, "error": "Email and password are required" }` |
| 6.2 | `POST /api/nuvio/validate` with `{ "email": "bad@test.com", "password": "wrong" }` | 200 | `{ "valid": false, "error": "Invalid email or password" }` |
| 6.2b | `POST /api/nuvio/validate` with `{ "email": "themarvelfox@gmail.com", "password": "password123" }` | 200 | `{ "valid": true, "user": { "id": "<uuid>", "email": "themarvelfox@gmail.com" } }` |

### 6b: Nuvio Connect Endpoint

| # | Request | Expected Status | Expected Body |
|---|---------|----------------|---------------|
| 6.3 | `POST /api/nuvio/connect` with `{}` | 400 | `{ "error": "userId, email, and password are required" }` |

### 6c: Nuvio Connect-Authkey Endpoint

| # | Request | Expected Status | Expected Body |
|---|---------|----------------|---------------|
| 6.4 | `POST /api/nuvio/connect-authkey` with `{}` | 400 | `{ "error": "Email and password are required" }` |

### 6d: Invitation Completion (Nuvio path)

| # | Request | Expected Status | Expected Body |
|---|---------|----------------|---------------|
| 6.5 | `POST /invite/complete` with `{ providerType: "nuvio" }` missing fields | 400 | `{ "error": "Email, username, nuvioEmail, and nuvioPassword are required for Nuvio" }` |
| 6.6 | `POST /invite/complete` with invalid Nuvio creds | 400 | `{ "error": "INVALID_AUTH_KEY", "message": "Could not validate Nuvio authentication. Please try again." }` |
| 6.7 | `POST /invite/complete` with mismatched email | 400 | `{ "error": "EMAIL_MISMATCH", "message": "The Stremio account email does not match the email used in your request" }` |

**Error code reference:**

| Code | Meaning |
|------|---------|
| `INVALID_AUTH_KEY` | Provider credentials failed validation |
| `EMAIL_NOT_AVAILABLE` | Provider returned null/undefined email |
| `EMAIL_MISMATCH` | Provider email doesn't match request email |
| `EMAIL_EXISTS` | Email already registered |
| `USERNAME_EXISTS` | Username already taken |

---

## Phase 7: Admin User Management — Both Providers

| # | Action | Expected Result |
|---|--------|-----------------|
| 7.1 | Navigate to `/users` | Users list page |
| 7.2 | Check if providerType column/badge shown in list | Verify if Stremio/Nuvio is visible per user |
| 7.3 | Click on a user row to open detail | Detail view renders |
| 7.4 | Check detail view for provider info | Provider type displayed somewhere (badge, label, field) |
| 7.5 | Click "Sync" on user | Sync runs. If creds invalid, error shown gracefully (no crash, toast with error) |
| 7.6 | Click "Delete" on user | Confirmation dialog → user removed. Toast: "User deleted successfully" |
| 7.7 | Verify user removed from list | No orphaned row |

---

## Phase 8: Groups & Addons — Provider-Agnostic CRUD

| # | Action | Expected Result |
|---|--------|-----------------|
| 8.1 | Navigate to `/groups`, create a group | Group created. Toast: "Group created successfully" |
| 8.2 | Navigate to `/addons`, add addons by URL: `https://torrentio.strem.fun/manifest.json`, `https://comet.elfhosted.com/manifest.json`, `https://848b3516657c-usatv.baby-beamup.club/manifest.json` | Each addon created. Toast: "Addon created successfully" |
| 8.3 | Open group detail, add addon to group | Addon linked |
| 8.4 | Add user(s) to group | User(s) appear in group members |
| 8.5 | Click "Sync" on group | Sync runs for all users in group |
| 8.6 | Open addon detail page | Manifest info displayed, no crashes |
| 8.7 | Delete addon | Toast: "Addon deleted successfully" |
| 8.8 | Delete group | Toast: "Group deleted successfully" |

---

## Phase 9: User-Facing Pages (Authenticated User View)

| # | Action | Expected Result |
|---|--------|-----------------|
| 9.1 | Navigate to `/user/home` | If not authed, redirect to `/login`. If authed, shows home page. |
| 9.2 | Check user home page | Title: "Home", Subtitle: "Overview of your profile and addons". Stats cards: Addons, Days Left, Movies (-), Series (-), Hours (-). |
| 9.3 | Check "Your Addons" section | Header: "Your Addons" (uppercase). Empty state: "No addons found" / "Click the + button to add your first addon!" |
| 9.4 | Click + to add addon | Modal: Title "Add New Addon", input placeholder: `https://... or stremio://...` |
| 9.5 | Navigate to `/user/settings` | Title: "Settings". Sections: Discord Webhook, Activity Visibility, API Access, Appearance. |
| 9.6 | Check theme selector | 9 themes: Aurora, Aubergine, Cafe, Choco Mint, Hoth, Light, Midnight, Nightfall, Ochin |
| 9.7 | Navigate to `/user/library` | Library page loads, shows items or empty state |
| 9.8 | Navigate to `/user/activity` | Activity page loads |
| 9.9 | Navigate to `/user/shares` | Shares page loads |

---

## Phase 10: Delete Account Flow

| # | Action | Expected Result |
|---|--------|-----------------|
| 10.1 | Navigate to `/invite/delete` | Page renders. Title: "Delete Your User", Icon: Trash2 (red) |
| 10.2 | Verify warning text | "This action cannot be undone. Deleting your user will:" → "Remove you from all groups" + "Clear all your Stremio addons" |
| 10.3 | **FLAG:** "Clear all your Stremio addons" | Should be generic for Nuvio users |
| 10.4 | Verify connect button | "Connect to Stremio" (red background #ef4444) |
| 10.5 | **FLAG:** No Nuvio delete flow | Is there a way for Nuvio users to delete their account? |

---

## Phase 11: Edge Cases & Error Handling

| # | Scenario | Action | Expected |
|---|----------|--------|----------|
| 11.1 | Invalid invite code | Navigate to `/invite/INVALID123` | Error: Icon XCircle (red), Title: "Wrong Invite Link", Message: "The request ID you're trying to access doesn't exist or is invalid. Please check your invitation link." |
| 11.2 | Disabled invitation | Disable an invitation, visit its invite link | Error: Title: "Invite Link Disabled", Message: "This invitation has been disabled by the administrator. The invitation needs to be enabled back or a new one generated." |
| 11.3 | Duplicate email on invite | Submit request with already-used email | Error: "This email is already registered" (`EMAIL_EXISTS`) |
| 11.4 | Duplicate username on invite | Submit request with already-used username | Error: "This username is already taken" (`USERNAME_EXISTS`) |
| 11.5 | Mobile responsive | Resize to 375px width | Provider toggles still usable, forms not cut off, navigation collapses |
| 11.6 | Provider null (legacy user) | User with `providerType: null` in DB | Treated as Stremio (factory defaults to `'stremio'`) |
| 11.7 | Provider with no creds | User with `providerType: 'nuvio'` but `nuvioRefreshToken: null` | `createProvider()` returns null → error: "User not connected to a provider" |

---

## Phase 12: Network & Console Error Audit

After all test phases, review accumulated network traffic and console output.

| # | Check | Method |
|---|-------|--------|
| 12.1 | No 500 responses | `list_network_requests` — filter for status >= 500 |
| 12.2 | No unexpected 404s | Filter for 404s that aren't intentional test cases |
| 12.3 | No CORS errors | Check console for CORS-related messages |
| 12.4 | No missing assets | Check for failed image/font/CSS loads |
| 12.5 | No unhandled promise rejections | `list_console_messages` — filter for "Unhandled" or "rejected" |
| 12.6 | No React key warnings | Filter console for "unique key" warnings |
| 12.7 | No deprecated API warnings | Filter console for deprecation notices |

---

## Phase 13: Sync Engine Verification (Code-Level)

These are verified via server logs or unit tests, not browser.

| # | Scenario | Expected |
|---|----------|----------|
| 13.1 | Stremio user sync | `createManifestFingerprint(fn, { urlOnly: false })` — URL + manifest JSON |
| 13.2 | Nuvio user sync | `createManifestFingerprint(fn, { urlOnly: true })` — URL only |
| 13.3 | Legacy user (providerType null) | Defaults to Stremio → full fingerprint |
| 13.4 | Activity monitor | Prisma `OR: [{ stremioAuthKey: { not: null } }, { nuvioRefreshToken: { not: null } }]` |

---

## Summary of Known Issues to Flag

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| F1 | "Manage your Stremio library and addons" on login page | Medium | `LoginPage.tsx` subtitle |
| F2 | "Manage Stremio users for your group" | Medium | `GenericEntityPage.tsx` — users description |
| F3 | "Manage your Stremio groups" | Medium | `GenericEntityPage.tsx` — groups description |
| F4 | "Manage your Stremio addons" | Medium | `GenericEntityPage.tsx` — addons description |
| F5 | No Nuvio login option on `/login` user mode | High | `LoginPage.tsx` — only StremioOAuthCard |
| F6 | "Clear all your Stremio addons" on delete page | Medium | `DeleteAccountPage.tsx` |
| F7 | "Addon removed from Stremio account" toast | Low | User home page |
| F8 | Delete account flow has no Nuvio path | High | `/invite/delete` — only Stremio OAuth |
| F9 | EMAIL_MISMATCH error says "Stremio account email" for Nuvio too | Medium | `invitations.js` completion flow |
| F10 | Some server errors say "User not connected to Stremio" instead of generic | Low | Various user route handlers |

---

## Execution Checklist

- [ ] Phase 1: Smoke test all 10 pages
- [ ] Phase 2: Login page deep inspection
- [ ] Phase 3: UserAddModal provider toggle
- [ ] Phase 4: Full invitation lifecycle (create → request → accept → renew)
- [ ] Phase 5: String audit (15 locations)
- [ ] Phase 6: API response validation (7 endpoints)
- [ ] Phase 7: Admin user management
- [ ] Phase 8: Groups & addons CRUD
- [ ] Phase 9: User-facing pages
- [ ] Phase 10: Delete account flow
- [ ] Phase 11: Edge cases (7 scenarios)
- [ ] Phase 12: Network & console error audit
- [ ] Phase 13: Sync engine verification
- [ ] Flag all findings from "Known Issues" table
