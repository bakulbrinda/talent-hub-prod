# Salary Band CRUD & Transparent Classification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat duplicate-looking band card grid with a grouped per-department view, add full CRUD (edit, create new tier, delete range/tier) on salary bands, and fix the outliers query so band changes propagate correctly across all pages.

**Architecture:** The `SalaryBand` table stores one range per Band × Department combination. The `Band` table holds the tier definitions (A1→D2). We extend the existing `salaryBandService.update` path (which already batch-recalculates compa-ratio + busts caches + emits socket) with new `delete` and fix `getOutliers`. Backend gets two new endpoints (`DELETE /api/salary-bands/:id` and `DELETE /api/bands/:id`). Frontend rewrites the Range Editor tab into a grouped collapsible layout with inline Edit and Delete buttons.

**Tech Stack:** Express + Prisma (backend), React + TanStack Query + Zustand (frontend), TypeScript throughout, sonner toasts, lucide-react icons.

---

## Key File Paths

- `backend/src/services/salaryBand.service.ts` — add `delete`, fix `getOutliers`
- `backend/src/controllers/salaryBand.controller.ts` — add `deleteSalaryBand`
- `backend/src/routes/salaryBand.routes.ts` — add `DELETE /:id`
- `backend/src/services/jobArchitecture.service.ts` — add `deleteBand` with employee guard
- `backend/src/controllers/jobArchitecture.controller.ts` — add `deleteBand`
- `backend/src/routes/jobArchitecture.routes.ts` — add `DELETE /bands/:id` and `PUT /bands/:id`
- `frontend/src/services/salaryBand.service.ts` — add `deleteSalaryBand`
- `frontend/src/pages/SalaryBandDesignerPage.tsx` — rewrite Range Editor tab

## Existing Behaviour to Preserve

- `salaryBandService.update` already triggers batch compa-ratio recalc + cache bust + socket emit — do NOT change this
- `GET /api/bands` and `POST /api/bands` already exist in `jobArchitecture.routes.ts` / `jobArchitecture.controller.ts`
- `salaryBandService.create` and `update` already work — reuse them
- `queryKeys.salaryBands.all()` and `queryKeys.jobArchitecture.bands` are the cache keys to invalidate

---

## Task 1: Fix `getOutliers` to use canonical band range

**Problem:** `getOutliers` builds `bandMap` using `new Map(bands.map(b => [b.band.code, b]))`. When multiple SalaryBand records exist for the same band code (e.g. P1-Engineering, P1-HR, P1-Sales), only the last one survives — non-deterministic. Fix: prefer `jobAreaId = null` records; fall back to first found.

**Files:**
- Modify: `backend/src/services/salaryBand.service.ts:70-103`

**Step 1: Replace the `getOutliers` method**

Open `backend/src/services/salaryBand.service.ts`. Replace the entire `getOutliers` method (lines ~70–103) with:

```typescript
getOutliers: async () => {
  const employees = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE' },
    select: {
      id: true, firstName: true, lastName: true,
      band: true, department: true, annualFixed: true,
      compaRatio: true, designation: true,
    },
  });

  const bands = await prisma.salaryBand.findMany({ include: { band: true } });

  // Prefer the "All Departments" (null jobAreaId) record per band code.
  // Fall back to the first record found for that code.
  const bandMap = new Map<string, (typeof bands)[number]>();
  for (const sb of bands) {
    const code = sb.band.code;
    const existing = bandMap.get(code);
    if (!existing || sb.jobAreaId === null) {
      bandMap.set(code, sb);
    }
  }

  return employees
    .filter(emp => {
      const sb = bandMap.get(emp.band);
      if (!sb) return false;
      const salary = Number(emp.annualFixed);
      return salary < Number(sb.minSalary) || salary > Number(sb.maxSalary);
    })
    .map(emp => {
      const sb = bandMap.get(emp.band)!;
      const salary = Number(emp.annualFixed);
      const minSalary = Number(sb.minSalary);
      const maxSalary = Number(sb.maxSalary);
      return {
        ...emp,
        minSalary,
        midSalary: Number(sb.midSalary),
        maxSalary,
        delta: salary < minSalary ? salary - minSalary : salary - maxSalary,
      };
    });
},
```

**Step 2: Restart backend and verify outlier count is consistent**

```bash
cd backend && npm run dev
```

Hit `GET http://localhost:3001/api/salary-bands/analysis/outliers` multiple times — count should be the same each call.

**Step 3: Commit**

```bash
git add backend/src/services/salaryBand.service.ts
git commit -m "fix: getOutliers prefers null-jobArea canonical band range"
```

---

## Task 2: Add `DELETE /api/salary-bands/:id` endpoint

Deleting a SalaryBand record (a single range row) is always safe — employees keep their band code, only the range definition is removed.

**Files:**
- Modify: `backend/src/services/salaryBand.service.ts`
- Modify: `backend/src/controllers/salaryBand.controller.ts`
- Modify: `backend/src/routes/salaryBand.routes.ts`

**Step 1: Add `deleteSalaryBand` to the service**

In `backend/src/services/salaryBand.service.ts`, add this method after `update`:

```typescript
deleteSalaryBand: async (id: string) => {
  await prisma.salaryBand.delete({ where: { id } });
  // Bust caches so pages reflect the removed range
  await Promise.allSettled([
    cacheDelPattern('dashboard:*'),
    cacheDelPattern('salary-bands:*'),
  ]);
  emitSalaryBandUpdated();
},
```

**Step 2: Add the controller handler**

In `backend/src/controllers/salaryBand.controller.ts`, add:

```typescript
deleteSalaryBand: async (req: Request, res: Response, next: NextFunction) => {
  try {
    await salaryBandService.deleteSalaryBand(req.params.id);
    res.json({ data: { success: true } });
  } catch (e) { next(e); }
},
```

**Step 3: Wire the route**

In `backend/src/routes/salaryBand.routes.ts`, add before `export default router`:

```typescript
router.delete('/:id', ctrl.deleteSalaryBand);
```

**Step 4: Verify**

```bash
# Restart backend, then:
curl -X DELETE http://localhost:3001/api/salary-bands/<some-id> \
  -H "Authorization: Bearer <token>"
# Expected: {"data":{"success":true}}
```

**Step 5: Commit**

```bash
git add backend/src/services/salaryBand.service.ts \
        backend/src/controllers/salaryBand.controller.ts \
        backend/src/routes/salaryBand.routes.ts
git commit -m "feat: add DELETE /api/salary-bands/:id endpoint"
```

---

## Task 3: Add `PUT /api/bands/:id` and `DELETE /api/bands/:id` endpoints

`PUT` updates the Band tier's label/code/level/RSU flag. `DELETE` is guarded: if any active employees are in that band, return 409 with a count.

**Files:**
- Modify: `backend/src/services/jobArchitecture.service.ts`
- Modify: `backend/src/controllers/jobArchitecture.controller.ts`
- Modify: `backend/src/routes/jobArchitecture.routes.ts`

**Step 1: Add `updateBand` and `deleteBand` to the service**

In `backend/src/services/jobArchitecture.service.ts`, after `createBand`, add:

```typescript
updateBand: async (id: string, data: { code?: string; label?: string; level?: number; isEligibleForRSU?: boolean }) =>
  prisma.band.update({ where: { id }, data }),

deleteBand: async (id: string) => {
  const band = await prisma.band.findUniqueOrThrow({ where: { id } });
  const employeeCount = await prisma.employee.count({
    where: { band: band.code, employmentStatus: 'ACTIVE' },
  });
  if (employeeCount > 0) {
    const err: any = new Error(`Cannot delete band ${band.code} — ${employeeCount} active employee(s) assigned to it`);
    err.status = 409;
    err.employeeCount = employeeCount;
    throw err;
  }
  // Delete salary bands first (no cascade on SalaryBand→Band by default)
  await prisma.salaryBand.deleteMany({ where: { bandId: id } });
  return prisma.band.delete({ where: { id } });
},
```

**Step 2: Add controller handlers**

In `backend/src/controllers/jobArchitecture.controller.ts`, add:

```typescript
updateBand: async (req: Request, res: Response, next: NextFunction) => {
  try { res.json({ data: await jobArchitectureService.updateBand(req.params.id, req.body) }); } catch (e) { next(e); }
},
deleteBand: async (req: Request, res: Response, next: NextFunction) => {
  try {
    await jobArchitectureService.deleteBand(req.params.id);
    res.json({ data: { success: true } });
  } catch (e: any) {
    if (e.status === 409) {
      res.status(409).json({ error: { code: 'BAND_IN_USE', message: e.message, employeeCount: e.employeeCount } });
    } else {
      next(e);
    }
  }
},
```

**Step 3: Wire the routes**

In `backend/src/routes/jobArchitecture.routes.ts`, add after the existing band routes:

```typescript
router.put('/bands/:id', ctrl.updateBand);
router.delete('/bands/:id', ctrl.deleteBand);
```

**Step 4: Verify**

```bash
# Try deleting a band that has employees — expect 409
curl -X DELETE http://localhost:3001/api/bands/<band-with-employees-id> \
  -H "Authorization: Bearer <token>"
# Expected: 409 { "error": { "code": "BAND_IN_USE", "message": "..." } }
```

**Step 5: Commit**

```bash
git add backend/src/services/jobArchitecture.service.ts \
        backend/src/controllers/jobArchitecture.controller.ts \
        backend/src/routes/jobArchitecture.routes.ts
git commit -m "feat: add PUT and DELETE /api/bands/:id with employee guard"
```

---

## Task 4: Add `deleteSalaryBand` to frontend service

**Files:**
- Modify: `frontend/src/services/salaryBand.service.ts`

**Step 1: Add the method**

In `frontend/src/services/salaryBand.service.ts`, add after `update`:

```typescript
deleteSalaryBand: async (id: string) => {
  const res = await api.delete<{ data: { success: boolean } }>(`/salary-bands/${id}`);
  return res.data;
},
```

**Step 2: Commit**

```bash
git add frontend/src/services/salaryBand.service.ts
git commit -m "feat: add deleteSalaryBand to frontend salary band service"
```

---

## Task 5: Rewrite Range Editor tab — grouped collapsible layout with CRUD

This is the main UI task. The Range Editor tab shows all SalaryBand records grouped by band code (A1, A2, P1…). Each group has a collapsible header with the band label. Inside, cards show each dept variant. Each card has Edit (✎) and Delete (🗑) buttons.

**Files:**
- Modify: `frontend/src/pages/SalaryBandDesignerPage.tsx`

### What to build

**Range Editor grouped structure:**

```
▼ P1  · Professional Level 1  (4 ranges)          [+ Add Range]
  [P1 Engineering card]  [P1 HR card]  [P1 Sales card]  [P1 All card]

▼ P2  · Professional Level 2  (3 ranges)          [+ Add Range]
  ...
```

**Each card** shows:
- Band code badge (colored) + dept label ("Engineering" / "All Departments")
- Min / Mid / Max progress bars with formatted values
- Effective date in small text
- `✎ Edit` and `🗑` icon buttons

**Edit modal** (triggered by ✎):
- Fields: Min (₹), Mid (₹), Max (₹), Effective Date
- Save → `PUT /api/salary-bands/:id` → invalidate `['salary-bands']` and `['bands']` query keys

**Add Range modal** (triggered by "+ Add Range" inside a group, or the top "New Band" button for a full new tier):
- For "+ Add Range": bandId is pre-filled (the group's band), user picks dept (optional) + min/mid/max/date
- For "New Band": Step 1 = new tier fields (code, label, level, RSU toggle); Step 2 = range fields

**Delete range** (🗑 on a card):
- Confirmation: "Delete P1 · Engineering range?" with band+dept info
- On confirm: `DELETE /api/salary-bands/:id`

**Delete tier** (red trash icon in the group header, only visible on hover):
- Confirmation: "Delete entire P1 band tier and all its ranges?"
- On error (409): show "Cannot delete — N employees assigned"

**Step 1: Add new state and mutations near the top of the component**

Inside `SalaryBandDesignerPage`, after the existing `createMutation`, add:

```typescript
// ── Edit salary-band range ──
const [editingRange, setEditingRange] = useState<any | null>(null);
const [editForm, setEditForm] = useState({ minSalary: '', midSalary: '', maxSalary: '', effectiveDate: '' });

const updateMutation = useMutation({
  mutationFn: () => salaryBandService.update(editingRange!.id, {
    minSalary: Number(editForm.minSalary),
    midSalary: Number(editForm.midSalary),
    maxSalary: Number(editForm.maxSalary),
    effectiveDate: new Date(editForm.effectiveDate),
  }),
  onSuccess: () => {
    toast.success('Band range updated');
    qc.invalidateQueries({ queryKey: ['salary-bands'] });
    setEditingRange(null);
  },
  onError: () => toast.error('Failed to update range'),
});

// ── Delete salary-band range ──
const [deletingRange, setDeletingRange] = useState<any | null>(null);
const deleteRangeMutation = useMutation({
  mutationFn: () => salaryBandService.deleteSalaryBand(deletingRange!.id),
  onSuccess: () => {
    toast.success('Range deleted');
    qc.invalidateQueries({ queryKey: ['salary-bands'] });
    setDeletingRange(null);
  },
  onError: () => toast.error('Failed to delete range'),
});

// ── Delete band tier ──
const [deletingTier, setDeletingTier] = useState<any | null>(null); // band object
const deleteTierMutation = useMutation({
  mutationFn: () => api.delete(`/bands/${deletingTier!.id}`),
  onSuccess: () => {
    toast.success(`Band ${deletingTier!.code} deleted`);
    qc.invalidateQueries({ queryKey: ['salary-bands'] });
    qc.invalidateQueries({ queryKey: ['bands'] });
    setDeletingTier(null);
  },
  onError: (err: any) => {
    const msg = err?.response?.data?.error?.message || 'Failed to delete band';
    toast.error(msg);
    setDeletingTier(null);
  },
});

// ── Add range (pre-filled band) ──
const [addRangeBandId, setAddRangeBandId] = useState<string | null>(null);
const EMPTY_ADD_FORM = { bandId: '', minSalary: '', midSalary: '', maxSalary: '', effectiveDate: new Date().toISOString().slice(0, 10), jobAreaId: '' };
// reuse existing form + createMutation but add jobAreaId support

// ── Collapsible group state ──
const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
const toggleGroup = (code: string) =>
  setCollapsedGroups(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });
```

**Step 2: Build grouped data structure**

After `const bands: any[] = ...` in the component, add:

```typescript
// Group SalaryBand records by band code, preserving BAND_ORDER
const groupedBands = BAND_ORDER
  .map(code => {
    const ranges = bands.filter((sb: any) => sb.band?.code === code);
    if (ranges.length === 0) return null;
    return { code, band: ranges[0].band, ranges };
  })
  .filter(Boolean) as Array<{ code: string; band: any; ranges: any[] }>;

// Also collect band codes not in BAND_ORDER (custom tiers added by HR)
const standardCodes = new Set(BAND_ORDER);
const customGroups = bands
  .filter((sb: any) => sb.band?.code && !standardCodes.has(sb.band.code))
  .reduce((acc: any, sb: any) => {
    const code = sb.band.code;
    if (!acc[code]) acc[code] = { code, band: sb.band, ranges: [] };
    acc[code].ranges.push(sb);
    return acc;
  }, {});
const allGroups = [...groupedBands, ...Object.values(customGroups)] as Array<{ code: string; band: any; ranges: any[] }>;
```

**Step 3: Replace the Range Editor JSX**

Find the `{activeTab === 'editor' && (` block (lines ~287–336) and replace it entirely with:

```tsx
{activeTab === 'editor' && (
  <div className="space-y-3">
    {bands.length === 0 ? (
      <div className="rounded-xl border border-border bg-card py-12 text-center text-muted-foreground text-sm">
        No salary bands configured
      </div>
    ) : (
      allGroups.map(({ code, band, ranges }) => {
        const isCollapsed = collapsedGroups.has(code);
        return (
          <div key={code} className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Group Header */}
            <div
              className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-muted/20 transition-colors select-none"
              onClick={() => toggleGroup(code)}
            >
              <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isCollapsed && '-rotate-90')} />
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0', getBandColor(code))}>
                {code}
              </span>
              <span className="text-sm font-medium text-foreground">{band?.label || code}</span>
              <span className="text-xs text-muted-foreground">· {ranges.length} {ranges.length === 1 ? 'range' : 'ranges'}</span>
              <div className="flex-1" />
              {/* Add range for this band */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setForm({ ...EMPTY_FORM, bandId: band.id });
                  setShowModal(true);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-primary hover:bg-primary/10 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add Range
              </button>
              {/* Delete entire tier */}
              <button
                onClick={(e) => { e.stopPropagation(); setDeletingTier(band); }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title={`Delete ${code} tier`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Cards grid */}
            {!isCollapsed && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 px-5 pb-4">
                {ranges.map((sb: any) => {
                  const min = Number(sb.minSalary);
                  const mid = Number(sb.midSalary);
                  const max = Number(sb.maxSalary);
                  const deptLabel = sb.jobArea?.name || 'All Departments';
                  return (
                    <div key={sb.id} className="p-3 rounded-xl border border-border hover:border-primary/40 transition-all bg-background">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs font-medium text-foreground truncate">{deptLabel}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => {
                              setEditingRange(sb);
                              setEditForm({
                                minSalary: String(min),
                                midSalary: String(mid),
                                maxSalary: String(max),
                                effectiveDate: sb.effectiveDate
                                  ? new Date(sb.effectiveDate).toISOString().slice(0, 10)
                                  : new Date().toISOString().slice(0, 10),
                              });
                            }}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit range"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setDeletingRange(sb)}
                            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-500 transition-colors"
                            title="Delete range"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {[
                          { label: 'Min', value: min, pct: '0%' },
                          { label: 'Mid', value: mid, pct: max > min ? `${(((mid - min) / (max - min)) * 100).toFixed(0)}%` : '50%' },
                          { label: 'Max', value: max, pct: '100%' },
                        ].map(f => (
                          <div key={f.label} className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground w-5 flex-shrink-0">{f.label}</span>
                            <div className="flex-1 h-1 bg-muted rounded-full">
                              <div className="h-full bg-primary/60 rounded-full" style={{ width: f.pct }} />
                            </div>
                            <span className="text-[10px] font-mono w-16 text-right text-foreground">{formatINR(f.value, true)}</span>
                          </div>
                        ))}
                      </div>
                      {sb.effectiveDate && (
                        <p className="text-[9px] text-muted-foreground mt-1.5">
                          Effective {new Date(sb.effectiveDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })
    )}
  </div>
)}
```

**Step 4: Add Edit Range modal JSX**

After the existing New Band modal (`{showModal && ...}`), add:

```tsx
{/* ── Edit Range Modal ── */}
{editingRange && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-base font-semibold text-foreground">Edit Salary Range</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {editingRange.band?.code} · {editingRange.jobArea?.name || 'All Departments'}
          </p>
        </div>
        <button onClick={() => setEditingRange(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }}
        className="px-6 py-5 space-y-4"
      >
        <div className="grid grid-cols-3 gap-3">
          {(['minSalary', 'midSalary', 'maxSalary'] as const).map(field => (
            <div key={field}>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                {field === 'minSalary' ? 'Min (₹)' : field === 'midSalary' ? 'Mid (₹)' : 'Max (₹)'}
              </label>
              <input
                required type="number" min={0} step={1000}
                value={editForm[field]}
                onChange={(e) => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Effective Date</label>
          <input
            required type="date"
            value={editForm.effectiveDate}
            onChange={(e) => setEditForm(f => ({ ...f, effectiveDate: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => setEditingRange(null)}
            className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={updateMutation.isPending}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60">
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  </div>
)}

{/* ── Delete Range Confirmation ── */}
{deletingRange && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
      <h2 className="text-base font-semibold text-foreground">Delete Range?</h2>
      <p className="text-sm text-muted-foreground">
        Remove <strong>{deletingRange.band?.code} · {deletingRange.jobArea?.name || 'All Departments'}</strong> salary range?
        This cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={() => setDeletingRange(null)}
          className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
          Cancel
        </button>
        <button onClick={() => deleteRangeMutation.mutate()} disabled={deleteRangeMutation.isPending}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60">
          {deleteRangeMutation.isPending ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
)}

{/* ── Delete Tier Confirmation ── */}
{deletingTier && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
      <h2 className="text-base font-semibold text-foreground">Delete Band Tier?</h2>
      <p className="text-sm text-muted-foreground">
        Delete the entire <strong>{deletingTier.code}</strong> band tier and all its salary ranges?
        This is blocked if any employees are assigned to this band.
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={() => setDeletingTier(null)}
          className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
          Cancel
        </button>
        <button onClick={() => deleteTierMutation.mutate()} disabled={deleteTierMutation.isPending}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60">
          {deleteTierMutation.isPending ? 'Deleting…' : 'Delete Tier'}
        </button>
      </div>
    </div>
  </div>
)}
```

**Step 5: Add `Trash2` and `ChevronDown` to imports**

The file already imports from `lucide-react`. Add `Trash2` and `ChevronDown` to the existing import line:

```typescript
import { Plus, TrendingUp, AlertTriangle, Edit2, X, Sparkles, Loader2, ArrowUp, ArrowDown, Minus, Trash2, ChevronDown } from 'lucide-react';
```

**Step 6: Update the existing New Band modal to support `jobAreaId`**

In the existing `createMutation`, update `mutationFn` to pass `jobAreaId` if set:

```typescript
const createMutation = useMutation({
  mutationFn: () => salaryBandService.create({
    bandId: form.bandId,
    ...(form.jobAreaId ? { jobAreaId: form.jobAreaId } : {}),
    minSalary: Number(form.minSalary),
    midSalary: Number(form.midSalary),
    maxSalary: Number(form.maxSalary),
    effectiveDate: new Date(form.effectiveDate),
  }),
  onSuccess: () => {
    toast.success('Salary band range created');
    qc.invalidateQueries({ queryKey: ['salary-bands'] });
    setShowModal(false);
    setForm(EMPTY_FORM);
  },
});
```

Update `EMPTY_FORM` to include `jobAreaId`:

```typescript
const EMPTY_FORM = { bandId: '', jobAreaId: '', minSalary: '', midSalary: '', maxSalary: '', effectiveDate: new Date().toISOString().slice(0, 10) };
```

Also fetch job areas for the department dropdown in the New Band modal. Add a query after `allBandsRaw`:

```typescript
const { data: jobAreasRaw } = useQuery({
  queryKey: ['job-areas'],
  queryFn: async () => { const r = await api.get('/job-areas'); return r.data; },
  staleTime: STALE_TIMES.LONG,
});
const jobAreas: any[] = (jobAreasRaw as any)?.data ?? (Array.isArray(jobAreasRaw) ? jobAreasRaw : []);
```

Add a Department field in the New Band modal form (before Effective Date):

```tsx
<div>
  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Department (optional)</label>
  <select
    value={form.jobAreaId}
    onChange={(e) => setForm(f => ({ ...f, jobAreaId: e.target.value }))}
    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
  >
    <option value="">All Departments</option>
    {jobAreas.map((ja: any) => (
      <option key={ja.id} value={ja.id}>{ja.name}</option>
    ))}
  </select>
</div>
```

**Step 7: Run the frontend and verify**

```bash
cd frontend && npm run dev
```

Open `/salary-bands` → Range Editor tab. Verify:
- Bands are grouped (e.g. P1 with Engineering/HR/Sales/Operations sub-cards)
- Each card shows Edit (✎) and Delete (🗑) buttons
- Clicking ✎ opens the edit modal with pre-filled values
- Saving triggers toast + cards update
- Clicking 🗑 on a card shows confirmation
- Group header shows `+ Add Range` and trash icon for tier delete

**Step 8: Commit**

```bash
git add frontend/src/pages/SalaryBandDesignerPage.tsx \
        frontend/src/services/salaryBand.service.ts
git commit -m "feat: Range Editor grouped by band tier with full CRUD"
```

---

## Task 6: Verify end-to-end propagation

**Step 1: Edit a salary band range**

1. Go to `/salary-bands` → Range Editor → click ✎ on any P1 card
2. Change Max from current value to something higher (e.g. increase by ₹5L)
3. Save
4. Go to `/employees` → click any P1 employee → Compensation tab → verify `compaRatio` has updated

**Step 2: Verify outliers update**

1. Go back to `/salary-bands` → Outliers tab
2. Count should reflect the updated range (fewer outliers if you raised the max)

**Step 3: Verify dashboard cache busted**

1. Go to `/dashboard` — the "Outside Band" KPI should reflect the updated count

**Step 4: Test delete guard**

1. In Range Editor, click the tier-level trash icon on P1 (which has employees)
2. Confirm — should fail with toast "Cannot delete P1 — N employees assigned"

**Step 5: Commit**

No code changes — just verification. If any issues found, fix them and commit with descriptive message.
