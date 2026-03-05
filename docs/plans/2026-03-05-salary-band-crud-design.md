# Salary Band CRUD & Transparent Classification — Design

**Date:** 2026-03-05

## Goal

Replace the flat, unordered band card grid with a grouped, per-department view and add full CRUD (create, edit, delete) on both band tiers and salary ranges — with all changes propagating across compa-ratio, pay equity, outliers, dashboard, and employee profiles.

## Context

The `SalaryBand` table stores one range per `Band × Department` combination (e.g., P1-Engineering, P1-HR, P1-Sales). The `Band` table holds the 10 fixed tiers (A1→D2). The Range Editor currently renders all SalaryBand records in a flat grid, making it look like duplicate bands. `getOutliers` uses a last-write-wins Map, producing a non-deterministic outlier count.

## Architecture

### Data Model (no migration needed)

```
Band (id, code, label, level, isEligibleForRSU)
  └── SalaryBand (id, bandId, jobAreaId?, minSalary, midSalary, maxSalary, effectiveDate)
```

- Keep all existing per-dept records
- Expose `DELETE /api/salary-bands/:id` and new `POST /api/bands` / `DELETE /api/bands/:id`
- Employee impact check before Band deletion

### Range Editor — Grouped Layout

Cards grouped by band code with collapsible sections. Each card shows dept badge, min/mid/max bars, Edit (✎) and Delete (🗑) buttons. Null-jobArea records shown as "All Departments".

### Add New Band (2-step modal)

Step 1 — Choose existing Band OR create new tier (code, label, level, RSU toggle)
Step 2 — Set salary range (min/mid/max/effective date/dept optional)

### Edit Flow

Click ✎ → modal with min/mid/max/effective date. Save → `PATCH /api/salary-bands/:id` → batch compa-ratio recalc for all employees in that band + cache bust + socket emit (already implemented in `salaryBandService.update`).

### Delete Rules

- SalaryBand record: always deletable, confirmation required
- Band tier: blocked if any active employees have that band code; otherwise cascades

### Outliers Fix

`getOutliers` builds `bandMap` with last-write-wins per band code. Fix: prefer `jobAreaId = null` ("All Departments") record per band. Fallback to first found if no null-jobArea record exists.

## Propagation

All edits flow through the existing `salaryBandService.update` path which already:
1. Batch-recalculates `compaRatio` + `payRangePenetration` for all active employees in the band
2. Busts `dashboard:*`, `pay-equity:*`, `salary-bands:*`, `performance:*` caches
3. Emits `SALARY_BAND_UPDATED` socket event → all clients invalidate React Query cache

## Files Affected

**Backend:**
- `backend/src/services/salaryBand.service.ts` — add `delete`, fix `getOutliers`
- `backend/src/controllers/salaryBand.controller.ts` — add delete handler
- `backend/src/routes/salaryBand.routes.ts` — add DELETE route
- `backend/src/services/band.service.ts` (new or extend existing)
- `backend/src/controllers/band.controller.ts` (extend)
- `backend/src/routes/band.routes.ts` (extend)

**Frontend:**
- `frontend/src/pages/SalaryBandDesignerPage.tsx` — full Range Editor rewrite
- `frontend/src/services/salaryBand.service.ts` — add delete call
