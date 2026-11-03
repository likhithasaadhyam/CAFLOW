import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';
import { TaskStatus, RoleType } from '@prisma/client';

const router = Router();

router.get(
  '/summary',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.ACCOUNTANT, RoleType.MANAGER),
  async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;

    const totalClients = await prisma.client.count({ where: { organizationId: orgId } });
    const activeTasks = await prisma.task.count({ where: { organizationId: orgId, status: { not: TaskStatus.COMPLETED } } });
    const completedTasks = await prisma.task.count({ where: { organizationId: orgId, status: TaskStatus.COMPLETED } });
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: orgId },
      select: { totalAmount: true, amountPaid: true, balanceDue: true, paymentStatus: true },
    });
    const timesheets = await prisma.timesheetEntry.findMany({
      where: { organizationId: orgId },
      select: { durationMinutes: true, isBillable: true },
    });
    const employees = await prisma.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, fullName: true, role: true, department: true },
    });

    const totalBilled = invoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
    const totalCollected = invoices.reduce((acc, inv) => acc + inv.amountPaid, 0);
    const totalOutstanding = invoices.reduce((acc, inv) => acc + inv.balanceDue, 0);

    const totalHours = timesheets.reduce((acc, t) => acc + t.durationMinutes, 0) / 60;
    const billableHours = timesheets.filter(t => t.isBillable).reduce((acc, t) => acc + t.durationMinutes, 0) / 60;

    // Service workload
    const services = await prisma.service.findMany({
      where: { organizationId: orgId },
      select: {
        name: true,
        category: true,
        _count: { select: { tasks: true } },
      },
      orderBy: { tasks: { _count: 'desc' } },
      take: 8,
    });

    const workloadData = services.map(s => ({
      service: s.name,
      tasks: s._count.tasks,
      category: s.category,
    }));

    res.json({
      success: true,
      data: {
        kpis: {
          totalClients,
          activeTasks,
          completedTasks,
          completionRate: activeTasks + completedTasks > 0 ? Math.round((completedTasks / (activeTasks + completedTasks)) * 100) : 100,
          totalBilled,
          totalCollected,
          totalOutstanding,
          totalHours: Math.round(totalHours),
          billableHours: Math.round(billableHours),
          billableRate: totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0,
        },
        workload: workloadData,
        invoiceBreakdown: {
          paid: invoices.filter(i => i.paymentStatus === 'PAID').length,
          issued: invoices.filter(i => i.paymentStatus === 'ISSUED').length,
          partiallyPaid: invoices.filter(i => i.paymentStatus === 'PARTIALLY_PAID').length,
          overdue: invoices.filter(i => i.paymentStatus === 'OVERDUE').length,
        },
        employeeCount: employees.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
