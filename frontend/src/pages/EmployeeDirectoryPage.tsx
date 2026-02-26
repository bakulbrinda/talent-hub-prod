import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search, Filter, Users, TrendingUp, TrendingDown, Minus,
  UserPlus, Upload, Pencil, AlertCircle, RefreshCw, FileSpreadsheet, Sparkles
} from 'lucide-react';
import { employeeService, EmployeeFilters } from '../services/employee.service';
import { queryKeys } from '../lib/queryClient';
import { cn, formatINR, getInitials, getBandColor } from '../lib/utils';
import AddEmployeeModal from '../components/employees/AddEmployeeModal';
import ImportEmployeesModal from '../components/employees/ImportEmployeesModal';

const DEPARTMENTS = ['Engineering', 'Sales', 'Product', 'HR', 'Finance', 'Operations'];
const BANDS = ['A1', 'A2', 'P1', 'P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'];

function CompaRatioBadge({ value }: { value: number | string | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  const num = Number(value);
  if (isNaN(num)) return <span className="text-xs text-muted-foreground">—</span>;
  const color =
    num < 80 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
    num <= 120 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  const Icon = num < 80 ? TrendingDown : num > 120 ? TrendingUp : Minus;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', color)}>
      <Icon className="w-3 h-3" />
      {num.toFixed(0)}%
    </span>
  );
}

export default function EmployeeDirectoryPage() {
  const [filters, setFilters] = useState<EmployeeFilters>({ page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editEmployee, setEditEmployee] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.employees.all(filters as Record<string, unknown>),
    queryFn: () => employeeService.getAll(filters),
    staleTime: 30000,
  });

  const handleSearch = (value: string) => {
    setSearch(value);
    setFilters(f => ({ ...f, search: value || undefined, page: 1 }));
  };

  const employees = data?.data ?? [];
  const meta = data?.meta;
  const hasActiveFilters = !!(filters.band || filters.department || filters.gender || filters.workMode || filters.search);
  const isEmptyDatabase = !isLoading && !isError && meta?.total === 0 && !hasActiveFilters;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employee Directory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {meta ? `${meta.total} active employees` : isLoading ? 'Loading...' : 'Employee database'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm hover:bg-accent transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import CSV/Excel
          </button>
          <button
            onClick={() => { setEditEmployee(null); setShowAdd(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
          >
            <UserPlus className="w-4 h-4" />
            Add Employee
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, ID, designation..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
            showFilters ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-accent'
          )}
        >
          <Filter className="w-4 h-4" />
          Filters
          {(filters.band || filters.department || filters.gender || filters.workMode) && (
            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
          )}
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 rounded-xl border border-border bg-card">
          {[
            { label: 'Band', key: 'band', options: BANDS.map(b => ({ value: b, label: b })) },
            { label: 'Department', key: 'department', options: DEPARTMENTS.map(d => ({ value: d, label: d })) },
            { label: 'Gender', key: 'gender', options: [{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }, { value: 'NON_BINARY', label: 'Non-binary' }] },
            { label: 'Work Mode', key: 'workMode', options: [{ value: 'REMOTE', label: 'Remote' }, { value: 'HYBRID', label: 'Hybrid' }, { value: 'ONSITE', label: 'Onsite' }] },
          ].map(({ label, key, options }) => (
            <div key={key}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
              <select
                value={(filters as any)[key] || ''}
                onChange={e => setFilters(f => ({ ...f, [key]: e.target.value || undefined, page: 1 }))}
                className="px-3 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All {label}s</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}
          <div className="flex items-end">
            <button
              onClick={() => { setFilters({ page: 1, limit: 20 }); setSearch(''); }}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="flex items-center justify-between p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Failed to load employees</p>
              <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">Check that the backend is running on port 3001</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-sm text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Employee</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Department</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Band</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Annual Fixed</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Compa-Ratio</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Location</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mode</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-muted/60 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : employees.length === 0
                ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      {isEmptyDatabase ? (
                        <div className="max-w-md mx-auto px-6">
                          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <FileSpreadsheet className="w-8 h-8 text-primary" />
                          </div>
                          <h3 className="text-base font-semibold text-foreground mb-1">No employee data yet</h3>
                          <p className="text-sm text-muted-foreground mb-5">
                            Import your Excel or CSV file to populate the platform with real employee data. All AI insights, pay equity analysis, and dashboards will update automatically.
                          </p>
                          <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                              onClick={() => setShowImport(true)}
                              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                            >
                              <Upload className="w-4 h-4" />
                              Import Excel / CSV
                            </button>
                            <button
                              onClick={() => { setEditEmployee(null); setShowAdd(true); }}
                              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-background text-sm hover:bg-accent transition-colors"
                            >
                              <UserPlus className="w-4 h-4" />
                              Add Manually
                            </button>
                          </div>
                          <p className="mt-4 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-primary" />
                            AI insights regenerate automatically after every import
                          </p>
                        </div>
                      ) : (
                        <div>
                          <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                          <p className="text-sm text-muted-foreground">No employees match your filters</p>
                          <button
                            onClick={() => { setFilters({ page: 1, limit: 20 }); setSearch(''); }}
                            className="mt-3 text-xs text-primary hover:underline"
                          >
                            Clear filters
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
                : employees.map(emp => (
                  <tr key={emp.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-3">
                      <Link to={`/employees/${emp.id}`} className="flex items-center gap-3 group/link">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold flex-shrink-0">
                          {getInitials(emp.firstName, emp.lastName)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground group-hover/link:text-primary transition-colors truncate">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{emp.designation}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{emp.department}</td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', getBandColor(emp.band))}>
                        {emp.band}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-foreground">
                      {formatINR(Number(emp.annualFixed) || 0)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <CompaRatioBadge value={(emp as any).compaRatio} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">{emp.workLocation || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                        emp.workMode === 'REMOTE' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        emp.workMode === 'HYBRID' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      )}>
                        {emp.workMode ? emp.workMode.charAt(0) + emp.workMode.slice(1).toLowerCase() : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setEditEmployee(emp); setShowAdd(true); }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-accent transition-all text-muted-foreground hover:text-foreground"
                        title="Edit employee"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground">
              Showing {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-2">
              <button
                disabled={meta.page === 1}
                onClick={() => setFilters(f => ({ ...f, page: (f.page || 1) - 1 }))}
                className="px-3 py-1 rounded-lg border border-border text-xs disabled:opacity-40 hover:bg-accent transition-colors"
              >
                Previous
              </button>
              {Array.from({ length: Math.min(5, meta.totalPages) }, (_, i) => {
                const pageNum = Math.max(1, Math.min(meta.page - 2, meta.totalPages - 4)) + i;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setFilters(f => ({ ...f, page: pageNum }))}
                    className={cn('px-3 py-1 rounded-lg text-xs transition-colors',
                      pageNum === meta.page ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                disabled={meta.page === meta.totalPages}
                onClick={() => setFilters(f => ({ ...f, page: (f.page || 1) + 1 }))}
                className="px-3 py-1 rounded-lg border border-border text-xs disabled:opacity-40 hover:bg-accent transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddEmployeeModal
        open={showAdd}
        onClose={() => { setShowAdd(false); setEditEmployee(null); }}
        prefill={editEmployee ? {
          id: editEmployee.id,
          firstName: editEmployee.firstName,
          lastName: editEmployee.lastName,
          email: editEmployee.email,
          gender: editEmployee.gender,
          dateOfJoining: editEmployee.dateOfJoining?.split('T')[0],
          department: editEmployee.department,
          designation: editEmployee.designation,
          band: editEmployee.band,
          grade: editEmployee.grade,
          workMode: editEmployee.workMode,
          workLocation: editEmployee.workLocation,
          annualFixed: Number(editEmployee.annualFixed),
        } : undefined}
      />
      <ImportEmployeesModal
        open={showImport}
        onClose={() => setShowImport(false)}
      />
    </div>
  );
}
