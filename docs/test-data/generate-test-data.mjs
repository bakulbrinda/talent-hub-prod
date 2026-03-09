// Run with: node docs/test-data/generate-test-data.mjs
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const XLSX = require('xlsx');

// ─── Reproducible RNG ───────────────────────────────────────────
let seed = 42;
function rand()            { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }
function pick(arr)         { return arr[Math.floor(rand() * arr.length)]; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function randFloat(min, max, dec = 1) { return parseFloat((rand() * (max - min) + min).toFixed(dec)); }
function randDate(s, e)    { const a = new Date(s).getTime(), b = new Date(e).getTime(); return new Date(a + rand() * (b - a)).toISOString().slice(0, 10); }
function round5k(n)        { return Math.round(n / 5000) * 5000; }
function round10k(n)       { return Math.round(n / 10000) * 10000; }

// ─── Name pools ─────────────────────────────────────────────────
const FN_F = ['Priya','Anita','Meera','Sneha','Pooja','Kavya','Nisha','Divya','Ritu','Swati','Rekha','Simran','Tanya','Usha','Vani','Lakshmi','Geeta','Hema','Isha','Jyoti','Komal','Leena','Mala','Neha','Asha','Bhavna','Charu','Deepa','Esha','Falguni','Gauri','Harini','Indira','Jasmine','Kalpana','Lata','Manisha','Namrata','Padma','Radha'];
const FN_M = ['Rohan','Kiran','Arjun','Suresh','Rajesh','Vikram','Amit','Nikhil','Sandeep','Rahul','Manish','Deepak','Ankur','Sachin','Vivek','Sanjay','Pranav','Gaurav','Harsh','Ishaan','Kartik','Lalit','Mohit','Naveen','Omkar','Piyush','Ravi','Siddharth','Tarun','Uday','Varun','Yash','Aarav','Bharat','Chetan','Dinesh','Eknath','Farhan','Girish','Hemant'];
const LAST  = ['Sharma','Mehta','Desai','Rao','Iyer','Patel','Kumar','Singh','Joshi','Nair','Kapoor','Verma','Gupta','Mishra','Tiwari','Reddy','Bose','Das','Pillai','Menon','Chatterjee','Mukherjee','Banerjee','Ghosh','Sen','Shah','Trivedi','Pandey','Dubey','Srivastava','Agarwal','Malhotra','Chauhan','Yadav','Thakur','Saxena','Shukla','Dwivedi','Bajaj','Bhat'];

// ─── Departments (weighted) ──────────────────────────────────────
const DEPARTMENTS = [
  ...Array(10).fill('Engineering'),
  ...Array(6).fill('Product'),
  ...Array(7).fill('Sales'),
  ...Array(4).fill('Marketing'),
  ...Array(4).fill('Finance'),
  ...Array(5).fill('Operations'),
  ...Array(3).fill('HR'),
  ...Array(3).fill('Design'),
  ...Array(4).fill('Data & Analytics'),
  ...Array(2).fill('Legal & Compliance'),
  ...Array(2).fill('Customer Success'),
];

// ─── Band config — salary ranges & variable pay % ───────────────
// fixedMin/fixedMax define the IN-BAND range.
// Outlier employees will be set outside these deliberately.
const BAND_CFG = [
  { band:'A1', grade:'A1A', min:380000,  max:590000,  varProb:0.25, varPcts:[0,0,3,5]       },
  { band:'A2', grade:'A2A', min:600000,  max:890000,  varProb:0.45, varPcts:[0,4,6,8]       },
  { band:'P1', grade:'P1A', min:900000,  max:1290000, varProb:0.80, varPcts:[10,12,14,15]   },
  { band:'P2', grade:'P2A', min:1300000, max:1850000, varProb:0.85, varPcts:[12,14,16,18]   },
  { band:'P3', grade:'P3A', min:1800000, max:2650000, varProb:0.88, varPcts:[15,18,20,22]   },
  { band:'M1', grade:'M1A', min:2600000, max:3900000, varProb:0.90, varPcts:[20,24,26,28]   },
  { band:'M2', grade:'M2A', min:3800000, max:5400000, varProb:0.92, varPcts:[25,28,30,32]   },
  { band:'D0', grade:'D0A', min:5200000, max:7600000, varProb:0.95, varPcts:[28,32,35,38]   },
  { band:'D1', grade:'D1A', min:7500000, max:11000000,varProb:0.95, varPcts:[32,36,40,44]   },
  { band:'D2', grade:'D2A', min:10000000,max:15500000,varProb:1.00, varPcts:[38,42,46,50]   },
];

// Weighted band pool — IC-heavy mid-bands dominate
const BAND_POOL = BAND_CFG.flatMap(b => {
  const w = { A1:6, A2:11, P1:22, P2:24, P3:18, M1:10, M2:5, D0:2, D1:1, D2:1 }[b.band];
  return Array(w).fill(b);
});

// ─── Designations ────────────────────────────────────────────────
const DESIG = {
  Engineering:         { A1:'Engineering Intern',     A2:'Associate Engineer',       P1:'Software Engineer',         P2:'Software Engineer II',      P3:'Senior Engineer',            M1:'Engineering Manager',         M2:'Senior Engineering Manager', D0:'Director of Engineering',  D1:'VP Engineering',   D2:'CTO'                   },
  Product:             { A1:'Product Intern',          A2:'Associate PM',             P1:'Product Manager',           P2:'Product Manager II',        P3:'Senior Product Manager',     M1:'Group Product Manager',       M2:'Director of Product',        D0:'VP Product',               D1:'SVP Product',      D2:'CPO'                   },
  Sales:               { A1:'Sales Intern',            A2:'Sales Development Rep',    P1:'Sales Executive',           P2:'Senior Sales Executive',    P3:'Account Manager',            M1:'Sales Manager',               M2:'Regional Sales Manager',     D0:'Director of Sales',        D1:'VP Sales',         D2:'Chief Revenue Officer' },
  Marketing:           { A1:'Marketing Intern',        A2:'Marketing Associate',      P1:'Marketing Specialist',      P2:'Senior Marketing Specialist',P3:'Marketing Lead',            M1:'Marketing Manager',           M2:'Senior Marketing Manager',   D0:'Director of Marketing',    D1:'VP Marketing',     D2:'CMO'                   },
  Finance:             { A1:'Finance Intern',          A2:'Finance Associate',        P1:'Financial Analyst',         P2:'Senior Financial Analyst',  P3:'Finance Lead',               M1:'Finance Manager',             M2:'Senior Finance Manager',     D0:'Director of Finance',      D1:'VP Finance',       D2:'CFO'                   },
  Operations:          { A1:'Operations Intern',       A2:'Operations Associate',     P1:'Operations Analyst',        P2:'Senior Operations Analyst', P3:'Operations Lead',            M1:'Operations Manager',          M2:'Senior Operations Manager',  D0:'Director of Operations',   D1:'VP Operations',    D2:'COO'                   },
  HR:                  { A1:'HR Intern',               A2:'HR Associate',             P1:'HR Specialist',             P2:'Senior HR Specialist',      P3:'HR Business Partner',        M1:'HR Manager',                  M2:'Senior HR Manager',          D0:'Director of HR',           D1:'VP People',        D2:'CHRO'                  },
  Design:              { A1:'Design Intern',           A2:'Associate Designer',       P1:'UI/UX Designer',            P2:'Senior Designer',           P3:'Lead Designer',              M1:'Design Manager',              M2:'Senior Design Manager',      D0:'Director of Design',       D1:'VP Design',        D2:'Chief Design Officer'  },
  'Data & Analytics':  { A1:'Data Intern',             A2:'Data Associate',           P1:'Data Analyst',              P2:'Senior Data Analyst',       P3:'Data Scientist',             M1:'Analytics Manager',           M2:'Senior Analytics Manager',   D0:'Director of Data',         D1:'VP Data',          D2:'Chief Data Officer'    },
  'Legal & Compliance':{ A1:'Legal Intern',            A2:'Legal Associate',          P1:'Legal Analyst',             P2:'Senior Legal Analyst',      P3:'Legal Counsel',              M1:'Legal Manager',               M2:'Senior Legal Manager',       D0:'Director of Legal',        D1:'VP Legal',         D2:'General Counsel'       },
  'Customer Success':  { A1:'CS Intern',               A2:'Customer Support Specialist',P1:'Customer Success Manager',P2:'Senior CSM',               P3:'CS Lead',                    M1:'CS Manager',                  M2:'Senior CS Manager',          D0:'Director of Customer Success',D1:'VP Customer Success',D2:'Chief Customer Officer'},
};

// ─── Performance profiles (determine revision cycle increments) ──
// These map to ratingFromIncrement in import.service.ts:
//   ≥15% → 5.0 Outstanding | ≥10% → 4.0 Exceeds | ≥5% → 3.0 Meets
//   >0%  → 2.5 Below       | 0%   → 2.0 Needs Improvement
const PERF_PROFILES = [
  { label:'OUTSTANDING', weight:15, incRange:[15, 22] },  // 5.0
  { label:'EXCEEDS',     weight:35, incRange:[10, 14] },  // 4.0
  { label:'MEETS',       weight:35, incRange:[ 5,  9] },  // 3.0
  { label:'BELOW',       weight:10, incRange:[ 1,  4] },  // 2.5
  { label:'NEEDS_IMP',   weight: 5, incRange:[ 0,  0] },  // 2.0 (0% = flat)
];
const PERF_POOL = PERF_PROFILES.flatMap(p => Array(p.weight).fill(p));

// ─── Work location / mode ────────────────────────────────────────
const LOCATIONS = [
  ...Array(10).fill('Bangalore'),
  ...Array(6).fill('Mumbai'),
  ...Array(5).fill('Hyderabad'),
  ...Array(4).fill('Pune'),
  ...Array(4).fill('Delhi'),
  ...Array(3).fill('Chennai'),
  ...Array(2).fill('Gurugram'),
  'Kolkata', 'Ahmedabad',
];
const WORKMODES = [...Array(9).fill('HYBRID'), ...Array(7).fill('REMOTE'), ...Array(4).fill('ONSITE')];

// ─── Revision cycle dates ─────────────────────────────────────────
const CYCLES = [
  { col: 'April 2023', date: new Date('2023-04-01') },
  { col: 'July 2023',  date: new Date('2023-07-01') },
  { col: 'April 2024', date: new Date('2024-04-01') },
  { col: 'July 2024',  date: new Date('2024-07-01') },
];

// ─── Generate 250 employees ──────────────────────────────────────
const EMP_COUNT = 250;
// ~10% outliers: 13 underpaid, 12 overpaid
const OUTLIER_UNDERPAID = new Set();
const OUTLIER_OVERPAID  = new Set();
while (OUTLIER_UNDERPAID.size < 13) OUTLIER_UNDERPAID.add(randInt(1, EMP_COUNT));
while (OUTLIER_OVERPAID.size  < 12) { const n = randInt(1, EMP_COUNT); if (!OUTLIER_UNDERPAID.has(n)) OUTLIER_OVERPAID.add(n); }

const usedEmails = new Set();
const empRows   = [];
const employees = []; // retained for benefits generation

for (let i = 1; i <= EMP_COUNT; i++) {
  const id = `EMP${String(i).padStart(4, '0')}`;

  // gender + name
  const gender    = pick(['Male','Male','Male','Female','Female','Female','Non Binary','Prefer Not To Say']);
  const firstName = (gender === 'Female') ? pick(FN_F) : pick(FN_M);
  const lastName  = pick(LAST);

  // unique email
  let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`;
  let sfx = 2;
  while (usedEmails.has(email)) { email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${sfx}@company.com`; sfx++; }
  usedEmails.add(email);

  const dept      = pick(DEPARTMENTS);
  const bandCfg   = pick(BAND_POOL);
  const { band, grade, min: bMin, max: bMax, varProb, varPcts } = bandCfg;
  const desigMap  = DESIG[dept] || DESIG['Engineering'];
  const desig     = desigMap[band] || `${dept} Specialist`;

  // join date + status
  const joinDate  = randDate('2016-01-01', '2025-10-01');
  const empType   = pick(['Full Time','Full Time','Full Time','Full Time','Part Time','Contract']);
  const empStatus = pick(['Active','Active','Active','Active','Active','Active','Active','On Leave','Inactive','Terminated']);

  // work mode + location
  const workMode  = pick(WORKMODES);
  const workLoc   = pick(LOCATIONS);

  // ── Performance profile ──────────────────────────────────────
  const perfProfile = pick(PERF_POOL);

  // ── Salary: base inside band, then outliers override ─────────
  let annualFixed = round10k(randInt(bMin, bMax));
  if (OUTLIER_UNDERPAID.has(i)) {
    // deliberately underpaid: 58–78% of band minimum
    annualFixed = round10k(Math.floor(bMin * randFloat(0.58, 0.78)));
  } else if (OUTLIER_OVERPAID.has(i)) {
    // deliberately overpaid: 122–148% of band maximum
    annualFixed = round10k(Math.floor(bMax * randFloat(1.22, 1.48)));
  }

  // ── Variable pay ──────────────────────────────────────────────
  const hasVariable = rand() < varProb;
  const varPct      = hasVariable ? pick(varPcts) : 0;
  const variablePay = varPct > 0 ? round5k(annualFixed * varPct / 100) : 0;
  const annualCtc   = annualFixed + variablePay;

  // ── Revision cycles (drive PerformanceRating on import) ──────
  // Work backwards from current annualFixed as the "July 2024" value.
  // Each earlier cycle = next_value / (1 + increment/100).
  const joinDt  = new Date(joinDate);
  const [incA, incB] = perfProfile.incRange;

  // Determine which cycles this employee participates in (must have joined before cycle date)
  const activeCycles = CYCLES.filter(c => joinDt < c.date);

  // Build cycle salary values working backwards from annualFixed
  const cycleSalaries = {}; // col → salary number
  if (activeCycles.length > 0) {
    let rollingVal = annualFixed;
    for (let ci = activeCycles.length - 1; ci >= 0; ci--) {
      const c = activeCycles[ci];
      cycleSalaries[c.col] = round10k(rollingVal);
      // For the next-earlier cycle, divide by (1 + increment)
      const inc = ci === 0 ? 0 : randFloat(incA, incB) / 100;  // first cycle has no prior → 0 increment (3.0 neutral)
      rollingVal = rollingVal / (1 + (inc || randFloat(5, 10) / 100)); // always some prior history
    }
  }

  empRows.push([
    id, firstName, lastName, email, dept, desig,
    joinDate, empType, empStatus, gender,
    annualFixed, variablePay, annualCtc, band, grade,
    workMode, workLoc,
    cycleSalaries['April 2023'] ?? '',
    cycleSalaries['July 2023']  ?? '',
    cycleSalaries['April 2024'] ?? '',
    cycleSalaries['July 2024']  ?? '',
  ]);

  employees.push({
    id, joinDate, band, annualFixed, empStatus, gender,
    isOutlierUnder: OUTLIER_UNDERPAID.has(i),
    isOutlierOver:  OUTLIER_OVERPAID.has(i),
    perfProfile: perfProfile.label,
  });
}

// ─── Write employees xlsx ────────────────────────────────────────
const empHeaders = [
  'Employee ID','First Name','Last Name','Email address','Department','Designation',
  'Date of Joining','Employment Type','Employment Status','Gender',
  'Annual Fixed','Variable Pay','Annual CTC','Band','Grade',
  'Work Mode','Work Location',
  'April 2023','July 2023','April 2024','July 2024',
];

const empWs = XLSX.utils.aoa_to_sheet([empHeaders, ...empRows]);
empWs['!cols'] = empHeaders.map(() => ({ wch: 22 }));
const empWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(empWb, empWs, 'Employees');
XLSX.writeFile(empWb, path.join(__dirname, 'test-employees.xlsx'));

// ─── Benefits data ───────────────────────────────────────────────
const RSU_BANDS    = ['P1','P2','P3','M1','M2','D0','D1','D2'];
const RSU_GRANT    = { P1:300000, P2:500000, P3:800000, M1:1500000, M2:2500000, D0:5000000, D1:8000000, D2:12000000 };

// Benefit catalog — each with enroll probability, whether it tracks utilization, etc.
const BEN_CATALOG = [
  // always-on
  { name:'Comprehensive Medical Insurance', prob:1.00, hasUtil:false,  maxVal:0,      category:'INSURANCE' },
  { name:'Term Life Insurance',             prob:0.88, hasUtil:false,  maxVal:0,      category:'INSURANCE' },
  // learning
  { name:'Training & Learning Allowance',   prob:0.80, hasUtil:true,   maxVal:50000,  category:'LEARNING'  },
  { name:'Book & Course Reimbursement',     prob:0.40, hasUtil:true,   maxVal:15000,  category:'LEARNING'  },
  // wellness
  { name:'Mental Health on Loop',           prob:0.55, hasUtil:false,  maxVal:0,      category:'WELLNESS'  },
  { name:'Gym & Wellness Allowance',        prob:0.52, hasUtil:true,   maxVal:24000,  category:'WELLNESS'  },
  { name:'Meal Card',                       prob:0.42, hasUtil:true,   maxVal:18000,  category:'WELLNESS'  },
  // transport / remote
  { name:'Commuter Allowance',              prob:0.40, hasUtil:true,   maxVal:24000,  category:'RECOGNITION'},
  { name:'Internet Reimbursement',          prob:0.55, hasUtil:true,   maxVal:18000,  category:'RECOGNITION'},
  // event
  { name:'Annual Company Offsite',          prob:0.70, hasUtil:false,  maxVal:0,      category:'RECOGNITION'},
  // leave (gender/status specific — handled separately)
  // performance
  { name:'Performance Bonus',               prob:0.35, hasUtil:true,   maxVal:250000, category:'RECOGNITION'},
  { name:'Retention Bonus',                 prob:0.15, hasUtil:true,   maxVal:300000, category:'RECOGNITION'},
];

const benHeaders = [
  'Employee ID','Benefit Name','Status','Utilization %','Utilized Value (₹)','Enrolled Date','Expiry Date',
];
const benRows = [];

for (const emp of employees) {
  const row     = empRows.find(r => r[0] === emp.id);
  const gender  = row[9];
  const joinDt  = emp.joinDate;
  const band    = emp.band;
  const active  = emp.empStatus === 'Active' || emp.empStatus === 'On Leave';

  // 1. Medical Insurance — everyone
  benRows.push([emp.id, 'Comprehensive Medical Insurance', 'ACTIVE', '', '', joinDt, '2026-03-31']);

  // 2. Term Life
  if (rand() < 0.88)
    benRows.push([emp.id, 'Term Life Insurance', 'ACTIVE', '', '', joinDt, '']);

  // 3. RSU for eligible bands (P1+) and active employees
  if (RSU_BANDS.includes(band) && active) {
    const grantVal = RSU_GRANT[band] || 300000;
    const tenureYrs = (new Date('2026-03-09') - new Date(joinDt)) / (365.25 * 24 * 3600 * 1000);
    // 25% cliff per year, max 100%
    const vestPct = Math.min(100, Math.floor(tenureYrs) * 25);
    const vestedVal = Math.round(grantVal * vestPct / 100);
    benRows.push([
      emp.id, 'RSU Grant', 'ACTIVE',
      vestPct  || '',
      vestedVal || '',
      joinDt, '',
    ]);
    // Second RSU tranche for senior bands (M1+) — simulates refresh grant
    if (['M1','M2','D0','D1','D2'].includes(band) && tenureYrs >= 2 && rand() > 0.4) {
      const refreshVal = Math.round(grantVal * 0.5);
      const refreshPct = Math.min(100, Math.floor(Math.max(0, tenureYrs - 2)) * 25);
      const refreshVested = Math.round(refreshVal * refreshPct / 100);
      const refreshStart = new Date(new Date(joinDt).getTime() + 2 * 365.25 * 86400000).toISOString().slice(0, 10);
      benRows.push([emp.id, 'RSU Grant — Refresh', 'ACTIVE', refreshPct || '', refreshVested || '', refreshStart, '']);
    }
  }

  // 4. Upcoming RSU vesting (vesting ~within 30 days from "today") — for RSU alert demo
  // ~5% of RSU-eligible employees get a near-vesting grant entry
  if (RSU_BANDS.includes(band) && active && rand() < 0.05) {
    const daysAhead = randInt(5, 28);
    const vestDate  = new Date(new Date('2026-03-09').getTime() + daysAhead * 86400000).toISOString().slice(0, 10);
    benRows.push([emp.id, 'RSU Grant — Vesting Soon', 'ACTIVE', '0', '0', vestDate, vestDate]);
  }

  // 5. Training & Learning — most employees, with utilization
  if (rand() < 0.80) {
    const utilPct = randInt(5, 100);
    const utilized = round5k(50000 * utilPct / 100);
    benRows.push([emp.id, 'Training & Learning Allowance', 'ACTIVE', utilPct, utilized, '2025-04-01', '2026-03-31']);
  }

  // 6. Other catalog benefits
  for (const ben of BEN_CATALOG.slice(3)) {
    if (rand() > ben.prob) continue;

    const enrolled = randDate(joinDt, '2025-12-01');
    const expiry   = rand() > 0.6 ? '2026-03-31' : (rand() > 0.5 ? '2025-12-31' : '');
    let utilPct = '', utilVal = '';
    if (ben.hasUtil) {
      utilPct = randInt(10, 100);
      utilVal = round5k(ben.maxVal * utilPct / 100);
    }
    benRows.push([emp.id, ben.name, 'ACTIVE', utilPct, utilVal, enrolled, expiry]);
  }

  // 7. Maternity Leave — female employees, ~12% probability
  if (gender === 'Female' && rand() < 0.12) {
    const leaveStart = randDate(joinDt, '2025-06-01');
    const leaveEnd   = new Date(new Date(leaveStart).getTime() + randInt(60, 90) * 86400000).toISOString().slice(0, 10);
    benRows.push([emp.id, 'Maternity Leave', 'CLAIMED', 100, '', leaveStart, leaveEnd]);
  }

  // 8. Paternity Leave — male employees, ~10% probability
  if ((gender === 'Male') && rand() < 0.10) {
    const leaveStart = randDate(joinDt, '2025-10-01');
    const leaveEnd   = new Date(new Date(leaveStart).getTime() + randInt(7, 15) * 86400000).toISOString().slice(0, 10);
    benRows.push([emp.id, 'Paternity Leave', 'CLAIMED', 100, '', leaveStart, leaveEnd]);
  }

  // 9. EXPIRED benefits — some employees have lapsed benefits (for expiry state demo)
  if (rand() < 0.25) {
    const expiredStart = randDate('2022-01-01', '2023-12-01');
    const expiredEnd   = randDate('2024-01-01', '2024-12-31');
    const expiredBen   = pick(['Gym & Wellness Allowance','Meal Card','Internet Reimbursement','Training & Learning Allowance']);
    benRows.push([emp.id, expiredBen, 'EXPIRED', 100, round5k(randInt(5000, 20000)), expiredStart, expiredEnd]);
  }

  // 10. High utilization "star" benefits — for OUTSTANDING performers demo
  if (emp.perfProfile === 'OUTSTANDING' && active) {
    benRows.push([emp.id, 'Performance Bonus', 'ACTIVE', 100, round5k(randInt(100000, 250000)), '2025-04-01', '2026-03-31']);
  }
}

// ─── Write benefits xlsx ─────────────────────────────────────────
const benWs = XLSX.utils.aoa_to_sheet([benHeaders, ...benRows]);
benWs['!cols'] = benHeaders.map(() => ({ wch: 26 }));
const benWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(benWb, benWs, 'Benefits');
XLSX.writeFile(benWb, path.join(__dirname, 'test-benefits.xlsx'));

// ─── Summary ─────────────────────────────────────────────────────
const bandCounts = {};
empRows.forEach(r => { bandCounts[r[13]] = (bandCounts[r[13]] || 0) + 1; });
const statusCounts = {};
empRows.forEach(r => { statusCounts[r[8]] = (statusCounts[r[8]] || 0) + 1; });
const modeCounts = {};
empRows.forEach(r => { modeCounts[r[15]] = (modeCounts[r[15]] || 0) + 1; });
const varCount = empRows.filter(r => Number(r[11]) > 0).length;
const outlierCount = OUTLIER_UNDERPAID.size + OUTLIER_OVERPAID.size;
const cycleCount = empRows.filter(r => r[17] !== '' || r[18] !== '' || r[19] !== '' || r[20] !== '').length;
const perfCounts = {};
employees.forEach(e => { perfCounts[e.perfProfile] = (perfCounts[e.perfProfile] || 0) + 1; });
const benNameCounts = {};
benRows.forEach(r => { benNameCounts[r[1]] = (benNameCounts[r[1]] || 0) + 1; });

console.log(`\n✓ test-employees.xlsx — ${EMP_COUNT} employees`);
console.log(`  Bands         :`, JSON.stringify(bandCounts));
console.log(`  Statuses      :`, JSON.stringify(statusCounts));
console.log(`  Work Modes    :`, JSON.stringify(modeCounts));
console.log(`  Variable Pay  : ${varCount} employees (${Math.round(varCount/EMP_COUNT*100)}%)`);
console.log(`  Outliers      : ${OUTLIER_UNDERPAID.size} underpaid + ${OUTLIER_OVERPAID.size} overpaid = ${outlierCount} total (${Math.round(outlierCount/EMP_COUNT*100)}%)`);
console.log(`  Perf profiles :`, JSON.stringify(perfCounts));
console.log(`  With rev cycles: ${cycleCount} employees`);
console.log(`\n✓ test-benefits.xlsx — ${benRows.length} benefit rows`);
console.log(`  Benefit types :`, JSON.stringify(benNameCounts));
