import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../prisma.js';
import { authenticateToken, rateLimiter, requireNonClient } from '../middleware/auth.js';
import { RoleType } from '@prisma/client';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'caflow_super_secret_jwt_key_2026_finance_ops';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Rate limit login endpoint to 20 attempts per minute per IP
router.post('/login', rateLimiter(20, 60000), async (req: Request, res: Response, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            timezone: true,
            currency: true,
          },
        },
        clientProfile: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, message: 'Invalid credentials or inactive account' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      // Record failed login audit log
      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          entityType: 'User',
          entityId: user.id,
          action: 'LOGIN_FAILED',
          ipAddress: req.ip || '127.0.0.1',
        },
      }).catch(() => {});

      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, orgId: user.organizationId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Audit log asynchronously (non-blocking)
    prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        entityType: 'User',
        entityId: user.id,
        action: 'LOGIN',
        ipAddress: req.ip || '127.0.0.1',
      },
    }).catch(() => {});

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        designation: user.designation,
        department: user.department,
        avatarUrl: user.avatarUrl,
        organization: user.organization,
        clientId: user.clientProfile?.id || null,
        clientName: user.clientProfile?.name || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        organization: true,
        clientProfile: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        designation: user.designation,
        department: user.department,
        avatarUrl: user.avatarUrl,
        organization: user.organization,
        clientId: user.clientProfile?.id || null,
        clientName: user.clientProfile?.name || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/users', authenticateToken, requireNonClient, async (req: Request, res: Response, next) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        organizationId: req.user!.organizationId,
        isActive: true,
        role: { not: RoleType.CLIENT },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        designation: true,
        department: true,
        avatarUrl: true,
      },
      orderBy: { fullName: 'asc' },
    });

    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
});

export default router;
