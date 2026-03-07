# Data Center — Design Document

**Date:** 2026-03-07
**Status:** Approved
**Feature:** Centralized data upload hub replacing per-page import modals

---

## Overview

A new "Data Center" sidebar group at `/data-center` consolidates all bulk data uploads into one place. It replaces the existing `ImportEmployeesModal` (removed entirely) and adds a new benefits & RSU upload flow. HR users get a single, clear destination for loading data into the platform.

Two upload cards on the page:
1. **Employee Data** — XLS/CSV upload using existing import pipeline (Zoho format, 46 columns)
2. **Benefits & RSU** — new XLS upload mapping employee benefit enrollments and RSU utilization

---

## Architecture

### New Files

**Frontend**
- `frontend/src/pages/DataCenterPage.tsx`
  - Two upload cards, each with: template download button, drag-drop upload zone, upload mode toggle (replace vs upsert), progress/error display, last-upload timestamp

**Backend**
- `backend/src/services/benefitsImport.service.ts` — parse benefits XLS, validate rows, upsert `EmployeeBenefit` records
- `backend/src/controllers/benefitsImport.controller.ts` — thin handler
- `backend/src/routes/benefitsImport.routes.ts` — mounts `POST /api/import/benefits` and `GET /api/import/benefits/template`

### Modified Files

| File | Change |
|---|---|
| `frontend/src/App.tsx` | Add `/data-center` lazy route; remove `ImportEmployeesModal` import |
| `frontend/src/components/layout/Sidebar.tsx` | Add "Data Center" nav group (`Database` icon) before Benefits |
| `frontend/src/pages/EmployeeDirectoryPage.tsx` | Remove Import button, modal state, and `ImportEmployeesModal` usage |
| `backend/src/app.ts` | Mount `benefitsImport.routes.ts` at `/api/import` |

### Deleted Files

| File | Reason |
|---|---|
| `frontend/src/components/employees/ImportEmployeesModal.tsx` | Entire component removed; functionality moves to DataCenterPage |

### Untouched (Reused)

- `POST /api/import/employees` — DataCenterPage calls this directly
- `GET /api/import/template` — reused for employee template download
- `backend/src/services/import.service.ts` — no changes
- `backend/src/routes/import.routes.ts` — no changes

---

## Benefits & RSU Template Structure

File format: `.xlsx` (also accepts `.csv`)

| Column | Required | Prisma Field | Notes |
|---|---|---|---|
| `Employee ID` | Yes | `employee.employeeId` | Lookup key |
| `Benefit Name` | Yes | `BenefitsCatalog.name` | Case-insensitive match against catalog |
| `Status` | Yes | `EmployeeBenefit.status` | `ACTIVE` / `EXPIRED` / `CLAIMED` |
| `Annual Value (₹)` | No | `EmployeeBenefit.annualValue` | Defaults to catalog value if blank |
| `Utilization %` | No | `EmployeeBenefit.utilizationPercent` | RSU vesting %; 0–100 |
| `Utilized Value (₹)` | No | `EmployeeBenefit.utilizedValue` | RSU vested ₹ amount |
| `Enrolled Date` | No | `EmployeeBenefit.enrolledAt` | ISO date or DD-MM-YYYY |
| `Expiry Date` | No | `EmployeeBenefit.expiresAt` | Optional |
| `Notes` | No | `EmployeeBenefit.notes` | Free text |

**Upload behaviour:** Upsert per `(employeeId, benefitName)` pair. Existing records are updated; new pairs are inserted. No rows are deleted. Unknown benefit names are rejected with a row-level error list returned to the UI.

---

## Sidebar Navigation

New group added between People and Benefits:

```
Data Center (Database icon)
  └── Data Center    /data-center
```

Collapsed sidebar: shows `Database` icon navigating to `/data-center`.

---

## Risks & Affected Features

| Feature / Page | Risk Level | Impact & Mitigation |
|---|---|---|
| **Employees page** | Low | Import button removed. No functional regression — upload moved to Data Center. |
| **Benefits & RSU tab** | Medium | Benefits upload overwrites `utilizationPercent` / `utilizedValue`. Expected intentional behaviour. UI will warn: "This will replace existing benefit records for uploaded employees." |
| **Dashboard KPIs** | Medium | Dashboard reads `EmployeeBenefit` aggregates. A bad upload could skew numbers. Mitigation: row-level validation rejects unknown benefit names before any DB writes; all-or-nothing transaction per batch. |
| **AI chat tools** | None | `get_employees`, `get_benefits` tools read DB — will reflect newly imported data correctly. |
| **Socket.io events** | Low | Employee import must still emit `EMPLOYEE_DATA_CHANGED` (already done in existing service). Preserve this in DataCenterPage upload handler. |
| **Seeded demo data** | Low | First benefits upload replaces seed data for those employees. Documented in UI warning. Intentional. |
| **ImportEmployeesModal deletion** | Low | Only used in `EmployeeDirectoryPage`. Confirmed via grep before deletion. |
| **Pay Equity / Salary Bands / Scenarios** | None | No dependency on import routes. |

---

## Tasks

### Task 1 — Backend: Benefits import endpoint
- Create `benefitsImport.service.ts`: parse XLS/CSV, validate rows (unknown benefit names, invalid status values, Employee ID not found), upsert `EmployeeBenefit` records in a transaction, return `{ imported, updated, errors[] }`
- Create `benefitsImport.controller.ts`
- Create `benefitsImport.routes.ts` with `POST /api/import/benefits` (multer upload, ADMIN+HR_MANAGER) and `GET /api/import/benefits/template` (generate and stream template XLS)
- Mount in `backend/src/app.ts`

### Task 2 — Frontend: DataCenterPage
- Create `DataCenterPage.tsx` with two upload cards
- Employee card: calls `POST /api/import/employees`, template via `GET /api/import/template`, replace/upsert toggle
- Benefits card: calls `POST /api/import/benefits`, template via `GET /api/import/benefits/template`
- Both cards: drag-drop zone, file picker fallback, progress state, error list display, success summary (N imported, N updated, N errors)
- Add `Database` icon import from lucide-react

### Task 3 — Sidebar & Routing
- Add "Data Center" group to `Sidebar.tsx` (between People and Benefits) with `Database` icon
- Add lazy route `/data-center` → `DataCenterPage` in `App.tsx`

### Task 4 — Cleanup: Remove ImportEmployeesModal
- Grep codebase for all usages of `ImportEmployeesModal`
- Remove import button, modal state, and `ImportEmployeesModal` JSX from `EmployeeDirectoryPage.tsx`
- Delete `frontend/src/components/employees/ImportEmployeesModal.tsx`
- Verify no broken imports remain (`tsc --noEmit`)

### Task 5 — Generate test Excel files
- Generate `test-employees.xlsx` (10 rows, Zoho format, all required columns filled) saved to `docs/test-data/`
- Generate `test-benefits.xlsx` (sample rows covering Medical Insurance, RSU Grant, Training Allowance) saved to `docs/test-data/`

### Task 6 — Verification
- Run `tsc --noEmit` on both backend and frontend
- Manually test employee upload end-to-end via Data Center
- Manually test benefits upload end-to-end via Data Center
- Verify Benefits & RSU tab still renders correctly after upload
- Verify Dashboard KPIs unchanged after upload with same data
- Verify AI chat `get_employees` and `get_benefits` tools return updated data

---

## Out of Scope

- Upload history / audit log of past uploads (future enhancement)
- Deleting benefit enrollments via upload (explicit delete column could be added later)
- Benefits catalog management via upload (catalog is code-managed)
