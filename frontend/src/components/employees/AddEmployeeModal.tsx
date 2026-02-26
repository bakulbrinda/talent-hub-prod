import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, User, Briefcase, DollarSign, Loader2 } from 'lucide-react';
import { employeeService } from '../../services/employee.service';
import { queryKeys } from '../../lib/queryClient';
import { cn } from '../../lib/utils';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email required'),
  gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']),
  dateOfJoining: z.string().min(1, 'Date of joining is required'),
  department: z.string().min(1, 'Department is required'),
  designation: z.string().min(1, 'Designation is required'),
  band: z.enum(['A1', 'A2', 'P1', 'P2', 'P3', 'P4']),
  grade: z.string().min(1, 'Grade is required'),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']).default('FULL_TIME'),
  workMode: z.enum(['REMOTE', 'HYBRID', 'ONSITE']).default('HYBRID'),
  workLocation: z.string().optional(),
  costCenter: z.string().optional(),
  annualFixed: z.number({ invalid_type_error: 'Must be a number' }).positive('Must be positive'),
  variablePay: z.number().min(0).optional(),
  annualCtc: z.number().min(0).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  prefill?: Partial<FormData> & { id?: string };
}

const DEPARTMENTS = ['Engineering', 'Sales', 'Product', 'HR', 'Finance', 'Operations'];
const BANDS = ['A1', 'A2', 'P1', 'P2', 'P3', 'P4'];
const GRADES = ['A1-L1', 'A1-L2', 'A2-L1', 'A2-L2', 'P1-L1', 'P1-L2', 'P2-L1', 'P2-L2', 'P3-L1', 'P3-L2', 'P4-L1', 'P4-L2'];

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn('w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary', className)}
      {...props}
    />
  );
}

function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary', className)}
      {...props}
    >
      {children}
    </select>
  );
}

export default function AddEmployeeModal({ open, onClose, prefill }: Props) {
  const [tab, setTab] = useState<'personal' | 'employment' | 'compensation'>('personal');
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const isEditing = !!prefill?.id;

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: prefill
      ? { ...prefill, annualFixed: (prefill as any).annualFixed ? Number((prefill as any).annualFixed) : undefined }
      : { employmentType: 'FULL_TIME', workMode: 'HYBRID' },
  });

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const payload: any = {
        ...data,
        annualFixed: data.annualFixed,
        variablePay: data.variablePay ?? data.annualFixed * 0.10,
        annualCtc: data.annualCtc ?? data.annualFixed * 1.20,
        basicAnnual: data.annualFixed * 0.35,
        basicMonthly: (data.annualFixed * 0.35) / 12,
        hra: data.annualFixed * 0.20,
        hraMonthly: (data.annualFixed * 0.20) / 12,
        lta: data.annualFixed * 0.05,
        ltaMonthly: (data.annualFixed * 0.05) / 12,
        pfYearly: data.annualFixed * 0.35 * 0.12,
        pfMonthly: (data.annualFixed * 0.35 * 0.12) / 12,
        specialAllowance: data.annualFixed * 0.40,
        monthlySpecialAllowance: (data.annualFixed * 0.40) / 12,
        flexiTotalYearly: 0, flexiTotalMonthly: 0,
        subTotalA: data.annualFixed, subTotalAMonthly: data.annualFixed / 12,
        monthlyGrossSalary: data.annualFixed / 12,
        incentives: 0, joiningBonus: 0, retentionBonus: 0,
        dateOfJoining: new Date(data.dateOfJoining).toISOString(),
        employeeId: `EMP${Date.now().toString().slice(-6)}`,
        employmentStatus: 'ACTIVE',
      };

      if (isEditing) {
        await employeeService.update(prefill!.id!, payload);
        toast.success('Employee updated successfully');
      } else {
        await employeeService.create(payload);
        toast.success('Employee added successfully');
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.kpis });
      reset();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Something went wrong';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const tabs = [
    { id: 'personal' as const, label: 'Personal', icon: User },
    { id: 'employment' as const, label: 'Employment', icon: Briefcase },
    { id: 'compensation' as const, label: 'Compensation', icon: DollarSign },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-background rounded-2xl shadow-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{isEditing ? 'Edit Employee' : 'Add New Employee'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Fill in the employee details below</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-card">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2',
                tab === id
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Personal Tab */}
            {tab === 'personal' && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="First Name *" error={errors.firstName?.message}>
                  <Input placeholder="Priya" {...register('firstName')} />
                </Field>
                <Field label="Last Name *" error={errors.lastName?.message}>
                  <Input placeholder="Sharma" {...register('lastName')} />
                </Field>
                <Field label="Email *" error={errors.email?.message}>
                  <Input type="email" placeholder="priya.sharma@company.com" {...register('email')} className="col-span-2" />
                </Field>
                <Field label="Gender *" error={errors.gender?.message}>
                  <Select {...register('gender')}>
                    <option value="">Select gender</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="NON_BINARY">Non-Binary</option>
                    <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                  </Select>
                </Field>
                <Field label="Date of Joining *" error={errors.dateOfJoining?.message}>
                  <Input type="date" {...register('dateOfJoining')} />
                </Field>
              </div>
            )}

            {/* Employment Tab */}
            {tab === 'employment' && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Department *" error={errors.department?.message}>
                  <Select {...register('department')}>
                    <option value="">Select department</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </Field>
                <Field label="Designation *" error={errors.designation?.message}>
                  <Input placeholder="Software Engineer" {...register('designation')} />
                </Field>
                <Field label="Band *" error={errors.band?.message}>
                  <Select {...register('band')}>
                    <option value="">Select band</option>
                    {BANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </Select>
                </Field>
                <Field label="Grade *" error={errors.grade?.message}>
                  <Select {...register('grade')}>
                    <option value="">Select grade</option>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </Select>
                </Field>
                <Field label="Employment Type" error={errors.employmentType?.message}>
                  <Select {...register('employmentType')}>
                    <option value="FULL_TIME">Full Time</option>
                    <option value="PART_TIME">Part Time</option>
                    <option value="CONTRACT">Contract</option>
                  </Select>
                </Field>
                <Field label="Work Mode" error={errors.workMode?.message}>
                  <Select {...register('workMode')}>
                    <option value="HYBRID">Hybrid</option>
                    <option value="REMOTE">Remote</option>
                    <option value="ONSITE">Onsite</option>
                  </Select>
                </Field>
                <Field label="Work Location" error={errors.workLocation?.message}>
                  <Input placeholder="Bangalore" {...register('workLocation')} />
                </Field>
                <Field label="Cost Center" error={errors.costCenter?.message}>
                  <Input placeholder="CC-ENG" {...register('costCenter')} />
                </Field>
              </div>
            )}

            {/* Compensation Tab */}
            {tab === 'compensation' && (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-400">
                  Salary components (Basic, HRA, PF, LTA) are auto-calculated from Annual Fixed. You can override Annual CTC.
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Annual Fixed (₹) *" error={errors.annualFixed?.message}>
                    <Input
                      type="number"
                      placeholder="1200000"
                      {...register('annualFixed', { valueAsNumber: true })}
                    />
                  </Field>
                  <Field label="Variable Pay (₹)" error={errors.variablePay?.message}>
                    <Input
                      type="number"
                      placeholder="Auto: 10% of fixed"
                      {...register('variablePay', { valueAsNumber: true })}
                    />
                  </Field>
                  <Field label="Annual CTC (₹)" error={errors.annualCtc?.message}>
                    <Input
                      type="number"
                      placeholder="Auto-calculated"
                      {...register('annualCtc', { valueAsNumber: true })}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
            <div className="flex gap-2">
              {tabs.map(({ id }, idx) => (
                <div key={id} className={cn('w-2 h-2 rounded-full', tab === id ? 'bg-primary' : 'bg-muted')} />
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors">
                Cancel
              </button>
              {tab !== 'compensation' ? (
                <button
                  type="button"
                  onClick={() => setTab(tab === 'personal' ? 'employment' : 'compensation')}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isEditing ? 'Save Changes' : 'Add Employee'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
