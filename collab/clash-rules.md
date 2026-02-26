# Clash Rules — High-Risk Shared Files

> These files are dangerous to edit without coordination. If you need to change one,
> post in the team channel, update `features.json` with `"clash_with"` references,
> and mark the file as `"locked": true` in `file-ownership.json` while working on it.

---

## Tier 1: CRITICAL — Never Edit Alone

Changes to these files have global blast radius. Both devs must review before merging.

### `backend/prisma/schema.prisma`
- **Why**: Single source of truth for the entire database. Any model/field change requires a new `prisma migrate dev` run, generating a SQL migration file.
- **Impact**: All 15 backend services, Prisma client types, seed scripts.
- **Rule**: Discuss schema changes in advance. One person writes the migration, the other pulls and runs `npx prisma migrate dev` immediately after merging.

### `backend/prisma/migrations/`
- **Why**: Version-controlled SQL files. These are append-only — never edit existing migration files.
- **Rule**: Only Prisma CLI creates files here. If a migration went wrong, create a new corrective migration. Never delete or edit existing .sql files.

### `backend/.env`
- **Why**: Contains database URL, Redis URL, JWT secrets, Claude API key. A wrong value crashes the server instantly.
- **Rule**: Each dev maintains their own `.env` locally. Only coordinate when adding a NEW required variable — document it in `.env.example`.

### `shared/types/index.ts`
- **Why**: Imported by ~40+ files across backend and frontend. Every interface lives here.
- **Impact**: Changing a field name or type cascades to every file that uses that interface. TypeScript will catch it, but it can mean 10+ files need simultaneous updates.
- **Rule**: Adding new fields to existing interfaces is safe. Renaming or removing fields is a coordinated change — both devs need to update all usages in one commit.

### `shared/constants/index.ts`
- **Why**: Defines band configs, socket event names (SOCKET_EVENTS), AI insight configs, RSU tiers — used by both backend services and frontend components.
- **Rule**: Socket event name changes require updating both `backend/src/lib/socket.ts` emit calls and `frontend/src/hooks/useSocket.ts` listeners simultaneously.

---

## Tier 2: HIGH — Coordinate Before Editing

These files are structural. Breakage won't always be caught by TypeScript.

### `backend/src/app.ts`
- **Why**: Mounts all 16 route modules. Controls CORS origin list, rate limiting, static file serving, and error handler.
- **Clash risk**: Adding a route here without matching file = 500 at startup. Changing CORS breaks tunnel access.

### `backend/src/index.ts`
- **Why**: Server bootstrap. Connects to DB, Redis, Socket.io. Handles graceful shutdown.
- **Clash risk**: Changing startup order (e.g., routes before DB connection) causes race conditions.

### `backend/src/lib/prisma.ts`
- **Why**: Prisma singleton. All 15 services import `{ prisma }` from here.
- **Clash risk**: Any change here affects every single database query in the app.

### `backend/src/lib/redis.ts`
- **Why**: Redis singleton + `cacheGet`, `cacheSet`, `cacheDel`, `cacheDelPattern` helpers. Used by 10+ services.
- **Clash risk**: Changing the cache key format or TTL logic affects cached data consistency.

### `backend/src/lib/socket.ts`
- **Why**: Socket.io instance + all typed emit helpers (`emitNotification`, `emitPayAnomaly`, etc.).
- **Clash risk**: Changing an emit helper signature breaks callers in controllers. Changing CORS for Socket.io breaks live updates.

### `backend/src/lib/logger.ts`
- **Why**: Winston logger singleton imported by all services + middleware.
- **Clash risk**: Changing log format or transports affects all log output. Changing the file path breaks log redirection.

### `backend/src/middleware/authenticate.ts`
- **Why**: Every protected endpoint depends on this. It populates `req.user`.
- **Clash risk**: Changing the `req.user` shape breaks all controllers that read `req.user.userId`, `req.user.role`, etc.

### `backend/src/middleware/errorHandler.ts`
- **Why**: Global error handler. All unhandled errors flow through here.
- **Clash risk**: Changing the error response format breaks frontend error parsing.

### `frontend/src/App.tsx`
- **Why**: Defines all 15 routes and their lazy imports. Contains `ProtectedRoute` wrapper.
- **Clash risk**: A bad import path here = blank screen on that route. Route path changes need to match Sidebar nav links.

### `frontend/src/main.tsx`
- **Why**: React root mount. Wraps app in QueryClientProvider, BrowserRouter, ThemeProvider, Toaster.
- **Clash risk**: Provider order matters. Missing a provider = crashes in any component that uses it.

### `frontend/src/lib/api.ts`
- **Why**: Axios instance used by ALL frontend API calls. Contains token injection, 401 detection, silent refresh, and request queue.
- **Clash risk**: Changing `baseURL` bakes the wrong URL at build time (Vite inlines VITE_API_URL). Auth interceptor bugs = all API calls fail silently.

### `frontend/src/store/authStore.ts`
- **Why**: Zustand store with sessionStorage persistence. Holds `user`, `accessToken`, `refreshToken`, `isAuthenticated`.
- **Clash risk**: Changing the persisted key name or store shape = all existing sessions invalidated, users logged out.

### `frontend/src/lib/queryClient.ts`
- **Why**: React Query client config — controls global staleTime, retry logic, cache behavior.
- **Clash risk**: Changing `staleTime: 0` = all queries refetch constantly. Changing `retry` = failed requests handled differently.

### `frontend/src/hooks/useSocket.ts`
- **Why**: Sets up all Socket.io listeners. Listens for `employee:created`, `employee:updated`, `import:progress`, etc. Triggers React Query invalidations.
- **Clash risk**: Must stay in sync with socket event names emitted by `backend/src/lib/socket.ts`.

---

## Tier 3: MEDIUM — Lock the File While Working

These files don't break the whole system but create merge conflicts if both devs touch them.

### `backend/package.json` + `frontend/package.json`
- **Why**: Dependency additions/removals require `npm install` on both devs' machines.
- **Rule**: After adding a package, immediately commit `package-lock.json`. Message the other dev to run `npm install`.

### `backend/tsconfig.json`
- **Why**: Compiler settings. Changing `rootDir`, `outDir`, or `paths` changes the build output structure entirely.
- **Known fix**: `rootDir` must be `./src` (not `..`) — do not revert this.

### `frontend/vite.config.ts`
- **Why**: Configures the dev proxy (`/api` → `localhost:3001`) and chunk splitting.
- **Rule**: Proxy changes affect all dev-mode API calls. Chunk splitting changes affect bundle filenames.

### `frontend/.env`
- **Why**: Vite inlines `VITE_*` vars at build time. A wrong value gets baked into the bundle.
- **Critical rule**: Do NOT add `VITE_API_URL` or `VITE_SOCKET_URL` — these break tunnel/production mode. The code handles relative URLs automatically.

### `backend/.env.example`
- **Why**: Documents required env vars. If a new required var is added to `.env`, it MUST be added here.

---

## Files Detected as High-Import (>3 Importers)

Based on codebase analysis:

| File | Estimated Importers | Notes |
|---|---|---|
| `shared/types/index.ts` | 40+ | Every controller, service, frontend page |
| `shared/constants/index.ts` | 20+ | Services, frontend pages, hooks |
| `backend/src/lib/prisma.ts` | 15 | All backend services |
| `backend/src/lib/logger.ts` | 12+ | Services, middleware, index.ts |
| `backend/src/lib/redis.ts` | 10+ | AI insights, dashboard, pay equity, performance services |
| `backend/src/lib/socket.ts` | 8+ | Employee, import, scenario, dashboard controllers |
| `backend/src/middleware/authenticate.ts` | 16 | Every route file |
| `frontend/src/lib/api.ts` | 15+ | All frontend services + some pages directly |
| `frontend/src/store/authStore.ts` | 10+ | All pages via useAuth hook |
| `frontend/src/hooks/useAuth.ts` | 8+ | Pages, ProtectedRoute, AppShell |
| `frontend/src/lib/utils.ts` | 8+ | All pages (cn, formatCurrency, formatRelativeTime) |
| `frontend/src/lib/queryClient.ts` | 1 (main.tsx) | Entry-point level impact |

---

## Quick Coordination Checklist

Before touching a Tier 1 or Tier 2 file:

- [ ] Tell the other dev what you're changing and why
- [ ] Update `collab/features.json` — add/update the feature entry with `"files_affected"` and `"clash_with"`
- [ ] Set `"locked": true` in `collab/file-ownership.json` for the file
- [ ] Create a focused branch (`feat/xxx` or `fix/xxx`)
- [ ] After merging: unset `"locked": false`, update feature status to `"done"`
