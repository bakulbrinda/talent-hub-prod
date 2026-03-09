# Full Report Export — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Generate & Download" button to Data Center that exports an Excel workbook with four sheets — AI Summary, Employees, Compensation rollup, and Benefits — covering all data regardless of status.

**Architecture:** Single backend service fetches all data from Prisma in two queries, computes aggregate stats in-memory, calls Claude once for 3×5 bullet-point summaries, then builds an xlsx workbook and streams it as a binary download. Frontend adds one card to DataCenterPage with a blob-download pattern.

**Tech Stack:** Node.js/Express, Prisma, `xlsx` (already in backend), `callClaude` (already in `lib/claudeClient.ts`), React + Axios (frontend)

---

## Task 1: Service — fetch data from DB

**Files:**
- Create: `backend/src/services/fullReportExport.service.ts`

**Step 1: Create the file with two Prisma queries**

```typescript
// backend/src/services/fullReportExport.service.ts
import { prisma } from '../lib/prisma';
import { callClaude } from '../lib/claudeClient';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

export async function fetchReportData() {
  const [employees, benefits] = await Promise.all([
    prisma.employee.findMany({
      orderBy: [{ department: 'asc' }, { lastName: 'asc' }],
    }),
    prisma.employeeBenefit.findMany({
      include: {
        employee: { select: { firstName: true, lastName: true, employeeId: true, department: true } },
        benefit:  { select: { name: true, category: true } },
      },
      orderBy: { employee: { lastName: 'asc' } },
    }),
  ]);
  return { employees, benefits };
}
```

**Step 2: Verify the file compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | grep fullReport
```
Expected: no output (no errors).

**Step 3: Commit**

```bash
git add backend/src/services/fullReportExport.service.ts
git commit -m "feat(export): scaffold fullReportExport service with DB fetch"
```

---

## Task 2: Service — compute aggregate stats

**Files:**
- Modify: `backend/src/services/fullReportExport.service.ts`

**Step 1: Add `computeStats` function after `fetchReportData`**

```typescript
export function computeStats(employees: any[], benefits: any[]) {
  const total = employees.length;
  const active = employees.filter(e => e.employmentStatus === 'ACTIVE').length;

  // Band distribution
  const byBand: Record<string, number> = {};
  employees.forEach(e => { byBand[e.band] = (byBand[e.band] || 0) + 1; });

  // Department headcount
  const byDept: Record<string, number> = {};
  employees.forEach(e => { byDept[e.department] = (byDept[e.department] || 0) + 1; });

  // Gender split
  const byGender: Record<string, number> = {};
  employees.forEach(e => { byGender[e.gender] = (byGender[e.gender] || 0) + 1; });

  // Work mode split
  const byMode: Record<string, number> = {};
  employees.forEach(e => { byMode[e.workMode] = (byMode[e.workMode] || 0) + 1; });

  // Compensation
  const withCompa = employees.filter(e => e.compaRatio !== null);
  const avgCompa = withCompa.length
    ? withCompa.reduce((s, e) => s + Number(e.compaRatio), 0) / withCompa.length
    : 0;
  const outliers = employees.filter(e => e.compaRatio !== null && (Number(e.compaRatio) < 80 || Number(e.compaRatio) > 120)).length;
  const totalCtcCr = employees.reduce((s, e) => s + Number(e.annualCtc), 0) / 1e7;
  const withVariable = employees.filter(e => Number(e.variablePay) > 0).length;

  // Gender pay gap (male vs female avg fixed, active only)
  const maleFixed   = employees.filter(e => e.gender === 'MALE'   && e.employmentStatus === 'ACTIVE').map(e => Number(e.annualFixed));
  const femaleFixed = employees.filter(e => e.gender === 'FEMALE' && e.employmentStatus === 'ACTIVE').map(e => Number(e.annualFixed));
  const maleAvg     = maleFixed.length   ? maleFixed.reduce((s, v) => s + v, 0)   / maleFixed.length   : 0;
  const femaleAvg   = femaleFixed.length ? femaleFixed.reduce((s, v) => s + v, 0) / femaleFixed.length : 0;
  const genderGapPct = maleAvg > 0 ? ((maleAvg - femaleAvg) / maleAvg * 100) : 0;

  // Benefits
  const totalEnrollments = benefits.length;
  const activeEnrollments = benefits.filter(b => b.status === 'ACTIVE').length;
  const expiredEnrollments = benefits.filter(b => b.status === 'EXPIRED').length;
  const claimedEnrollments = benefits.filter(b => b.status === 'CLAIMED').length;
  const withUtil = benefits.filter(b => b.utilizationPercent !== null);
  const avgUtil = withUtil.length
    ? withUtil.reduce((s, b) => s + Number(b.utilizationPercent), 0) / withUtil.length
    : 0;
  const rsuEnrollments = benefits.filter(b => b.benefit.name.includes('RSU'));
  const avgRsuVest = rsuEnrollments.filter(b => b.utilizationPercent !== null).length
    ? rsuEnrollments.filter(b => b.utilizationPercent !== null)
        .reduce((s, b) => s + Number(b.utilizationPercent), 0) /
      rsuEnrollments.filter(b => b.utilizationPercent !== null).length
    : 0;

  // Upcoming RSU vesting in 30 days
  const today = new Date();
  const in30 = new Date(today.getTime() + 30 * 86400000);
  const upcomingVesting = rsuEnrollments.filter(b => {
    if (!b.expiresAt) return false;
    const d = new Date(b.expiresAt);
    return d >= today && d <= in30;
  }).length;

  return {
    people: { total, active, byBand, byDept, byGender, byMode },
    compensation: { avgCompa, outliers, totalCtcCr, withVariable, total, genderGapPct, maleAvg, femaleAvg },
    benefits: { totalEnrollments, activeEnrollments, expiredEnrollments, claimedEnrollments, avgUtil, avgRsuVest, upcomingVesting },
  };
}
```

**Step 2: Verify compile**

```bash
cd backend && npx tsc --noEmit 2>&1 | grep fullReport
```
Expected: no output.

**Step 3: Commit**

```bash
git add backend/src/services/fullReportExport.service.ts
git commit -m "feat(export): add computeStats to fullReportExport service"
```

---

## Task 3: Service — Claude AI bullet points

**Files:**
- Modify: `backend/src/services/fullReportExport.service.ts`

**Step 1: Add `generateAiSummary` function**

```typescript
export async function generateAiSummary(stats: ReturnType<typeof computeStats>): Promise<{
  people: string[];
  compensation: string[];
  benefits: string[];
}> {
  const { people, compensation, benefits } = stats;

  const prompt = `You are an HR analytics AI. Based on the stats below, return ONLY a JSON object (no markdown, no explanation) with exactly this shape:
{
  "people": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "compensation": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "benefits": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"]
}

Each array has exactly 5 concise bullet points (1-2 sentences each). Use specific numbers from the data.

PEOPLE STATS:
- Total employees: ${people.total} (${people.active} active)
- Band distribution: ${JSON.stringify(people.byBand)}
- Department headcount: ${JSON.stringify(people.byDept)}
- Gender split: ${JSON.stringify(people.byGender)}
- Work mode: ${JSON.stringify(people.byMode)}

COMPENSATION STATS:
- Total annual CTC: ₹${compensation.totalCtcCr.toFixed(1)} Cr
- Average compa-ratio: ${compensation.avgCompa.toFixed(1)}%
- Employees outside band (CR <80% or >120%): ${compensation.outliers} (${((compensation.outliers / compensation.total) * 100).toFixed(1)}%)
- Employees with variable pay: ${compensation.withVariable} (${((compensation.withVariable / compensation.total) * 100).toFixed(0)}%)
- Gender pay gap (M vs F avg fixed): ${compensation.genderGapPct.toFixed(1)}% (M: ₹${(compensation.maleAvg / 100000).toFixed(1)}L, F: ₹${(compensation.femaleAvg / 100000).toFixed(1)}L)

BENEFITS STATS:
- Total enrollments: ${benefits.totalEnrollments} (Active: ${benefits.activeEnrollments}, Expired: ${benefits.expiredEnrollments}, Claimed: ${benefits.claimedEnrollments})
- Average benefit utilization: ${benefits.avgUtil.toFixed(1)}%
- Average RSU vesting: ${benefits.avgRsuVest.toFixed(1)}%
- RSU grants vesting in next 30 days: ${benefits.upcomingVesting}`;

  const response = await callClaude(prompt, { maxTokens: 800, temperature: 0.2 });

  try {
    // Strip any accidental markdown fences
    const clean = response.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      people:       (parsed.people       || []).slice(0, 5),
      compensation: (parsed.compensation || []).slice(0, 5),
      benefits:     (parsed.benefits     || []).slice(0, 5),
    };
  } catch {
    return {
      people:       ['AI analysis unavailable — check API key.'],
      compensation: ['AI analysis unavailable — check API key.'],
      benefits:     ['AI analysis unavailable — check API key.'],
    };
  }
}
```

**Step 2: Verify compile**

```bash
cd backend && npx tsc --noEmit 2>&1 | grep fullReport
```
Expected: no output.

**Step 3: Commit**

```bash
git add backend/src/services/fullReportExport.service.ts
git commit -m "feat(export): add generateAiSummary with Claude call"
```

---

## Task 4: Service — xlsx workbook assembly

**Files:**
- Modify: `backend/src/services/fullReportExport.service.ts`

**Step 1: Add `buildWorkbook` function**

```typescript
function fmt(n: any) { return Number(n || 0); }
function fmtDate(d: any) { return d ? new Date(d).toLocaleDateString('en-IN') : ''; }

export function buildWorkbook(
  employees: any[],
  benefits: any[],
  aiSummary: { people: string[]; compensation: string[]; benefits: string[] },
  exportDate: string
) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: AI Summary ─────────────────────────────────────────
  const summaryRows: any[][] = [
    ['Talent Hub — Full Report Export'],
    [`Generated: ${exportDate}`],
    [],
    ['PEOPLE OVERVIEW'],
    ...aiSummary.people.map((b, i) => [`${i + 1}.`, b]),
    [],
    ['COMPENSATION OVERVIEW'],
    ...aiSummary.compensation.map((b, i) => [`${i + 1}.`, b]),
    [],
    ['BENEFITS OVERVIEW'],
    ...aiSummary.benefits.map((b, i) => [`${i + 1}.`, b]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 4 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'AI Summary');

  // ── Sheet 2: Employees ──────────────────────────────────────────
  const empHeaders = [
    'Employee ID', 'First Name', 'Last Name', 'Email', 'Department', 'Designation',
    'Band', 'Grade', 'Employment Type', 'Employment Status', 'Gender',
    'Work Mode', 'Work Location', 'Date of Joining', 'Date of Exit',
    'Annual Fixed (₹)', 'Variable Pay (₹)', 'Annual CTC (₹)',
    'Basic Annual (₹)', 'HRA Annual (₹)', 'PF Yearly (₹)',
    'Special Allowance (₹)', 'LTA (₹)', 'Flexi Total (₹)',
    'Retention Bonus (₹)', 'Joining Bonus (₹)', 'Incentives (₹)',
    'Compa Ratio (%)', 'Pay Range Penetration (%)',
    'April 2023 Fixed', 'July 2023 Fixed', 'April 2024 Fixed', 'July 2024 Fixed',
    'Last Increment Date', 'Last Increment %',
    'Cost Center', 'Criticality', 'Attrition Risk Score',
  ];
  const empRows = employees.map(e => [
    e.employeeId, e.firstName, e.lastName, e.email, e.department, e.designation,
    e.band, e.grade, e.employmentType, e.employmentStatus, e.gender,
    e.workMode, e.workLocation || '', fmtDate(e.dateOfJoining), fmtDate(e.dateOfExit),
    fmt(e.annualFixed), fmt(e.variablePay), fmt(e.annualCtc),
    fmt(e.basicAnnual), fmt(e.hra), fmt(e.pfYearly),
    fmt(e.specialAllowance), fmt(e.lta), fmt(e.flexiTotalYearly),
    fmt(e.retentionBonus), fmt(e.joiningBonus), fmt(e.incentives),
    fmt(e.compaRatio), fmt(e.payRangePenetration),
    fmt(e.april2023), fmt(e.july2023), fmt(e.april2024), fmt(e.july2024),
    fmtDate(e.lastIncrementDate), fmt(e.lastIncrementPercent),
    e.costCenter || '', e.criticality || '', fmt(e.attritionRiskScore),
  ]);
  const wsEmp = XLSX.utils.aoa_to_sheet([empHeaders, ...empRows]);
  wsEmp['!cols'] = empHeaders.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, wsEmp, 'Employees');

  // ── Sheet 3: Compensation Rollup (Band × Dept) ──────────────────
  const compMap: Record<string, { count: number; fixedSum: number; ctcSum: number; compaSum: number; compaCount: number; varCount: number; fixedMin: number; fixedMax: number }> = {};
  employees.forEach(e => {
    const key = `${e.band}||${e.department}`;
    if (!compMap[key]) compMap[key] = { count: 0, fixedSum: 0, ctcSum: 0, compaSum: 0, compaCount: 0, varCount: 0, fixedMin: Infinity, fixedMax: -Infinity };
    const c = compMap[key];
    c.count++;
    c.fixedSum += fmt(e.annualFixed);
    c.ctcSum   += fmt(e.annualCtc);
    if (e.compaRatio !== null) { c.compaSum += fmt(e.compaRatio); c.compaCount++; }
    if (fmt(e.variablePay) > 0) c.varCount++;
    c.fixedMin = Math.min(c.fixedMin, fmt(e.annualFixed));
    c.fixedMax = Math.max(c.fixedMax, fmt(e.annualFixed));
  });
  const compHeaders = [
    'Band', 'Department', 'Headcount',
    'Avg Annual Fixed (₹)', 'Min Fixed (₹)', 'Max Fixed (₹)',
    'Avg Annual CTC (₹)', 'Avg Compa Ratio (%)',
    'Employees with Variable (%)',
  ];
  const compRows = Object.entries(compMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [band, dept] = key.split('||');
      return [
        band, dept, v.count,
        v.count ? Math.round(v.fixedSum / v.count) : 0,
        v.fixedMin === Infinity ? 0 : v.fixedMin,
        v.fixedMax === -Infinity ? 0 : v.fixedMax,
        v.count ? Math.round(v.ctcSum / v.count) : 0,
        v.compaCount ? parseFloat((v.compaSum / v.compaCount).toFixed(1)) : 0,
        v.count ? parseFloat(((v.varCount / v.count) * 100).toFixed(1)) : 0,
      ];
    });
  const wsComp = XLSX.utils.aoa_to_sheet([compHeaders, ...compRows]);
  wsComp['!cols'] = compHeaders.map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(wb, wsComp, 'Compensation');

  // ── Sheet 4: Benefits ───────────────────────────────────────────
  const benHeaders = [
    'Employee ID', 'Employee Name', 'Department',
    'Benefit Name', 'Category', 'Status',
    'Utilization (%)', 'Utilized Value (₹)',
    'Enrolled Date', 'Expiry Date',
  ];
  const benRows = benefits.map(b => [
    b.employee.employeeId,
    `${b.employee.firstName} ${b.employee.lastName}`,
    b.employee.department,
    b.benefit.name,
    b.benefit.category,
    b.status,
    b.utilizationPercent !== null ? fmt(b.utilizationPercent) : '',
    b.utilizedValue !== null ? fmt(b.utilizedValue) : '',
    fmtDate(b.enrolledAt),
    fmtDate(b.expiresAt),
  ]);
  const wsBen = XLSX.utils.aoa_to_sheet([benHeaders, ...benRows]);
  wsBen['!cols'] = benHeaders.map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(wb, wsBen, 'Benefits');

  return wb;
}
```

**Step 2: Add the main orchestrator function at the bottom of the file**

```typescript
export async function generateFullReport(): Promise<Buffer> {
  const { employees, benefits } = await fetchReportData();
  const stats = computeStats(employees, benefits);
  const aiSummary = await generateAiSummary(stats);
  const exportDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const wb = buildWorkbook(employees, benefits, aiSummary, exportDate);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
```

**Step 3: Verify compile**

```bash
cd backend && npx tsc --noEmit 2>&1 | grep fullReport
```
Expected: no output.

**Step 4: Commit**

```bash
git add backend/src/services/fullReportExport.service.ts
git commit -m "feat(export): add buildWorkbook and generateFullReport orchestrator"
```

---

## Task 5: Wire up the route

**Files:**
- Modify: `backend/src/routes/export.routes.ts`

**Step 1: Add the import at the top of `export.routes.ts`**

```typescript
import { generateFullReport } from '../services/fullReportExport.service';
```

**Step 2: Add the route at the bottom of `export.routes.ts`, before `export default router`**

```typescript
// ─── Full Report Export (Excel + AI Summary) ──────────────────
router.get('/full-report', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const buffer = await generateFullReport();
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="talenthub-export-${dateStr}.xlsx"`);
    res.send(buffer);
  } catch (e) { next(e); }
});
```

**Step 3: Verify compile**

```bash
cd backend && npx tsc --noEmit 2>&1 | grep -E "export|fullReport"
```
Expected: no output.

**Step 4: Smoke test the endpoint**

Start the backend (`npm run dev`) and run:
```bash
curl -H "Authorization: Bearer <your_token>" http://localhost:3001/api/export/full-report --output /tmp/test-report.xlsx
file /tmp/test-report.xlsx
```
Expected: `Microsoft Excel 2007+` or similar xlsx mime type.

**Step 5: Commit**

```bash
git add backend/src/routes/export.routes.ts
git commit -m "feat(export): add GET /api/export/full-report route"
```

---

## Task 6: Frontend — Export card in DataCenterPage

**Files:**
- Modify: `frontend/src/pages/DataCenterPage.tsx`

**Step 1: Add `Download` to the existing lucide-react import**

Find the line:
```typescript
import { Upload, FileSpreadsheet, ... } from 'lucide-react';
```
Add `Download` to it.

**Step 2: Add state for the export loading flag near other useState declarations**

```typescript
const [exporting, setExporting] = useState(false);
```

**Step 3: Add the download handler function inside the component, before the return**

```typescript
const handleExportFullReport = async () => {
  setExporting(true);
  try {
    const res = await api.get('/export/full-report', { responseType: 'blob' });
    const dateStr = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `talenthub-export-${dateStr}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded successfully');
  } catch (err: any) {
    toast.error(err?.response?.data?.error?.message ?? 'Failed to generate report');
  } finally {
    setExporting(false);
  }
};
```

**Step 4: Add the export card to the JSX**

Find the section where the upload cards end (look for the last `</div>` closing a card section) and add below it:

```tsx
{/* ── Full Report Export ─────────────────────────────── */}
<div className="rounded-xl border border-border bg-card p-6">
  <div className="flex items-start justify-between gap-4">
    <div>
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Download className="w-4 h-4 text-primary" />
        Export Full Report
      </h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-md">
        Download an Excel workbook with all employee, compensation, and benefits data
        plus an AI-generated summary for each section — useful as a timestamped archive
        before uploading a fresh data file.
      </p>
      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground list-disc list-inside">
        <li>Sheet 1 — AI Summary (People · Compensation · Benefits)</li>
        <li>Sheet 2 — All Employees (every field, all statuses)</li>
        <li>Sheet 3 — Compensation Rollup (Band × Department)</li>
        <li>Sheet 4 — Benefits Enrollments (Active · Expired · Claimed)</li>
      </ul>
    </div>
    <button
      onClick={handleExportFullReport}
      disabled={exporting}
      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {exporting ? (
        <>
          <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          Generating…
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          Generate &amp; Download
        </>
      )}
    </button>
  </div>
</div>
```

**Step 5: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep DataCenter
```
Expected: no output.

**Step 6: Commit**

```bash
git add frontend/src/pages/DataCenterPage.tsx
git commit -m "feat(export): add Export Full Report card to Data Center"
```

---

## Task 7: End-to-end verification & final commit

**Step 1: Build backend**

```bash
cd backend && npm run build 2>&1 | tail -5
```
Expected: `Found 0 errors.`

**Step 2: Build frontend**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: no errors.

**Step 3: Manual smoke test**
1. Open Data Center page in browser
2. Scroll to "Export Full Report" card — button should be visible
3. Click "Generate & Download"
4. Button shows spinner + "Generating…" for ~10–15 seconds
5. File `talenthub-export-YYYY-MM-DD.xlsx` downloads automatically
6. Open in Excel/Sheets — verify 4 sheets exist: AI Summary, Employees, Compensation, Benefits
7. AI Summary sheet has 3 sections with bullet points
8. Employees sheet has all employees (all statuses, all columns)
9. Benefits sheet has all enrollment rows

**Step 4: Push**

```bash
git push origin main
```
