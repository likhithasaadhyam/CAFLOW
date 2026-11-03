import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { authenticateToken, requireNonClient, requireRoles } from '../middleware/auth.js';
import { TaskStatus, Priority, RoleType, NotificationCategory, NotificationChannel, NotificationStatus } from '@prisma/client';

const router = Router();

const taskSchema = z.object({
  title: z.string().min(2),
  clientId: z.string().uuid(),
  serviceId: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  reportingPeriod: z.string().optional().nullable(),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  dueDate: z.string(),
  targetDate: z.string().optional().nullable(),
  reviewerId: z.string().uuid().optional().nullable(),
  estimatedHours: z.number().optional().nullable(),
  assignedUserIds: z.array(z.string().uuid()).optional(),
  checklistItems: z.array(z.string()).optional(),
});

// GET /api/tasks - listing with filters
// Role Scoping:
// - CLIENT: only sees tasks for their own clientId
// - EMPLOYEE: only sees tasks assigned to them
// - TAX_PROFESSIONAL: sees assigned tasks, reviewed tasks, or tax/audit service tasks
router.get('/', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const {
      search,
      clientId,
      serviceId,
      status,
      priority,
      assignedUserId,
      dateRange,
      page = '1',
      limit = '50',
      sortBy = 'dueDate',
      sortOrder = 'asc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * take;

    const where: any = { organizationId: orgId };

    // CLIENT isolation
    if (req.user!.role === RoleType.CLIENT) {
      if (!req.user!.clientId) {
        res.json({ success: true, data: [], pagination: { page: pageNum, limit: take, total: 0, totalPages: 0 } });
        return;
      }
      where.clientId = req.user!.clientId;
    } else if (req.user!.role === RoleType.EMPLOYEE) {
      // EMPLOYEE sees only tasks assigned to them
      where.assignments = {
        some: { userId: req.user!.id },
      };
    } else if (req.user!.role === RoleType.TAX_PROFESSIONAL) {
      if (assignedUserId && assignedUserId !== 'ALL') {
        where.assignments = { some: { userId: assignedUserId as string } };
      } else {
        where.OR = [
          { assignments: { some: { userId: req.user!.id } } },
          { reviewerId: req.user!.id },
          { service: { category: { in: ['Direct Tax', 'Indirect Tax', 'Audit', 'IPR & Legal', 'Licensing'] } } },
        ];
      }
    } else if (assignedUserId && assignedUserId !== 'ALL') {
      where.assignments = {
        some: { userId: assignedUserId as string },
      };
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      const searchConditions = [
        { title: { contains: q, mode: 'insensitive' } },
        { client: { name: { contains: q, mode: 'insensitive' } } },
        { reportingPeriod: { contains: q, mode: 'insensitive' } },
      ];
      if (where.OR) {
        where.AND = [{ OR: searchConditions }];
      } else {
        where.OR = searchConditions;
      }
    }

    if (clientId && clientId !== 'ALL') {
      if (req.user!.role === RoleType.CLIENT && clientId !== req.user!.clientId) {
        res.status(403).json({ success: false, message: 'Access denied: You cannot view tasks of another client' });
        return;
      }
      where.clientId = clientId as string;
    }

    if (serviceId && serviceId !== 'ALL') {
      where.serviceId = serviceId as string;
    }

    if (status && status !== 'ALL') {
      where.status = status as TaskStatus;
    }

    if (priority && priority !== 'ALL') {
      where.priority = priority as Priority;
    }

    if (dateRange && dateRange !== 'all') {
      const now = new Date('2026-10-14T12:00:00Z');
      const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
      const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
      const endOfTomorrow = new Date(endOfToday.getTime() + 86400000);
      const in7Days = new Date(startOfToday.getTime() + 7 * 86400000);

      if (dateRange === 'today') {
        where.dueDate = { gte: startOfToday, lte: endOfToday };
      } else if (dateRange === 'tomorrow') {
        where.dueDate = { gte: startOfTomorrow, lte: endOfTomorrow };
      } else if (dateRange === '7days') {
        where.dueDate = { gte: startOfToday, lte: in7Days };
      } else if (dateRange === 'overdue') {
        where.dueDate = { lt: startOfToday };
        where.status = { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] };
      }
    }

    const total = await prisma.task.count({ where });
    const tasks = await prisma.task.findMany({
      where,
      skip,
      take,
      include: {
        client: { select: { id: true, name: true, mobile: true, email: true } },
        service: { select: { id: true, name: true, category: true } },
        reviewer: { select: { id: true, fullName: true, avatarUrl: true } },
        assignments: {
          include: {
            user: {
              select: { id: true, fullName: true, avatarUrl: true, role: true },
            },
          },
        },
        checklists: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { comments: true, attachments: true } },
      },
      orderBy: { [sortBy as string]: sortOrder === 'desc' ? 'desc' : 'asc' },
    });

    res.json({
      success: true,
      data: tasks,
      pagination: {
        page: pageNum,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/:id - single task details
router.get('/:id', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: {
        client: true,
        service: true,
        reviewer: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        assignments: {
          include: {
            user: { select: { id: true, fullName: true, email: true, avatarUrl: true, role: true } },
          },
        },
        checklists: { orderBy: { sortOrder: 'asc' } },
        comments: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
        },
        attachments: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    // Role boundary checks
    if (req.user!.role === RoleType.CLIENT && task.clientId !== req.user!.clientId) {
      res.status(403).json({ success: false, message: 'Access denied: You cannot view tasks of another client' });
      return;
    }

    res.json({ success: true, task });
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks - create new task (Admin, Manager, Tax Pro, Accountant)
router.post(
  '/',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER, RoleType.TAX_PROFESSIONAL, RoleType.ACCOUNTANT),
  async (req: Request, res: Response, next) => {
    try {
      const data = taskSchema.parse(req.body);
      const orgId = req.user!.organizationId;

      // Verify client exists in organization
      const client = await prisma.client.findFirst({
        where: { id: data.clientId, organizationId: orgId },
      });
      if (!client) {
        res.status(404).json({ success: false, message: 'Client not found in your organization' });
        return;
      }

      const task = await prisma.task.create({
        data: {
          organizationId: orgId,
          clientId: data.clientId,
          serviceId: data.serviceId || null,
          title: data.title,
          description: data.description,
          reportingPeriod: data.reportingPeriod,
          priority: data.priority,
          dueDate: new Date(data.dueDate),
          targetDate: data.targetDate ? new Date(data.targetDate) : new Date(data.dueDate),
          reviewerId: data.reviewerId || null,
          estimatedHours: data.estimatedHours,
        },
      });

      if (data.assignedUserIds && data.assignedUserIds.length > 0) {
        await prisma.taskAssignment.createMany({
          data: data.assignedUserIds.map(uid => ({
            taskId: task.id,
            userId: uid,
          })),
          skipDuplicates: true,
        });

        prisma.notification.createMany({
          data: data.assignedUserIds.map(uid => ({
            organizationId: orgId,
            userId: uid,
            title: `Task Assigned: ${task.title}`,
            message: `You have been assigned to compliance task "${task.title}". Due date: ${new Date(task.dueDate).toLocaleDateString('en-IN')}`,
            type: NotificationCategory.TASK,
            channel: NotificationChannel.IN_APP,
            status: NotificationStatus.SENT,
          })),
        }).catch(() => {});
      }

      if (data.checklistItems && data.checklistItems.length > 0) {
        await prisma.taskChecklistItem.createMany({
          data: data.checklistItems.map((item, idx) => ({
            taskId: task.id,
            title: item,
            sortOrder: idx + 1,
          })),
        });
      }

      await prisma.taskStatusHistory.create({
        data: {
          taskId: task.id,
          fromStatus: TaskStatus.PENDING,
          toStatus: TaskStatus.PENDING,
          changedById: req.user!.id,
          remarks: 'Task created',
        },
      }).catch(() => {});

      await prisma.auditLog.create({
        data: {
          organizationId: orgId,
          userId: req.user!.id,
          entityType: 'Task',
          entityId: task.id,
          action: 'CREATE',
          changesJson: JSON.stringify({ title: data.title, clientId: data.clientId }),
        },
      }).catch(() => {});

      res.status(201).json({ success: true, task, message: 'Task created successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/tasks/:id/status - transition task workflow status
router.patch('/:id/status', authenticateToken, requireNonClient, async (req: Request, res: Response, next) => {
  try {
    const { status, remarks } = z.object({
      status: z.nativeEnum(TaskStatus),
      remarks: z.string().optional(),
    }).parse(req.body);

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: { assignments: true },
    });

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    // RBAC: An EMPLOYEE can only update tasks assigned to them, and cannot approve to COMPLETED
    if (req.user!.role === RoleType.EMPLOYEE) {
      const isAssigned = task.assignments.some(a => a.userId === req.user!.id);
      if (!isAssigned) {
        res.status(403).json({ success: false, message: 'Access denied: You are not assigned to this task' });
        return;
      }
      if (status === TaskStatus.COMPLETED) {
        res.status(403).json({
          success: false,
          message: 'Access denied: Marking a task as COMPLETED requires review and sign-off by a Manager or CA',
        });
        return;
      }
    }

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        status,
        completedDate: status === TaskStatus.COMPLETED ? new Date() : undefined,
        completionNotes: remarks || undefined,
      },
    });

    await prisma.taskStatusHistory.create({
      data: {
        taskId: task.id,
        fromStatus: task.status,
        toStatus: status,
        changedById: req.user!.id,
        remarks: remarks || `Status changed from ${task.status} to ${status}`,
      },
    });

    res.json({ success: true, task: updated, message: `Task status updated to ${status}` });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/tasks/:id/checklist/:itemId - toggle checklist item
router.patch('/:id/checklist/:itemId', authenticateToken, requireNonClient, async (req: Request, res: Response, next) => {
  try {
    const { isCompleted } = z.object({ isCompleted: z.boolean() }).parse(req.body);

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    const item = await prisma.taskChecklistItem.update({
      where: { id: req.params.itemId },
      data: {
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
        completedBy: isCompleted ? req.user!.fullName : null,
      },
    });

    res.json({ success: true, item });
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks/:id/comments - add comment to task
router.post('/:id/comments', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const { comment } = z.object({ comment: z.string().min(1) }).parse(req.body);

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    if (req.user!.role === RoleType.CLIENT && task.clientId !== req.user!.clientId) {
      res.status(403).json({ success: false, message: 'Access denied: You cannot comment on another client task' });
      return;
    }

    const newComment = await prisma.taskComment.create({
      data: {
        taskId: req.params.id,
        userId: req.user!.id,
        comment,
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    res.status(201).json({ success: true, comment: newComment });
  } catch (err) {
    next(err);
  }
});

export default router;
