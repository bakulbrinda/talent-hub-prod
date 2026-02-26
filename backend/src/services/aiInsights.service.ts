import { prisma } from '../lib/prisma';
import { callClaude } from '../lib/claudeClient';
import { cacheGet, cacheSet } from '../lib/redis';
import { BAND_ORDER } from '../types/index';
import crypto from 'crypto';

const INSIGHT_TTL = 6 * 60 * 60; // 6 hours

const SYSTEM_PROMPT = `You are CompSense AI, an expert HR compensation analyst with deep expertise in pay equity, market benchmarking, and total rewards strategy. You analyze HR data and provide clear, actionable insights for HR leaders. Keep responses concise, data-driven, and executive-ready. Use specific numbers from the data provided. Format with clear sections using markdown.`;

function buildPrompt(insightType: string, data: any): string {
  const prompts: Record<string, (d: any) => string> = {
    PAY_EQUITY_SCORE: (d) => `Analyze this pay equity data for a ${d.totalEmployees}-person company and provide a 3-paragraph narrative with 5 specific recommendations.

Pay Equity Score: ${d.score}/100
Gender Pay Gap: ${d.gapPercent.toFixed(1)}% (Male avg: ₹${(d.maleAvg/100000).toFixed(1)}L, Female avg: ₹${(d.femaleAvg/100000).toFixed(1)}L)
Employees outside salary bands: ${d.outlierCount} (${((d.outlierCount/d.totalEmployees)*100).toFixed(1)}%)
Top 3 departments by gap: ${d.topDepts.map((d: any) => `${d.department} (${d.gapPercent.toFixed(1)}%)`).join(', ')}

Paragraph 1: Overall pay equity assessment
Paragraph 2: Root causes and risk areas
Paragraph 3: Priority actions

Then list exactly 5 numbered recommendations.`,

    ATTRITION_RISK: (d) => `Analyze attrition risk for ${d.belowBandCount} employees below salary band (compa-ratio <80%) out of ${d.totalEmployees} total employees.

Below-band employees by department: ${JSON.stringify(d.byDept)}
Average tenure of below-band employees: ${d.avgTenure} months
High performers below band: ${d.highPerfBelowBand}

Provide: 1) Risk assessment paragraph, 2) Top 5 at-risk employee profiles (anonymized), 3) Retention action plan with 4 specific steps.`,

    COMPA_RATIO_DISTRIBUTION: (d) => `Analyze this compa-ratio distribution for ${d.totalEmployees} employees:

${d.distribution.map((b: any) => `${b.label}: ${b.count} employees`).join('\n')}
Average compa-ratio: ${d.avgCompaRatio.toFixed(1)}%
Employees in healthy range (80-120%): ${d.inRangeCount} (${d.inRangePct.toFixed(1)}%)

Write a 2-paragraph analysis of what this distribution tells us about our compensation strategy, and 3 recommendations.`,

    TOP_SALARIES: (d) => `Review the top compensation packages in this organization:

Top 10 CTCs: ${d.topEmployees.map((e: any) => `${e.name} (${e.band}, ${e.department}): ₹${(e.annualCtc/100000).toFixed(1)}L CTC, performance: ${e.lastRating || 'N/A'}`).join('\n')}

Provide a bi-annual compensation review analysis covering: market competitiveness, performance alignment, and retention risk for top earners.`,

    NEW_HIRE_PARITY: (d) => `Analyze new hire pay parity issues:

${d.issues.map((i: any) => `${i.department} Band ${i.band}: New hire avg ₹${(i.newHireAvg/100000).toFixed(1)}L vs existing ₹${(i.existingAvg/100000).toFixed(1)}L (${i.parityPercent.toFixed(0)}% parity)`).join('\n')}

Write: 1) Assessment of internal equity risks, 2) Impact on existing employee morale, 3) Recommended corrective actions.`,

    SALARY_GROWTH_TREND: (d) => `Analyze salary growth trends across 4 revision cycles:

${d.cycles.map((c: any) => `${c.label}: Avg ₹${(c.avg/100000).toFixed(1)}L, Median ₹${(c.median/100000).toFixed(1)}L`).join('\n')}
Overall growth: ${d.growthPercent.toFixed(1)}% over the period

Write a trend narrative covering: YoY growth rate, distribution shifts, and forecast for next cycle.`,

    PROMOTION_READINESS: (d) => `Identify promotion-ready employees based on this data:

${d.readyEmployees.slice(0, 10).map((e: any) => `${e.name} (${e.band}→${e.nextBand}): Rating ${e.rating}, Compa-ratio ${e.compaRatio.toFixed(0)}%, Tenure ${e.tenureMonths}mo`).join('\n')}
Total promotion-ready: ${d.totalReady} employees

Write a promotion readiness report with: 1) Summary of pipeline health, 2) Top 5 recommended promotions with justification, 3) Band-specific readiness gaps.`,
  };

  const fn = prompts[insightType];
  if (!fn) return `Analyze this HR compensation data and provide key insights:\n${JSON.stringify(data, null, 2)}`;
  return fn(data);
}

async function buildInsightData(insightType: string): Promise<any> {
  switch (insightType) {
    case 'PAY_EQUITY_SCORE': {
      const [employees, genderGroups] = await Promise.all([
        prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
        prisma.employee.groupBy({
          by: ['gender'],
          where: { employmentStatus: 'ACTIVE' },
          _avg: { annualFixed: true },
        }),
      ]);
      const outliers = await prisma.employee.count({
        where: { employmentStatus: 'ACTIVE', OR: [{ compaRatio: { lt: 80 } }, { compaRatio: { gt: 120 } }] },
      });
      const deptGaps = await prisma.employee.groupBy({
        by: ['department', 'gender'],
        where: { employmentStatus: 'ACTIVE' },
        _avg: { annualFixed: true },
        _count: true,
      });
      const deptMap: Record<string, { male: number; female: number }> = {};
      for (const r of deptGaps) {
        if (!deptMap[r.department]) deptMap[r.department] = { male: 0, female: 0 };
        if (r.gender === 'MALE') deptMap[r.department].male = Number(r._avg.annualFixed);
        if (r.gender === 'FEMALE') deptMap[r.department].female = Number(r._avg.annualFixed);
      }
      const topDepts = Object.entries(deptMap)
        .map(([dept, v]) => ({ department: dept, gapPercent: v.male > 0 ? ((v.male - v.female) / v.male) * 100 : 0 }))
        .sort((a, b) => Math.abs(b.gapPercent) - Math.abs(a.gapPercent))
        .slice(0, 3);
      const maleRow = genderGroups.find(r => r.gender === 'MALE');
      const femaleRow = genderGroups.find(r => r.gender === 'FEMALE');
      const maleAvg = Number(maleRow?._avg.annualFixed) || 0;
      const femaleAvg = Number(femaleRow?._avg.annualFixed) || 0;
      const gapPercent = maleAvg > 0 ? ((maleAvg - femaleAvg) / maleAvg) * 100 : 0;
      const gapScore = Math.max(0, 100 - Math.abs(gapPercent) * 5);
      const outlierScore = employees > 0 ? Math.max(0, 100 - (outliers / employees) * 200) : 50;
      const score = Math.round(gapScore * 0.5 + outlierScore * 0.5);
      return { totalEmployees: employees, score, gapPercent: Math.abs(gapPercent), maleAvg, femaleAvg, outlierCount: outliers, topDepts };
    }
    case 'ATTRITION_RISK': {
      const [total, belowBand, highPerfBelow] = await Promise.all([
        prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
        prisma.employee.findMany({
          where: { employmentStatus: 'ACTIVE', compaRatio: { lt: 80 } },
          select: { department: true, dateOfJoining: true },
        }),
        prisma.employee.count({
          where: {
            employmentStatus: 'ACTIVE', compaRatio: { lt: 80 },
            performanceRatings: { some: { rating: { gte: 4 } } },
          },
        }),
      ]);
      const byDept: Record<string, number> = {};
      const now = new Date();
      let totalTenure = 0;
      for (const e of belowBand) {
        byDept[e.department] = (byDept[e.department] || 0) + 1;
        totalTenure += Math.floor((now.getTime() - new Date(e.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24 * 30));
      }
      return {
        totalEmployees: total, belowBandCount: belowBand.length,
        byDept, avgTenure: belowBand.length > 0 ? Math.round(totalTenure / belowBand.length) : 0,
        highPerfBelowBand: highPerfBelow,
      };
    }
    case 'COMPA_RATIO_DISTRIBUTION': {
      const employees = await prisma.employee.findMany({
        where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
        select: { compaRatio: true },
      });
      const bins = [
        { label: '<70%', min: 0, max: 70 }, { label: '70-80%', min: 70, max: 80 },
        { label: '80-90%', min: 80, max: 90 }, { label: '90-100%', min: 90, max: 100 },
        { label: '100-110%', min: 100, max: 110 }, { label: '110-120%', min: 110, max: 120 },
        { label: '>120%', min: 120, max: Infinity },
      ];
      const distribution = bins.map(b => ({
        label: b.label,
        count: employees.filter(e => { const cr = Number(e.compaRatio); return cr >= b.min && cr < b.max; }).length,
      }));
      const allCR = employees.map(e => Number(e.compaRatio));
      const avgCompaRatio = allCR.length > 0 ? allCR.reduce((a, b) => a + b, 0) / allCR.length : 0;
      const inRange = distribution.filter(b => ['80-90%','90-100%','100-110%','110-120%'].includes(b.label)).reduce((s,b) => s + b.count, 0);
      return { totalEmployees: employees.length, distribution, avgCompaRatio, inRangeCount: inRange, inRangePct: employees.length > 0 ? (inRange / employees.length) * 100 : 0 };
    }
    case 'TOP_SALARIES': {
      const topEmps = await prisma.employee.findMany({
        where: { employmentStatus: 'ACTIVE' },
        orderBy: { annualCtc: 'desc' },
        take: 10,
        include: { performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 } },
      });
      return {
        topEmployees: topEmps.map(e => ({
          name: `${e.firstName} ${e.lastName}`,
          band: e.band, department: e.department,
          annualCtc: Number(e.annualCtc),
          annualFixed: Number(e.annualFixed),
          lastRating: e.performanceRatings[0]?.rating ? Number(e.performanceRatings[0].rating) : null,
        })),
      };
    }
    case 'NEW_HIRE_PARITY': {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const [newHires, existing] = await Promise.all([
        prisma.employee.groupBy({ by: ['department', 'band'], where: { employmentStatus: 'ACTIVE', dateOfJoining: { gte: sixMonthsAgo } }, _avg: { annualFixed: true }, _count: true }),
        prisma.employee.groupBy({ by: ['department', 'band'], where: { employmentStatus: 'ACTIVE', dateOfJoining: { lt: sixMonthsAgo } }, _avg: { annualFixed: true }, _count: true }),
      ]);
      const exMap = new Map(existing.map(e => [`${e.department}:${e.band}`, e]));
      const issues = newHires.filter(nh => exMap.has(`${nh.department}:${nh.band}`)).map(nh => {
        const ex = exMap.get(`${nh.department}:${nh.band}`)!;
        const na = Number(nh._avg.annualFixed), ea = Number(ex._avg.annualFixed);
        return { department: nh.department, band: nh.band, newHireAvg: na, existingAvg: ea, parityPercent: ea > 0 ? (na/ea)*100 : 100, newHireCount: nh._count, existingCount: ex._count };
      });
      return { issues };
    }
    case 'SALARY_GROWTH_TREND': {
      const employees = await prisma.employee.findMany({
        where: { employmentStatus: 'ACTIVE' },
        select: { april2023: true, july2023: true, april2024: true, july2024: true, annualFixed: true },
      });
      const cycles = [
        { key: 'april2023', label: 'Apr 2023' }, { key: 'july2023', label: 'Jul 2023' },
        { key: 'april2024', label: 'Apr 2024' }, { key: 'july2024', label: 'Jul 2024' },
      ];
      const result = cycles.map(({ key, label }) => {
        const vals = employees.map(e => Number((e as any)[key])).filter(v => v > 0);
        const avg = vals.length > 0 ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
        const sorted = [...vals].sort((a,b) => a-b);
        return { label, avg, median: sorted[Math.floor(sorted.length/2)] || 0, count: vals.length };
      });
      const firstAvg = result[0].avg; const lastAvg = result[result.length-1].avg;
      return { cycles: result, growthPercent: firstAvg > 0 ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0 };
    }
    case 'PROMOTION_READINESS': {
      const readyEmps = await prisma.employee.findMany({
        where: {
          employmentStatus: 'ACTIVE',
          compaRatio: { gte: 90 },
          performanceRatings: { some: { rating: { gte: 4 } } },
        },
        include: { performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 } },
        take: 20,
      });
      return {
        totalReady: readyEmps.length,
        readyEmployees: readyEmps.map(e => ({
          name: `${e.firstName} ${e.lastName}`,
          band: e.band, nextBand: BAND_ORDER[BAND_ORDER.indexOf(e.band as typeof BAND_ORDER[number]) + 1] || 'P4+',
          rating: Number(e.performanceRatings[0]?.rating || 0),
          compaRatio: Number(e.compaRatio || 0),
          tenureMonths: Math.floor((new Date().getTime() - new Date(e.dateOfJoining).getTime()) / (1000*60*60*24*30)),
        })),
      };
    }
    default:
      return { message: `Data for ${insightType}` };
  }
}

export const aiInsightsService = {
  getAll: async (insightType?: string, page = 1, limit = 10) => {
    const [insights, total] = await Promise.all([
      prisma.aiInsight.findMany({
        where: {
          ...(insightType && { insightType }),
          expiresAt: { gt: new Date() },
        },
        orderBy: { generatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.aiInsight.count({
        where: {
          ...(insightType && { insightType }),
          expiresAt: { gt: new Date() },
        },
      }),
    ]);
    return { data: insights, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  },

  getOrGenerate: async (insightType: string, filters?: Record<string, string>) => {
    const filtersHash = filters ? crypto.createHash('md5').update(JSON.stringify(filters)).digest('hex') : 'default';

    // Check cache in DB
    const existing = await prisma.aiInsight.findFirst({
      where: { insightType, expiresAt: { gt: new Date() } },
      orderBy: { generatedAt: 'desc' },
    });
    if (existing) return existing;

    // Build data and generate
    const data = await buildInsightData(insightType);
    const prompt = buildPrompt(insightType, data);
    const result = await callClaude(prompt, { temperature: 0.4, maxTokens: 1500, system: SYSTEM_PROMPT });

    // Extract title from response or use default
    const titleMap: Record<string, string> = {
      PAY_EQUITY_SCORE: 'Pay Equity Analysis',
      ATTRITION_RISK: 'Attrition Risk Assessment',
      COMPA_RATIO_DISTRIBUTION: 'Compa-Ratio Distribution Analysis',
      TOP_SALARIES: 'Top Compensation Review',
      NEW_HIRE_PARITY: 'New Hire Pay Parity Analysis',
      SALARY_GROWTH_TREND: 'Salary Growth Trend Analysis',
      PROMOTION_READINESS: 'Promotion Readiness Report',
    };

    const expires = new Date();
    expires.setHours(expires.getHours() + 6);

    return prisma.aiInsight.create({
      data: {
        insightType,
        title: titleMap[insightType] || insightType,
        narrative: result.content,
        data: data as any,
        filters: (filters || {}) as any,
        generatedAt: new Date(),
        expiresAt: expires,
        model: result.model,
        promptTokens: result.inputTokens,
        completionTokens: result.outputTokens,
      },
    });
  },

  invalidate: async (id: string) => {
    await prisma.aiInsight.update({ where: { id }, data: { expiresAt: new Date() } });
  },

  getDashboardSummary: async () => {
    // Try to get a cached executive summary
    const cached = await cacheGet<string>('ai:dashboard-summary');
    if (cached) return cached;

    const [kpis, equityScore] = await Promise.all([
      prisma.employee.aggregate({
        where: { employmentStatus: 'ACTIVE' },
        _count: true,
        _avg: { compaRatio: true, annualFixed: true },
      }),
      prisma.employee.count({ where: { employmentStatus: 'ACTIVE', OR: [{ compaRatio: { lt: 80 } }, { compaRatio: { gt: 120 } }] } }),
    ]);

    const prompt = `You are CompSense AI. Write a 2-sentence executive summary of this HR compensation snapshot for a company dashboard. Be specific with numbers. No markdown.

Total employees: ${kpis._count}
Average compa-ratio: ${Number(kpis._avg.compaRatio || 0).toFixed(1)}%
Average annual fixed: ₹${(Number(kpis._avg.annualFixed || 0)/100000).toFixed(1)}L
Employees outside salary bands: ${equityScore}`;

    try {
      const r = await callClaude(prompt, { temperature: 0.3, maxTokens: 150 });
      await cacheSet('ai:dashboard-summary', r.content, 1800); // 30 min cache
      return r.content;
    } catch (err) {
      return `${kpis._count} active employees with an average compa-ratio of ${Number(kpis._avg.compaRatio || 0).toFixed(1)}%. ${equityScore} employees are outside their salary bands and require attention.`;
    }
  },
};
