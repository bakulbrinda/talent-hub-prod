import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', 'admin@company.com');
await page.fill('input[name="password"]', 'Admin@123');
await Promise.all([
  page.waitForResponse(r => r.url().includes('/auth/login'), { timeout: 8000 }),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(2000);

const result = await page.evaluate(() => {
  const keys = Object.keys(sessionStorage);
  const store = sessionStorage.getItem('auth-store');
  const parsed = store ? JSON.parse(store) : null;
  const token = parsed?.state?.accessToken;
  return { keys, hasToken: !!token, tokenPreview: token ? token.slice(0, 30) : null };
});
console.log('sessionStorage keys:', result.keys);
console.log('Has token:', result.hasToken, '| preview:', result.tokenPreview);

// Try API call with token
const apiResult = await page.evaluate(async () => {
  const store = JSON.parse(sessionStorage.getItem('auth-store') || '{}');
  const token = store?.state?.accessToken;
  const r = await fetch('/api/dashboard/action-required', {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  });
  const body = await r.text();
  return { status: r.status, bodyPreview: body.slice(0, 100), hasToken: !!token };
});
console.log('API /action-required:', apiResult);

await browser.close();
