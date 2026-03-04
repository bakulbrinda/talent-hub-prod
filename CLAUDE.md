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
| Security | helmet | — |

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
│   │   ├── controllers/        # Request handlers (thin layer)
│   │   ├── services/           # Business logic + DB queries
│   │   ├── routes/             # Express Router definitions
│   │   ├── middleware/         # authenticate, requireRole, errorHandler, requestLogger
│   │   ├── lib/                # Singletons: prisma, redis, socket, logger, claudeClient
│   │   └── types/              # Backend-specific TypeScript types
│   ├── prisma/
│   │   ├── schema.prisma       # 24 Prisma models — source of truth for DB
│   │   ├── migrations/         # Versioned SQL migration files
│   │   ├── seed.ts             # Demo data (200 employees via Zoho CSV format, bands, scenarios, etc.)
│   │   └── seed-job-architecture.ts
│   ├── scripts/
│   │   ├── create-admin.ts            # Admin user upsert utility
│   │   ├── seed-variable-pay.ts       # Seeds 3 commission plans + 97 achievements
│   │   └── seed-benefits-utilization.ts # Seeds benefits + RSU grant enrollments for all 200 employees
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
│   │   ├── pages/              # Full-page components (lazy-loaded)
│   │   ├── components/
│   │   │   ├── layout/         # AppShell, Sidebar, TopBar, ProtectedRoute
│   │   │   ├── employees/      # AddEmployeeModal, ImportEmployeesModal
│   │   │   ├── ChatPanel.tsx   # Floating AI chat panel (all pages)
│   │   │   └── ScenarioSuggester.tsx
│   │   ├── hooks/              # useAuth, useSocket
│   │   ├── services/           # Axios API call wrappers
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
├── CLAUDE.md                   # This file
├── docker-compose.yml
└── .gitignore
```

---

## Key Architecture Patterns

### Request Lifecycle (REST)
```
Browser → Axios (api.ts, Bearer token injected) → Express
  → authenticate middleware (JWT verify → req.user)
  → requireRole middleware (RBAC check)
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

### SSE Streaming (AI endpoints)
```
Frontend: fetch() POST + ReadableStream + manual \n\n buffer split (NOT EventSource — can't set headers)
Backend: res.setHeader('Content-Type', 'text/event-stream') + res.flushHeaders()
         → write SSE events → keep-alive comment every 20s → res.end() on done
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

## Prisma Models (24 total)

| Model | Purpose |
|---|---|
| `User` | Platform users (ADMIN / HR_MANAGER / VIEWER) |
| `RefreshToken` | Token rotation management |
| `UserInvite` | Token-based invite system (7-day expiry) |
| `AuditLog` | Sensitive action audit trail |
| `JobArea` | Top-level job classification (Engineering, Sales…) |
| `JobFamily` | Mid-level (Software, Hardware…) |
| `Band` | Compensation levels A1–D2 (10 bands: A1, A2, P1, P2, P3, M1, M2, D0, D1, D2) |
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
| `RsuGrant` | RSU grant with vesting schedule (legacy — RSU UI is now the EQUITY tab in Benefits Management) |
| `RsuVestingEvent` | Individual vesting milestone |
| `CommissionPlan` | Variable pay plan templates (backend only — Variable Pay page is now CSV-derived analytics) |
| `CommissionAchievement` | Actual commission earned (backend only — not surfaced in UI) |
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
# Email — all optional; app runs fine without them
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

## Completed Features

All features are implemented and working. This is a single-developer project.

| Phase | Feature | Status |
|---|---|---|
| feat-001 | Platform Navigation Restructuring — 3-Module Hub | ✅ done |
| feat-002 | Real-Time Data Flow Accuracy Across All Modules | ✅ done |
| feat-003 | Enhanced Dashboard — 4 Key Graphs + Action Panel | ✅ done |
| feat-004 | Auto Email Generation for Module Actions | ✅ done |
| feat-005 | Merged Module Navigation — Collapsible Grouped Sidebar | ✅ done |
| feat-006 | Dual Settings — Platform Settings + User Settings | ✅ done |
| feat-007 | Real-Time Data Only — Purge All Placeholders | ✅ done |
| feat-008 | Real-Time Calculation Logic — DB-Driven Salary Band Compliance | ✅ done |
| Phase 3 | AI Chat — SSE streaming with 7 live DB tools + tool-use loop | ✅ done |
| Phase 4 | Proactive AI Anomaly Detection — hourly scan + Socket.io alerts | ✅ done |
| Phase 5 | Leadership Report + Scenario Suggester + Band Suggestions | ✅ done |
| Phase 6 | Multi-User RBAC — invite system, audit log, requireRole middleware | ✅ done |

---

## Currently Working On

> Update this section before starting any new work. Clear it when done.

```
Feature  : —
Files    : —
Started  : —
```

---

## Key Technical Facts

### Route Mounting Order in app.ts (IMPORTANT)
`app.use('/api/users', usersRoutes)` **must come before** `app.use('/api', jobArchitectureRoutes)`.
Reason: `jobArchitecture.routes.ts` applies `router.use(authenticate)` globally — it would block
the public invite endpoints (`GET /api/users/invite/:token`, `POST /api/users/accept-invite`)
if mounted first. Never change this ordering without understanding the implications.

### RBAC — requireRole Middleware
```typescript
// backend/src/middleware/requireRole.ts
requireRole('ADMIN')                  // ADMIN only
requireRole('ADMIN', 'HR_MANAGER')   // both roles allowed
```
Applied to: scenario apply (ADMIN), scenario run/delete (ADMIN+HR), import employees (ADMIN+HR).

### User Roles
- `ADMIN` — full access, can invite users, change roles, apply scenarios
- `HR_MANAGER` — can run scenarios, import employees, view all data
- `VIEWER` — read-only access

### Email Infrastructure
Routes at `/api/email` (require `authenticate`):
- `POST /api/email/low-performer-alert` — alerts to managers with reports rated < 3.0
- `POST /api/email/pay-anomaly-alert` — pay outlier summary to `HR_ALERT_EMAIL`
- `POST /api/email/rsu-reminders` — emails employees with RSU vesting in 30 days
Files: `lib/emailClient.ts`, `services/email.service.ts`, `controllers/email.controller.ts`, `routes/email.routes.ts`

### AI Proactive Scan (Phase 4)
- Redis mutex key: `ai_scan:running` (10-min TTL) prevents concurrent runs
- 24hr deduplication: same notification title won't repeat within 24 hours
- Schedule: 2-min startup delay (Neon DB wake), then every 1hr
- Manual trigger: `POST /api/notifications/trigger-scan` (admin)

### AI Streaming Pattern
- `POST /api/ai/chat/stream` — conversational AI with 7 DB tools + tool-use loop
- `POST /api/ai/chat/suggest-scenarios` — goal → 3 DRAFT Scenario records created in DB
- `POST /api/ai/chat/band-suggestions` — compa-ratio analysis → band adjustment suggestions (JSON response, NOT SSE)

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
The DB has exactly **10 bands**: `A1 → A2 → P1 → P2 → P3 → M1 → M2 → D0 → D1 → D2`
Defined in `backend/src/types/index.ts` as `BAND_ORDER` and in `shared/constants/index.ts`.
**Never hardcode band arrays** — import `BAND_ORDER` instead.
RSU grants are eligible from P1 and above; A1/A2 are not RSU-eligible.

### Dashboard Caching Pattern
```typescript
getMyNewChart: () => cached('dashboard:my-chart', async () => { /* Prisma query */ })
```
Cache keys must start with `dashboard:` so they get invalidated by `cacheDelPattern('dashboard:*')`.

### Frontend — Key Facts
- `getInitials(firstName, lastName)` — two separate args
- `queryKeys.employees.all(filters)` (not `.list`)
- `formatRelativeTime(date)` — date formatter in utils.ts
- Notification store: `setUnreadCount(n)` (not `resetCount`)
- Auth token: `sessionStorage.getItem('accessToken')`
- All pages lazy-loaded in `App.tsx` via `lazy(() => import(...))`
- Sidebar NAV_GROUPS: core, compensation, people, benefits, settings

### Prisma Schema — Key Enums
- `UserRole`: ADMIN, HR_MANAGER, VIEWER
- `Gender`: MALE, FEMALE, NON_BINARY, PREFER_NOT_TO_SAY
- `BenefitStatus`: ACTIVE, EXPIRED, CLAIMED
- `EmploymentStatus`: ACTIVE, INACTIVE, ON_LEAVE, TERMINATED
- `ScenarioStatus`: DRAFT, APPLIED, ARCHIVED
- `Criticality`: C1 (Critical+Irreplaceable), C2 (Critical), C3 (Important), C4 (Non-Critical+Replaceable)
- Employee fields: `designation` (not `title`), `gender` enum as above, `criticality` (optional Criticality enum)
- RsuVestingEvent: relation is `rsuGrant` (not `grant`), field is `unitsVesting` (not `units`)

### Variable Pay Page — CSV-Derived Only
The Variable Pay page (`/variable-pay`) reads **only** from `employee.variablePay` (a CSV field).
It shows KPIs, by-department bars, by-band bars, and a top-15 earners table.
There are no tabs, no manual input, no commission plan or achievement management in the UI.
Commission-related Prisma models (CommissionPlan, CommissionAchievement) still exist in DB but are backend-only.

### RSU — Now Under Benefits Management
RSU data is surfaced as the "RSU Grants" tab inside **Benefits Management** (`/benefits`).
It is driven by EQUITY-category `EmployeeBenefit` records:
- `utilizationPercent` = vesting %
- `utilizedValue` = vested ₹ amount
Seeded via `scripts/seed-benefits-utilization.ts` (tenure-based vesting, band-based grant value).
The `/rsu` route redirects to `/benefits`. RSU is listed under the Benefits nav group.

---

## Do Not Touch Without Care

These files affect the entire system. Always read before editing.

| File / Path | Risk | Reason |
|---|---|---|
| `backend/.env` | CRITICAL | Secrets, DB connection — wrong value breaks everything |
| `backend/prisma/schema.prisma` | CRITICAL | DB schema — changes require migration, affects all services |
| `backend/prisma/migrations/` | CRITICAL | Version-controlled SQL — never edit manually |
| `shared/types/index.ts` | HIGH | Used by 40+ files — a type change can cascade across the entire codebase |
| `shared/constants/index.ts` | HIGH | Band configs, socket event names — changes affect backend + frontend simultaneously |
| `backend/src/app.ts` | HIGH | Route mounting order matters — see note above about usersRoutes ordering |
| `backend/src/index.ts` | HIGH | Server bootstrap — touches DB, Redis, Socket.io init |
| `backend/src/lib/prisma.ts` | HIGH | Prisma singleton — used by all services |
| `backend/src/lib/redis.ts` | HIGH | Redis singleton + cache helpers — used by most services |
| `backend/src/lib/socket.ts` | HIGH | Socket.io instance + all emit helpers — real-time events |
| `backend/src/middleware/authenticate.ts` | HIGH | Auth gate — changes affect every protected endpoint |
| `backend/src/routes/jobArchitecture.routes.ts` | HIGH | Has global `router.use(authenticate)` — any path changes affect all `/api/*` routing |
| `frontend/src/App.tsx` | HIGH | Router + all lazy imports — breaking import crashes entire frontend |
| `frontend/src/main.tsx` | HIGH | React root, providers — wrong change = blank screen |
| `frontend/src/lib/api.ts` | HIGH | Axios instance with token logic — affects all API calls |
| `frontend/src/store/authStore.ts` | MEDIUM | Auth state persistence — shared by all pages |
| `backend/package.json` | MEDIUM | Dependency changes require `npm install` |
| `frontend/package.json` | MEDIUM | Same as above |
| `backend/tsconfig.json` | MEDIUM | Compiler settings — rootDir change can break the entire build output |
| `frontend/vite.config.ts` | MEDIUM | Dev proxy + chunk config — proxy change = API calls fail in dev |
| `frontend/.env` | MEDIUM | `VITE_*` vars are inlined at build time — wrong value bakes bad URL into bundle |
| `backend/src/services/employee.service.ts` | HIGH | Core data entity — all compensation calculations flow from here |
| `backend/src/services/salaryBand.service.ts` | HIGH | Band logic uses DB only — never add hardcoded band references |
