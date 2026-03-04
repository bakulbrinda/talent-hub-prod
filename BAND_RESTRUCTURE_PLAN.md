# Band Restructure Plan — iMocha Salary Band Alignment

> Status: PLANNED — do not implement until explicitly instructed.
> Owner: Bakul

---

## 1. What the Company's Structure Actually Is

### Organizational Bands & Levels (Image 1)

| Band | Levels | Career Tier |
|---|---|---|
| Band 1 | A1, A2 | Associate |
| Band 2 | P1, P2 | Professional |
| Band 3 | P3 | Senior Professional |
| Band 4 | M1, M2 | Management |
| Band 5 | D0, D1, D2 | Director / Leadership |

**Total: 5 bands, 10 levels**

---

### Salary Increment Matrix (Image 2)

Increment % is driven by 3 inputs combined:

1. **Current CTC tier** (4 salary bands by annual CTC in INR)
2. **Performance rating** (OS / EP / SP / NI)
3. **Criticality** (C1 / C2 / C3 / C4)

#### Salary Band 1 — ₹4L to ₹12L

| Performance | C1 | C2 | C3 | C4 |
|---|---|---|---|---|
| OS-5 Outstanding | 10% | 9% | 8% | 7% |
| EP-4 Excellent | 9% | 8% | 7% | 6% |
| SP-3 Solid | 8% | 7% | 6% | 5% |
| NI-2 Needs Improvement | 0% | 0% | 0% | 0% |

#### Salary Band 2 — ₹12.1L to ₹20L

| Performance | C1 | C2 | C3 | C4 |
|---|---|---|---|---|
| OS-5 | 8% | 7% | 6% | 5% |
| EP-4 | 7% | 6% | 5% | 4% |
| SP-3 | 6% | 5% | 4% | 3% |
| NI-2 | 0% | 0% | 0% | 0% |

#### Salary Band 3 — ₹20.1L to ₹30L

| Performance | C1 | C2 | C3 | C4 |
|---|---|---|---|---|
| OS-5 | 6% | 5% | 4% | 3% |
| EP-4 | 5% | 4% | 3% | 2% |
| SP-3 | 4% | 3% | 3% | 2% |
| NI-2 | 0% | 0% | 0% | 0% |

#### Salary Band 4 — ₹30.1L and above

| Performance | C1 | C2 | C3 | C4 |
|---|---|---|---|---|
| OS-5 | 4% | 3% | 2% | 1% |
| EP-4 | 3% | 2% | 2% | 1% |
| SP-3 | 2% | 1% | 1% | 0% |
| NI-2 | 0% | 0% | 0% | 0% |

---

### Criticality & Performance Codes (Image 3)

**Criticality:**
| Code | Number | Meaning |
|---|---|---|
| C1 | 2 | Critical + Irreplaceable (highest increment) |
| C2 | 3 | Non-Critical + Irreplaceable |
| C3 | 4 | Critical + Replaceable |
| C4 | 5 | Non-Critical + Replaceable (lowest increment) |

**Performance:**
| Code | Score | Label |
|---|---|---|
| OS | 5 | Outstanding |
| EP | 4 | Excellent |
| SP | 3 | Solid |
| NI | 2 | Needs Improvement — always 0% increment |

---

## 2. Gap Analysis — Current vs. Required

| Dimension | Current System | Required |
|---|---|---|
| Band levels | A1, A2, P1, P2, P3, **P4** | A1, A2, P1, P2, P3, **M1, M2, D0, D1, D2** |
| Total levels | 6 | 10 |
| P4 exists? | Yes — "Principal / Manager" | No — split into M1/M2 (mgmt) and D0/D1/D2 (director) |
| `BAND_ORDER` | `['A1','A2','P1','P2','P3','P4']` | `['A1','A2','P1','P2','P3','M1','M2','D0','D1','D2']` |
| Employee criticality | Not in schema | C1/C2/C3/C4 required on each employee |
| Increment logic | Simple RAISE_PERCENT flat rule | CTC-tier × performance × criticality matrix |
| SalaryBand records | Ranges for A1–P4 only | Ranges for all 10 levels |

---

## 3. The 6 Changes — Detailed Plan

### Change 1 — Prisma Schema (`backend/prisma/schema.prisma`)

**What changes:**
- Add `Criticality` enum with values: `C1, C2, C3, C4`
- Add `criticality Criticality?` field to the `Employee` model (nullable — existing employees get it via seed update)

**Why nullable:** Allows existing records to be migrated without breaking the DB. In production, criticality would be set during onboarding.

---

### Change 2 — DB Migration

Run `prisma migrate dev --name add_criticality_to_employee`.

This generates and applies a SQL migration that:
1. Creates the `Criticality` enum in PostgreSQL
2. Adds the `criticality` column to the `employees` table (nullable)

**No data loss** — existing employees are unaffected until seed re-runs.

---

### Change 3 — BAND_ORDER Constant (`backend/src/types/index.ts`)

**Current:**
```typescript
export const BAND_ORDER = ['A1', 'A2', 'P1', 'P2', 'P3', 'P4'] as const;
export type BandCode = typeof BAND_ORDER[number];
```

**After:**
```typescript
export const BAND_ORDER = ['A1', 'A2', 'P1', 'P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'] as const;
export type BandCode = typeof BAND_ORDER[number];
```

**Why this matters:**
- `dashboard.service.ts` uses it to sort the Band Distribution chart (left = junior, right = senior)
- `aiInsights.service.ts` uses it to determine the "next band" for promotion gap analysis
- `performance.service.ts` uses it to rank employees by seniority
- `rsu.service.ts` already has a local copy with the correct new order — once the central constant is updated, the local copy can be removed

Also update `shared/constants/index.ts` if it contains any `BANDS` array or `BAND_COLORS` map that references P4.

---

### Change 4 — Seed Data (`backend/prisma/seed.ts`)

Five sub-changes:

#### 4a — Replace Band records in DB

Remove `bandP4`. Create 5 new bands:

| Code | Label | Level | RSU Eligible |
|---|---|---|---|
| M1 | Manager I | 6 | Yes |
| M2 | Manager II | 7 | Yes |
| D0 | Director 0 | 8 | Yes |
| D1 | Director I | 9 | Yes |
| D2 | Director II | 10 | Yes |

#### 4b — Remap the 3 current P4 employees

| Employee | Current | New Band | Reason |
|---|---|---|---|
| Vikram Sharma | P4 — Principal Engineer | M1 | Individual contributor lead → Manager I |
| Priya Nair | P4 — Principal Engineer | M1 | Same |
| Arjun Mehta | P4 — Senior Manager Engineering | M2 | Managerial role → Manager II |

Their `band`, `gradeCode`, and `jobCodeId` references all update accordingly.

#### 4c — Replace Grade codes

Remove P4 grades (`P4-1`, `P4-2`). Add:

| Grade Code | Band | Description |
|---|---|---|
| M1-1 | M1 | Manager |
| M2-1 | M2 | Senior Manager |
| D0-1 | D0 | Associate Director |
| D1-1 | D1 | Director |
| D2-1 | D2 | Senior Director |

#### 4d — Update SalaryBand range records

Remove P4 band range. Add ranges for M1, M2, D0, D1, D2 — aligned to the CTC tiers in Image 2:

| Band | CTC Tier | Min | Mid | Max |
|---|---|---|---|---|
| M1 | Salary Band 3/4 | ₹25L | ₹32L | ₹40L |
| M2 | Salary Band 4 | ₹38L | ₹50L | ₹65L |
| D0 | Salary Band 4 | ₹55L | ₹70L | ₹90L |
| D1 | Salary Band 4 | ₹80L | ₹100L | ₹125L |
| D2 | Salary Band 4 | ₹110L | ₹140L | ₹180L |

These mid-points align with Salary Band 4 (₹30.1L+) thresholds from Image 2, ensuring compa-ratio calculations for senior employees resolve correctly.

#### 4e — Add criticality to all 71 seeded employees

Assign a realistic distribution:

| Criticality | % of Employees | Target Roles |
|---|---|---|
| C1 — Critical + Irreplaceable | ~15% | Niche engineers, key PMs, top performers in thin markets |
| C2 — Non-Critical + Irreplaceable | ~25% | Experienced but in common roles |
| C3 — Critical + Replaceable | ~30% | In-demand skills, but backfillable |
| C4 — Non-Critical + Replaceable | ~30% | Standard roles with broad market supply |

Senior bands (M1, M2, D0+) skew toward C1/C2. Junior bands (A1, A2) skew toward C3/C4.

---

### Change 5 — Scenario Engine (`backend/src/services/scenario.service.ts`)

Add a new scenario rule action type: `MERIT_MATRIX`.

When a scenario run encounters a `MERIT_MATRIX` action:

1. **Determine Salary Band (1–4)** from employee's current annual CTC:
   - ≤ ₹12L → Salary Band 1
   - ₹12.1L–₹20L → Salary Band 2
   - ₹20.1L–₹30L → Salary Band 3
   - > ₹30L → Salary Band 4

2. **Map latest performance rating:**
   - Rating ≥ 4.5 → OS (Outstanding)
   - Rating ≥ 3.5 → EP (Excellent)
   - Rating ≥ 2.5 → SP (Solid)
   - Rating < 2.5 → NI (Needs Improvement → 0%)

3. **Read employee's `criticality` field:** C1 / C2 / C3 / C4

4. **Look up increment %** from the matrix table (hardcoded from Image 2).

5. **Apply increment** to `annualFixed` and calculate projected compa-ratio.

This allows HR to create scenarios like "Apply merit matrix to all employees" and see the exact projected cost and per-employee impact based on the company's own rules.

---

### Change 6 — Shared Constants (`shared/constants/index.ts`)

- Remove P4 from any `BANDS` array or band color map
- Add M1, M2, D0, D1, D2 with appropriate color assignments
- Update band level numbers to match new 1–10 range

---

## 4. Files Modified

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `Criticality` enum + `criticality` on Employee |
| `backend/prisma/migrations/` | Auto-generated migration (enum + column) |
| `backend/prisma/seed.ts` | Replace P4, add M1/M2/D0/D1/D2, add criticality to 71 employees |
| `backend/src/types/index.ts` | Update `BAND_ORDER` |
| `backend/src/services/scenario.service.ts` | Add `MERIT_MATRIX` rule type |
| `shared/constants/index.ts` | Update BANDS array and BAND_COLORS |

**Nothing else touched.** No frontend pages, no other services, no routes.

---

## 5. Downstream Impact — What Changes Across the Platform

This section documents exactly how the band restructure ripples through every tab, dashboard, and AI feature.

---

### 5.1 Dashboard Page (`/dashboard`)

**Band Distribution Chart (Pie / Donut)**
- Currently: 6 slices — A1, A2, P1, P2, P3, P4
- After: 10 slices — A1, A2, P1, P2, P3, M1, M2, D0, D1, D2
- No code change needed — `dashboard.service.ts#getBandDistribution()` dynamically groups by whatever band codes exist in the DB. The chart auto-adapts.

**KPI — "Employees Outside Band" count**
- Currently: employees where compa-ratio < 80% or > 120% of their P4 band mid
- After: same logic, but P4 employees (Vikram, Priya, Arjun) are now on M1/M2 with correct, realistic salary ranges — their compa-ratios will recalculate correctly and the count will change to reflect reality
- Computed live — no code change needed

**Action Required panel**
- Flags employees with compa-ratio outliers. After reseeding, outliers are based on the corrected M1/M2/D0+ salary band ranges. More accurate alerts.

---

### 5.2 COMPENSATION Dropdown Tabs

#### Salary Band Designer (`/salary-bands`)

**Impact: HIGH — most visible change**

*Bar chart (band ranges):*
- Currently shows 6 bars: A1 → A2 → P1 → P2 → P3 → P4
- After: 10 bars: A1 → A2 → P1 → P2 → P3 → M1 → M2 → D0 → D1 → D2
- The chart reads from `GET /api/salary-bands` which queries the DB dynamically — new bands appear automatically once seed runs

*Salary band editor form (add/edit band):*
- Band selector dropdown currently lists A1–P4
- This dropdown is populated from the `GET /api/job-architecture/bands` endpoint — it will automatically show the new bands once DB is updated
- No frontend code change needed

*"Employees Outside Band" alert:*
- Previously some P4 employees had compa-ratios computed against P4 ranges — if those ranges were wrong, the count was wrong
- After: M1/M2 employees compute against the correct ₹25L–₹40L / ₹38L–₹65L ranges. Accurate count.

*Compliance Analysis tab:*
- Currently groups employees by band, shows how many in each band are below/within/above range
- After: same grouping but 10 bands instead of 6. M1, M2, D0, D1, D2 appear as new rows.

*AI Recommendations tab:*
- `POST /api/ai/chat/band-suggestions` sends all salary bands to Claude for analysis
- After: Claude receives 10 bands instead of 6. Suggestions will include M1/M2/D0+ bands.
- No code change needed — band data is fetched dynamically

#### Scenario Modeler (`/scenarios`)

**Impact: MEDIUM**

*Rule builder — band filter checkboxes:*
- Currently: checkboxes for A1, A2, P1, P2, P3, P4
- After: checkboxes for all 10 bands including M1, M2, D0, D1, D2
- These are populated from the DB bands list — automatically shows new bands

*Scenario run results — "By Band" breakdown:*
- Currently: up to 6 rows in the band breakdown table
- After: up to 10 rows
- No code change — `scenario.service.ts#run()` groups results by whatever bands are present in the affected employees

*New MERIT_MATRIX scenario type (Change 5):*
- Adds a new rule action type visible in the scenario builder
- HR can now create "Apply company merit matrix" scenarios and see exact cost impact per employee, per band, using the real CTC-tier × performance × criticality formula

*AI Scenario Suggester (ScenarioSuggester component):*
- Claude creates DRAFT scenarios — after the band change, it has access to 10 real bands and will suggest rules targeting M1/M2 employees specifically if relevant

#### Pay Equity (`/pay-equity`)

**Impact: MEDIUM**

*Department × Band heatmap:*
- Currently: max 6 columns per department (one per band)
- After: max 10 columns
- No code change — `payEquity.service.ts#getHeatmap()` dynamically groups by existing band codes

*Band filter dropdown:*
- Currently shows A1–P4
- After: shows A1–D2
- Populated from employee data dynamically — auto-updates

*Compa-ratio distribution:*
- Breakdown of how many employees fall in each compa-ratio range, optionally filtered by band
- Previously filtering by P4 would return 3 employees. After: filter by M1 or M2 instead — returns the correct employees
- No code change

*Performance-pay alignment:*
- "High performers underpaid by band" report
- After: correctly identifies if Vikram Sharma (now M1) is underpaid vs. M1 salary range, rather than vs. the old P4 range

---

### 5.3 AI Assistant (`/ai-assistant`) and Chat Panel

**Impact: HIGH — all Claude tools use live band data**

The AI assistant sends band data to Claude via 7 DB tools. Here's what changes for each:

#### Tool: `get_org_summary`
- **Before:** `bandBreakdown: [{band:'P4', headcount:3}]`, avgCompaRatio based on P4
- **After:** `bandBreakdown: [{band:'M1', headcount:2}, {band:'M2', headcount:1}]`
- Claude will give accurate org-level summaries that mention management and director bands

#### Tool: `get_employees`
- Input filter `band: "P4"` will now return 0 results (correct)
- Input filter `band: "M1"` or `band: "M2"` will return the correct employees
- Claude's band-specific employee queries will be accurate

#### Tool: `get_band_analysis`
- **Before:** Returns salary ranges and compliance for 6 bands (A1–P4)
- **After:** Returns salary ranges and compliance for 10 bands (A1–D2)
- Claude can answer "Which management-level employees are outside their salary band?" correctly

#### Tool: `get_pay_equity_data` with `breakdown: 'by_band'`
- **Before:** Returns gender pay gap for 6 bands
- **After:** Returns gender pay gap for 10 bands, including M1/M2/D0 separately
- Claude can now reason about pay equity at the management layer specifically

#### Tool: `get_performance_pay_alignment`
- **Before:** "Vikram Sharma (P4) has high performance but low compa-ratio vs P4 band"
- **After:** "Vikram Sharma (M1) has high performance but low compa-ratio vs M1 band"
- Correct band context in AI recommendations

#### Tool: `run_scenario`
- **Before:** Band filters in scenario rules included P4
- **After:** Band filters work with M1, M2, D0, D1, D2
- Claude can now correctly model "Give all M2 managers a 12% raise" as a valid scenario

#### Tool: `get_criticality` (new, via employee fields)
- Once criticality (C1–C4) is on each employee, Claude has access to it via the employee data
- Claude can answer "Who are our C1 employees earning below their salary band?" or "What would the merit matrix cost for all C2 employees?"

**Suggested prompts on the AI Assistant page:**
- Currently shows "What would a 10% salary increase for all P2 band employees cost?"
- After: same prompts work; additionally, prompts referencing M1/M2/D0 will be meaningful

---

### 5.4 Leadership Report (`/report`)

**Impact: MEDIUM**

The 5-section SSE report is generated from `orgSnapshot` which includes all employee bands and salary band ranges. After the restructure:

- **Section 1 (Compensation Health):** Band compliance % will reflect 10-level structure. More granular breakdown.
- **Section 2 (Critical Issues):** If M1/M2 employees are underpaid vs. their new salary ranges, this section will flag them correctly.
- **Section 3 (Pay Equity):** Department gender gaps will be reported per the correct bands.
- **Section 4 (Scenario Recommendation):** Claude may recommend targeting a specific management band (M1/M2) rather than the generic P4 that doesn't exist.
- **Section 5 (Action Plan):** Actions referencing specific bands will use the correct terminology (M1, D0, etc.)

No code change needed — the report reads live data from the DB.

---

### 5.5 Employee Directory (`/employees`)

**Impact: LOW**

- Band filter dropdown: currently shows A1–P4. After: shows A1–D2 (populated from DB dynamically)
- Band column in the employee table: P4 badges disappear, M1/M2 badges appear for the 3 remapped employees
- Add Employee modal: Band dropdown will show new bands automatically (fetches from `GET /api/bands`)
- Import CSV help text: currently says "A1/A2/P1/P2/P3/P4" — this is a hardcoded string that needs updating to "A1/A2/P1/P2/P3/M1/M2/D0/D1/D2"

The import service (`import.service.ts`) already has the correct inference logic and `VALID_BANDS` list including M1, M2, D0, D1, D2 — so CSV imports will work correctly for the new bands.

---

### 5.6 Performance Page (`/performance`)

**Impact: LOW**

- High performer / low performer tables show `band` field per employee
- After: Vikram, Priya, Arjun show as M1/M2 instead of P4
- Compa-ratio badges recalculate against correct band ranges
- No code change needed

---

### 5.7 Proactive AI Scan (background, every 1hr)

**Impact: LOW — auto-correct**

The scan calls `gatherOrgSnapshot()` → Claude → creates Notifications. After the band change:
- Band compliance findings will reference M1/M2 correctly
- If any M1/M2 employees are outside their new salary ranges, the scan will flag it as CRITICAL
- Old notifications referencing P4 remain in the DB (historical) — new scan will not create P4-based findings

---

### 5.8 AI Insights Page (`/ai-insights`)

**Impact: LOW**

Displays cached Claude outputs tagged by insight type. The `COMPA_RATIO_DISTRIBUTION` insight type analyzes salary band distribution. After the band change, the next time this insight is generated (or cache expires), it will reflect the 10-band structure. Old cached entries remain until TTL expires.

---

## 6. What DOES NOT Change

- compa-ratio formula (`annualFixed / midSalary * 100`) — unchanged
- compa-ratio thresholds (80–120% = compliant) — unchanged
- Auth, notifications, RSU, benefits, variable pay — untouched
- No frontend page code changes — all pages read band data from the DB dynamically
- No route changes
- No controller changes

---

## 7. Implementation Order (when ready)

1. Change 1 + 2: Schema + Migration (add Criticality enum + Employee field)
2. Change 3: Update BAND_ORDER in `types/index.ts` + `shared/constants/index.ts`
3. Change 4: Update seed.ts (all 5 sub-changes)
4. Run `npm run db:seed` to wipe and reseed with correct data
5. Change 5: Add MERIT_MATRIX to scenario.service.ts
6. Rebuild frontend (`npm run build`) + restart backend
7. Verify: band distribution chart shows 10 bands, P4 employees show as M1/M2, AI assistant answers M1/M2 questions correctly
