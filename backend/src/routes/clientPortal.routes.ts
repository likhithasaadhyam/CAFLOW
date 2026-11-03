import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ClientPortalService } from '../services/clientPortal.service.js';
import { authenticateClientToken } from '../middleware/clientAuth.js';
import { rateLimiter } from '../middleware/auth.js';

const router = Router();

// Flexible Validation Schemas supporting phone-only and name+phone
const validateSchema = z.object({
  mobile: z.string().optional(),
  mobileNumber: z.string().optional(),
  name: z.string().optional(),
  clientName: z.string().optional(),
}).transform(data => ({
  mobile: (data.mobile || data.mobileNumber || '').trim(),
  name: (data.name || data.clientName || '').trim(),
})).refine(data => data.mobile.replace(/\D/g, '').length === 10, {
  message: 'Please provide a valid 10-digit registered mobile number',
  path: ['mobile'],
});

const verifyOtpSchema = z.object({
  mobile: z.string().optional(),
  mobileNumber: z.string().optional(),
  name: z.string().optional(),
  clientName: z.string().optional(),
  otp: z.string().length(6, 'Verification code must be exactly 6 digits'),
}).transform(data => ({
  mobile: (data.mobile || data.mobileNumber || '').trim(),
  name: (data.name || data.clientName || '').trim(),
  otp: data.otp.trim(),
})).refine(data => data.mobile.replace(/\D/g, '').length === 10, {
  message: 'Please provide a valid 10-digit registered mobile number',
  path: ['mobile'],
});

/**
 * POST /api/client-portal/login
 * DIRECT CREDENTIAL LOGIN: Business Name + Password (Connected Mobile Number)
 * When both match, client dashboard session is established immediately
 */
router.post('/login', rateLimiter(20, 60000), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessName = (req.body.businessName || req.body.clientName || req.body.name || '').trim();
    const phonePassword = (req.body.phonePassword || req.body.password || req.body.mobile || req.body.mobileNumber || '').trim();

    const metadata = {
      ipAddress: req.ip || req.socket.remoteAddress || undefined,
      userAgent: req.headers['user-agent'],
    };

    const result = await ClientPortalService.loginWithCredentials(businessName, phonePassword, metadata);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Invalid Business Name or Registered Mobile Number password.',
    });
  }
});

/**
 * POST /api/client-portal/validate
 * STEP 2: Validates that the client exists and portal is ACTIVE
 */
router.post('/validate', rateLimiter(20, 60000), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, mobile } = validateSchema.parse(req.body);
    const result = await ClientPortalService.validateClient(mobile, name);

    res.json({
      success: true,
      message: 'Client credentials validated successfully.',
      clientName: result.client.name,
      portalId: result.portal.id,
      maskedMobile: result.portal.primaryMobile.replace(/(\d{2})\d{4}(\d{4})/, '+91 $1******$2'),
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Validation failed. Please verify your registered mobile number.',
    });
  }
});

/**
 * POST /api/client-portal/send-otp
 * STEP 3: Generates 6-digit cryptographically secure OTP, hashes it, stores in DB, sends via SMS
 */
router.post('/send-otp', rateLimiter(10, 60000), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, mobile } = validateSchema.parse(req.body);
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';

    const result = await ClientPortalService.sendOtp(mobile, name, clientIp);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Failed to dispatch verification code.',
    });
  }
});

/**
 * POST /api/client-portal/verify-otp
 * STEP 4: Verifies OTP, checks expiry, tracks attempts, creates authenticated session
 */
router.post('/verify-otp', rateLimiter(15, 60000), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, mobile, otp } = verifyOtpSchema.parse(req.body);
    const metadata = {
      ipAddress: req.ip || req.socket.remoteAddress || undefined,
      userAgent: req.headers['user-agent'],
    };

    const result = await ClientPortalService.verifyOtp(mobile, otp, name, metadata);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Invalid or expired verification code.',
    });
  }
});

/**
 * POST /api/client-portal/resend-otp
 * Resend OTP with cooldown
 */
router.post('/resend-otp', rateLimiter(10, 60000), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, mobile } = validateSchema.parse(req.body);
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';

    const result = await ClientPortalService.resendOtp(mobile, name, clientIp);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || 'Unable to resend verification code.',
    });
  }
});

/**
 * POST /api/client-portal/logout
 * Revokes current session
 */
router.post('/logout', authenticateClientToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionTokenId = req.clientPortalUser?.sessionTokenId;
    const portalId = req.clientPortalUser?.portalId;
    const result = await ClientPortalService.logout(sessionTokenId, portalId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Logout failed' });
  }
});

/**
 * GET /api/client-portal/me
 * Returns authenticated client's verified identity
 */
router.get('/me', authenticateClientToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clientId = req.clientPortalUser!.clientId;
    const orgId = req.clientPortalUser!.orgId;

    const data = await ClientPortalService.getClientDashboardData(clientId, orgId);
    res.json({
      success: true,
      client: data.client,
      portalAccount: data.client.portalAccount,
    });
  } catch (err: any) {
    res.status(404).json({ success: false, message: err.message || 'Client profile not found' });
  }
});

/**
 * GET /api/client-portal/dashboard
 * Returns strictly isolated client information:
 * Tasks, documents, invoices, payments, services, retainers.
 * Client A NEVER sees Client B's data!
 */
router.get('/dashboard', authenticateClientToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clientId = req.clientPortalUser!.clientId;
    const orgId = req.clientPortalUser!.orgId;

    const data = await ClientPortalService.getClientDashboardData(clientId, orgId);
    res.json({
      success: true,
      data,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load client dashboard' });
  }
});

/**
 * POST /api/client-portal/documents/upload
 * Allows authenticated clients to upload documents directly into their vault
 */
router.post('/documents/upload', authenticateClientToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clientId = req.clientPortalUser!.clientId;
    const orgId = req.clientPortalUser!.orgId;
    const { name, category, fileUrl, fileSize, fileType } = req.body;

    const doc = await ClientPortalService.uploadClientDocument(clientId, orgId, {
      name,
      category,
      fileUrl,
      fileSize,
      fileType,
    });

    res.json({
      success: true,
      message: 'Document uploaded successfully to your vault.',
      data: doc,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Document upload failed' });
  }
});

export default router;
