import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { RenewalStatus } from '@prisma/client';

const router = Router();

const renewalSchema = z.object({
  clientId: z.string().uuid(),
  renewalType: z.string().min(2),
  licenseNumber: z.string().optional().nullable(),
  issueDate: z.string().optional().nullable(),
  expiryDate: z.string(),
  assignedUserId: z.string().uuid().optional().nullable(),
  reminderDays: z.number().default(30),
  notes: z.string().optional().nullable(),
  status: z.nativeEnum(RenewalStatus).default(RenewalStatus.ACTIVE),
});

// GET /api/renewals - list renewals with filters
router.get('/', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const { status, type, clientId, search } = req.query;

    const where: any = { organizationId: orgId };

    if (status && status !== 'ALL') {
      where.status = status as RenewalStatus;
    }

    if (type && type !== 'ALL') {
      where.renewalType = { contains: type as string, mode: 'insensitive' };
    }

    if (clientId && clientId !== 'ALL') {
      where.clientId = clientId as string;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { renewalType: { contains: q, mode: 'insensitive' } },
        { licenseNumber: { contains: q, mode: 'insensitive' } },
        { client: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const renewals = await prisma.renewal.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, mobile: true, email: true } },
        assignedUser: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    res.json({ success: true, data: renewals });
  } catch (err) {
    next(err);
  }
});

// POST /api/renewals - create renewal
router.post('/', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const data = renewalSchema.parse(req.body);

    const renewal = await prisma.renewal.create({
      data: {
        organizationId: req.user!.organizationId,
        clientId: data.clientId,
        renewalType: data.renewalType,
        licenseNumber: data.licenseNumber,
        issueDate: data.issueDate ? new Date(data.issueDate) : null,
        expiryDate: new Date(data.expiryDate),
        assignedUserId: data.assignedUserId || null,
        reminderDays: data.reminderDays,
        notes: data.notes,
        status: data.status,
      },
    });

    res.status(201).json({ success: true, renewal, message: 'Renewal record created' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/renewals/:id/status - update status
router.patch('/:id/status', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const { status } = z.object({ status: z.nativeEnum(RenewalStatus) }).parse(req.body);

    const existing = await prisma.renewal.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Renewal record not found' });
      return;
    }

    const updated = await prisma.renewal.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json({ success: true, renewal: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
