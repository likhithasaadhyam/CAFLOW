import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { TaskStatus, RoleType } from '@prisma/client';

const router = Router();

router.get('/metrics', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const clientId = req.user!.clientId;

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
    const endOfTomorrow = new Date(endOfToday.getTime() + 86400000);
    const in7Days = new Date(startOfToday.getTime() + 7 * 86400000);
    const past7Days = new Date(startOfToday.getTime() - 7 * 86400000);

    // =========================================================================
    // 1. CLIENT ROLE DASHBOARD
    // =========================================================================
    if (userRole === RoleType.CLIENT) {
      if (!clientId) {
        res.json({
          success: true,
          role: userRole,
          data: {
            clientEntity: null,
            tasks: [],
            invoices: [],
            documentRequests: [],
            renewals: [],
            summary: { activeTasks: 0, unpaidAmount: 0, pendingDocs: 0 },
          },
        });
        return;
      }

      const [clientRecord, clientTasks, clientInvoices, docRequests, renewals] = await Promise.all([
        prisma.client.findUnique({
          where: { id: clientId },
          select: { id: true, name: true, pan: true, gstin: true, primaryContact: true, mobile: true, email: true },
        }),
        prisma.task.findMany({
          where: { organizationId: orgId, clientId },
          include: { service: { select: { name: true, category: true } } },
          orderBy: { dueDate: 'asc' },
        }),
        prisma.invoice.findMany({
          where: { organizationId: orgId, clientId },
          include: { lineItems: true, payments: true },
          orderBy: { invoiceDate: 'desc' },
        }),
        prisma.documentRequest.findMany({
          where: { organizationId: orgId, clientId },
          include: { items: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.renewal.findMany({
          where: { organizationId: orgId, clientId },
          orderBy: { expiryDate: 'asc' },
        }),
      ]);

      const unpaidInvoices = clientInvoices.filter(i => i.paymentStatus !== 'PAID');
      const unpaidTotal = unpaidInvoices.reduce((acc, i) => acc + i.balanceDue, 0);
      const pendingDocsCount = docRequests.reduce(
        (acc, r) => acc + r.items.filter(it => it.status === 'REQUESTED').length,
        0
      );

      res.json({
        success: true,
        role: userRole,
        data: {
          clientEntity: clientRecord,
          tasks: clientTasks,
          invoices: clientInvoices,
          documentRequests: docRequests,
          renewals,
          summary: {
            activeTasks: clientTasks.filter(t => t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED).length,
            completedTasks: clientTasks.filter(t => t.status === TaskStatus.COMPLETED).length,
            unpaidAmount: unpaidTotal,
            unpaidInvoicesCount: unpaidInvoices.length,
            pendingDocs: pendingDocsCount,
            activeRenewals: renewals.length,
          },
        },
      });
      return;
    }

    // =========================================================================
    // 2. STAFF ROLES (Owner, Admin, Manager, Accountant, Tax Pro, Employee)
    // =========================================================================
    let taskWhere: any = { organizationId: orgId };

    if (userRole === RoleType.EMPLOYEE) {
      taskWhere.assignments = { some: { userId } };
    } else if (userRole === RoleType.TAX_PROFESSIONAL) {
      taskWhere.OR = [
        { assignments: { some: { userId } } },
        { reviewerId: userId },
        { service: { category: { in: ['Direct Tax', 'Indirect Tax', 'Audit', 'IPR & Legal', 'Licensing'] } } },
      ];
    }

    const isFinancialRole = ([RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.ACCOUNTANT, RoleType.MANAGER] as RoleType[]).includes(userRole);
    const isManagerRole = ([RoleType.MANAGER, RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN] as RoleType[]).includes(userRole);
    const isTaxProRole = ([RoleType.TAX_PROFESSIONAL, RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN] as RoleType[]).includes(userRole);
    const isEmployeeRole = userRole === RoleType.EMPLOYEE;

    // 1. Single Task query that satisfies counters, reviewQueue, upcoming deadlines, and service mapping
    const tasksPromise = prisma.task.findMany({
      where: taskWhere,
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        priority: true,
        serviceId: true,
        client: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, category: true } },
        assignments: isManagerRole ? { include: { user: { select: { fullName: true } } } } : false,
      },
      orderBy: { dueDate: 'asc' },
    });

    // 2. User Attendance Widget
    const attendancePromise = prisma.attendanceRecord.findFirst({
      where: {
        organizationId: orgId,
        userId: userId,
        date: { gte: startOfToday, lte: endOfToday },
      },
      include: {
        events: { orderBy: { timestamp: 'asc' } },
      },
    });

    // 3. User Todos for Today
    const todosPromise = prisma.todo.findMany({
      where: {
        organizationId: orgId,
        userId: userId,
      },
      take: 10,
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });

    // 4. Services list for workload breakdown
    const servicesPromise = prisma.service.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, category: true },
      orderBy: { name: 'asc' },
    });

    // 5. Invoices & Billing Aggregation (Financial roles)
    const invoicesPromise = isFinancialRole
      ? prisma.invoice.findMany({
          where: {
            organizationId: orgId,
            paymentStatus: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
          },
          include: { client: { select: { name: true } } },
          orderBy: { dueDate: 'asc' },
          take: 5,
        })
      : Promise.resolve(null);

    const totalBilledAggPromise = isFinancialRole
      ? prisma.invoice.aggregate({
          where: { organizationId: orgId },
          _sum: { totalAmount: true, amountPaid: true, balanceDue: true },
        })
      : Promise.resolve(null);

    // 6. Manager timesheets & attendance counts (Manager roles)
    const pendingTimesheetsCountPromise = isManagerRole
      ? prisma.timesheetEntry.count({
          where: { organizationId: orgId, status: 'SUBMITTED' },
        })
      : Promise.resolve(null);

    const todayAttendanceCountPromise = isManagerRole
      ? prisma.attendanceRecord.count({
          where: { organizationId: orgId, date: { gte: startOfToday, lte: endOfToday }, status: 'PRESENT' },
        })
      : Promise.resolve(null);

    // 7. Employee timesheets (Employee roles)
    const employeeTimesheetsPromise = isEmployeeRole
      ? prisma.timesheetEntry.findMany({
          where: {
            organizationId: orgId,
            userId,
            workDate: { gte: past7Days },
          },
          select: { durationMinutes: true, isBillable: true },
        })
      : Promise.resolve(null);

    // 8. Team members / Employees for Admin and Management overview
    const teamPromise = prisma.user.findMany({
      where: { organizationId: orgId, role: { not: RoleType.CLIENT } },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        designation: true,
        department: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Run ALL independent queries concurrently in a single roundtrip batch
    const [
      tasks,
      todayAttendance,
      todayTodos,
      services,
      invoices,
      totalBilledAgg,
      pendingTimesheetsCount,
      todayAttendanceCount,
      employeeTimesheets,
      teamMembers,
    ] = await Promise.all([
      tasksPromise,
      attendancePromise,
      todosPromise,
      servicesPromise,
      invoicesPromise,
      totalBilledAggPromise,
      pendingTimesheetsCountPromise,
      todayAttendanceCountPromise,
      employeeTimesheetsPromise,
      teamPromise,
    ]);

    // Fast in-memory aggregation of summary counters, review queue, and deadlines
    let dueToday = 0;
    let dueTomorrow = 0;
    let dueIn7Days = 0;
    let overdueUpTo7Days = 0;
    let overdueOver7Days = 0;
    let pendingCount = 0;
    let inProgressCount = 0;
    let holdCount = 0;
    let submittedForReviewCount = 0;
    let completedCount = 0;

    const reviewQueue: typeof tasks = [];
    let gstTasksCount = 0;
    let itrTasksCount = 0;
    const upcomingDeadlines: typeof tasks = [];

    for (const t of tasks) {
      if (t.status === TaskStatus.PENDING) pendingCount++;
      else if (t.status === TaskStatus.IN_PROGRESS) inProgressCount++;
      else if (t.status === TaskStatus.ON_HOLD) holdCount++;
      else if (t.status === TaskStatus.SUBMITTED_FOR_REVIEW) {
        submittedForReviewCount++;
        if (isManagerRole && reviewQueue.length < 8) {
          reviewQueue.push(t);
        }
      } else if (t.status === TaskStatus.COMPLETED) completedCount++;

      if (t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED) {
        const dueTime = t.dueDate.getTime();
        if (dueTime >= startOfToday.getTime() && dueTime <= endOfToday.getTime()) {
          dueToday++;
        } else if (dueTime >= startOfTomorrow.getTime() && dueTime <= endOfTomorrow.getTime()) {
          dueTomorrow++;
        } else if (dueTime > endOfTomorrow.getTime() && dueTime <= in7Days.getTime()) {
          dueIn7Days++;
        } else if (dueTime >= past7Days.getTime() && dueTime < startOfToday.getTime()) {
          overdueUpTo7Days++;
        } else if (dueTime < past7Days.getTime()) {
          overdueOver7Days++;
        }

        if (isTaxProRole) {
          if (dueTime >= startOfToday.getTime() && dueTime <= in7Days.getTime() && upcomingDeadlines.length < 6) {
            upcomingDeadlines.push(t);
          }
          const serviceName = t.service?.name?.toLowerCase() || '';
          if (serviceName.includes('gst')) gstTasksCount++;
          if (serviceName.includes('tax')) itrTasksCount++;
        }
      }
    }

    // Attendance Widget formatted values
    const isCheckedIn = Boolean(todayAttendance && todayAttendance.checkInTime && !todayAttendance.checkOutTime);
    const totalMinutesWorked = todayAttendance ? todayAttendance.totalWorkingMinutes : 0;
    const hours = Math.floor(totalMinutesWorked / 60);
    const mins = totalMinutesWorked % 60;
    const formattedWorkedTime = `${hours}h ${mins}m`;

    // Role-specific additional data formatting
    let outstandingReceivables: any = null;
    let managerMetrics: any = null;
    let taxProMetrics: any = null;
    let employeeMetrics: any = null;

    if (isFinancialRole && invoices && totalBilledAgg) {
      outstandingReceivables = {
        total: totalBilledAgg._sum.balanceDue || 0,
        totalBilled: totalBilledAgg._sum.totalAmount || 0,
        totalCollected: totalBilledAgg._sum.amountPaid || 0,
        invoices,
      };
    }

    if (isManagerRole) {
      managerMetrics = {
        reviewQueue,
        submittedForReviewCount,
        pendingTimesheetsCount: pendingTimesheetsCount || 0,
        teamPresentCount: todayAttendanceCount || 0,
      };
    }

    if (isTaxProRole) {
      taxProMetrics = {
        activeGstFilings: gstTasksCount,
        activeTaxReturns: itrTasksCount,
        upcomingDeadlines,
      };
    }

    if (isEmployeeRole && employeeTimesheets) {
      const totalMins = employeeTimesheets.reduce((acc, t) => acc + t.durationMinutes, 0);
      const billableMins = employeeTimesheets.filter(t => t.isBillable).reduce((acc, t) => acc + t.durationMinutes, 0);

      employeeMetrics = {
        weeklyHours: (totalMins / 60).toFixed(1),
        weeklyBillableHours: (billableMins / 60).toFixed(1),
        assignedTasksCount: tasks.length,
      };
    }

    // Build service breakdown in-memory from services and tasks
    const serviceBreakdown = services.map(s => {
      const sTasks = tasks.filter(t => t.serviceId === s.id);
      return {
        id: s.id,
        name: s.name,
        category: s.category,
        total: sTasks.length,
        pending: sTasks.filter(t => t.status === TaskStatus.PENDING).length,
        inProgress: sTasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length,
        completed: sTasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      };
    });

    res.json({
      success: true,
      role: userRole,
      data: {
        summary: {
          dueToday,
          dueTomorrow,
          dueIn7Days,
          overdueUpTo7Days,
          overdueOver7Days,
          pendingCount,
          inProgressCount,
          holdCount,
          submittedForReviewCount,
          completedCount,
          totalActive: pendingCount + inProgressCount + holdCount + submittedForReviewCount,
        },
        taskDistribution: [
          { name: 'Pending', value: pendingCount, color: '#F59E0B' },
          { name: 'In-Progress', value: inProgressCount, color: '#0EA5E9' },
          { name: 'Review', value: submittedForReviewCount, color: '#8B5CF6' },
          { name: 'Hold', value: holdCount, color: '#64748B' },
          { name: 'Completed', value: completedCount, color: '#10B981' },
        ],
        serviceBreakdown,
        attendanceWidget: {
          isCheckedIn,
          checkInTime: todayAttendance?.checkInTime,
          checkOutTime: todayAttendance?.checkOutTime,
          workedDurationFormatted: formattedWorkedTime,
          totalMinutesWorked,
          status: todayAttendance?.status || 'NOT_MARKED',
        },
        todos: todayTodos,
        outstandingReceivables,
        managerMetrics,
        taxProMetrics,
        employeeMetrics,
        teamMetrics: {
          totalEmployees: teamMembers.length,
          activeCount: teamMembers.filter((e) => e.isActive).length,
          employees: teamMembers,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
