import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';
import { ClientType, ClientStatus, RoleType } from '@prisma/client';
import { ClientPortalService } from '../services/clientPortal.service.js';

const router = Router();

// Validation schema for client create/update
const clientSchema = z.object({
  name: z.string().min(2),
  clientType: z.nativeEnum(ClientType).default(ClientType.PRIVATE_LIMITED),
  fileNo: z.string().optional().nullable(),
  primaryContact: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  tan: z.string().optional().nullable(),
  bankAccountNo: z.string().optional().nullable(),
  ifscCode: z.string().optional().nullable(),
  clientGroupId: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  status: z.nativeEnum(ClientStatus).default(ClientStatus.ACTIVE),
  notes: z.string().optional().nullable(),
});

// GET /api/clients - listing with search, filtering, and pagination
// Strict isolation: CLIENT role can only see their own entity!
router.get('/', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const { search, type, status, groupId, page = '1', limit = '50', sortBy = 'name', sortOrder = 'asc' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * take;

    const where: any = { organizationId: orgId };

    // Tenant / Client Isolation
    if (req.user!.role === RoleType.CLIENT) {
      if (!req.user!.clientId) {
        res.json({
          success: true,
          data: [],
          pagination: { page: pageNum, limit: take, total: 0, totalPages: 0 },
        });
        return;
      }
      where.id = req.user!.clientId;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { fileNo: { contains: q, mode: 'insensitive' } },
        { primaryContact: { contains: q, mode: 'insensitive' } },
        { mobile: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { pan: { contains: q, mode: 'insensitive' } },
        { gstin: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (type && type !== 'ALL') {
      where.clientType = type as ClientType;
    }

    if (status && status !== 'ALL') {
      where.status = status as ClientStatus;
    }

    if (groupId && groupId !== 'ALL') {
      where.clientGroupId = groupId as string;
    }

    const total = await prisma.client.count({ where });
    const clients = await prisma.client.findMany({
      where,
      skip,
      take,
      include: {
        clientGroup: { select: { id: true, name: true } },
        _count: {
          select: {
            tasks: true,
            invoices: true,
            documents: true,
            renewals: true,
          },
        },
      },
      orderBy: { [sortBy as string]: sortOrder === 'desc' ? 'desc' : 'asc' },
    });

    res.json({
      success: true,
      data: clients,
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

// GET /api/clients/meta/groups - list client groups
router.get('/meta/groups', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const groups = await prisma.clientGroup.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, groups });
  } catch (err) {
    next(err);
  }
});

// GET /api/clients/:id - complete client profile with all related tabs
// Cross-client defense: CLIENT user can ONLY view their own client profile!
router.get('/:id', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    if (req.user!.role === RoleType.CLIENT && req.user!.clientId !== req.params.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied: You cannot view records of another client organization',
      });
      return;
    }

    const client = await prisma.client.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
      include: {
        clientGroup: true,
        contacts: true,
        tasks: {
          include: {
            service: { select: { name: true } },
            assignments: { include: { user: { select: { fullName: true } } } },
          },
          orderBy: { dueDate: 'desc' },
          take: 20,
        },
        services: {
          include: { service: true },
        },
        retainers: {
          include: { service: true },
        },
        renewals: true,
        documents: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        invoices: {
          orderBy: { invoiceDate: 'desc' },
          take: 20,
        },
        payments: {
          orderBy: { paymentDate: 'desc' },
          take: 20,
        },
        documentInOutRecords: {
          orderBy: { date: 'desc' },
          take: 10,
        },
        portalAccount: {
          include: {
            otps: { orderBy: { createdAt: 'desc' }, take: 5 },
            sessions: { where: { isRevoked: false } },
          },
        },
      },
    });

    if (!client) {
      res.status(404).json({ success: false, message: 'Client not found' });
      return;
    }

    // Auto-ensure portal account exists for existing clients
    if (!client.portalAccount) {
      try {
        const portal = await ClientPortalService.ensurePortalAccount(client);
        (client as any).portalAccount = portal;
      } catch (err) {
        console.error('Failed to auto-ensure portal:', err);
      }
    }

    res.json({ success: true, client });
  } catch (err) {
    next(err);
  }
});

// POST /api/clients - create new client (Admin, Manager, Tax Pro)
router.post(
  '/',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER, RoleType.TAX_PROFESSIONAL),
  async (req: Request, res: Response, next) => {
    try {
      const data = clientSchema.parse(req.body);

      const client = await prisma.client.create({
        data: {
          ...data,
          email: data.email || null,
          organizationId: req.user!.organizationId,
        },
      });

      // Automatically create corresponding Client Portal account
      let portalAccount: any = null;
      let portalError: string | null = null;
      try {
        portalAccount = await ClientPortalService.ensurePortalAccount(client);
      } catch (pErr: any) {
        console.error('Portal auto-creation error:', pErr);
        portalError = pErr.message || 'Failed to auto-provision portal';
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.id,
          entityType: 'Client',
          entityId: client.id,
          action: 'CREATE',
          changesJson: JSON.stringify({ ...data, portalAccount: portalAccount?.id }),
        },
      }).catch(() => {});

      res.status(201).json({
        success: true,
        client: {
          ...client,
          portalAccount,
        },
        portalAccount,
        portalWarning: portalError,
        message: 'Client and dedicated Client Portal account created successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/clients/:id - update client
router.put(
  '/:id',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER, RoleType.ACCOUNTANT, RoleType.TAX_PROFESSIONAL),
  async (req: Request, res: Response, next) => {
    try {
      const data = clientSchema.partial().parse(req.body);

      const existing = await prisma.client.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
      });

      if (!existing) {
        res.status(404).json({ success: false, message: 'Client not found' });
        return;
      }

      const updated = await prisma.client.update({
        where: { id: req.params.id },
        data: {
          ...data,
          email: data.email === '' ? null : data.email,
        },
      });

      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.id,
          entityType: 'Client',
          entityId: updated.id,
          action: 'UPDATE',
          changesJson: JSON.stringify(data),
        },
      }).catch(() => {});

      res.json({ success: true, client: updated, message: 'Client updated successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/clients/:id - only Firm Owner and Firm Admin can delete clients
router.delete(
  '/:id',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN),
  async (req: Request, res: Response, next) => {
    try {
      const existing = await prisma.client.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
      });

      if (!existing) {
        res.status(404).json({ success: false, message: 'Client not found' });
        return;
      }

      await prisma.client.delete({
        where: { id: req.params.id },
      });

      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.id,
          entityType: 'Client',
          entityId: req.params.id,
          action: 'DELETE',
          changesJson: JSON.stringify({ name: existing.name }),
        },
      }).catch(() => {});

      res.json({ success: true, message: 'Client deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// ================= ADMIN CLIENT PORTAL MANAGEMENT ROUTES =================

/**
 * GET /api/clients/:id/portal - View portal status, linked mobile, last login, and active sessions
 */
router.get(
  '/:id/portal',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER, RoleType.TAX_PROFESSIONAL),
  async (req: Request, res: Response, next) => {
    try {
      const data = await ClientPortalService.getAdminClientPortal(req.params.id, req.user!.organizationId);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(404).json({ success: false, message: err.message || 'Client portal not found' });
    }
  }
);

/**
 * PATCH /api/clients/:id/portal/status - Activate or deactivate client portal access
 */
router.patch(
  '/:id/portal/status',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER),
  async (req: Request, res: Response, next) => {
    try {
      const { status } = z.object({ status: z.nativeEnum(ClientStatus) }).parse(req.body);
      const portal = await ClientPortalService.updatePortalStatus(req.params.id, req.user!.organizationId, status);
      res.json({
        success: true,
        message: `Client portal access ${status === ClientStatus.ACTIVE ? 'activated' : 'deactivated'} successfully.`,
        portal,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message || 'Failed to update portal status' });
    }
  }
);

/**
 * POST /api/clients/:id/portal/revoke-sessions - Revoke all active sessions for this client
 */
router.post(
  '/:id/portal/revoke-sessions',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER),
  async (req: Request, res: Response, next) => {
    try {
      const result = await ClientPortalService.revokeAllClientSessions(req.params.id, req.user!.organizationId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message || 'Failed to revoke sessions' });
    }
  }
);

/**
 * POST /api/clients/:id/portal/update-mobile - Update registered mobile number with audit verification
 */
router.post(
  '/:id/portal/update-mobile',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER),
  async (req: Request, res: Response, next) => {
    try {
      const { mobile, reason } = z.object({
        mobile: z.string().min(10),
        reason: z.string().optional(),
      }).parse(req.body);

      const result = await ClientPortalService.updateRegisteredMobile(
        req.params.id,
        req.user!.organizationId,
        mobile,
        reason
      );
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message || 'Failed to update registered mobile' });
    }
  }
);

export default router;
