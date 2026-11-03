import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { Priority } from '@prisma/client';

const router = Router();

const todoSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().default('General'),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  dueDate: z.string().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  taskId: z.string().uuid().optional().nullable(),
});

// GET /api/todos - list user's todos with filters
router.get('/', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const { category, status, view, search } = req.query;

    const where: any = { organizationId: orgId, userId: userId };

    if (category && category !== 'ALL') {
      where.category = category as string;
    }

    if (status && status !== 'ALL') {
      where.status = status as string;
    }

    if (search && typeof search === 'string' && search.trim()) {
      where.title = { contains: search.trim(), mode: 'insensitive' };
    }

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    if (view === 'today') {
      where.dueDate = { gte: startOfToday, lte: endOfToday };
    } else if (view === 'upcoming') {
      where.dueDate = { gt: endOfToday };
    } else if (view === 'overdue') {
      where.dueDate = { lt: startOfToday };
      where.status = 'PENDING';
    } else if (view === 'completed') {
      where.status = 'COMPLETED';
    }

    const todos = await prisma.todo.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    // Also get unique categories for filter dropdown
    const allCategories = await prisma.todo.findMany({
      where: { organizationId: orgId, userId },
      select: { category: true },
      distinct: ['category'],
    });

    res.json({
      success: true,
      data: todos,
      categories: allCategories.map(c => c.category),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/todos - create to-do
router.post('/', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const data = todoSchema.parse(req.body);

    const todo = await prisma.todo.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        clientId: data.clientId || null,
        taskId: data.taskId || null,
        status: 'PENDING',
      },
    });

    prisma.notification.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        title: `To-Do Created: ${data.title}`,
        message: `New reminder added in category "${data.category}" with ${data.priority} priority.`,
        type: 'GENERAL',
        channel: 'IN_APP',
        status: 'SENT',
        sentAt: new Date(),
      },
    }).catch(() => {});

    res.status(201).json({ success: true, todo, message: 'To-Do item created' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/todos/:id/toggle - toggle completion
router.patch('/:id/toggle', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const existing = await prisma.todo.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'To-Do not found' });
      return;
    }

    const newStatus = existing.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    const updated = await prisma.todo.update({
      where: { id: req.params.id },
      data: {
        status: newStatus,
        completedAt: newStatus === 'COMPLETED' ? new Date() : null,
      },
    });

    res.json({ success: true, todo: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/todos/:id
router.delete('/:id', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    await prisma.todo.deleteMany({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });

    res.json({ success: true, message: 'To-Do removed' });
  } catch (err) {
    next(err);
  }
});

export default router;
