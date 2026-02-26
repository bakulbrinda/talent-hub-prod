# Talent Hub — AI-Driven Compensation & Benefits Intelligence Platform
## Complete Phase-by-Phase Production Implementation Plan

> **Goal**: Transform the CompSense hackathon prototype into a real, globally deployed,
> AI-first compensation platform usable by 2-3 people in your organization.
>
> **Problem Statement**: Build an AI-driven Compensation & Benefits Intelligence Platform
> that enables the Head of HR to design fair salary bands, detect pay inequities,
> optimize benefits spend, model compensation scenarios, align pay with performance,
> and generate leadership-ready insights.

---

## Strategic Shifts: Hackathon → Production

| Dimension | Hackathon (CompSense) | Production (Talent Hub) |
|---|---|---|
| Data | 71 seeded fake employees | Your real org data (CSV import or manual entry) |
| AI | 15 static cached insights (6hr TTL) | Streaming AI chat + proactive anomaly scanning + AI reports |
| Deployment | localhost:3001 + localhost:5173 | Global cloud, custom domain, always-on |
| Users | 1 hardcoded admin | 2-3 org users with roles (Admin, HR Manager, Viewer) |
| Focus | Heavy analytics charts | AI narrates everything — minimal charts, maximum intelligence |
| Real-time | Import progress bar | Live AI streaming, multi-user alerts, collaborative sync |

---

## Final Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Keep from hackathon |
| UI / Styling | Tailwind CSS + Radix UI + shadcn | Keep from hackathon |
| Charts | Recharts | Keep but reduce — only where charts beat text |
| State | Zustand + TanStack React Query v5 | Keep from hackathon |
| HTTP Client | Axios with interceptors | Keep from hackathon |
| Real-time | Socket.io client | Keep + extend |
| Backend | Node.js + Express + TypeScript | Keep from hackathon |
| ORM | Prisma + PostgreSQL | Keep schema, minor additions |
| Cache | Redis (Upstash in prod) | Keep caching layer |
| Real-time Server | Socket.io + Redis Adapter | Keep, extend events |
| AI | Anthropic Claude claude-sonnet-4-6 (tool use + streaming) | **Major overhaul** |
| File Upload | Multer + csv-parse + xlsx | Keep from hackathon |
| Auth | JWT (15min access + 7day refresh) + bcrypt | Keep, add roles |
| **Hosting: Frontend** | **Vercel** | Free tier, global CDN, auto-deploy |
| **Hosting: Backend** | **Railway** | $5/month, Node.js, always-on |
| **Hosting: Database** | **Supabase** | Free tier, hosted PostgreSQL |
| **Hosting: Redis** | **Upstash** | Free tier, serverless Redis |

---

## What We Keep (Reuse from CompSense)

- All Express route structure and controllers
- Prisma schema (add 2 tables, modify 1)
- JWT auth with refresh token rotation
- Socket.io real-time event system
- CSV/Excel import pipeline (Multer + csv-parse + xlsx)
- Scenario modeling engine (filter + action rules)
- Compa-ratio calculation logic
- All React components, pages, and UI library setup
- React Query key structure and stale-time tiers
- Zustand stores (auth + notifications)

## What Gets Removed

- All seed/demo data (71 fake employees, hardcoded scenarios, pre-seeded notifications)
- Static AI insight cache system (`/api/ai-insights` — replaced by chat + proactive scan)
- Charts-heavy pages that add no decision value (salary distribution histogram)
- Benefits Management page (too complex for MVP — simplified to benefits summary)
- RSU Tracker page (niche — moved to employee profile)
- Variable Pay page (standalone — can be Phase 2 addition)
- Job Architecture page (not needed for small org)

---

## Phase 1 — Production Infrastructure Setup
**Goal**: Get a live, globally accessible URL that 2-3 people can hit.
**Duration**: Day 1 (2-3 hours)

### 1.1 — Supabase (PostgreSQL)

1. Go to https://supabase.com → New Project
2. Name: `talenthub-prod`
3. Password: generate strong password, save it
4. Region: closest to your org (Mumbai = `ap-south-1`)
5. After creation: Settings → Database → copy `Connection string (URI)`
6. Format: `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`
7. Save as `DATABASE_URL` in backend `.env`

### 1.2 — Upstash Redis

1. Go to https://upstash.com → New Database
2. Name: `talenthub-redis`, Region: `ap-south-1` (or nearest)
3. Type: Regional (not Global — cheaper for MVP)
4. After creation: copy `REDIS_URL` (starts with `rediss://`)
5. Save as `REDIS_URL` in backend `.env`

### 1.3 — GitHub Repository

```bash
# In project root /Hackathon/
git init
git add .
git commit -m "Initial commit: CompSense → Talent Hub"
# Create repo on GitHub: talenthub-prod
git remote add origin https://github.com/YOUR_ORG/talenthub-prod.git
git push -u origin main
```

### 1.4 — Railway (Backend)

1. Go to https://railway.app → New Project → Deploy from GitHub
2. Select repo: `talenthub-prod`
3. Root directory: `backend`
4. Build command: `npm run build`
5. Start command: `npm start`
6. Add all environment variables (see Section: Environment Variables)
7. After deploy: copy the Railway-generated URL (e.g., `https://talenthub-prod.up.railway.app`)

**File to add**: `backend/railway.toml`
```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

**Modify**: `backend/package.json` — add build + start scripts:
```json
"scripts": {
  "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
  "build": "tsc && npx prisma generate",
  "start": "node dist/index.js",
  "migrate": "prisma migrate deploy"
}
```

**Modify**: `backend/tsconfig.json` — ensure `outDir` is set:
```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

### 1.5 — Vercel (Frontend)

1. Go to https://vercel.com → New Project → Import from GitHub
2. Select repo: `talenthub-prod`
3. Root directory: `frontend`
4. Build command: `npm run build`
5. Output directory: `dist`
6. Add environment variable: `VITE_API_URL=https://talenthub-prod.up.railway.app`
7. Add environment variable: `VITE_SOCKET_URL=https://talenthub-prod.up.railway.app`
8. After deploy: copy Vercel URL (e.g., `https://talenthub.vercel.app`)

**File to add**: `frontend/vercel.json`
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 1.6 — Run Prisma Migration on Production DB

```bash
cd backend
# Set DATABASE_URL to Supabase URL temporarily
DATABASE_URL="postgresql://postgres:PASSWORD@db.REF.supabase.co:5432/postgres" \
  npx prisma migrate deploy
```

### 1.7 — Update CORS

**Modify**: `backend/src/app.ts`
```typescript
cors({
  origin: [
    'http://localhost:5173',
    process.env.FRONTEND_URL || 'https://talenthub.vercel.app'
  ],
  credentials: true
})
```

### 1.8 — Environment Variables (Full List)

**`backend/.env.production`**:
```env
DATABASE_URL=postgresql://postgres:PASS@db.REF.supabase.co:5432/postgres
REDIS_URL=rediss://default:PASS@HOST.upstash.io:PORT
JWT_SECRET=generate-64-char-random-string
JWT_REFRESH_SECRET=generate-another-64-char-random-string
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ANTHROPIC_API_KEY=sk-ant-api03-...
PORT=3001
FRONTEND_URL=https://talenthub.vercel.app
NODE_ENV=production
ORG_NAME=Your Company Name
```

### Phase 1 Deliverable
- Live backend: `https://talenthub-prod.up.railway.app/api/health` returns `{"status":"ok"}`
- Live frontend: `https://talenthub.vercel.app` loads login page
- Login works with admin credentials

---

## Phase 2 — Real Data Flow & Org Onboarding
**Goal**: Replace all demo/seeded data with a proper first-time setup experience.
**Duration**: Day 2 (3-4 hours)

### 2.1 — Remove All Seed Data

**Delete files**:
- `backend/prisma/seed.ts` (or `seed.js`)
- Any `*.seed.ts` files in `backend/src/`

**Modify**: `backend/package.json` — remove `prisma.seed` config

**Modify**: `backend/prisma/schema.prisma` — remove seeder references

### 2.2 — Create Initial Admin User Script

**New file**: `backend/scripts/create-admin.ts`
```typescript
// Run once: npx ts-node scripts/create-admin.ts
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@yourcompany.com';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe@123';
  const name = process.env.ADMIN_NAME || 'HR Admin';

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, password: hashed, name, role: 'ADMIN' }
  });
  console.log('Admin created:', user.email);
}
main();
```

### 2.3 — Empty State Detection

**New endpoint**: `GET /api/org/status`
```typescript
// Returns: { hasEmployees: boolean, employeeCount: number, hasOnboarded: boolean }
// Frontend checks this on first load — if hasEmployees=false, redirect to /onboarding
```

### 2.4 — Org Onboarding Wizard (Frontend)

**New file**: `frontend/src/pages/Onboarding.tsx`

4-step wizard shown only when `hasEmployees = false`:

**Step 1: Welcome + Upload**
- Title: "Welcome to Talent Hub — Let's get your data in"
- Drag-drop CSV/Excel (reuse existing `ImportEmployeesModal` logic)
- "Download Template" button (existing `/api/import/template`)
- Show expected columns with examples

**Step 2: AI Data Validation** (NEW — calls Claude)
- After upload, backend parses file and calls Claude with data summary
- Claude responds: "I found 47 employees. 3 issues to fix before importing:
  1. Row 12: Invalid band 'L3' — valid bands are A1, A2, P1-P3, M1-M2, D0-D2
  2. Row 28: Missing email for 'Rahul Sharma'
  3. Duplicate employeeId 'EMP004' on rows 31 and 45"
- Show issues in table — user fixes in their CSV and re-uploads, or skips minor issues

**Step 3: AI Band Designer** (NEW — calls Claude)
- Claude analyzes uploaded salary data and recommends salary bands
- Shows: "Based on your 47 employees, I recommend these 6 salary bands..."
- User can accept or adjust min/mid/max per band
- "Accept Recommendations" → saves salary bands to DB

**Step 4: First AI Insights** (NEW — calls Claude)
- "Generating your first compensation intelligence report..."
- Claude streams 3-4 initial findings: "Here's what I found in your data..."
- Shows proactively: pay equity issues, employees outside bands, quick wins
- "Go to Dashboard" button

**Modify**: `frontend/src/App.tsx`
```typescript
// After login, check /api/org/status
// If !hasEmployees → redirect to /onboarding
// Add route: <Route path="/onboarding" element={<Onboarding />} />
```

### 2.5 — AI Data Validation Endpoint (Backend)

**New endpoint**: `POST /api/import/validate`
```typescript
// Accepts: parsed rows from CSV
// Calls Claude with: row count, sample data, detected issues
// Returns: { issues: [{row, field, message, severity}], aiSummary: string }
// Does NOT save to DB — just validates + gives AI feedback
```

### Phase 2 Deliverable
- First-time users land on `/onboarding` wizard
- Upload real CSV → AI validates → AI designs bands → AI shows first insights
- No demo data anywhere in the system

---

## Phase 3 — AI Chat Assistant with Tool Use
**Goal**: Claude can answer any compensation question by querying live DB data.
**Duration**: Days 3-4 (1 day)

### 3.1 — Backend: Chat Endpoint with Tool Use

**New file**: `backend/src/routes/aiChat.ts`

**Endpoint**: `POST /api/ai/chat`
**Endpoint**: `GET /api/ai/chat/stream` (SSE)

**New file**: `backend/src/services/aiChat.ts`

```typescript
// Claude is given 7 "tools" it can call to query live data:

const CLAUDE_TOOLS = [
  {
    name: "get_pay_equity_data",
    description: "Get gender pay gap data, compa-ratio distribution, pay equity score",
    input_schema: { type: "object", properties: {
      breakdown: { type: "string", enum: ["overall", "by_department", "by_band"] }
    }}
  },
  {
    name: "get_employees",
    description: "Query employees with filters. Use to find underpaid/overpaid employees, specific departments, bands, etc.",
    input_schema: { type: "object", properties: {
      band: { type: "string" },
      department: { type: "string" },
      gender: { type: "string" },
      compaRatioBelow: { type: "number" },
      compaRatioAbove: { type: "number" },
      performanceRating: { type: "number" },
      limit: { type: "number" }
    }}
  },
  {
    name: "get_band_analysis",
    description: "Get salary band structure and who is above/below/within their band",
    input_schema: { type: "object", properties: {
      band: { type: "string" }
    }}
  },
  {
    name: "get_performance_pay_alignment",
    description: "Find high performers who are underpaid, or low performers who are overpaid",
    input_schema: { type: "object", properties: {
      threshold: { type: "number", description: "Performance rating threshold (e.g. 4 for top performers)" }
    }}
  },
  {
    name: "get_benefits_data",
    description: "Get benefits utilization, enrollment rates, and cost per category",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "run_scenario",
    description: "Run a what-if compensation scenario and return cost impact + affected employees",
    input_schema: { type: "object", properties: {
      rules: { type: "array", description: "Array of filter+action rules" }
    }}
  },
  {
    name: "get_org_summary",
    description: "Get high-level org stats: total employees, avg compa-ratio, bands, departments",
    input_schema: { type: "object", properties: {} }
  }
];

// Tool execution: maps tool name to actual DB query function
// Conversation history: stored in Redis (key: `chat:${userId}:history`, TTL 2hrs)
// Max history: 20 messages (10 turns)
```

**Streaming response**:
```typescript
// GET /api/ai/chat/stream?message=...&sessionId=...
// Uses Server-Sent Events (SSE)
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');

const stream = anthropic.messages.stream({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  tools: CLAUDE_TOOLS,
  messages: conversationHistory
});

stream.on('text', (text) => res.write(`data: ${text}\n\n`));
stream.on('message', (msg) => {
  // Handle tool use: execute tool, feed result back, continue stream
});
stream.on('finalMessage', () => res.write('data: [DONE]\n\n'));
```

### 3.2 — Frontend: Chat Panel Component

**New file**: `frontend/src/components/ChatPanel.tsx`

Features:
- Floating panel (bottom-right corner, slide up)
- Available on EVERY page (mounted in AppShell)
- Streamed text renders word-by-word
- Conversation history shown (last 10 turns)
- Suggested starter questions:
  - "Who is most underpaid in Engineering?"
  - "What would a 10% raise for all P2 employees cost?"
  - "Show me our gender pay gap by department"
  - "Which benefits have the lowest utilization?"
  - "Who is performance-pay misaligned right now?"
- Tool calls visible to user: "Querying employee data..." (spinner)
- "New conversation" button clears history

**New file**: `frontend/src/pages/AIAssistant.tsx`
- Full-page version of chat (route: `/ai-assistant`)
- Larger message area, same functionality
- Shows conversation history sidebar

**Modify**: `frontend/src/App.tsx`
- Add `<ChatPanel />` inside `<AppShell />` (always mounted)
- Add route: `/ai-assistant`

### 3.3 — System Prompt for Claude

```typescript
const SYSTEM_PROMPT = `You are the AI compensation intelligence assistant for ${ORG_NAME}.
You have access to real-time HR data via tools. Always use tools to get current data before answering — never guess numbers.

Your role:
- Help the Head of HR make better compensation decisions
- Detect pay inequities and explain them clearly
- Model compensation scenarios and explain cost impacts
- Align pay with performance data
- Generate leadership-ready summaries

Communication style:
- Be direct and specific (use actual names, numbers, percentages)
- Lead with the most important finding
- Always end with 1-2 recommended actions
- Use ₹ for Indian Rupee amounts, format as "₹X.X Lakhs" or "₹X.X Crores"
- Keep responses under 300 words unless generating a full report`;
```

### Phase 3 Deliverable
- AI Chat panel visible on every page
- Claude can answer: "Who in Sales is below their salary band?" with real data
- Responses stream word-by-word (no loading spinner)
- Conversation history persists for 2 hours

---

## Phase 4 — Proactive AI Anomaly Detection
**Goal**: Claude scans your data every hour and automatically alerts users to critical issues.
**Duration**: Day 5 (3-4 hours)

### 4.1 — Background Scan Service

**New file**: `backend/src/services/aiScan.ts`

```typescript
export async function runProactiveScan(): Promise<void> {
  // 1. Gather org snapshot (all key metrics in one DB query batch)
  const snapshot = await gatherOrgSnapshot();

  // 2. Ask Claude to identify anomalies (structured JSON output)
  const prompt = `Analyze this compensation data and identify up to 5 critical issues.
  Return JSON array: [{severity: "CRITICAL"|"WARNING", category: string, title: string, message: string, affectedCount: number, recommendedAction: string}]
  Data: ${JSON.stringify(snapshot)}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  });

  // 3. Parse findings
  const findings = JSON.parse(extractJSON(response.content[0].text));

  // 4. For each NEW finding (not already notified in last 24hrs):
  for (const finding of findings) {
    const alreadyNotified = await checkRecentNotification(finding.title);
    if (!alreadyNotified) {
      await createNotification(finding);           // save to DB
      emitSocket('notification:new', finding);     // alert all users
      if (finding.severity === 'CRITICAL') {
        emitSocket('notification:critical', finding);
      }
    }
  }
}

// What Claude looks for:
// - New hires (last 90 days) paid significantly below peers in same band+dept
// - High-rated employees (4+) with no raise in 18+ months
// - Department where gender pay gap > 20%
// - Employees about to hit RSU cliff (vest date within 30 days)
// - Benefits with <10% utilization (waste alert)
// - Employees with compa-ratio < 70% (critically underpaid)
// - Large salary outliers (>150% of band max)
```

### 4.2 — Schedule the Scan

**Modify**: `backend/src/index.ts`
```typescript
import { runProactiveScan } from './services/aiScan';

// Run scan on startup + every hour
runProactiveScan();
setInterval(runProactiveScan, 60 * 60 * 1000); // every 1 hour
```

### 4.3 — Org Snapshot Query

**New file**: `backend/src/services/orgSnapshot.ts`
```typescript
// Single function that batches all key metrics:
export async function gatherOrgSnapshot() {
  const [employees, bands, ratings, benefits, equity] = await Promise.all([
    prisma.employee.findMany({ where: { employmentStatus: 'ACTIVE' }, select: {...} }),
    prisma.salaryBand.findMany(),
    prisma.performanceRating.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.employeeBenefit.findMany({ include: { benefit: true } }),
    // pay equity aggregations
    prisma.employee.groupBy({ by: ['gender', 'department'], _avg: { annualFixed: true }, where: { employmentStatus: 'ACTIVE' } })
  ]);

  return { employees, bands, ratings, benefits, genderByDept: equity, generatedAt: new Date() };
}
```

### 4.4 — Frontend: Notification Badge

**Modify**: `frontend/src/components/TopBar.tsx`
- Bell icon with red badge showing unread critical count
- Clicking opens notification dropdown (top 5 latest)
- "View all" links to `/notifications`
- CRITICAL notifications show as red banner at top of page (not just bell)

### Phase 4 Deliverable
- Every hour, Claude scans org data and auto-generates alerts
- Critical alerts appear as red banners for all logged-in users in real-time
- Zero manual effort — AI monitors compensation health continuously

---

## Phase 5 — AI Reports + Scenario Suggestions
**Goal**: One-click leadership report + AI-suggested scenarios from natural language goals.
**Duration**: Day 6 (4-5 hours)

### 5.1 — Leadership Report Generation

**New endpoint**: `POST /api/ai/report`
**New endpoint**: `GET /api/ai/report/stream` (SSE)

**New file**: `backend/src/services/aiReport.ts`

```typescript
// Claude generates a 5-section executive briefing (streamed):

const REPORT_SECTIONS = [
  {
    title: "Compensation Health Overview",
    prompt: "Write a 3-sentence executive summary of current compensation health. Include: pay equity score, avg compa-ratio, % employees outside bands. Be specific with numbers."
  },
  {
    title: "Critical Issues Requiring Action",
    prompt: "List the top 3 most urgent compensation issues. Each issue: bold title, 2-sentence explanation, specific employee count/departments affected, and 1 concrete recommended action with estimated cost."
  },
  {
    title: "Pay Equity Analysis",
    prompt: "Summarize the gender pay gap situation. Include overall gap %, worst 2 departments, trend vs last quarter (if data available), and recommended corrective actions with rough cost estimates."
  },
  {
    title: "Compensation Revision Recommendation",
    prompt: "Propose 1 compensation scenario that would most improve pay equity and employee retention. Show: who would benefit, cost impact as % of total payroll, and expected business outcomes."
  },
  {
    title: "30-Day Action Plan",
    prompt: "Write 5 specific, actionable items the Head of HR should complete in the next 30 days to improve compensation fairness. Each item should be concrete and measurable."
  }
];
```

**New page**: `frontend/src/pages/LeadershipReport.tsx`
- Route: `/report`
- "Generate Report" button
- Each section streams in one-by-one as Claude writes them
- Progress indicator: "Analyzing pay equity... (2/5)"
- "Print / Export PDF" button (browser print dialog)
- Clean, formatted layout suitable for board presentation

### 5.2 — AI Scenario Suggester

**New endpoint**: `POST /api/ai/suggest-scenarios`

**New component**: `frontend/src/components/ScenarioSuggester.tsx`

Appears on the Scenarios page:
```
┌─────────────────────────────────────────────────────────┐
│  Describe your goal...                                   │
│  "I want to retain top engineers within 8% budget"       │
│                                                  [Ask AI]│
└─────────────────────────────────────────────────────────┘

Claude suggests 3 scenarios:
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Scenario A      │ │ Scenario B      │ │ Scenario C      │
│ +15% top P3/M1  │ │ +10% all Engg   │ │ Targeted 6      │
│ Cost: ₹42L 6.2% │ │ Cost: ₹51L 7.8% │ │ Cost: ₹18L 2.8% │
│ [Create This]   │ │ [Create This]   │ │ [Create This]   │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

Backend logic:
```typescript
// POST /api/ai/suggest-scenarios
// Body: { goal: string }
// Claude response format (structured JSON):
// [{ name, description, rules: [...], estimatedCost, costPercent, affectedCount, rationale }]
// Auto-creates 3 DRAFT scenarios in DB that user can then run/apply
```

### 5.3 — AI Salary Band Adjustment Suggestions

**New endpoint**: `POST /api/ai/band-suggestions`

When a user views the Salary Bands page:
- Button: "Get AI Band Recommendations"
- Claude analyzes: current bands vs actual employee distribution, market context, compa-ratio spread
- Returns: suggested adjustments per band with reasoning
- User can accept per-band or bulk-accept

### Phase 5 Deliverable
- One-click leadership report generates in ~30-45 seconds (streams as it writes)
- User types a goal → gets 3 ready-to-run scenario options from AI
- AI recommends salary band adjustments based on real data distribution

---

## Phase 6 — Multi-User, Security & Polish
**Goal**: Support 2-3 real org users with proper roles, audit trail, and production security.
**Duration**: Day 7 (3-4 hours)

### 6.1 — User Roles

**Modify**: `backend/prisma/schema.prisma`
```prisma
enum UserRole {
  ADMIN       // Full access: manage users, apply scenarios, import data
  HR_MANAGER  // Read + run scenarios + use AI chat (cannot apply, cannot manage users)
  VIEWER      // Read-only dashboard + AI chat
}
```

**New middleware**: `backend/src/middleware/requireRole.ts`
```typescript
export const requireRole = (...roles: UserRole[]) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
```

Apply to sensitive endpoints:
- `POST /api/scenarios/:id/apply` → `requireRole('ADMIN')`
- `POST /api/import/employees` → `requireRole('ADMIN', 'HR_MANAGER')`
- `DELETE /api/notifications/:id` → `requireRole('ADMIN')`
- `GET /api/export/*` → `requireRole('ADMIN', 'HR_MANAGER')`

### 6.2 — User Invite System

**New endpoints**:
- `POST /api/users/invite` → Admin sends invite (generates token, stores in DB)
- `GET /api/users/invite/:token` → Validate invite token
- `POST /api/users/accept-invite` → Set password, create session
- `GET /api/users` → Admin lists all org users
- `PATCH /api/users/:id/role` → Admin changes user role
- `DELETE /api/users/:id` → Admin removes user

**New table**: `backend/prisma/schema.prisma`
```prisma
model UserInvite {
  id        String   @id @default(uuid())
  email     String   @unique
  role      UserRole
  token     String   @unique
  invitedBy String   // FK to User
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
}
```

**Invite email**: For MVP, just show invite link on screen (copy-paste to share with colleague). No email service needed.

**New page**: `frontend/src/pages/Settings.tsx` (update existing)
- Tab 1: Org Settings (name, timezone)
- Tab 2: Users — list users + invite button + role dropdown
- Tab 3: Data — import history, export options

**New page**: `frontend/src/pages/AcceptInvite.tsx`
- Route: `/invite/:token`
- Shows: "You've been invited to Talent Hub by [Admin Name]"
- Set password form
- On submit: accept invite → auto-login → redirect to onboarding or dashboard

### 6.3 — Audit Log

**New table**: `backend/prisma/schema.prisma`
```prisma
model AuditLog {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  action     String   // "EMPLOYEE_UPDATED", "SCENARIO_APPLIED", "IMPORT_COMPLETED"
  entityType String?  // "Employee", "Scenario"
  entityId   String?
  metadata   Json?    // { before: {...}, after: {...} }
  ip         String?
  createdAt  DateTime @default(now())

  @@index([userId])
  @@index([action])
  @@index([createdAt])
}
```

Log these actions:
- Employee created / updated / bulk imported
- Scenario run / applied
- Salary band changed
- User invited / role changed
- Data exported
- AI report generated

### 6.4 — Production Security Checklist

- [ ] All env vars in Railway/Vercel (never in code)
- [ ] CORS restricted to Vercel URL only in production
- [ ] Rate limit tightened: 100 req/15min (not 500)
- [ ] AI endpoints rate limited separately: 20 req/min per user
- [ ] Helmet.js added to Express (sets secure HTTP headers)
- [ ] All SQL goes through Prisma (no raw queries with user input)
- [ ] File upload: validate MIME type + max size (10MB)
- [ ] JWT secrets: minimum 64 characters, randomly generated
- [ ] Refresh tokens: invalidated on password change
- [ ] Admin-only endpoints protected with `requireRole('ADMIN')`

**Add to backend**:
```bash
npm install helmet
```
```typescript
// backend/src/app.ts
import helmet from 'helmet';
app.use(helmet());
```

### 6.5 — UI Polish & Navigation Cleanup

**Modify**: `frontend/src/components/Sidebar.tsx`
- Remove: Benefits, RSU Tracker, Variable Pay, Job Architecture pages from nav
- Keep: Dashboard, Employees, Pay Equity, Salary Bands, Performance, Scenarios, AI Assistant, Leadership Report, Notifications, Settings
- Add: "AI Assistant" with sparkle icon, prominently placed
- Add: "Leadership Report" with document icon

**Add**: Loading skeleton components for all pages (remove empty flash on data fetch)
**Add**: Error boundaries per page (one page crash doesn't kill the app)
**Add**: Offline detection banner ("No connection — showing cached data")

### Phase 6 Deliverable
- Admin can invite 2 colleagues by link
- Each user has appropriate permissions
- All sensitive changes are logged
- App is secured for production

---

## New Files Summary

| File Path | Action | Phase |
|---|---|---|
| `backend/railway.toml` | NEW | 1 |
| `backend/scripts/create-admin.ts` | NEW | 2 |
| `backend/src/routes/aiChat.ts` | NEW | 3 |
| `backend/src/services/aiChat.ts` | NEW | 3 |
| `backend/src/routes/aiReport.ts` | NEW | 5 |
| `backend/src/services/aiReport.ts` | NEW | 5 |
| `backend/src/services/aiScan.ts` | NEW | 4 |
| `backend/src/services/orgSnapshot.ts` | NEW | 4 |
| `backend/src/routes/users.ts` | NEW | 6 |
| `backend/src/middleware/requireRole.ts` | NEW | 6 |
| `frontend/vercel.json` | NEW | 1 |
| `frontend/src/pages/Onboarding.tsx` | NEW | 2 |
| `frontend/src/pages/AIAssistant.tsx` | NEW | 3 |
| `frontend/src/pages/LeadershipReport.tsx` | NEW | 5 |
| `frontend/src/pages/AcceptInvite.tsx` | NEW | 6 |
| `frontend/src/components/ChatPanel.tsx` | NEW | 3 |
| `frontend/src/components/ScenarioSuggester.tsx` | NEW | 5 |

## Modified Files Summary

| File Path | What Changes | Phase |
|---|---|---|
| `backend/src/app.ts` | CORS for production URL | 1 |
| `backend/src/index.ts` | Start proactive scan cron | 4 |
| `backend/src/app.ts` | Mount new AI + users routes | 3, 5, 6 |
| `backend/prisma/schema.prisma` | Add UserInvite, AuditLog, update UserRole | 6 |
| `frontend/src/App.tsx` | Add new routes, onboarding redirect | 2 |
| `frontend/src/components/AppShell.tsx` | Mount ChatPanel globally | 3 |
| `frontend/src/components/Sidebar.tsx` | Remove unused pages, add AI Assistant | 6 |
| `frontend/src/components/TopBar.tsx` | CRITICAL notification banner | 4 |

---

## Day-by-Day Execution Schedule

| Day | Phase | Primary Focus |
|---|---|---|
| Day 1 | Phase 1 | Supabase + Upstash setup, Railway + Vercel deploy, live URLs |
| Day 2 | Phase 2 | Remove seed data, build onboarding wizard, AI data validation |
| Day 3 | Phase 3a | Backend: AI chat endpoint + tool use + SSE streaming |
| Day 4 | Phase 3b | Frontend: ChatPanel component + AIAssistant page |
| Day 5 | Phase 4 | Proactive AI scan service + notification system |
| Day 6 | Phase 5 | Leadership report + scenario suggester + band AI |
| Day 7 | Phase 6 | Multi-user roles + invite system + audit log + security |

---

## Quick Reference: API Endpoints Added

| Method | Endpoint | Phase | Description |
|---|---|---|---|
| GET | `/api/org/status` | 2 | Has employees? Is onboarded? |
| POST | `/api/import/validate` | 2 | AI validates CSV before import |
| POST | `/api/ai/chat` | 3 | Send message, get Claude response (JSON) |
| GET | `/api/ai/chat/stream` | 3 | SSE: stream Claude response |
| DELETE | `/api/ai/chat/history` | 3 | Clear conversation history |
| POST | `/api/ai/report` | 5 | Generate leadership report (JSON) |
| GET | `/api/ai/report/stream` | 5 | SSE: stream report sections |
| POST | `/api/ai/suggest-scenarios` | 5 | Goal → 3 scenario suggestions |
| POST | `/api/ai/band-suggestions` | 5 | AI recommends salary band adjustments |
| POST | `/api/users/invite` | 6 | Admin invites user by email |
| GET | `/api/users/invite/:token` | 6 | Validate invite token |
| POST | `/api/users/accept-invite` | 6 | Accept invite, set password |
| GET | `/api/users` | 6 | List org users (Admin only) |
| PATCH | `/api/users/:id/role` | 6 | Change user role (Admin only) |

---

## Success Metrics (When Done)

- [ ] App accessible at a real domain (not localhost)
- [ ] Login works for 3 different user accounts with different roles
- [ ] Uploading a real employee CSV works end-to-end
- [ ] AI Chat answers "Who is underpaid in Engineering?" with real names and numbers
- [ ] Proactive scan runs hourly and creates at least 1 notification automatically
- [ ] Leadership Report generates a full 5-section report in under 60 seconds
- [ ] "Suggest scenarios" takes a text goal and returns 3 runnable scenarios
- [ ] All data is persisted in Supabase (not lost on restart)
- [ ] Zero hardcoded demo data anywhere in the codebase

---

*Last updated: 2026-02-26*
*Project: Talent Hub — AI-Driven Compensation & Benefits Intelligence Platform*
*Team: Viju Gangadharan, Ashish Shinde, Parnika Bhivande, Bakulbrinda Chakravarty*
