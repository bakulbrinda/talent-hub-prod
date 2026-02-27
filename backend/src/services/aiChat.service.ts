/**
 * AI Chat Service — Phase 3
 * Claude with 7 live-data tools, SSE streaming, Redis conversation history.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import { prisma } from '../lib/prisma';
import { redisClient } from '../lib/redis';
import logger from '../lib/logger';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const HISTORY_TTL = 2 * 60 * 60; // 2 hours
const MAX_HISTORY  = 20;           // 10 turns (user+assistant pairs)
const MODEL        = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are the AI compensation intelligence assistant for this organisation.
You have access to real-time HR data via tools. ALWAYS use tools to get current data before answering — never guess or fabricate numbers.

Your role:
- Help the Head of HR make better compensation decisions
- Detect pay inequities and explain them clearly
- Model compensation scenarios and explain cost impacts
- Align pay with performance data
- Generate leadership-ready summaries

Communication style:
- Be direct and specific — use actual employee names, exact numbers, percentages
- Lead with the single most important finding
- Always end with 1–2 concrete recommended actions
- Format salary amounts as "₹X.X Lakhs" (1 Lakh = ₹1,00,000) or "₹X.X Crores" (1 Crore = ₹1,00,00,000)
- Keep responses under 300 words unless generating a full report`;

// ── Tool Definitions ──────────────────────────────────────────
const TOOLS: Tool[] = [
  {
    name: 'get_org_summary',
    description: 'Get high-level org stats: total employees, avg compa-ratio, band breakdown, department headcounts, gender split.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_employees',
    description: 'Query active employees with optional filters. Returns name, band, department, gender, salary, compaRatio, latest performance rating. Use to find underpaid/overpaid employees, filter by department, band, gender, etc.',
    input_schema: {
      type: 'object',
      properties: {
        band:                    { type: 'string',  description: 'Filter by band code e.g. P1, P2, A1' },
        department:              { type: 'string',  description: 'Filter by department name (partial match)' },
        gender:                  { type: 'string',  enum: ['Male', 'Female', 'Other'] },
        compaRatioBelow:         { type: 'number',  description: 'Only employees with compaRatio < this value' },
        compaRatioAbove:         { type: 'number',  description: 'Only employees with compaRatio > this value' },
        performanceRatingAbove:  { type: 'number',  description: 'Only employees with latest performance rating > this value' },
        performanceRatingBelow:  { type: 'number',  description: 'Only employees with latest performance rating < this value' },
        limit:                   { type: 'number',  description: 'Max results to return (default 20, max 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_pay_equity_data',
    description: 'Get gender pay gap analysis, compa-ratio distribution, and pay equity metrics. Can break down by department or band.',
    input_schema: {
      type: 'object',
      properties: {
        breakdown: {
          type: 'string',
          enum: ['overall', 'by_department', 'by_band'],
          description: 'How to slice the data',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_band_analysis',
    description: 'Get salary band structure (min/mid/max ₹) and how many employees fall below, within, or above each band.',
    input_schema: {
      type: 'object',
      properties: {
        band: { type: 'string', description: 'Optional specific band to analyse e.g. P2. Omit for all bands.' },
      },
      required: [],
    },
  },
  {
    name: 'get_performance_pay_alignment',
    description: 'Identify performance-pay misalignment: high performers who are underpaid (rating ≥4, compaRatio <90%) or low performers who are overpaid (rating ≤2, compaRatio >110%).',
    input_schema: {
      type: 'object',
      properties: {
        scenario: {
          type: 'string',
          enum: ['underpaid_top', 'overpaid_bottom', 'both'],
          description: 'Which misalignment direction to look for',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_benefits_data',
    description: 'Get benefits utilisation rates, enrollment counts, and employee cost per category.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'run_scenario',
    description: 'Simulate a what-if salary increase scenario. Returns affected employee count, additional cost in Lakhs/Crores, and % of payroll. Use to answer questions like "what would a 10% raise for all P2 employees cost?"',
    input_schema: {
      type: 'object',
      properties: {
        band:                    { type: 'string',  description: 'Only apply to employees in this band' },
        department:              { type: 'string',  description: 'Only apply to employees in this department' },
        percentIncrease:         { type: 'number',  description: 'Percentage increase e.g. 10 for 10%' },
        absoluteIncreaseINR:     { type: 'number',  description: 'Fixed INR increase per employee per year' },
        filterCompaRatioBelow:   { type: 'number',  description: 'Only apply to employees with compaRatio below this value' },
        filterPerformanceAbove:  { type: 'number',  description: 'Only apply to employees with performance rating above this value' },
      },
      required: [],
    },
  },
];

// ── Tool Implementations ──────────────────────────────────────
async function toolGetOrgSummary() {
  const [total, avgAgg, genderGroups, deptGroups, bandGroups] = await Promise.all([
    prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
    prisma.employee.aggregate({
      where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
      _avg: { compaRatio: true },
    }),
    prisma.employee.groupBy({ by: ['gender'], where: { employmentStatus: 'ACTIVE' }, _count: true }),
    prisma.employee.groupBy({
      by: ['department'], where: { employmentStatus: 'ACTIVE' },
      _count: true, orderBy: { _count: { department: 'desc' } },
    }),
    prisma.employee.groupBy({ by: ['band'], where: { employmentStatus: 'ACTIVE' }, _count: true }),
  ]);
  return {
    totalActiveEmployees: total,
    avgCompaRatio: Number(avgAgg._avg.compaRatio || 0).toFixed(1) + '%',
    genderBreakdown: genderGroups.map(g => ({ gender: g.gender, count: g._count })),
    departments: deptGroups.map(d => ({ department: d.department, headcount: d._count })),
    bandBreakdown: bandGroups.map(b => ({ band: b.band, headcount: b._count })),
  };
}

async function toolGetEmployees(input: Record<string, any>) {
  const where: any = { employmentStatus: 'ACTIVE' };
  if (input.band)       where.band = input.band;
  if (input.department) where.department = { contains: input.department, mode: 'insensitive' };
  if (input.gender) {
    // Normalise "Male" → "MALE" etc. from Claude's output
    const gMap: Record<string, string> = { Male: 'MALE', Female: 'FEMALE', Other: 'NON_BINARY' };
    where.gender = gMap[input.gender] || input.gender;
  }
  if (input.compaRatioBelow !== undefined || input.compaRatioAbove !== undefined) {
    where.compaRatio = {};
    if (input.compaRatioBelow !== undefined) where.compaRatio.lt = input.compaRatioBelow;
    if (input.compaRatioAbove !== undefined) where.compaRatio.gt = input.compaRatioAbove;
  }
  const limit = Math.min(Number(input.limit) || 20, 50);

  let emps = await prisma.employee.findMany({
    where,
    take: limit,
    orderBy: { compaRatio: 'asc' },
    select: {
      firstName: true, lastName: true, employeeId: true, designation: true,
      band: true, department: true, gender: true,
      annualFixed: true, compaRatio: true,
      performanceRatings: { orderBy: { createdAt: 'desc' }, take: 1, select: { rating: true } },
    },
  });

  // Client-side performance filter
  if (input.performanceRatingAbove !== undefined) {
    emps = emps.filter(e => Number(e.performanceRatings[0]?.rating || 0) > input.performanceRatingAbove);
  }
  if (input.performanceRatingBelow !== undefined) {
    emps = emps.filter(e => Number(e.performanceRatings[0]?.rating || 0) < input.performanceRatingBelow);
  }

  return emps.map(e => ({
    name:              `${e.firstName} ${e.lastName}`,
    employeeId:        e.employeeId,
    designation:       e.designation,
    band:              e.band,
    department:        e.department,
    gender:            e.gender,
    annualSalaryLakhs: (Number(e.annualFixed) / 100000).toFixed(1),
    compaRatio:        Number(e.compaRatio || 0).toFixed(1) + '%',
    latestPerfRating:  e.performanceRatings[0]?.rating ? Number(e.performanceRatings[0].rating) : null,
  }));
}

async function toolGetPayEquityData(input: Record<string, any>) {
  const breakdown = input.breakdown || 'overall';

  if (breakdown === 'overall') {
    const [mAgg, fAgg, compaAgg] = await Promise.all([
      prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE', gender: 'MALE' },   _avg: { annualFixed: true }, _count: true }),
      prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE', gender: 'FEMALE' }, _avg: { annualFixed: true }, _count: true }),
      prisma.employee.aggregate({
        where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
        _avg: { compaRatio: true }, _min: { compaRatio: true }, _max: { compaRatio: true },
      }),
    ]);
    const mAvg = Number(mAgg._avg?.annualFixed || 0);
    const fAvg = Number(fAgg._avg?.annualFixed || 0);
    const gap  = mAvg > 0 ? ((mAvg - fAvg) / mAvg * 100).toFixed(1) : '0';
    return {
      genderPayGapPercent: gap + '%',
      maleAvgLakhs:   (mAvg / 100000).toFixed(1), maleCount: mAgg._count,
      femaleAvgLakhs: (fAvg / 100000).toFixed(1), femaleCount: fAgg._count,
      avgCompaRatio:  Number(compaAgg._avg.compaRatio || 0).toFixed(1) + '%',
      minCompaRatio:  Number(compaAgg._min.compaRatio || 0).toFixed(1) + '%',
      maxCompaRatio:  Number(compaAgg._max.compaRatio || 0).toFixed(1) + '%',
    };
  }

  if (breakdown === 'by_department') {
    const rows = await prisma.employee.groupBy({
      by: ['department', 'gender'], where: { employmentStatus: 'ACTIVE' },
      _avg: { annualFixed: true }, _count: true,
    });
    const map: Record<string, any> = {};
    for (const r of rows) {
      if (!map[r.department]) map[r.department] = {};
      map[r.department][r.gender as string] = {
        avgSalaryLakhs: (Number(r._avg?.annualFixed || 0) / 100000).toFixed(1),
        count: r._count,
      };
    }
    return Object.entries(map).map(([dept, data]: [string, any]) => {
      const mA = Number(data.MALE?.avgSalaryLakhs || 0);
      const fA = Number(data.FEMALE?.avgSalaryLakhs || 0);
      return { department: dept, male: data.MALE, female: data.FEMALE, gapPercent: mA > 0 ? ((mA - fA) / mA * 100).toFixed(1) + '%' : 'N/A' };
    });
  }

  if (breakdown === 'by_band') {
    const rows = await prisma.employee.groupBy({
      by: ['band', 'gender'], where: { employmentStatus: 'ACTIVE' },
      _avg: { annualFixed: true, compaRatio: true }, _count: true,
    });
    const map: Record<string, any> = {};
    for (const r of rows) {
      if (!map[r.band]) map[r.band] = {};
      map[r.band][r.gender as string] = {
        avgSalaryLakhs: (Number(r._avg?.annualFixed || 0) / 100000).toFixed(1),
        avgCompaRatio:  Number(r._avg?.compaRatio || 0).toFixed(1) + '%',
        count: r._count,
      };
    }
    return Object.entries(map).map(([band, data]) => ({ band, ...(data as any) }));
  }

  return { error: 'Invalid breakdown' };
}

async function toolGetBandAnalysis(input: Record<string, any>) {
  const where: any = input.band ? { band: { code: input.band } } : {};
  const bands = await prisma.salaryBand.findMany({
    where, include: { band: true, jobArea: true }, orderBy: { band: { code: 'asc' } },
  });

  return Promise.all(
    bands.map(async (sb) => {
      const [below, within, above] = await Promise.all([
        prisma.employee.count({ where: { employmentStatus: 'ACTIVE', band: sb.band.code, annualFixed: { lt: sb.minSalary } } }),
        prisma.employee.count({ where: { employmentStatus: 'ACTIVE', band: sb.band.code, annualFixed: { gte: sb.minSalary, lte: sb.maxSalary } } }),
        prisma.employee.count({ where: { employmentStatus: 'ACTIVE', band: sb.band.code, annualFixed: { gt: sb.maxSalary } } }),
      ]);
      return {
        band: sb.band.code, jobArea: sb.jobArea?.name || 'All',
        minLakhs: (Number(sb.minSalary) / 100000).toFixed(1),
        midLakhs: (Number(sb.midSalary) / 100000).toFixed(1),
        maxLakhs: (Number(sb.maxSalary) / 100000).toFixed(1),
        below, within, above,
      };
    })
  );
}

async function toolGetPerformancePayAlignment(input: Record<string, any>) {
  const scenario = input.scenario || 'both';
  const emps = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
    select: {
      firstName: true, lastName: true, department: true, band: true,
      annualFixed: true, compaRatio: true,
      performanceRatings: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { rating: true } },
    },
  });

  const enriched = emps
    .filter(e => e.performanceRatings[0]?.rating)
    .map(e => ({
      name:              `${e.firstName} ${e.lastName}`,
      department:        e.department,
      band:              e.band,
      salaryLakhs:       (Number(e.annualFixed) / 100000).toFixed(1),
      compaRatio:        Number(e.compaRatio),
      performanceRating: Number(e.performanceRatings[0].rating),
    }));

  const underpaidTop  = (scenario !== 'overpaid_bottom')
    ? enriched.filter(e => e.performanceRating >= 4 && e.compaRatio < 90).sort((a, b) => a.compaRatio - b.compaRatio)
    : [];
  const overpaidBottom = (scenario !== 'underpaid_top')
    ? enriched.filter(e => e.performanceRating <= 2 && e.compaRatio > 110).sort((a, b) => b.compaRatio - a.compaRatio)
    : [];

  const fmt = (e: typeof enriched[0]) => ({ ...e, compaRatio: e.compaRatio.toFixed(1) + '%' });
  return {
    summary: `${underpaidTop.length} high performers underpaid, ${overpaidBottom.length} low performers overpaid`,
    highPerformersUnderpaid: underpaidTop.map(fmt),
    lowPerformersOverpaid:   overpaidBottom.map(fmt),
  };
}

async function toolGetBenefitsData() {
  const [catalog, enrollments, totalEmp] = await Promise.all([
    prisma.benefitsCatalog.findMany({ where: { isActive: true } }),
    prisma.employeeBenefit.groupBy({ by: ['benefitId', 'status'], _count: true }),
    prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
  ]);
  return catalog.map(b => {
    // ACTIVE status = currently enrolled/active benefit
    const enrolled = enrollments.find(e => e.benefitId === b.id && e.status === 'ACTIVE')?._count || 0;
    return {
      name:            b.name,
      category:        b.category,
      enrolledCount:   enrolled,
      utilizationPct:  totalEmp > 0 ? ((enrolled / totalEmp) * 100).toFixed(1) + '%' : '0%',
      annualValueINR:  b.annualValue ? `₹${Number(b.annualValue).toLocaleString()}` : 'N/A',
    };
  });
}

async function toolRunScenario(input: Record<string, any>) {
  const where: any = { employmentStatus: 'ACTIVE' };
  if (input.band)       where.band = input.band;
  if (input.department) where.department = { contains: input.department, mode: 'insensitive' };
  if (input.filterCompaRatioBelow !== undefined) where.compaRatio = { lt: input.filterCompaRatioBelow };

  let emps = await prisma.employee.findMany({
    where,
    select: {
      firstName: true, lastName: true, band: true, annualFixed: true,
      performanceRatings: { orderBy: { createdAt: 'desc' }, take: 1, select: { rating: true } },
    },
  });

  if (input.filterPerformanceAbove !== undefined) {
    emps = emps.filter(e => Number(e.performanceRatings[0]?.rating || 0) > input.filterPerformanceAbove);
  }

  const totalCurrent = emps.reduce((s, e) => s + Number(e.annualFixed), 0);
  let additionalCost = 0;
  for (const e of emps) {
    if (input.percentIncrease)     additionalCost += Number(e.annualFixed) * (input.percentIncrease / 100);
    else if (input.absoluteIncreaseINR) additionalCost += input.absoluteIncreaseINR;
  }

  return {
    affectedEmployees:   emps.length,
    currentPayrollLakhs: (totalCurrent / 100000).toFixed(1),
    additionalCostLakhs: (additionalCost / 100000).toFixed(1),
    additionalCostCrores:(additionalCost / 10000000).toFixed(2),
    pctOfPayroll:        totalCurrent > 0 ? ((additionalCost / totalCurrent) * 100).toFixed(1) + '%' : '0%',
    sampleEmployees:     emps.slice(0, 5).map(e => `${e.firstName} ${e.lastName} (${e.band}, ₹${(Number(e.annualFixed)/100000).toFixed(1)}L)`),
  };
}

async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  logger.info(`AI tool call: ${name}`);
  try {
    switch (name) {
      case 'get_org_summary':               return JSON.stringify(await toolGetOrgSummary());
      case 'get_employees':                  return JSON.stringify(await toolGetEmployees(input));
      case 'get_pay_equity_data':            return JSON.stringify(await toolGetPayEquityData(input));
      case 'get_band_analysis':              return JSON.stringify(await toolGetBandAnalysis(input));
      case 'get_performance_pay_alignment':  return JSON.stringify(await toolGetPerformancePayAlignment(input));
      case 'get_benefits_data':              return JSON.stringify(await toolGetBenefitsData());
      case 'run_scenario':                   return JSON.stringify(await toolRunScenario(input));
      default:                               return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: any) {
    logger.error(`Tool ${name} error:`, err.message);
    return JSON.stringify({ error: err.message });
  }
}

// ── History Helpers ───────────────────────────────────────────
const histKey = (userId: string) => `chat:${userId}:history`;

export async function getHistory(userId: string): Promise<MessageParam[]> {
  try {
    const raw = await redisClient.get(histKey(userId));
    return raw ? (JSON.parse(raw) as MessageParam[]) : [];
  } catch { return []; }
}

export async function saveHistory(userId: string, history: MessageParam[]): Promise<void> {
  const trimmed = history.slice(-MAX_HISTORY);
  await redisClient.setex(histKey(userId), HISTORY_TTL, JSON.stringify(trimmed));
}

export async function clearHistory(userId: string): Promise<void> {
  await redisClient.del(histKey(userId));
}

// ── SSE Stream Chat (Agentic Loop) ────────────────────────────
export async function streamChat(
  userId:       string,
  userMessage:  string,
  onText:       (text: string) => void,
  onToolCall:   (toolName: string) => void,
  onDone:       () => void,
  onError:      (err: Error) => void,
): Promise<void> {
  const history = await getHistory(userId);
  let currentMessages: MessageParam[] = [...history, { role: 'user', content: userMessage }];
  let fullAssistantText = '';

  try {
    // Agentic loop: Claude may call tools one or more times before final response
    while (true) {
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: currentMessages,
      });

      // Stream text tokens in real time
      stream.on('text', (text) => {
        fullAssistantText += text;
        onText(text);
      });

      // Signal tool calls to the client as they start
      stream.on('contentBlock', (block) => {
        if (block.type === 'tool_use') onToolCall(block.name);
      });

      const finalMsg = await stream.finalMessage();

      if (finalMsg.stop_reason === 'end_turn') {
        // Save history and signal completion
        const newHistory: MessageParam[] = [
          ...currentMessages,
          { role: 'assistant', content: fullAssistantText || '...' },
        ];
        await saveHistory(userId, newHistory);
        onDone();
        return;
      }

      if (finalMsg.stop_reason === 'tool_use') {
        const toolUses = finalMsg.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
        const toolResults = await Promise.all(
          toolUses.map(async (tu) => ({
            type: 'tool_result' as const,
            tool_use_id: tu.id,
            content: await executeTool(tu.name, tu.input as Record<string, any>),
          }))
        );
        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: finalMsg.content },
          { role: 'user',      content: toolResults },
        ];
        continue; // next iteration: Claude processes tool results
      }

      break; // unexpected stop reason — exit
    }

    onDone();
  } catch (err: any) {
    logger.error('AI chat error:', err.message);
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
