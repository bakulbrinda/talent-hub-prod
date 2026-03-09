# Full Report Export — Design Doc

**Date:** 2026-03-09
**Status:** Approved

---

## Problem

HR needs to archive a snapshot of current platform data (employees, compensation, benefits) together with AI-generated insights for each section. The exported file serves as a timestamped record before a fresh Zoho CSV upload replaces the live data.

There is currently no way to download data + AI analysis together in one file.

---

## Solution

A single **"Export Full Report"** card added to the Data Center page. One click generates and downloads an Excel workbook (`talenthub-export-YYYY-MM-DD.xlsx`) containing four sheets: AI Summary, Employees, Compensation, and Benefits.

---

## Workbook Structure

| Sheet | Contents |
|---|---|
| **AI Summary** | Export timestamp + three sections (People / Compensation / Benefits), each with 3–5 AI-generated bullet points |
| **Employees** | All employees (all statuses) — every compensation and demographic field, no omissions |
| **Compensation** | Band × department rollup — headcount, avg fixed, avg compa-ratio, min/max fixed, % with variable pay |
| **Benefits** | All enrollment rows (ACTIVE, EXPIRED, CLAIMED) joined with employee name |

File name: `talenthub-export-YYYY-MM-DD.xlsx`

---

## Backend

**Endpoint:** `GET /api/export/full-report`
**Auth:** `authenticate` middleware (any role)

**Steps:**
1. Fetch all employees from Prisma — full field set, no status filter
2. Fetch all benefit enrollments joined with employee name
3. Compute aggregate stats in-process from fetched data (band counts, gender split, avg compa-ratio, dept breakdown, benefit utilization averages) — no extra DB queries
4. Call Claude **once** with aggregate stats → returns structured JSON with 3 sections × 3–5 bullets
5. Build xlsx workbook (4 sheets) using the `xlsx` package already installed in backend
6. Return as `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with `Content-Disposition: attachment; filename="talenthub-export-YYYY-MM-DD.xlsx"`

**Claude prompt strategy:** Pass only aggregate numbers (not raw rows) to keep the AI call compact and fast (~5–8 s). Total endpoint time: ~10–15 s.

**New files:**
- `backend/src/services/fullReportExport.service.ts` — data fetch, stat computation, Claude call, xlsx assembly
- `backend/src/controllers/fullReportExport.controller.ts` — thin handler
- `backend/src/routes/fullReportExport.routes.ts` — single GET route
- Mount in `app.ts`: `app.use('/api/export', fullReportExportRoutes)` (alongside existing export routes, or extend the existing `export.routes.ts`)

---

## Frontend

**File modified:** `frontend/src/pages/DataCenterPage.tsx`

Add a new card below the existing upload panels:
- Label: **"Export Full Report"**
- Button: **"Generate & Download"** with a download icon
- Loading state: button disabled + spinner + `"Generating report…"` text
- Success: browser auto-downloads the xlsx (no navigation)
- Error: `toast.error(message)`

**Fetch pattern:**
```typescript
const res = await api.get('/export/full-report', { responseType: 'blob' });
const url = URL.createObjectURL(new Blob([res.data]));
const a = document.createElement('a');
a.href = url;
a.download = `talenthub-export-${today}.xlsx`;
a.click();
URL.revokeObjectURL(url);
```

---

## Data Completeness

- Employees: all statuses (Active, Inactive, On Leave, Terminated), all fields
- Benefits: all statuses (ACTIVE, EXPIRED, CLAIMED)
- No pagination — full table dump

---

## Out of Scope

- PDF format
- Per-employee AI commentary
- Scheduled / recurring exports
- Email delivery of the export
