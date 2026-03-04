/**
 * aiReport — Streaming Leadership Report (Phase 5.1)
 *
 * Generates a 5-section executive compensation briefing.
 * Each section is streamed separately so the frontend can show
 * a live progress indicator and render content as it arrives.
 *
 * SSE event format sent directly to Express Response:
 *   event: section_start  data: { index: number, title: string }
 *   event: text           data: { delta: string }
 *   event: section_end    data: { index: number }
 *   event: done           data: {}
 *   event: error          data: { message: string }
 */

import type { Response } from 'express';
import { anthropic } from '../lib/claudeClient';
import { gatherOrgSnapshot } from './orgSnapshot';
import logger from '../lib/logger';

// ─── Report sections definition ──────────────────────────────────────────────

const REPORT_SECTIONS = [
  {
    title: 'Compensation Health Overview',
    prompt: (ctx: string) =>
      `${ctx}\n\nWrite a concise executive summary (3-4 sentences) of the current compensation health of this organization. Include: pay equity status, average compa-ratio and what it means, percentage of employees outside salary bands, and one headline risk. Use specific numbers from the data. Start directly with content, no heading needed.`,
  },
  {
    title: 'Critical Issues Requiring Immediate Action',
    prompt: (ctx: string) =>
      `${ctx}\n\nList the TOP 3 most urgent compensation issues that require HR action this week. For each issue:\n- Bold title\n- 2-sentence explanation of the problem\n- Specific employee count or department affected (use real numbers from the data)\n- 1 concrete recommended action with rough cost estimate in Lakhs\n\nBe direct and specific. Use markdown formatting.`,
  },
  {
    title: 'Pay Equity Analysis',
    prompt: (ctx: string) =>
      `${ctx}\n\nProvide a pay equity analysis covering:\n1. Overall gender pay gap across the org (exact %)\n2. The 2 departments with the largest gender pay disparities (name them with actual numbers)\n3. Root cause analysis — is this structural, band-related, or performance-driven?\n4. 2 specific corrective actions with estimated budget impact in Lakhs\n\nUse markdown headers. Be specific with numbers from the data.`,
  },
  {
    title: 'Compensation Strategy Recommendation',
    prompt: (ctx: string) =>
      `${ctx}\n\nPropose ONE compensation scenario that would most improve both pay equity and employee retention simultaneously. Describe:\n- Which employees would benefit (bands, departments, criteria)\n- Estimated total cost in Lakhs and as % of current total payroll\n- Expected impact on gender pay gap and compa-ratio distribution\n- Expected retention improvement (which talent segments are at risk without this)\n- Implementation timeline (30/60/90 days)\n\nBe specific and use real numbers from the data. Use markdown formatting.`,
  },
  {
    title: '30-Day HR Action Plan',
    prompt: (ctx: string) =>
      `${ctx}\n\nWrite a 30-day action plan for the Head of HR. List exactly 5 specific, measurable actions (numbered). Each action should:\n- Have a clear owner/responsible party\n- Be achievable within 30 days\n- Include a measurable success metric\n- Reference specific issues from this org's data\n\nActions should address: pay equity correction, band compliance, RSU management, benefits adoption, and performance-pay alignment. Use markdown formatting.`,
  },
];

// ─── Main stream function ─────────────────────────────────────────────────────

export async function streamLeadershipReport(res: Response): Promise<void> {
  const send = (event: string, data: object) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    // Gather live org data once — reused across all sections
    send('progress', { message: 'Gathering live org data…', step: 0, total: REPORT_SECTIONS.length });
    const snapshot = await gatherOrgSnapshot();

    // Build compact context string for Claude
    const ctx = buildContext(snapshot);

    // Stream each section sequentially
    for (let i = 0; i < REPORT_SECTIONS.length; i++) {
      const section = REPORT_SECTIONS[i];

      send('section_start', { index: i, title: section.title });

      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        temperature: 0.3,
        system: `You are CompSense AI — an expert compensation strategist preparing a board-ready leadership briefing.
Be specific, use exact numbers from the data provided, and make every recommendation actionable.
Write in clear, professional prose suitable for a CFO/CHRO audience.`,
        messages: [{ role: 'user', content: section.prompt(ctx) }],
      });

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          send('text', { delta: chunk.delta.text });
        }
      }

      send('section_end', { index: i });
      logger.info(`[AI Report] Section ${i + 1}/${REPORT_SECTIONS.length} complete: "${section.title}"`);
    }

    send('done', {});
    logger.info('[AI Report] Report generation complete');

  } catch (err: any) {
    logger.error('[AI Report] Error generating report:', err);
    send('error', { message: err.message || 'Report generation failed' });
  } finally {
    res.end();
  }
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildContext(snapshot: Awaited<ReturnType<typeof gatherOrgSnapshot>>): string {
  const totalPayrollLakhs = snapshot.employees.reduce((s, e) => s + e.annualFixedLakhs, 0);

  // Gender pay gap by department
  const gapByDept: Record<string, { male?: number; female?: number }> = {};
  for (const g of snapshot.genderByDept) {
    if (!gapByDept[g.department]) gapByDept[g.department] = {};
    if (g.gender === 'MALE') gapByDept[g.department].male = g.avgLakhs;
    if (g.gender === 'FEMALE') gapByDept[g.department].female = g.avgLakhs;
  }

  const deptGaps = Object.entries(gapByDept)
    .filter(([, v]) => v.male && v.female)
    .map(([dept, v]) => ({
      dept,
      gapPct: (((v.male! - v.female!) / v.male!) * 100).toFixed(1),
      maleLakhs: v.male!,
      femaleLakhs: v.female!,
    }))
    .sort((a, b) => parseFloat(b.gapPct) - parseFloat(a.gapPct));

  // Compa-ratio distribution
  const withCR = snapshot.employees.filter(e => e.compaRatio !== null);
  const below80 = withCR.filter(e => (e.compaRatio ?? 0) < 80).length;
  const above120 = withCR.filter(e => (e.compaRatio ?? 0) > 120).length;

  // High performers underpaid (perf >= 4, CR < 90)
  const underpaidHighPerf = snapshot.employees.filter(
    e => (e.latestPerfRating ?? 0) >= 4 && (e.compaRatio ?? 100) < 90
  );

  return `ORG COMPENSATION SNAPSHOT — ${snapshot.generatedAt}
====================================================
Total active employees: ${snapshot.totalEmployees}
Total annual payroll: ₹${totalPayrollLakhs.toFixed(0)}L (₹${(totalPayrollLakhs / 100).toFixed(1)}Cr)
Average compa-ratio: ${snapshot.avgCompaRatio}%
Employees with CR < 80% (significantly underpaid): ${below80}
Employees with CR > 120% (significantly overpaid): ${above120}

SALARY BANDS:
${snapshot.bands.map(b => `  ${b.code}: Min ₹${b.minLakhs}L | Mid ₹${b.midLakhs}L | Max ₹${b.maxLakhs}L`).join('\n')}

GENDER PAY GAP BY DEPARTMENT (Male avg vs Female avg):
${deptGaps.map(d => `  ${d.dept}: Men ₹${d.maleLakhs}L, Women ₹${d.femaleLakhs}L — Gap: ${d.gapPct}%`).join('\n')}

HIGH PERFORMERS UNDERPAID (perf rating ≥ 4, CR < 90%):
${underpaidHighPerf.length} employees — ${underpaidHighPerf.slice(0, 5).map(e => `${e.name} (${e.band}, CR ${e.compaRatio}%, perf ${e.latestPerfRating})`).join(', ')}${underpaidHighPerf.length > 5 ? ` and ${underpaidHighPerf.length - 5} more` : ''}

RSU VESTING IN NEXT 30 DAYS:
${snapshot.rsuCliff.length === 0 ? '  None' : snapshot.rsuCliff.map(r => `  ${r.employeeName}: ${r.units} units on ${r.vestingDate}`).join('\n')}

BENEFITS UTILIZATION:
${snapshot.benefits.map(b => `  ${b.name} (${b.category}): ${b.utilizationPct}% utilization (${b.enrolledCount}/${b.totalEmployees})`).join('\n')}`;
}
