import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { authenticateToken, requireNonClient } from '../middleware/auth.js';
import { AttendanceStatus, AttendanceEventType, RoleType } from '@prisma/client';

const router = Router();

// GET /api/attendance/daily - list attendance
// If EMPLOYEE: returns only current user's record
// If CLIENT: forbidden
// If MANAGER / ADMIN / OWNER / TAX_PRO: returns full team
router.get('/daily', authenticateToken, requireNonClient, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const { date } = req.query;

    const targetDate = date ? new Date(date as string) : new Date();
    const startOfDay = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 0, 0, 0));
    const endOfDay = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));

    // Get active users (filtered to self if EMPLOYEE)
    const userWhere: any = {
      organizationId: orgId,
      isActive: true,
      role: { not: RoleType.CLIENT },
    };

    if (req.user!.role === RoleType.EMPLOYEE) {
      userWhere.id = req.user!.id;
    }

    const users = await prisma.user.findMany({
      where: userWhere,
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

    const records = await prisma.attendanceRecord.findMany({
      where: {
        organizationId: orgId,
        date: { gte: startOfDay, lte: endOfDay },
        userId: req.user!.role === RoleType.EMPLOYEE ? req.user!.id : undefined,
      },
      include: {
        events: { orderBy: { timestamp: 'asc' } },
      },
    });

    const recordMap = new Map(records.map(r => [r.userId, r]));

    const result = users.map(u => {
      const rec = recordMap.get(u.id);
      return {
        user: u,
        record: rec || null,
        status: rec ? rec.status : 'NOT_MARKED',
        checkInTime: rec?.checkInTime || null,
        checkOutTime: rec?.checkOutTime || null,
        totalWorkingMinutes: rec?.totalWorkingMinutes || 0,
        formattedWorkingTime: rec
          ? `${Math.floor(rec.totalWorkingMinutes / 60)}h ${rec.totalWorkingMinutes % 60}m`
          : '0h 0m',
        isCheckedIn: Boolean(rec && rec.checkInTime && !rec.checkOutTime),
      };
    });

    res.json({
      success: true,
      date: targetDate.toISOString().split('T')[0],
      dayOfWeek: targetDate.toLocaleDateString('en-US', { weekday: 'long' }),
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/check-in - current staff checks in
router.post('/check-in', authenticateToken, requireNonClient, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

    let record = await prisma.attendanceRecord.findFirst({
      where: {
        organizationId: orgId,
        userId: userId,
        date: today,
      },
    });

    if (record && record.checkInTime) {
      res.status(400).json({ success: false, message: 'You have already checked in today' });
      return;
    }

    if (!record) {
      record = await prisma.attendanceRecord.create({
        data: {
          organizationId: orgId,
          userId: userId,
          date: today,
          checkInTime: now,
          status: AttendanceStatus.PRESENT,
          totalWorkingMinutes: 0,
        },
      });
    } else {
      record = await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
          checkInTime: now,
          status: AttendanceStatus.PRESENT,
        },
      });
    }

    await prisma.attendanceEvent.create({
      data: {
        attendanceRecordId: record.id,
        eventType: AttendanceEventType.CHECK_IN,
        timestamp: now,
      },
    });

    prisma.notification.create({
      data: {
        organizationId: orgId,
        userId: userId,
        title: 'Attendance Check-In Recorded',
        message: `Punched in successfully at ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`,
        type: 'GENERAL',
        channel: 'IN_APP',
        status: 'SENT',
        sentAt: now,
      },
    }).catch(() => {});

    res.json({ success: true, message: 'Checked in successfully', record });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/check-out - current staff checks out
router.post('/check-out', authenticateToken, requireNonClient, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

    const record = await prisma.attendanceRecord.findFirst({
      where: {
        organizationId: orgId,
        userId: userId,
        date: today,
      },
    });

    if (!record || !record.checkInTime) {
      res.status(400).json({ success: false, message: 'No active check-in found for today' });
      return;
    }

    const checkInMs = new Date(record.checkInTime).getTime();
    const diffMins = Math.max(0, Math.round((now.getTime() - checkInMs) / (1000 * 60)));

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOutTime: now,
        totalWorkingMinutes: diffMins,
      },
    });

    await prisma.attendanceEvent.create({
      data: {
        attendanceRecordId: record.id,
        eventType: AttendanceEventType.CHECK_OUT,
        timestamp: now,
      },
    });

    const workedDur = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
    prisma.notification.create({
      data: {
        organizationId: orgId,
        userId: userId,
        title: 'Attendance Check-Out Recorded',
        message: `Punched out at ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. Total worked: ${workedDur}.`,
        type: 'GENERAL',
        channel: 'IN_APP',
        status: 'SENT',
        sentAt: now,
      },
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Checked out successfully',
      workedDuration: workedDur,
      record: updated,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
