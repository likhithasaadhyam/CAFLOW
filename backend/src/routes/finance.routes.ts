import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';
import { InvoiceStatus, PaymentMode, RoleType } from '@prisma/client';

const router = Router();

const invoiceSchema = z.object({
  clientId: z.string().uuid(),
  invoiceDate: z.string(),
  dueDate: z.string(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  lineItems: z.array(z.object({
    description: z.string().min(1),
    serviceId: z.string().uuid().optional().nullable(),
    quantity: z.number().default(1),
    unitPrice: z.number().min(0),
    discount: z.number().default(0),
    taxRate: z.number().default(18),
  })).min(1),
});

const paymentSchema = z.object({
  clientId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().nullable(),
  amount: z.number().positive(),
  paymentDate: z.string().optional(),
  paymentMode: z.nativeEnum(PaymentMode).default(PaymentMode.BANK_TRANSFER),
  referenceNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /api/finance/my-invoices - dedicated endpoint for authenticated CLIENT role
router.get('/my-invoices', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    if (req.user!.role !== RoleType.CLIENT || !req.user!.clientId) {
      res.status(403).json({ success: false, message: 'This endpoint is reserved for authenticated clients' });
      return;
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        organizationId: req.user!.organizationId,
        clientId: req.user!.clientId,
      },
      include: {
        client: { select: { id: true, name: true, pan: true, gstin: true } },
        lineItems: true,
        payments: true,
      },
      orderBy: { invoiceDate: 'desc' },
    });

    res.json({ success: true, data: invoices });
  } catch (err) {
    next(err);
  }
});

// GET /api/finance/invoices - list firm invoices (Admin, Manager, Accountant)
router.get(
  '/invoices',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.ACCOUNTANT, RoleType.MANAGER),
  async (req: Request, res: Response, next) => {
    try {
      const orgId = req.user!.organizationId;
      const { status, clientId, search } = req.query;

      const where: any = { organizationId: orgId };

      if (status && status !== 'ALL') {
        where.paymentStatus = status as InvoiceStatus;
      }

      if (clientId && clientId !== 'ALL') {
        where.clientId = clientId as string;
      }

      if (search && typeof search === 'string' && search.trim()) {
        const q = search.trim();
        where.OR = [
          { invoiceNumber: { contains: q, mode: 'insensitive' } },
          { client: { name: { contains: q, mode: 'insensitive' } } },
        ];
      }

      const invoices = await prisma.invoice.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, pan: true, gstin: true, mobile: true, email: true } },
          lineItems: true,
          payments: true,
        },
        orderBy: { invoiceDate: 'desc' },
      });

      res.json({ success: true, data: invoices });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/finance/invoices - create invoice (Accountant, Admin, Owner)
router.post(
  '/invoices',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.ACCOUNTANT),
  async (req: Request, res: Response, next) => {
    try {
      const data = invoiceSchema.parse(req.body);
      const orgId = req.user!.organizationId;

      // Verify client belongs to this organization
      const clientExists = await prisma.client.findFirst({
        where: { id: data.clientId, organizationId: orgId },
      });
      if (!clientExists) {
        res.status(404).json({ success: false, message: 'Client not found in your organization' });
        return;
      }

      // Generate unique invoice number
      const settings = await prisma.organizationSettings.findUnique({
        where: { organizationId: orgId },
      });
      const prefix = settings?.invoicePrefix || 'INV';
      const seq = (settings?.invoiceSequence || 1000) + 1;
      const invoiceNumber = `${prefix}-${seq}`;

      if (settings) {
        await prisma.organizationSettings.update({
          where: { id: settings.id },
          data: { invoiceSequence: seq },
        });
      }

      let subtotal = 0;
      let taxTotal = 0;

      const lineItemsData = data.lineItems.map(item => {
        const itemSubtotal = (item.quantity * item.unitPrice) - item.discount;
        const itemTax = itemSubtotal * (item.taxRate / 100);
        const itemTotal = itemSubtotal + itemTax;

        subtotal += itemSubtotal;
        taxTotal += itemTax;

        return {
          serviceId: item.serviceId || null,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          taxRate: item.taxRate,
          amount: itemTotal,
        };
      });

      const totalAmount = subtotal + taxTotal;

      const invoice = await prisma.invoice.create({
        data: {
          organizationId: orgId,
          clientId: data.clientId,
          invoiceNumber,
          invoiceDate: new Date(data.invoiceDate),
          dueDate: new Date(data.dueDate),
          subtotal,
          taxTotal,
          totalAmount,
          amountPaid: 0,
          balanceDue: totalAmount,
          paymentStatus: InvoiceStatus.ISSUED,
          notes: data.notes,
          terms: data.terms,
          lineItems: {
            create: lineItemsData,
          },
        },
        include: { lineItems: true, client: true },
      });

      // Audit Log
      await prisma.auditLog.create({
        data: {
          organizationId: orgId,
          userId: req.user!.id,
          entityType: 'Invoice',
          entityId: invoice.id,
          action: 'CREATE',
          changesJson: JSON.stringify({ invoiceNumber, totalAmount, clientId: data.clientId }),
        },
      }).catch(() => {});

      res.status(201).json({ success: true, invoice, message: 'Invoice created successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/finance/payments - list payments / receipts (Accountant, Admin, Manager)
router.get(
  '/payments',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.ACCOUNTANT, RoleType.MANAGER),
  async (req: Request, res: Response, next) => {
    try {
      const payments = await prisma.payment.findMany({
        where: { organizationId: req.user!.organizationId },
        include: {
          client: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } },
          recordedBy: { select: { fullName: true } },
        },
        orderBy: { paymentDate: 'desc' },
      });
      res.json({ success: true, data: payments });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/finance/payments - record payment (Accountant, Admin, Owner)
router.post(
  '/payments',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.ACCOUNTANT),
  async (req: Request, res: Response, next) => {
    try {
      const data = paymentSchema.parse(req.body);
      const orgId = req.user!.organizationId;

      const client = await prisma.client.findFirst({
        where: { id: data.clientId, organizationId: orgId },
      });
      if (!client) {
        res.status(404).json({ success: false, message: 'Client not found in your organization' });
        return;
      }

      const settings = await prisma.organizationSettings.findUnique({
        where: { organizationId: orgId },
      });
      const prefix = settings?.receiptPrefix || 'REC';
      const seq = (settings?.receiptSequence || 1000) + 1;
      const receiptNumber = `${prefix}-${seq}`;

      if (settings) {
        await prisma.organizationSettings.update({
          where: { id: settings.id },
          data: { receiptSequence: seq },
        });
      }

      const payment = await prisma.payment.create({
        data: {
          organizationId: orgId,
          clientId: data.clientId,
          invoiceId: data.invoiceId || null,
          receiptNumber,
          amount: data.amount,
          paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          paymentMode: data.paymentMode,
          referenceNumber: data.referenceNumber,
          notes: data.notes,
          recordedById: req.user!.id,
        },
      });

      if (data.invoiceId) {
        const inv = await prisma.invoice.findFirst({
          where: { id: data.invoiceId, organizationId: orgId, clientId: data.clientId },
        });
        if (inv) {
          const newPaid = inv.amountPaid + data.amount;
          const newBalance = Math.max(0, inv.totalAmount - newPaid);
          const newStatus = newBalance === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

          await prisma.invoice.update({
            where: { id: data.invoiceId },
            data: {
              amountPaid: newPaid,
              balanceDue: newBalance,
              paymentStatus: newStatus,
            },
          });
        }
      }

      await prisma.auditLog.create({
        data: {
          organizationId: orgId,
          userId: req.user!.id,
          entityType: 'Payment',
          entityId: payment.id,
          action: 'CREATE',
          changesJson: JSON.stringify({ receiptNumber, amount: data.amount, clientId: data.clientId }),
        },
      }).catch(() => {});

      res.status(201).json({ success: true, payment, message: 'Payment recorded successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/finance/expenses - list expenses (Accountant, Admin, Manager)
router.get(
  '/expenses',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.ACCOUNTANT, RoleType.MANAGER),
  async (req: Request, res: Response, next) => {
    try {
      const expenses = await prisma.expense.findMany({
        where: { organizationId: req.user!.organizationId },
        orderBy: { expenseDate: 'desc' },
      });
      res.json({ success: true, data: expenses });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
