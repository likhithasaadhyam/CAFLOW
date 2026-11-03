import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma.js';
import { authenticateToken, requireRoles, requireNonClient } from '../middleware/auth.js';
import { RoleType } from '@prisma/client';

const router = Router();

// GET /api/settings/organization - view firm settings (Admin, Manager, Accountant)
router.get(
  '/organization',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER, RoleType.ACCOUNTANT),
  async (req: Request, res: Response, next) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.user!.organizationId },
        include: {
          settings: true,
        },
      });

      res.json({ success: true, organization: org });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/settings/organization - update firm profile (Firm Owner & Firm Admin ONLY)
router.put(
  '/organization',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN),
  async (req: Request, res: Response, next) => {
    try {
      const orgId = req.user!.organizationId;
      const { name, phone, address, gstin, pan, website, settings } = req.body;

      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: {
          name,
          phone,
          address,
          gstin,
          pan,
          website,
          settings: settings ? {
            upsert: {
              create: settings,
              update: settings,
            },
          } : undefined,
        },
        include: { settings: true },
      });

      await prisma.auditLog.create({
        data: {
          organizationId: orgId,
          userId: req.user!.id,
          entityType: 'OrganizationSettings',
          entityId: orgId,
          action: 'UPDATE',
          changesJson: JSON.stringify({ name, gstin, pan }),
        },
      }).catch(() => {});

      res.json({ success: true, organization: updated, message: 'Organization settings updated' });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/settings/team - list team members
router.get(
  '/team',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER, RoleType.ACCOUNTANT, RoleType.TAX_PROFESSIONAL),
  async (req: Request, res: Response, next) => {
    try {
      const team = await prisma.user.findMany({
        where: { organizationId: req.user!.organizationId, role: { not: RoleType.CLIENT } },
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
        orderBy: { fullName: 'asc' },
      });

      res.json({ success: true, team });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/settings/team - add a new employee with login credentials
router.post(
  '/team',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER),
  async (req: Request, res: Response, next) => {
    try {
      const orgId = req.user!.organizationId;
      const { fullName, email, password, role, designation, department, phone } = req.body;

      if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
        return res.status(400).json({ success: false, message: 'Employee full name is required' });
      }
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Valid employee email is required' });
      }
      if (!password || typeof password !== 'string' || password.length < 4) {
        return res.status(400).json({ success: false, message: 'Password must be at least 4 characters long' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const existing = await prisma.user.findUnique({
        where: { email: cleanEmail },
      });

      if (existing) {
        return res.status(400).json({ success: false, message: `An employee or user with email "${cleanEmail}" already exists.` });
      }

      const passwordHash = await bcrypt.hash(password.trim(), 10);
      const validRole = Object.values(RoleType).includes(role) && role !== RoleType.CLIENT
        ? role
        : RoleType.EMPLOYEE;

      const newEmployee = await prisma.user.create({
        data: {
          organizationId: orgId,
          fullName: fullName.trim(),
          email: cleanEmail,
          passwordHash,
          role: validRole,
          designation: designation?.trim() || 'Audit Assistant',
          department: department?.trim() || 'Audit & Assurance',
          phone: phone?.trim() || null,
          isActive: true,
        },
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
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          organizationId: orgId,
          userId: req.user!.id,
          entityType: 'User',
          entityId: newEmployee.id,
          action: 'CREATE_EMPLOYEE',
          changesJson: JSON.stringify({ fullName: newEmployee.fullName, email: cleanEmail, role: validRole }),
        },
      }).catch(() => {});

      res.status(201).json({
        success: true,
        message: `Employee "${newEmployee.fullName}" created successfully! Login credentials are active.`,
        employee: newEmployee,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/settings/team/:id/status - toggle active/inactive status
router.patch(
  '/team/:id/status',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN),
  async (req: Request, res: Response, next) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const updated = await prisma.user.update({
        where: { id, organizationId: req.user!.organizationId },
        data: { isActive: Boolean(isActive) },
        select: { id: true, fullName: true, isActive: true },
      });

      res.json({ success: true, message: 'Employee status updated', employee: updated });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/settings/team/:id/credentials - reset password
router.patch(
  '/team/:id/credentials',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN),
  async (req: Request, res: Response, next) => {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ success: false, message: 'Password must be at least 4 characters long' });
      }

      const passwordHash = await bcrypt.hash(newPassword.trim(), 10);
      await prisma.user.update({
        where: { id, organizationId: req.user!.organizationId },
        data: { passwordHash },
      });

      res.json({ success: true, message: 'Employee password updated successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

// In-memory + file-backed storage for universal custom dropdown options across all dashboards
import fs from 'fs';
import path from 'path';
const CUSTOM_OPTIONS_FILE = path.resolve(process.cwd(), 'custom-dropdowns.json');

function loadCustomOptions(): Record<string, string[]> {
  try {
    if (fs.existsSync(CUSTOM_OPTIONS_FILE)) {
      const raw = fs.readFileSync(CUSTOM_OPTIONS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed reading custom options file:', e);
  }
  return {};
}

function saveCustomOptions(data: Record<string, string[]>) {
  try {
    fs.writeFileSync(CUSTOM_OPTIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed saving custom options file:', e);
  }
}

// GET /api/settings/custom-options - get all custom dropdown options for all dashboards
router.get('/custom-options', (req: Request, res: Response) => {
  const options = loadCustomOptions();
  res.json({ success: true, options });
});

// POST /api/settings/custom-options - add a new custom dropdown option permanently
router.post('/custom-options', (req: Request, res: Response) => {
  const { categoryKey, option } = req.body;
  if (!categoryKey || !option || typeof option !== 'string') {
    return res.status(400).json({ success: false, message: 'categoryKey and option are required' });
  }

  const cleanOption = option.trim();
  if (!cleanOption) {
    return res.status(400).json({ success: false, message: 'Option text cannot be empty' });
  }

  const allOptions = loadCustomOptions();
  const currentList = allOptions[categoryKey] || [];

  if (!currentList.includes(cleanOption)) {
    currentList.push(cleanOption);
    allOptions[categoryKey] = currentList;
    saveCustomOptions(allOptions);
  }

  res.json({ success: true, options: allOptions, added: cleanOption });
});

export default router;

