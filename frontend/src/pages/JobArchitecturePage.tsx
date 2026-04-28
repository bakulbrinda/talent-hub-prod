import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layers, ChevronRight, ChevronDown, Building2,
  Briefcase, Tag, Star, Search, Pencil, Plus,
  Trash2, X, Check, Loader2, CheckCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { jobArchitectureService } from '../services/jobArchitecture.service';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const BAND_COLORS: Record<string, string> = {
  A1: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  A2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  P1: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  P2: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  P3: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  M1: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  M2: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  D0: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  D1: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  D2: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  P4: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
};

const AREA_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
];

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function BandPill({ code, label, isRSU }: { code: string; label: string; isRSU: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', BAND_COLORS[code] || 'bg-muted text-muted-foreground')}>
      {code}
      {isRSU && <Star className="w-2.5 h-2.5 fill-current" />}
    </span>
  );
}

// ─── Generic inline modal ─────────────────────────────────────────────────────

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground text-base">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted/60 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn('w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary', className)}
    />
  );
}

function SaveBtn({ loading, disabled, onClick, label = 'Save' }: {
  loading: boolean; disabled?: boolean; onClick: () => void; label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
    >
      Cancel
    </button>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ label, onConfirm, onCancel, loading }: {
  label: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <Modal title={`Delete ${label}?`} onClose={onCancel}>
      <p className="text-sm text-muted-foreground">
        This will permanently delete <strong className="text-foreground">{label}</strong> and all its contents.
        This action cannot be undone.
      </p>
      <div className="flex gap-2 justify-end pt-2">
        <CancelBtn onClick={onCancel} />
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50 hover:bg-destructive/90 transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Delete
        </button>
      </div>
    </Modal>
  );
}

// ─── Area Modal ───────────────────────────────────────────────────────────────

function AreaModal({ area, onClose, onSaved }: {
  area?: any; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(area?.name ?? '');
  const [description, setDescription] = useState(area?.description ?? '');

  const create = useMutation({
    mutationFn: () => jobArchitectureService.createJobArea({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: () => { toast.success('Job area created'); onSaved(); },
    onError: () => toast.error('Failed to create job area'),
  });

  const update = useMutation({
    mutationFn: () => jobArchitectureService.updateJobArea(area.id, { name: name.trim(), description: description.trim() || undefined }),
    onSuccess: () => { toast.success('Job area updated'); onSaved(); },
    onError: () => toast.error('Failed to update job area'),
  });

  const loading = create.isPending || update.isPending;

  return (
    <Modal title={area ? 'Edit Job Area' : 'Add Job Area'} onClose={onClose}>
      <Field label="Name">
        <Input value={name} onChange={setName} placeholder="e.g. Engineering" />
      </Field>
      <Field label="Description">
        <Input value={description} onChange={setDescription} placeholder="Optional description" />
      </Field>
      <div className="flex gap-2 justify-end pt-1">
        <CancelBtn onClick={onClose} />
        <SaveBtn
          loading={loading}
          disabled={!name.trim()}
          onClick={() => area ? update.mutate() : create.mutate()}
          label={area ? 'Save Changes' : 'Create Area'}
        />
      </div>
    </Modal>
  );
}

// ─── Family Modal ─────────────────────────────────────────────────────────────

function FamilyModal({ family, jobAreaId, onClose, onSaved }: {
  family?: any; jobAreaId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(family?.name ?? '');

  const create = useMutation({
    mutationFn: () => jobArchitectureService.createJobFamily({ name: name.trim(), jobAreaId: jobAreaId! }),
    onSuccess: () => { toast.success('Job family created'); onSaved(); },
    onError: () => toast.error('Failed to create job family'),
  });

  const update = useMutation({
    mutationFn: () => jobArchitectureService.updateJobFamily(family.id, { name: name.trim() }),
    onSuccess: () => { toast.success('Job family updated'); onSaved(); },
    onError: () => toast.error('Failed to update job family'),
  });

  const loading = create.isPending || update.isPending;

  return (
    <Modal title={family ? 'Edit Job Family' : 'Add Job Family'} onClose={onClose}>
      <Field label="Family Name">
        <Input value={name} onChange={setName} placeholder="e.g. Software Engineering" />
      </Field>
      <div className="flex gap-2 justify-end pt-1">
        <CancelBtn onClick={onClose} />
        <SaveBtn
          loading={loading}
          disabled={!name.trim()}
          onClick={() => family ? update.mutate() : create.mutate()}
          label={family ? 'Save Changes' : 'Create Family'}
        />
      </div>
    </Modal>
  );
}

// ─── Job Code Modal ───────────────────────────────────────────────────────────

function JobCodeModal({ jobCode, jobFamilyId, bands, onClose, onSaved }: {
  jobCode?: any; jobFamilyId?: string; bands: any[]; onClose: () => void; onSaved: () => void;
}) {
  const [code, setCode] = useState(jobCode?.code ?? '');
  const [title, setTitle] = useState(jobCode?.title ?? '');
  const [bandId, setBandId] = useState(jobCode?.band?.id ?? bands[0]?.id ?? '');

  const sortedBands = [...bands].sort((a, b) => a.level - b.level);

  const create = useMutation({
    mutationFn: () => jobArchitectureService.createJobCode({
      code: code.trim().toUpperCase(),
      title: title.trim(),
      jobFamilyId: jobFamilyId!,
      bandId,
    }),
    onSuccess: () => { toast.success('Role created'); onSaved(); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to create role'),
  });

  const update = useMutation({
    mutationFn: () => jobArchitectureService.updateJobCode(jobCode.id, {
      code: code.trim().toUpperCase(),
      title: title.trim(),
      bandId,
    }),
    onSuccess: () => { toast.success('Role updated'); onSaved(); },
    onError: () => toast.error('Failed to update role'),
  });

  const loading = create.isPending || update.isPending;

  return (
    <Modal title={jobCode ? 'Edit Role' : 'Add Role'} onClose={onClose}>
      <Field label="Job Code">
        <Input value={code} onChange={setCode} placeholder="e.g. SWE-001" />
      </Field>
      <Field label="Title">
        <Input value={title} onChange={setTitle} placeholder="e.g. Software Engineer" />
      </Field>
      <Field label="Band">
        <select
          value={bandId}
          onChange={e => setBandId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        >
          {sortedBands.map(b => (
            <option key={b.id} value={b.id}>{b.code} — {b.label}</option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2 justify-end pt-1">
        <CancelBtn onClick={onClose} />
        <SaveBtn
          loading={loading}
          disabled={!code.trim() || !title.trim() || !bandId}
          onClick={() => jobCode ? update.mutate() : create.mutate()}
          label={jobCode ? 'Save Changes' : 'Create Role'}
        />
      </div>
    </Modal>
  );
}

// ─── Band Edit Modal ──────────────────────────────────────────────────────────

function BandModal({ band, onClose, onSaved }: {
  band: any; onClose: () => void; onSaved: () => void;
}) {
  const [label, setLabel] = useState(band.label);
  const [isRSU, setIsRSU] = useState(band.isEligibleForRSU);

  const update = useMutation({
    mutationFn: () => jobArchitectureService.updateBand(band.id, { label: label.trim(), isEligibleForRSU: isRSU }),
    onSuccess: () => { toast.success('Band updated'); onSaved(); },
    onError: () => toast.error('Failed to update band'),
  });

  return (
    <Modal title={`Edit Band — ${band.code}`} onClose={onClose}>
      <Field label="Label">
        <Input value={label} onChange={setLabel} placeholder="e.g. Senior Engineer" />
      </Field>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="rsu-eligible"
          checked={isRSU}
          onChange={e => setIsRSU(e.target.checked)}
          className="w-4 h-4 rounded border-input accent-primary"
        />
        <label htmlFor="rsu-eligible" className="text-sm text-foreground select-none cursor-pointer">
          RSU Eligible
        </label>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <CancelBtn onClick={onClose} />
        <SaveBtn
          loading={update.isPending}
          disabled={!label.trim()}
          onClick={() => update.mutate()}
          label="Save Changes"
        />
      </div>
    </Modal>
  );
}

// ─── Job Code Detail Modal ────────────────────────────────────────────────────

const DETAIL_FIELDS = [
  { key: 'jobFunction',           label: 'Job Function'            },
  { key: 'reportsTo',             label: 'Reports To'              },
  { key: 'roleSummary',           label: 'Role Summary'            },
  { key: 'roleResponsibilities',  label: 'Role Responsibilities'   },
  { key: 'managerResponsibility', label: 'Manager Responsibility'  },
  { key: 'educationExperience',   label: 'Education & Experience'  },
  { key: 'skillsRequired',        label: 'Skills Required'         },
] as const;

type DetailKey = typeof DETAIL_FIELDS[number]['key'];

function JobCodeDetailModal({ jc, canEdit, onClose, onSaved }: {
  jc: any; canEdit: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Record<DetailKey, string>>({
    jobFunction:           jc.jobFunction           ?? '',
    reportsTo:             jc.reportsTo             ?? '',
    roleSummary:           jc.roleSummary           ?? '',
    roleResponsibilities:  jc.roleResponsibilities  ?? '',
    managerResponsibility: jc.managerResponsibility ?? '',
    educationExperience:   jc.educationExperience   ?? '',
    skillsRequired:        jc.skillsRequired        ?? '',
  });

  const update = useMutation({
    mutationFn: () => jobArchitectureService.updateJobCode(jc.id, form),
    onSuccess: () => { toast.success('Role details saved'); setIsEditing(false); onSaved(); },
    onError:   () => toast.error('Failed to save role details'),
  });

  const hasAnyContent = DETAIL_FIELDS.some(f => jc[f.key]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">{jc.code}</span>
                {jc.band && <BandPill code={jc.band.code} label={jc.band.label} isRSU={jc.band.isEligibleForRSU} />}
                {jc.grade && (
                  <span className="text-xs text-muted-foreground px-2 py-0.5 rounded border border-border bg-muted/30">
                    {jc.grade.gradeCode}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-foreground mt-1">{jc.title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Details
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {!isEditing && !hasAnyContent && (
            <div className="text-center py-8">
              <Tag className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No details added yet.</p>
              {canEdit && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Add Details
                </button>
              )}
            </div>
          )}

          {DETAIL_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
              {isEditing ? (
                <textarea
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={`Enter ${label.toLowerCase()}...`}
                  rows={key === 'roleSummary' || key === 'roleResponsibilities' || key === 'managerResponsibility' ? 4 : 2}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
              ) : (
                <p className={cn('text-sm leading-relaxed whitespace-pre-wrap', jc[key] ? 'text-foreground' : 'text-muted-foreground/50 italic')}>
                  {jc[key] || 'Not specified'}
                </p>
              )}
              {key !== DETAIL_FIELDS[DETAIL_FIELDS.length - 1].key && !isEditing && (
                <div className="border-b border-border/50 pt-2" />
              )}
            </div>
          ))}
        </div>

        {/* Footer — edit mode only */}
        {isEditing && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border flex-shrink-0 bg-muted/20">
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => update.mutate()}
              disabled={update.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save Details
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Job Code Row (with edit/delete) ─────────────────────────────────────────

function JobCodeRow({ jc, bands, editMode, canEdit, onRefresh }: {
  jc: any; bands: any[]; editMode: boolean; canEdit: boolean; onRefresh: () => void;
}) {
  const [modal, setModal] = useState<'detail' | 'edit' | 'delete' | null>(null);

  const del = useMutation({
    mutationFn: () => jobArchitectureService.deleteJobCode(jc.id),
    onSuccess: () => { toast.success('Role deleted'); onRefresh(); setModal(null); },
    onError: () => toast.error('Failed to delete role'),
  });

  return (
    <>
      <div
        className="flex items-center justify-between px-4 py-2.5 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
        onClick={() => setModal('detail')}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs text-muted-foreground w-24 flex-shrink-0">{jc.code}</span>
          <span className="text-sm text-foreground truncate">{jc.title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {jc.grade && (
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded border border-border bg-muted/30">
              {jc.grade.gradeCode}
            </span>
          )}
          {jc.band && <BandPill code={jc.band.code} label={jc.band.label} isRSU={jc.band.isEligibleForRSU} />}
          {editMode && (
            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setModal('edit')}
                className="p-1.5 rounded-lg bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                title="Edit role code/band"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setModal('delete')}
                className="p-1.5 rounded-lg bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete role"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
        </div>
      </div>

      {modal === 'detail' && (
        <JobCodeDetailModal
          jc={jc}
          canEdit={canEdit}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onRefresh(); }}
        />
      )}
      {modal === 'edit' && (
        <JobCodeModal
          jobCode={jc}
          bands={bands}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onRefresh(); }}
        />
      )}
      {modal === 'delete' && (
        <DeleteConfirm
          label={`${jc.code} — ${jc.title}`}
          onConfirm={() => del.mutate()}
          onCancel={() => setModal(null)}
          loading={del.isPending}
        />
      )}
    </>
  );
}

// ─── Family Accordion (with edit/delete/add) ──────────────────────────────────

function FamilyAccordion({ family, bands, defaultOpen, editMode, canEdit, onRefresh }: {
  family: any; bands: any[]; defaultOpen?: boolean; editMode: boolean; canEdit: boolean; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [modal, setModal] = useState<'edit' | 'delete' | 'add-role' | null>(null);
  const jobCodes: any[] = family.jobCodes ?? [];

  const del = useMutation({
    mutationFn: () => jobArchitectureService.deleteJobFamily(family.id),
    onSuccess: () => { toast.success('Job family deleted'); onRefresh(); setModal(null); },
    onError: () => toast.error('Failed to delete job family'),
  });

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center bg-muted/20 hover:bg-muted/40 transition-colors">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex-1 flex items-center gap-2 px-4 py-3 text-left"
          >
            <Briefcase className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium text-foreground">{family.name}</span>
            <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
              {jobCodes.length} role{jobCodes.length !== 1 ? 's' : ''}
            </span>
          </button>
          {editMode && (
            <div className="flex items-center gap-1 pr-2">
              <button
                onClick={e => { e.stopPropagation(); setModal('add-role'); setOpen(true); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                title="Add role"
              >
                <Plus className="w-3.5 h-3.5" />
                Role
              </button>
              <button
                onClick={e => { e.stopPropagation(); setModal('edit'); }}
                className="p-1.5 rounded-lg bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                title="Rename family"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); setModal('delete'); }}
                className="p-1.5 rounded-lg bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete family"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <button onClick={() => setOpen(o => !o)} className="pr-4 py-3 pl-1">
            {open
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>

        {open && (
          <div className="divide-y divide-border/50 bg-background px-1 py-1">
            {jobCodes.length === 0
              ? <p className="text-xs text-muted-foreground text-center py-4">No roles defined</p>
              : jobCodes.map(jc => (
                <JobCodeRow
                  key={jc.id}
                  jc={jc}
                  bands={bands}
                  editMode={editMode}
                  canEdit={canEdit}
                  onRefresh={onRefresh}
                />
              ))
            }
          </div>
        )}
      </div>

      {modal === 'edit' && (
        <FamilyModal
          family={family}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onRefresh(); }}
        />
      )}
      {modal === 'delete' && (
        <DeleteConfirm
          label={family.name}
          onConfirm={() => del.mutate()}
          onCancel={() => setModal(null)}
          loading={del.isPending}
        />
      )}
      {modal === 'add-role' && (
        <JobCodeModal
          jobFamilyId={family.id}
          bands={bands}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Area Card (with edit/delete/add family) ──────────────────────────────────

function AreaCard({ area, colorClass, search, bands, editMode, canEdit, onRefresh }: {
  area: any; colorClass: string; search: string; bands: any[]; editMode: boolean; canEdit: boolean; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [modal, setModal] = useState<'edit' | 'delete' | 'add-family' | null>(null);
  const families: any[] = area.jobFamilies ?? [];

  const filtered = search
    ? families.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        (f.jobCodes ?? []).some((jc: any) =>
          jc.title.toLowerCase().includes(search.toLowerCase()) ||
          jc.code.toLowerCase().includes(search.toLowerCase())
        )
      )
    : families;

  const totalRoles = families.reduce((sum: number, f: any) => sum + (f.jobCodes?.length ?? 0), 0);

  const del = useMutation({
    mutationFn: () => jobArchitectureService.deleteJobArea(area.id),
    onSuccess: () => { toast.success('Job area deleted'); onRefresh(); setModal(null); },
    onError: () => toast.error('Failed to delete job area'),
  });

  return (
    <>
      <div className={cn('rounded-xl border bg-card overflow-hidden shadow-sm transition-colors', editMode ? 'border-primary/30' : 'border-border')}>
        {/* Area Header */}
        <div className="flex items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-4 flex-1 min-w-0 text-left"
          >
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', colorClass)}>
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-base">{area.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{area.description}</p>
            </div>
            <div className="text-right flex-shrink-0 mr-2">
              <p className="text-xs text-muted-foreground">{families.length} families</p>
              <p className="text-xs text-muted-foreground">{totalRoles} roles</p>
            </div>
          </button>

          {editMode && (
            <div className="flex items-center gap-1.5 flex-shrink-0 border-l border-border pl-3 ml-1">
              <button
                onClick={() => { setModal('add-family'); setOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Family
              </button>
              <button
                onClick={() => setModal('edit')}
                className="p-2 rounded-lg bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                title="Edit area"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setModal('delete')}
                className="p-2 rounded-lg bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete area"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <button onClick={() => setOpen(o => !o)} className="flex-shrink-0 pl-2">
            {open
              ? <ChevronDown className="w-5 h-5 text-muted-foreground" />
              : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
          </button>
        </div>

        {/* Families */}
        {open && (
          <div className="px-5 pb-5 space-y-2 border-t border-border bg-muted/10 pt-4">
            {filtered.length === 0 && search
              ? <p className="text-xs text-muted-foreground text-center py-6">No matches found</p>
              : filtered.map((family: any, idx: number) => (
                <FamilyAccordion
                  key={family.id}
                  family={family}
                  bands={bands}
                  defaultOpen={idx === 0 && families.length === 1}
                  editMode={editMode}
                  canEdit={canEdit}
                  onRefresh={onRefresh}
                />
              ))
            }
          </div>
        )}
      </div>

      {modal === 'edit' && (
        <AreaModal
          area={area}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onRefresh(); }}
        />
      )}
      {modal === 'delete' && (
        <DeleteConfirm
          label={area.name}
          onConfirm={() => del.mutate()}
          onCancel={() => setModal(null)}
          loading={del.isPending}
        />
      )}
      {modal === 'add-family' && (
        <FamilyModal
          jobAreaId={area.id}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JobArchitecturePage() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'bands'>('hierarchy');
  const [editMode, setEditMode] = useState(false);
  const [bandModal, setBandModal] = useState<any>(null);
  const [areaModal, setAreaModal] = useState(false);

  const user = useAuthStore(s => s.user);
  const canEdit = user?.role === 'ADMIN' || user?.role === 'HR_MANAGER';

  // Exit edit mode when switching tabs
  const handleTabChange = (tab: 'hierarchy' | 'bands') => {
    setActiveTab(tab);
    setEditMode(false);
  };

  const qc = useQueryClient();

  const refreshHierarchy = () => {
    qc.invalidateQueries({ queryKey: queryKeys.jobArchitecture.hierarchy });
  };
  const refreshBands = () => {
    qc.invalidateQueries({ queryKey: queryKeys.jobArchitecture.bands });
    qc.invalidateQueries({ queryKey: queryKeys.jobArchitecture.hierarchy });
  };

  const { data: hierarchyData, isLoading: hierarchyLoading } = useQuery({
    queryKey: queryKeys.jobArchitecture.hierarchy,
    queryFn: jobArchitectureService.getHierarchy,
    staleTime: STALE_TIMES.LONG,
  });

  const { data: bandsData, isLoading: bandsLoading } = useQuery({
    queryKey: queryKeys.jobArchitecture.bands,
    queryFn: jobArchitectureService.getBands,
    staleTime: STALE_TIMES.LONG,
  });

  const areas: any[] = hierarchyData?.data ?? [];
  const bands: any[] = bandsData?.data ?? [];

  const totalFamilies = areas.reduce((s, a) => s + (a.jobFamilies?.length ?? 0), 0);
  const totalRoles = areas.reduce((s, a) =>
    s + (a.jobFamilies ?? []).reduce((fs: number, f: any) => fs + (f.jobCodes?.length ?? 0), 0), 0);

  const filteredAreas = search
    ? areas.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        (a.jobFamilies ?? []).some((f: any) =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          (f.jobCodes ?? []).some((jc: any) =>
            jc.title.toLowerCase().includes(search.toLowerCase()) ||
            jc.code.toLowerCase().includes(search.toLowerCase())
          )
        )
      )
    : areas;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Job Architecture</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage job areas, families, bands and roles
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {editMode && activeTab === 'hierarchy' && (
              <button
                onClick={() => setAreaModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Area
              </button>
            )}
            <button
              onClick={() => setEditMode(e => !e)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                editMode
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {editMode
                ? <><CheckCheck className="w-4 h-4" /> Done Editing</>
                : <><Pencil className="w-4 h-4" /> Edit Architecture</>
              }
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Job Areas', value: areas.length, icon: Building2, color: 'text-blue-500' },
          { label: 'Job Families', value: totalFamilies, icon: Briefcase, color: 'text-violet-500' },
          { label: 'Total Roles', value: totalRoles, icon: Tag, color: 'text-emerald-500' },
          { label: 'Bands', value: bands.length, icon: Layers, color: 'text-amber-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn('w-4 h-4', color)} />
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {hierarchyLoading || bandsLoading
                ? <span className="inline-block w-8 h-6 bg-muted/60 rounded animate-pulse" />
                : value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/40 border border-border w-fit">
        {(['hierarchy', 'bands'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize',
              activeTab === tab
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'hierarchy' ? 'Hierarchy' : 'Band Structure'}
          </button>
        ))}
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/8 border border-primary/20 text-sm text-primary">
          <Pencil className="w-4 h-4 flex-shrink-0" />
          <span>Edit mode is on — make changes below, then click <strong>Done Editing</strong> when finished.</span>
        </div>
      )}

      {/* Hierarchy Tab */}
      {activeTab === 'hierarchy' && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search areas, families, roles..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {hierarchyLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-muted/60 animate-pulse" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-muted/60 rounded w-1/4 animate-pulse" />
                      <div className="h-3 bg-muted/40 rounded w-1/3 animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredAreas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-16 text-center">
              <Layers className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? `No results for "${search}"` : 'No job areas yet'}
              </p>
              {canEdit && !search && (
                <button
                  onClick={() => { setAreaModal(true); setEditMode(true); }}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add First Job Area
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAreas.map((area: any, idx: number) => (
                <AreaCard
                  key={area.id}
                  area={area}
                  colorClass={AREA_COLORS[idx % AREA_COLORS.length]}
                  search={search}
                  bands={bands}
                  editMode={editMode}
                  canEdit={canEdit}
                  onRefresh={refreshHierarchy}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Band Structure Tab */}
      {activeTab === 'bands' && (
        <div className="space-y-3">
          {bandsLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl border border-border bg-card animate-pulse" />
            ))
          ) : (
            bands
              .sort((a, b) => a.level - b.level)
              .map((band: any) => (
                <div
                  key={band.id}
                  className="flex items-center gap-4 px-5 py-4 rounded-xl border border-border bg-card hover:bg-muted/20 transition-colors"
                >
                  <div className="w-12 flex-shrink-0">
                    <BandPill code={band.code} label={band.label} isRSU={band.isEligibleForRSU} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{band.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Level {band.level}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {band.isEligibleForRSU && (
                      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full border border-amber-200 dark:border-amber-800">
                        <Star className="w-3 h-3 fill-current" />
                        RSU Eligible
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {areas.reduce((count, a) =>
                        count + (a.jobFamilies ?? []).reduce((fc: number, f: any) =>
                          fc + (f.jobCodes ?? []).filter((jc: any) => jc.band?.code === band.code).length, 0), 0
                      )} roles
                    </span>
                    {editMode && (
                      <button
                        onClick={() => setBandModal(band)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary text-xs font-medium transition-colors"
                        title="Edit band"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              ))
          )}

          <p className="text-xs text-muted-foreground text-center pt-2 flex items-center justify-center gap-1">
            <Star className="w-3 h-3 text-amber-500 fill-current" />
            Bands marked with a star are eligible for RSU grants
          </p>
        </div>
      )}

      {/* Global modals */}
      {areaModal && (
        <AreaModal
          onClose={() => setAreaModal(false)}
          onSaved={() => { setAreaModal(false); refreshHierarchy(); }}
        />
      )}
      {bandModal && (
        <BandModal
          band={bandModal}
          onClose={() => setBandModal(null)}
          onSaved={() => { setBandModal(null); refreshBands(); }}
        />
      )}
    </div>
  );
}
