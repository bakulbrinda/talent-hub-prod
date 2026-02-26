import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '../lib/prisma';

const router = Router();
router.use(authenticate);

// ─── CSV Export: Employees ────────────────────────────────────
router.get('/employees/csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE' },
      orderBy: { lastName: 'asc' },
    });

    const headers = [
      'Employee ID', 'First Name', 'Last Name', 'Email', 'Department',
      'Designation', 'Band', 'Grade', 'Employment Type', 'Work Location',
      'Annual Fixed', 'Annual CTC', 'Compa Ratio', 'Date of Joining', 'Gender',
    ];

    const rows = employees.map(e => [
      e.employeeId, e.firstName, e.lastName, e.email, e.department,
      e.designation, e.band, e.grade || '', e.employmentType, e.workLocation || '',
      Number(e.annualFixed), Number(e.annualCtc), Number(e.compaRatio || 0),
      new Date(e.dateOfJoining).toLocaleDateString('en-IN'), e.gender,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
    res.send(csv);
  } catch (e) { next(e); }
});

// ─── JSON Export: Employees ───────────────────────────────────
router.get('/employees/json', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE' },
      orderBy: { lastName: 'asc' },
    });
    res.setHeader('Content-Disposition', 'attachment; filename="employees.json"');
    res.json({
      data: employees,
      exportedAt: new Date().toISOString(),
      count: employees.length,
    });
  } catch (e) { next(e); }
});

// ─── JSON Export: Pay Equity ──────────────────────────────────
router.get('/pay-equity/json', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE' },
      select: {
        department: true,
        band: true,
        gender: true,
        annualFixed: true,
        compaRatio: true,
      },
    });
    res.setHeader('Content-Disposition', 'attachment; filename="pay-equity.json"');
    res.json({ data: employees, exportedAt: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ─── CSV Export: Salary Bands ─────────────────────────────────
router.get('/salary-bands/csv', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const bands = await prisma.salaryBand.findMany({
      include: { band: true, jobArea: true },
    });

    const headers = [
      'Band Code', 'Job Area', 'Min Salary', 'Mid Salary', 'Max Salary',
      'Currency', 'Effective Date',
    ];

    const rows = bands.map(b => [
      b.band.code,
      b.jobArea?.name || '',
      Number(b.minSalary),
      Number(b.midSalary),
      Number(b.maxSalary),
      b.currency,
      new Date(b.effectiveDate).toLocaleDateString('en-IN'),
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="salary-bands.csv"');
    res.send(csv);
  } catch (e) { next(e); }
});

// ─── JSON Export: Scenario by ID ─────────────────────────────
router.get('/scenarios/:id/csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scenario = await prisma.scenario.findUnique({ where: { id: req.params.id } });
    if (!scenario) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Scenario not found' } });
    }
    const safeName = scenario.name.replace(/\s+/g, '-');
    res.setHeader('Content-Disposition', `attachment; filename="scenario-${safeName}.json"`);
    res.json({ scenario, exportedAt: new Date().toISOString() });
  } catch (e) { next(e); }
});

export default router;
