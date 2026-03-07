# Codebase Audit — 2026-03-07

Full audit performed by 6 parallel agents covering backend services, frontend pages, auth/middleware, socket/cache layer, and shared types/schema.

---

## 🔴 SECURITY

| ID | File | Line | Issue |
|----|------|------|-------|
| S1 | `backend/src/middleware/authenticate.ts` | 31 | JWT secret has hardcoded fallback `'fallback-secret'` — forgeable tokens if `JWT_SECRET` env var is unset |
| S2 | `backend/src/routes/users.routes.ts` | 18–114 | No RBAC on user management — any authenticated user (VIEWER) can create, delete, deactivate other users |
| S3 | `backend/src/routes/users.routes.ts` | 126 | Every invite hardcodes `role: 'ADMIN'` — any authenticated user can grant admin access |
| S4 | `backend/src/routes/notifications.routes.ts` | 18 | `POST /trigger-scan` missing `requireRole('ADMIN')` — any user can spam the Anthropic API |
| S5 | `backend/src/routes/settings.routes.ts` | 29–76 | `PATCH /settings/org` and `POST /settings/cache/clear` missing role guard |
| S6 | `backend/src/lib/socket.ts` | 42–48 | Server never validates socket auth token — unauthenticated clients receive all broadcast events |
| S7 | `frontend/src/pages/SentMailsPage.tsx` | 86 | `dangerouslySetInnerHTML` renders unsanitized email HTML — stored XSS vector |
| S8 | `backend/src/services/email.service.ts` | 75 | Plaintext password embedded in email body and travels in request body |
| S9 | `backend/src/middleware/requireRole.ts` | 19 | 403 response leaks user's actual role in message body |
| S10 | `backend/src/lib/redis.ts` | 24–47 | Cache helpers have no try/catch — Redis failure causes 500s instead of graceful degradation |

### Fixes

**S1** — Remove fallback; add startup guard in `index.ts`:
```typescript
if (!process.env.JWT_SECRET) { logger.error('FATAL: JWT_SECRET not set'); process.exit(1); }
```

**S2/S3/S4/S5** — Add `requireRole('ADMIN')` after `authenticate` on all mutating routes. Accept `role` from request body in invite endpoint instead of hardcoding `'ADMIN'`.

**S6** — Add socket middleware to verify token on handshake:
```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    (socket as any).user = payload;
    next();
  } catch { next(new Error('Invalid token')); }
});
```

**S7** — Sanitize with DOMPurify or render in `<iframe srcdoc>`.

**S8** — Replace send-credentials flow with the existing invite/reset-token flow.

**S9** — Change to: `message: 'Access denied. Insufficient permissions.'`

**S10** — Wrap each helper in try/catch returning `null` on cacheGet and swallowing errors on cacheSet/cacheDel.

---

## 🔴 CRITICAL LOGIC BUGS

| ID | File | Line | Issue |
|----|------|------|-------|
| L1 | `backend/src/services/scenarios.service.ts` | 168–196 | `apply()` bulk-writes employee salaries with no cache busting, no socket events, `annualCtc` not updated, `compaRatio` not recalculated |
| L2 | `backend/src/services/scenarios.service.ts` | 157–164 | `run()` overwrites `snapshotData` on every preview — destroys the original baseline |
| L3 | `backend/src/services/rsu.service.ts` | 45–47 | RSU eligibility check rejects P1 — threshold is `< P2` but CLAUDE.md says P1+ is eligible |
| L4 | `backend/src/services/aiInsights.service.ts` | 259–267 | `filtersHash` computed but never used in DB `findFirst` — wrong cached insight returned for filtered queries |
| L5 | `backend/src/services/scenario.service.ts` | — | Dead files (`scenario.service.ts`, `scenario.controller.ts`, `scenario.routes.ts`) never mounted in `app.ts` — parallel dead implementation |
| L6 | `frontend/src/components/employees/AddEmployeeModal.tsx` | 127 | `employeeId` from `Date.now().slice(-6)` — not unique under concurrent use, collides with CSV-imported `EMP001–EMP200` range |
| L7 | `backend/src/services/dashboard.service.ts` | 235 | Low-performer count queries all cycles for all employees with no `ACTIVE` filter — inflated |
| L8 | `frontend/src/pages/UserSettingsPage.tsx` | 113–116 | "Last Login" is `new Date()` (always now) — never reads actual `lastLoginAt` from API |

### Fixes

**L1** — After apply loop in `scenarios.service.ts`:
```typescript
await invalidateEmployeeDerivedCaches(); // or cacheDelPattern calls
emitEmployeeDataChanged();
emitDashboardRefresh();
// Also call computeAndUpdateDerivedFields per affected employee
```

**L2** — Only write `snapshotData` if scenario is in DRAFT and `snapshotData` is null.

**L3** — Change threshold: `bandIdx < BAND_ORDER.indexOf('P1')` (index 2 → allows P1+).

**L4** — Include `filtersHash` in the `findFirst` where clause.

**L5** — Delete `scenario.service.ts`, `scenario.controller.ts`, `scenario.routes.ts`.

**L6** — Remove client-side `employeeId` generation; let backend assign it, or use `crypto.randomUUID()`.

**L7** — Filter to active employees and latest cycle only.

**L8** — Use `user?.lastLoginAt` from the auth store / `/api/auth/me` response.

---

## 🟠 DATA STALENESS — Cache & Socket Gaps

| ID | Description | Files |
|----|-------------|-------|
| D1 | `employee.service.delete` only emits `dashboard:refresh` — employees list, pay-equity, performance pages don't update on delete | `employee.service.ts:101` |
| D2 | `benefits.service.enroll` writes `EmployeeBenefit` but never calls `cacheDel` — stale utilization for up to 2 min | `benefits.service.ts:111–119` |
| D3 | `performance.service.createRating` writes new rating but never busts `performance:ai-analysis` (30-min TTL) | `performance.service.ts:25–31` |
| D4 | `budget:threshold` socket event shows toast only — no query invalidation | `useSocket.ts:49–54` |
| D5 | `rsu:vesting` socket event shows toast only — RSU and dashboard pages stay stale | `useSocket.ts:56–61` |
| D6 | `import:progress` emitted per batch by backend but no frontend listener — no real-time upload progress % | `import.service.ts:722` |
| D7 | `SOCKET_EVENTS.DATA_REFRESH_MODULES` declared but never emitted or handled — dead constant | `backend/src/types/index.ts:86` |
| D8 | `salary-bands:*` busted in 4 places but no service ever writes to that prefix — all 4 `cacheDelPattern` calls are no-ops | `employee.service.ts`, `salaryBand.service.ts`, `import.service.ts` |

### Fixes

**D1** — Add `emitEmployeeDataChanged()` in `employeeService.delete` after cache busts.

**D2** — Add after `enroll` write:
```typescript
await Promise.all([cacheDel('benefits:utilization'), cacheDel('benefits:catalog')]);
```

**D3** — Add `cacheDel('performance:ai-analysis')` in `createRating` after upsert.

**D4/D5** — Add `queryClient.invalidateQueries` calls in the socket listeners:
```typescript
// budget:threshold
queryClient.invalidateQueries({ queryKey: ['dashboard'] });
// rsu:vesting
queryClient.invalidateQueries({ queryKey: ['dashboard'] });
queryClient.invalidateQueries({ queryKey: ['rsu'] });
```

**D6** — Add `socket.on('import:progress', ...)` handler in `useSocket.ts`; surface progress in `DataCenterPage`.

**D7** — Remove `DATA_REFRESH_MODULES` from `SOCKET_EVENTS` or implement it.

**D8** — Either add caching to `salaryBandService` using those key prefixes, or remove the dead `cacheDelPattern('salary-bands:*')` calls.

---

## 🟠 TYPE & SCHEMA DRIFT

| ID | File | Line | Issue |
|----|------|------|-------|
| T1 | `shared/types/index.ts` | 48 | `UserRole` enum missing `HR_MANAGER` — frontend role checks mishandle HR Manager users |
| T2 | `shared/types/index.ts` | 140–176 | Prisma `Decimal` fields typed as `number` but arrive from API as strings — implicit coercion, fragile |
| T3 | `shared/constants/index.ts` | 70–74 | `RSU_ELIGIBILITY.MIN_BAND_LEVEL: 4` (P2) contradicts CLAUDE.md (P1 is minimum) |
| T4 | `frontend/src/pages/BenefitsManagementPage.tsx` | 483 | Renders `e.employee?.designation` but `designation` not selected in `getEnrollments` query — always `undefined` |
| T5 | `frontend/src/pages/EmployeeProfilePage.tsx` | 43–50 | Handles `TERMINATED` status in UI but it's not in the Prisma `EmploymentStatus` enum |
| T6 | Multiple | — | `BAND_ORDER` hardcoded inline in `import.service.ts:600`, `rsu.service.ts:6`, `benefits.service.ts:88`, `backend/src/types/index.ts:68` — violates "never hardcode band arrays" rule. Frontend: `VariablePayPage.tsx:68`, `PayEquityPage.tsx:33`, `EmployeeDirectoryPage.tsx:15` also hardcode `BANDS` |

### Fixes

**T1** — Add `HR_MANAGER = 'HR_MANAGER'` to `UserRole` enum in `shared/types/index.ts`.

**T2** — Type Decimal fields as `number | string` or add a parsing helper; avoid strict `===` comparisons.

**T3** — Change to `MIN_BAND_LEVEL: 2` (index of P1 in BAND_ORDER) to match L3 fix above.

**T4** — Add `designation: true` to the `select` in `getEnrollments` Prisma query.

**T5** — Add `TERMINATED = 'TERMINATED'` to Prisma schema and run a migration, or remove from UI.

**T6** — Delete inline arrays; import `BAND_ORDER` from `shared/constants/index.ts` everywhere.

---

## 🟡 FRONTEND UX & CODE QUALITY

| ID | File | Line | Issue |
|----|------|------|-------|
| F1 | `frontend/src/pages/SettingsPage.tsx` | 141–146 | "Save Changes" and "Reset to Defaults" buttons are no-ops — stale predecessor to `PlatformSettingsPage.tsx` |
| F2 | `frontend/src/pages/SettingsPage.tsx` | 276–300 | Notification toggles have no handler — clicking does nothing |
| F3 | `frontend/src/pages/PayEquityPage.tsx` | 417–419 | Empty outliers result shows endless loading skeleton instead of empty state |
| F4 | `frontend/src/pages/EmployeeDirectoryPage.tsx` | 46 | Delete `onSuccess` invalidates `['employees', {}]` — doesn't match active query key; should use `['employees']` prefix |
| F5 | `frontend/src/pages/PerformancePage.tsx` | 70, 74 | Raw keys `'promotion'`/`'gaps'` don't match canonical `queryKeys.performance.promotionReadiness` (`'promotion-readiness'`) and `payAlignmentGaps` (`'pay-alignment-gaps'`) |
| F6 | `frontend/src/pages/VariablePayPage.tsx` | 9 | Query key `['employees-vp']` never matched by socket invalidation (`['employees']` prefix) |
| F7 | `frontend/src/pages/ScenarioModelerPage.tsx` | 312 | Delete button missing `disabled={deleteMutation.isPending}` — duplicate DELETE on double-click |
| F8 | `frontend/src/pages/SalaryBandDesignerPage.tsx` | 51 | `selectedBand` state set on click but never read — dead state |
| F9 | `frontend/src/pages/PlatformSettingsPage.tsx` | 820 | Hardcoded `http://localhost:3001` displayed in API tab — wrong in tunnel/production |
| F10 | `frontend/src/components/ChatPanel.tsx` | 79 | `assistantIdx` declared but never used — dead variable |
| F11 | `frontend/src/hooks/useSocket.ts` | 21, 25 | `console.log` fires unconditionally on every connect/disconnect in production |
| F12 | `frontend/src/lib/api.ts` | 6 | Reads `VITE_API_URL` env var that CLAUDE.md explicitly prohibits — replace with `const BASE_URL = '/api'` |
| F13 | `frontend/src/pages/NotificationsCenterPage.tsx` | 51–57 | Per-notification mark-read decrements Zustand counter by 1 instead of re-syncing from API — drifts |
| F14 | `frontend/src/pages/DataCenterPage.tsx` | 276–293 | Valid benefit names list is hardcoded — fetch from `GET /benefits/catalog` instead |
| F15 | `frontend/src/pages/BenefitsManagementPage.tsx` | 71–80 | `importMutation` missing `onError` handler — failed imports may show no feedback |

---

## N+1 Query Problems

| ID | File | Line | Description |
|----|------|------|-------------|
| N1 | `backend/src/services/import.service.ts` | 525–530 | `buildEmployeeData` calls `prisma.employee.findFirst` per row inside import loop — up to 1000 sequential queries |
| N2 | `backend/src/services/benefits.service.ts` | 210 | `importUtilizationData` calls `prisma.employee.findFirst` per row — N roundtrips when catalog is pre-loaded |
| N3 | `backend/src/services/scenarios.service.ts` | 181–193 | `apply()` calls `prisma.employee.update` sequentially per employee — 200 sequential writes for full-org scenario |

### Fix pattern for N1/N2:
Pre-load all employees into a Map before the loop:
```typescript
const employees = await prisma.employee.findMany({ select: { id: true, employeeId: true, email: true } });
const employeeMap = new Map([
  ...employees.map(e => [e.employeeId.toLowerCase(), e.id] as const),
  ...employees.map(e => [e.email.toLowerCase(), e.id] as const),
]);
// then use employeeMap.get(rawId) inside the loop — zero DB calls per row
```

---

## Recommended Fix Order

### Immediate (security + broken features)
1. S1 — JWT secret fallback
2. S2/S3/S4/S5 — missing RBAC on users, trigger-scan, settings
3. L3 + T3 — RSU P1 eligibility (one-line fix in service + constants)
4. T1 — `UserRole` missing `HR_MANAGER`
5. F4 — delete invalidation key shape
6. L1 — scenario apply: add cache bust + socket emit + annualCtc + derived fields

### Next sprint (data integrity)
7. S6 — socket auth
8. S7 — XSS in SentMails
9. L4 — aiInsights filtersHash
10. L7 — dashboard low-perf count
11. D1 — employee delete missing socket emit
12. D2 — benefits enroll missing cache bust
13. D3 — createRating missing cache bust
14. T4 — designation not selected in enrollments query
15. L8 — last login hardcoded

### Maintenance
16. L5 — delete dead scenario.* files
17. L6 — employeeId generation in AddEmployeeModal
18. T6 — replace all hardcoded BAND_ORDER arrays
19. D4/D5 — budget:threshold and rsu:vesting invalidations
20. F1/F2 — dead SettingsPage (consider removing from router)
21. F5/F6 — PerformancePage and VariablePayPage query keys
22. N1/N2/N3 — N+1 query fixes
23. Remaining F-series items
