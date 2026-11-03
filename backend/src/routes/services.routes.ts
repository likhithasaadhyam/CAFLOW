import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { authenticateToken, requireRoles, requireNonClient } from '../middleware/auth.js';
import { RoleType } from '@prisma/client';

const router = Router();

// GET /api/services - list services (all staff, blocked for client)
router.get(
  '/',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER, RoleType.ACCOUNTANT, RoleType.TAX_PROFESSIONAL, RoleType.EMPLOYEE),
  async (req: Request, res: Response, next) => {
    try {
      const services = await prisma.service.findMany({
        where: { organizationId: req.user!.organizationId },
        include: {
          _count: {
            select: { tasks: true, clientServices: true, retainers: true },
          },
        },
        orderBy: { name: 'asc' },
      });
      res.json({ success: true, data: services });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/services - create new service (Accountant, Admin, Owner)
router.post(
  '/',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.ACCOUNTANT),
  async (req: Request, res: Response, next) => {
    try {
      const { name, category, standardFee, defaultDueDays, billingFrequency, code, description } = z.object({
        name: z.string().min(2),
        category: z.string().min(2),
        standardFee: z.number().default(0),
        defaultDueDays: z.number().default(15),
        billingFrequency: z.string().default('ONE_TIME'),
        code: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
      }).parse(req.body);

      const service = await prisma.service.create({
        data: {
          organizationId: req.user!.organizationId,
          name,
          category,
          standardFee,
          defaultDueDays,
          billingFrequency,
          code,
          description,
          isActive: true,
        },
      });

      res.status(201).json({ success: true, service, message: 'Service created successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/services/retainers - list retainers (Admin, Manager, Accountant)
router.get(
  '/retainers',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.ACCOUNTANT, RoleType.MANAGER),
  async (req: Request, res: Response, next) => {
    try {
      const retainers = await prisma.retainer.findMany({
        where: { organizationId: req.user!.organizationId },
        include: {
          client: { select: { id: true, name: true } },
          service: { select: { id: true, name: true, category: true } },
        },
        orderBy: { startDate: 'desc' },
      });
      res.json({ success: true, data: retainers });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/services/retainers - create retainer (Accountant, Admin, Owner)
router.post(
  '/retainers',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.ACCOUNTANT),
  async (req: Request, res: Response, next) => {
    try {
      const { clientId, serviceId, fee, billingFrequency, agreementNo, startDate, endDate, notes } = z.object({
        clientId: z.string().uuid(),
        serviceId: z.string().uuid(),
        fee: z.number().positive(),
        billingFrequency: z.string().default('MONTHLY'),
        agreementNo: z.string().optional().nullable(),
        startDate: z.string(),
        endDate: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }).parse(req.body);

      // Verify client belongs to this organization
      const client = await prisma.client.findFirst({
        where: { id: clientId, organizationId: req.user!.organizationId },
      });
      if (!client) {
        res.status(404).json({ success: false, message: 'Client not found in your organization' });
        return;
      }

      const retainer = await prisma.retainer.create({
        data: {
          organizationId: req.user!.organizationId,
          clientId,
          serviceId,
          fee,
          billingFrequency,
          agreementNo,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          notes,
          status: 'ACTIVE',
        },
        include: {
          client: true,
          service: true,
        },
      });

      res.status(201).json({ success: true, retainer, message: 'Retainer agreement created' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
