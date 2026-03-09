/**
 * Creates the 4 platform user accounts defined in the account structure.
 *
 * | # | Account                | Role      | Default Password     |
 * |---|------------------------|-----------|----------------------|
 * | 1 | Developer              | ADMIN     | TalentHub@Dev1       |
 * | 2 | Senior HR Manager      | ADMIN     | TalentHub@Hr2        |
 * | 3 | HR Staff Employee A    | HR_STAFF  | TalentHub@Staff3     |
 * | 4 | HR Staff Employee B    | HR_STAFF  | TalentHub@Staff4     |
 *
 * Usage:
 *   cd backend && npx ts-node scripts/seed-platform-users.ts
 *
 * All accounts are upserted (safe to re-run). Passwords are hashed with bcrypt.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Default permissions for HR_STAFF — mirrors HR_STAFF_DEFAULT_PERMISSIONS from shared/constants
const HR_STAFF_DEFAULTS = [
  'dashboard',
  'employee.view',
  'employee.manage',
  'employee.delete',
  'pay_equity',
  'salary_bands',
  'scenario.view',
  'scenario.run',
  'benefits.view',
  'benefits.manage',
  'variable_pay',
  'performance.view',
  'performance.manage',
  'ai_insights',
  'data_center',
  'notifications',
  'email',
  // Excluded: scenario.apply, ai_scan, audit_log, user.manage, settings.platform
];

const USERS = [
  {
    name: 'Developer',
    email: 'dev@talenthub.internal',
    password: 'TalentHub@Dev1',
    role: 'ADMIN' as const,
    permissions: [] as string[],
  },
  {
    name: 'Senior HR Manager',
    email: 'hr.manager@talenthub.internal',
    password: 'TalentHub@Hr2',
    role: 'ADMIN' as const,
    permissions: [] as string[],
  },
  {
    name: 'HR Staff Employee A',
    email: 'hr.staff.a@talenthub.internal',
    password: 'TalentHub@Staff3',
    role: 'HR_STAFF' as const,
    permissions: HR_STAFF_DEFAULTS,
  },
  {
    name: 'HR Staff Employee B',
    email: 'hr.staff.b@talenthub.internal',
    password: 'TalentHub@Staff4',
    role: 'HR_STAFF' as const,
    permissions: HR_STAFF_DEFAULTS,
  },
];

async function main() {
  console.log('Seeding platform user accounts…\n');

  for (const u of USERS) {
    const hashed = await bcrypt.hash(u.password, 12);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, password: hashed, role: u.role, permissions: u.permissions },
      create: { email: u.email, name: u.name, password: hashed, role: u.role, permissions: u.permissions },
    });
    console.log(`✅  [${user.role.padEnd(8)}]  ${user.name.padEnd(24)}  ${user.email}`);
  }

  console.log('\nAll 4 accounts ready. Login at your Talent Hub URL.');
}

main()
  .catch((e) => { console.error('❌ Failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
