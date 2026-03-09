import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  onUploadComplete,
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
      onUploadComplete?.();
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
  const queryClient = useQueryClient();
  const { data: catalogRaw } = useQuery({
    queryKey: ['benefits', 'catalog'],
    queryFn: () => api.get('/benefits/catalog').then(r => r.data?.data ?? []),
    staleTime: 10 * 60 * 1000,
  });
  const benefitNames: string[] = Array.isArray(catalogRaw)
    ? catalogRaw.map((b: any) => b.name as string)
    : [];

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
          templateHref="/import/template"
          uploadEndpoint="/import/employees"
          acceptModes
        />
        <UploadCard
          title="Benefits & RSU Data"
          description="Upload employee benefit enrollments and RSU utilization data. Matches employees by Employee ID and benefits by name."
          icon={Gift}
          templateLabel="Download Benefits Template"
          templateHref="/import/benefits/template"
          uploadEndpoint="/import/benefits"
          onUploadComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['benefits'] });
          }}
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
          {benefitNames.length > 0
            ? benefitNames.map(name => (
                <span key={name} className="px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground font-mono">
                  {name}
                </span>
              ))
            : <span className="text-xs text-muted-foreground italic">Loading…</span>
          }
        </div>
      </div>
    </div>
  );
}
