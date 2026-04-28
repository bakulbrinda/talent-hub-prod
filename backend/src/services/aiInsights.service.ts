import { prisma } from '../lib/prisma';
import { callClaude } from '../lib/claudeClient';
import { cacheGet, cacheSet } from '../lib/redis';

export const aiInsightsService = {
  getDashboardSummary: async () => {
    const cached = await cacheGet<string>('ai:dashboard-summary');
    if (cached) return cached;

    const [kpis, outliers] = await Promise.all([
      prisma.employee.aggregate({
        where: { employmentStatus: 'ACTIVE' },
        _count: true,
        _avg: { compaRatio: true, annualFixed: true },
      }),
      prisma.employee.count({
        where: { employmentStatus: 'ACTIVE', OR: [{ compaRatio: { lt: 80 } }, { compaRatio: { gt: 120 } }] },
      }),
    ]);

    const prompt = `You are CompSense AI. Write a 2-sentence executive summary of this HR compensation snapshot for a company dashboard. Be specific with numbers. No markdown.

Total employees: ${kpis._count}
Average compa-ratio: ${Number(kpis._avg.compaRatio || 0).toFixed(1)}%
Average annual fixed: ₹${(Number(kpis._avg.annualFixed || 0) / 100000).toFixed(1)}L
Employees outside salary bands: ${outliers}`;

    try {
      const r = await callClaude(prompt, { temperature: 0.3, maxTokens: 150 });
      await cacheSet('ai:dashboard-summary', r.content, 1800);
      return r.content;
    } catch {
      return `${kpis._count} active employees with an average compa-ratio of ${Number(kpis._avg.compaRatio || 0).toFixed(1)}%. ${outliers} employees are outside their salary bands and require attention.`;
    }
  },
};
