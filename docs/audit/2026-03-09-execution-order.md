# RBAC Overhaul — Execution Order & Conflict Analysis
# 2026-03-09

Covers Tasks #1, #2 (2a + 2b), #4, #28 and the newly added S11/S12.
Each "Bundle" is a safe, independently deployable unit. Deploy in order; never skip ahead.

---

## Bundle Map

```
Bundle A  ──►  Bundle B  ──►  Bundle C  ──►  Bundle D  ──►  Bundle E
(types +       (JWT             (middleware    (frontend       (invite
 migration)     atomicity)       + guards)      guards)         modal)
```

Bundles C and D have no dependency on each other — they can be built in parallel once B is deployed.

---

## Bundle A — Foundation (types + schema)
**Must be one commit. Deploy first.**

### Files changed
| File | Change |
|------|--------|
| `shared/types/index.ts` | Add `HR_MANAGER` and `HR_STAFF` to `UserRole`; add `permissions?: string[]` to `AuthUser` interface |
| `shared/constants/index.ts` | Add `HR_STAFF_DEFAULT_PERMISSIONS` string array (17 feature keys) |
| `backend/src/types/index.ts` | Add `HR_STAFF` to the backend-local `UserRole` type; add `permissions?: string[]` to backend `AuthUser` |
| `backend/prisma/schema.prisma` | Add `HR_STAFF` to `UserRole` enum; add `permissions String[] @default([])` to `User`; add `permissions String[] @default([])` to `UserInvite` |
| Run `prisma migrate dev` | Generates and applies the migration SQL |
| Run `prisma generate` | Regenerates Prisma client so `user.permissions` is a known field in TypeScript |

### Why atomic
- `shared/types` and `backend/types` must be updated together — any file importing `UserRole` will TypeScript-error until both are consistent.
- `prisma migrate` + `prisma generate` must immediately follow the schema change — auth.service.ts (Bundle B) reads `user.permissions` from Prisma; if the client hasn't been regenerated, `user.permissions` is `undefined` and TypeScript won't compile.
- `HR_STAFF_DEFAULT_PERMISSIONS` must exist before Bundle C (requireAccess middleware imports it).

### Safe to deploy standalone?
**Yes.** The app runs identically after this bundle — no behaviour changes. Existing users get `permissions = []`, which is a no-op until `requireAccess` middleware (Bundle C) starts reading it.

---

## Bundle B — JWT atomicity
**Must be one commit. Deploy after Bundle A.**

### Files changed
| File | Change |
|------|--------|
| `backend/src/services/auth.service.ts` | Include `permissions: user.permissions` in both access token and refresh token `jwt.sign()` calls (lines 22–34, 54–70); update `getMe()` return to include `permissions` |
| `backend/src/middleware/authenticate.ts` | Add `permissions?: string[]` to `JwtPayload` interface (line 5) so `req.user.permissions` is typed throughout the app |
| `backend/src/controllers/auth.controller.ts` | Include `permissions` in the `/api/auth/me` response (line 52) |

### Conflict if split
If auth.service.ts is deployed without authenticate.ts:
- JWTs are signed with `permissions` but `req.user` is typed without it — TypeScript build fails.

If auth.service.ts + authenticate.ts are deployed without auth.controller.ts:
- JWTs carry permissions but `/auth/me` doesn't return them — frontend `authStore` never receives them, so `useAccess()` (Bundle D) always falls back to defaults, effectively giving every HR_STAFF user the default permission set regardless of what was configured at invite time. Silent correctness bug, not a crash.

All three must land together.

### Refresh token gap — specific risk
`auth.service.ts` has two signing paths: login (lines 22–34) and token refresh (lines 54–70). It is easy to update login and forget refresh. If the refresh path omits permissions, a user who has been logged in long enough for their access token to expire will lose their custom permissions after silent refresh and fall back to role defaults. **Update both paths.**

### Safe to deploy standalone?
**Yes.** Backend returns permissions in JWTs and /auth/me, but nothing consumes them yet (requireAccess doesn't exist until Bundle C, useAccess doesn't exist until Bundle D). Zero behaviour change for existing users.

---

## Bundle C — Middleware + route guards
**Deploy after Bundle B. Can be built in parallel with Bundle D.**

### Files changed
| File | Change |
|------|--------|
| `backend/src/middleware/requireAccess.ts` | New file — feature-level middleware; reads `req.user.permissions`; falls back to `HR_STAFF_DEFAULT_PERMISSIONS`; ADMIN bypasses unconditionally |
| `backend/src/services/users.service.ts` | On user create (acceptInvite + createDirect), write role-appropriate default permissions if none provided |
| `backend/src/routes/users.routes.ts` | S2: `requireRole('ADMIN')` on all mutating routes; S3: accept `role` + `permissions[]` from body, validate against enum |
| `backend/src/routes/notifications.routes.ts` | S4: `requireRole('ADMIN')` on `POST /trigger-scan` |
| `backend/src/routes/settings.routes.ts` | S5: `requireRole('ADMIN')` on `PATCH /org` and `POST /cache/clear` |
| `backend/src/routes/salaryBand.routes.ts` | S11: `requireRole('ADMIN', 'HR_MANAGER')` on `POST /` and `PUT /:id` |
| `backend/src/routes/jobArchitecture.routes.ts` | S12: `requireRole('ADMIN', 'HR_MANAGER')` on 7 unguarded POST/PUT endpoints |
| Routes using `requireAccess` | Apply `requireAccess('scenario.apply')` to scenario apply route, `requireAccess('ai_scan')` to trigger-scan if making it configurable |

### Ordering within Bundle C
1. Create `requireAccess.ts` **first** — route files that use it won't compile until it exists.
2. Update `users.service.ts` second — needed so newly created HR_STAFF users have correct default permissions in DB before invites go out.
3. All route guard patches can be done simultaneously after step 1.

### S11/S12 sub-note — can be deployed earlier
S11 and S12 only use `requireRole` (already exists). They have **no dependency on Bundles A or B** and could technically be deployed as a hotfix before this entire process starts. Recommended to still land them in Bundle C for cleanliness, but if there's urgency they are safe to deploy the moment the decision is made.

### Safe to deploy standalone?
**Yes, with one UX caveat.** Route guards now block HR_STAFF from ADMIN-only actions at the API layer. But Bundle D (frontend guards) isn't deployed yet — buttons and sidebar links are still visible. HR_STAFF users clicking "Apply Scenario" will see a 403 error toast instead of the button being hidden. Not broken, just rough UX. Acceptable for a short window between C and D deployments.

---

## Bundle D — Frontend access guards
**Deploy after Bundles A + B. Can be built in parallel with Bundle C.**

### Files changed
| File | Change |
|------|--------|
| `frontend/src/hooks/useAccess.ts` | New file — `useAccess(feature): boolean` hook; reads `authStore.user.permissions`; falls back to `HR_STAFF_DEFAULT_PERMISSIONS` for HR_STAFF; returns `true` for ADMIN |
| `frontend/src/components/layout/Sidebar.tsx` | Filter NAV_GROUPS items using `useAccess(feature)` — hide (not just disable) entries the user cannot access |
| `frontend/src/pages/ScenarioModelerPage.tsx` | Hide "Apply Scenario" button behind `useAccess('scenario.apply')` |
| `frontend/src/pages/NotificationsCenterPage.tsx` | Hide "Trigger AI Scan" behind `useAccess('ai_scan')` |
| `frontend/src/pages/EmployeeDirectoryPage.tsx` | Optionally gate "Delete Employee" behind `useAccess('employee.delete')` |
| `frontend/src/components/layout/ProtectedRoute.tsx` | No changes needed — route-level auth stays role-only |

### Dependency on Bundle B
`useAccess` reads `authStore.user.permissions`. The store is populated from `/auth/me`. If Bundle B hasn't been deployed, `user.permissions` is `undefined` and `useAccess` always returns the default for the role — HR_STAFF see defaults, ADMIN sees everything. No crash, slightly inaccurate for users with custom permission sets.

### Safe to deploy standalone?
**Yes.** Guards are additive — they only hide things. No functional path is removed.

---

## Bundle E — Invite modal rebuild
**Deploy last. Requires A + B + C + D to be live.**

### Files changed
| File | Change |
|------|--------|
| Frontend invite/user modal | Full rebuild: Step 1 (email + role), Step 2 (feature toggle panel, HR_STAFF only), Step 3 (confirmation summary) |
| `backend/src/routes/users.routes.ts` | Already updated in Bundle C (S3) to accept `permissions[]` from body |

### Why last
- Feature toggle UI reads `HR_STAFF_DEFAULT_PERMISSIONS` (Bundle A) to pre-populate.
- Submitting the form sends `permissions[]` to the invite endpoint (Bundle C).
- The HR Manager reviewing the toggles needs `useAccess('user.manage')` (Bundle D) to even see the invite modal.
- Deploying the toggle panel before Bundle C's backend support would send permissions to an endpoint that ignores them.

### Safe to deploy standalone?
**No.** The panel collects permissions and sends them to the backend — that flow only works end-to-end once Bundles A–D are all live. Do not deploy Bundle E in isolation.

---

## Conflict Matrix

| Step | Depends on | Blocked by if missing |
|------|------------|----------------------|
| Bundle A (types + migration) | Nothing | — |
| Bundle B (JWT) | Bundle A (Prisma types with `permissions`) | `user.permissions` is `undefined` from Prisma; TypeScript build error |
| Bundle C — `requireAccess.ts` | Bundle A (`HR_STAFF_DEFAULT_PERMISSIONS`) | Import fails; build error |
| Bundle C — route guards (S2–S5) | Nothing (use existing `requireRole`) | — |
| Bundle C — route guards (S11, S12) | Nothing (use existing `requireRole`) | — |
| Bundle C — `users.service.ts` defaults | Bundle A (Prisma `user.permissions` field) | `prisma.user.create` with `permissions` field fails at runtime |
| Bundle D — `useAccess` hook | Bundle A (shared types), Bundle B (/auth/me) | Hook exists but always returns defaults; custom permissions ignored |
| Bundle D — Sidebar + page guards | Bundle D's `useAccess` | — |
| Bundle E — invite modal | Bundles A + B + C + D | Feature toggles sent to endpoint that doesn't accept them (pre-C) |

---

## Specific conflicts found in the original execution order

The original step list (1–12) had three ordering issues:

**Issue 1 — Steps 4 and 5 were listed sequentially, not as a group**
`auth.service.ts` (step 4) and `authenticate.ts` (step 5) must be one commit. If 4 lands first, the TypeScript build fails because `JwtPayload` in authenticate.ts doesn't declare `permissions`. The refresh token path in auth.service.ts is also easy to miss — both the login and refresh sign calls must be updated in the same diff.

**Issue 2 — Step 3 (prisma migrate) was listed before step 2 (constants)**
This is fine for migration SQL itself, but `prisma generate` after the migration produces Prisma client types that `requireAccess.ts` (step 7) will import indirectly. If step 2's `HR_STAFF_DEFAULT_PERMISSIONS` isn't in shared constants yet when step 7 is written, the middleware import fails. Migrating and adding the constant should be treated as one bundle (Bundle A), not sequenced 2→3.

**Issue 3 — requireAccess (step 7) was listed before users.service.ts defaults (step 8)**
In production this is fine (users.service.ts defaults just means new users have cleaner DB data). But during development, if a developer creates a test HR_STAFF user before step 8 is done, that user gets `permissions = []` in the DB. The `requireAccess` middleware falls back to `HR_STAFF_DEFAULT_PERMISSIONS` for empty arrays, so access works correctly, but the DB record looks wrong and may confuse future debugging. Keeping 7 and 8 in the same bundle avoids this.

---

## Recommended commit sequence (summary)

```
[bundle-a] types: add HR_STAFF to UserRole, permissions to AuthUser; add HR_STAFF_DEFAULT_PERMISSIONS constant
[bundle-a] prisma: add HR_STAFF enum value and permissions field to User + UserInvite; run migrate + generate
[bundle-b] auth: include permissions in JWT payload (login + refresh) and /auth/me response
[bundle-b] middleware: add permissions to JwtPayload interface in authenticate.ts
[bundle-c] feat: add requireAccess middleware; write default permissions on user create
[bundle-c] security: add missing role guards — S2/S3/S4/S5/S11/S12
[bundle-d] feat: add useAccess hook; hide restricted sidebar items and action buttons
[bundle-e] feat: rebuild invite modal with role selector and feature permission toggles
```

S11 and S12 can be pulled out as `[hotfix] security: guard unprotected POST/PUT on salary bands and job architecture` and landed before Bundle A if needed urgently.
