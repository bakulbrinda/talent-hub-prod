import { prisma } from '../lib/prisma';
import { sendEmail } from '../lib/emailClient';

function fmt(amount: number): string {
  return `₹${(amount / 100000).toFixed(1)}L`;
}

// ─── HTML Shell ───────────────────────────────────────────────
function emailShell(headerColor: string, headerTitle: string, headerSub: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;color:#1f2937;max-width:620px;margin:0 auto;padding:20px;background:#f9fafb">
  <div style="background:${headerColor};color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0;font-size:18px;font-weight:700">${headerTitle}</h2>
    <p style="margin:4px 0 0;font-size:13px;opacity:0.85">${headerSub}</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    ${body}
    <p style="margin-top:28px;padding-top:16px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af">
      Sent from <strong>Talent Hub</strong> — Automated notification. Do not reply to this email.
    </p>
  </div>
</body>
</html>`;
}

function tableRow(...cells: string[]): string {
  return `<tr>${cells.map(c => `<td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;font-size:13px">${c}</td>`).join('')}</tr>`;
}

function tableHeader(...headers: string[]): string {
  return `<tr style="background:#f9fafb">${headers.map(h => `<th style="text-align:left;padding:9px 12px;font-size:12px;font-weight:600;color:#6b7280">${h}</th>`).join('')}</tr>`;
}

// ─── Email Service ────────────────────────────────────────────
export const emailService = {

  // 1. Low performer alert → manager receives email listing direct reports below threshold
  sendLowPerformerAlerts: async (ratingThreshold = 3.0): Promise<{ sent: number; skipped: number; managerCount: number }> => {
    const lowPerformers = await prisma.employee.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        performanceRatings: { some: { rating: { lt: ratingThreshold } } },
        reportingManagerId: { not: null },
      },
      include: {
        performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 },
        reportingManager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Group by manager
    const byManager = new Map<string, { manager: { id: string; firstName: string; lastName: string; email: string }; reports: typeof lowPerformers }>();
    for (const emp of lowPerformers) {
      if (!emp.reportingManager) continue;
      const mgId = emp.reportingManager.id;
      if (!byManager.has(mgId)) byManager.set(mgId, { manager: emp.reportingManager as any, reports: [] });
      byManager.get(mgId)!.reports.push(emp);
    }

    let sent = 0;
    let skipped = 0;
    for (const { manager, reports } of byManager.values()) {
      if (!manager.email) { skipped++; continue; }

      const rows = reports.map(e =>
        tableRow(
          `<strong>${e.firstName} ${e.lastName}</strong>`,
          e.department,
          `<span style="background:#ede9fe;color:#7c3aed;padding:2px 8px;border-radius:999px;font-size:12px">${e.band}</span>`,
          `<span style="color:#ef4444;font-weight:600">${Number(e.performanceRatings[0]?.rating || 0).toFixed(1)}/5</span>`,
          fmt(Number(e.annualFixed)),
        )
      ).join('');

      const body = `
        <p style="margin:0 0 16px">Hi <strong>${manager.firstName}</strong>,</p>
        <p style="margin:0 0 16px;color:#4b5563">The following direct report(s) have a performance rating below <strong>${ratingThreshold}/5</strong> in the latest review cycle. Please review and take action.</p>
        <table style="width:100%;border-collapse:collapse">
          ${tableHeader('Employee', 'Department', 'Band', 'Rating', 'Annual Fixed')}
          ${rows}
        </table>
        <div style="margin-top:20px;padding:14px 16px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:4px;font-size:13px">
          <strong>Suggested actions:</strong>
          <ol style="margin:8px 0 0;padding-left:18px;color:#4b5563">
            <li>Schedule a 1:1 performance discussion within 7 days</li>
            <li>Set measurable 30-day improvement goals</li>
            <li>Document outcomes in the HR system</li>
            <li>Escalate to a formal PIP if no progress within 30 days</li>
          </ol>
        </div>`;

      await sendEmail({
        to: manager.email,
        subject: `[Action Required] ${reports.length} direct report(s) below ${ratingThreshold}/5 performance threshold`,
        html: emailShell('#7c3aed', 'Performance Alert — Action Required', `${reports.length} employee(s) need your attention`, body),
      });
      sent++;
    }

    return { sent, skipped, managerCount: byManager.size };
  },

  // 2. Pay anomaly alert → HR lead notified of employees outside band ranges
  sendPayAnomalyAlert: async (): Promise<{ sent: number; outlierCount: number }> => {
    const outliers = await prisma.employee.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        OR: [{ compaRatio: { lt: 80 } }, { compaRatio: { gt: 120 } }],
      },
      select: {
        firstName: true, lastName: true, department: true,
        band: true, annualFixed: true, compaRatio: true,
      },
      orderBy: { compaRatio: 'asc' },
    });

    if (outliers.length === 0) return { sent: 0, outlierCount: 0 };

    const hrEmail = process.env.HR_ALERT_EMAIL;

    const rows = outliers.map(e => {
      const cr = Number(e.compaRatio).toFixed(1);
      const crColor = Number(e.compaRatio) < 80 ? '#ef4444' : '#f59e0b';
      const label = Number(e.compaRatio) < 80 ? 'Below Band' : 'Above Band';
      return tableRow(
        `<strong>${e.firstName} ${e.lastName}</strong>`,
        e.department,
        e.band,
        fmt(Number(e.annualFixed)),
        `<span style="color:${crColor};font-weight:600">${cr}%</span>`,
        `<span style="background:${Number(e.compaRatio) < 80 ? '#fee2e2' : '#fef3c7'};color:${crColor};padding:2px 8px;border-radius:999px;font-size:12px">${label}</span>`,
      );
    }).join('');

    const body = `
      <p style="margin:0 0 16px;color:#4b5563">
        <strong>${outliers.length} active employee(s)</strong> have salaries outside defined band ranges
        (compa-ratio &lt; 80% or &gt; 120%). Immediate review is recommended.
      </p>
      <table style="width:100%;border-collapse:collapse">
        ${tableHeader('Employee', 'Department', 'Band', 'Annual Fixed', 'Compa-Ratio', 'Status')}
        ${rows}
      </table>
      <div style="margin-top:20px;padding:14px 16px;background:#fee2e2;border-left:3px solid #ef4444;border-radius:4px;font-size:13px;color:#7f1d1d">
        Review salary band configurations in Talent Hub and initiate correction workflows for affected employees.
      </div>`;

    if (hrEmail) {
      await sendEmail({
        to: hrEmail,
        subject: `[Pay Alert] ${outliers.length} employees outside salary bands — review required`,
        html: emailShell('#dc2626', 'Pay Anomaly Alert', `${outliers.length} employees outside band ranges`, body),
      });
      return { sent: 1, outlierCount: outliers.length };
    }

    // No HR_ALERT_EMAIL configured — log data but report unsent
    return { sent: 0, outlierCount: outliers.length };
  },

  // 3. RSU cliff reminder → employee + manager emailed 30 days before first vest
  sendRsuCliffReminders: async (): Promise<{ sent: number; upcoming: number }> => {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const upcomingVests = await prisma.rsuVestingEvent.findMany({
      where: {
        isVested: false,
        vestingDate: { gte: now, lte: in30Days },
      },
      include: {
        rsuGrant: {
          include: {
            employee: {
              select: {
                firstName: true, lastName: true, email: true, department: true,
                reportingManager: { select: { firstName: true, lastName: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (upcomingVests.length === 0) return { sent: 0, upcoming: 0 };

    let sent = 0;
    for (const vest of upcomingVests) {
      const emp = vest.rsuGrant.employee;
      if (!emp.email) continue;

      const vestDateStr = new Date(vest.vestingDate).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      const daysLeft = Math.ceil((new Date(vest.vestingDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const body = `
        <p style="margin:0 0 16px">Hi <strong>${emp.firstName}</strong>,</p>
        <p style="margin:0 0 16px;color:#4b5563">
          Your next RSU vesting event is coming up in <strong>${daysLeft} day(s)</strong>. Please ensure your brokerage account details are current.
        </p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px;margin:16px 0">
          <table style="width:100%;font-size:14px;border-collapse:collapse">
            <tr><td style="color:#6b7280;padding:6px 0">Vesting Date</td><td style="font-weight:600;text-align:right">${vestDateStr}</td></tr>
            <tr><td style="color:#6b7280;padding:6px 0">Units Vesting</td><td style="font-weight:700;text-align:right;color:#059669">${vest.unitsVesting} units</td></tr>
            <tr><td style="color:#6b7280;padding:6px 0">Days Remaining</td><td style="font-weight:600;text-align:right">${daysLeft} days</td></tr>
            <tr><td style="color:#6b7280;padding:6px 0">Department</td><td style="font-weight:600;text-align:right">${emp.department}</td></tr>
          </table>
        </div>
        <p style="font-size:13px;color:#6b7280">Contact your HR partner if you have questions about the vesting process or brokerage setup.</p>`;

      const recipients: string[] = [emp.email];
      if (emp.reportingManager?.email) recipients.push(emp.reportingManager.email);

      await sendEmail({
        to: recipients,
        subject: `RSU Vesting Reminder — ${vest.unitsVesting} units vest on ${vestDateStr} (${daysLeft} days)`,
        html: emailShell('#059669', 'RSU Vesting Reminder', `${daysLeft} days until your next vesting date`, body),
      });
      sent++;
    }

    return { sent, upcoming: upcomingVests.length };
  },
};
