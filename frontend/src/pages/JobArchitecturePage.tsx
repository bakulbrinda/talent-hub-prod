import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Layers, ChevronRight, ChevronDown, Building2,
  Users, Tag, Briefcase, Star, Search
} from 'lucide-react';
import { jobArchitectureService } from '../services/jobArchitecture.service';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import { cn } from '../lib/utils';

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

function BandPill({ code, label, isRSU }: { code: string; label: string; isRSU: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', BAND_COLORS[code] || 'bg-muted text-muted-foreground')}>
      {code}
      {isRSU && <Star className="w-2.5 h-2.5 fill-current" />}
    </span>
  );
}

function JobCodeRow({ jc }: { jc: any }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 rounded-lg hover:bg-muted/40 transition-colors group">
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
        {jc.band && (
          <BandPill code={jc.band.code} label={jc.band.label} isRSU={jc.band.isEligibleForRSU} />
        )}
      </div>
    </div>
  );
}

function FamilyAccordion({ family, defaultOpen }: { family: any; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const jobCodes: any[] = family.jobCodes ?? [];

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{family.name}</span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
            {jobCodes.length} role{jobCodes.length !== 1 ? 's' : ''}
          </span>
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="divide-y divide-border/50 bg-background px-1 py-1">
          {jobCodes.length === 0
            ? <p className="text-xs text-muted-foreground text-center py-4">No job codes defined</p>
            : jobCodes.map(jc => <JobCodeRow key={jc.id} jc={jc} />)
          }
        </div>
      )}
    </div>
  );
}

function AreaCard({ area, colorClass, search }: { area: any; colorClass: string; search: string }) {
  const [open, setOpen] = useState(true);
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

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Area Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
      >
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', colorClass)}>
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-base">{area.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{area.description}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{families.length} families</p>
            <p className="text-xs text-muted-foreground">{totalRoles} roles</p>
          </div>
          {open
            ? <ChevronDown className="w-5 h-5 text-muted-foreground" />
            : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
        </div>
      </button>

      {/* Families */}
      {open && (
        <div className="px-5 pb-5 space-y-2 border-t border-border bg-muted/10 pt-4">
          {filtered.length === 0
            ? <p className="text-xs text-muted-foreground text-center py-6">No matches found</p>
            : filtered.map((family: any, idx: number) => (
              <FamilyAccordion key={family.id} family={family} defaultOpen={idx === 0 && families.length === 1} />
            ))
          }
        </div>
      )}
    </div>
  );
}

export default function JobArchitecturePage() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'bands'>('hierarchy');

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
            onClick={() => setActiveTab(tab)}
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

      {/* Hierarchy Tab */}
      {activeTab === 'hierarchy' && (
        <>
          {/* Search */}
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
              <p className="text-sm text-muted-foreground">No results found for "{search}"</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAreas.map((area: any, idx: number) => (
                <AreaCard
                  key={area.id}
                  area={area}
                  colorClass={AREA_COLORS[idx % AREA_COLORS.length]}
                  search={search}
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
    </div>
  );
}
