// Run with: node docs/test-data/generate-test-data.mjs
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve xlsx from the backend's node_modules (xlsx is not installed at root)
const require = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const XLSX = require('xlsx');

// ─── Employee test file ────────────────────────────────────────
const empHeaders = [
  'Employee ID','First Name','Last Name','Email address','Department','Designation',
  'Date of Joining','Employment Type','Employment Status','Gender',
  'Annual Fixed','Variable Pay','Annual CTC','Band','Grade',
];

const empRows = [
  ['TEST001','Priya','Sharma','priya.sharma@test.com','Engineering','Software Engineer','2022-06-01','Full Time','Active','Female','1200000','120000','1320000','P2','P2A'],
  ['TEST002','Rohan','Mehta','rohan.mehta@test.com','Sales','Sales Executive','2023-01-15','Full Time','Active','Male','900000','180000','1080000','P1','P1A'],
  ['TEST003','Anita','Desai','anita.desai@test.com','HR','HR Specialist','2021-09-01','Full Time','Active','Female','1000000','80000','1080000','P2','P2B'],
  ['TEST004','Kiran','Rao','kiran.rao@test.com','Engineering','Senior Engineer','2020-03-01','Full Time','Active','Male','1800000','180000','1980000','P3','P3A'],
  ['TEST005','Meera','Iyer','meera.iyer@test.com','Engineering','Engineering Manager','2019-07-01','Full Time','Active','Female','2800000','280000','3080000','M1','M1A'],
];

const empWs = XLSX.utils.aoa_to_sheet([empHeaders, ...empRows]);
empWs['!cols'] = empHeaders.map(() => ({ wch: 20 }));
const empWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(empWb, empWs, 'Employees');
XLSX.writeFile(empWb, path.join(__dirname, 'test-employees.xlsx'));
console.log('Created test-employees.xlsx');

// ─── Benefits test file ────────────────────────────────────────
const benHeaders = [
  'Employee ID','Benefit Name','Status','Utilization %','Utilized Value (₹)','Enrolled Date','Expiry Date',
];

const benRows = [
  ['TEST001','Comprehensive Medical Insurance','ACTIVE','','','2022-06-01','2025-03-31'],
  ['TEST001','RSU Grant','ACTIVE','25','75000','2022-06-01',''],
  ['TEST001','Training & Learning Allowance','ACTIVE','40','8000','2024-04-01',''],
  ['TEST002','Comprehensive Medical Insurance','ACTIVE','','','2023-01-15','2025-03-31'],
  ['TEST002','Mental Health on Loop','ACTIVE','','','2023-01-15',''],
  ['TEST003','Comprehensive Medical Insurance','ACTIVE','','','2021-09-01','2025-03-31'],
  ['TEST003','Paternity Leave','CLAIMED','100','','2024-02-01','2024-02-15'],
  ['TEST004','RSU Grant','ACTIVE','50','250000','2020-03-01',''],
  ['TEST004','Comprehensive Medical Insurance','ACTIVE','','','2020-03-01','2025-03-31'],
  ['TEST005','RSU Grant','ACTIVE','75','630000','2019-07-01',''],
  ['TEST005','Annual Company Offsite','ACTIVE','','','2024-01-01','2024-12-31'],
];

const benWs = XLSX.utils.aoa_to_sheet([benHeaders, ...benRows]);
benWs['!cols'] = benHeaders.map(() => ({ wch: 20 }));
const benWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(benWb, benWs, 'Benefits');
XLSX.writeFile(benWb, path.join(__dirname, 'test-benefits.xlsx'));
console.log('Created test-benefits.xlsx');
