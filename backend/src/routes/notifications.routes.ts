import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';
import { NotificationCategory, NotificationChannel, NotificationStatus, RoleType } from '@prisma/client';

const router = Router();

// In-memory read tracking set for synthesized / dynamic notifications
const readNotificationIds = new Set<string>();

// GET /api/notifications/in-app - Get role-scoped in-app notifications
router.get('/in-app', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const clientId = req.user!.clientId;
    const now = new Date();

    // 1. Fetch persistent database notifications for this user / org
    const dbNotifications = await prisma.notification.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { userId },
          { clientId: clientId || undefined },
          { userId: null, clientId: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    const items: Array<{
      id: string;
      title: string;
      message: string;
      category: string;
      link: string;
      status: 'READ' | 'UNREAD';
      createdAt: string;
      relativeTime: string;
    }> = dbNotifications.map(n => {
      const isRead = n.status === NotificationStatus.READ || readNotificationIds.has(n.id);
      let link = '/dashboard';
      if (n.type === NotificationCategory.TASK) link = '/tasks';
      else if (n.type === NotificationCategory.PAYMENT) link = '/finance';
      else if (n.type === NotificationCategory.RENEWAL) link = '/renewals';
      else if (n.type === NotificationCategory.DOCUMENT) link = '/documents';

      return {
        id: n.id,
        title: n.title,
        message: n.message,
        category: n.type,
        link,
        status: isRead ? 'READ' : 'UNREAD',
        createdAt: n.createdAt.toISOString(),
        relativeTime: formatRelativeTime(n.createdAt),
      };
    });

    // 2. Synthesize live role-scoped notifications from database state
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const in7Days = new Date(today.getTime() + 7 * 86400000);

    // ATTENDANCE UPDATE (All staff roles)
    if (userRole !== RoleType.CLIENT) {
      const attendance = await prisma.attendanceRecord.findFirst({
        where: { organizationId: orgId, userId, date: today },
      });
      const attId = `att-${userId}-${today.toISOString().split('T')[0]}`;
      if (attendance && attendance.checkInTime) {
        items.push({
          id: attId,
          title: 'Daily Attendance Active',
          message: `Checked in at ${new Date(attendance.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. Total logged: ${attendance.totalWorkingMinutes || 0} mins.`,
          category: 'ATTENDANCE',
          link: '/attendance',
          status: readNotificationIds.has(attId) ? 'READ' : 'UNREAD',
          createdAt: attendance.checkInTime.toISOString(),
          relativeTime: 'Today',
        });
      } else {
        items.push({
          id: attId,
          title: 'Attendance Reminder',
          message: 'You have not punched check-in for today yet.',
          category: 'ATTENDANCE',
          link: '/attendance',
          status: readNotificationIds.has(attId) ? 'READ' : 'UNREAD',
          createdAt: now.toISOString(),
          relativeTime: 'Today',
        });
      }
    }

    // TO-DO REMINDERS (All staff roles)
    if (userRole !== RoleType.CLIENT) {
      const pendingTodo = await prisma.todo.findFirst({
        where: { organizationId: orgId, userId, status: 'PENDING' },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      });
      if (pendingTodo) {
        const todoId = `todo-${pendingTodo.id}`;
        items.push({
          id: todoId,
          title: `To-Do Reminder: ${pendingTodo.title}`,
          message: `Priority: ${pendingTodo.priority} • Category: ${pendingTodo.category}`,
          category: 'TODO',
          link: '/todo',
          status: readNotificationIds.has(todoId) ? 'READ' : 'UNREAD',
          createdAt: pendingTodo.createdAt.toISOString(),
          relativeTime: formatRelativeTime(pendingTodo.createdAt),
        });
      }
    }

    // TASK UPDATES (Role-Scoped)
    if (userRole === RoleType.EMPLOYEE) {
      const assignedTasks = await prisma.task.findMany({
        where: { organizationId: orgId, assignments: { some: { userId } }, status: { not: 'COMPLETED' } },
        include: { client: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 3,
      });
      for (const t of assignedTasks) {
        const tId = `task-${t.id}`;
        items.push({
          id: tId,
          title: `Assigned Task: ${t.title}`,
          message: `Client: ${t.client?.name || 'Firm'} • Due: ${t.dueDate.toLocaleDateString('en-IN')}`,
          category: 'TASK',
          link: `/tasks?id=${t.id}`,
          status: readNotificationIds.has(tId) ? 'READ' : 'UNREAD',
          createdAt: t.createdAt.toISOString(),
          relativeTime: formatRelativeTime(t.createdAt),
        });
      }
    }

    // REVIEW QUEUE (Manager, Owner, Admin)
    if (([RoleType.MANAGER, RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN] as RoleType[]).includes(userRole)) {
      const reviewTasks = await prisma.task.findMany({
        where: { organizationId: orgId, status: 'SUBMITTED_FOR_REVIEW' },
        include: { client: { select: { name: true } } },
        take: 2,
      });
      for (const rt of reviewTasks) {
        const rtId = `review-${rt.id}`;
        items.push({
          id: rtId,
          title: `Review Required: ${rt.title}`,
          message: `Submitted by staff for approval • Client: ${rt.client?.name || 'General'}`,
          category: 'TASK',
          link: `/tasks?id=${rt.id}`,
          status: readNotificationIds.has(rtId) ? 'READ' : 'UNREAD',
          createdAt: rt.updatedAt.toISOString(),
          relativeTime: formatRelativeTime(rt.updatedAt),
        });
      }
    }

    // STATUTORY COMPLIANCE DEADLINES (Tax Pro, Owner, Admin)
    if (([RoleType.TAX_PROFESSIONAL, RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN] as RoleType[]).includes(userRole)) {
      const upcomingTasks = await prisma.task.findMany({
        where: { organizationId: orgId, status: { not: 'COMPLETED' }, dueDate: { gte: today, lte: in7Days } },
        include: { client: { select: { name: true } } },
        take: 2,
      });
      for (const ut of upcomingTasks) {
        const utId = `deadline-${ut.id}`;
        items.push({
          id: utId,
          title: `Deadline Approaching: ${ut.title}`,
          message: `Due on ${ut.dueDate.toLocaleDateString('en-IN')} for ${ut.client?.name}`,
          category: 'TASK',
          link: `/tasks?id=${ut.id}`,
          status: readNotificationIds.has(utId) ? 'READ' : 'UNREAD',
          createdAt: ut.createdAt.toISOString(),
          relativeTime: 'Upcoming',
        });
      }
    }

    // PAYMENTS & FINANCE (Owner, Admin, Accountant)
    if (([RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.ACCOUNTANT] as RoleType[]).includes(userRole)) {
      const recentPayment = await prisma.payment.findFirst({
        where: { organizationId: orgId },
        include: { client: { select: { name: true } } },
        orderBy: { paymentDate: 'desc' },
      });
      if (recentPayment) {
        const pId = `pay-${recentPayment.id}`;
        items.push({
          id: pId,
          title: 'Payment Received',
          message: `${recentPayment.client?.name} settled ₹${recentPayment.amount.toLocaleString('en-IN')} via ${recentPayment.paymentMode}`,
          category: 'PAYMENT',
          link: '/finance',
          status: readNotificationIds.has(pId) ? 'READ' : 'UNREAD',
          createdAt: recentPayment.paymentDate.toISOString(),
          relativeTime: formatRelativeTime(recentPayment.paymentDate),
        });
      }
    }

    // EXPIRING RENEWALS (Owner, Admin, Tax Pro, Manager)
    if (([RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.TAX_PROFESSIONAL, RoleType.MANAGER] as RoleType[]).includes(userRole)) {
      const expiringRenewal = await prisma.renewal.findFirst({
        where: { organizationId: orgId, status: { in: ['ACTIVE', 'EXPIRING_SOON'] } },
        include: { client: { select: { name: true } } },
        orderBy: { expiryDate: 'asc' },
      });
      if (expiringRenewal) {
        const renId = `ren-${expiringRenewal.id}`;
        items.push({
          id: renId,
          title: `Renewal Alert: ${expiringRenewal.renewalType}`,
          message: `Client: ${expiringRenewal.client?.name} • Expiry: ${expiringRenewal.expiryDate.toLocaleDateString('en-IN')}`,
          category: 'RENEWAL',
          link: '/renewals',
          status: readNotificationIds.has(renId) ? 'READ' : 'UNREAD',
          createdAt: expiringRenewal.createdAt.toISOString(),
          relativeTime: 'Expiring Soon',
        });
      }
    }

    // CLIENT ROLE NOTIFICATIONS
    if (userRole === RoleType.CLIENT && clientId) {
      const unpaidInvoice = await prisma.invoice.findFirst({
        where: { organizationId: orgId, clientId, paymentStatus: { in: ['ISSUED', 'OVERDUE'] } },
        orderBy: { dueDate: 'asc' },
      });
      if (unpaidInvoice) {
        const invId = `client-inv-${unpaidInvoice.id}`;
        items.push({
          id: invId,
          title: `Invoice Pending: ${unpaidInvoice.invoiceNumber}`,
          message: `Total ₹${unpaidInvoice.balanceDue.toLocaleString('en-IN')} due on ${unpaidInvoice.dueDate.toLocaleDateString('en-IN')}`,
          category: 'PAYMENT',
          link: '/portal',
          status: readNotificationIds.has(invId) ? 'READ' : 'UNREAD',
          createdAt: unpaidInvoice.createdAt.toISOString(),
          relativeTime: formatRelativeTime(unpaidInvoice.createdAt),
        });
      }
    }

    // Deduplicate by ID
    const seen = new Set<string>();
    const uniqueItems = items.filter(it => {
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });

    const unreadCount = uniqueItems.filter(it => it.status === 'UNREAD').length;

    res.json({
      success: true,
      unreadCount,
      data: uniqueItems,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read - Mark notification as read
router.patch('/:id/read', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    readNotificationIds.add(id);

    // If it exists in prisma.notification, update in database
    await prisma.notification.updateMany({
      where: { id, organizationId: req.user!.organizationId },
      data: { status: NotificationStatus.READ },
    }).catch(() => {});

    res.json({ success: true, message: 'Notification marked as read', id });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/mark-all-read - Mark all as read
router.post('/mark-all-read', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    await prisma.notification.updateMany({
      where: { organizationId: orgId, status: { not: NotificationStatus.READ } },
      data: { status: NotificationStatus.READ },
    }).catch(() => {});

    // Also mark in-memory
    readNotificationIds.clear();

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

// GET /api/notifications - notification history (legacy for admin)
router.get(
  '/',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER, RoleType.ACCOUNTANT),
  async (req: Request, res: Response, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: notifications });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/send - Send Notifications Wizard
router.post(
  '/send',
  authenticateToken,
  requireRoles(RoleType.FIRM_OWNER, RoleType.FIRM_ADMIN, RoleType.MANAGER, RoleType.ACCOUNTANT),
  async (req: Request, res: Response, next) => {
  try {
    const { category, channel, title, message, clientIds, filterType } = z.object({
      category: z.nativeEnum(NotificationCategory).default(NotificationCategory.GENERAL),
      channel: z.nativeEnum(NotificationChannel).default(NotificationChannel.IN_APP),
      title: z.string().min(2),
      message: z.string().min(2),
      clientIds: z.array(z.string().uuid()).optional(),
      filterType: z.string().optional(),
    }).parse(req.body);

    const orgId = req.user!.organizationId;

    // Resolve target clients
    let targetClients: { id: string; name: string; email: string | null; mobile: string | null }[] = [];

    if (clientIds && clientIds.length > 0) {
      targetClients = await prisma.client.findMany({
        where: { id: { in: clientIds }, organizationId: orgId },
        select: { id: true, name: true, email: true, mobile: true },
      });
    } else {
      targetClients = await prisma.client.findMany({
        where: { organizationId: orgId, status: 'ACTIVE' },
        select: { id: true, name: true, email: true, mobile: true },
        take: 50,
      });
    }

    const createdNotifications = await Promise.all(
      targetClients.map(c =>
        prisma.notification.create({
          data: {
            organizationId: orgId,
            clientId: c.id,
            title: title.replace('{{client_name}}', c.name),
            message: message.replace('{{client_name}}', c.name),
            type: category,
            channel,
            status: NotificationStatus.SENT,
            sentAt: new Date(),
            deliveryResponse: `SIMULATED_DELIVERY: Persisted in PostgreSQL. External ${channel} provider gateway not configured.`,
          },
        })
      )
    );

    res.json({
      success: true,
      message: `Notification logged in database for ${createdNotifications.length} recipients (Simulated mode: external ${channel} carrier account not connected)`,
      count: createdNotifications.length,
      isSimulated: true,
      category,
      channel,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
