import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import path from 'path';

const p = new PrismaClient();

async function run() {
  const filePath = path.join(process.env.HOME!, 'Desktop/TalentHub_Benefits_RSU_1000.xlsx');
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(ws);
  console.log(`Loaded ${rows.length} rows from Excel`);

  const catalog = await p.benefitsCatalog.findMany();
  const catalogMap = new Map(catalog.map(c => [c.name.toLowerCase(), c.id]));

  const employees = await p.employee.findMany({ select: { id: true, employeeId: true } });
  const empMap = new Map(employees.map(e => [e.employeeId, e.id]));
  console.log(`Catalog: ${catalogMap.size} items | Employees: ${empMap.size}`);

  // Clear existing
  await p.employeeBenefit.deleteMany();
  console.log('Cleared existing benefit records');

  // Build records
  const seen = new Set<string>();
  const records: any[] = [];
  for (const row of rows) {
    const empId = String(row['Employee ID'] || '').trim();
    const benName = String(row['Benefit Name'] || '').trim();
    const internalEmpId = empMap.get(empId);
    const benefitId = catalogMap.get(benName.toLowerCase());
    if (!internalEmpId || !benefitId) continue;
    const key = `${internalEmpId}::${benefitId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const status = ['ACTIVE', 'EXPIRED', 'CLAIMED'].includes(row['Status']) ? row['Status'] : 'ACTIVE';
    const enrolledAt = row['Enrolled Date'] ? new Date(row['Enrolled Date']) : new Date();
    const rawExpiry = row['Expiry Date'] ? new Date(row['Expiry Date']) : null;
    const expiresAt = rawExpiry && !isNaN(rawExpiry.getTime()) ? rawExpiry : null;
    records.push({
      employeeId: internalEmpId, benefitId,
      utilizationPercent: parseFloat(row['Utilization %'] || '0') || 0,
      utilizedValue: parseFloat(row['Utilized Value (Rs)'] || '0') || 0,
      status, enrolledAt, expiresAt,
    });
  }

  console.log(`Inserting ${records.length} records in batches of 500...`);
  const BATCH = 500;
  let total = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const r = await p.employeeBenefit.createMany({ data: batch });
    total += r.count;
    console.log(`  Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(records.length / BATCH)}: inserted ${r.count}`);
  }

  console.log(`\nDone — ${total} benefit records inserted`);
  await p.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
