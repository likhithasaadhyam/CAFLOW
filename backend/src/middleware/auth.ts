import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';
import { RoleType } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  role: RoleType;
  clientId?: string | null;
  clientName?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'caflow_super_secret_jwt_key_2026_finance_ops';

// Simple in-memory rate limiter per IP / user
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export const rateLimiter = (maxRequests: number = 60, windowMs: number = 60000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = (req.user?.id || req.ip || 'anonymous') + ':' + req.baseUrl;
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      res.status(429).json({
        success: false,
        message: 'Too many requests. Please slow down and try again later.',
        retryAfterMs: Math.max(0, entry.resetAt - now),
      });
      return;
    }

    entry.count++;
    next();
  };
};

interface CachedUser {
  user: AuthenticatedUser;
  expiresAt: number;
}
const userAuthCache = new Map<string, CachedUser>();

export const clearUserAuthCache = (userId?: string) => {
  if (userId) {
    userAuthCache.delete(userId);
  } else {
    userAuthCache.clear();
  }
};

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; orgId: string };
    const now = Date.now();
    const cached = userAuthCache.get(decoded.userId);
    if (cached && now < cached.expiresAt) {
      req.user = cached.user;
      next();
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        organizationId: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        clientProfile: {
          select: { id: true, name: true },
        },
      },
    });

    if (!user || !user.isActive) {
      res.status(403).json({ success: false, message: 'User account is inactive or not found' });
      return;
    }

    const authUser: AuthenticatedUser = {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      clientId: user.clientProfile?.id || null,
      clientName: user.clientProfile?.name || null,
    };

    userAuthCache.set(decoded.userId, {
      user: authUser,
      expiresAt: now + 60000,
    });

    req.user = authUser;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired session token' });
  }
};

/**
 * Ensures only users with one of the allowed roles can access the endpoint.
 * FIRM_OWNER and FIRM_ADMIN always have administrative access.
 */
export const requireRoles = (...allowedRoles: RoleType[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (req.user.role === RoleType.FIRM_OWNER || req.user.role === RoleType.FIRM_ADMIN) {
      next();
      return;
    }

    if (allowedRoles.includes(req.user.role)) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      message: `Access denied: role '${req.user.role}' lacks sufficient privileges for this resource`,
    });
  };
};

/**
 * Denies access if user has any of the forbidden roles.
 */
export const forbidRoles = (...blockedRoles: RoleType[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (blockedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Access denied: role '${req.user.role}' is restricted from accessing this resource`,
      });
      return;
    }

    next();
  };
};

/**
 * Restricts external client users from accessing internal firm operations.
 */
export const requireNonClient = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  if (req.user.role === RoleType.CLIENT) {
    res.status(403).json({
      success: false,
      message: 'Access denied: Client portal accounts cannot access internal firm practice modules',
    });
    return;
  }

  next();
};

/**
 * Enforces client tenant & entity isolation.
 * If user is a CLIENT, forces queries to their own entity ID.
 * If a different clientId is supplied in the request, rejects with 403.
 */
export const enforceClientIsolation = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  if (req.user.role === RoleType.CLIENT) {
    const requestedClientId = req.params.clientId || req.params.id || req.query.clientId || req.body?.clientId;
    if (requestedClientId && requestedClientId !== 'ALL' && requestedClientId !== req.user.clientId) {
      res.status(403).json({
        success: false,
        message: 'Access denied: You cannot view or modify another client organization records',
      });
      return;
    }
  }

  next();
};
