import { prisma } from '../lib/prisma';
import { callClaude } from '../lib/claudeClient';
import { cacheGet, cacheSet } from '../lib/redis';

export const performanceService = {
  getRatings: async (filters: Record<string, string> = {}) => {
    const where: any = {};
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.cycle) where.cycle = filters.cycle;
    const ratings = await prisma.performanceRating.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, band: true, department: true, compaRatio: true } },
      },
      orderBy: [{ cycle: 'desc' }, { rating: 'desc' }],
    });
    return ratings.map(r => ({
      ...r,
      rating: Number(r.rating),
      employee: { ...r.employee, compaRatio: Number(r.employee.compaRatio) },
    }));
  },

  createRating: async (data: { employeeId: string; cycle: string; rating: number; ratingLabel: string; reviewedBy: string }) => {
    return prisma.performanceRating.upsert({
      where: { employeeId_cycle: { employeeId: data.employeeId, cycle: data.cycle } },
      update: { rating: data.rating, ratingLabel: data.ratingLabel, reviewedBy: data.reviewedBy },
      create: data,
    });
  },

  getMatrix: async () => {
    // Use include only (no select at top level) to avoid Prisma's select+include conflict
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
      include: {
        performanceRatings: {
          orderBy: { cycle: 'desc' },
          take: 1,
        },
      },
    });
    return employees
      .filter(e => e.performanceRatings.length > 0)
      .map(e => ({
        id: e.id,
        name: `${e.firstName} ${e.lastName}`,
        band: e.band, department: e.department,
        annualCtc: Number(e.annualCtc),
        compaRatio: Number(e.compaRatio),
        rating: Number(e.performanceRatings[0].rating),
        ratingLabel: e.performanceRatings[0].ratingLabel,
        quadrant: getQuadrant(Number(e.performanceRatings[0].rating), Number(e.compaRatio)),
      }));
  },

  getPromotionReadiness: async () => {
    const employees = await prisma.employee.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        compaRatio: { gte: 90 },
        performanceRatings: { some: { rating: { gte: 4 } } },
      },
      include: { performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 } },
    });
    const bandOrder = ['A1', 'A2', 'P1', 'P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'];
    return employees
      .filter(e => bandOrder.indexOf(e.band) < bandOrder.length - 1)
      .map(e => ({
        id: e.id,
        name: `${e.firstName} ${e.lastName}`,
        band: e.band, nextBand: bandOrder[bandOrder.indexOf(e.band) + 1],
        department: e.department,
        rating: Number(e.performanceRatings[0]?.rating || 0),
        ratingLabel: e.performanceRatings[0]?.ratingLabel || '',
        compaRatio: Number(e.compaRatio),
        annualFixed: Number(e.annualFixed),
        tenureMonths: Math.floor((Date.now() - new Date(e.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24 * 30)),
      }))
      .sort((a, b) => b.rating - a.rating);
  },

  getPayAlignmentGaps: async () => {
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
      include: { performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 } },
    });
    const stars = employees.filter(e => {
      const r = Number(e.performanceRatings[0]?.rating || 0);
      const cr = Number(e.compaRatio);
      return r >= 4 && cr < 90;
    }).map(e => ({
      id: e.id, name: `${e.firstName} ${e.lastName}`,
      band: e.band, department: e.department,
      rating: Number(e.performanceRatings[0]?.rating),
      compaRatio: Number(e.compaRatio),
      annualFixed: Number(e.annualFixed),
      issue: 'High performer, below market',
    }));
    const under = employees.filter(e => {
      const r = Number(e.performanceRatings[0]?.rating || 0);
      const cr = Number(e.compaRatio);
      return r < 3 && cr >= 100;
    }).map(e => ({
      id: e.id, name: `${e.firstName} ${e.lastName}`,
      band: e.band, department: e.department,
      rating: Number(e.performanceRatings[0]?.rating || 0),
      compaRatio: Number(e.compaRatio),
      annualFixed: Number(e.annualFixed),
      issue: 'Low performer, above market',
    }));
    return { stars, under, summary: { starCount: stars.length, underCount: under.length } };
  },

  getCycles: async () => {
    const cycles = await prisma.performanceRating.findMany({
      select: { cycle: true },
      distinct: ['cycle'],
      orderBy: { cycle: 'desc' },
    });
    return cycles.map(c => c.cycle);
  },

  analyzeWithAI: async (): Promise<string> => {
    const cached = await cacheGet<string>('performance:ai-analysis');
    if (cached) return cached;

    const [matrix, promotionReady, gaps, totalActive] = await Promise.all([
      prisma.employee.findMany({
        where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
        include: { performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 } },
      }),
      prisma.employee.count({
        where: { employmentStatus: 'ACTIVE', compaRatio: { gte: 90 }, performanceRatings: { some: { rating: { gte: 4 } } } },
      }),
      prisma.employee.findMany({
        where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
        include: { performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 } },
      }),
      prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
    ]);

    const withRatings = matrix.filter(e => e.performanceRatings.length > 0);
    const quadrants = withRatings.reduce((acc: Record<string, number>, e) => {
      const q = getQuadrant(Number(e.performanceRatings[0].rating), Number(e.compaRatio));
      acc[q] = (acc[q] || 0) + 1;
      return acc;
    }, {});

    const stars = gaps.filter(e => Number(e.performanceRatings[0]?.rating || 0) >= 4 && Number(e.compaRatio) < 90);
    const under = gaps.filter(e => Number(e.performanceRatings[0]?.rating || 0) < 3 && Number(e.compaRatio) >= 100);

    const avgRating = withRatings.length > 0
      ? (withRatings.reduce((s, e) => s + Number(e.performanceRatings[0].rating), 0) / withRatings.length).toFixed(2)
      : '0';

    const byDept = withRatings.reduce((acc: Record<string, number[]>, e) => {
      const dept = e.department;
      if (!acc[dept]) acc[dept] = [];
      acc[dept].push(Number(e.performanceRatings[0].rating));
      return acc;
    }, {});

    const prompt = `You are CompSense AI, an expert in HR performance management. Analyze the following performance data and provide a concise, data-driven executive analysis.

Company: ${totalActive} active employees | ${withRatings.length} with performance ratings
Average rating: ${avgRating}/5

Performance quadrant breakdown:
- STAR (high performer, below market pay): ${quadrants['STAR'] || 0} employees — retention risk
- SOLID (high performer, fair pay): ${quadrants['SOLID'] || 0} employees — keep investing
- UNDER (low performer, above market): ${quadrants['UNDER'] || 0} employees — action needed
- AVERAGE: ${quadrants['AVERAGE'] || 0} employees

Promotion-ready employees: ${promotionReady} (compa-ratio ≥90%, rating ≥4)
Pay alignment gaps: ${stars.length} stars underpaid, ${under.length} underperformers overpaid

Department average ratings:
${Object.entries(byDept).map(([dept, ratings]) => `- ${dept}: ${(ratings.reduce((s,r) => s+r, 0)/ratings.length).toFixed(1)}/5 avg (${ratings.length} employees)`).join('\n')}

Provide:
1. A 2-paragraph executive summary of performance health across the organization
2. Top 3 immediate actions: who needs raises (stars), PIPs (underperformers), and promotions
3. Department-level insights — which departments need attention
4. Strategic recommendation for the next review cycle

Format with clear markdown headers. Be specific with numbers and names of departments.`;

    try {
      const result = await callClaude(prompt, { temperature: 0.4, maxTokens: 1200 });
      await cacheSet('performance:ai-analysis', result.content, 1800);
      return result.content;
    } catch {
      return `**Performance Overview**\n\n${withRatings.length} employees rated. Quadrant: ${quadrants['STAR'] || 0} Stars, ${quadrants['SOLID'] || 0} Solid, ${quadrants['UNDER'] || 0} Under, ${quadrants['AVERAGE'] || 0} Average. ${promotionReady} promotion-ready. ${stars.length} high performers underpaid.`;
    }
  },
};

function getQuadrant(rating: number, compaRatio: number): string {
  if (rating >= 4 && compaRatio < 90) return 'STAR';
  if (rating >= 4 && compaRatio >= 90) return 'SOLID';
  if (rating < 3 && compaRatio >= 100) return 'UNDER';
  return 'AVERAGE';
}
