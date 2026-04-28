# Job Architecture — Edit Features Bug Audit

**Date:** 2026-04-27
**Scope:** All Create / Update / Delete operations across the Job Architecture module — `JobArea`, `JobFamily`, `Band`, `Grade`, `JobCode`.

**Files audited:**
- `backend/src/routes/jobArchitecture.routes.ts`
- `backend/src/controllers/jobArchitecture.controller.ts`
- `backend/src/services/jobArchitecture.service.ts`
- `backend/prisma/schema.prisma` (Job Architecture models)
- `frontend/src/pages/JobArchitecturePage.tsx`
- `frontend/src/services/jobArchitecture.service.ts`

**Totals:** 54 bugs — **5 Critical**, **14 High**, **34 Medium**, **1 Low**.

---

## Severity Summary

| Severity | Count | Bug IDs |
|---|---|---|
| Critical | 5 | 7, 18, 30, 35–37, 48 |
| High | 14 | 1, 4, 10, 11, 14, 22, 23, 26, 38, 39, 43, 44, 48, 51 |
| Medium | 34 | 2, 3, 5, 6, 8, 9, 12, 13, 15, 16, 17, 19, 20, 21, 24, 25, 27, 28, 29, 31, 32, 33, 34, 40, 41, 42, 45, 46, 47, 49, 50, 52, 53 |
| Low | 1 | 54 |

---

## JobArea

### Create

**Bug 1 — High — Missing input validation & trimming**
- File: `backend/src/services/jobArchitecture.service.ts:21-22`
- `createJobArea()` accepts raw `data` without Zod. Frontend trims (`JobArchitecturePage.tsx:154`), backend doesn't enforce.
- Fix: Add Zod in controller — `z.object({ name: z.string().trim().min(1), description: z.string().trim().optional() })`.

**Bug 2 — Medium — Missing audit log**
- File: `backend/src/controllers/jobArchitecture.controller.ts:11-12`
- No `logAction()` call. Hierarchy changes are not auditable.
- Fix: `logAction({ userId, action: 'JOB_AREA_CREATED', entityType: 'JobArea', entityId, metadata: { name } })`.

**Bug 3 — Medium — Missing socket emit**
- File: `backend/src/controllers/jobArchitecture.controller.ts:11-12`
- Concurrent users see stale hierarchy.
- Fix: Add `emitJobArchitectureRefresh()` helper and call it on success.

### Update

**Bug 4 — High — Missing input validation**
- File: `backend/src/services/jobArchitecture.service.ts:24-25`
- `updateJobArea()` accepts optional `name`/`description` with no validation; whitespace-only writes possible.
- Fix: Zod with trim + min length.

**Bug 5 — Medium — Missing audit log**
- File: `backend/src/controllers/jobArchitecture.controller.ts:14-15`

**Bug 6 — Medium — Missing socket emit**
- File: `backend/src/controllers/jobArchitecture.controller.ts:14-15`

### Delete

**Bug 7 — Critical — No referential-integrity check; silent destructive cascade**
- Files: `backend/src/services/jobArchitecture.service.ts:43-44`, `schema.prisma:101`
- `JobFamily.jobAreaId` is `onDelete: Cascade` → deleting an Area silently removes all Families and (transitively) all JobCodes under it. Employees assigned to those JobCodes are left with dangling `jobCodeId`.
- Fix: Pre-check `prisma.jobFamily.count({ where: { jobAreaId: id } })` and `prisma.employee.count({ where: { jobCode: { jobFamily: { jobAreaId: id } } } })`. If either > 0, throw 409 (mirror Band delete at `service.ts:56-72`).

**Bug 8 — Medium — Missing audit log**
- File: `backend/src/controllers/jobArchitecture.controller.ts:29-30`

**Bug 9 — Medium — Missing socket emit**
- File: `backend/src/controllers/jobArchitecture.controller.ts:29-30`

---

## JobFamily

### Create

**Bug 10 — High — Missing input validation**
- File: `backend/src/services/jobArchitecture.service.ts:34-35`
- `name`/`jobAreaId` not validated; bad UUID throws raw Prisma error.
- Fix: `z.object({ name: z.string().trim().min(1), jobAreaId: z.string().uuid() })` and verify area exists.

**Bug 11 — High — Unique-constraint violation not handled gracefully**
- Files: `service.ts:34-35`, `schema.prisma:106` (`@@unique([name, jobAreaId])`)
- Duplicates throw P2002, surfaced as generic 500 — no friendly message.
- Fix: Pre-check existence, return 409 `FAMILY_NAME_EXISTS`.

**Bug 12 — Medium — Missing audit log** — `controller.ts:20-21`

**Bug 13 — Medium — Missing socket emit** — `controller.ts:20-21`

### Update

**Bug 14 — High — Missing input validation**
- File: `service.ts:37-38`
- Fix: Zod with trim + min length on `name`.

**Bug 15 — Medium — Modal not pre-filling on prop change**
- File: `frontend/src/pages/JobArchitecturePage.tsx:193`
- `useState(family?.name ?? '')` runs once. If parent reuses modal across families, stale state leaks.
- Fix: `useEffect(() => { setName(family?.name ?? ''); }, [family?.id])`.

**Bug 16 — Medium — Missing audit log** — `controller.ts:23-24`

**Bug 17 — Medium — Missing socket emit** — `controller.ts:23-24`

### Delete

**Bug 18 — Critical — Cascade deletes JobCodes silently**
- Files: `service.ts:40-41`, `schema.prisma:143` (`JobCode.jobFamilyId` onDelete: Cascade)
- All child JobCodes vanish; employees referencing them are orphaned.
- Fix: Pre-check JobCode count and employee count; throw 409 if any > 0 (mirror Band delete logic).

**Bug 19 — Medium — UI gives no warning about cascade**
- File: `frontend/src/pages/JobArchitecturePage.tsx:644-649` (DeleteConfirm 125-142)
- Generic copy hides destructive scope.
- Fix: Fetch role count; show "This will delete N role(s) in this family."

**Bug 20 — Medium — Missing audit log** — `controller.ts:26-27`

**Bug 21 — Medium — Missing socket emit** — `controller.ts:26-27`

---

## Band

### Create

**Bug 22 — High — Missing input validation; unique conflicts unhandled**
- File: `service.ts:49-50`
- `code` and `level` are unique; collisions throw P2002.
- Fix: Zod + pre-check `prisma.band.findFirst({ where: { OR: [{ code }, { level }] } })`.

**Bug 23 — High — Frontend missing `createBand` service method**
- File: `frontend/src/services/jobArchitecture.service.ts` (only `updateBand` at line 48)
- Backend exposes `POST /bands` (`routes.ts:24`) but frontend cannot call it. The Bands tab UI offers no "Add" affordance.
- Fix: Add `createBand({ code, label, level, isEligibleForRSU })`; add UI button if creating new bands is intended (note: 10 bands are seeded fixed — confirm intent).

**Bug 24 — Medium — Missing audit log** — `controller.ts:35-36`

**Bug 25 — Medium — Missing socket emit** — `controller.ts:35-36`. Use `emitSalaryBandUpdated()` from `lib/socket.ts:142`.

### Update

**Bug 26 — High — Missing input validation**
- File: `service.ts:52-53`
- `label` can be set to empty string.
- Fix: `z.object({ label: z.string().trim().min(1).optional(), isEligibleForRSU: z.boolean().optional() })`.

**Bug 27 — Medium — Modal does not sync to prop changes**
- File: `JobArchitecturePage.tsx:295-335`
- Same pattern as Bug 15 — initial-state-only.
- Fix: `useEffect` keyed on `band?.id`.

**Bug 28 — Medium — Missing audit log** — `controller.ts:38-39`

**Bug 29 — Medium — Missing socket emit** — `controller.ts:38-39` (use `emitSalaryBandUpdated()`).

### Delete

**Bug 30 — Critical — `Grade` cascade not covered**
- Files: `service.ts:55-78`, `schema.prisma:129` (`Grade.bandId` onDelete: Cascade)
- Service checks employees + JobCodes but not Grades. Grades cascade-delete silently; any JobCode referencing them via `gradeId` (no Cascade on `JobCode.gradeId` per `schema.prisma:147`) will throw a raw FK error that the controller does not catch.
- Fix: Add Grade count check; either block if used or null out `JobCode.gradeId` in a transaction before deleting the band.

**Bug 31 — High — `SalaryBand` reference not pre-nullified**
- Files: `controller.ts:41-59`, `service.ts:55-78`, `schema.prisma:327`
- `SalaryBand.bandId` is required and has no `onDelete` set → defaults to `Restrict`, so delete will throw if any SalaryBand exists for the band. Service handles `MarketBenchmark` (line 74) but not `SalaryBand`.
- Fix: Either delete dependent SalaryBands first (with audit) or block with 409 `BAND_HAS_SALARY_BANDS`.

**Bug 32 — Medium — No delete affordance in UI**
- File: `JobArchitecturePage.tsx:1003-1057` (edit only at 1039)
- Inconsistent with Family/Area/JobCode tabs.
- Fix: Decide policy (admin-only via API, or expose with strong confirm modal showing dependent counts).

**Bug 33 — Medium — Missing audit log** — `controller.ts:41-59`

**Bug 34 — Medium — Missing socket emit** — `controller.ts:41-59`

---

## Grade

**Bugs 35 / 36 / 37 — Critical — No Create / Update / Delete routes**
- File: `backend/src/routes/jobArchitecture.routes.ts:28` (only `GET /grades`)
- Service has no `createGrade` / `updateGrade` / `deleteGrade`. UI has no Grade management.
- Fix: Decide intent. If Grades are read-only reference data, document it (and remove `updatedAt`/write-side schema cruft). If editable, implement full CRUD with: Zod validation, `bandId` existence check, FK-cascade-aware delete (block if any `JobCode.gradeId` or employee references it).

---

## JobCode

### Create

**Bug 38 — High — Missing validation on required fields**
- File: `service.ts:97-98`
- No Zod on `code` (unique), `title`, `jobFamilyId`, `bandId`, `gradeId?`. FK errors leak as 500s.
- Fix: Zod + pre-check `code` uniqueness; verify `jobFamilyId` and `bandId` exist.

**Bug 39 — High — `gradeId` not validated against `bandId`**
- File: `service.ts:97-98`
- Schema permits a Grade from a different Band → cross-band inconsistency.
- Fix: If `gradeId` provided, fetch and assert `grade.bandId === data.bandId`.

**Bug 40 — Medium — Backend does not trim/normalize `code`**
- File: `JobArchitecturePage.tsx:240` (frontend trims; backend trusts)
- Fix: `code: data.code.trim().toUpperCase()` in service.

**Bug 41 — Medium — Missing audit log** — `controller.ts:69-70`

**Bug 42 — Medium — Missing socket emit** — `controller.ts:69-70`

### Update

**Bug 43 — High — `bandId` change orphans assigned employees**
- File: `service.ts:100-106`
- `Employee.band` (string) is denormalized from JobCode's band; updating JobCode's band does not propagate, so directory filters and band-compliance calcs go out of sync.
- Fix: If `bandId` changing and `prisma.employee.count({ where: { jobCodeId: id } }) > 0`, either block (409) or update employees in the same transaction (preferred — also recompute compaRatio).

**Bug 44 — High — `gradeId` cross-band update not validated**
- File: `service.ts:100-106`
- Same root cause as Bug 39, on update path.

**Bug 45 — Medium — Edit modal drops `gradeId` and resets it on save**
- File: `JobArchitecturePage.tsx:232-234`
- Modal does not collect `gradeId`; if a JobCode had one set, saving an edit clears it implicitly.
- Fix: Either expose `gradeId` in the form or have the service preserve existing value when omitted (use `data.gradeId === undefined ? skip : set`).

**Bug 46 — Medium — Missing audit log** — `controller.ts:72-73`

**Bug 47 — Medium — Missing socket emit** — `controller.ts:72-73`

### Delete

**Bug 48 — Critical — No employee-reference check; orphans employees**
- File: `service.ts:108-109`
- `Employee.jobCodeId` is nullable but is silently de-referenced — employees keep the FK pointing nowhere. No transactional null-out either.
- Fix: Pre-check `prisma.employee.count({ where: { jobCodeId: id } })`; throw 409 `JOBCODE_IN_USE` with employee count.

**Bug 49 — Medium — Missing audit log** — `controller.ts:75-76`

**Bug 50 — Medium — Missing socket emit** — `controller.ts:75-76`

---

## Cross-Cutting

**Bug 51 — High — React Query invalidation incomplete**
- File: `JobArchitecturePage.tsx:812-818`
- `refreshHierarchy()` only invalidates `jobArchitecture.hierarchy`. `families`, `jobCodes`, and the Bands tab can be stale after edits to other entities.
- Fix: After each mutation, invalidate the specific entity key + hierarchy + dependent pages (e.g., `employees.all`, `salaryBands.*` when band/jobcode changes).

**Bug 52 — Medium — Backend error codes not surfaced in toasts**
- File: `JobArchitecturePage.tsx:246, 256, 304, 367`
- Backend returns codes like `BAND_IN_USE` (`controller.ts:49`) with `employeeCount`/`jobCodeCount`, but the toast just says "Failed to delete band".
- Fix: Read `e?.response?.data?.error?.code` and `.message`; show specifics (e.g., "Cannot delete — 12 employees and 3 roles still reference this band").

**Bug 53 — Medium — Pervasive `any` in frontend page**
- File: `JobArchitecturePage.tsx:148, 229, 351, 477, 557` (and others)
- Hides drift between frontend service shapes and backend response shapes.
- Fix: Define interfaces in `frontend/src/services/jobArchitecture.service.ts` (or share via `shared/types`) and remove `any`.

**Bug 54 — Low — Unique constraints are case-sensitive**
- File: `schema.prisma:86 (JobArea.name), 112 (Band.code), 140 (JobCode.code)`
- "BACKEND" and "backend" can both exist.
- Fix: Normalize on write (uppercase codes, title-case names) or use `citext` columns.

---

## Recommended Remediation Order

1. **Critical referential-integrity fixes** (Bugs 7, 18, 30, 31, 48) — these can corrupt employee data today. Wrap in a single PR with regression tests.
2. **Grade CRUD decision** (Bugs 35–37) — pick "read-only" or "full CRUD" and align schema + UI.
3. **Validation pass** (Bugs 1, 4, 10, 11, 14, 22, 26, 38, 39, 43, 44) — introduce a shared Zod module under `backend/src/schemas/jobArchitecture.ts` and apply in controllers.
4. **Frontend `createBand` + Band delete UI** (Bugs 23, 32) — close the API/UI gap.
5. **Audit logging + socket emits across all 5 entities** (Bugs 2, 3, 5, 6, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29, 33, 34, 41, 42, 46, 47, 49, 50) — add a single helper `auditAndBroadcastJobArchChange(action, entity, id, meta)`.
6. **Modal state sync** (Bugs 15, 27, 45) — `useEffect` on entity id.
7. **React Query + error UX** (Bugs 51, 52, 53) — surface backend codes.
8. **Case-insensitive uniqueness** (Bug 54) — schema migration.
