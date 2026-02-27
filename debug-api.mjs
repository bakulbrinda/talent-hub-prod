import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Log all network
page.on('response', r => {
  if (r.url().includes('/api/dashboard/')) {
    console.log('RESPONSE:', r.url(), '→', r.status());
  }
});

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', 'admin@company.com');
await page.fill('input[name="password"]', 'Admin@123');
await Promise.all([
  page.waitForResponse(r => r.url().includes('/auth/login'), { timeout: 8000 }),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(2000);

// Go to dashboard to trigger all new endpoint calls
await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Now try manual fetch
const result = await page.evaluate(async () => {
  const token = sessionStorage.getItem('accessToken');
  const results = {};
  const endpoints = [
    '/api/dashboard/comp-vs-performance',
    '/api/dashboard/action-required',
  ];
  for (const ep of endpoints) {
    const r = await fetch(ep, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    results[ep] = { status: r.status, token: token ? token.slice(0,10) + '...' : 'NONE' };
  }
  return results;
});

console.log('\nManual fetch results:', JSON.stringify(result, null, 2));
await browser.close();
