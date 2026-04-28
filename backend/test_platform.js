const http = require('http');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const TOKEN = jwt.sign(
  { userId: '5f4d4120-520b-4cd8-ac59-f6e16b78dbe6', email: 'admin@company.com', role: 'ADMIN' },
  process.env.JWT_SECRET,
  { expiresIn: '2h' }
);

function req(method, path, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3002, path: `/api${path}`, method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      }
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: res.statusCode < 400 && ('data' in parsed || parsed.status === 'ok'), status: res.statusCode, body: parsed });
        } catch {
          resolve({ ok: res.statusCode === 200, status: res.statusCode, body: data.slice(0, 80) });
        }
      });
    });
    r.on('error', e => resolve({ ok: false, status: 0, body: e.message }));
    if (payload) r.write(payload);
    r.end();
  });
}

const get  = (p)    => req('GET',    p);
const post = (p, b) => req('POST',   p, b);
const del  = (p)    => req('DELETE', p);

const PASS = [], FAIL = [];
function check(label, r) {
  if (r.ok) { PASS.push(label); process.stdout.write('  \u2705 ' + label + '\n'); }
  else       { FAIL.push(label); process.stdout.write('  \u274c ' + label + ' [' + r.status + ']: ' + JSON.stringify(r.body).slice(0,150) + '\n'); }
}

async function run() {
  console.log('\n-- AUTH');
  check('GET /auth/me',       await get('/auth/me'));
  check('GET /auth/sessions', await get('/auth/sessions'));
  check('GET /settings/org',  await get('/settings/org'));

  console.log('\n-- DASHBOARD');
  check('GET /dashboard/kpis',                   await get('/dashboard/kpis'));
  check('GET /dashboard/salary-distribution',    await get('/dashboard/salary-distribution'));
  check('GET /dashboard/band-distribution',      await get('/dashboard/band-distribution'));
  check('GET /dashboard/pay-equity-summary',     await get('/dashboard/pay-equity-summary'));
  check('GET /dashboard/comp-vs-performance',    await get('/dashboard/comp-vs-performance'));
  check('GET /dashboard/attrition-risk',         await get('/dashboard/attrition-risk'));
  check('GET /dashboard/dept-pay-equity-heatmap',await get('/dashboard/dept-pay-equity-heatmap'));
  check('GET /dashboard/compensation-trend',     await get('/dashboard/compensation-trend'));
  check('GET /dashboard/rsu-vesting-timeline',   await get('/dashboard/rsu-vesting-timeline'));
  check('GET /dashboard/action-required',        await get('/dashboard/action-required'));

  console.log('\n-- EMPLOYEES');
  check('GET /employees',                   await get('/employees?page=1&limit=10'));
  check('GET /employees/analytics/summary', await get('/employees/analytics/summary'));
  const ce = await post('/employees', {
    firstName:'Test',lastName:'User',email:'test.e2e@example.com',
    employeeId:'E2ETEST01',department:'Engineering',designation:'Engineer',
    band:'P1',dateOfJoining:'2023-01-01',annualFixed:1200000,annualCtc:1400000,
    gender:'MALE',employmentStatus:'ACTIVE'
  });
  check('POST /employees', ce);
  const empId = ce.body?.data?.id;
  if (empId) {
    check('GET /employees/:id',    await get('/employees/' + empId));
    check('PUT /employees/:id',    await req('PUT', '/employees/' + empId, { designation:'Senior Engineer' }));
    check('DELETE /employees/:id', await del('/employees/' + empId));
  }

  console.log('\n-- JOB ARCHITECTURE');
  check('GET /bands',                      await get('/bands'));
  check('GET /job-areas',                  await get('/job-areas'));
  check('GET /job-families',               await get('/job-families'));
  check('GET /grades',                     await get('/grades'));
  check('GET /job-codes',                  await get('/job-codes'));
  check('GET /skills',                     await get('/skills'));
  check('GET /job-architecture/hierarchy', await get('/job-architecture/hierarchy'));

  console.log('\n-- SALARY BANDS');
  check('GET /salary-bands',                   await get('/salary-bands'));
  check('GET /salary-bands/market-benchmarks', await get('/salary-bands/market-benchmarks'));
  check('GET /salary-bands/analysis/outliers', await get('/salary-bands/analysis/outliers'));

  console.log('\n-- PAY EQUITY');
  check('GET /pay-equity/score',                    await get('/pay-equity/score'));
  check('GET /pay-equity/gender-gap',               await get('/pay-equity/gender-gap'));
  check('GET /pay-equity/heatmap',                  await get('/pay-equity/heatmap'));
  check('GET /pay-equity/compa-ratio-distribution', await get('/pay-equity/compa-ratio-distribution'));
  check('GET /pay-equity/outliers',                 await get('/pay-equity/outliers'));
  check('GET /pay-equity/new-hire-parity',          await get('/pay-equity/new-hire-parity'));

  console.log('\n-- PERFORMANCE');
  check('GET /performance/matrix',              await get('/performance/matrix'));
  check('GET /performance/promotion-readiness', await get('/performance/promotion-readiness'));
  check('GET /performance/pay-alignment-gaps',  await get('/performance/pay-alignment-gaps'));
  check('GET /performance/cycles',              await get('/performance/cycles'));
  check('GET /performance/ratings',             await get('/performance/ratings'));

  console.log('\n-- SCENARIOS');
  check('GET /scenarios', await get('/scenarios'));
  const sc = await post('/scenarios', {
    name:'E2E Test Raise', description:'Auto test',
    rules:[{ filter:{ bands:['P1'] }, action:{ type:'PERCENT_INCREASE', value:10 } }]
  });
  check('POST /scenarios', sc);
  const scId = sc.body?.data?.id;
  if (scId) {
    check('GET /scenarios/:id',      await get('/scenarios/' + scId));
    check('POST /scenarios/:id/run', await post('/scenarios/' + scId + '/run', {}));
    check('DELETE /scenarios/:id',   await del('/scenarios/' + scId));
  }

  console.log('\n-- BENEFITS');
  check('GET /benefits/catalog',          await get('/benefits/catalog'));
  check('GET /benefits/utilization',      await get('/benefits/utilization'));
  check('GET /benefits/enrollments',      await get('/benefits/enrollments'));
  check('GET /benefits/category-summary', await get('/benefits/category-summary'));
  check('GET /benefits/ai-analysis',      await get('/benefits/ai-analysis'));

  console.log('\n-- RSU');
  check('GET /rsu',                  await get('/rsu'));
  check('GET /rsu/summary',          await get('/rsu/summary'));
  check('GET /rsu/vesting-schedule', await get('/rsu/vesting-schedule'));
  check('GET /rsu/eligibility-gap',  await get('/rsu/eligibility-gap'));

  console.log('\n-- VARIABLE PAY');
  check('GET /variable-pay/analytics',    await get('/variable-pay/analytics'));
  check('GET /variable-pay/plans',        await get('/variable-pay/plans'));
  check('GET /variable-pay/achievements', await get('/variable-pay/achievements'));

  console.log('\n-- NOTIFICATIONS');
  check('GET /notifications',         await get('/notifications'));
  check('GET /notifications/summary', await get('/notifications/summary'));

  console.log('\n-- USERS');
  check('GET /users',         await get('/users'));
  check('GET /users/invites', await get('/users/invites'));

  console.log('\n-- AI');
  check('GET /ai/chat/history',              await get('/ai/chat/history'));
  check('GET /ai-insights',                  await get('/ai-insights'));
  check('GET /ai-insights/dashboard-summary',await get('/ai-insights/dashboard-summary'));

  console.log('\n-- EXPORT');
  check('GET /export/employees/csv',   await get('/export/employees/csv'));
  check('GET /export/employees/json',  await get('/export/employees/json'));
  check('GET /export/pay-equity/json', await get('/export/pay-equity/json'));
  check('GET /export/salary-bands/csv',await get('/export/salary-bands/csv'));

  console.log('\n-- IMPORT TEMPLATES');
  check('GET /import/template',          await get('/import/template'));
  check('GET /import/benefits/template', await get('/import/benefits/template'));

  console.log('\n-- EMAIL');
  check('GET /email/mail-logs', await get('/email/mail-logs'));

  console.log('\n-- APP LOGS');
  check('GET /app-logs',       await get('/app-logs'));
  check('GET /app-logs/stats', await get('/app-logs/stats'));
  check('GET /app-logs/users', await get('/app-logs/users'));

  console.log('\n=====================================================');
  console.log('PASSED: ' + PASS.length + '  FAILED: ' + FAIL.length + '  TOTAL: ' + (PASS.length + FAIL.length));
  if (FAIL.length > 0) {
    console.log('\nFailed:');
    FAIL.forEach(f => console.log('  - ' + f));
  } else {
    console.log('\nAll endpoints passing!');
  }
}

run().catch(console.error);
