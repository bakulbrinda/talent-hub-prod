# Talent Hub — Project Reference for Claude Code

> Auto-generated architecture document. Update when making structural changes.
> Root path: `/Users/bakulbrindachakravarty/Desktop/Hackathon /` (note: trailing space in folder name)

---

## Project Overview

**Talent Hub** (formerly CompSense) is an AI-driven Compensation & Benefits Intelligence Platform for HR teams. It provides real-time pay equity analysis, scenario modeling, RSU tracking, AI-generated insights via Claude, and live notifications via Socket.io.

- **Backend**: Node.js (port 3001) — serves both the API and the built frontend static files
- **Frontend**: React SPA (port 5173 in dev, served from Express in production/tunnel)
- **Database**: PostgreSQL via Neon (cloud), accessed through Prisma ORM
- **Cache**: Redis via Upstash, TLS (`rediss://`), used for AI insight caching
- **Real-time**: Socket.io with Redis adapter for horizontal scaling
- **AI**: Anthropic Claude (`claude-sonnet-4-6`) for AI Insights module
- **Tunnel**: Cloudflare Tunnel (`cloudflared`) for public HTTPS demo URL

---

## Tech Stack

### Backend
| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 22.x |
| Framework | Express | ^4.21.0 |
| Language | TypeScript | ^5.6.3 |
| ORM | Prisma | ^5.22.0 |
| Database | PostgreSQL (Neon) | — |
| Cache | Redis (Upstash) via ioredis | ^5.4.1 |
| Real-time | Socket.io + Redis adapter | ^4.8.0 |
| AI | @anthropic-ai/sdk | ^0.30.0 |
| Auth | jsonwebtoken + bcryptjs | — |
| File Upload | multer + csv-parse + xlsx | — |
| Email | nodemailer | ^6.x |
| Logging | winston | ^3.15.0 |
| Validation | zod | ^3.23.8 |

### Frontend
| Layer | Technology | Version |
|---|---|---|
| Framework | React | ^18.3.1 |
| Language | TypeScript | ^5.6.3 |
| Build Tool | Vite | ^6.0.3 |
| Routing | react-router-dom | ^6.28.0 |
| Server State | @tanstack/react-query | ^5.62.3 |
| Client State | Zustand | ^5.0.2 |
| HTTP Client | Axios (with interceptors) | ^1.7.9 |
| UI Primitives | Radix UI | — |
| Styling | TailwindCSS | ^3.4.15 |
| Charts | Recharts | ^2.14.1 |
| Real-time | socket.io-client | ^4.8.1 |
| Forms | react-hook-form + zod | — |
| Icons | lucide-react | ^0.462.0 |

---

## Project Structure

```
Hackathon /
├── backend/                    # Express API server
│   ├── src/
│   │   ├── index.ts            # Server bootstrap, HTTP + Socket.io init
│   │   ├── app.ts              # Express app, middleware, route mounting
│   │   ├── controllers/        # Request handlers (thin layer, 15 files)
│   │   ├── services/           # Business logic + DB queries (15 files)
│   │   ├── routes/             # Express Router definitions (16 files)
│   │   ├── middleware/         # authenticate, errorHandler, requestLogger
│   │   ├── lib/                # Singletons: prisma, redis, socket, logger, claudeClient
│   │   └── types/              # Backend-specific TypeScript types
│   ├── prisma/
│   │   ├── schema.prisma       # 22 Prisma models — source of truth for DB
│   │   ├── migrations/         # Versioned SQL migration files
│   │   ├── seed.ts             # Demo data (71 employees, bands, scenarios, etc.)
│   │   └── seed-job-architecture.ts
│   ├── scripts/
│   │   └── create-admin.ts     # Admin user upsert utility
│   ├── .env                    # Secrets — NEVER commit
│   ├── .env.example            # Template for .env
│   ├── package.json
│   ├── tsconfig.json
│   └── railway.toml            # Railway deployment config
│
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── main.tsx            # React root, React Query provider, Sonner
│   │   ├── App.tsx             # Router, lazy-loaded pages, Suspense
│   │   ├── pages/              # 15 full-page components (lazy-loaded)
│   │   ├── components/
│   │   │   ├── layout/         # AppShell, Sidebar, TopBar, ProtectedRoute
│   │   │   ├── employees/      # AddEmployeeModal, ImportEmployeesModal
│   │   │   └── ThemeProvider.tsx
│   │   ├── hooks/              # useAuth, useSocket
│   │   ├── services/           # Axios API call wrappers (3 files)
│   │   ├── store/              # Zustand stores: authStore, notificationStore
│   │   └── lib/                # api.ts, queryClient.ts, socket.ts, utils.ts
│   ├── .env                    # VITE_APP_NAME only — no hardcoded URLs
│   ├── vite.config.ts          # Dev proxy /api → :3001, chunk splitting
│   ├── tailwind.config.ts
│   ├── package.json
│   └── vercel.json
│
├── shared/                     # Shared TypeScript types + constants
│   ├── types/index.ts          # ~650 lines — ALL API types, enums, interfaces
│   └── constants/index.ts      # ~237 lines — band configs, socket events, AI config
│
├── collab/                     # Developer coordination layer (see collab/README.md)
│   ├── features.json           # Feature registry
│   ├── file-ownership.json     # File → owner mapping
│   ├── clash-rules.md          # High-risk shared files
│   └── README.md
│
├── CLAUDE.md                   # This file
├── IMPLEMENTATION_PLAN.md      # Phase-by-phase roadmap
├── docker-compose.yml
└── .gitignore
```

---

## Key Architecture Patterns

### Request Lifecycle (REST)
```
Browser → Axios (api.ts, Bearer token injected) → Express
  → authenticate middleware (JWT verify → req.user)
  → Route handler
  → Controller (thin, delegates to service)
  → Service (Prisma query + optional Redis cache)
  → JSON response: { data: ..., meta: { total, page, limit } }
```

### Real-time Events (Socket.io)
```
Backend service → emitXxx() (lib/socket.ts) → Socket.io → all clients
Frontend useSocket.ts → listener → React Query cache invalidation → re-render
```

### Caching (Redis)
```
Service calls cacheGet('key') → miss → compute → cacheSet('key', result, ttlSeconds)
AI insights TTL: 2–24 hours depending on insight type
```

### Auth Flow
```
POST /api/auth/login → JWT (15min) + RefreshToken (7 days, stored in DB)
Tokens stored in sessionStorage (clears on browser close)
Axios interceptor catches 401 → silent refresh → retry original request
```

### Frontend Data Flow
```
Page mounts → useQuery(queryKeys.xxx) → api.get('/xxx') → cache
Socket event arrives → invalidateQueries → automatic re-fetch → component updates
```

---

## API Conventions

### Base URL
- Dev: `http://localhost:3001/api` (via Vite proxy at `/api`)
- Prod/Tunnel: `/api` (relative, same-origin — Express serves frontend)

### Response Shape
```typescript
// Success
{ "data": T, "meta"?: { total, page, limit, totalPages } }

// Error
{ "error": { "code": "NOT_FOUND", "message": "...", "details"?: {} } }
```

### Route Naming
- Resources: plural nouns (`/employees`, `/salary-bands`)
- Actions: verb suffixes (`/scenarios/:id/run`, `/scenarios/:id/apply`)
- Nested: `/api/benefits/catalog`, `/api/pay-equity/score`

### File Naming
- Backend: `<domain>.controller.ts`, `<domain>.service.ts`, `<domain>.routes.ts`
- Frontend pages: `<DomainName>Page.tsx`
- Frontend hooks: `use<Name>.ts`
- Frontend stores: `<name>Store.ts`

---

## Prisma Models (22 total)

| Model | Purpose |
|---|---|
| `User` | Admin/viewer accounts with JWT |
| `RefreshToken` | Token rotation management |
| `JobArea` | Top-level job classification (Engineering, Sales…) |
| `JobFamily` | Mid-level (Software, Hardware…) |
| `Band` | Compensation levels A1–P4 |
| `Grade` | Sub-levels within bands |
| `JobCode` | Specific role codes (SWE-001…) |
| `Skill` | Skill catalog |
| `EmployeeSkill` | Employee ↔ Skill pivot with proficiency |
| `Employee` | Core entity — 100+ fields, all comp data |
| `SalaryBand` | Salary ranges per band × job area |
| `MarketBenchmark` | External market P25/P50/P75/P90 data |
| `PerformanceRating` | Annual cycle ratings |
| `BenefitsCatalog` | Benefits offered |
| `EmployeeBenefit` | Employee enrollment records |
| `RsuGrant` | RSU grant with vesting schedule |
| `RsuVestingEvent` | Individual vesting milestone |
| `CommissionPlan` | Variable pay plan templates |
| `CommissionAchievement` | Actual commission earned |
| `Scenario` | What-if rule sets for salary modeling |
| `Notification` | User-facing alerts |
| `AiInsight` | Cached Claude API outputs |

---

## Environment Variables

### Backend (`backend/.env`)
```
DATABASE_URL      # Neon PostgreSQL connection string (pooler URL)
REDIS_URL         # Upstash Redis TLS URL (rediss://)
JWT_SECRET        # Long random string for access tokens
JWT_REFRESH_SECRET # Long random string for refresh tokens
ANTHROPIC_API_KEY # sk-ant-api03-...
PORT              # 3001
FRONTEND_URL      # Empty string in tunnel/dev mode = allow all CORS origins
NODE_ENV          # development | production
# Email (feat-004) — all optional; app runs fine without them
SMTP_HOST         # e.g. smtp.gmail.com
SMTP_PORT         # 587
SMTP_USER         # sender email address
SMTP_PASS         # sender email password / app password
HR_ALERT_EMAIL    # receives pay anomaly alerts
```

### Frontend (`frontend/.env`)
```
VITE_APP_NAME     # "CompSense" (display only)
# DO NOT add VITE_API_URL or VITE_SOCKET_URL — these break tunnel mode
# The code defaults to '/api' (relative) and window.location.origin respectively
```

---

## Running the Project

```bash
# Backend (development)
cd backend && npm run dev

# Backend (production — serves frontend too)
cd backend && node dist/index.js

# Frontend (development only)
cd frontend && npm run dev

# Build frontend for tunnel/production
cd frontend && npm run build
# Then restart backend to serve the new dist/

# Database
npm run db:migrate      # run migrations (interactive)
npm run db:seed         # seed demo data
npm run db:studio       # Prisma Studio UI

# Cloudflare Tunnel (run separately)
cloudflared tunnel --url http://localhost:3001 >> /tmp/cloudflared.log 2>&1 &
```

---

## Planned Features

> Full registry with file impact and clash analysis is in `collab/features.json`.
> Clash rules are documented in `collab/clash-rules.md`.

| ID | Title | Assigned | Risk | Status |
|---|---|---|---|---|
| feat-001 | Platform Navigation Restructuring — 3-Module Hub | Aryan | HIGH | pending |
| feat-002 | Real-Time Data Flow Accuracy Across All Modules | Bakul | HIGH | done ✅ |
| feat-003 | Enhanced Dashboard — 4 Key Graphs + Action Panel | Aryan | MEDIUM | pending |
| feat-004 | Auto Email Generation for Module Actions | Bakul | MEDIUM | done ✅ |
| feat-005 | Merged Module Navigation — Collapsible Grouped Sidebar | Aryan | HIGH | pending |
| feat-006 | Dual Settings — Platform Settings + User Settings | Aryan | HIGH | pending |
| feat-007 | Real-Time Data Only — Purge All Placeholders | Bakul | MEDIUM | done ✅ |
| feat-008 | Real-Time Calculation Logic — DB-Driven Salary Band Compliance | Bakul | HIGH | done ✅ |

### Execution Status

**Bakul — ALL DONE ✅**
- feat-002 ✅ cache invalidation + socket events
- feat-007 ✅ purged wrong bandOrder arrays, unified SOCKET_EVENTS constants
- feat-008 ✅ DB-driven compa-ratio + batch recalc on SalaryBand update
- feat-004 ✅ email service (nodemailer), 3 triggers, SMTP config in Settings

**Aryan — START NOW**
Order: `feat-001` → `feat-005` → `feat-003` → `feat-006`
- feat-001: create CompensationHubPage + BenefitsHubPage, restructure App.tsx routes
- feat-005: rewrite Sidebar.tsx into collapsible grouped nav (do in same PR as feat-001)
- feat-003: extend dashboard.service.ts with 4 new endpoints + DashboardPage charts
- feat-006: split SettingsPage.tsx into PlatformSettingsPage + UserSettingsPage (do LAST)

### Cross-Dev Handoff Points — COMPLETED

| File | What Bakul did | What Aryan must do next |
|---|---|---|
| `backend/src/services/dashboard.service.ts` | ✅ Cache invalidation + bandOrder fix (feat-002, feat-007) | Add new chart endpoints (feat-003) |
| `frontend/src/pages/SettingsPage.tsx` | ✅ Email SMTP tab + 3 trigger buttons (feat-004) | Split into PlatformSettingsPage + UserSettingsPage (feat-006) — preserve the Email tab in PlatformSettingsPage |

---

## Currently Working On

> Update this section before starting any feature. Clear it when done.
> Full queue is in the Planned Features table above — pick next from your assigned sequence.

### Dev A — Aryan
```
Feature  : feat-001 + feat-005 (start here — do together in one PR)
Files    : frontend/src/App.tsx, frontend/src/components/layout/Sidebar.tsx,
           frontend/src/pages/DashboardPage.tsx,
           frontend/src/pages/CompensationHubPage.tsx (new),
           frontend/src/pages/BenefitsHubPage.tsx (new)
Branch   : (your branch name)
Started  : (date)
```

### Dev B — Bakul
```
Feature  : ALL DONE ✅ (feat-002, feat-004, feat-007, feat-008)
Files    : —
Branch   : main
Started  : —
```

---

## Aryan's Reference — What Bakul Already Built

> Read this before starting any feature so you don't duplicate work or break existing flows.

### Email Infrastructure (feat-004) — Already Live

New routes at `/api/email` (all require `authenticate` middleware):

| Method | Endpoint | What it does |
|---|---|---|
| POST | `/api/email/low-performer-alert` | Sends alerts to managers with direct reports rated < 3.0 |
| POST | `/api/email/pay-anomaly-alert` | Sends pay outlier summary to `HR_ALERT_EMAIL` |
| POST | `/api/email/rsu-reminders` | Emails employees with RSU vesting in next 30 days |

New files — **do not duplicate**:
- `backend/src/lib/emailClient.ts` — nodemailer transporter (gracefully no-ops if SMTP_HOST unset)
- `backend/src/services/email.service.ts` — all email logic + HTML templates
- `backend/src/controllers/email.controller.ts`
- `backend/src/routes/email.routes.ts`

**Settings page already has an "Email (SMTP)" tab.** When you split `SettingsPage.tsx` for feat-006:
- Keep the Email tab in `PlatformSettingsPage.tsx` (admin-only, correct home for SMTP config)
- Do not remove the `handleSendEmail` function or the 3 manual trigger buttons

### Socket Events — Complete List (backend/src/types/index.ts)

```typescript
SOCKET_EVENTS = {
  NOTIFICATION_NEW, NOTIFICATION_CRITICAL,
  PAY_ANOMALY, BUDGET_THRESHOLD, RSU_VESTING,
  DASHBOARD_REFRESH,
  EMPLOYEE_CREATED, EMPLOYEE_UPDATED,
  EMPLOYEE_DATA_CHANGED,   // broad cache-bust after any employee write
  SALARY_BAND_UPDATED,     // triggers after SalaryBand.update() — batch recalc done
  IMPORT_PROGRESS, IMPORT_COMPLETE,
  DATA_REFRESH_MODULES,
}
```

### Band Order — Single Source of Truth

The DB has exactly **6 bands**: `A1 → A2 → P1 → P2 → P3 → P4`
Defined in `backend/src/types/index.ts` as `BAND_ORDER`.
**Never hardcode band arrays** — import `BAND_ORDER` instead.

### Dashboard Service — Safe to Extend Now

`backend/src/services/dashboard.service.ts` is clean for feat-003. Bakul's work is done.
When adding new methods for feat-003 charts, follow the existing `cached()` helper pattern:
```typescript
getMyNewChart: () => cached('dashboard:my-chart', async () => { /* Prisma query */ })
```
Cache keys must start with `dashboard:` so they get invalidated by `cacheDelPattern('dashboard:*')`.

### App.tsx Route Mounting Order (feat-001 / feat-006)

When adding new page routes in `frontend/src/App.tsx`, keep them lazy-loaded:
```tsx
const CompensationHubPage = lazy(() => import('./pages/CompensationHubPage'));
```
The route for `/settings` currently points to `SettingsPage`. When you split it (feat-006), change it to point to `PlatformSettingsPage` for `/settings/platform` and `UserSettingsPage` for `/settings/user`. Keep the old `/settings` route redirecting to one of them so existing links don't 404.

---

## Do Not Touch Without Coordination

These files affect the entire system. Changes require explicit communication with your co-developer **before** editing.

| File / Path | Risk | Reason |
|---|---|---|
| `backend/.env` | CRITICAL | Secrets, DB connection — wrong value breaks everything |
| `backend/prisma/schema.prisma` | CRITICAL | DB schema — changes require migration, affects all services |
| `backend/prisma/migrations/` | CRITICAL | Version-controlled SQL — never edit manually |
| `shared/types/index.ts` | HIGH | Used by 40+ files — a type change can cascade across the entire codebase |
| `shared/constants/index.ts` | HIGH | Band configs, socket event names — changes affect backend + frontend simultaneously |
| `backend/src/app.ts` | HIGH | Route mounting, CORS, middleware stack — easy to break all endpoints |
| `backend/src/index.ts` | HIGH | Server bootstrap — touches DB, Redis, Socket.io init |
| `backend/src/lib/prisma.ts` | HIGH | Prisma singleton — used by all 15 services |
| `backend/src/lib/redis.ts` | HIGH | Redis singleton + cache helpers — used by most services |
| `backend/src/lib/socket.ts` | HIGH | Socket.io instance + all emit helpers — real-time events |
| `backend/src/middleware/authenticate.ts` | HIGH | Auth gate — changes affect every protected endpoint |
| `frontend/src/App.tsx` | HIGH | Router + all lazy imports — breaking import crashes entire frontend |
| `frontend/src/main.tsx` | HIGH | React root, providers — wrong change = blank screen |
| `frontend/src/lib/api.ts` | HIGH | Axios instance with token logic — affects all API calls |
| `frontend/src/store/authStore.ts` | MEDIUM | Auth state persistence — shared by all pages |
| `backend/package.json` | MEDIUM | Dependency changes require `npm install` on both devs' machines |
| `frontend/package.json` | MEDIUM | Same as above |
| `backend/package-lock.json` | MEDIUM | Lock file — never manually edit, always commit after `npm install` |
| `frontend/package-lock.json` | MEDIUM | Same as above |
| `backend/tsconfig.json` | MEDIUM | Compiler settings — rootDir change can break the entire build output |
| `frontend/vite.config.ts` | MEDIUM | Dev proxy + chunk config — proxy change = API calls fail in dev |
| `frontend/.env` | MEDIUM | `VITE_*` vars are inlined at build time — wrong value bakes bad URL into bundle |
| `backend/src/services/dashboard.service.ts` | HIGH | **Cross-dev clash**: Bakul's work (feat-002, feat-007) is done. Aryan extends with new endpoints for feat-003. Follow the `cached()` pattern, keys must start with `dashboard:`. |
| `frontend/src/pages/SettingsPage.tsx` | HIGH | **Cross-dev clash**: Bakul added email config tab (feat-004) ✅. Aryan must migrate the Email tab into `PlatformSettingsPage` when splitting for feat-006 — do not lose it. |
| `frontend/src/components/layout/Sidebar.tsx` | HIGH | Touched by feat-001, feat-005, feat-006 in strict sequence (all Aryan). Rewritten in feat-001, extended in feat-005, updated in feat-006. Never edit out of order — each builds on the last. |
| `backend/src/services/employee.service.ts` | HIGH | Core data entity — all compensation calculations flow from here. feat-002 adds cache invalidation, feat-008 rewrites compa-ratio to use DB bands. Both Bakul, must be sequential. |
| `backend/src/services/salaryBand.service.ts` | HIGH | Claimed by feat-002, feat-007, feat-008 in sequence (all Bakul). feat-008 rewrites band logic to use DB — do not add any hardcoded band references here. |
| `backend/.env.example` | MEDIUM | Must be updated whenever a new required env var is added. feat-004 (email) adds `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — update this file in the same commit. |
