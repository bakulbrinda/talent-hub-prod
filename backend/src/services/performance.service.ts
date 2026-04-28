import { prisma } from '../lib/prisma';
import { callClaude } from '../lib/claudeClient';
import { cacheGet, cacheSet, cacheDel } from '../lib/redis';
import { BAND_ORDER } from '../types/index';
import { getAiInferredPerformance } from './aiPerformanceInference';

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
    const result = await prisma.performanceRating.upsert({
      where: { employeeId_cycle: { employeeId: data.employeeId, cycle: data.cycle } },
      update: { rating: data.rating, ratingLabel: data.ratingLabel, reviewedBy: data.reviewedBy },
      create: data,
    });
    await Promise.allSettled([
      cacheDel('performance:ai-analysis'),
      cacheDel('performance:ai-inferred'),
      cacheDel('dashboard:action-required'),
      cacheDel('dashboard:comp-vs-perf'),
    ]);
    return result;
  },

  getMatrix: async () => {
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
      include: {
        performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 },
      },
    });

    const withRealRatings = employees.filter(e => e.performanceRatings.length > 0);

    // If real ratings exist, use them
    if (withRealRatings.length > 0) {
      return withRealRatings.map(e => ({
        id: e.id,
        name: `${e.firstName} ${e.lastName}`,
        band: e.band, department: e.department,
        annualCtc: Number(e.annualCtc),
        compaRatio: Number(e.compaRatio),
        rating: Number(e.performanceRatings[0].rating),
        ratingLabel: e.performanceRatings[0].ratingLabel,
        quadrant: getQuadrant(Number(e.performanceRatings[0].rating), Number(e.compaRatio)),
      }));
    }

    // No real ratings — use AI-inferred tiers
    const inferred = await getAiInferredPerformance();
    if (inferred.size === 0) return [];

    return employees
      .filter(e => inferred.has(e.id))
      .map(e => {
        const tier = inferred.get(e.id)!;
        return {
          id: e.id,
          name: `${e.firstName} ${e.lastName}`,
          band: e.band, department: e.department,
          annualCtc: Number(e.annualCtc),
          compaRatio: Number(e.compaRatio),
          rating: tier.rating,
          ratingLabel: tier.ratingLabel,
          quadrant: getQuadrant(tier.rating, Number(e.compaRatio)),
        };
      });
  },

  getPromotionReadiness: async () => {
    const employees = await prisma.employee.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        compaRatio: { gte: 90 },
      },
      include: { performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 } },
    });

    const hasRealRatings = employees.some(e => e.performanceRatings.length > 0);
    let ratingMap: Map<string, { rating: number; ratingLabel: string }>;

    if (hasRealRatings) {
      ratingMap = new Map(
        employees
          .filter(e => e.performanceRatings.length > 0)
          .map(e => [e.id, { rating: Number(e.performanceRatings[0].rating), ratingLabel: e.performanceRatings[0].ratingLabel ?? 'Meets Expectations' }])
      );
    } else {
      ratingMap = await getAiInferredPerformance();
    }

    return employees
      .filter(e => {
        const tier = ratingMap.get(e.id);
        return tier && tier.rating >= 4 && BAND_ORDER.indexOf(e.band as typeof BAND_ORDER[number]) < BAND_ORDER.length - 1;
      })
      .map(e => {
        const tier = ratingMap.get(e.id)!;
        const bandIdx = BAND_ORDER.indexOf(e.band as typeof BAND_ORDER[number]);
        return {
          id: e.id,
          name: `${e.firstName} ${e.lastName}`,
          band: e.band,
          nextBand: BAND_ORDER[bandIdx + 1],
          department: e.department,
          rating: tier.rating,
          ratingLabel: tier.ratingLabel,
          compaRatio: Number(e.compaRatio),
          annualFixed: Number(e.annualFixed),
          tenureMonths: Math.floor((Date.now() - new Date(e.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24 * 30)),
        };
      })
      .sort((a, b) => b.rating - a.rating);
  },

  getPayAlignmentGaps: async () => {
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
      include: { performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 } },
    });

    const hasRealRatings = employees.some(e => e.performanceRatings.length > 0);
    let ratingMap: Map<string, { rating: number; ratingLabel: string }>;

    if (hasRealRatings) {
      ratingMap = new Map(
        employees
          .filter(e => e.performanceRatings.length > 0)
          .map(e => [e.id, { rating: Number(e.performanceRatings[0].rating), ratingLabel: e.performanceRatings[0].ratingLabel ?? 'Meets Expectations' }])
      );
    } else {
      ratingMap = await getAiInferredPerformance();
    }

    const getRating = (id: string) => ratingMap.get(id)?.rating ?? 0;

    const stars = employees.filter(e => getRating(e.id) >= 4 && Number(e.compaRatio) < 95).map(e => ({
      id: e.id, name: `${e.firstName} ${e.lastName}`,
      band: e.band, department: e.department,
      rating: getRating(e.id),
      compaRatio: Number(e.compaRatio),
      annualFixed: Number(e.annualFixed),
      issue: 'High performer, below market',
    }));

    const under = employees.filter(e => getRating(e.id) < 3 && Number(e.compaRatio) >= 100).map(e => ({
      id: e.id, name: `${e.firstName} ${e.lastName}`,
      band: e.band, department: e.department,
      rating: getRating(e.id),
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

    const totalActive = await prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } });

    // Check for real ratings first
    const realRatingsCount = await prisma.performanceRating.count();
    let withRatings: { compaRatio: number; rating: number; department: string }[] = [];
    let promotionReady = 0;
    let stars: any[] = [];
    let under: any[] = [];

    if (realRatingsCount > 0) {
      const employees = await prisma.employee.findMany({
        where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
        include: { performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 } },
      });
      withRatings = employees
        .filter(e => e.performanceRatings.length > 0)
        .map(e => ({
          compaRatio: Number(e.compaRatio),
          rating: Number(e.performanceRatings[0].rating),
          department: e.department,
        }));
      stars = employees.filter(e => Number(e.performanceRatings[0]?.rating || 0) >= 4 && Number(e.compaRatio) < 95);
      under = employees.filter(e => Number(e.performanceRatings[0]?.rating || 0) < 3 && Number(e.compaRatio) >= 100);
      promotionReady = await prisma.employee.count({
        where: { employmentStatus: 'ACTIVE', compaRatio: { gte: 90 }, performanceRatings: { some: { rating: { gte: 4 } } } },
      });
    } else {
      // AI-inferred performance tiers
      const [employees, inferred] = await Promise.all([
        prisma.employee.findMany({
          where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
          select: { id: true, compaRatio: true, department: true },
        }),
        getAiInferredPerformance(),
      ]);
      withRatings = employees
        .filter(e => inferred.has(e.id))
        .map(e => ({
          compaRatio: Number(e.compaRatio),
          rating: inferred.get(e.id)!.rating,
          department: e.department,
        }));
      stars = withRatings.filter(e => e.rating >= 4 && e.compaRatio < 95);
      under = withRatings.filter(e => e.rating < 3 && e.compaRatio >= 100);
      promotionReady = withRatings.filter(e => e.compaRatio >= 90 && e.rating >= 4).length;
    }

    const quadrants = withRatings.reduce((acc: Record<string, number>, e) => {
      const q = getQuadrant(e.rating, e.compaRatio);
      acc[q] = (acc[q] || 0) + 1;
      return acc;
    }, {});

    const avgRating = withRatings.length > 0
      ? (withRatings.reduce((s, e) => s + e.rating, 0) / withRatings.length).toFixed(2)
      : '0';

    const byDept = withRatings.reduce((acc: Record<string, number[]>, e) => {
      if (!acc[e.department]) acc[e.department] = [];
      acc[e.department].push(e.rating);
      return acc;
    }, {});

    const dataSource = realRatingsCount > 0 ? 'actual performance cycle data' : 'AI-inferred performance tiers based on compensation signals';

    const prompt = `You are CompSense AI, an expert in HR performance management. Analyze the following performance data and provide a concise, data-driven executive analysis.

Data source: ${dataSource}
Company: ${totalActive} active employees | ${withRatings.length} with performance data
Average rating: ${avgRating}/5

Performance quadrant breakdown:
- STAR (high performer, below market pay): ${quadrants['STAR'] || 0} employees — retention risk
- SOLID (high performer, fair pay): ${quadrants['SOLID'] || 0} employees — keep investing
- UNDER (low performer, above market): ${quadrants['UNDER'] || 0} employees — action needed
- AVERAGE: ${quadrants['AVERAGE'] || 0} employees

Promotion-ready employees: ${promotionReady} (compa-ratio ≥90%, rating ≥4)
Pay alignment gaps: ${stars.length} stars underpaid, ${under.length} underperformers overpaid

Top departments by average rating:
${Object.entries(byDept)
    .map(([dept, ratings]) => `- ${dept}: ${(ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1)}/5 avg (${ratings.length} employees)`)
    .sort((a, b) => {
      const ratingA = parseFloat(a.split(': ')[1]);
      const ratingB = parseFloat(b.split(': ')[1]);
      return ratingB - ratingA;
    })
    .slice(0, 8)
    .join('\n')}

Provide:
1. A 2-paragraph executive summary of performance health across the organization
2. Top 3 immediate actions: who needs raises (stars), PIPs (underperformers), and promotions
3. Department-level insights — which departments need attention
4. Strategic recommendation for the next review cycle

Format with clear markdown headers. Be specific with numbers and department names.`;

    try {
      const result = await callClaude(prompt, { temperature: 0.4, maxTokens: 1200 });
      await cacheSet('performance:ai-analysis', result.content, 1800);
      return result.content;
    } catch {
      return `**Performance Overview**\n\n${withRatings.length} employees analyzed. Quadrant: ${quadrants['STAR'] || 0} Stars, ${quadrants['SOLID'] || 0} Solid, ${quadrants['UNDER'] || 0} Under, ${quadrants['AVERAGE'] || 0} Average. ${promotionReady} promotion-ready.`;
    }
  },
};

function getQuadrant(rating: number, compaRatio: number): string {
  if (rating >= 4 && compaRatio < 95) return 'STAR';
  if (rating >= 4 && compaRatio >= 95) return 'SOLID';
  if (rating < 3 && compaRatio >= 100) return 'UNDER';
  return 'AVERAGE';
}
