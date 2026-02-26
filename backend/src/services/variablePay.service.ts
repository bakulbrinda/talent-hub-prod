import { prisma } from '../lib/prisma';
import { callClaude } from '../lib/claudeClient';
import { cacheGet, cacheSet } from '../lib/redis';

export const variablePayService = {
  getPlans: async () => {
    return prisma.commissionPlan.findMany({ orderBy: { name: 'asc' } });
  },

  createPlan: async (data: any) => {
    return prisma.commissionPlan.create({ data });
  },

  updatePlan: async (id: string, data: any) => {
    return prisma.commissionPlan.update({ where: { id }, data });
  },

  getAchievements: async (filters: Record<string, string> = {}) => {
    const where: any = {};
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.period) where.period = filters.period;

    const achievements = await prisma.commissionAchievement.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: true,
            band: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            targetVariablePercent: true,
            planType: true,
          },
        },
      },
      orderBy: { period: 'desc' },
    });

    return achievements.map(a => ({
      ...a,
      targetAmount: Number(a.targetAmount),
      achievedAmount: Number(a.achievedAmount),
      payoutAmount: Number(a.payoutAmount),
      achievementPercent: Number(a.achievementPercent),
    }));
  },

  calculatePayout: async (
    employeeId: string,
    planId: string,
    achievedAmount: number,
  ) => {
    const [employee, plan] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: employeeId },
        select: { annualFixed: true, firstName: true, lastName: true },
      }),
      prisma.commissionPlan.findUnique({ where: { id: planId } }),
    ]);

    if (!employee || !plan) throw new Error('Employee or plan not found');

    // Quarterly target: annualFixed * targetVariablePercent% / 4
    const targetAmount =
      (Number(employee.annualFixed) * (Number(plan.targetVariablePercent) / 100)) / 4;
    const achievementPercent =
      targetAmount > 0 ? (achievedAmount / targetAmount) * 100 : 0;

    const tiers = (plan.acceleratorTiers as any[]) || [];

    // Find the highest threshold tier the employee qualifies for
    const applicableTier = [...tiers]
      .sort((a, b) => b.threshold - a.threshold)
      .find(t => achievementPercent >= t.threshold);

    const multiplier = applicableTier?.multiplier ?? 1;
    const payoutAmount = targetAmount * multiplier * (achievementPercent / 100);

    return {
      employeeName: `${employee.firstName} ${employee.lastName}`,
      targetAmount: Math.round(targetAmount),
      achievedAmount: Math.round(achievedAmount),
      achievementPercent: Math.round(achievementPercent * 10) / 10,
      appliedTier: applicableTier || null,
      multiplier,
      payoutAmount: Math.round(payoutAmount),
      tiers,
    };
  },

  saveAchievement: async (data: {
    employeeId: string;
    planId: string;
    period: string;
    targetAmount: number;
    achievedAmount: number;
    achievementPercent: number;
    payoutAmount: number;
  }) => {
    const existing = await prisma.commissionAchievement.findFirst({
      where: { employeeId: data.employeeId, planId: data.planId, period: data.period },
    });
    if (existing) {
      return prisma.commissionAchievement.update({
        where: { id: existing.id },
        data: {
          achievedAmount: data.achievedAmount,
          achievementPercent: data.achievementPercent,
          payoutAmount: data.payoutAmount,
          targetAmount: data.targetAmount,
        },
      });
    }
    return prisma.commissionAchievement.create({ data });
  },

  getAnalytics: async () => {
    const achievements = await prisma.commissionAchievement.findMany({
      include: { employee: { select: { band: true } } },
    });

    const totalTargetAmount = achievements.reduce(
      (s, a) => s + Number(a.targetAmount),
      0,
    );
    const totalPayoutAmount = achievements.reduce(
      (s, a) => s + Number(a.payoutAmount),
      0,
    );
    const avgAchievement =
      achievements.length > 0
        ? achievements.reduce((s, a) => s + Number(a.achievementPercent), 0) /
          achievements.length
        : 0;

    const buckets = [
      { label: '<50%', min: 0, max: 50 },
      { label: '50-80%', min: 50, max: 80 },
      { label: '80-100%', min: 80, max: 100 },
      { label: '100-120%', min: 100, max: 120 },
      { label: '>120%', min: 120, max: Infinity },
    ];

    const distribution = buckets.map(b => ({
      label: b.label,
      count: achievements.filter(a => {
        const p = Number(a.achievementPercent);
        return p >= b.min && p < b.max;
      }).length,
    }));

    const byBand = achievements.reduce(
      (acc: Record<string, { total: number; count: number }>, a) => {
        const band = a.employee.band;
        if (!acc[band]) acc[band] = { total: 0, count: 0 };
        acc[band].total += Number(a.achievementPercent);
        acc[band].count++;
        return acc;
      },
      {},
    );

    return {
      totalAchievements: achievements.length,
      avgAchievementPercent: Math.round(avgAchievement * 10) / 10,
      totalTargetAmount,
      totalPayoutAmount,
      distribution,
      byBand: Object.entries(byBand).map(([band, v]) => ({
        band,
        avgAchievement: Math.round((v.total / v.count) * 10) / 10,
      })),
    };
  },

  analyzeWithAI: async (): Promise<string> => {
    const cached = await cacheGet<string>('variable-pay:ai-analysis');
    if (cached) return cached;

    const [achievements, plans] = await Promise.all([
      prisma.commissionAchievement.findMany({
        include: {
          employee: { select: { firstName: true, lastName: true, band: true, department: true } },
          plan: { select: { name: true, planType: true, targetVariablePercent: true } },
        },
      }),
      prisma.commissionPlan.findMany(),
    ]);

    if (achievements.length === 0) {
      return '**Variable Pay Overview**\n\nNo commission achievement data available yet. Upload achievement data to generate analysis.';
    }

    const totalPayout = achievements.reduce((s, a) => s + Number(a.payoutAmount), 0);
    const totalTarget = achievements.reduce((s, a) => s + Number(a.targetAmount), 0);
    const avgAch = achievements.reduce((s, a) => s + Number(a.achievementPercent), 0) / achievements.length;

    const overachievers = achievements.filter(a => Number(a.achievementPercent) >= 120).length;
    const underperformers = achievements.filter(a => Number(a.achievementPercent) < 80).length;
    const onTarget = achievements.filter(a => Number(a.achievementPercent) >= 95 && Number(a.achievementPercent) < 120).length;

    const byPlan = achievements.reduce((acc: Record<string, { count: number; totalAch: number; payout: number }>, a) => {
      const name = a.plan.name;
      if (!acc[name]) acc[name] = { count: 0, totalAch: 0, payout: 0 };
      acc[name].count++;
      acc[name].totalAch += Number(a.achievementPercent);
      acc[name].payout += Number(a.payoutAmount);
      return acc;
    }, {});

    const byDept = achievements.reduce((acc: Record<string, { count: number; totalAch: number }>, a) => {
      const dept = a.employee.department;
      if (!acc[dept]) acc[dept] = { count: 0, totalAch: 0 };
      acc[dept].count++;
      acc[dept].totalAch += Number(a.achievementPercent);
      return acc;
    }, {});

    const prompt = `You are CompSense AI, an expert in variable compensation strategy. Analyze the following variable pay achievement data and provide a concise executive analysis.

Total achievements tracked: ${achievements.length} across ${plans.length} plans
Total payout: ₹${(totalPayout / 100000).toFixed(1)}L vs target ₹${(totalTarget / 100000).toFixed(1)}L
Average achievement: ${avgAch.toFixed(1)}%

Achievement distribution:
- Overachievers (≥120%): ${overachievers} (${((overachievers/achievements.length)*100).toFixed(0)}%)
- On Target (95–120%): ${onTarget} (${((onTarget/achievements.length)*100).toFixed(0)}%)
- Under performers (<80%): ${underperformers} (${((underperformers/achievements.length)*100).toFixed(0)}%)

By commission plan:
${Object.entries(byPlan).map(([name, d]) => `- ${name}: ${d.count} records, avg achievement ${(d.totalAch/d.count).toFixed(1)}%, total payout ₹${(d.payout/100000).toFixed(1)}L`).join('\n')}

By department:
${Object.entries(byDept).sort((a,b) => (b[1].totalAch/b[1].count) - (a[1].totalAch/a[1].count)).map(([dept, d]) => `- ${dept}: avg ${(d.totalAch/d.count).toFixed(1)}% achievement (${d.count} records)`).join('\n')}

Provide:
1. A 2-paragraph executive summary of variable pay health and payout efficiency
2. Top performing and underperforming departments/plans — with specific numbers
3. Top 3 recommendations to improve plan design and achievement rates
4. Budget risk analysis: over/underpayment vs target

Format with clear markdown headers. Be specific with rupee amounts and percentages.`;

    try {
      const result = await callClaude(prompt, { temperature: 0.4, maxTokens: 1200 });
      await cacheSet('variable-pay:ai-analysis', result.content, 1800);
      return result.content;
    } catch {
      return `**Variable Pay Overview**\n\n${achievements.length} achievements tracked. Average achievement: ${avgAch.toFixed(1)}%. Total payout: ₹${(totalPayout/100000).toFixed(1)}L.`;
    }
  },
};
