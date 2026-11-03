import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { authenticateToken, requireNonClient, requireRoles } from '../middleware/auth.js';
import { TimesheetStatus, RoleType } from '@prisma/client';

const router = Router();

const entrySchema = z.object({
  clientId: z.string().uuid().optional().nullable(),
  taskId: z.string().uuid().optional().nullable(),
  workDate: z.string(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  durationMinutes: z.number().positive(),
  description: z.string().min(2),
  isBillable: z.boolean().default(true),
});

// GET /api/timesheets - list entries (staff only; scoped to self if Employee)
router.get('/', authenticateToken, requireNonClient, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const { userId, weekStartDate } = req.query;

    const where: any = { organizationId: orgId };

    if (req.user!.role === RoleType.EMPLOYEE) {
      where.userId = req.user!.id; // strictly force own timesheets for employee
    } else if (userId && userId !== 'ALL') {
      where.userId = userId as string;
    }

    if (weekStartDate) {
      const start = new Date(weekStartDate as string);
      const end = new Date(start.getTime() + 7 * 86400000);
      where.workDate = { gte: start, lte: end };
    }

    const entries = await prisma.timesheetEntry.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        client: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { workDate: 'desc' },
    });

    const totalMinutes = entries.reduce((acc, e) => acc + e.durationMinutes, 0);
    const billableMinutes = entries.filter(e => e.isBillable).reduce((acc, e) => acc + e.durationMinutes, 0);

    res.json({
      success: true,
      data: entries,
      summary: {
        totalMinutes,
        billableMinutes,
        totalHoursFormatted: `${(totalMinutes / 60).toFixed(1)} hrs`,
        billableHoursFormatted: `${(billableMinutes / 60).toFixed(1)} hrs`,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/timesheets - log new time entry
router.post('/', authenticateToken, requireNonClient, async (req: Request, res: Response, next) => {
  try {
    const data = entrySchema.parse(req.body);

    const entry = await prisma.timesheetEntry.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        clientId: data.clientId || null,
        taskId: data.taskId || null,
        workDate: new Date(data.workDate),
        startTime: data.startTime,
        endTime: data.endTime,
        durationMinutes: data.durationMinutes,
        description: data.description,
        isBillable: data.isBillable,
        status: TimesheetStatus.SUBMITTED,
      },
      include: {
        client: { select: { name: true } },
      },
    });

    res.status(201).json({ success: true, entry, message: 'Timesheet entry logged' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/timesheets/:id/approve - manager, admin, owner approves or rejects
router.patch(
  '/:id/approve',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER),
  async (req: Request, res: Response, next) => {
    try {
      const { status, remarks } = z.object({
        status: z.nativeEnum(TimesheetStatus),
        remarks: z.string().optional(),
      }).parse(req.body);

      const existing = await prisma.timesheetEntry.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
      });

      if (!existing) {
        res.status(404).json({ success: false, message: 'Timesheet entry not found' });
        return;
      }

      const updated = await prisma.timesheetEntry.update({
        where: { id: req.params.id },
        data: {
          status,
          remarks,
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
        },
      });

      res.json({ success: true, entry: updated, message: `Timesheet entry ${status.toLowerCase()}` });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
