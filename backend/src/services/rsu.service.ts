import { prisma } from '../lib/prisma';
import { callClaude } from '../lib/claudeClient';
import { cacheGet, cacheSet } from '../lib/redis';

// Band 1: A1, A2 | Band 2: P1, P2 | Band 3: P3 | Band 4: M1, M2 | Band 5: D0, D1, D2
const BAND_ORDER = ['A1', 'A2', 'P1', 'P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'];

function generateVestingEvents(grantId: string, grantDate: Date, totalUnits: number) {
  return [12, 24, 36, 48].map(months => {
    const vestingDate = new Date(grantDate);
    vestingDate.setMonth(vestingDate.getMonth() + months);
    return { rsuGrantId: grantId, vestingDate, unitsVesting: Math.floor(totalUnits * 0.25), isVested: false };
  });
}

export const rsuService = {
  getGrants: async (filters: Record<string, string> = {}) => {
    const where: any = { employee: { employmentStatus: 'ACTIVE' } };
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.status) where.status = filters.status;
    const grants = await prisma.rsuGrant.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, department: true, band: true } },
        vestingEvents: { orderBy: { vestingDate: 'asc' } },
      },
      orderBy: { grantDate: 'desc' },
    });
    return grants.map(g => ({
      ...g,
      totalUnits: Number(g.totalUnits),
      vestedUnits: Number(g.vestedUnits),
      priceAtGrant: Number(g.priceAtGrant),
      currentPrice: Number(g.currentPrice),
      currentValue: Number(g.currentPrice) * Number(g.vestedUnits),
    }));
  },

  createGrant: async (data: {
    employeeId: string; grantDate: string; totalUnits: number;
    priceAtGrant: number; currentPrice: number;
  }) => {
    const employee = await prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new Error('Employee not found');
    const bandIdx = BAND_ORDER.indexOf(employee.band);
    if (bandIdx < BAND_ORDER.indexOf('P2')) {
      throw Object.assign(new Error('Employee band not eligible for RSU'), { statusCode: 400 });
    }

    const grantDate = new Date(data.grantDate);
    const grant = await prisma.rsuGrant.create({
      data: {
        employeeId: data.employeeId,
        grantDate,
        totalUnits: data.totalUnits,
        vestedUnits: 0,
        vestingScheduleMonths: 48,
        cliffMonths: 12,
        vestingPercent: 25,
        priceAtGrant: data.priceAtGrant,
        currentPrice: data.currentPrice,
        status: 'ACTIVE',
      },
    });
    const events = generateVestingEvents(grant.id, grantDate, data.totalUnits);
    await prisma.rsuVestingEvent.createMany({ data: events });
    return prisma.rsuGrant.findUnique({ where: { id: grant.id }, include: { vestingEvents: true } });
  },

  getVestingSchedule: async () => {
    const upcoming = await prisma.rsuVestingEvent.findMany({
      where: { isVested: false, vestingDate: { gte: new Date() } },
      include: {
        rsuGrant: {
          include: { employee: { select: { id: true, firstName: true, lastName: true, department: true } } },
        },
      },
      orderBy: { vestingDate: 'asc' },
      take: 50,
    });
    return upcoming.map(e => ({
      ...e,
      unitsVesting: Number(e.unitsVesting),
      estimatedValue: Number(e.unitsVesting) * Number(e.rsuGrant.currentPrice),
    }));
  },

  getEligibilityGap: async () => {
    const eligible = await prisma.employee.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        band: { in: ['P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'] },
      },
      select: {
        id: true, firstName: true, lastName: true,
        band: true, department: true, annualFixed: true, dateOfJoining: true,
        rsuGrants: { where: { status: 'ACTIVE' }, select: { id: true } },
      },
    });
    const tenureThreshold = new Date();
    tenureThreshold.setMonth(tenureThreshold.getMonth() - 12);
    return eligible
      .filter(e => e.rsuGrants.length === 0 && new Date(e.dateOfJoining) <= tenureThreshold)
      .map(e => ({
        id: e.id,
        name: `${e.firstName} ${e.lastName}`,
        band: e.band, department: e.department,
        annualFixed: Number(e.annualFixed),
        suggestedGrantValue: Number(e.annualFixed) * 0.5,
        tenureMonths: Math.floor((Date.now() - new Date(e.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24 * 30)),
      }));
  },

  processVesting: async () => {
    const due = await prisma.rsuVestingEvent.findMany({
      where: { isVested: false, vestingDate: { lte: new Date() } },
      include: { rsuGrant: true },
    });
    for (const event of due) {
      await prisma.$transaction([
        prisma.rsuVestingEvent.update({ where: { id: event.id }, data: { isVested: true, vestedAt: new Date() } }),
        prisma.rsuGrant.update({ where: { id: event.rsuGrantId }, data: { vestedUnits: { increment: Number(event.unitsVesting) } } }),
      ]);
    }
    return due.length;
  },

  getSummary: async () => {
    const grants = await prisma.rsuGrant.findMany({
      where: { status: 'ACTIVE' },
      select: { totalUnits: true, vestedUnits: true, currentPrice: true },
    });
    const totalValue = grants.reduce((s, g) => s + Number(g.totalUnits) * Number(g.currentPrice), 0);
    const vestedValue = grants.reduce((s, g) => s + Number(g.vestedUnits) * Number(g.currentPrice), 0);
    return { totalGrants: grants.length, totalValue, vestedValue, unvestedValue: totalValue - vestedValue };
  },

  analyzeWithAI: async (): Promise<string> => {
    const cached = await cacheGet<string>('rsu:ai-analysis');
    if (cached) return cached;

    const [grants, upcomingVesting, totalEmployees] = await Promise.all([
      prisma.rsuGrant.findMany({
        where: { status: 'ACTIVE' },
        include: {
          employee: { select: { firstName: true, lastName: true, band: true, department: true } },
          vestingEvents: { orderBy: { vestingDate: 'asc' } },
        },
      }),
      prisma.rsuVestingEvent.findMany({
        where: { isVested: false, vestingDate: { gte: new Date(), lte: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) } },
        include: { rsuGrant: { select: { currentPrice: true } } },
      }),
      prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
    ]);

    const totalValue = grants.reduce((s, g) => s + Number(g.totalUnits) * Number(g.currentPrice), 0);
    const vestedValue = grants.reduce((s, g) => s + Number(g.vestedUnits) * Number(g.currentPrice), 0);
    const unvestedValue = totalValue - vestedValue;
    const avgVestPct = grants.length > 0
      ? (grants.reduce((s, g) => s + (Number(g.vestedUnits) / Number(g.totalUnits)) * 100, 0) / grants.length).toFixed(1)
      : '0';

    const byBand = grants.reduce((acc: Record<string, { count: number; totalValue: number }>, g) => {
      const band = g.employee.band;
      if (!acc[band]) acc[band] = { count: 0, totalValue: 0 };
      acc[band].count++;
      acc[band].totalValue += Number(g.totalUnits) * Number(g.currentPrice);
      return acc;
    }, {});

    const byDept = grants.reduce((acc: Record<string, number>, g) => {
      const dept = g.employee.department;
      acc[dept] = (acc[dept] || 0) + Number(g.totalUnits) * Number(g.currentPrice);
      return acc;
    }, {});

    const upcomingValue = upcomingVesting.reduce((s, e) => s + Number(e.unitsVesting) * Number(e.rsuGrant.currentPrice), 0);

    const prompt = `You are CompSense AI, an expert in equity compensation strategy. Analyze the following RSU (Restricted Stock Unit) data and provide a concise, data-driven executive analysis.

Company size: ${totalEmployees} active employees
Total RSU grant holders: ${grants.length} employees
Total RSU portfolio value: ₹${(totalValue / 100000).toFixed(1)}L
Vested value: ₹${(vestedValue / 100000).toFixed(1)}L
Unvested (retention) value: ₹${(unvestedValue / 100000).toFixed(1)}L
Average vesting progress: ${avgVestPct}%
Upcoming vesting (next 6 months): ₹${(upcomingValue / 100000).toFixed(1)}L

By band:
${Object.entries(byBand).map(([band, d]) => `- ${band}: ${d.count} grants, ₹${(d.totalValue / 100000).toFixed(1)}L total value`).join('\n')}

By department (top departments by value):
${Object.entries(byDept).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([dept, val]) => `- ${dept}: ₹${(val / 100000).toFixed(1)}L`).join('\n')}

Provide:
1. A 2-paragraph executive summary of RSU program health and retention effectiveness
2. Key risks: employees approaching full vest (flight risk), concentration in departments
3. Top 3 actionable recommendations to optimize the equity program
4. Budget impact of upcoming 6-month vestings

Format with clear markdown headers. Be specific with rupee amounts and percentages.`;

    try {
      const result = await callClaude(prompt, { temperature: 0.4, maxTokens: 1200 });
      await cacheSet('rsu:ai-analysis', result.content, 1800);
      return result.content;
    } catch {
      return `**RSU Program Overview**\n\n${grants.length} active RSU grants across ${totalEmployees} employees. Total portfolio value: ₹${(totalValue / 100000).toFixed(1)}L. Vested: ₹${(vestedValue / 100000).toFixed(1)}L. Unvested retention value: ₹${(unvestedValue / 100000).toFixed(1)}L.`;
    }
  },
};
