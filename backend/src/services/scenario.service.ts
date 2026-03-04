import { prisma } from '../lib/prisma';
import { callClaude } from '../lib/claudeClient';

// ─── Merit Matrix (company increment table) ───────────────────
// Rows: performance tier (OS≥4.5, EP≥3.5, SP≥2.5, NI<2.5)
// Cols: criticality C1, C2, C3, C4
// Outer key: CTC salary band (1=≤12L, 2=12.1–20L, 3=20.1–30L, 4=>30L)
const MERIT_MATRIX: Record<number, Record<string, Record<string, number>>> = {
  1: { OS: { C1: 10, C2: 9, C3: 8, C4: 7 }, EP: { C1: 9, C2: 8, C3: 7, C4: 6 }, SP: { C1: 8, C2: 7, C3: 6, C4: 5 }, NI: { C1: 0, C2: 0, C3: 0, C4: 0 } },
  2: { OS: { C1: 8, C2: 7, C3: 6, C4: 5 }, EP: { C1: 7, C2: 6, C3: 5, C4: 4 }, SP: { C1: 6, C2: 5, C3: 4, C4: 3 }, NI: { C1: 0, C2: 0, C3: 0, C4: 0 } },
  3: { OS: { C1: 6, C2: 5, C3: 4, C4: 3 }, EP: { C1: 5, C2: 4, C3: 3, C4: 2 }, SP: { C1: 4, C2: 3, C3: 3, C4: 2 }, NI: { C1: 0, C2: 0, C3: 0, C4: 0 } },
  4: { OS: { C1: 4, C2: 3, C3: 2, C4: 1 }, EP: { C1: 3, C2: 2, C3: 2, C4: 1 }, SP: { C1: 2, C2: 1, C3: 1, C4: 0 }, NI: { C1: 0, C2: 0, C3: 0, C4: 0 } },
};

function getSalaryBandTier(annualCtc: number): number {
  const l = annualCtc / 100000; // convert to lakhs
  if (l <= 12)  return 1;
  if (l <= 20)  return 2;
  if (l <= 30)  return 3;
  return 4;
}

function getPerformanceTier(rating: number): string {
  if (rating >= 4.5) return 'OS';
  if (rating >= 3.5) return 'EP';
  if (rating >= 2.5) return 'SP';
  return 'NI';
}

function getMeritIncrement(annualCtc: number, rating: number, criticality: string | null): number {
  const tier = getSalaryBandTier(annualCtc);
  const perf = getPerformanceTier(rating);
  const crit = criticality && ['C1','C2','C3','C4'].includes(criticality) ? criticality : 'C4';
  return MERIT_MATRIX[tier]?.[perf]?.[crit] ?? 0;
}

interface ScenarioRule {
  filter: {
    band?: string | string[];
    department?: string | string[];
    performanceRating?: { min: number };
    compaRatio?: { max: number };
    gender?: string;
    tenure?: { min: number };
  };
  action: {
    type: 'RAISE_PERCENT' | 'RAISE_FLAT' | 'SET_TO_BENCHMARK' | 'SET_COMPA_RATIO' | 'MERIT_MATRIX';
    value: number;
  };
}

// Build a lookup map of band code -> midSalary using the SalaryBand -> Band relation
async function getBandMidSalaryMap(): Promise<Record<string, number>> {
  const salaryBands = await prisma.salaryBand.findMany({
    include: { band: { select: { code: true } } },
    orderBy: { effectiveDate: 'desc' },
  });

  // Use the most recent salary band entry per band code
  const map: Record<string, number> = {};
  for (const sb of salaryBands) {
    const code = sb.band.code;
    if (!map[code]) {
      map[code] = Number(sb.midSalary);
    }
  }
  return map;
}

async function getFilteredEmployees(filter: ScenarioRule['filter']) {
  const where: any = { employmentStatus: 'ACTIVE' };

  if (filter.band) {
    where.band = Array.isArray(filter.band) ? { in: filter.band } : filter.band;
  }
  if (filter.department) {
    where.department = Array.isArray(filter.department)
      ? { in: filter.department }
      : filter.department;
  }
  if (filter.gender) where.gender = filter.gender;
  if (filter.compaRatio?.max !== undefined) {
    where.compaRatio = { lte: filter.compaRatio.max };
  }

  let employees = await prisma.employee.findMany({
    where,
    include: {
      performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 },
    },
  });

  if (filter.performanceRating?.min !== undefined) {
    const minRating = filter.performanceRating.min;
    employees = employees.filter(
      e => Number(e.performanceRatings[0]?.rating ?? 0) >= minRating,
    );
  }

  if (filter.tenure?.min !== undefined) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - filter.tenure.min);
    employees = employees.filter(e => new Date(e.dateOfJoining) <= cutoff);
  }

  return employees;
}

function applyAction(
  currentFixed: number,
  action: ScenarioRule['action'],
  bandMid?: number,
  empCtc?: number,
  empRating?: number,
  empCriticality?: string | null,
): number {
  switch (action.type) {
    case 'RAISE_PERCENT':
      return currentFixed * (1 + action.value / 100);
    case 'RAISE_FLAT':
      return currentFixed + action.value;
    case 'SET_COMPA_RATIO':
      return bandMid ? bandMid * (action.value / 100) : currentFixed;
    case 'SET_TO_BENCHMARK':
      return bandMid ?? currentFixed;
    case 'MERIT_MATRIX': {
      const ctc = empCtc ?? currentFixed;
      const rating = empRating ?? 0;
      const incrementPct = getMeritIncrement(ctc, rating, empCriticality ?? null);
      return currentFixed * (1 + incrementPct / 100);
    }
    default:
      return currentFixed;
  }
}

export const scenarioService = {
  getAll: async () => {
    return prisma.scenario.findMany({ orderBy: { createdAt: 'desc' } });
  },

  getById: async (id: string) => {
    return prisma.scenario.findUnique({ where: { id } });
  },

  // createdBy is the User's UUID, stored as createdById FK on the Scenario model
  create: async (data: {
    name: string;
    description?: string;
    rules: ScenarioRule[];
    createdBy: string;
  }) => {
    return prisma.scenario.create({
      data: {
        name: data.name,
        description: data.description ?? '',
        rules: data.rules as any,
        createdById: data.createdBy,
        status: 'DRAFT',
      },
    });
  },

  run: async (id: string) => {
    const scenario = await prisma.scenario.findUnique({ where: { id } });
    if (!scenario) throw new Error('Scenario not found');
    const rules = (scenario.rules as unknown) as ScenarioRule[];

    // Pre-fetch band mid-salary map once
    const bandMidMap = await getBandMidSalaryMap();

    const affectedMap = new Map<
      string,
      {
        currentFixed: number;
        projectedFixed: number;
        name: string;
        band: string;
        department: string;
      }
    >();

    for (const rule of rules) {
      const employees = await getFilteredEmployees(rule.filter);
      for (const emp of employees) {
        const current = Number(emp.annualFixed);
        const bandMid = bandMidMap[emp.band];
        const latestRating = Number(emp.performanceRatings[0]?.rating ?? 0);
        const projected = applyAction(current, rule.action, bandMid, Number(emp.annualCtc), latestRating, (emp as any).criticality);
        const existing = affectedMap.get(emp.id);
        affectedMap.set(emp.id, {
          currentFixed: existing?.currentFixed ?? current,
          projectedFixed: projected,
          name: `${emp.firstName} ${emp.lastName}`,
          band: emp.band,
          department: emp.department,
        });
      }
    }

    const affected = Array.from(affectedMap.values());
    const currentCost = affected.reduce((s, e) => s + e.currentFixed, 0);
    const projectedCost = affected.reduce((s, e) => s + e.projectedFixed, 0);

    const byBand = affected.reduce(
      (
        acc: Record<string, { current: number; projected: number; count: number }>,
        e,
      ) => {
        if (!acc[e.band]) acc[e.band] = { current: 0, projected: 0, count: 0 };
        acc[e.band].current += e.currentFixed;
        acc[e.band].projected += e.projectedFixed;
        acc[e.band].count++;
        return acc;
      },
      {},
    );

    return {
      scenarioId: id,
      scenarioName: scenario.name,
      affectedCount: affected.length,
      currentCost,
      projectedCost,
      delta: projectedCost - currentCost,
      deltaPercent:
        currentCost > 0
          ? ((projectedCost - currentCost) / currentCost) * 100
          : 0,
      byBand: Object.entries(byBand).map(([band, v]) => ({
        band,
        ...v,
        delta: v.projected - v.current,
      })),
      topChanges: affected
        .sort(
          (a, b) =>
            b.projectedFixed -
            b.currentFixed -
            (a.projectedFixed - a.currentFixed),
        )
        .slice(0, 10),
    };
  },

  apply: async (id: string, confirmationToken: string) => {
    if (confirmationToken !== 'CONFIRM_APPLY') {
      const err = new Error('Invalid confirmation token') as any;
      err.statusCode = 400;
      throw err;
    }

    const scenario = await prisma.scenario.findUnique({ where: { id } });
    if (!scenario) throw new Error('Scenario not found');
    const rules = (scenario.rules as unknown) as ScenarioRule[];

    const bandMidMap = await getBandMidSalaryMap();

    let updatedCount = 0;
    for (const rule of rules) {
      const employees = await getFilteredEmployees(rule.filter);
      for (const emp of employees) {
        const current = Number(emp.annualFixed);
        const bandMid = bandMidMap[emp.band];
        const latestRating = Number(emp.performanceRatings[0]?.rating ?? 0);
        const projected = applyAction(current, rule.action, bandMid, Number(emp.annualCtc), latestRating, (emp as any).criticality);
        if (projected !== current) {
          await prisma.employee.update({
            where: { id: emp.id },
            data: {
              annualFixed: projected,
              annualCtc: projected * 1.15,
            },
          });
          updatedCount++;
        }
      }
    }

    await prisma.scenario.update({
      where: { id },
      data: { status: 'APPLIED' },
    });

    return { updatedCount, scenarioId: id };
  },

  compare: async (scenarioIds: string[]) => {
    return Promise.all(scenarioIds.map(sid => scenarioService.run(sid)));
  },

  delete: async (id: string) => {
    return prisma.scenario.delete({ where: { id } });
  },

  analyzeRunResult: async (runResult: {
    scenarioName: string;
    affectedCount: number;
    currentCost: number;
    projectedCost: number;
    delta: number;
    deltaPercent: number;
    byBand: { band: string; count: number; current: number; projected: number; delta: number }[];
    topChanges: { name: string; band: string; currentFixed: number; projectedFixed: number }[];
  }): Promise<string> => {
    const totalEmployees = await prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } });
    const totalPayroll = await prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE' }, _sum: { annualFixed: true } });
    const currentTotalPayroll = Number(totalPayroll._sum.annualFixed || 0);

    const prompt = `You are CompSense AI, an expert in compensation strategy and scenario planning. Analyze the following compensation scenario simulation results and provide a concise executive recommendation.

Scenario: "${runResult.scenarioName}"
Total active employees: ${totalEmployees}
Current total payroll: ₹${(currentTotalPayroll / 10000000).toFixed(2)}Cr

Scenario impact:
- Employees affected: ${runResult.affectedCount} (${((runResult.affectedCount / totalEmployees) * 100).toFixed(0)}% of workforce)
- Current cost of affected group: ₹${(runResult.currentCost / 100000).toFixed(1)}L
- Projected cost: ₹${(runResult.projectedCost / 100000).toFixed(1)}L
- Delta: +₹${(runResult.delta / 100000).toFixed(1)}L (${runResult.deltaPercent.toFixed(1)}% increase)
- As % of total payroll: ${((runResult.delta / currentTotalPayroll) * 100).toFixed(1)}% additional spend

By band:
${runResult.byBand.map(b => `- ${b.band}: ${b.count} employees, +₹${(b.delta / 100000).toFixed(1)}L delta`).join('\n')}

Top individual changes:
${runResult.topChanges.slice(0, 5).map(e => `- ${e.name} (${e.band}): ₹${(e.currentFixed / 100000).toFixed(1)}L → ₹${(e.projectedFixed / 100000).toFixed(1)}L`).join('\n')}

Provide:
1. A concise executive recommendation: should this scenario be applied? Why or why not?
2. Key risks of applying vs. not applying this change
3. Budget sustainability analysis — is this affordable given total payroll?
4. One alternative approach that could achieve the same goal at lower cost

Format with clear markdown headers. Be direct and specific. Keep it under 400 words.`;

    try {
      const result = await callClaude(prompt, { temperature: 0.3, maxTokens: 800 });
      return result.content;
    } catch {
      return `**Scenario Analysis**\n\nThis scenario affects ${runResult.affectedCount} employees with a total cost delta of +₹${(runResult.delta / 100000).toFixed(1)}L (${runResult.deltaPercent.toFixed(1)}% increase).`;
    }
  },
};
