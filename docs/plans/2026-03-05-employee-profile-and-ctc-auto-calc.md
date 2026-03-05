# Employee Profile Page + CTC Auto-Calculation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full tabbed Employee Profile page (Identity / Compensation / Performance / Benefits & RSU), add live CTC auto-calculation in the edit modal, and add formula tooltips on derived compensation fields.

**Architecture:** Single `GET /api/employees/:id` call (already returns performanceRatings, benefits, rsuGrants, skills). Profile page is pure frontend — no new backend endpoints needed. Auto-calc uses react-hook-form `watch` + `setValue`. Tooltips are a small inline component using CSS hover.

**Tech Stack:** React 18, react-hook-form, @tanstack/react-query, TailwindCSS, lucide-react, shared Employee type from `@shared/types/index`

---

## Task 1: Live CTC Auto-Calculation in AddEmployeeModal

**Files:**
- Modify: `frontend/src/components/employees/AddEmployeeModal.tsx`

**Context:** The form uses react-hook-form. `annualFixed` is the base. `variablePay` should auto-fill as `annualFixed * 0.10` and `annualCtc` as `annualFixed * 1.20` when the user hasn't manually set them. Track whether each was manually edited with a local boolean flag.

**Step 1: Add `watch` and `setValue` to useForm destructure**

In `AddEmployeeModal.tsx`, find this line (~line 79):
```typescript
const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
```
Change to:
```typescript
const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<FormData>({
```

**Step 2: Add manual-edit tracking flags and auto-calc effect**

Add immediately after the `useForm` block (after line 84):
```typescript
const [ctcManual, setCtcManual] = useState(false);
const [vpManual, setVpManual] = useState(false);

const annualFixed = watch('annualFixed');

useEffect(() => {
  if (!annualFixed || isNaN(annualFixed)) return;
  if (!vpManual) setValue('variablePay', Math.round(annualFixed * 0.10));
  if (!ctcManual) setValue('annualCtc', Math.round(annualFixed * 1.20));
}, [annualFixed, vpManual, ctcManual]);
```

**Step 3: Update the Variable Pay input to track manual edits**

Find the Variable Pay `<Input>` in the compensation tab (~line 265). Replace:
```tsx
<Input
  type="number"
  placeholder="Auto: 10% of fixed"
  {...register('variablePay', { valueAsNumber: true })}
/>
```
With:
```tsx
<Input
  type="number"
  placeholder="Auto: 10% of fixed"
  {...register('variablePay', { valueAsNumber: true })}
  onChange={(e) => {
    setVpManual(true);
    register('variablePay', { valueAsNumber: true }).onChange(e);
  }}
/>
```

**Step 4: Update the Annual CTC input to track manual edits**

Find the Annual CTC `<Input>` (~line 272). Replace:
```tsx
<Input
  type="number"
  placeholder="Auto-calculated"
  {...register('annualCtc', { valueAsNumber: true })}
/>
```
With:
```tsx
<Input
  type="number"
  placeholder="Auto-calculated"
  {...register('annualCtc', { valueAsNumber: true })}
  onChange={(e) => {
    setCtcManual(true);
    register('annualCtc', { valueAsNumber: true }).onChange(e);
  }}
/>
```

**Step 5: Update the field labels to show "(auto)" badge**

Find the `<Field label="Variable Pay (₹)" ...>` label. Change to:
```tsx
<Field
  label={<span className="flex items-center gap-1">Variable Pay (₹) {!vpManual && annualFixed > 0 && <span className="text-[10px] text-primary/70 font-medium">(auto)</span>}</span>}
  error={errors.variablePay?.message}
>
```
And `<Field label="Annual CTC (₹)" ...>` to:
```tsx
<Field
  label={<span className="flex items-center gap-1">Annual CTC (₹) {!ctcManual && annualFixed > 0 && <span className="text-[10px] text-primary/70 font-medium">(auto)</span>}</span>}
  error={errors.annualCtc?.message}
>
```

**Step 6: Fix Field component to accept ReactNode label**

The `Field` component currently has `label: string`. Update its type:
```typescript
function Field({ label, error, children }: { label: React.ReactNode; error?: string; children: React.ReactNode }) {
```

**Step 7: Reset manual flags when modal opens for new employee**

In the `key`-based remount approach the flags reset automatically (new component instance). No extra work needed.

**Step 8: Verify in browser**
- Open Add Employee → Compensation tab → type a number in Annual Fixed → Variable Pay and Annual CTC should auto-fill
- Manually change CTC → (auto) badge disappears, value stays as typed
- Open Edit Employee → prefilled values should show, no auto-overwrite

---

## Task 2: Build the Employee Profile Page

**Files:**
- Modify: `frontend/src/pages/EmployeeProfilePage.tsx` (full rewrite)

**Context:** Route is `/employees/:id`. `employeeService.getById(id)` returns `{ data: Employee }` where Employee includes `performanceRatings`, `benefits`, `rsuGrants`, `skills`. queryKey is `queryKeys.employees.detail(id)`.

**Step 1: Add a small reusable Tooltip component at the top of the file**

```typescript
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative group inline-flex items-center">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[220px] rounded-lg bg-popover border border-border text-popover-foreground text-xs px-2.5 py-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 text-center whitespace-pre-wrap">
        {text}
      </span>
    </span>
  );
}
```

**Step 2: Write the full EmployeeProfilePage component**

Full file content for `frontend/src/pages/EmployeeProfilePage.tsx`:

```typescript
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, User, Briefcase, DollarSign, TrendingUp, Gift,
  Info, MapPin, Calendar, Mail, Phone, Building2, Award
} from 'lucide-react';
import { employeeService } from '../services/employee.service';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import { cn, formatINR, getInitials, getBandColor } from '../lib/utils';

// ─── Tooltip ──────────────────────────────────────────────────
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative group inline-flex items-center">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[220px] rounded-lg bg-popover border border-border text-popover-foreground text-xs px-2.5 py-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 text-center">
        {text}
      </span>
    </span>
  );
}

// ─── Small helpers ─────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium text-foreground">{value || '—'}</p>
    </div>
  );
}

type Tab = 'identity' | 'compensation' | 'performance' | 'benefits';

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('identity');

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.employees.detail(id!),
    queryFn: () => employeeService.getById(id!),
    enabled: !!id,
    staleTime: STALE_TIMES.SHORT,
  });

  const emp = data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !emp) {
    return (
      <div className="text-center py-16 text-muted-foreground">Employee not found.</div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'identity', label: 'Identity', icon: User },
    { id: 'compensation', label: 'Compensation', icon: DollarSign },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
    { id: 'benefits', label: 'Benefits & RSU', icon: Gift },
  ];

  const salaryHistory = [
    { label: 'Apr 2023', value: emp.april2023 },
    { label: 'Jul 2023', value: emp.july2023 },
    { label: 'Apr 2024', value: emp.april2024 },
    { label: 'Jul 2024', value: emp.july2024 },
  ].filter(h => h.value);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Back */}
      <button
        onClick={() => navigate('/employees')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Employees
      </button>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-6 flex items-center gap-5">
        <div className={cn(
          'w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0',
          getBandColor(emp.band)
        )}>
          {getInitials(emp.firstName, emp.lastName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{emp.firstName} {emp.lastName}</h1>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', getBandColor(emp.band), 'text-white')}>
              {emp.band}
            </span>
            <span className={cn(
              'px-2 py-0.5 rounded-full text-xs font-medium',
              emp.employmentStatus === 'ACTIVE'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            )}>
              {emp.employmentStatus}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{emp.designation} · {emp.department}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{emp.employeeId}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-0">
        {tabs.map(({ id: tid, label, icon: Icon }) => (
          <button
            key={tid}
            onClick={() => setTab(tid)}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
              tab === tid
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ─── Tab: Identity ─── */}
      {tab === 'identity' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Personal Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
              <DetailRow label="Email" value={emp.email} />
              <DetailRow label="Gender" value={emp.gender?.replace('_', ' ')} />
              <DetailRow label="Date of Joining" value={emp.dateOfJoining ? new Date(emp.dateOfJoining).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null} />
              <DetailRow label="Employment Type" value={emp.employmentType?.replace('_', ' ')} />
              <DetailRow label="Work Mode" value={emp.workMode} />
              <DetailRow label="Work Location" value={emp.workLocation} />
              <DetailRow label="Cost Center" value={emp.costCenter} />
              <DetailRow label="Grade" value={emp.grade} />
              <DetailRow label="Reporting Manager" value={emp.reportingManager ? `${emp.reportingManager.firstName} ${emp.reportingManager.lastName}` : null} />
            </div>
          </div>

          {emp.skills && emp.skills.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {emp.skills.map(s => (
                  <span key={s.skillId} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {s.skill?.name ?? s.skillId}
                    {s.proficiencyLevel && <span className="ml-1 opacity-60">· {s.proficiencyLevel}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Compensation ─── */}
      {tab === 'compensation' && (
        <div className="space-y-5">
          {/* Top stat cards */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Annual Fixed" value={formatINR(emp.annualFixed)} sub="Base salary" />
            <StatCard label="Variable Pay" value={formatINR(emp.variablePay)} sub={`${emp.annualFixed > 0 ? ((emp.variablePay / emp.annualFixed) * 100).toFixed(1) : 0}% of fixed`} />
            <StatCard label="Annual CTC" value={formatINR(emp.annualCtc)} sub="Cost to company" />
          </div>

          {/* Derived metrics */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Derived Metrics</h3>
            <div className="grid grid-cols-3 gap-5">
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  Compa-Ratio
                  <Tooltip text={"(Annual Fixed ÷ Band Midpoint) × 100\n\nShows how your salary compares to the midpoint of your band."}>
                    <Info className="w-3 h-3 text-muted-foreground/60 cursor-help" />
                  </Tooltip>
                </p>
                <p className={cn(
                  'text-2xl font-bold',
                  !emp.compaRatio ? 'text-muted-foreground' :
                  emp.compaRatio < 80 ? 'text-red-500' :
                  emp.compaRatio > 120 ? 'text-orange-500' : 'text-green-500'
                )}>
                  {emp.compaRatio != null ? `${Number(emp.compaRatio).toFixed(1)}%` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  Pay Range Penetration
                  <Tooltip text={"((Annual Fixed − Band Min) ÷ (Band Max − Band Min)) × 100\n\nShows position within the salary band range."}>
                    <Info className="w-3 h-3 text-muted-foreground/60 cursor-help" />
                  </Tooltip>
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {emp.payRangePenetration != null ? `${Number(emp.payRangePenetration).toFixed(1)}%` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  Time in Grade
                  <Tooltip text={"Months elapsed since Date of Joining.\n\nUsed to assess grade progression readiness."}>
                    <Info className="w-3 h-3 text-muted-foreground/60 cursor-help" />
                  </Tooltip>
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {emp.timeInCurrentGrade != null ? `${emp.timeInCurrentGrade}m` : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Salary breakdown */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Salary Breakdown</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left pb-2 font-medium">Component</th>
                  <th className="text-right pb-2 font-medium">Annual</th>
                  <th className="text-right pb-2 font-medium">Monthly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { label: 'Basic', annual: emp.basicAnnual, monthly: emp.basicMonthly },
                  { label: 'HRA', annual: emp.hra, monthly: emp.hraMonthly },
                  { label: 'LTA', annual: emp.lta, monthly: emp.ltaMonthly },
                  { label: 'PF (Employee)', annual: emp.pfYearly, monthly: emp.pfMonthly },
                  { label: 'Special Allowance', annual: emp.specialAllowance, monthly: emp.monthlySpecialAllowance },
                ].map(row => (
                  <tr key={row.label}>
                    <td className="py-2 text-muted-foreground">{row.label}</td>
                    <td className="py-2 text-right font-medium">{formatINR(row.annual)}</td>
                    <td className="py-2 text-right text-muted-foreground">{formatINR(row.monthly)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2">Gross Monthly</td>
                  <td className="py-2 text-right">{formatINR(emp.annualFixed)}</td>
                  <td className="py-2 text-right">{formatINR(emp.monthlyGrossSalary)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Salary history */}
          {salaryHistory.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Salary History</h3>
              <div className="flex items-end gap-6">
                {salaryHistory.map((h, i) => (
                  <div key={h.label} className="flex flex-col items-center gap-1">
                    <span className="text-xs font-semibold text-foreground">{formatINR(h.value!)}</span>
                    <div className="w-1.5 rounded-full bg-primary/60" style={{ height: `${Math.max(20, (Number(h.value) / Math.max(...salaryHistory.map(x => Number(x.value)))) * 60)}px` }} />
                    <span className="text-[10px] text-muted-foreground">{h.label}</span>
                    {i < salaryHistory.length - 1 && <span className="text-muted-foreground/40 text-xs">→</span>}
                  </div>
                ))}
              </div>
              {emp.lastIncrementDate && (
                <p className="text-xs text-muted-foreground mt-3">
                  Last increment: {new Date(emp.lastIncrementDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {emp.lastIncrementPercent != null && ` · +${Number(emp.lastIncrementPercent).toFixed(1)}%`}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Performance ─── */}
      {tab === 'performance' && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Performance Ratings</h3>
          {!emp.performanceRatings || emp.performanceRatings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No performance ratings recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left pb-2 font-medium">Cycle</th>
                  <th className="text-left pb-2 font-medium">Rating</th>
                  <th className="text-left pb-2 font-medium">Label</th>
                  <th className="text-right pb-2 font-medium">Reviewer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {emp.performanceRatings.map(r => (
                  <tr key={r.id}>
                    <td className="py-2.5 text-muted-foreground">{r.cycle}</td>
                    <td className="py-2.5">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                        r.rating >= 4 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        r.rating >= 3 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      )}>
                        {r.rating.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-2.5 text-foreground">{r.ratingLabel ?? '—'}</td>
                    <td className="py-2.5 text-right text-muted-foreground">{r.reviewerName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── Tab: Benefits & RSU ─── */}
      {tab === 'benefits' && (
        <div className="space-y-5">
          {/* Active Benefits */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Active Benefits</h3>
            {!emp.benefits || emp.benefits.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active benefits enrolled.</p>
            ) : (
              <div className="divide-y divide-border">
                {emp.benefits.map(b => (
                  <div key={b.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{b.benefit?.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{b.benefit?.category ?? ''} · Enrolled {b.enrollmentDate ? new Date(b.enrollmentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                    </div>
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      b.status === 'ACTIVE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'
                    )}>
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RSU Grants */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">RSU Grants</h3>
            {!emp.rsuGrants || emp.rsuGrants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No RSU grants recorded.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left pb-2 font-medium">Grant Date</th>
                    <th className="text-right pb-2 font-medium">Total Units</th>
                    <th className="text-right pb-2 font-medium">Vested</th>
                    <th className="text-right pb-2 font-medium">Grant Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {emp.rsuGrants.map(g => {
                    const vestedUnits = g.vestingEvents?.filter(v => new Date(v.vestingDate) <= new Date()).reduce((s, v) => s + v.unitsVesting, 0) ?? 0;
                    const vestedPct = g.totalUnits > 0 ? (vestedUnits / g.totalUnits * 100).toFixed(0) : '0';
                    return (
                      <tr key={g.id}>
                        <td className="py-2.5 text-muted-foreground">{new Date(g.grantDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="py-2.5 text-right font-medium">{g.totalUnits.toLocaleString()}</td>
                        <td className="py-2.5 text-right">
                          <span className="text-green-600 dark:text-green-400">{vestedPct}%</span>
                        </td>
                        <td className="py-2.5 text-right">{g.grantValue != null ? formatINR(g.grantValue) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Verify the page loads** — navigate to any employee from the list and confirm all four tabs render with real data.

---

## Task 3: Check RsuGrant type has `grantValue` and `vestingEvents`

**Files:**
- Read: `shared/types/index.ts` (RsuGrant interface, ~line 331)

If `RsuGrant` type is missing `grantValue`, add it:
```typescript
grantValue?: number | null;
```
If `vestingEvents` is missing:
```typescript
vestingEvents?: RsuVestingEvent[];
```
And ensure `RsuVestingEvent` has `unitsVesting: number` and `vestingDate: string`.

---

## Task 4: Check PerformanceRating type has needed fields

**Files:**
- Read: `shared/types/index.ts` (PerformanceRating interface, ~line 264)

Ensure `PerformanceRating` has:
```typescript
id: string;
cycle: string;
rating: number;
ratingLabel?: string | null;
reviewerName?: string | null;
```

---

## Task 5: Check EmployeeBenefit type has `benefit` relation and `enrollmentDate`

**Files:**
- Read: `shared/types/index.ts` (EmployeeBenefit interface, ~line 315)

Ensure `EmployeeBenefit` has:
```typescript
id: string;
status: BenefitStatus;
enrollmentDate?: string | null;
benefit?: { name: string; category?: string | null } | null;
```

---

## Task 6: Final verification

- [ ] Open Add Employee → type Annual Fixed → Variable Pay and CTC auto-fill
- [ ] Open Edit Employee → existing values pre-filled, changing Annual Fixed updates auto fields
- [ ] Click any employee row → profile page loads with header
- [ ] Identity tab: personal grid + skills chips
- [ ] Compensation tab: stat cards, derived metrics with tooltips, breakdown table, history bars
- [ ] Performance tab: ratings table (or empty state)
- [ ] Benefits & RSU tab: benefits list + RSU table (or empty states)
- [ ] Hover on Info icons in Compensation tab → tooltip with formula appears
