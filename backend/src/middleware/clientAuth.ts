import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../prisma.js';
import { RoleType, ClientStatus } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'caflow_super_secret_jwt_key_2026_finance_ops';

export interface AuthenticatedClientPayload {
  userId: string;
  orgId: string;
  clientId: string;
  clientName: string;
  role: RoleType;
  portalId: string;
  sessionTokenId?: string;
}

declare global {
  namespace Express {
    interface Request {
      clientPortalUser?: AuthenticatedClientPayload;
    }
  }
}

/**
 * Strict Client Portal Token Authentication Middleware
 * Enforces:
 * 1. Valid signature and unexpired token
 * 2. Role is strictly CLIENT
 * 3. ClientPortal is ACTIVE
 * 4. ClientSession is valid and not revoked
 * 5. Attaches authenticated clientId from token only (prevents IDOR)
 */
export const authenticateClientToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Access denied: Client authentication required. Please log in via Mobile OTP.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedClientPayload;

    if (decoded.role !== RoleType.CLIENT || !decoded.clientId) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: This resource is strictly restricted to authenticated client entities.',
      });
      return;
    }

    // Check ClientPortal status
    const portal = await prisma.clientPortal.findUnique({
      where: { clientId: decoded.clientId },
      select: { id: true, status: true, primaryMobile: true },
    });

    if (!portal || portal.status !== ClientStatus.ACTIVE) {
      res.status(403).json({
        success: false,
        message: 'Your Client Portal access has been deactivated or suspended by the administrator.',
      });
      return;
    }

    // Verify session if sessionTokenId is present
    if (decoded.sessionTokenId) {
      const tokenHash = crypto.createHash('sha256').update(decoded.sessionTokenId).digest('hex');
      const session = await prisma.clientSession.findUnique({
        where: { tokenHash },
        select: { isRevoked: true, expiresAt: true },
      });

      if (!session || session.isRevoked || new Date() > session.expiresAt) {
        res.status(401).json({
          success: false,
          message: 'Session has expired or was revoked. Please log in again with OTP.',
        });
        return;
      }
    }

    // Attach strictly isolated identity to Request
    req.clientPortalUser = decoded;
    req.user = {
      id: decoded.userId,
      organizationId: decoded.orgId,
      email: '',
      fullName: decoded.clientName,
      role: RoleType.CLIENT,
      clientId: decoded.clientId,
      clientName: decoded.clientName,
    };

    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired portal session token. Please log in again.',
    });
  }
};
