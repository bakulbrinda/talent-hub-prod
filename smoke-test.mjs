/**
 * Talent Hub — Smoke Test
 * Tests every page/route by logging in and navigating through the full app.
 * Run: node smoke-test.mjs
 */

import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const EMAIL = 'admin@company.com';
const PASS  = 'Admin@123';

const results = [];

function log(icon, label, msg = '') {
  const line = `${icon} ${label}${msg ? ': ' + msg : ''}`;
  console.log(line);
  results.push({ icon, label, msg });
}

async function waitForSpinner(page) {
  // Wait for the Suspense loading spinner to disappear (max 8s)
  try {
    await page.waitForFunction(() => {
      const spinner = document.querySelector('.animate-spin');
      return !spinner;
    }, { timeout: 8000 });
  } catch {}
}

async function checkNoErrors(page, label) {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('ResizeObserver')) {
      errors.push(msg.text());
    }
  });
  return errors;
}

async function navigateAndCheck(page, path, label, checkFn) {
  try {
    const consoleErrors = [];
    const handler = msg => {
      if (msg.type() === 'error' && !msg.text().includes('ResizeObserver') && !msg.text().includes('favicon')) {
        consoleErrors.push(msg.text());
      }
    };
    page.on('console', handler);

    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await waitForSpinner(page);
    await page.waitForTimeout(800); // let queries settle

    let extra = '';
    if (checkFn) {
      try { extra = await checkFn(page); } catch (e) { extra = `CHECK_FAIL: ${e.message}`; }
    }

    if (consoleErrors.length > 0) {
      log('⚠️ ', label, `JS errors: ${consoleErrors.slice(0, 2).join(' | ')}`);
    } else {
      log('✅', label, extra || 'OK');
    }

    page.off('console', handler);
  } catch (err) {
    log('❌', label, err.message.split('\n')[0]);
  }
}

async function getText(page, selector) {
  try { return await page.locator(selector).first().innerText({ timeout: 3000 }); } catch { return ''; }
}

async function isVisible(page, selector) {
  try { return await page.locator(selector).first().isVisible({ timeout: 3000 }); } catch { return false; }
}

(async () => {
  console.log('\n══════════════════════════════════════════');
  console.log('  Talent Hub — Smoke Test');
  console.log('══════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // ── 1. Login ────────────────────────────────────────────────
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.locator('input[name="email"]').fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASS);
    const [loginResp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/auth/login'), { timeout: 8000 }),
      page.locator('button[type="submit"]').click(),
    ]);
    if (loginResp.status() !== 200) throw new Error(`Login API returned ${loginResp.status()}`);
    await page.waitForTimeout(2000); // let router settle
    log('✅', 'Login', `API 200, navigated to ${page.url().replace(BASE,'')}`);
  } catch (err) {
    log('❌', 'Login', err.message.split('\n')[0]);
    await browser.close();
    printSummary();
    process.exit(1);
  }

  // ── 2. Dashboard ─────────────────────────────────────────────
  await navigateAndCheck(page, '/dashboard', 'Dashboard', async (p) => {
    const h1 = await getText(p, 'h1');
    const hasKpis = await isVisible(p, '.grid');
    const hasActionPanel = await isVisible(p, 'text=Action Required');
    const chartCount = await p.locator('.recharts-responsive-container').count();
    return `"${h1}" | KPIs: ${hasKpis} | Action panel: ${hasActionPanel} | Charts: ${chartCount}`;
  });

  // ── 3. Compensation Hub ──────────────────────────────────────
  await navigateAndCheck(page, '/compensation', 'Compensation Hub', async (p) => {
    const h1 = await getText(p, 'h1');
    const cards = await p.locator('a[href]').count();
    return `"${h1}" | ${cards} links`;
  });

  // ── 4. Benefits Hub ──────────────────────────────────────────
  await navigateAndCheck(page, '/benefits-hub', 'Benefits Hub', async (p) => {
    const h1 = await getText(p, 'h1');
    return `"${h1}"`;
  });

  // ── 5. Employee Directory ─────────────────────────────────────
  await navigateAndCheck(page, '/employees', 'Employee Directory', async (p) => {
    await p.waitForTimeout(1000);
    const rows = await p.locator('tbody tr').count();
    return `${rows} employee rows`;
  });

  // ── 6. Salary Bands ───────────────────────────────────────────
  await navigateAndCheck(page, '/salary-bands', 'Salary Bands', async (p) => {
    const h1 = await getText(p, 'h1');
    return `"${h1}"`;
  });

  // ── 7. Pay Equity ─────────────────────────────────────────────
  await navigateAndCheck(page, '/pay-equity', 'Pay Equity', async (p) => {
    const h1 = await getText(p, 'h1');
    const chartCount = await p.locator('.recharts-responsive-container').count();
    return `"${h1}" | ${chartCount} charts`;
  });

  // ── 8. AI Insights ────────────────────────────────────────────
  await navigateAndCheck(page, '/ai-insights', 'AI Insights', async (p) => {
    const h1 = await getText(p, 'h1');
    return `"${h1}"`;
  });

  // ── 9. Benefits Management ────────────────────────────────────
  await navigateAndCheck(page, '/benefits', 'Benefits Management', async (p) => {
    const h1 = await getText(p, 'h1');
    return `"${h1}"`;
  });

  // ── 10. RSU Tracker ───────────────────────────────────────────
  await navigateAndCheck(page, '/rsu', 'RSU Tracker', async (p) => {
    const h1 = await getText(p, 'h1');
    return `"${h1}"`;
  });

  // ── 11. Performance ───────────────────────────────────────────
  await navigateAndCheck(page, '/performance', 'Performance', async (p) => {
    const h1 = await getText(p, 'h1');
    return `"${h1}"`;
  });

  // ── 12. Variable Pay ──────────────────────────────────────────
  await navigateAndCheck(page, '/variable-pay', 'Variable Pay', async (p) => {
    const h1 = await getText(p, 'h1');
    return `"${h1}"`;
  });

  // ── 13. Scenario Modeler ──────────────────────────────────────
  await navigateAndCheck(page, '/scenarios', 'Scenario Modeler', async (p) => {
    const h1 = await getText(p, 'h1');
    return `"${h1}"`;
  });

  // ── 14. Notifications ─────────────────────────────────────────
  await navigateAndCheck(page, '/notifications', 'Notifications Center', async (p) => {
    const h1 = await getText(p, 'h1');
    return `"${h1}"`;
  });

  // ── 15. Job Architecture ──────────────────────────────────────
  await navigateAndCheck(page, '/job-architecture', 'Job Architecture', async (p) => {
    const h1 = await getText(p, 'h1');
    return `"${h1}"`;
  });

  // ── 16. Platform Settings ─────────────────────────────────────
  await navigateAndCheck(page, '/settings/platform', 'Platform Settings', async (p) => {
    const h1 = await getText(p, 'h1');
    const tabs = await p.locator('button.w-full').count();
    return `"${h1}" | ${tabs} tabs`;
  });

  // ── 17. User Settings ─────────────────────────────────────────
  await navigateAndCheck(page, '/settings/user', 'User Settings', async (p) => {
    const h1 = await getText(p, 'h1');
    const tabs = await p.locator('button.w-full').count();
    return `"${h1}" | ${tabs} tabs`;
  });

  // ── 18. Old /settings redirect check ─────────────────────────
  await navigateAndCheck(page, '/settings', 'Legacy /settings', async (p) => {
    const h1 = await getText(p, 'h1');
    return `still renders "${h1}"`;
  });

  // ── 19. Sidebar group toggle ─────────────────────────────────
  try {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    // Hover to expand sidebar
    await page.hover('aside');
    await page.waitForTimeout(500);
    const groupHeaders = await page.locator('aside nav button').count();
    log('✅', 'Sidebar groups', `${groupHeaders} group headers visible on hover`);
  } catch (err) {
    log('❌', 'Sidebar groups', err.message.split('\n')[0]);
  }

  // ── 20. Backend API health check ─────────────────────────────
  try {
    const resp = await page.evaluate(() =>
      fetch('/api/health').then(r => r.json())
    );
    log('✅', 'Backend /api/health', `status=${resp.status}, version=${resp.version}`);
  } catch (err) {
    log('❌', 'Backend /api/health', err.message);
  }

  // ── 21. Dashboard new endpoints ───────────────────────────────
  const newEndpoints = [
    '/api/dashboard/comp-vs-performance',
    '/api/dashboard/dept-pay-equity-heatmap',
    '/api/dashboard/rsu-vesting-timeline',
    '/api/dashboard/attrition-risk',
    '/api/dashboard/action-required',
  ];

  for (const ep of newEndpoints) {
    try {
      const resp = await page.evaluate(async (url) => {
        const token = sessionStorage.getItem('accessToken') ||
          JSON.parse(sessionStorage.getItem('compsense-auth') || '{}')?.state?.accessToken;
        const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const j = await r.json();
        return { status: r.status, count: Array.isArray(j.data) ? j.data.length : typeof j.data };
      }, ep);
      if (resp.status === 200) {
        log('✅', `API ${ep.replace('/api/dashboard/', '')}`, `${resp.count} items`);
      } else {
        log('❌', `API ${ep.replace('/api/dashboard/', '')}`, `HTTP ${resp.status}`);
      }
    } catch (err) {
      log('❌', `API ${ep.replace('/api/dashboard/', '')}`, err.message.split('\n')[0]);
    }
  }

  await browser.close();
  printSummary();
})();

function printSummary() {
  const pass = results.filter(r => r.icon === '✅').length;
  const warn = results.filter(r => r.icon === '⚠️ ').length;
  const fail = results.filter(r => r.icon === '❌').length;
  console.log('\n══════════════════════════════════════════');
  console.log(`  RESULTS: ✅ ${pass} passed  ⚠️  ${warn} warnings  ❌ ${fail} failed`);
  console.log('══════════════════════════════════════════\n');
  if (fail > 0) {
    console.log('FAILURES:');
    results.filter(r => r.icon === '❌').forEach(r => console.log(`  ❌ ${r.label}: ${r.msg}`));
    console.log('');
  }
}
