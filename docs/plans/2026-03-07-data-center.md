# Data Center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a centralized `/data-center` page that consolidates employee and benefits bulk uploads, replaces the per-page `ImportEmployeesModal`, and leaves zero dead code behind.

**Architecture:** New sidebar group "Data Center" with a single page containing two upload cards. Employee upload reuses the existing `/api/import/employees` + `/api/import/template` endpoints unchanged. Benefits upload uses two new endpoints (`POST /api/import/benefits`, `GET /api/import/benefits/template`) backed by a new `benefitsImport.service.ts`. The existing `ImportEmployeesModal` component is deleted entirely; `EmployeeDirectoryPage` loses its import button and modal references.

**Tech Stack:** React + TypeScript, TailwindCSS, lucide-react, Express, Prisma, xlsx (already in backend deps), multer (already in backend deps)

---

## Task 1: Benefits Import Service (backend)

**Files:**
- Create: `backend/src/services/benefitsImport.service.ts`

**Context:** `EmployeeBenefit` has `@@unique([employeeId, benefitId])` so the upsert key is `(employeeId, benefitId)`. `BenefitsCatalog.name` is unique and case-insensitive matched. The service returns `{ imported, updated, errors }` — synchronous (unlike employee import which is async via Socket.io), because benefits files are small.

**Step 1: Create the service file**

```typescript
// backend/src/services/benefitsImport.service.ts
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { BenefitStatus } from '@prisma/client';

const VALID_STATUSES: string[] = ['ACTIVE', 'EXPIRED', 'CLAIMED'];

export interface BenefitsImportResult {
  imported: number;
  updated: number;
  errors: { row: number; message: string }[];
}

export const benefitsImportService = {
  parseFile(buffer: Buffer, mimetype: string): Record<string, string>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
      defval: '',
      raw: false,
    });
    return rows;
  },

  async processImport(rows: Record<string, string>[]): Promise<BenefitsImportResult> {
    const errors: { row: number; message: string }[] = [];

    // Load all catalog items once — keyed by lowercase name for fast lookup
    const catalog = await prisma.benefitsCatalog.findMany({
      select: { id: true, name: true },
    });
    const catalogMap = new Map(catalog.map(c => [c.name.toLowerCase(), c.id]));

    // Load all employees once — keyed by employeeId string
    const employees = await prisma.employee.findMany({
      select: { id: true, employeeId: true },
    });
    const employeeMap = new Map(employees.map(e => [e.employeeId.toLowerCase(), e.id]));

    // Track which (employeeId, benefitId) pairs already exist
    const existing = await prisma.employeeBenefit.findMany({
      select: { employeeId: true, benefitId: true },
    });
    const existingSet = new Set(existing.map(r => `${r.employeeId}::${r.benefitId}`));

    const toCreate: Parameters<typeof prisma.employeeBenefit.create>[0]['data'][] = [];
    const toUpdate: { employeeId: string; benefitId: string; data: object }[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // 1-indexed + header row

      const rawEmpId = (row['Employee ID'] || '').trim();
      const rawBenefitName = (row['Benefit Name'] || '').trim();
      const rawStatus = (row['Status'] || 'ACTIVE').trim().toUpperCase();

      // Required field validation
      if (!rawEmpId) {
        errors.push({ row: rowNum, message: 'Employee ID is required' });
        return;
      }
      if (!rawBenefitName) {
        errors.push({ row: rowNum, message: 'Benefit Name is required' });
        return;
      }
      if (!VALID_STATUSES.includes(rawStatus)) {
        errors.push({ row: rowNum, message: `Invalid Status "${rawStatus}". Must be ACTIVE, EXPIRED, or CLAIMED` });
        return;
      }

      const internalEmpId = employeeMap.get(rawEmpId.toLowerCase());
      if (!internalEmpId) {
        errors.push({ row: rowNum, message: `Employee ID "${rawEmpId}" not found` });
        return;
      }

      const benefitId = catalogMap.get(rawBenefitName.toLowerCase());
      if (!benefitId) {
        errors.push({ row: rowNum, message: `Benefit "${rawBenefitName}" not found in catalog` });
        return;
      }

      // Parse optional fields
      const utilizationPercent = row['Utilization %'] ? parseFloat(row['Utilization %']) : undefined;
      const utilizedValue = row['Utilized Value (₹)'] ? parseFloat(row['Utilized Value (₹)']) : undefined;
      const enrolledAt = row['Enrolled Date'] ? new Date(row['Enrolled Date']) : undefined;
      const expiresAt = row['Expiry Date'] ? new Date(row['Expiry Date']) : undefined;

      const data = {
        status: rawStatus as BenefitStatus,
        ...(utilizationPercent !== undefined && !isNaN(utilizationPercent) && { utilizationPercent }),
        ...(utilizedValue !== undefined && !isNaN(utilizedValue) && { utilizedValue }),
        ...(enrolledAt && !isNaN(enrolledAt.getTime()) && { enrolledAt }),
        ...(expiresAt && !isNaN(expiresAt.getTime()) && { expiresAt }),
      };

      const key = `${internalEmpId}::${benefitId}`;
      if (existingSet.has(key)) {
        toUpdate.push({ employeeId: internalEmpId, benefitId, data });
      } else {
        toCreate.push({ employeeId: internalEmpId, benefitId, ...data });
      }
    });

    // Execute all DB writes in a transaction
    if (toCreate.length > 0 || toUpdate.length > 0) {
      await prisma.$transaction([
        ...toCreate.map(data => prisma.employeeBenefit.create({ data: data as any })),
        ...toUpdate.map(({ employeeId, benefitId, data }) =>
          prisma.employeeBenefit.update({
            where: { employeeId_benefitId: { employeeId, benefitId } },
            data,
          })
        ),
      ]);
    }

    return {
      imported: toCreate.length,
      updated: toUpdate.length,
      errors,
    };
  },

  generateTemplate(): Buffer {
    const headers = [
      'Employee ID',
      'Benefit Name',
      'Status',
      'Utilization %',
      'Utilized Value (₹)',
      'Enrolled Date',
      'Expiry Date',
    ];

    const sampleRows = [
      ['EMP001', 'Comprehensive Medical Insurance', 'ACTIVE', '', '', '2024-04-01', '2025-03-31'],
      ['EMP001', 'RSU Grant', 'ACTIVE', '25', '125000', '2023-07-01', ''],
      ['EMP002', 'Training & Learning Allowance', 'ACTIVE', '60', '12000', '2024-04-01', ''],
      ['EMP002', 'Mental Health on Loop', 'ACTIVE', '', '', '2024-04-01', ''],
    ];

    const wsData = [headers, ...sampleRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = [
      { wch: 14 }, { wch: 36 }, { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Benefits Import');

    // Add a second sheet listing valid benefit names
    const catalogSheet = XLSX.utils.aoa_to_sheet([
      ['Valid Benefit Names (copy exactly into Benefit Name column)'],
      ['Comprehensive Medical Insurance'],
      ['Parental Medical Insurance'],
      ['Mental Health on Loop'],
      ['RSU Grant'],
      ['Training & Learning Allowance'],
      ['Paternity Leave'],
      ['Bereavement Leave'],
      ['Mochaccino Award'],
      ['TuxedoMocha Award'],
      ['Annual Company Offsite'],
    ]);
    XLSX.utils.book_append_sheet(wb, catalogSheet, 'Valid Benefit Names');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  },
};
```

**Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors from `benefitsImport.service.ts`

**Step 3: Commit**

```bash
git add backend/src/services/benefitsImport.service.ts
git commit -m "feat: benefits import service — parse, validate, upsert, template"
```

---

## Task 2: Benefits Import Controller + Route (backend)

**Files:**
- Modify: `backend/src/controllers/import.controller.ts`
- Modify: `backend/src/routes/import.routes.ts`

**Context:** The existing `import.routes.ts` already has multer configured with the correct MIME types. We extend both files rather than creating new ones — keeps the import domain cohesive and avoids unnecessary new files.

**Step 1: Add two methods to `import.controller.ts`**

Open `backend/src/controllers/import.controller.ts`. After the existing `downloadTemplate` method (before the closing `};`), add:

```typescript
  importBenefits: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: { code: 'NO_FILE', message: 'No file uploaded. Please attach a CSV or Excel file.' } });
        return;
      }
      const rows = benefitsImportService.parseFile(req.file.buffer, req.file.mimetype);
      if (rows.length === 0) {
        res.status(400).json({ error: { code: 'EMPTY_FILE', message: 'The uploaded file contains no data rows.' } });
        return;
      }
      if (rows.length > 5000) {
        res.status(400).json({ error: { code: 'TOO_LARGE', message: 'File exceeds 5000 rows. Please split into smaller files.' } });
        return;
      }
      const result = await benefitsImportService.processImport(rows);
      res.status(200).json({ data: result });
    } catch (e) {
      next(e);
    }
  },

  downloadBenefitsTemplate: (_req: Request, res: Response, next: NextFunction) => {
    try {
      const buffer = benefitsImportService.generateTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="benefits_import_template.xlsx"');
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  },
```

Also add this import at the top of the file:

```typescript
import { benefitsImportService } from '../services/benefitsImport.service';
```

**Step 2: Add two routes to `import.routes.ts`**

After the existing two `router.*` lines, add:

```typescript
router.post('/benefits', upload.single('file'), importController.importBenefits);
router.get('/benefits/template', importController.downloadBenefitsTemplate);
```

**Step 3: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

**Step 4: Commit**

```bash
git add backend/src/controllers/import.controller.ts backend/src/routes/import.routes.ts
git commit -m "feat: POST /api/import/benefits and GET /api/import/benefits/template endpoints"
```

---

## Task 3: DataCenterPage (frontend)

**Files:**
- Create: `frontend/src/pages/DataCenterPage.tsx`

**Context:** Two upload cards. Employee card → existing endpoints (no change). Benefits card → new endpoints. Both cards: drag-drop zone + file picker, replace/upsert mode toggle (employee only — benefits is always upsert), progress state, success summary, and error list. The `api` instance from `lib/api.ts` handles auth headers automatically.

**Step 1: Create the page**

```tsx
// frontend/src/pages/DataCenterPage.tsx
import { useState, useRef } from 'react';
import { Upload, Download, Users, Gift, CheckCircle2, XCircle, Loader2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface UploadResult {
  imported?: number;
  updated?: number;
  errors?: { row: number; message: string }[];
  // employee import returns a message (async)
  message?: string;
  total?: number;
}

interface UploadCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  templateLabel: string;
  templateHref: string;
  uploadEndpoint: string;
  acceptModes?: boolean; // show replace/upsert toggle (employee only)
  onUploadComplete?: () => void;
}

function UploadCard({
  title,
  description,
  icon: Icon,
  templateLabel,
  templateHref,
  uploadEndpoint,
  acceptModes = false,
}: UploadCardProps) {
  const [mode, setMode] = useState<'upsert' | 'replace'>('upsert');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get(templateHref, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      // filename from content-disposition or fallback
      const cd = res.headers['content-disposition'] || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : 'template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download template');
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const url = acceptModes ? `${uploadEndpoint}?mode=${mode}` : uploadEndpoint;
      const res = await api.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data: UploadResult = res.data?.data ?? res.data;
      setResult(data);
      if (data.message) {
        toast.success('Upload queued', { description: data.message });
      } else {
        const { imported = 0, updated = 0, errors = [] } = data;
        if (errors.length === 0) {
          toast.success(`Upload complete — ${imported} added, ${updated} updated`);
        } else {
          toast.warning(`Upload done with ${errors.length} error${errors.length !== 1 ? 's' : ''}`);
        }
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
      toast.error('Only CSV and Excel files are accepted');
      return;
    }
    upload(file);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      {/* Mode toggle — employee only */}
      {acceptModes && (
        <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 w-fit">
          {(['upsert', 'replace'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-all',
                mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m === 'upsert' ? 'Add / Update' : 'Replace All'}
            </button>
          ))}
        </div>
      )}
      {acceptModes && mode === 'replace' && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 -mt-2">
          Replace mode will delete ALL existing employee records before importing.
        </p>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all',
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30',
          uploading && 'pointer-events-none opacity-60'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={e => handleFile(e.target.files?.[0])}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Uploading…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Drop your file here or click to browse</p>
            <p className="text-xs text-muted-foreground">Supports .csv, .xlsx, .xls — max 10 MB</p>
          </div>
        )}
      </div>

      {/* Result summary */}
      {result && !result.message && (
        <div className="space-y-2">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              {result.imported ?? 0} added
            </span>
            <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="w-4 h-4" />
              {result.updated ?? 0} updated
            </span>
            {(result.errors?.length ?? 0) > 0 && (
              <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <XCircle className="w-4 h-4" />
                {result.errors!.length} error{result.errors!.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1.5">Row errors:</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-400">
                  Row {e.row}: {e.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Async result (employee import) */}
      {result?.message && (
        <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          {result.message}
        </p>
      )}

      {/* Template download */}
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <p className="text-xs text-muted-foreground">Need the template?</p>
        <button
          onClick={handleDownloadTemplate}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          {templateLabel}
        </button>
      </div>
    </div>
  );
}

export default function DataCenterPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Data Center</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload employee and benefits data from Excel or CSV files
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <strong>Note:</strong> Uploading benefits data will replace existing benefit records for the employees in the file.
          Employee upload in "Replace All" mode will delete all existing employee records first.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <UploadCard
          title="Employee Data"
          description="Upload employee records in Zoho Compensation Details format (.csv or .xlsx). Supports up to 1,000 rows per upload."
          icon={Users}
          templateLabel="Download Employee Template"
          templateHref="/api/import/template"
          uploadEndpoint="/api/import/employees"
          acceptModes
        />
        <UploadCard
          title="Benefits & RSU Data"
          description="Upload employee benefit enrollments and RSU utilization data. Matches employees by Employee ID and benefits by name."
          icon={Gift}
          templateLabel="Download Benefits Template"
          templateHref="/api/import/benefits/template"
          uploadEndpoint="/api/import/benefits"
        />
      </div>

      {/* Reference card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Valid Benefit Names</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          The Benefit Name column in your file must match one of these exactly (case-insensitive):
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            'Comprehensive Medical Insurance',
            'Parental Medical Insurance',
            'Mental Health on Loop',
            'RSU Grant',
            'Training & Learning Allowance',
            'Paternity Leave',
            'Bereavement Leave',
            'Mochaccino Award',
            'TuxedoMocha Award',
            'Annual Company Offsite',
          ].map(name => (
            <span key={name} className="px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground font-mono">
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify no TypeScript errors in the new file**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors from `DataCenterPage.tsx`

**Step 3: Commit**

```bash
git add frontend/src/pages/DataCenterPage.tsx
git commit -m "feat: DataCenterPage — employee and benefits upload cards"
```

---

## Task 4: Sidebar + App Router

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Add Database icon import to Sidebar.tsx**

In `Sidebar.tsx`, find the lucide-react import line (line 3). Add `Database` to the import:

```typescript
import {
  LayoutDashboard, Users, BarChart3, Scale, Sparkles, Gift,
  TrendingUp, Award, Zap, FlaskConical, Bell, Settings,
  ChevronDown, DollarSign, Layers, Building2, Mail, Database,
} from 'lucide-react';
```

**Step 2: Add the "Data Center" group to NAV_GROUPS**

In `Sidebar.tsx`, find the `NAV_GROUPS` array. Insert the new group between `people` and `benefits` (after the `people` object closes, before the `benefits` object):

```typescript
  {
    id: 'data',
    label: 'Data Center',
    icon: Database,
    items: [
      { path: '/data-center', label: 'Data Center', icon: Database },
    ],
  },
```

**Step 3: Add lazy import and route to App.tsx**

In `App.tsx`, add the lazy import after the existing lazy imports (e.g., after `SentMailsPage`):

```typescript
const DataCenterPage = lazy(() => import('./pages/DataCenterPage'));
```

Inside the `<Routes>` block, add the route after `sent-mails`:

```tsx
<Route path="data-center" element={<DataCenterPage />} />
```

**Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

**Step 5: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx frontend/src/App.tsx
git commit -m "feat: Data Center sidebar group and /data-center route"
```

---

## Task 5: Remove ImportEmployeesModal (cleanup)

**Files:**
- Modify: `frontend/src/pages/EmployeeDirectoryPage.tsx`
- Delete: `frontend/src/components/employees/ImportEmployeesModal.tsx`

**Context:** This is a destructive cleanup step. Read the files carefully before editing to avoid removing unrelated code.

**Step 1: Read EmployeeDirectoryPage to find all import-modal references**

```bash
grep -n "ImportEmployees\|importModal\|showImport\|import.*modal\|Import.*Employee" \
  frontend/src/pages/EmployeeDirectoryPage.tsx
```

Note down every line number that references the modal.

**Step 2: Confirm ImportEmployeesModal is used only in EmployeeDirectoryPage**

```bash
grep -r "ImportEmployeesModal" frontend/src --include="*.tsx" --include="*.ts"
```

Expected: only one result — `EmployeeDirectoryPage.tsx`. If any other file is listed, investigate before continuing.

**Step 3: Edit EmployeeDirectoryPage.tsx — remove modal import**

Remove the import line:
```typescript
import { ImportEmployeesModal } from '../components/employees/ImportEmployeesModal';
```

**Step 4: Remove modal state and Import button**

Remove the state variable used to control modal visibility (e.g., `const [showImport, setShowImport] = useState(false)` or similar).

Remove the Import button JSX (the `<button>` element that triggers `setShowImport(true)` or equivalent).

Remove the `<ImportEmployeesModal ... />` JSX element.

**Step 5: Delete the component file**

```bash
rm frontend/src/components/employees/ImportEmployeesModal.tsx
```

**Step 6: Verify no broken imports**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: zero errors. If there are errors, they must all be in `EmployeeDirectoryPage.tsx` pointing to removed identifiers — fix them before continuing.

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove ImportEmployeesModal — uploads moved to Data Center"
```

---

## Task 6: Generate Test Data Files

**Files:**
- Create: `docs/test-data/` (directory)
- Create: `docs/test-data/generate-test-data.mjs` (one-time script, run manually)

**Context:** These test files are used to verify the upload flows end-to-end. They do not get imported into the app bundle.

**Step 1: Create the test-data directory and generator script**

```javascript
// docs/test-data/generate-test-data.mjs
// Run with: node docs/test-data/generate-test-data.mjs
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Employee test file ────────────────────────────────────────
const empHeaders = [
  'Employee ID','First Name','Last Name','Email address','Department','Designation',
  'Date of Joining','Employment Type','Employment Status','Gender',
  'Annual Fixed','Variable Pay','Annual CTC','Band','Grade',
];

const empRows = [
  ['TEST001','Priya','Sharma','priya.sharma@test.com','Engineering','Software Engineer','2022-06-01','Full Time','Active','Female','1200000','120000','1320000','P2','P2A'],
  ['TEST002','Rohan','Mehta','rohan.mehta@test.com','Sales','Sales Executive','2023-01-15','Full Time','Active','Male','900000','180000','1080000','P1','P1A'],
  ['TEST003','Anita','Desai','anita.desai@test.com','HR','HR Specialist','2021-09-01','Full Time','Active','Female','1000000','80000','1080000','P2','P2B'],
  ['TEST004','Kiran','Rao','kiran.rao@test.com','Engineering','Senior Engineer','2020-03-01','Full Time','Active','Male','1800000','180000','1980000','P3','P3A'],
  ['TEST005','Meera','Iyer','meera.iyer@test.com','Engineering','Engineering Manager','2019-07-01','Full Time','Active','Female','2800000','280000','3080000','M1','M1A'],
];

const empWs = XLSX.utils.aoa_to_sheet([empHeaders, ...empRows]);
empWs['!cols'] = empHeaders.map(() => ({ wch: 20 }));
const empWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(empWb, empWs, 'Employees');
XLSX.writeFile(empWb, path.join(__dirname, 'test-employees.xlsx'));
console.log('Created test-employees.xlsx');

// ─── Benefits test file ────────────────────────────────────────
const benHeaders = [
  'Employee ID','Benefit Name','Status','Utilization %','Utilized Value (₹)','Enrolled Date','Expiry Date',
];

const benRows = [
  ['TEST001','Comprehensive Medical Insurance','ACTIVE','','','2022-06-01','2025-03-31'],
  ['TEST001','RSU Grant','ACTIVE','25','75000','2022-06-01',''],
  ['TEST001','Training & Learning Allowance','ACTIVE','40','8000','2024-04-01',''],
  ['TEST002','Comprehensive Medical Insurance','ACTIVE','','','2023-01-15','2025-03-31'],
  ['TEST002','Mental Health on Loop','ACTIVE','','','2023-01-15',''],
  ['TEST003','Comprehensive Medical Insurance','ACTIVE','','','2021-09-01','2025-03-31'],
  ['TEST003','Paternity Leave','CLAIMED','100','','2024-02-01','2024-02-15'],
  ['TEST004','RSU Grant','ACTIVE','50','250000','2020-03-01',''],
  ['TEST004','Comprehensive Medical Insurance','ACTIVE','','','2020-03-01','2025-03-31'],
  ['TEST005','RSU Grant','ACTIVE','75','630000','2019-07-01',''],
  ['TEST005','Annual Company Offsite','ACTIVE','','','2024-01-01','2024-12-31'],
];

const benWs = XLSX.utils.aoa_to_sheet([benHeaders, ...benRows]);
benWs['!cols'] = benHeaders.map(() => ({ wch: 20 }));
const benWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(benWb, benWs, 'Benefits');
XLSX.writeFile(benWb, path.join(__dirname, 'test-benefits.xlsx'));
console.log('Created test-benefits.xlsx');
```

**Step 2: Run the generator**

```bash
cd /Users/aryan/Desktop/hr-app/talent-hub-prod
node docs/test-data/generate-test-data.mjs
```

Expected output:
```
Created test-employees.xlsx
Created test-benefits.xlsx
```

**Step 3: Commit**

```bash
git add docs/test-data/
git commit -m "chore: add test data generator and sample xlsx files for Data Center"
```

---

## Task 7: End-to-End Verification

**Step 1: TypeScript check — backend**

```bash
cd backend && npx tsc --noEmit
```

Expected: zero errors

**Step 2: TypeScript check — frontend**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors

**Step 3: Confirm no leftover ImportEmployeesModal references**

```bash
grep -r "ImportEmployeesModal" . --include="*.tsx" --include="*.ts" --exclude-dir=node_modules
```

Expected: zero results

**Step 4: Start backend and frontend**

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

**Step 5: Manual test — employee upload**

1. Navigate to `http://localhost:5173/data-center`
2. Click "Download Employee Template" on the Employee card → file downloads as `employee_import_template.csv`
3. Drag `docs/test-data/test-employees.xlsx` into the Employee card drop zone
4. Verify toast shows "Upload queued" with row count
5. Navigate to `/employees` — verify TEST001–TEST005 appear (or were upserted)

**Step 6: Manual test — benefits upload**

1. Navigate to `/data-center`
2. Click "Download Benefits Template" on the Benefits card → downloads as `benefits_import_template.xlsx`, opens in Excel, has 2 sheets
3. Drag `docs/test-data/test-benefits.xlsx` into the Benefits card drop zone
4. Verify toast shows success with "N added, N updated"
5. Navigate to `/benefits` → Benefits & RSU tab → search TEST001 → verify their benefits appear

**Step 7: Manual test — error handling**

1. Open `test-benefits.xlsx`, change one "Benefit Name" to "InvalidBenefit", save as `test-bad.xlsx`
2. Upload `test-bad.xlsx` via the Benefits card
3. Verify the UI shows an error list with "Row X: Benefit 'InvalidBenefit' not found in catalog"
4. Verify the valid rows still processed (imported > 0)

**Step 8: Verify existing pages unaffected**

1. Navigate to `/employees` — confirm no Import button visible, no broken UI
2. Navigate to `/benefits` — RSU tab loads, data displays correctly
3. Navigate to `/dashboard` — KPIs load without errors
4. Open AI chat, ask "show me benefits for TEST001" — confirm tool returns new data

**Step 9: Final commit**

```bash
git add -A
git commit -m "feat: Data Center — centralized upload hub replacing ImportEmployeesModal"
```

---

## Risk Checklist (verify all before marking complete)

- [ ] `ImportEmployeesModal.tsx` file deleted
- [ ] No TypeScript errors in backend or frontend (`tsc --noEmit`)
- [ ] No grep results for `ImportEmployeesModal` in codebase
- [ ] `/employees` page loads without errors, no broken import button
- [ ] `/benefits` Benefits & RSU tab displays correctly after benefits upload
- [ ] `/dashboard` KPIs unaffected
- [ ] AI chat `get_benefits` tool returns updated data
- [ ] Socket.io `EMPLOYEE_DATA_CHANGED` event still emitted after employee upload (check browser network tab for socket event)
- [ ] Both template downloads work and produce valid files
- [ ] Error rows in benefits upload are reported per-row without aborting valid rows
