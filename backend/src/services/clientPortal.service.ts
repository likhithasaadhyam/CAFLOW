import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';
import { SmsService } from './sms.service.js';
import { ClientStatus, RoleType } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'caflow_super_secret_jwt_key_2026_finance_ops';
const OTP_EXPIRY_MINUTES = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

// In-memory rate limiting map for OTP requests: mobile/ip -> { count, windowStart }
const otpRateLimitMap = new Map<string, { count: number; windowStart: number }>();
const MAX_OTP_REQUESTS_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export class ClientPortalService {
  /**
   * Helper to set rate limit state for security tests
   */
  public static simulateRateLimit(ip: string, mobile: string, count: number) {
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    otpRateLimitMap.set(`${ip}:${cleanMobile}`, { count, windowStart: Date.now() });
  }

  /**
   * Automatically creates or links a Client Portal account for a Client
   * Ensures no duplicates; sets status to ACTIVE.
   */
  public static async ensurePortalAccount(client: {
    id: string;
    organizationId: string;
    name: string;
    mobile?: string | null;
    email?: string | null;
  }) {
    if (!client.id) throw new Error('Client ID is required');

    const cleanMobile = (client.mobile || '').replace(/\D/g, '');
    const primaryMobile = cleanMobile || '9845012345'; // fallback if not provided

    // Check if portal already exists
    const existing = await prisma.clientPortal.findUnique({
      where: { clientId: client.id },
    });

    if (existing) {
      // If mobile number was updated, sync it
      if (cleanMobile && existing.primaryMobile !== cleanMobile) {
        return prisma.clientPortal.update({
          where: { id: existing.id },
          data: { primaryMobile: cleanMobile },
        });
      }
      return existing;
    }

    // Also check if a portal User exists or create one
    let portalUser = await prisma.user.findFirst({
      where: {
        organizationId: client.organizationId,
        role: RoleType.CLIENT,
        email: client.email || `client_${client.id.slice(0, 8)}@portal.manavi.com`,
      },
    });

    if (!portalUser) {
      portalUser = await prisma.user.create({
        data: {
          organizationId: client.organizationId,
          email: client.email || `client_${client.id.slice(0, 8)}@portal.manavi.com`,
          fullName: client.name,
          phone: primaryMobile,
          passwordHash: 'PORTAL_AUTH_VIA_OTP_ONLY',
          role: RoleType.CLIENT,
          isActive: true,
        },
      });
    }

    // Link client to portalUser if not linked
    await prisma.client.update({
      where: { id: client.id },
      data: { portalUserId: portalUser.id },
    }).catch(() => {});

    // Create the unique ClientPortal record
    const portal = await prisma.clientPortal.create({
      data: {
        clientId: client.id,
        status: ClientStatus.ACTIVE,
        primaryMobile,
      },
      include: {
        client: {
          select: { id: true, name: true, mobile: true, email: true },
        },
      },
    });

    return portal;
  }

  /**
   * STEP 2: Validate Client by Registered Mobile Number (and optionally Client Name)
   */
  public static async validateClient(param1: string, param2?: string) {
    // Determine mobile and name regardless of argument order
    let mobile = (param1 || '').replace(/\D/g, '').slice(-10);
    let name = (param2 || '').trim();

    if (mobile.length !== 10 && param2) {
      mobile = param2.replace(/\D/g, '').slice(-10);
      name = (param1 || '').trim();
    }

    if (mobile.length !== 10) {
      throw new Error('Please enter a valid 10-digit Registered Mobile Number');
    }

    let matchedClient: any = null;

    // 1. If name is provided, search by matching name (case-insensitive exact or contains)
    if (name) {
      const clients = await prisma.client.findMany({
        where: {
          OR: [
            { name: { equals: name, mode: 'insensitive' } },
            { name: { contains: name, mode: 'insensitive' } },
          ],
        },
        include: { portalAccount: true },
      });

      if (clients && clients.length > 0) {
        matchedClient = clients.find((c) => {
          const cMobile = (c.mobile || '').replace(/\D/g, '').slice(-10);
          const pMobile = (c.portalAccount?.primaryMobile || '').replace(/\D/g, '').slice(-10);
          return cMobile === mobile || pMobile === mobile;
        });

        if (!matchedClient) {
          throw new Error('The connected phone number does not match this registered business name.');
        }
      } else {
        throw new Error('No registered client found matching this Business / Client Name. Please check spelling.');
      }
    }

    // 2. If name is not provided or not resolved, look up directly by mobile number
    if (!matchedClient) {
      const clientsByMobile = await prisma.client.findMany({
        where: {
          OR: [
            { mobile: { contains: mobile } },
            { portalAccount: { primaryMobile: { contains: mobile } } },
          ],
        },
        include: { portalAccount: true },
      });

      if (!clientsByMobile || clientsByMobile.length === 0) {
        throw new Error(`No registered client found for mobile number +91 ${mobile}. Please contact your CA firm.`);
      }

      matchedClient = clientsByMobile.find((c) => {
        const cMobile = (c.mobile || '').replace(/\D/g, '').slice(-10);
        const pMobile = (c.portalAccount?.primaryMobile || '').replace(/\D/g, '').slice(-10);
        return cMobile === mobile || pMobile === mobile;
      }) || clientsByMobile[0];
    }

    // Ensure portal account exists
    let portal = matchedClient.portalAccount;
    if (!portal) {
      portal = await this.ensurePortalAccount(matchedClient);
    }

    if (portal.status !== ClientStatus.ACTIVE) {
      throw new Error('Your Client Portal access has been deactivated or suspended. Please contact your CA manager.');
    }

    return {
      client: matchedClient,
      portal,
    };
  }

  /**
   * STEP 3: Generate and Send Secure 6-digit OTP
   */
  public static async sendOtp(param1: string, param2?: string, clientIp: string = '127.0.0.1') {
    const { client, portal } = await this.validateClient(param1, param2);
    const cleanMobile = (portal.primaryMobile || param1).replace(/\D/g, '').slice(-10);

    // Rate Limiting by mobile & IP
    const rateKey = `${clientIp}:${cleanMobile}`;
    const now = Date.now();
    const rateData = otpRateLimitMap.get(rateKey);

    if (rateData) {
      if (now - rateData.windowStart < RATE_LIMIT_WINDOW_MS) {
        if (rateData.count >= MAX_OTP_REQUESTS_PER_HOUR) {
          throw new Error('Too many OTP requests for this number. For security, please wait an hour before trying again.');
        }
        rateData.count++;
      } else {
        otpRateLimitMap.set(rateKey, { count: 1, windowStart: now });
      }
    } else {
      otpRateLimitMap.set(rateKey, { count: 1, windowStart: now });
    }

    // Check resend cooldown from previous OTP (60s)
    const latestOtp = await prisma.clientOTP.findFirst({
      where: {
        clientPortalId: portal.id,
        isConsumed: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latestOtp) {
      const elapsedSeconds = Math.floor((now - latestOtp.createdAt.getTime()) / 1000);
      if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
        throw new Error(`Please wait ${RESEND_COOLDOWN_SECONDS - elapsedSeconds} seconds before requesting a new OTP.`);
      }

      // Invalidate previous unconsumed OTP
      await prisma.clientOTP.update({
        where: { id: latestOtp.id },
        data: { isConsumed: true, consumedAt: new Date() },
      });
    }

    // Generate cryptographically secure 6-digit OTP
    const rawOtp = SmsService.generateSecureOtp();
    const otpHash = SmsService.hashOtp(rawOtp, portal.id);
    const expiresAt = new Date(now + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Save hashed OTP in database
    await prisma.clientOTP.create({
      data: {
        clientPortalId: portal.id,
        mobileNumber: cleanMobile,
        otpHash,
        expiresAt,
        attempts: 0,
        maxAttempts: MAX_OTP_ATTEMPTS,
        isConsumed: false,
      },
    });

    // Send through SMS gateway
    const smsService = SmsService.getInstance();
    await smsService.sendOtp(cleanMobile, rawOtp, client.name);

    // Return masked mobile to frontend
    const maskedMobile = cleanMobile.replace(/(\d{2})\d{4}(\d{4})/, '+91 $1******$2');

    return {
      success: true,
      message: `OTP sent successfully to registered mobile number ${maskedMobile}`,
      maskedMobile,
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
      resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
    };
  }

  /**
   * STEP 4: Verify OTP and Establish Authenticated Session
   */
  public static async verifyOtp(
    param1: string,
    param2: string,
    param3?: string,
    metadata: { ipAddress?: string; userAgent?: string } = {}
  ) {
    let name = '';
    let mobile = '';
    let enteredOtp = '';

    if (param3) {
      // Called with (name, mobile, otp) or (mobile, name, otp)
      if (param1.replace(/\D/g, '').length === 10) {
        mobile = param1;
        name = param2;
      } else {
        name = param1;
        mobile = param2;
      }
      enteredOtp = param3;
    } else {
      // Called with (mobile, otp)
      mobile = param1;
      enteredOtp = param2;
    }

    const { client, portal } = await this.validateClient(mobile, name);
    const cleanMobile = (portal.primaryMobile || mobile).replace(/\D/g, '').slice(-10);

    const otpRecord = await prisma.clientOTP.findFirst({
      where: {
        clientPortalId: portal.id,
        mobileNumber: cleanMobile,
        isConsumed: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new Error('No active OTP found. Please request a new verification code.');
    }

    const now = new Date();

    // Check expiration
    if (now > otpRecord.expiresAt) {
      await prisma.clientOTP.update({
        where: { id: otpRecord.id },
        data: { isConsumed: true },
      });
      throw new Error('OTP has expired (validity is 5 minutes). Please request a new code.');
    }

    // Check maximum failed attempts
    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      await prisma.clientOTP.update({
        where: { id: otpRecord.id },
        data: { isConsumed: true },
      });
      throw new Error('Maximum incorrect OTP attempts exceeded. For your security, this OTP has been invalidated.');
    }

    // Timing-safe OTP hash verification (also supports 123456 in development for instant login testing)
    const isMasterDemoOtp = process.env.NODE_ENV !== 'production' && enteredOtp.trim() === '123456';
    const isValid = isMasterDemoOtp || SmsService.verifyOtpHash(enteredOtp.trim(), otpRecord.otpHash, portal.id);

    if (!isValid) {
      // Increment attempt counter
      await prisma.clientOTP.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      const remainingAttempts = otpRecord.maxAttempts - (otpRecord.attempts + 1);
      throw new Error(`Incorrect verification code. ${remainingAttempts} attempts remaining.`);
    }

    // Mark OTP as consumed (prevent replay attacks)
    await prisma.clientOTP.update({
      where: { id: otpRecord.id },
      data: { isConsumed: true, consumedAt: now },
    });

    // Update portal lastLoginAt
    await prisma.clientPortal.update({
      where: { id: portal.id },
      data: { lastLoginAt: now },
    });

    // Create session record
    const sessionTokenId = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionTokenId).digest('hex');
    const sessionExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.clientSession.create({
      data: {
        clientPortalId: portal.id,
        tokenHash,
        ipAddress: metadata.ipAddress || null,
        userAgent: metadata.userAgent || null,
        expiresAt: sessionExpiry,
        isRevoked: false,
      },
    });

    // Sign JWT token strictly scoped with CLIENT role and clientId
    const token = jwt.sign(
      {
        userId: client.portalUserId || client.id,
        orgId: client.organizationId,
        clientId: client.id,
        clientName: client.name,
        role: RoleType.CLIENT,
        portalId: portal.id,
        sessionTokenId,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      success: true,
      token,
      client: {
        id: client.id,
        name: client.name,
        portalAccountId: portal.id,
        clientType: client.clientType,
        mobile: cleanMobile,
        email: client.email,
        pan: client.pan,
        gstin: client.gstin,
      },
    };
  }

  /**
   * DIRECT CREDENTIAL LOGIN: Business Name + Password (Connected Mobile Number)
   * Matches both and grants instant authenticated client dashboard session
   */
  public static async loginWithCredentials(
    businessName: string,
    phonePassword: string,
    metadata: { ipAddress?: string; userAgent?: string } = {}
  ) {
    const cleanMobile = (phonePassword || '').replace(/\D/g, '').slice(-10);
    const cleanName = (businessName || '').trim();

    if (!cleanName) {
      throw new Error('Please enter your Business / Client Name.');
    }
    if (cleanMobile.length !== 10) {
      throw new Error('Please enter your connected 10-digit mobile number as password.');
    }

    // Look up client by matching name and phone
    const { client, portal } = await this.validateClient(cleanMobile, cleanName);

    const now = new Date();

    // Update portal lastLoginAt
    await prisma.clientPortal.update({
      where: { id: portal.id },
      data: { lastLoginAt: now },
    });

    // Create session record
    const sessionTokenId = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionTokenId).digest('hex');
    const sessionExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.clientSession.create({
      data: {
        clientPortalId: portal.id,
        tokenHash,
        ipAddress: metadata.ipAddress || null,
        userAgent: metadata.userAgent || null,
        expiresAt: sessionExpiry,
        isRevoked: false,
      },
    });

    // Sign JWT token strictly scoped with CLIENT role and clientId
    const token = jwt.sign(
      {
        userId: client.portalUserId || client.id,
        orgId: client.organizationId,
        clientId: client.id,
        clientName: client.name,
        role: RoleType.CLIENT,
        portalId: portal.id,
        sessionTokenId,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      success: true,
      message: `Welcome back, ${client.name}! Opening your client dashboard...`,
      token,
      client: {
        id: client.id,
        name: client.name,
        portalAccountId: portal.id,
        clientType: client.clientType,
        mobile: cleanMobile,
        email: client.email,
        pan: client.pan,
        gstin: client.gstin,
      },
    };
  }

  /**
   * Resend OTP with 60s cooldown check
   */
  public static async resendOtp(param1: string, param2?: string, clientIp: string = '127.0.0.1') {
    return this.sendOtp(param1, param2, clientIp);
  }

  /**
   * Client Logout - revokes session token in database
   */
  public static async logout(sessionTokenId?: string, portalId?: string) {
    if (sessionTokenId) {
      const tokenHash = crypto.createHash('sha256').update(sessionTokenId).digest('hex');
      await prisma.clientSession.updateMany({
        where: { tokenHash },
        data: { isRevoked: true, revokedAt: new Date() },
      });
    } else if (portalId) {
      await prisma.clientSession.updateMany({
        where: { clientPortalId: portalId, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      });
    }
    return { success: true, message: 'Logged out successfully' };
  }

  /**
   * Fetch Strictly Isolated Client Dashboard Data
   * Client A can NEVER view Client B data: scoped by clientId strictly from verified token
   */
  public static async getClientDashboardData(clientId: string, organizationId: string) {
    if (!clientId) throw new Error('Unauthorized client identity');

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId },
      include: {
        portalAccount: true,
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            createdAt: true,
            service: { select: { name: true, category: true } },
          },
          orderBy: { dueDate: 'asc' },
        },
        services: {
          select: {
            id: true,
            customFee: true,
            service: {
              select: {
                id: true,
                name: true,
                category: true,
                billingFrequency: true,
              },
            },
          },
        },
        retainers: {
          select: {
            id: true,
            fee: true,
            billingFrequency: true,
            service: { select: { name: true } },
          },
        },
        documents: {
          select: {
            id: true,
            name: true,
            category: true,
            fileUrl: true,
            fileSize: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        documentRequests: {
          select: {
            id: true,
            title: true,
            description: true,
            dueDate: true,
            status: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                title: true,
                isRequired: true,
                status: true,
                fileUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            dueDate: true,
            totalAmount: true,
            amountPaid: true,
            balanceDue: true,
            paymentStatus: true,
            lineItems: {
              select: {
                id: true,
                description: true,
                quantity: true,
                unitPrice: true,
                amount: true,
              },
            },
          },
          orderBy: { invoiceDate: 'desc' },
        },
        payments: {
          select: {
            id: true,
            receiptNumber: true,
            amount: true,
            paymentDate: true,
            paymentMode: true,
            referenceNumber: true,
          },
          orderBy: { paymentDate: 'desc' },
        },
        renewals: {
          select: {
            id: true,
            renewalType: true,
            licenseNumber: true,
            expiryDate: true,
            status: true,
          },
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    if (!client) {
      throw new Error('Client record not found');
    }

    // Calculate real financial aggregations
    const totalBilled = client.invoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
    const totalPaid = client.payments.reduce((acc, pay) => acc + (pay.amount || 0), 0);
    const pendingBalance = client.invoices.reduce((acc, inv) => acc + (inv.balanceDue || 0), 0);

    return {
      client: {
        id: client.id,
        name: client.name,
        clientType: client.clientType,
        fileNo: client.fileNo,
        primaryContact: client.primaryContact,
        mobile: client.mobile,
        email: client.email,
        address: client.address,
        pan: client.pan,
        gstin: client.gstin,
        tan: client.tan,
        bankAccountNo: client.bankAccountNo,
        ifscCode: client.ifscCode,
        notes: client.notes,
        portalAccount: client.portalAccount,
      },
      metrics: {
        totalTasks: client.tasks.length,
        pendingTasks: client.tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length,
        completedTasks: client.tasks.filter((t) => t.status === 'COMPLETED').length,
        totalDocuments: client.documents.length,
        pendingDocumentRequests: client.documentRequests.filter((r) => r.status === 'PENDING').length,
        totalBilled,
        totalPaid,
        pendingBalance,
      },
      tasks: client.tasks,
      services: client.services,
      retainers: client.retainers,
      documents: client.documents,
      documentRequests: client.documentRequests,
      invoices: client.invoices,
      payments: client.payments,
      renewals: client.renewals,
      supportContact: {
        firmName: 'MANAVI ASSOCIATES',
        email: 'contact@manaviassociates.com',
        phone: '+91 98765 43210',
        managingPartner: 'Kapil Gangapure',
      },
    };
  }

  /**
   * CLIENT: Upload Document directly from Client Portal
   */
  public static async uploadClientDocument(
    clientId: string,
    organizationId: string,
    docData: {
      name: string;
      category?: string;
      fileUrl: string;
      fileSize?: number;
      fileType?: string;
    }
  ) {
    if (!clientId) throw new Error('Client identity missing');
    if (!docData.name) throw new Error('Document name is required');

    const createdDoc = await prisma.document.create({
      data: {
        organizationId,
        clientId,
        name: docData.name.trim(),
        category: (docData.category as any) || 'OTHER',
        fileUrl: docData.fileUrl || '/uploads/client_doc.pdf',
        fileSize: docData.fileSize || 102400,
        fileType: docData.fileType || 'application/pdf',
      },
    });

    return createdDoc;
  }

  /**
   * ADMIN: Get Portal Details for a Client
   */
  public static async getAdminClientPortal(clientId: string, organizationId: string) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId },
      include: {
        portalAccount: {
          include: {
            otps: {
              orderBy: { createdAt: 'desc' },
              take: 10,
              select: {
                id: true,
                mobileNumber: true,
                attempts: true,
                isConsumed: true,
                consumedAt: true,
                expiresAt: true,
                createdAt: true,
              },
            },
            sessions: {
              where: { isRevoked: false },
              select: {
                id: true,
                ipAddress: true,
                userAgent: true,
                createdAt: true,
                expiresAt: true,
              },
            },
          },
        },
      },
    });

    if (!client) throw new Error('Client not found');

    // If portal doesn't exist yet, automatically initialize it
    let portal = client.portalAccount;
    if (!portal) {
      portal = (await this.ensurePortalAccount(client)) as any;
    }

    return {
      client: {
        id: client.id,
        name: client.name,
        mobile: client.mobile,
        email: client.email,
        createdAt: client.createdAt,
      },
      portal,
    };
  }

  /**
   * ADMIN: Toggle or Set Portal Status (ACTIVE / INACTIVE)
   */
  public static async updatePortalStatus(clientId: string, organizationId: string, status: ClientStatus) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId },
      include: { portalAccount: true },
    });

    if (!client) throw new Error('Client not found');

    const portal = client.portalAccount || (await this.ensurePortalAccount(client));

    const updated = await prisma.clientPortal.update({
      where: { id: portal.id },
      data: { status },
    });

    // If deactivating, revoke all active sessions immediately
    if (status !== ClientStatus.ACTIVE) {
      await prisma.clientSession.updateMany({
        where: { clientPortalId: portal.id, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      });
    }

    return updated;
  }

  /**
   * ADMIN: Revoke All Active Sessions for a Client Portal
   */
  public static async revokeAllClientSessions(clientId: string, organizationId: string) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId },
      include: { portalAccount: true },
    });

    if (!client || !client.portalAccount) {
      throw new Error('Client portal account not found');
    }

    const result = await prisma.clientSession.updateMany({
      where: { clientPortalId: client.portalAccount.id, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    return { success: true, count: result.count, message: `Revoked ${result.count} active session(s)` };
  }

  /**
   * ADMIN: Update Registered Mobile Number for Client Portal
   * Enforces security: revokes existing sessions so client re-authenticates with new mobile.
   */
  public static async updateRegisteredMobile(
    clientId: string,
    organizationId: string,
    newMobile: string,
    reason?: string
  ) {
    const cleanMobile = newMobile.replace(/\D/g, '').slice(-10);
    if (cleanMobile.length !== 10) {
      throw new Error('Please enter a valid 10-digit mobile number');
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId },
      include: { portalAccount: true },
    });

    if (!client) throw new Error('Client not found');

    // Update client.mobile and clientPortal.primaryMobile
    await prisma.client.update({
      where: { id: clientId },
      data: { mobile: cleanMobile },
    });

    const portal = client.portalAccount || (await this.ensurePortalAccount(client));

    const updatedPortal = await prisma.clientPortal.update({
      where: { id: portal.id },
      data: { primaryMobile: cleanMobile },
    });

    // Revoke previous sessions
    await prisma.clientSession.updateMany({
      where: { clientPortalId: portal.id, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        entityType: 'ClientPortal',
        entityId: portal.id,
        action: 'UPDATE_MOBILE',
        changesJson: JSON.stringify({
          oldMobile: portal.primaryMobile,
          newMobile: cleanMobile,
          reason: reason || 'Admin updated registered mobile',
        }),
      },
    }).catch(() => {});

    return {
      success: true,
      message: 'Registered mobile number updated successfully. Active sessions revoked for security.',
      portal: updatedPortal,
    };
  }
}
