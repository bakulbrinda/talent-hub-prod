import { prisma } from '../lib/prisma';
import { callClaude } from '../lib/claudeClient';
import { cacheDelPattern } from '../lib/redis';
import { emitDashboardRefresh, emitEmployeeDataChanged } from '../lib/socket';

interface ScenarioFilter {
  band?: string | string[];
  department?: string | string[];
  performanceRating?: { min: number };
  compaRatio?: { max: number };
  gender?: string;
  tenure?: { min: number };
}

interface ScenarioAction {
  type: 'RAISE_PERCENT' | 'RAISE_FLAT' | 'SET_COMPA_RATIO';
  value: number;
}

interface ScenarioRule {
  filter: ScenarioFilter;
  action: ScenarioAction;
}

function matchesFilter(emp: any, filter: ScenarioFilter): boolean {
  if (filter.band) {
    const bands = Array.isArray(filter.band) ? filter.band : [filter.band];
    if (!bands.includes(emp.band)) return false;
  }
  if (filter.department) {
    const depts = Array.isArray(filter.department)
      ? filter.department
      : [filter.department];
    if (!depts.includes(emp.department)) return false;
  }
  if (filter.gender && emp.gender !== filter.gender) return false;
  if (
    filter.compaRatio?.max !== undefined &&
    Number(emp.compaRatio || 100) > filter.compaRatio.max
  )
    return false;
  if (filter.performanceRating?.min !== undefined) {
    const lastRating = Number(emp.performanceRatings?.[0]?.rating || 0);
    if (lastRating < filter.performanceRating.min) return false;
  }
  if (filter.tenure?.min !== undefined) {
    const months = Math.floor(
      (Date.now() - new Date(emp.dateOfJoining).getTime()) /
        (1000 * 60 * 60 * 24 * 30),
    );
    if (months < filter.tenure.min) return false;
  }
  return true;
}

function applyAction(currentFixed: number, action: ScenarioAction): number {
  switch (action.type) {
    case 'RAISE_PERCENT':
      return currentFixed * (1 + action.value / 100);
    case 'RAISE_FLAT':
      return currentFixed + action.value;
    default:
      return currentFixed;
  }
}

export const scenariosService = {
  getAll: async () => {
    return prisma.scenario.findMany({ orderBy: { createdAt: 'desc' } });
  },

  getById: async (id: string) => {
    return prisma.scenario.findUnique({ where: { id } });
  },

  create: async (data: {
    name: string;
    description?: string;
    rules: ScenarioRule[];
    createdById: string;
  }) => {
    return prisma.scenario.create({
      data: {
        name: data.name,
        description: data.description,
        rules: data.rules as any,
        createdById: data.createdById,
        status: 'DRAFT',
      },
    });
  },

  update: async (
    id: string,
    data: { name?: string; description?: string; rules?: ScenarioRule[] },
  ) => {
    return prisma.scenario.update({
      where: { id },
      data: { ...data, ...(data.rules && { rules: data.rules as any }) },
    });
  },

  delete: async (id: string) => {
    return prisma.scenario.delete({ where: { id } });
  },

  run: async (id: string) => {
    const scenario = await prisma.scenario.findUnique({ where: { id } });
    if (!scenario) throw new Error('Scenario not found');
    const rawRules = scenario.rules;
    const rules: ScenarioRule[] = Array.isArray(rawRules) ? rawRules as unknown as ScenarioRule[] : (rawRules ? [rawRules as unknown as ScenarioRule] : []);

    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE' },
      include: {
        performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 },
      },
    });

    const affected: any[] = [];
    let currentCost = 0;
    let projectedCost = 0;

    for (const emp of employees) {
      for (const rule of rules) {
        if (matchesFilter(emp, rule.filter)) {
          const currentFixed = Number(emp.annualFixed);
          const projected = applyAction(currentFixed, rule.action);
          currentCost += currentFixed;
          projectedCost += projected;
          affected.push({
            id: emp.id,
            name: `${emp.firstName} ${emp.lastName}`,
            band: emp.band,
            department: emp.department,
            currentFixed,
            projectedFixed: Math.round(projected),
            delta: Math.round(projected - currentFixed),
            deltaPercent: ((projected - currentFixed) / currentFixed) * 100,
          });
          break;
        }
      }
    }

    const result = {
      affectedCount: affected.length,
      totalEmployees: employees.length,
      currentCost: Math.round(currentCost),
      projectedCost: Math.round(projectedCost),
      delta: Math.round(projectedCost - currentCost),
      deltaPercent:
        currentCost > 0
          ? ((projectedCost - currentCost) / currentCost) * 100
          : 0,
      affectedEmployees: affected,
    };

    // Preserve the original snapshot from the first run; subsequent runs update cost/count only
    await prisma.scenario.update({
      where: { id },
      data: {
        totalCostImpact: result.delta,
        affectedEmployeeCount: affected.length,
        ...(scenario.snapshotData ? {} : { snapshotData: result as any }),
      },
    });
    return result;
  },

  apply: async (id: string) => {
    const scenario = await prisma.scenario.findUnique({ where: { id } });
    if (!scenario) throw new Error('Scenario not found');
    const rawRules2 = scenario.rules;
    const rules: ScenarioRule[] = Array.isArray(rawRules2) ? rawRules2 as unknown as ScenarioRule[] : (rawRules2 ? [rawRules2 as unknown as ScenarioRule] : []);

    const [employees, salaryBands] = await Promise.all([
      prisma.employee.findMany({
        where: { employmentStatus: 'ACTIVE' },
        include: {
          performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 },
        },
      }),
      prisma.salaryBand.findMany({ include: { band: true } }),
    ]);

    // Pre-build band → midpoint map for compaRatio recalculation
    const bandMidpoints: Record<string, number> = {};
    for (const sb of salaryBands) {
      if (!bandMidpoints[sb.band.code]) {
        bandMidpoints[sb.band.code] = Number(sb.midSalary);
      }
    }

    // Collect all updates first, then execute in a single transaction (N3 fix)
    const updates: { id: string; annualFixed: number; annualCtc: number; compaRatio?: number }[] = [];
    for (const emp of employees) {
      for (const rule of rules) {
        if (matchesFilter(emp, rule.filter)) {
          const oldFixed = Number(emp.annualFixed);
          const newFixed = Math.round(applyAction(oldFixed, rule.action));
          const ratio = oldFixed > 0 ? newFixed / oldFixed : 1;
          const newCtc = Math.round(Number(emp.annualCtc) * ratio);
          const mid = bandMidpoints[emp.band] ?? 0;
          const compaRatio = mid > 0 ? (newFixed / mid) * 100 : undefined;
          updates.push({ id: emp.id, annualFixed: newFixed, annualCtc: newCtc, compaRatio });
          break;
        }
      }
    }

    await prisma.$transaction([
      ...updates.map(u =>
        prisma.employee.update({
          where: { id: u.id },
          data: {
            annualFixed: u.annualFixed,
            annualCtc: u.annualCtc,
            ...(u.compaRatio !== undefined && { compaRatio: u.compaRatio }),
          },
        })
      ),
      prisma.scenario.update({ where: { id }, data: { status: 'APPLIED' } }),
    ]);
    const updatedCount = updates.length;

    // Bust all caches derived from employee compensation data
    await Promise.allSettled([
      cacheDelPattern('dashboard:*'),
      cacheDelPattern('pay-equity:*'),
      cacheDelPattern('salary-bands:*'),
      cacheDelPattern('performance:*'),
      cacheDelPattern('ai:*'),
      cacheDelPattern('ai_insights:*'),
    ]);

    // Notify all connected clients so modules re-fetch immediately
    emitEmployeeDataChanged();
    emitDashboardRefresh();

    return { applied: updatedCount };
  },

  analyzeRunResult: async (runResult: {
    affectedCount: number;
    totalEmployees: number;
    currentCost: number;
    projectedCost: number;
    delta: number;
    deltaPercent: number;
    affectedEmployees: { name: string; band: string; department: string; currentFixed: number; projectedFixed: number; delta: number }[];
    scenarioName?: string;
  }): Promise<string> => {
    const totalPayroll = await prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE' }, _sum: { annualFixed: true } });
    const currentTotalPayroll = Number(totalPayroll._sum.annualFixed || 0);

    // Compute by-band summary from affectedEmployees
    const byBand = runResult.affectedEmployees.reduce((acc: Record<string, { count: number; delta: number }>, e) => {
      if (!acc[e.band]) acc[e.band] = { count: 0, delta: 0 };
      acc[e.band].count++;
      acc[e.band].delta += e.delta;
      return acc;
    }, {});

    const topChanges = [...runResult.affectedEmployees]
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);

    const prompt = `You are CompSense AI, an expert in compensation strategy. Analyze this scenario simulation and give a direct executive recommendation.

Scenario: "${runResult.scenarioName || 'Compensation Scenario'}"
Total active workforce: ${runResult.totalEmployees} employees
Total annual payroll: ₹${(currentTotalPayroll / 10000000).toFixed(2)}Cr

Impact:
- Affected: ${runResult.affectedCount} employees (${((runResult.affectedCount / runResult.totalEmployees) * 100).toFixed(0)}% of workforce)
- Additional annual cost: +₹${(runResult.delta / 100000).toFixed(1)}L (${runResult.deltaPercent.toFixed(1)}% increase for this group)
- As % of total payroll: ${((runResult.delta / currentTotalPayroll) * 100).toFixed(2)}%

By band:
${Object.entries(byBand).sort((a,b) => b[1].delta - a[1].delta).map(([band, d]) => `- ${band}: ${d.count} employees, +₹${(d.delta / 100000).toFixed(1)}L`).join('\n')}

Top 5 largest individual changes:
${topChanges.map(e => `- ${e.name} (${e.band}, ${e.department}): ₹${(e.currentFixed/100000).toFixed(1)}L → ₹${(e.projectedFixed/100000).toFixed(1)}L (+${((e.delta/e.currentFixed)*100).toFixed(1)}%)`).join('\n')}

Provide a crisp recommendation:
1. **Should you apply this?** — Yes/No with 1-sentence rationale backed by numbers
2. **Key risk** — 1-2 bullet points
3. **Budget sustainability** — Can the company afford this?
4. **Alternative** — One lower-cost way to achieve the same goal

Keep it under 300 words. Be direct. Format with markdown headers.`;

    try {
      const result = await callClaude(prompt, { temperature: 0.3, maxTokens: 700 });
      return result.content;
    } catch {
      return `**Scenario Analysis**\n\nThis scenario affects ${runResult.affectedCount} of ${runResult.totalEmployees} employees with a total cost delta of +₹${(runResult.delta / 100000).toFixed(1)}L (${runResult.deltaPercent.toFixed(1)}% increase), representing ${((runResult.delta / currentTotalPayroll) * 100).toFixed(2)}% of total annual payroll.`;
    }
  },
};
