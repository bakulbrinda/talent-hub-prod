import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X, Upload, Download, FileSpreadsheet, CheckCircle2,
  AlertCircle, Loader2, Users, Sparkles, Trash2
} from 'lucide-react';
import { employeeService } from '../../services/employee.service';
import { queryKeys } from '../../lib/queryClient';
import { getSocket } from '../../lib/socket';
import { cn } from '../../lib/utils';

interface ImportProgress {
  processed: number;
  total: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

interface ImportComplete {
  imported: number;
  failed: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

type Stage = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ImportEmployeesModal({ open, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportComplete | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Socket listeners for real-time progress
  useEffect(() => {
    if (!open) return;
    const socket = getSocket();
    if (!socket) return;

    const handleProgress = (data: ImportProgress) => {
      setProgress(data);
      if (stage !== 'processing') setStage('processing');
    };

    const handleComplete = (data: ImportComplete) => {
      setResult(data);
      setStage('done');
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.kpis });
      if (data.imported > 0) {
        toast.success(`Import complete: ${data.imported} employees added/updated`);
      }
    };

    socket.on('import:progress', handleProgress);
    socket.on('import:complete', handleComplete);

    return () => {
      socket.off('import:progress', handleProgress);
      socket.off('import:complete', handleComplete);
    };
  }, [open, stage, queryClient]);

  const handleFile = useCallback((file: File) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'];
    const isAllowed = allowed.includes(file.type) || /\.(csv|xlsx|xls)$/i.test(file.name);

    if (!isAllowed) {
      toast.error('Only CSV and Excel files (.csv, .xlsx, .xls) are accepted');
      return;
    }
    setSelectedFile(file);
    setStage('idle');
    setResult(null);
    setProgress(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setStage('uploading');
    setProgress(null);
    setResult(null);

    try {
      await employeeService.importFromFile(selectedFile, replaceMode ? 'replace' : 'upsert');
      setStage('processing');
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Upload failed';
      toast.error(msg);
      setStage('error');
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      await employeeService.downloadTemplate();
      toast.success('Template downloaded');
    } catch {
      toast.error('Failed to download template');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const reset = () => {
    setStage('idle');
    setSelectedFile(null);
    setProgress(null);
    setResult(null);
    setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!open) return null;

  const progressPct = progress ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-background rounded-2xl shadow-2xl border border-border overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Import Employees</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Upload CSV or Excel file to bulk import employees</p>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg hover:bg-accent transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Template Download */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-dashed border-border bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Download Template</p>
                <p className="text-xs text-muted-foreground">18-column CSV with example data and all required fields</p>
              </div>
            </div>
            <button
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm hover:bg-accent transition-colors disabled:opacity-60"
            >
              {downloadingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloadingTemplate ? 'Downloading...' : 'Download'}
            </button>
          </div>

          {/* Replace Mode Toggle */}
          {(stage === 'idle' || stage === 'error') && (
            <div
              onClick={() => setReplaceMode(!replaceMode)}
              className={cn(
                'flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all select-none',
                replaceMode
                  ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20'
                  : 'border-border bg-muted/20 hover:bg-muted/40'
              )}
            >
              <div className={cn(
                'w-10 h-6 rounded-full transition-colors relative flex-shrink-0',
                replaceMode ? 'bg-orange-500' : 'bg-muted-foreground/30'
              )}>
                <div className={cn(
                  'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
                  replaceMode ? 'left-4.5' : 'left-0.5'
                )} style={{ left: replaceMode ? '18px' : '2px' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium', replaceMode ? 'text-orange-700 dark:text-orange-400' : 'text-foreground')}>
                  <Trash2 className="inline w-3.5 h-3.5 mr-1 mb-0.5" />
                  Replace all existing employee data
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {replaceMode
                    ? 'All existing employees will be deleted first — your Excel becomes the single source of truth'
                    : 'Off: new rows are added/updated, existing data is kept'}
                </p>
              </div>
            </div>
          )}

          {/* AI Regeneration Notice (shown when replace mode is on) */}
          {replaceMode && (stage === 'idle' || stage === 'error') && (
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-purple-700 dark:text-purple-300">
                After import, all AI insights (pay equity, attrition risk, salary growth, etc.) will automatically regenerate from your real data using Claude AI.
              </p>
            </div>
          )}

          {/* Drop Zone */}
          {(stage === 'idle' || stage === 'error') && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'relative flex flex-col items-center justify-center gap-3 p-10 rounded-xl border-2 border-dashed cursor-pointer transition-all',
                dragOver
                  ? 'border-primary bg-primary/5 scale-[1.01]'
                  : selectedFile
                  ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {selectedFile ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground text-sm">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{(selectedFile.size / 1024).toFixed(1)} KB — Click to change</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Upload className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground text-sm">Drop your file here or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Supports CSV (.csv) and Excel (.xlsx, .xls) up to 10MB / 1000 rows</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Progress */}
          {(stage === 'uploading' || stage === 'processing') && (
            <div className="space-y-3 p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {stage === 'uploading' ? 'Uploading file...' : `Processing employees... ${progress?.processed ?? 0} / ${progress?.total ?? '?'}`}
                  </p>
                  <p className="text-xs text-muted-foreground">Real-time updates via Socket.io</p>
                </div>
                {progress && <span className="text-sm font-bold text-primary">{progressPct}%</span>}
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-300"
                  style={{ width: stage === 'uploading' ? '15%' : `${progressPct}%` }}
                />
              </div>
              {progress && progress.errors.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {progress.errors.length} row(s) have issues — they will be skipped
                </p>
              )}
            </div>
          )}

          {/* Result */}
          {stage === 'done' && result && (
            <div className="space-y-3">
              {result.imported > 0 && (
                <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                  <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-purple-700 dark:text-purple-300">
                    <span className="font-semibold">AI insights are regenerating</span> from your real data.
                    Visit the AI Insights page in ~30 seconds to see Claude's analysis.
                  </p>
                </div>
              )}
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <div>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">{result.imported}</p>
                    <p className="text-xs text-green-600 dark:text-green-500">Employees imported</p>
                  </div>
                </div>
                <div className={cn(
                  'flex items-center gap-3 p-4 rounded-xl border',
                  result.failed > 0
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : 'bg-muted/30 border-border'
                )}>
                  <AlertCircle className={cn('w-8 h-8 flex-shrink-0', result.failed > 0 ? 'text-red-500' : 'text-muted-foreground/30')} />
                  <div>
                    <p className={cn('text-2xl font-bold', result.failed > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>{result.failed}</p>
                    <p className={cn('text-xs', result.failed > 0 ? 'text-red-500 dark:text-red-500' : 'text-muted-foreground')}>Rows failed</p>
                  </div>
                </div>
              </div>

              {/* Errors table */}
              {result.errors.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-medium text-foreground">Validation Errors ({result.errors.length})</span>
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/20">
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Row</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Field</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Issue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.slice(0, 30).map((err, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 font-mono text-muted-foreground">#{err.row}</td>
                            <td className="px-3 py-2 font-medium text-foreground">{err.field}</td>
                            <td className="px-3 py-2 text-red-600 dark:text-red-400">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Required columns info */}
          {stage === 'idle' && !selectedFile && (
            <div className="p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Required columns:</p>
              <p>employeeId, firstName, lastName, email, department, designation, dateOfJoining (YYYY-MM-DD), gender (MALE/FEMALE/NON_BINARY), band (A1/A2/P1/P2/P3/P4), grade, annualFixed</p>
              <p className="text-muted-foreground/70">Optional: variablePay, annualCtc, workMode, workLocation, employmentType, reportingManagerEmail, costCenter</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Max 1000 rows per import
          </div>
          <div className="flex gap-3">
            {stage === 'done' ? (
              <>
                <button onClick={reset} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors">
                  Import More
                </button>
                <button onClick={handleClose} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity">
                  Done
                </button>
              </>
            ) : (
              <>
                <button onClick={handleClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || stage === 'uploading' || stage === 'processing'}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {(stage === 'uploading' || stage === 'processing') && <Loader2 className="w-4 h-4 animate-spin" />}
                  {stage === 'uploading' || stage === 'processing' ? 'Importing...' : 'Import Employees'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
