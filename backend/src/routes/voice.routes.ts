import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import multer from 'multer';
import prisma from '../prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { Priority, TaskStatus, RoleType, InOutCategory, NotificationChannel, NotificationCategory } from '@prisma/client';
import {
  isGreetingPrompt,
  isExplanationPrompt,
  getGreetingResponse,
  getConversationalAnswer,
  invalidateKnowledgeCache,
} from '../services/ai.service.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'caflow_super_secret_jwt_key_2026_finance_ops';

// Schema for voice processing
const processSchema = z.object({
  transcript: z.string().min(1, 'Transcript is required'),
  language: z.string().default('en-IN'),
  context: z.record(z.any()).optional(),
  history: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
      })
    )
    .optional(),
});

// Schema for confirming a pending action
const confirmSchema = z.object({
  confirmationToken: z.string().min(10, 'Valid confirmation token is required'),
  action: z.enum(['CONFIRM', 'CANCEL']),
});

// In-memory set of executed confirmation nonces to prevent replay attacks
const usedConfirmationNonces = new Set<string>();

// Helper to generate a tamper-proof confirmation token
function generateConfirmationToken(payload: any): string {
  const data = JSON.stringify({
    ...payload,
    exp: Date.now() + 5 * 60 * 1000, // 5 minute validity
    nonce: crypto.randomBytes(8).toString('hex'),
  });
  const hmac = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex');
  return Buffer.from(data).toString('base64url') + '.' + hmac;
}

// Helper to verify and decode confirmation token
function verifyConfirmationToken(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Malformed confirmation token');
  const [b64Data, signature] = parts;
  const data = Buffer.from(b64Data, 'base64url').toString('utf8');
  const expectedHmac = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex');
  if (signature !== expectedHmac) {
    throw new Error('Invalid token signature or payload altered');
  }
  const payload = JSON.parse(data);
  if (payload.exp < Date.now()) {
    throw new Error('Confirmation token has expired. Please repeat your command.');
  }
  return payload;
}

// Helper to convert integer to English ordinal string (e.g. 1 -> '1st', 2 -> '2nd', 27 -> '27th')
function getOrdinalString(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// =========================================================================
// INTENT PARSER & NATURAL LANGUAGE COMMAND PROCESSOR
// =========================================================================

interface ParsedCommand {
  intent: string;
  category: 'READ' | 'WRITE' | 'NAVIGATION' | 'HELP' | 'CLARIFICATION';
  summary: string;
  speechText: string;
  requiresConfirmation: boolean;
  confirmationToken?: string;
  actionDetails?: any;
  data?: any;
  clarificationOptions?: string[];
  suggestedRoute?: string;
  language?: string;
}

// =========================================================================
// MULTI-LINGUAL DATE RESOLUTION & BUSINESS TIMEZONE HANDLING
// =========================================================================

interface ResolvedDateInfo {
  targetDate: Date;
  dateString: string; // YYYY-MM-DD
  startOfDay: Date;
  endOfDay: Date;
  displayEn: string;
  displayTe: string;
  isExplicit: boolean;
  isToday: boolean;
  isYesterday: boolean;
  isTomorrow: boolean;
}

function resolveDateFromTranscript(text: string, context?: any): ResolvedDateInfo {
  const lower = text.toLowerCase().trim();
  const now = new Date();

  const createDateBounds = (
    year: number,
    monthIndex: number,
    day: number,
    labelEn?: string,
    labelTe?: string,
    isExplicit = true
  ): ResolvedDateInfo => {
    const targetDate = new Date(year, monthIndex, day);
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const dateString = `${yyyy}-${mm}-${dd}`;

    const startOfDay = new Date(Date.UTC(yyyy, targetDate.getMonth(), targetDate.getDate(), 0, 0, 0));
    const endOfDay = new Date(Date.UTC(yyyy, targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999));

    const displayEn =
      labelEn || targetDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const teluguMonths = [
      'జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్',
      'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'
    ];
    const displayTe = labelTe || `${targetDate.getDate()} ${teluguMonths[targetDate.getMonth()]} ${yyyy}`;

    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const yestDate = new Date(now.getTime() - 86400000);
    const yestStr = `${yestDate.getFullYear()}-${String(yestDate.getMonth() + 1).padStart(2, '0')}-${String(yestDate.getDate()).padStart(2, '0')}`;
    const tmrwDate = new Date(now.getTime() + 86400000);
    const tmrwStr = `${tmrwDate.getFullYear()}-${String(tmrwDate.getMonth() + 1).padStart(2, '0')}-${String(tmrwDate.getDate()).padStart(2, '0')}`;

    return {
      targetDate,
      dateString,
      startOfDay,
      endOfDay,
      displayEn,
      displayTe,
      isExplicit,
      isToday: dateString === todayStr,
      isYesterday: dateString === yestStr,
      isTomorrow: dateString === tmrwStr,
    };
  };

  // 1. Explicit ISO format (YYYY-MM-DD)
  const isoMatch = lower.match(/\b(20\d\d)[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return createDateBounds(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
  }

  // 2. Explicit DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = lower.match(/\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d\d)\b/);
  if (dmyMatch) {
    return createDateBounds(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
  }

  // 3. Month dictionary (English, Telugu, and Hindi)
  const monthNames: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
    // Telugu month names
    'జనవరి': 0, 'ఫిబ్రవరి': 1, 'మార్చి': 2, 'ఏప్రిల్': 3, 'మే': 4, 'జూన్': 5,
    'జూలై': 6, 'ఆగస్టు': 7, 'సెప్టెంబర్': 8, 'అక్టోబర్': 9, 'నవంబర్': 10, 'డిసెంబర్': 11,
    // Hindi month names
    'जनवरी': 0, 'फ़रवरी': 1, 'फरवरी': 1, 'मार्च': 2, 'अप्रैल': 3, 'मई': 4, 'जून': 5,
    'जुलाई': 6, 'अगस्त': 7, 'सितंबर': 8, 'अक्टूबर': 9, 'नवंबर': 10, 'दिसंबर': 11,
  };

  // e.g. "14th October", "14 October", "14 oct", "14 అక్టోబర్", "14 अक्टूबर"
  const dayMonthMatch = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z\u0C00-\u0C7F\u0900-\u097F]+)/i);
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1], 10);
    const mStr = dayMonthMatch[2].toLowerCase();
    const month = monthNames[mStr];
    if (month !== undefined && day >= 1 && day <= 31) {
      return createDateBounds(now.getFullYear(), month, day);
    }
  }

  // e.g. "October 14", "Oct 14th", "అక్టోబర్ 14", "अक्टूबर 14"
  const monthDayMatch = text.match(/([a-zA-Z\u0C00-\u0C7F\u0900-\u097F]+)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
  if (monthDayMatch) {
    const mStr = monthDayMatch[1].toLowerCase();
    const day = parseInt(monthDayMatch[2], 10);
    const month = monthNames[mStr];
    if (month !== undefined && day >= 1 && day <= 31) {
      return createDateBounds(now.getFullYear(), month, day);
    }
  }

  // 4. Yesterday / నిన్న / ninna / beeta kal / kal / कल
  if (
    lower.includes('yesterday') ||
    lower.includes('ninna') ||
    lower.includes('beeta kal') ||
    (/\bkal\b/.test(lower) && !lower.includes('aane wala')) ||
    text.includes('నిన్న') ||
    text.includes('कल')
  ) {
    const yDate = new Date(now.getTime() - 86400000);
    const res = createDateBounds(yDate.getFullYear(), yDate.getMonth(), yDate.getDate(), 'Yesterday', 'నిన్న', true);
    res.isYesterday = true;
    return res;
  }

  // 5. Tomorrow / రేపు / repu / aane wala kal
  if (
    lower.includes('tomorrow') ||
    lower.includes('repu') ||
    lower.includes('aane wala kal') ||
    text.includes('రేపు')
  ) {
    const tDate = new Date(now.getTime() + 86400000);
    const res = createDateBounds(tDate.getFullYear(), tDate.getMonth(), tDate.getDate(), 'Tomorrow', 'రేపు', true);
    res.isTomorrow = true;
    return res;
  }

  // 6. Today / ఈరోజు / eroju / aaj / आज
  if (
    lower.includes('today') ||
    lower.includes('eroju') ||
    lower.includes('e roju') ||
    lower.includes('aaj') ||
    text.includes('ఈరోజు') ||
    text.includes('ఈ రోజు') ||
    text.includes('आज')
  ) {
    const res = createDateBounds(now.getFullYear(), now.getMonth(), now.getDate(), 'Today', 'ఈరోజు', false);
    res.isToday = true;
    return res;
  }

  // 7. Context date if supplied from active page
  if (context?.currentDate && /^\d{4}-\d{2}-\d{2}$/.test(context.currentDate)) {
    const [y, m, d] = context.currentDate.split('-').map(Number);
    return createDateBounds(y, m - 1, d, undefined, undefined, false);
  }

  const defaultRes = createDateBounds(now.getFullYear(), now.getMonth(), now.getDate(), 'Today', 'ఈరోజు', false);
  defaultRes.isToday = true;
  return defaultRes;
}

// =========================================================================
// INTENT ENGINE
// =========================================================================

async function parseAndExecuteVoiceCommand(
  rawTranscript: string,
  user: any,
  language: string = 'en-IN',
  context?: any,
  history?: Array<{ role: string; content: string }>
): Promise<ParsedCommand> {
  const transcript = rawTranscript.trim();
  const lower = transcript.toLowerCase();
  const orgId = user.organizationId;
  const userId = user.id;

  // Language detection: explicit language code or native Telugu script/code-switching keywords
  const isTelugu =
    language === 'te-IN' ||
    /[\u0C00-\u0C7F]/.test(transcript) ||
    lower.includes('chupinchu') ||
    lower.includes('cheyi') ||
    lower.includes('cheyyi') ||
    lower.includes('e roju') ||
    lower.includes('repu') ||
    lower.includes('panulu') ||
    lower.includes('baki') ||
    lower.includes('haazri') ||
    lower.includes('telugu');

  const resolvedLang = isTelugu ? 'te-IN' : language;

  // A. GREETINGS & SOCIAL OPENERS (e.g. "Hello", "Hi", "Good morning", "Namaste")
  if (isGreetingPrompt(transcript)) {
    const greeting = getGreetingResponse(resolvedLang, {
      fullName: user.fullName,
      role: user.role,
      organizationName: user.organization?.name,
    });
    return {
      intent: 'GREETING',
      category: 'HELP',
      summary: greeting.summary,
      speechText: greeting.speechText,
      requiresConfirmation: false,
      clarificationOptions: isTelugu
        ? [
            'ఈ రోజు పెండింగ్ పనులను చూపించు',
            'చెల్లించని ఇన్‌వాయిస్‌లు చూపించు',
            'నా ఈ రోజు హాజరును చెక్ చేయి',
            'క్లయింట్ల జాబితా చూపించు',
          ]
        : [
            "Show today's pending tasks",
            'Find unpaid invoices',
            "Check today's attendance",
            'Show my clients',
            'Open Finance',
          ],
    };
  }

  // B. GENERAL EXPLANATIONS & CA EDUCATIONAL QUESTIONS (e.g. "What is an invoice?", "Explain GST filing")
  if (isExplanationPrompt(transcript)) {
    const answer = await getConversationalAnswer(
      transcript,
      (history || []) as any,
      resolvedLang,
      {
        fullName: user.fullName,
        role: user.role,
        organizationId: orgId,
        organizationName: user.organization?.name,
      }
    );
    return {
      intent: 'CONVERSATION',
      category: 'HELP',
      summary: answer.summary,
      speechText: answer.speechText,
      requiresConfirmation: false,
      clarificationOptions: isTelugu
        ? ['ఈ రోజు పెండింగ్ పనులను చూపించు', 'చెల్లించని ఇన్‌వాయిస్‌లు చూపించు', 'ఫైనాన్స్ ఓపెన్ చేయి']
        : ["Show today's pending tasks", 'Find unpaid invoices', 'Show my clients', 'Open Finance'],
    };
  }

  // C. CONTEXTUAL FOLLOW-UP ROUTING (e.g. "What about tomorrow?", "And for tomorrow?", "Repu chupinchu")
  const isTomorrowFollowup =
    lower.includes('tomorrow') ||
    lower.includes('repu') ||
    lower.includes('aane wala kal') ||
    transcript.includes('రేపు');

  const isFollowupQuery =
    lower.startsWith('what about') ||
    lower.startsWith('and for') ||
    lower.startsWith('and ') ||
    lower === 'tomorrow' ||
    lower === 'repu' ||
    lower === 'kal' ||
    lower.includes('what about tomorrow') ||
    lower.includes('show tomorrow') ||
    transcript.includes('రేపు మరి') ||
    transcript.includes('రేపు ఏమిటి');

  let forcedContextIntent: string | null = null;
  if (isFollowupQuery && history && history.length > 0) {
    const recentContext = history.slice(-3).map(h => h.content.toLowerCase()).join(' ');
    if (
      recentContext.includes('task') ||
      recentContext.includes('టాస్క్') ||
      recentContext.includes('pending') ||
      recentContext.includes('పనుల')
    ) {
      forcedContextIntent = 'SHOW_TASKS';
    } else if (
      recentContext.includes('attendance') ||
      recentContext.includes('హాజరు') ||
      recentContext.includes('present') ||
      recentContext.includes('check-in')
    ) {
      forcedContextIntent = 'ATTENDANCE';
    }
  }

  // 1. NAVIGATION INTENTS
  // Ensure compound queries like "Open Finance and show unpaid invoices" or creation requests are not swallowed
  const isCompoundNavAndQuery =
    (lower.includes('invoice') || lower.includes('bill') || lower.includes('unpaid')) &&
    (lower.includes('show') || lower.includes('find') || lower.includes('list') || lower.includes('display') || lower.includes('chupinchu'));

  const isNavIntent =
    !forcedContextIntent &&
    !isCompoundNavAndQuery &&
    !lower.includes('add ') &&
    !lower.includes('create ') &&
    !lower.includes('banao') &&
    !lower.includes('add cheyyi') &&
    !lower.includes('add cheyyali') &&
    (
      lower.startsWith('open ') ||
      lower.startsWith('go to ') ||
      lower.startsWith('go back to ') ||
      lower.startsWith('take me to ') ||
      lower.startsWith('navigate to ') ||
      lower.includes('open page') ||
      lower.includes('page open') ||
      lower.endsWith('open cheyyi') ||
      lower.endsWith('open cheyi') ||
      lower.includes('open cheyyi') ||
      lower.includes('open cheyi') ||
      lower.endsWith('open karo') ||
      transcript.includes('పేజీ ఓపెన్') ||
      transcript.includes('ఓపెన్ చేయి') ||
      transcript.includes('వెళ్ళు') ||
      transcript.includes('తీయి') ||
      lower.includes('page open cheyi') ||
      lower.includes('page dikhao') ||
      lower === 'dashboard' ||
      lower === 'finance' ||
      lower === 'attendance' ||
      lower === 'reports' ||
      lower === 'settings' ||
      lower === 'clients' ||
      lower === 'renewals' ||
      lower === 'todo' ||
      lower === 'to-do' ||
      lower === 'to do'
    );

  if (isNavIntent) {
    let route = '/dashboard';
    let target = 'Dashboard';
    let teluguTarget = 'డ్యాష్‌బోర్డ్';

    if (
      lower.includes('dashboard') ||
      transcript.includes('డ్యాష్‌బోర్డ్') ||
      lower.includes('home')
    ) {
      route = '/dashboard';
      target = 'Dashboard';
      teluguTarget = 'డ్యాష్‌బోర్డ్';
    } else if (
      lower.includes('todo') ||
      lower.includes('to-do') ||
      lower.includes('to do') ||
      transcript.includes('టు-డూ') ||
      transcript.includes('గుర్తు')
    ) {
      route = '/todo';
      target = 'To-Do list';
      teluguTarget = 'టు-డూ లిస్ట్';
    } else if (
      lower.includes('timesheet') ||
      lower.includes('time sheet') ||
      lower.includes('hours') ||
      transcript.includes('టైమ్‌షీట్')
    ) {
      route = '/timesheet';
      target = 'Timesheet';
      teluguTarget = 'టైమ్‌షీట్';
    } else if (
      lower.includes('invoice') ||
      lower.includes('bill') ||
      lower.includes('finance') ||
      lower.includes('receipt') ||
      transcript.includes('ఫైనాన్స్') ||
      transcript.includes('ఇన్‌వాయిస్') ||
      transcript.includes('ఇన్వాయిస్') ||
      transcript.includes('బిల్లు')
    ) {
      route = '/finance';
      target = 'Finance';
      teluguTarget = 'ఫైనాన్స్';
    } else if (
      lower.includes('task') ||
      lower.includes('panulu') ||
      lower.includes('kaam') ||
      transcript.includes('టాస్క్') ||
      transcript.includes('పనుల') ||
      transcript.includes('పని')
    ) {
      route = '/tasks';
      target = 'Tasks';
      teluguTarget = 'టాస్క్‌లు';
    } else if (
      lower.includes('client') ||
      lower.includes('customer') ||
      transcript.includes('క్లయింట్') ||
      transcript.includes('కస్టమర్')
    ) {
      route = '/clients';
      target = 'Clients';
      teluguTarget = 'క్లయింట్లు';
    } else if (
      lower.includes('attendance') ||
      lower.includes('haazri') ||
      transcript.includes('హాజరు')
    ) {
      route = '/attendance';
      target = 'Attendance';
      teluguTarget = 'హాజరు';
    } else if (
      lower.includes('document') ||
      lower.includes('vault') ||
      lower.includes('kagit') ||
      transcript.includes('డాక్యుమెంట్') ||
      transcript.includes('వాల్ట్')
    ) {
      route = '/documents';
      target = 'Documents';
      teluguTarget = 'డాక్యుమెంట్స్';
    } else if (
      lower.includes('renewal') ||
      lower.includes('license') ||
      lower.includes('expiry') ||
      transcript.includes('రెన్యూవల్') ||
      transcript.includes('లైసెన్స్')
    ) {
      route = '/renewals';
      target = 'Renewals';
      teluguTarget = 'రెన్యూవల్స్';
    } else if (
      lower.includes('report') ||
      lower.includes('analytics') ||
      lower.includes('kpi') ||
      transcript.includes('రిపోర్ట్') ||
      transcript.includes('అనలిటిక్స్')
    ) {
      route = '/reports';
      target = 'Reports & Analytics';
      teluguTarget = 'రిపోర్టులు & అనలిటిక్స్';
    } else if (
      lower.includes('setting') ||
      lower.includes('profile') ||
      lower.includes('team') ||
      transcript.includes('సెట్టింగ్')
    ) {
      route = '/settings';
      target = 'Settings';
      teluguTarget = 'సెట్టింగ్స్';
    } else if (
      lower.includes('portal') ||
      lower.includes('client view') ||
      transcript.includes('పోర్టల్')
    ) {
      route = '/portal';
      target = 'Client Portal';
      teluguTarget = 'క్లయింట్ పోర్టల్';
    } else if (
      lower.includes('service') ||
      lower.includes('retainer') ||
      transcript.includes('సర్వీస్')
    ) {
      route = '/services';
      target = 'Services & Retainers';
      teluguTarget = 'సర్వీసెస్ & రిటైనర్లు';
    } else if (
      lower.includes('notification') ||
      lower.includes('alert') ||
      lower.includes('message') ||
      transcript.includes('నోటిఫికేషన్')
    ) {
      route = '/notifications';
      target = 'Notifications';
      teluguTarget = 'నోటిఫికేషన్లు';
    }

    // Role-based navigation guard
    if (user.role === RoleType.CLIENT) {
      const allowedClientRoutes = ['/portal', '/tasks', '/documents'];
      if (!allowedClientRoutes.includes(route)) {
        return {
          intent: 'NAVIGATE_DENIED',
          category: 'HELP',
          summary: isTelugu
            ? `క్షమించండి, మీ ఖాతాకు ${teluguTarget} పేజీని చూసే అనుమతి లేదు.`
            : `You do not have permission to view ${target}. As a client user, you have access to the Client Portal, Tasks, and Documents.`,
          speechText: isTelugu
            ? `మీ ఖాతాకు ఈ పేజీని చూసే అనుమతి లేదు.`
            : `You do not have permission to access ${target}.`,
          requiresConfirmation: false,
        };
      }
    } else if (user.role === RoleType.EMPLOYEE) {
      const forbiddenEmployeeRoutes = ['/finance', '/reports', '/settings', '/clients'];
      if (forbiddenEmployeeRoutes.includes(route)) {
        return {
          intent: 'NAVIGATE_DENIED',
          category: 'HELP',
          summary: isTelugu
            ? `క్షమించండి, మీ రోల్‌కు ${teluguTarget} పేజీని చూసే అనుమతి లేదు.`
            : `You do not have permission to access ${target}. Staff administrative privileges are required.`,
          speechText: isTelugu
            ? `మీ రోల్‌కు ఈ పేజీని చూసే అనుమతి లేదు.`
            : `You do not have permission to access ${target}.`,
          requiresConfirmation: false,
        };
      }
    }

    if (route === '/dashboard') {
      const now = new Date();
      const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

      const [dueTodayCount, pendingTasksCount, activeClientsCount, invAgg, userTodosCount] = await Promise.all([
        prisma.task.count({
          where: { organizationId: orgId, status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueDate: { gte: startOfToday, lte: endOfToday } },
        }),
        prisma.task.count({
          where: { organizationId: orgId, status: TaskStatus.PENDING },
        }),
        prisma.client.count({
          where: { organizationId: orgId, status: 'ACTIVE' },
        }),
        prisma.invoice.aggregate({
          where: { organizationId: orgId, paymentStatus: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] } },
          _sum: { balanceDue: true },
        }),
        prisma.todo.count({
          where: { organizationId: orgId, userId, status: 'PENDING' },
        }),
      ]);

      const balanceDue = invAgg._sum.balanceDue || 0;

      const summaryText = isTelugu
        ? `డ్యాష్‌బోర్డ్ ఓపెన్ చేశాను. ఈ రోజు గడువు ఉన్న టాస్క్‌లు: ${dueTodayCount}, మొత్తం పెండింగ్ టాస్క్‌లు: ${pendingTasksCount}, యాక్టివ్ క్లయింట్లు: ${activeClientsCount}, బకాయిలు: ₹${balanceDue.toLocaleString('en-IN')}.`
        : `Opened Dashboard. You have ${pendingTasksCount} pending tasks (${dueTodayCount} due today), ${activeClientsCount} active clients, and ₹${balanceDue.toLocaleString('en-IN')} in outstanding receivables.`;

      const speechText = isTelugu
        ? `డ్యాష్‌బోర్డ్ ఓపెన్ చేశాను. మీ ప్రాక్టీస్ వివరాలు సిద్ధంగా ఉన్నాయి.`
        : `Opened Dashboard. You have ${pendingTasksCount} pending tasks and ${activeClientsCount} active clients.`;

      return {
        intent: 'NAVIGATE',
        category: 'NAVIGATION',
        summary: summaryText,
        speechText,
        requiresConfirmation: false,
        suggestedRoute: '/dashboard',
        data: {
          dueTodayCount,
          pendingTasksCount,
          activeClientsCount,
          balanceDue,
          userTodosCount,
        },
      };
    }

    return {
      intent: 'NAVIGATE',
      category: 'NAVIGATION',
      summary: isTelugu ? `${teluguTarget} పేజీని ఓపెన్ చేశాను.` : `Sure, I've opened ${target} for you.`,
      speechText: isTelugu ? `${teluguTarget} పేజీని ఓపెన్ చేశాను.` : `Sure, I've opened ${target} for you.`,
      requiresConfirmation: false,
      suggestedRoute: route,
    };
  }

  // 2. HELP INTENT
  if (
    lower === 'help' ||
    lower.includes('what can you do') ||
    lower.includes('commands') ||
    lower.includes('ela vadali') ||
    lower.includes('sahayam') ||
    lower.includes('kya kar sakte ho') ||
    transcript.includes('సహాయం') ||
    transcript.includes('హెల్ప్')
  ) {
    return {
      intent: 'HELP',
      category: 'HELP',
      summary: isTelugu
        ? 'నమస్కారం! మీరు తెలుగు లేదా ఇంగ్లీషులో నాతో మాట్లాడవచ్చు. ఉదాహరణలు క్రింద ఉన్నాయి.'
        : 'Here are commands you can ask me to do in English, Telugu, or Hindi.',
      speechText: isTelugu
        ? 'నమస్కారం! మీరు ఈరోజు పెండింగ్ పనులు, చెల్లించని ఇన్‌వాయిస్‌లు, హాజరు, లేదా రెన్యూవల్స్ గురించి నన్ను అడగవచ్చు.'
        : 'You can ask me to show overdue tasks, check attendance, find unpaid invoices, list renewals, create tasks, or navigate pages.',
      requiresConfirmation: false,
      data: {
        examples: isTelugu
          ? [
              'ఈ రోజు పెండింగ్ పనులను చూపించు',
              'చెల్లించని ఇన్‌వాయిస్‌లు చూపించు',
              'నా ఈ రోజు హాజరును చెక్ చేయి',
              'ఈ నెలలో ముగిసే రెన్యూవల్స్ చూపించు',
              'ఫైనాన్స్ సారాంశం చూపించు',
              'సురేష్ గారికి టాస్క్ అసైన్ చేయి',
            ]
          : [
              'Show today\'s pending tasks',
              'Create a GST filing task for Precision Industries',
              'Check my attendance for today',
              'Show unpaid invoices with balances',
              'Renewals expiring this month',
              'Find clients with missing PAN or documents',
              'Add a todo: Review balance sheet tomorrow',
              'Show total billed and collections summary',
            ],
      },
    };
  }

  // 3. ATTENDANCE ACTIONS & STATUS
  const isAttendanceQuery =
    forcedContextIntent === 'ATTENDANCE' ||
    lower.includes('attendance') ||
    lower.includes('check in') ||
    lower.includes('check out') ||
    lower.includes('check-in') ||
    lower.includes('check-out') ||
    lower.includes('punch in') ||
    lower.includes('punch out') ||
    lower.includes('haazri') ||
    lower.includes('hazaru') ||
    lower.includes('present') ||
    lower.includes('absent') ||
    transcript.includes('హాజరు') ||
    transcript.includes('చెక్') ||
    transcript.includes('ప్రెజెంట్') ||
    transcript.includes('ఆబ్సెంట్') ||
    (context?.activePath === '/attendance' && (
      lower.includes('date') ||
      lower.includes('change date') ||
      lower.includes('set date') ||
      lower.includes('show') ||
      lower.includes('records') ||
      lower.includes('chupinchu') ||
      lower.includes('dikhao') ||
      lower.includes('status') ||
      lower.includes('who') ||
      lower.includes('today') ||
      lower.includes('yesterday') ||
      lower.includes('tomorrow') ||
      transcript.includes('తేదీ') ||
      transcript.includes('ఈరోజు') ||
      transcript.includes('నిన్న')
    ));

  if (isAttendanceQuery) {
    // Check-in command
    if (lower.includes('check in') || lower.includes('check-in') || lower.includes('punch in') || lower.includes('login mark')) {
      const token = generateConfirmationToken({
        actionType: 'ATTENDANCE_CHECK_IN',
        userId,
        orgId,
        isTelugu,
      });
      return {
        intent: 'ATTENDANCE_CHECK_IN',
        category: 'WRITE',
        summary: isTelugu
          ? `${user.fullName} గారికి ఈ రోజు హాజరు చెక్-ఇన్ నమోదు చేయమంటారా?`
          : `Mark staff attendance check-in for ${user.fullName}?`,
        speechText: isTelugu
          ? `మీ ఈ రోజు హాజరు చెక్-ఇన్ సమయాన్ని నమోదు చేయమంటారా? దయచేసి నిర్ధారించండి.`
          : `Would you like me to record your check-in timestamp for today? Please say Confirm or click the button.`,
        requiresConfirmation: true,
        confirmationToken: token,
        actionDetails: {
          employee: user.fullName,
          action: isTelugu ? 'నేటి చెక్-ఇన్ నమోదు' : 'Record Today\'s Check-in',
          time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        },
      };
    }

    // Check-out command
    if (lower.includes('check out') || lower.includes('check-out') || lower.includes('punch out')) {
      const token = generateConfirmationToken({
        actionType: 'ATTENDANCE_CHECK_OUT',
        userId,
        orgId,
        isTelugu,
      });
      return {
        intent: 'ATTENDANCE_CHECK_OUT',
        category: 'WRITE',
        summary: isTelugu
          ? `${user.fullName} గారికి ఈ రోజు హాజరు చెక్-అవుట్ నమోదు చేయమంటారా?`
          : `Mark staff attendance check-out for ${user.fullName}?`,
        speechText: isTelugu
          ? `మీ ఈ రోజు హాజరు చెక్-అవుట్ సమయాన్ని నమోదు చేయమంటారా? దయచేసి నిర్ధారించండి.`
          : `Shall I record your attendance check-out for today? Please confirm to proceed.`,
        requiresConfirmation: true,
        confirmationToken: token,
        actionDetails: {
          employee: user.fullName,
          action: isTelugu ? 'నేటి చెక్-అవుట్ నమోదు' : 'Record Today\'s Check-out',
          time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        },
      };
    }

    // Resolve Target Date using multi-lingual date parser
    const resolvedDate = resolveDateFromTranscript(transcript, context);

    // Explicit Date Filter Change command
    const isExplicitDateChange =
      lower.includes('change date') ||
      lower.includes('set date') ||
      lower.includes('date change') ||
      lower.includes('change attendance date') ||
      lower.includes('set attendance date') ||
      transcript.includes('తేదీని మార్చు') ||
      transcript.includes('తేదీ మార్చు');

    if (isExplicitDateChange) {
      return {
        intent: 'ATTENDANCE_SET_DATE',
        category: 'READ',
        summary: isTelugu
          ? `హాజరు తేదీ ఫిల్టర్‌ను ${resolvedDate.displayTe} (${resolvedDate.dateString}) కు మార్చాను.`
          : `Changed attendance date filter to ${resolvedDate.displayEn} (${resolvedDate.dateString}).`,
        speechText: isTelugu
          ? `హాజరు తేదీని ${resolvedDate.displayTe} కు సెట్ చేశాను. రికార్డులు లోడ్ అవుతున్నాయి.`
          : `Updated attendance date to ${resolvedDate.displayEn}. Refreshing records now.`,
        suggestedRoute: '/attendance',
        requiresConfirmation: false,
        data: {
          action: 'SET_DATE_FILTER',
          dateFilter: resolvedDate.dateString,
          selectedDate: resolvedDate.dateString,
          displayDate: resolvedDate.displayEn,
        },
      };
    }

    // View Attendance Status for resolvedDate
    // Role EMPLOYEE: personal attendance
    if (user.role === RoleType.EMPLOYEE) {
      const record = await prisma.attendanceRecord.findFirst({
        where: {
          userId,
          organizationId: orgId,
          date: { gte: resolvedDate.startOfDay, lte: resolvedDate.endOfDay },
        },
        include: { events: { orderBy: { timestamp: 'desc' } } },
      });

      if (!record || !record.checkInTime) {
        return {
          intent: 'SHOW_ATTENDANCE',
          category: 'READ',
          summary: isTelugu
            ? `${resolvedDate.displayTe} కొరకు మీకు ఎటువంటి హాజరు రికార్డు నమోదు కాలేదు.`
            : `No attendance record found for you on ${resolvedDate.displayEn}.`,
          speechText: isTelugu
            ? `మీకు ${resolvedDate.displayTe} కొరకు ఎటువంటి హాజరు నమోదు కాలేదు.`
            : `You have no attendance record marked for ${resolvedDate.displayEn}.`,
          requiresConfirmation: false,
          data: {
            status: 'NO_RECORD',
            date: resolvedDate.dateString,
            selectedDate: resolvedDate.dateString,
            dateFilter: resolvedDate.dateString,
            items: [],
          },
        };
      }

      const checkInFormatted = new Date(record.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const isCheckedOut = Boolean(record.checkOutTime);
      const checkOutFormatted = record.checkOutTime
        ? new Date(record.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : '';

      const speech = isTelugu
        ? isCheckedOut
          ? `${resolvedDate.displayTe} నాడు మీరు ఉదయం ${checkInFormatted} కు చెక్-ఇన్ అయ్యి, సాయంత్రం ${checkOutFormatted} కు చెక్-అవుట్ అయ్యారు. మొత్తం ${record.totalWorkingMinutes || 0} నిమిషాలు పనిచేశారు.`
          : `${resolvedDate.displayTe} నాడు మీరు ఉదయం ${checkInFormatted} నుండి చెక్-ఇన్ లో ఉన్నారు.`
        : isCheckedOut
        ? `On ${resolvedDate.displayEn}, you checked in at ${checkInFormatted} and checked out at ${checkOutFormatted} with ${record.totalWorkingMinutes || 0} minutes worked.`
        : `On ${resolvedDate.displayEn}, you checked in at ${checkInFormatted}. Status is ${record.status}.`;

      return {
        intent: 'SHOW_ATTENDANCE',
        category: 'READ',
        summary: isTelugu
          ? `హాజరు (${resolvedDate.displayTe}): ఉదయం ${checkInFormatted} కు చెక్-ఇన్ (${record.status}). పని సమయం: ${record.totalWorkingMinutes || 0} నిమిషాలు.`
          : `Attendance (${resolvedDate.displayEn}): Checked in at ${checkInFormatted} (${record.status}). Total minutes: ${record.totalWorkingMinutes || 0}.`,
        speechText: speech,
        requiresConfirmation: false,
        data: {
          ...record,
          date: resolvedDate.dateString,
          selectedDate: resolvedDate.dateString,
          dateFilter: resolvedDate.dateString,
        },
      };
    }

    // Role FIRM_OWNER, MANAGER, ACCOUNTANT, TAX_PROFESSIONAL: Team attendance
    const activeStaff = await prisma.user.findMany({
      where: { organizationId: orgId, isActive: true, role: { not: RoleType.CLIENT } },
      select: { id: true, fullName: true, role: true, designation: true },
      orderBy: { fullName: 'asc' },
    });

    const records = await prisma.attendanceRecord.findMany({
      where: {
        organizationId: orgId,
        date: { gte: resolvedDate.startOfDay, lte: resolvedDate.endOfDay },
      },
      include: { user: { select: { fullName: true, role: true } } },
    });

    if (records.length === 0) {
      return {
        intent: 'SHOW_ATTENDANCE',
        category: 'READ',
        summary: isTelugu
          ? `${resolvedDate.displayTe} కొరకు మీ సంస్థలో ఎటువంటి హాజరు రికార్డులు లభించలేదు.`
          : `No attendance records found for ${resolvedDate.displayEn} in the database.`,
        speechText: isTelugu
          ? `${resolvedDate.displayTe} కొరకు మీ సంస్థలో ఎటువంటి హాజరు నమోదు కాలేదు.`
          : `No attendance records were found for ${resolvedDate.displayEn}.`,
        requiresConfirmation: false,
        data: {
          totalStaff: activeStaff.length,
          presentCount: 0,
          items: [],
          date: resolvedDate.dateString,
          selectedDate: resolvedDate.dateString,
          dateFilter: resolvedDate.dateString,
        },
      };
    }

    const presentRecords = records.filter(r => r.checkInTime);
    const presentCount = presentRecords.length;
    const topPresentNames = presentRecords.slice(0, 3).map(r => r.user?.fullName).filter(Boolean).join(', ');

    const summaryText = isTelugu
      ? `${resolvedDate.displayTe} హాజరు: మొత్తం ${activeStaff.length} మంది సిబ్బందిలో ${presentCount} మంది హాజరయ్యారు (${topPresentNames}).`
      : `Attendance for ${resolvedDate.displayEn}: ${presentCount} of ${activeStaff.length} staff marked present. Highlights: ${topPresentNames}.`;

    const speechText = isTelugu
      ? `${resolvedDate.displayTe} నాడు మొత్తం ${activeStaff.length} మంది సిబ్బందిలో ${presentCount} మంది హాజరయ్యారు.`
      : `On ${resolvedDate.displayEn}, ${presentCount} out of ${activeStaff.length} staff members were present.`;

    return {
      intent: 'SHOW_ATTENDANCE',
      category: 'READ',
      summary: summaryText,
      speechText,
      requiresConfirmation: false,
      data: {
        totalStaff: activeStaff.length,
        presentCount,
        date: resolvedDate.dateString,
        selectedDate: resolvedDate.dateString,
        dateFilter: resolvedDate.dateString,
        items: presentRecords.map(r => ({
          id: r.id,
          title: `${r.user?.fullName} (${r.status})`,
          name: r.user?.fullName,
          status: r.status,
          checkInTime: r.checkInTime,
          checkOutTime: r.checkOutTime,
        })),
      },
    };
  }

  // 4. FINANCIAL SUMMARY / INVOICES / COLLECTIONS
  const isInvoiceQuery =
    !isAttendanceQuery &&
    (
      lower.includes('invoice') ||
      lower.includes('invoices') ||
      lower.includes('unpaid') ||
      lower.includes('paid invoice') ||
      lower.includes('paid invoices') ||
      lower.includes('balance') ||
      lower.includes('billing') ||
      lower.includes('collection') ||
      lower.includes('outstanding') ||
      lower.includes('bill') ||
      lower.includes('bills') ||
      lower.includes('finance') ||
      lower.includes('financial') ||
      lower.includes('baki') ||
      lower.includes('baaki') ||
      lower.includes('dabbulu') ||
      transcript.includes('ఫైనాన్స్') ||
      transcript.includes('ఇన్‌వాయిస్') ||
      transcript.includes('ఇన్వాయిస్') ||
      transcript.includes('చెల్లించిన') ||
      transcript.includes('చెల్లించని') ||
      transcript.includes('బకాయి') ||
      transcript.includes('బిల్లు') ||
      transcript.includes('డబ్బులు') ||
      transcript.includes('వసూళ్లు')
    );

  if (isInvoiceQuery) {
    // RBAC: EMPLOYEE role cannot access firm financial figures or invoices
    if (user.role === RoleType.EMPLOYEE) {
      return {
        intent: 'SHOW_INVOICES',
        category: 'HELP',
        summary: isTelugu
          ? 'అనుమతి నిరాకరించబడింది: ఉద్యోగి పాత్రకు ఫైనాన్స్ మరియు ఇన్వాయిస్ వివరాలను చూసే అధికారం లేదు. ఇది అకౌంటెంట్ లేదా అడ్మిన్‌కు మాత్రమే అందుబాటులో ఉంటుంది.'
          : 'Access restricted: You do not have permission to view firm invoices or financial figures. This requires Accountant or Administrator privileges.',
        speechText: isTelugu
          ? 'అనుమతి నిరాకరించబడింది. ఉద్యోగి పాత్రకు ఫైనాన్స్ లేదా ఇన్వాయిస్ వివరాలు చూసే అధికారం లేదు.'
          : 'Access restricted: Employee roles do not have permission to view firm financial summaries or invoices.',
        requiresConfirmation: false,
        data: { error: 'INSUFFICIENT_PERMISSIONS' },
      };
    }

    // CLIENT role profile check
    if (user.role === RoleType.CLIENT && !user.clientId) {
      return {
        intent: 'SHOW_INVOICES',
        category: 'READ',
        summary: isTelugu ? 'మీ ఖాతాకు ఎటువంటి క్లయింట్ ప్రొఫైల్ అనుసంధానించబడలేదు.' : 'No linked client account found for your profile.',
        speechText: isTelugu ? 'మీ క్లయింట్ ఖాతా వివరాలు కనిపించలేదు.' : 'No linked client organization was found.',
        requiresConfirmation: false,
        data: { items: [], totalCount: 0, displayedCount: 0, hasMore: false, targetStatus: 'UNPAID' },
      };
    }

    // ADMIN, MANAGER, ACCOUNTANT - Firm Wide Aggregate Financial Summary
    if (
      lower.includes('summary') ||
      lower.includes('overall') ||
      lower.includes('report') ||
      lower.includes('saramsam') ||
      transcript.includes('సారాంశం') ||
      (lower.includes('total') && (lower.includes('billing') || lower.includes('collection') || lower.includes('revenue')))
    ) {
      const invAgg = await prisma.invoice.aggregate({
        where: {
          organizationId: orgId,
          ...(user.role === RoleType.CLIENT ? { clientId: user.clientId } : {}),
        },
        _sum: { totalAmount: true, amountPaid: true, balanceDue: true },
        _count: { id: true },
      });

      const totalBilled = invAgg._sum.totalAmount || 0;
      const totalCollected = invAgg._sum.amountPaid || 0;
      const totalOutstanding = invAgg._sum.balanceDue || 0;

      return {
        intent: 'SHOW_FINANCIAL_SUMMARY',
        category: 'READ',
        summary: isTelugu
          ? `ఫైనాన్స్ సారాంశం: మొత్తం బిల్లింగ్ ₹${totalBilled.toLocaleString('en-IN')}, వసూళ్లు ₹${totalCollected.toLocaleString('en-IN')}, బకాయి ₹${totalOutstanding.toLocaleString('en-IN')}.`
          : `Financials: Billed ₹${totalBilled.toLocaleString('en-IN')}, Collected ₹${totalCollected.toLocaleString('en-IN')}, Outstanding ₹${totalOutstanding.toLocaleString('en-IN')}.`,
        speechText: isTelugu
          ? `మొత్తం బిల్లింగ్ ₹${totalBilled.toLocaleString('en-IN')}, వసూళ్లు ₹${totalCollected.toLocaleString('en-IN')}, మరియు బకాయి మొత్తం ₹${totalOutstanding.toLocaleString('en-IN')}.`
          : `Total billed is ₹${totalBilled.toLocaleString('en-IN')}, collections are ₹${totalCollected.toLocaleString('en-IN')}, with an outstanding balance of ₹${totalOutstanding.toLocaleString('en-IN')}.`,
        requiresConfirmation: false,
        data: { totalBilled, totalCollected, totalOutstanding, count: invAgg._count.id },
      };
    }

    // Classify the requested invoice status
    const isExplicitPaid =
      (lower.includes('paid') &&
        !lower.includes('unpaid') &&
        !lower.includes('not paid') &&
        !lower.includes('partially') &&
        !lower.includes('partial') &&
        !lower.includes('part-paid')) ||
      (lower.includes('cleared') && !lower.includes('uncleared')) ||
      (lower.includes('settled') && !lower.includes('unsettled')) ||
      (transcript.includes('చెల్లించిన') && !transcript.includes('చెల్లించని')) ||
      (lower.includes('chellinchina') && !lower.includes('chellinchani')) ||
      (lower.includes('chukti') && !lower.includes('gair chukti'));

    const isExplicitPartiallyPaid =
      lower.includes('partially paid') ||
      lower.includes('partial paid') ||
      lower.includes('part-paid') ||
      lower.includes('partially') ||
      lower.includes('partial') ||
      transcript.includes('పాక్షికంగా చెల్లించిన') ||
      lower.includes('pakshikamga');

    const isExplicitOverdue =
      lower.includes('overdue') ||
      lower.includes('due date passed') ||
      lower.includes('expired') ||
      transcript.includes('గడువు ముగిసిన') ||
      lower.includes('gadavu mugisina');

    const isExplicitUnpaid =
      lower.includes('unpaid') ||
      lower.includes('not paid') ||
      lower.includes('outstanding') ||
      lower.includes('pending payment') ||
      lower.includes('pending invoice') ||
      lower.includes('due invoice') ||
      lower.includes('baki') ||
      lower.includes('baaki') ||
      transcript.includes('చెల్లించని') ||
      transcript.includes('బకాయి') ||
      lower.includes('chellinchani');

    type InvoiceFilterType = 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'UNPAID' | 'ALL';
    let targetStatusType: InvoiceFilterType = 'UNPAID';

    if (isExplicitPaid) {
      targetStatusType = 'PAID';
    } else if (isExplicitPartiallyPaid) {
      targetStatusType = 'PARTIALLY_PAID';
    } else if (isExplicitOverdue) {
      targetStatusType = 'OVERDUE';
    } else if (isExplicitUnpaid) {
      targetStatusType = 'UNPAID';
    } else if (lower.includes('all invoices') || lower.includes('every invoice') || transcript.includes('అన్ని ఇన్‌వాయిస్‌లు')) {
      targetStatusType = 'ALL';
    }

    // Build Prisma query condition strictly matching the requested status
    const invoiceWhere: any = {
      organizationId: orgId,
      ...(user.role === RoleType.CLIENT ? { clientId: user.clientId } : {}),
    };

    if (targetStatusType === 'PAID') {
      invoiceWhere.paymentStatus = 'PAID';
      invoiceWhere.balanceDue = 0;
    } else if (targetStatusType === 'PARTIALLY_PAID') {
      invoiceWhere.paymentStatus = 'PARTIALLY_PAID';
      invoiceWhere.balanceDue = { gt: 0 };
    } else if (targetStatusType === 'OVERDUE') {
      invoiceWhere.OR = [
        { paymentStatus: 'OVERDUE' },
        {
          dueDate: { lt: new Date() },
          paymentStatus: { in: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID'] },
          balanceDue: { gt: 0 },
        },
      ];
    } else if (targetStatusType === 'UNPAID') {
      invoiceWhere.paymentStatus = { in: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] };
      invoiceWhere.balanceDue = { gt: 0 };
    }

    const totalMatchingCount = await prisma.invoice.count({ where: invoiceWhere });

    if (totalMatchingCount === 0) {
      let emptySummary = '';
      let emptySpeech = '';

      if (targetStatusType === 'PAID') {
        emptySummary = isTelugu
          ? 'ఎటువంటి చెల్లించిన ఇన్‌వాయిస్‌లు కనుగొనబడలేదు. ప్రస్తుత ఇన్‌వాయిస్‌లు అన్నీ బకాయి లేదా డ్రాఫ్ట్‌లో ఉన్నాయి.'
          : 'No paid invoices found in your records. All existing invoices are currently unpaid or pending.';
        emptySpeech = isTelugu
          ? 'ఎటువంటి చెల్లించిన ఇన్‌వాయిస్‌లు కనిపించలేదు.'
          : 'No paid invoices were found in your records.';
      } else if (targetStatusType === 'PARTIALLY_PAID') {
        emptySummary = isTelugu
          ? 'ఎటువంటి పాక్షికంగా చెల్లించిన ఇన్‌వాయిస్‌లు కనుగొనబడలేదు.'
          : 'No partially paid invoices found in your records.';
        emptySpeech = isTelugu
          ? 'పాక్షికంగా చెల్లించిన ఇన్‌వాయిస్‌లు ఏవీ లేవు.'
          : 'No partially paid invoices were found in your records.';
      } else if (targetStatusType === 'OVERDUE') {
        emptySummary = isTelugu
          ? 'ఎటువంటి గడువు ముగిసిన ఇన్‌వాయిస్‌లు లేవు. అన్నీ సక్రమంగా ఉన్నాయి.'
          : 'No overdue invoices found. All client due dates are in good standing.';
        emptySpeech = isTelugu
          ? 'శుభవార్త! గడువు ముగిసిన ఇన్‌వాయిస్‌లు ఏవీ లేవు.'
          : 'Great news! There are zero overdue invoices.';
      } else if (targetStatusType === 'UNPAID') {
        emptySummary = isTelugu
          ? 'అన్ని క్లయింట్ ఇన్‌వాయిస్‌లు పూర్తిగా చెల్లించబడ్డాయి. ఎటువంటి బకాయి లేదు.'
          : 'All client invoices are fully paid. There are zero outstanding balances.';
        emptySpeech = isTelugu
          ? 'శుభవార్త! అన్ని ఇన్‌వాయిస్‌లు పూర్తిగా చెల్లించబడ్డాయి. ఎటువంటి బకాయి లేదు.'
          : 'Great news! All invoices are completely paid and there is zero outstanding balance.';
      } else {
        emptySummary = isTelugu ? 'ఎటువంటి ఇన్‌వాయిస్ రికార్డులు కనుగొనబడలేదు.' : 'No invoice records found in your database.';
        emptySpeech = isTelugu ? 'ఇన్‌వాయిస్‌లు ఏవీ కనిపించలేదు.' : 'No invoice records were found.';
      }

      return {
        intent: 'SHOW_INVOICES',
        category: 'READ',
        summary: emptySummary,
        speechText: emptySpeech,
        requiresConfirmation: false,
        data: {
          items: [],
          totalCount: 0,
          displayedCount: 0,
          hasMore: false,
          targetStatus: targetStatusType,
        },
      };
    }

    let invoiceLimit = 10;
    const invCountMatch = lower.match(/(\d+)\s*(?:invoices?|ఇన్‌వాయిస్‌లు|బిల్లులు)/);
    if (invCountMatch && invCountMatch[1]) {
      const parsed = parseInt(invCountMatch[1], 10);
      if (!isNaN(parsed) && parsed > 0) invoiceLimit = Math.min(parsed, 100);
    } else if (lower.includes('all') || transcript.includes('అన్ని') || transcript.includes('మొత్తం')) {
      invoiceLimit = Math.min(Math.max(totalMatchingCount, 1), 100);
    }

    const matchingInvoices = await prisma.invoice.findMany({
      where: invoiceWhere,
      include: { client: { select: { name: true, pan: true } } },
      orderBy: targetStatusType === 'PAID' ? { invoiceDate: 'desc' } : { dueDate: 'asc' },
      take: invoiceLimit,
    });

    const displayedInvCount = matchingInvoices.length;
    const hasMoreInvoices = totalMatchingCount > displayedInvCount;

    let summaryText = '';
    let speechText = '';

    if (targetStatusType === 'PAID') {
      const topList = matchingInvoices
        .map(inv => `${inv.client.name}: ₹${(inv.amountPaid || inv.totalAmount).toLocaleString('en-IN')} (${inv.invoiceNumber})`)
        .join(', ');
      summaryText = isTelugu
        ? `మొత్తం ${totalMatchingCount} చెల్లించిన ఇన్‌వాయిస్‌లు (చూపబడుతున్నవి: ${displayedInvCount}): ${topList}`
        : `Paid invoices: showing ${displayedInvCount} of ${totalMatchingCount} fully settled invoices. Highlights: ${topList}`;
      speechText = isTelugu
        ? `మొత్తం ${totalMatchingCount} చెల్లించిన ఇన్‌వాయిస్‌లు కనుగొనబడ్డాయి. ఉదాహరణకు, ${matchingInvoices[0].client.name} వారి ఇన్‌వాయిస్ ₹${(matchingInvoices[0].amountPaid || matchingInvoices[0].totalAmount).toLocaleString('en-IN')} పూర్తిగా చెల్లించబడింది.`
        : `Found ${totalMatchingCount} paid invoices. For example, ${matchingInvoices[0].client.name} for ₹${(matchingInvoices[0].amountPaid || matchingInvoices[0].totalAmount).toLocaleString('en-IN')} is fully settled.`;
    } else if (targetStatusType === 'PARTIALLY_PAID') {
      const topList = matchingInvoices
        .map(inv => `${inv.client.name}: ₹${inv.balanceDue.toLocaleString('en-IN')} remaining (${inv.invoiceNumber})`)
        .join(', ');
      summaryText = isTelugu
        ? `పాక్షికంగా చెల్లించిన ఇన్‌వాయిస్‌లు: ${displayedInvCount} of ${totalMatchingCount}. Highlights: ${topList}`
        : `Partially paid invoices: showing ${displayedInvCount} of ${totalMatchingCount}. Highlights: ${topList}`;
      speechText = isTelugu
        ? `మొత్తం ${totalMatchingCount} పాక్షికంగా చెల్లించిన ఇన్‌వాయిస్‌లు ఉన్నాయి.`
        : `Found ${totalMatchingCount} partially paid invoices. For example, ${matchingInvoices[0].client.name} has a remaining balance of ₹${matchingInvoices[0].balanceDue.toLocaleString('en-IN')}.`;
    } else if (targetStatusType === 'OVERDUE') {
      const topList = matchingInvoices
        .map(inv => `${inv.client.name}: ₹${inv.balanceDue.toLocaleString('en-IN')} (${inv.invoiceNumber})`)
        .join(', ');
      summaryText = isTelugu
        ? `గడువు ముగిసిన ఇన్‌వాయిస్‌లు: ${displayedInvCount} of ${totalMatchingCount}. Highlights: ${topList}`
        : `Overdue invoices: showing ${displayedInvCount} of ${totalMatchingCount} overdue. Highlights: ${topList}`;
      speechText = isTelugu
        ? `మొత్తం ${totalMatchingCount} గడువు ముగిసిన ఇన్‌వాయిస్‌లు ఉన్నాయి. వెంటనే చెల్లింపులను ఫాలో-అప్ చేయండి.`
        : `Found ${totalMatchingCount} overdue invoices. Top overdue is ${matchingInvoices[0].client.name} with ₹${matchingInvoices[0].balanceDue.toLocaleString('en-IN')}.`;
    } else if (targetStatusType === 'ALL') {
      const topList = matchingInvoices
        .map(inv => `${inv.client.name}: ₹${inv.totalAmount.toLocaleString('en-IN')} [${inv.paymentStatus}] (${inv.invoiceNumber})`)
        .join(', ');
      summaryText = isTelugu
        ? `మొత్తం ఇన్‌వాయిస్‌లు: ${displayedInvCount} of ${totalMatchingCount}. Highlights: ${topList}`
        : `Invoices: showing ${displayedInvCount} of ${totalMatchingCount} total records. Highlights: ${topList}`;
      speechText = isTelugu
        ? `మొత్తం ${totalMatchingCount} ఇన్‌వాయిస్ రికార్డులు కనుగొనబడ్డాయి.`
        : `Found ${totalMatchingCount} total invoices in your database. Showing first ${displayedInvCount}.`;
    } else {
      // Default: UNPAID
      const topList = matchingInvoices
        .map(inv => `${inv.client.name}: ₹${inv.balanceDue.toLocaleString('en-IN')} (${inv.invoiceNumber})`)
        .join(', ');
      summaryText = isTelugu
        ? `మొత్తం ${totalMatchingCount} చెల్లించని ఇన్‌వాయిస్‌లు (చూపబడుతున్నవి: ${displayedInvCount}): ${topList}`
        : `Unpaid invoices: showing ${displayedInvCount} of ${totalMatchingCount} outstanding. Highlights: ${topList}`;
      speechText = isTelugu
        ? `మొత్తం ${totalMatchingCount} చెల్లించని ఇన్‌వాయిస్‌లు ఉన్నాయి. ప్రస్తుతం ${displayedInvCount} చూపబడుతున్నాయి. ఉదాహరణకు, ${matchingInvoices[0].client.name} వారి బకాయి ₹${matchingInvoices[0].balanceDue.toLocaleString('en-IN')}.`
        : totalMatchingCount === displayedInvCount
        ? `Found all ${totalMatchingCount} unpaid invoices. For example, ${matchingInvoices[0].client.name} has a balance of ₹${matchingInvoices[0].balanceDue.toLocaleString('en-IN')}.`
        : `Found ${totalMatchingCount} unpaid invoices in database. Showing first ${displayedInvCount}. Top is ${matchingInvoices[0].client.name} with ₹${matchingInvoices[0].balanceDue.toLocaleString('en-IN')}.`;
    }

    const shouldNavigateToFinance =
      lower.includes('open finance') ||
      lower.includes('finance open') ||
      (lower.includes('open') && lower.includes('finance'));

    return {
      intent: 'SHOW_INVOICES',
      category: 'READ',
      summary: shouldNavigateToFinance
        ? (isTelugu ? `ఫైనాన్స్ పేజీని ఓపెన్ చేశాను. ${summaryText}` : `Opened Finance page. ${summaryText}`)
        : summaryText,
      speechText: shouldNavigateToFinance
        ? (isTelugu ? `ఫైనాన్స్ పేజీని ఓపెన్ చేశాను. ${speechText}` : `Sure, I've opened Finance for you. ${speechText}`)
        : speechText,
      requiresConfirmation: false,
      suggestedRoute: shouldNavigateToFinance ? '/finance' : undefined,
      data: {
        items: matchingInvoices,
        totalCount: totalMatchingCount,
        displayedCount: displayedInvCount,
        hasMore: hasMoreInvoices,
        targetStatus: targetStatusType,
      },
    };
  }

  // 4B. UPCOMING & NEXT DEADLINE INTENT ("What are my upcoming deadlines?", "Na next deadline eppudu?", "When is my next deadline?")
  if (
    lower.includes('upcoming deadline') ||
    lower.includes('upcoming deadlines') ||
    lower.includes('my deadlines') ||
    lower.includes('my upcoming deadlines') ||
    lower.includes('what are my deadlines') ||
    lower.includes('next deadline') ||
    lower.includes('next due') ||
    lower.includes('deadline eppudu') ||
    lower.includes('deadline kab hai') ||
    lower.includes('aane wali deadline') ||
    lower.includes('aane wali deadlines') ||
    (lower.includes('deadline') && !lower.includes('task')) ||
    transcript.includes('డెడ్‌లైన్') ||
    transcript.includes('గడువు ఎప్పుడు') ||
    transcript.includes('తదుపరి గడువు') ||
    transcript.includes('రాబోయే గడువు')
  ) {
    const upcomingTasks = await prisma.task.findMany({
      where: {
        organizationId: orgId,
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        dueDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        ...(user.role === RoleType.EMPLOYEE ? { assignments: { some: { userId: user.id } } } : {}),
        ...(user.role === RoleType.CLIENT ? { clientId: user.clientId } : {}),
      },
      include: { client: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 5,
    });

    const nextTask = upcomingTasks[0] || null;

    if (!nextTask) {
      return {
        intent: 'SHOW_NEXT_DEADLINE',
        category: 'READ',
        summary: isTelugu ? 'రాబోయే గడువు తేదీలు ఏవీ లేవు.' : 'No upcoming deadlines found in the database.',
        speechText: isTelugu ? 'మీకు రాబోయే డెడ్‌లైన్‌లు ఏవీ లేవు.' : 'You have no upcoming deadlines recorded in the database.',
        requiresConfirmation: false,
        data: { items: [], totalCount: 0, nextDeadline: null },
      };
    }

    const formattedDate = new Date(nextTask.dueDate).toLocaleDateString(isTelugu ? 'te-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const summaryText = isTelugu
      ? `మీ తదుపరి డెడ్‌లైన్: ${formattedDate} (${nextTask.title} - ${nextTask.client?.name || 'జనరల్'}). మొత్తం ${upcomingTasks.length} రాబోయే డెడ్‌లైన్‌లు ఉన్నాయి.`
      : `Your next deadline is ${formattedDate} for "${nextTask.title}" (${nextTask.client?.name || 'General'}). Found ${upcomingTasks.length} upcoming deadlines.`;

    const speechText = isTelugu
      ? `మీ తదుపరి డెడ్‌లైన్ ${formattedDate} న ఉంది. టాస్క్: "${nextTask.title}".`
      : `Your next deadline is on ${formattedDate} for "${nextTask.title}".`;

    return {
      intent: 'SHOW_NEXT_DEADLINE',
      category: 'READ',
      summary: summaryText,
      speechText,
      requiresConfirmation: false,
      data: {
        ...nextTask,
        nextDeadline: nextTask,
        items: upcomingTasks,
        totalCount: upcomingTasks.length,
      },
    };
  }

  // 4C. CLIENT FILING STATUS INTENT ("Suresh client filing status enti?", "Client filing status")
  if (
    lower.includes('filing status') ||
    lower.includes('filing') ||
    lower.includes('filing status enti') ||
    transcript.includes('ఫైలింగ్ స్టేటస్') ||
    transcript.includes('ఫైలింగ్ వివరాలు')
  ) {
    // Extract client search token (e.g. "suresh", "dairy", etc.)
    const cleaned = lower.replace(/client|filing|status|enti|kya|hai|what|is|please|chupinchu|batav/gi, '').trim();

    let matchedClient = null;
    if (cleaned.length >= 2) {
      matchedClient = await prisma.client.findFirst({
        where: {
          organizationId: orgId,
          OR: [
            { name: { contains: cleaned, mode: 'insensitive' } },
            { primaryContact: { contains: cleaned, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, pan: true, gstin: true },
      });
    }

    if (!matchedClient && user.role === RoleType.CLIENT && user.clientId) {
      matchedClient = await prisma.client.findUnique({
        where: { id: user.clientId },
        select: { id: true, name: true, pan: true, gstin: true },
      });
    }

    if (!matchedClient) {
      return {
        intent: 'SHOW_FILING_STATUS',
        category: 'READ',
        summary: isTelugu
          ? `"${cleaned || 'పేర్కొన్న'}" పేరుతో ఎటువంటి క్లయింట్ రికార్డు కనుగొనబడలేదు.`
          : `No client matching "${cleaned || 'specified name'}" was found in your office database.`,
        speechText: isTelugu
          ? `ఆ పేరుతో క్లయింట్ రికార్డు కనుగొనబడలేదు. దయచేసి సరైన క్లయింట్ పేరు చెప్పండి.`
          : `No matching client record was found in your database. Please specify a registered client name.`,
        requiresConfirmation: false,
        data: null,
      };
    }

    // Grounded query: fetch actual filing tasks for this client
    const clientTasks = await prisma.task.findMany({
      where: {
        organizationId: orgId,
        clientId: matchedClient.id,
      },
      include: { service: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    });

    const pending = clientTasks.filter(t => t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED);
    const completed = clientTasks.filter(t => t.status === TaskStatus.COMPLETED);

    let summaryText = '';
    let speechOutput = '';

    if (pending.length === 0 && completed.length === 0) {
      summaryText = isTelugu
        ? `${matchedClient.name} కొరకు ఎటువంటి ఫైలింగ్ రికార్డులు లేవు.`
        : `No filing tasks are currently logged for ${matchedClient.name}.`;
      speechOutput = isTelugu
        ? `${matchedClient.name} కొరకు ఫైలింగ్ రికార్డులు ఏవీ లేవు.`
        : `There are no filing records logged for ${matchedClient.name}.`;
    } else if (pending.length === 0) {
      summaryText = isTelugu
        ? `${matchedClient.name} అన్ని ఫైలింగ్‌లు (${completed.length}) విజయవంతంగా పూర్తయ్యాయి.`
        : `All filings for ${matchedClient.name} (${completed.length} completed) are up to date.`;
      speechOutput = isTelugu
        ? `${matchedClient.name} వారి అన్ని ఫైలింగ్‌లు పూర్తయ్యాయి. ఎటువంటి పెండింగ్ పనులు లేవు.`
        : `All filings for ${matchedClient.name} are completed and up to date.`;
    } else {
      const topPending = pending[0];
      const dueDateFormatted = new Date(topPending.dueDate).toLocaleDateString(isTelugu ? 'te-IN' : 'en-IN');
      summaryText = isTelugu
        ? `${matchedClient.name}: ${pending.length} పెండింగ్ ఫైలింగ్‌లు. మొదటిది "${topPending.title}" గడువు ${dueDateFormatted} (స్టేటస్: ${topPending.status}).`
        : `${matchedClient.name}: ${pending.length} pending filings. Nearest "${topPending.title}" due ${dueDateFormatted} (${topPending.status}).`;
      speechOutput = isTelugu
        ? `${matchedClient.name} కొరకు ${pending.length} పెండింగ్ ఫైలింగ్‌లు ఉన్నాయి. ముఖ్యమైనది "${topPending.title}", గడువు తేదీ ${dueDateFormatted}.`
        : `${matchedClient.name} has ${pending.length} pending filings. Next is "${topPending.title}" due on ${dueDateFormatted}.`;
    }

    return {
      intent: 'SHOW_FILING_STATUS',
      category: 'READ',
      summary: summaryText,
      speechText: speechOutput,
      requiresConfirmation: false,
      data: {
        client: matchedClient,
        pendingCount: pending.length,
        completedCount: completed.length,
        tasks: clientTasks,
      },
    };
  }

  // 5A. CONVERSATIONAL CREATE RENEWAL WORKFLOW
  const lastMsgForRenewal = history && history.length > 0 ? history[history.length - 1].content.toLowerCase() : '';
  const isAwaitingRenewalClient =
    lastMsgForRenewal.includes('which client is this renewal for') ||
    lastMsgForRenewal.includes('ఈ రెన్యూవల్ ఏ క్లయింట్ కొరకు');

  const isCreateRenewal =
    isAwaitingRenewalClient ||
    lower.includes('add a new renewal') ||
    lower.includes('add new renewal') ||
    lower.includes('create a new renewal') ||
    lower.includes('create new renewal') ||
    lower.includes('add a renewal') ||
    lower.includes('add renewal') ||
    lower.includes('create renewal') ||
    lower.includes('new renewal add') ||
    lower.includes('new renewal create') ||
    lower.includes('renewal add cheyyi') ||
    lower.includes('new renewal add cheyyi') ||
    lower.includes('renewal add cheyyali') ||
    lower.includes('renewal create cheyyi') ||
    lower.includes('naya renewal add') ||
    lower.includes('naya renewal banao') ||
    transcript.includes('కొత్త రెన్యూవల్');

  if (isCreateRenewal) {
    if (isAwaitingRenewalClient && (lower === 'cancel' || lower === 'vaddhu' || lower === 'vaddu' || lower === 'stop')) {
      return {
        intent: 'CREATE_RENEWAL_CANCEL',
        category: 'HELP',
        summary: isTelugu ? 'రెన్యూవల్ ప్రక్రియ రద్దు చేయబడింది.' : 'Renewal creation cancelled. No record was saved.',
        speechText: isTelugu ? 'రెన్యూవల్ రద్దు చేయబడింది.' : 'Renewal creation cancelled.',
        requiresConfirmation: false,
      };
    }

    if (user.role === RoleType.CLIENT) {
      return {
        intent: 'CREATE_RENEWAL_DENIED',
        category: 'HELP',
        summary: isTelugu
          ? 'క్షమించండి, క్లయింట్ ఖాతాకు రెన్యూవల్ నమోదు చేసే అనుమతి లేదు.'
          : 'Access denied: Clients are not authorized to create renewal records.',
        speechText: isTelugu
          ? 'రెన్యూవల్ నమోదు చేసే అనుమతి మీ ఖాతాకు లేదు.'
          : 'Clients cannot create renewal records.',
        requiresConfirmation: false,
      };
    }

    const allClients = await prisma.client.findMany({
      where: { organizationId: orgId, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    let matchedClient = allClients.find(c => {
      const cLower = c.name.toLowerCase();
      const baseName = cLower.replace(/\s+(pvt|ltd|private|limited|llp|products|industries|associates|enterprises)\.?/gi, '').trim();
      return lower.includes(cLower) || (baseName.length > 2 && lower.includes(baseName));
    });

    if (!matchedClient && isAwaitingRenewalClient) {
      const q = transcript.toLowerCase().trim();
      matchedClient = allClients.find(c => {
        const cLower = c.name.toLowerCase();
        return cLower.includes(q) || q.includes(cLower);
      });
    }

    if (!matchedClient) {
      return {
        intent: 'CREATE_RENEWAL_PROMPT',
        category: 'CLARIFICATION',
        summary: isTelugu
          ? 'ఈ రెన్యూవల్ ఏ క్లయింట్ కొరకు? దయచేసి క్లయింట్ పేరు పేర్కొనండి.'
          : 'Sure. Which client is this renewal for?',
        speechText: isTelugu
          ? 'ఈ రెన్యూవల్ ఏ క్లయింట్ కొరకు? ఉదాహరణకు ' + allClients.slice(0, 3).map(c => c.name).join(', ')
          : 'Which client is this renewal for? I found clients like ' + allClients.slice(0, 3).map(c => c.name).join(', ') + '.',
        requiresConfirmation: false,
        actionDetails: { workflow: 'CREATE_RENEWAL', step: 'CLIENT_REQUIRED' },
        clarificationOptions: allClients.slice(0, 5).map(c => c.name),
      };
    }

    let renewalType = 'FSSAI Food License';
    if (lower.includes('fssai') || lower.includes('food')) {
      renewalType = 'FSSAI Food License';
    } else if (lower.includes('dsc') || lower.includes('digital signature')) {
      renewalType = 'DSC / Digital Signature';
    } else if (lower.includes('gst')) {
      renewalType = 'GST Registration Renewal';
    } else if (lower.includes('trade')) {
      renewalType = 'Trade License';
    } else if (lower.includes('factory')) {
      renewalType = 'Factory License';
    } else if (lower.includes('shop') || lower.includes('establishment')) {
      renewalType = 'Shop & Establishment License';
    } else if (lower.includes('iec')) {
      renewalType = 'Import Export Code (IEC)';
    }

    const resolvedDate = resolveDateFromTranscript(transcript);
    let expiryDate = new Date(Date.now() + 30 * 86400000);
    if (resolvedDate.isExplicit) {
      expiryDate = resolvedDate.targetDate;
    }

    const expiryFormatted = expiryDate.toLocaleDateString(isTelugu ? 'te-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const token = generateConfirmationToken({
      actionType: 'CREATE_RENEWAL',
      clientId: matchedClient.id,
      renewalType,
      expiryDate: expiryDate.toISOString(),
      reminderDays: 30,
      orgId,
      userId,
      isTelugu,
    });

    return {
      intent: 'CREATE_RENEWAL',
      category: 'WRITE',
      summary: isTelugu
        ? `క్లయింట్ "${matchedClient.name}" కొరకు "${renewalType}" (గడువు: ${expiryFormatted}) జోడించమంటారా?`
        : `Please confirm adding renewal: **${renewalType}** for client **${matchedClient.name}** (Expiring: ${expiryFormatted}). Shall I proceed?`,
      speechText: isTelugu
        ? `క్లయింట్ ${matchedClient.name} కొరకు ${renewalType} రెన్యూవల్ నమోదు చేయమంటారా? దయచేసి నిర్ధారించండి.`
        : `Please confirm adding renewal ${renewalType} for ${matchedClient.name}. Shall I proceed?`,
      requiresConfirmation: true,
      confirmationToken: token,
      suggestedRoute: '/renewals',
      actionDetails: {
        client: matchedClient.name,
        renewalType,
        expiryDate: expiryFormatted,
      },
    };
  }

  // 5B. CONVERSATIONAL CREATE CLIENT WORKFLOW
  const lastMsgForClient = history && history.length > 0 ? history[history.length - 1].content.toLowerCase() : '';
  const isAwaitingClientName =
    lastMsgForClient.includes('what is the business or company name') ||
    lastMsgForClient.includes('what is the client or business name') ||
    lastMsgForClient.includes('వ్యాపార లేదా సంస్థ పేరు') ||
    lastMsgForClient.includes('వ్యాపార లేదా కంపెనీ పేరు');

  const isCreateClient =
    isAwaitingClientName ||
    lower.includes('add a new client') ||
    lower.includes('add new client') ||
    lower.includes('create a new client') ||
    lower.includes('create new client') ||
    lower.includes('add client') ||
    lower.includes('create client') ||
    lower.includes('new client add') ||
    lower.includes('new client create') ||
    lower.includes('client add cheyyali') ||
    lower.includes('new client add cheyyali') ||
    lower.includes('client add cheyyi') ||
    lower.includes('new client add cheyyi') ||
    lower.includes('client create cheyyi') ||
    lower.includes('naya client add') ||
    lower.includes('naya client banao') ||
    transcript.includes('కొత్త క్లయింట్‌ను జోడించు') ||
    transcript.includes('కొత్త క్లయింట్');

  if (isCreateClient) {
    if (isAwaitingClientName && (lower === 'cancel' || lower === 'vaddhu' || lower === 'vaddu' || lower === 'stop')) {
      return {
        intent: 'CREATE_CLIENT_CANCEL',
        category: 'HELP',
        summary: isTelugu ? 'క్లయింట్ నమోదు రద్దు చేయబడింది.' : 'Client creation workflow cancelled. No record was saved.',
        speechText: isTelugu ? 'క్లయింట్ నమోదు రద్దు చేయబడింది.' : 'Client creation cancelled.',
        requiresConfirmation: false,
      };
    }

    const canCreateClient = [
      RoleType.FIRM_OWNER,
      RoleType.FIRM_ADMIN,
      RoleType.MANAGER,
      RoleType.TAX_PROFESSIONAL,
    ].includes(user.role);

    if (!canCreateClient) {
      return {
        intent: 'CREATE_CLIENT_DENIED',
        category: 'HELP',
        summary: isTelugu
          ? 'క్షమించండి, మీ రోల్‌కు కొత్త క్లయింట్లను నమోదు చేసే అధికారం లేదు. ఫర్మ్ ఓనర్ లేదా మేనేజర్‌ను సంప్రదించండి.'
          : 'Access denied: Only Firm Owners, Admins, Managers, and Tax Professionals can create new clients.',
        speechText: isTelugu
          ? 'కొత్త క్లయింట్‌ను నమోదు చేసే అధికారం మీ రోల్‌కు లేదు.'
          : 'You do not have permission to add new clients.',
        requiresConfirmation: false,
      };
    }

    let clientName = '';
    if (isAwaitingClientName) {
      clientName = transcript
        .replace(/^(the\s+name\s+is|it\s+is|its|name\s+is|name\s*:|పేరు)\s+/i, '')
        .trim();
    } else {
      const forMatch = transcript.match(/(?:for|named|called|peru|name)\s+(?:the\s+)?([A-Za-z0-9&.\s'-]+?)(?:\s+(?:with|having|phone|mobile|email|pan|gst|client)|$)/i);
      if (forMatch && forMatch[1] && forMatch[1].trim().length > 1) {
        clientName = forMatch[1].trim();
      } else {
        const createMatch = transcript.match(/(?:add|create|new)\s+(?:a\s+)?(?:new\s+)?client\s+(?:for\s+)?([A-Za-z0-9&.\s'-]+?)(?:\s+(?:with|having|phone|mobile|email|pan|gst)|$)/i);
        if (createMatch && createMatch[1] && createMatch[1].trim().length > 1) {
          const cand = createMatch[1].trim();
          if (!['new', 'a new', 'please', 'add', 'cheyyi', 'cheyyali'].includes(cand.toLowerCase())) {
            clientName = cand;
          }
        }
      }
    }

    // Clean clientName
    clientName = clientName.replace(/^(the|a|an)\s+/i, '').trim();
    if (clientName) {
      clientName = clientName
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }

    if (!clientName) {
      return {
        intent: 'CREATE_CLIENT_PROMPT',
        category: 'CLARIFICATION',
        summary: isTelugu
          ? 'ఖచ్చితంగా. వ్యాపార లేదా సంస్థ పేరు ఏమిటి?'
          : 'Sure. What is the business or company name?',
        speechText: isTelugu
          ? 'ఖచ్చితంగా. వ్యాపార లేదా కంపెనీ పేరు ఏమిటి?'
          : 'Sure. What is the business or company name?',
        requiresConfirmation: false,
        actionDetails: { workflow: 'CREATE_CLIENT', step: 'NAME_REQUIRED' },
        clarificationOptions: isTelugu
          ? ['సన్‌రైజ్ డెయిరీ', 'శ్రీనివాస ఎంటర్‌ప్రైజెస్', 'రద్దు చేయి']
          : ['Sunrise Dairy', 'Metro Logistics', 'Cancel'],
      };
    }

    const mobMatch = transcript.match(/\b([6-9]\d{9})\b/);
    const mobile = mobMatch ? mobMatch[1] : null;

    const emMatch = transcript.match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/);
    const email = emMatch ? emMatch[1].toLowerCase() : null;

    const panMatch = transcript.match(/\b([A-Za-z]{5}[0-9]{4}[A-Za-z]{1})\b/);
    const pan = panMatch ? panMatch[1].toUpperCase() : null;

    const gstMatch = transcript.match(/\b(\d{2}[A-Za-z]{5}\d{4}[A-Za-z]{1}[A-Za-z\d]{1}[Zz]{1}[A-Za-z\d]{1})\b/);
    const gstin = gstMatch ? gstMatch[1].toUpperCase() : null;

    const cLower = clientName.toLowerCase();
    let clientType = 'PRIVATE_LIMITED';
    if (cLower.includes('ltd') || cLower.includes('limited') || cLower.includes('pvt')) {
      clientType = 'PRIVATE_LIMITED';
    } else if (cLower.includes('llp')) {
      clientType = 'LLP';
    } else if (cLower.includes('trust')) {
      clientType = 'TRUST';
    } else if (cLower.includes('partnership')) {
      clientType = 'PARTNERSHIP_FIRM';
    } else if (cLower.includes('dairy') || cLower.includes('store') || cLower.includes('enterprise') || cLower.includes('traders') || cLower.includes('agency')) {
      clientType = 'SOLE_PROPRIETORSHIP';
    }

    const duplicate = await prisma.client.findFirst({
      where: {
        organizationId: orgId,
        name: { equals: clientName, mode: 'insensitive' },
      },
      select: { id: true, name: true, clientType: true },
    });

    if (duplicate) {
      return {
        intent: 'CREATE_CLIENT_DUPLICATE',
        category: 'CLARIFICATION',
        summary: isTelugu
          ? `"${clientName}" పేరుతో ఇప్పటికే ఒక క్లయింట్ మీ వద్ద ఉన్నారు.`
          : `A client named "${clientName}" already exists in your office database.`,
        speechText: isTelugu
          ? `"${clientName}" పేరుతో క్లయింట్ ఇప్పటికే నమోదై ఉన్నారు.`
          : `A client named "${clientName}" already exists in your office database. Would you like to view their profile?`,
        requiresConfirmation: false,
        data: duplicate,
        suggestedRoute: `/clients/${duplicate.id}`,
      };
    }

    const token = generateConfirmationToken({
      actionType: 'CREATE_CLIENT',
      name: clientName,
      clientType,
      primaryContact: clientName,
      mobile,
      email,
      pan,
      gstin,
      orgId,
      userId,
      isTelugu,
    });

    return {
      intent: 'CREATE_CLIENT',
      category: 'WRITE',
      summary: isTelugu
        ? `కొత్త క్లయింట్ "${clientName}" (${clientType}) నమోదును నిర్ధారించమంటారా?`
        : `Please confirm creating new client: **${clientName}** (Type: ${clientType}${mobile ? `, Mobile: ${mobile}` : ''}). Shall I proceed?`,
      speechText: isTelugu
        ? `కొత్త క్లయింట్ "${clientName}" నమోదును నిర్ధారించమంటారా?`
        : `Please confirm creating new client ${clientName}. Shall I proceed?`,
      requiresConfirmation: true,
      confirmationToken: token,
      actionDetails: {
        name: clientName,
        clientType,
        mobile: mobile || 'Not specified',
        email: email || 'Not specified',
      },
    };
  }

  // 5C. CONTEXTUAL RECORD SELECTION ("Open the first one", "Open first client")
  if (
    lower === 'open the first one' ||
    lower === 'open first one' ||
    lower === 'open the first' ||
    lower === 'open first client' ||
    lower === 'open first task' ||
    lower === 'open 1st one' ||
    lower.includes('modati client') ||
    lower.includes('pehla wala open')
  ) {
    if (history && history.length > 0) {
      const recentHistory = history.slice(-4).map(h => h.content.toLowerCase()).join(' ');
      if (recentHistory.includes('client') || recentHistory.includes('క్లయింట్')) {
        const firstClient = await prisma.client.findFirst({
          where: { organizationId: orgId, status: 'ACTIVE' },
          orderBy: { name: 'asc' },
        });
        if (firstClient) {
          return {
            intent: 'OPEN_CLIENT',
            category: 'NAVIGATION',
            summary: isTelugu
              ? `క్లయింట్ "${firstClient.name}" ప్రొఫైల్‌ను ఓపెన్ చేశాను.`
              : `Opened profile for client "${firstClient.name}".`,
            speechText: isTelugu
              ? `క్లయింట్ ${firstClient.name} వివరాలను ఓపెన్ చేశాను.`
              : `Opened client profile for ${firstClient.name}.`,
            requiresConfirmation: false,
            suggestedRoute: `/clients/${firstClient.id}`,
            data: firstClient,
          };
        }
      }
    }
  }

  // 5. RENEWALS & REGULATORY EXPIRIES
  if (
    lower.includes('renewal') ||
    lower.includes('expir') ||
    lower.includes('license') ||
    lower.includes('fssai') ||
    lower.includes('digital signature') ||
    lower.includes('dsc') ||
    transcript.includes('రెన్యూవల్') ||
    transcript.includes('లైసెన్స్') ||
    transcript.includes('గడువు')
  ) {
    const renewals = await prisma.renewal.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['ACTIVE', 'EXPIRING_SOON', 'EXPIRED'] },
      },
      include: { client: { select: { name: true } } },
      orderBy: { expiryDate: 'asc' },
      take: 6,
    });

    if (renewals.length === 0) {
      return {
        intent: 'SHOW_RENEWALS',
        category: 'READ',
        summary: isTelugu
          ? 'త్వరలో గడువు ముగిసే లైసెన్సులు లేదా రెన్యూవల్స్ ఏవీ లేవు.'
          : 'No active licenses or renewals due soon.',
        speechText: isTelugu
          ? 'త్వరలో గడువు ముగిసే రెన్యూవల్స్ లేదా లైసెన్సులు ఏవీ లేవు.'
          : 'There are no upcoming renewals or expiring licenses recorded.',
        requiresConfirmation: false,
        data: [],
      };
    }

    const speech = isTelugu
      ? `మొత్తం ${renewals.length} రెన్యూవల్స్ ఉన్నాయి. ఉదాహరణకు ${renewals[0].client.name} వారి ${renewals[0].renewalType} గడువు ${new Date(renewals[0].expiryDate).toLocaleDateString('te-IN')} న ముగుస్తుంది.`
      : `Found ${renewals.length} renewals. First is ${renewals[0].renewalType} for ${renewals[0].client.name}, expiring on ${new Date(renewals[0].expiryDate).toLocaleDateString('en-IN')}.`;

    return {
      intent: 'SHOW_RENEWALS',
      category: 'READ',
      summary: isTelugu
        ? `మొత్తం ${renewals.length} రెన్యూవల్స్ గడువు సమీపిస్తోంది. మొదటిది: ${renewals[0].renewalType} (${renewals[0].client.name}).`
        : `Found ${renewals.length} renewals to monitor. Nearest: ${renewals[0].renewalType} (${renewals[0].client.name}).`,
      speechText: speech,
      requiresConfirmation: false,
      data: renewals,
    };
  }

  // 6. CLIENT SEARCH & MISSING DOCUMENTS (Excluding task mutations)
  if (
    !lower.includes('task') &&
    !lower.includes('panulu') &&
    !transcript.includes('టాస్క్') &&
    (
      lower.includes('client') ||
      lower.includes('pan') ||
      lower.includes('missing doc') ||
      lower.includes('missing document') ||
      lower.includes('customer') ||
      transcript.includes('క్లయింట్') ||
      transcript.includes('కస్టమర్') ||
      transcript.includes('పాన్') ||
      transcript.includes('డాక్యుమెంట్') ||
      transcript.includes('పత్రాలు')
    )
  ) {
    // Missing Documents query
    if (lower.includes('missing') || lower.includes('pending doc') || transcript.includes('పెండింగ్') || transcript.includes('లేని')) {
      const pendingRequests = await prisma.documentRequest.findMany({
        where: {
          organizationId: orgId,
          status: 'PENDING',
        },
        include: { client: { select: { name: true, primaryContact: true, mobile: true } } },
        take: 5,
      });

      if (pendingRequests.length === 0) {
        return {
          intent: 'SHOW_CLIENTS',
          category: 'READ',
          summary: isTelugu
            ? 'పెండింగ్ డాక్యుమెంట్ రిక్వెస్ట్‌లు ఏవీ లేవు. అన్ని పత్రాలు సమర్పించబడ్డాయి.'
            : 'Zero pending document collection requests.',
          speechText: isTelugu
            ? 'అన్ని క్లయింట్ డాక్యుమెంట్లు సమర్పించబడ్డాయి. పెండింగ్ డాక్యుమెంట్లు ఏమీ లేవు.'
            : 'All client document requests are fulfilled. No missing documents currently pending.',
          requiresConfirmation: false,
          data: [],
        };
      }

      return {
        intent: 'SHOW_CLIENTS',
        category: 'READ',
        summary: isTelugu
          ? `${pendingRequests.length} పెండింగ్ డాక్యుమెంట్ రిక్వెస్ట్‌లు ఉన్నాయి. ముఖ్యమైనది: ${pendingRequests[0].client.name} నుండి ${pendingRequests[0].title}.`
          : `Found ${pendingRequests.length} pending document requests. Top: ${pendingRequests[0].title} from ${pendingRequests[0].client.name}.`,
        speechText: isTelugu
          ? `${pendingRequests.length} డాక్యుమెంట్ రిక్వెస్ట్‌లు పెండింగ్‌లో ఉన్నాయి. ఉదాహరణకు ${pendingRequests[0].client.name} నుండి ${pendingRequests[0].title}.`
          : `There are ${pendingRequests.length} pending document requests. For example, ${pendingRequests[0].title} from ${pendingRequests[0].client.name}.`,
        requiresConfirmation: false,
        data: pendingRequests,
      };
    }

    // Search Client directory or specific client with strict RBAC / tenant isolation
    const clientWhere: any = { organizationId: orgId, status: 'ACTIVE' };
    if (user.role === RoleType.CLIENT) {
      if (!user.clientId) {
        return {
          intent: 'SHOW_CLIENTS',
          category: 'READ',
          summary: isTelugu ? 'మీ ఖాతాకు ఎటువంటి క్లయింట్ ప్రొఫైల్ అనుసంధానించబడలేదు.' : 'No linked client profile found for your account.',
          speechText: isTelugu ? 'మీ క్లయింట్ ప్రొఫైల్ వివరాలు లేవు.' : 'No linked client organization was found for your account.',
          requiresConfirmation: false,
          data: { items: [], totalCount: 0, displayedCount: 0, hasMore: false },
        };
      }
      clientWhere.id = user.clientId;
    }

    // Established deterministic ordering rule: Alphabetical by client name ascending, unique tie-breaker id ascending
    const deterministicOrder = [{ name: 'asc' as const }, { id: 'asc' as const }];

    // Field-level permission filtering:
    // If EMPLOYEE role, mask PAN and GSTIN
    const clientSelect = {
      id: true,
      name: true,
      pan: user.role !== RoleType.EMPLOYEE,
      gstin: user.role !== RoleType.EMPLOYEE,
      mobile: true,
      primaryContact: true,
      status: true,
    };

    // 1. Total matching count directly from authorized database
    const totalCount = await prisma.client.count({ where: clientWhere });

    // BRANCH A: AGGREGATE COUNT QUERY ("How many active clients do we have?", "Total clients", "Client count")
    const isCountQuery =
      lower.includes('how many active clients') ||
      lower.includes('how many clients') ||
      lower.includes('total clients') ||
      lower.includes('client count') ||
      lower.includes('clients count') ||
      lower.includes('count of clients') ||
      lower.includes('number of clients') ||
      transcript.includes('ఎంతమంది క్లయింట్లు') ||
      transcript.includes('క్లయింట్ల సంఖ్య') ||
      transcript.includes('మొత్తం క్లయింట్లు') ||
      (lower.includes('kitne') && (lower.includes('client') || lower.includes('clients'))) ||
      lower.includes('kitne clients') ||
      lower.includes('kitne active clients');

    if (isCountQuery) {
      const summaryText = isTelugu
        ? `మీ డేటాబేస్‌లో మొత్తం ${totalCount} మంది యాక్టివ్ క్లయింట్లు నమోదై ఉన్నారు.`
        : `You have ${totalCount} active clients registered in your office database.`;
      const speechOutput = isTelugu
        ? `మీ సంస్థలో మొత్తం ${totalCount} మంది యాక్టివ్ క్లయింట్లు ఉన్నారు.`
        : `There are ${totalCount} active clients registered in your database.`;

      return {
        intent: 'COUNT_CLIENTS',
        category: 'READ',
        summary: summaryText,
        speechText: speechOutput,
        requiresConfirmation: false,
        data: {
          totalCount,
          count: totalCount,
          isCount: true,
        },
      };
    }

    // BRANCH B: RANGE LOOKUP INTENT ("Show me clients 5 to 10", "clients 5 through 10", "5 నుండి 10 వరకు క్లయింట్లు", "clients 5 se 10")
    const rangeMatch =
      lower.match(/clients?\s*(?:from\s+)?(\d+)\s*(?:to|through|-|నుండి|se)\s*(\d+)/i) ||
      lower.match(/(\d+)\s*(?:to|-|నుండి|se)\s*(\d+)\s*(?:వరకు\s*|tak\s*)?(?:clients?|క్లయింట్లు?|క్లయింట్లను?)?/i) ||
      lower.match(/(?:show|list|give me|dikhao|chupinchu)\s*(?:me\s+)?(?:clients?|క్లయింట్లు?|క్లయింట్లను?)?\s*(\d+)\s*(?:to|through|-|se|నుండి)\s*(\d+)/i) ||
      transcript.match(/(\d+)\s*నుండి\s*(\d+)\s*(?:వరకు)?/);

    if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
      const rawStart = parseInt(rangeMatch[1], 10);
      const rawEnd = parseInt(rangeMatch[2], 10);
      const S = Math.max(1, Math.min(rawStart, rawEnd));
      const E = Math.max(rawStart, rawEnd);

      if (S > totalCount) {
        const outOfBoundsSummary = isTelugu
          ? `కోరిన శ్రేణి #${S} నుండి #${E} వరకు మీ డేటాబేస్‌లో అందుబాటులో లేదు (మొత్తం ${totalCount} మంది యాక్టివ్ క్లయింట్లు మాత్రమే ఉన్నారు).`
          : `Requested range #${S} to #${E} is beyond your database records (only ${totalCount} active clients exist).`;
        const outOfBoundsSpeech = isTelugu
          ? `మీ డేటాబేస్‌లో ${totalCount} మంది క్లయింట్లు మాత్రమే ఉన్నారు, కాబట్టి ${S} నుండి ${E} శ్రేణి లభించదు.`
          : `There are only ${totalCount} active clients in your database, so clients ${S} through ${E} cannot be retrieved.`;

        return {
          intent: 'CLIENT_RANGE',
          category: 'READ',
          summary: outOfBoundsSummary,
          speechText: outOfBoundsSpeech,
          requiresConfirmation: false,
          data: {
            items: [],
            totalCount,
            rangeStart: S,
            rangeEnd: E,
            displayedCount: 0,
            isRange: true,
          },
        };
      }

      const effectiveEnd = Math.min(E, totalCount);
      const takeCount = effectiveEnd - S + 1;

      const rangeClients = await prisma.client.findMany({
        where: clientWhere,
        orderBy: deterministicOrder,
        skip: S - 1,
        take: takeCount,
        select: clientSelect,
      });

      const itemsWithPositions = rangeClients.map((c, i) => ({
        ...c,
        position: S + i,
      }));

      const summaryText = isTelugu
        ? `క్లయింట్లు #${S} నుండి #${effectiveEnd} వరకు (${rangeClients.length} మంది / మొత్తం ${totalCount}).`
        : `Showing clients #${S} to #${effectiveEnd} (${rangeClients.length} of ${totalCount} active records).`;
      const speechOutput = isTelugu
        ? `అక్షరక్రమంలో మీ డేటాబేస్ నుండి ${S}వ క్లయింట్ నుండి ${effectiveEnd}వ క్లయింట్ వరకు గల ${rangeClients.length} మంది వివరాలు లోడ్ అయ్యాయి.`
        : `Showing clients ${S} through ${effectiveEnd} under alphabetical ordering (${rangeClients.length} records out of ${totalCount}).`;

      return {
        intent: 'CLIENT_RANGE',
        category: 'READ',
        summary: summaryText,
        speechText: speechOutput,
        requiresConfirmation: false,
        data: {
          items: itemsWithPositions,
          totalCount,
          rangeStart: S,
          rangeEnd: effectiveEnd,
          displayedCount: rangeClients.length,
          isRange: true,
        },
      };
    }

    // BRANCH C: ORDINAL RECORD LOOKUP INTENT ("Who is the 27th client in our data?", "Tell me the first client", "Who is the last client?", "27వ క్లయింట్ ఎవరు?")
    let ordinalPosition: number | null = null;
    let ordinalLabel = '';

    if (
      lower.includes('first client') ||
      lower.includes('1st client') ||
      lower.includes('first customer') ||
      transcript.includes('మొదటి క్లయింట్') ||
      lower.includes('pehla client')
    ) {
      ordinalPosition = 1;
      ordinalLabel = '1st';
    } else if (
      lower.includes('second client') ||
      lower.includes('2nd client') ||
      transcript.includes('రెండవ క్లయింట్') ||
      lower.includes('doosra client')
    ) {
      ordinalPosition = 2;
      ordinalLabel = '2nd';
    } else if (
      lower.includes('third client') ||
      lower.includes('3rd client') ||
      transcript.includes('మూడవ క్లయింట్')
    ) {
      ordinalPosition = 3;
      ordinalLabel = '3rd';
    } else if (
      lower.includes('last client') ||
      lower.includes('final client') ||
      transcript.includes('చివరి క్లయింట్') ||
      transcript.includes('ఆఖరి క్లయింట్') ||
      lower.includes('aakhri client')
    ) {
      ordinalPosition = totalCount;
      ordinalLabel = `last (#${totalCount})`;
    } else {
      const explicitOrdinalMatch =
        lower.match(/(?:who\s+is|tell\s+me|what\s+is|show\s+me|find|get)?\s*(?:the\s+)?(\d+)(?:st|nd|rd|th)\s*(?:client|customer)/i) ||
        lower.match(/the\s+(\d+)(?:st|nd|rd|th)?\s+client\b/i) ||
        lower.match(/who\s+is\s+(?:the\s+)?(\d+)(?:st|nd|rd|th)?\s+client/i) ||
        lower.match(/(\d+)(?:st|nd|rd|th)?\s+client\s+(?:in|of)\s+(?:our\s+)?data/i) ||
        lower.match(/(\d+)(?:st|nd|rd|th)?\s+client\s+(?:kaun|evaru|kon|hai|enti|chupinchu|batao|dikhao)/i) ||
        lower.match(/(?:data\s+me|datalo|data\s+lo)\s+(\d+)(?:st|nd|rd|th)?\s+client/i) ||
        transcript.match(/(\d+)\s*వ\s*క్లయింట్/);

      if (explicitOrdinalMatch && explicitOrdinalMatch[1]) {
        ordinalPosition = parseInt(explicitOrdinalMatch[1], 10);
        ordinalLabel = getOrdinalString(ordinalPosition);
      }
    }

    if (ordinalPosition !== null) {
      if (ordinalPosition < 1 || ordinalPosition > totalCount) {
        const notFoundSummary = isTelugu
          ? `మీ డేటాబేస్‌లో మొత్తం ${totalCount} మంది యాక్టివ్ క్లయింట్లు మాత్రమే ఉన్నారు, కాబట్టి ${ordinalPosition}వ క్లయింట్ రికార్డు అందుబాటులో లేదు.`
          : `The ${ordinalLabel} client cannot be found because there are only ${totalCount} active clients in your database.`;
        const notFoundSpeech = isTelugu
          ? `మీ డేటాబేస్‌లో ${totalCount} మంది క్లయింట్లు మాత్రమే ఉన్నారు, కాబట్టి ${ordinalPosition}వ క్లయింట్ లభించలేదు.`
          : `There are only ${totalCount} active clients in your database, so the ${ordinalLabel} client cannot be found.`;

        return {
          intent: 'CLIENT_ORDINAL',
          category: 'READ',
          summary: notFoundSummary,
          speechText: notFoundSpeech,
          requiresConfirmation: false,
          data: {
            items: [],
            totalCount,
            targetPosition: ordinalPosition,
            isOrdinal: true,
          },
        };
      }

      const targetClient = await prisma.client.findFirst({
        where: clientWhere,
        orderBy: deterministicOrder,
        skip: ordinalPosition - 1,
        select: clientSelect,
      });

      if (!targetClient) {
        return {
          intent: 'CLIENT_ORDINAL',
          category: 'READ',
          summary: isTelugu
            ? `${ordinalPosition}వ క్లయింట్ రికార్డు లభించలేదు.`
            : `Could not retrieve the ${ordinalLabel} client from the database.`,
          speechText: isTelugu
            ? `${ordinalPosition}వ క్లయింట్ వివరాలు లభించలేదు.`
            : `The ${ordinalLabel} client could not be retrieved.`,
          requiresConfirmation: false,
          data: null,
        };
      }

      const panSnippet = targetClient.pan ? ` | PAN: ${targetClient.pan}` : '';
      const contactSnippet = targetClient.primaryContact || targetClient.mobile ? ` | Contact: ${targetClient.primaryContact || targetClient.mobile}` : '';

      const summaryText = isTelugu
        ? `${ordinalPosition}వ క్లయింట్: ${targetClient.name}${targetClient.pan ? ' | పాన్: ' + targetClient.pan : ''}`
        : `${ordinalLabel} Client: ${targetClient.name}${panSnippet}${contactSnippet}`;
      const speechOutput = isTelugu
        ? `అక్షరక్రమంలో మీ డేటాబేస్‌లోని ${ordinalPosition}వ క్లయింట్ ${targetClient.name}.`
        : `The ${ordinalLabel} client in your database (ordered alphabetically by name) is ${targetClient.name}.`;

      return {
        intent: 'CLIENT_ORDINAL',
        category: 'READ',
        summary: summaryText,
        speechText: speechOutput,
        requiresConfirmation: false,
        data: {
          items: [{ ...targetClient, position: ordinalPosition }],
          totalCount,
          targetPosition: ordinalPosition,
          displayedCount: 1,
          isOrdinal: true,
        },
      };
    }

    // BRANCH D: SPECIFIC CLIENT SEARCH BY NAME OR KEYWORD ("AMD Dairy client details", "Find client Suresh")
    const isListOrDirectoryQuery =
      lower.includes('list') ||
      lower.includes('all') ||
      lower.includes('directory') ||
      transcript.includes('జాబితా') ||
      transcript.includes('లిస్ట్') ||
      transcript.includes('అన్ని') ||
      transcript.includes('మొత్తం') ||
      Boolean(lower.match(/\d+\s*(?:clients?|కస్టమర్|క్లయింట్|మంది)/)) ||
      lower.trim() === 'clients' ||
      lower.trim() === 'show clients' ||
      lower.trim() === 'client list' ||
      (lower.includes('give me') && lower.includes('client'));

    if (!isListOrDirectoryQuery && user.role !== RoleType.CLIENT) {
      const cleaned = lower.replace(/client|pan|gst|details|chupinchu|batav|kya|hai|show|me|find|search|info/gi, '').trim();
      if (cleaned.length >= 2) {
        const singleMatch = await prisma.client.findFirst({
          where: {
            organizationId: orgId,
            status: 'ACTIVE',
            OR: [
              { name: { contains: cleaned, mode: 'insensitive' } },
              { pan: { contains: cleaned, mode: 'insensitive' } },
              { primaryContact: { contains: cleaned, mode: 'insensitive' } },
            ],
          },
          select: clientSelect,
        });

        if (singleMatch) {
          return {
            intent: 'SHOW_CLIENTS',
            category: 'READ',
            summary: isTelugu
              ? `క్లయింట్: ${singleMatch.name} | పాన్: ${singleMatch.pan || 'లేదు'} | జీఎస్టీ: ${singleMatch.gstin || 'లేదు'} | మొబైల్: ${singleMatch.primaryContact || singleMatch.mobile || 'లేదు'}`
              : `Client: ${singleMatch.name} | PAN: ${singleMatch.pan || 'N/A'} | GST: ${singleMatch.gstin || 'N/A'} | Contact: ${singleMatch.primaryContact || singleMatch.mobile || 'N/A'}`,
            speechText: isTelugu
              ? `${singleMatch.name} వివరాలు లభించాయి. పాన్ సంఖ్య ${singleMatch.pan || 'నమోదు కాలేదు'}, జీఎస్టీ సంఖ్య ${singleMatch.gstin || 'నమోదు కాలేదు'}.`
              : `Found ${singleMatch.name}. PAN is ${singleMatch.pan || 'not recorded'}, GSTIN is ${singleMatch.gstin || 'not registered'}.`,
            requiresConfirmation: false,
            data: {
              items: [singleMatch],
              totalCount: 1,
              displayedCount: 1,
              hasMore: false,
            },
          };
        }
      }
    }

    // BRANCH E: DIRECTORY LISTING WITH DETERMINISTIC ORDERING ("Give me the 10 clients list", "Show all clients")
    let limit = 10;
    const countMatch = lower.match(/(\d+)\s*(?:clients?|కస్టమర్లు?|క్లయింట్లు?|మంది)?/);
    if (countMatch && countMatch[1]) {
      const parsed = parseInt(countMatch[1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 100);
      }
    } else if (lower.includes('all') || transcript.includes('అన్ని') || transcript.includes('మొత్తం')) {
      limit = Math.min(Math.max(totalCount, 1), 100);
    }

    const clients = await prisma.client.findMany({
      where: clientWhere,
      select: clientSelect,
      orderBy: deterministicOrder,
      take: limit,
    });

    const displayedCount = clients.length;
    const hasMore = totalCount > displayedCount;

    // Attach 1-based position to each client card in list
    const clientsWithPositions = clients.map((c, i) => ({
      ...c,
      position: i + 1,
    }));

    let summaryText = '';
    let speechOutput = '';

    if (displayedCount === 0) {
      summaryText = isTelugu ? 'యాక్టివ్ క్లయింట్ రికార్డులు ఏవీ లేవు.' : 'No active clients found in the database.';
      speechOutput = isTelugu ? 'మీ డేటాబేస్‌లో ఎటువంటి యాక్టివ్ క్లయింట్లు లేరు.' : 'There are no active clients recorded in your database.';
    } else if (user.role === RoleType.CLIENT) {
      summaryText = isTelugu
        ? `మీ క్లయింట్ ప్రొఫైల్: ${clientsWithPositions[0].name} (పాన్: ${clientsWithPositions[0].pan || 'N/A'})`
        : `Your client profile: ${clientsWithPositions[0].name} (PAN: ${clientsWithPositions[0].pan || 'N/A'})`;
      speechOutput = isTelugu
        ? `మీ క్లయింట్ వివరాలు లోడ్ అయ్యాయి: ${clientsWithPositions[0].name}.`
        : `Loaded your authorized client profile for ${clientsWithPositions[0].name}.`;
    } else if (totalCount === displayedCount) {
      summaryText = isTelugu
        ? `మొత్తం ${totalCount} మంది యాక్టివ్ క్లయింట్లు లోడ్ అయ్యారు.`
        : `Active clients: loaded all ${totalCount} clients from database.`;
      speechOutput = isTelugu
        ? `మీ డేటాబేస్ నుండి మొత్తం ${totalCount} మంది క్లయింట్లను లోడ్ చేసాను.`
        : `Loaded all ${totalCount} active clients from your database.`;
    } else {
      summaryText = isTelugu
        ? `యాక్టివ్ క్లయింట్లు: మొత్తం ${totalCount} మందిలో ${displayedCount} మంది చూపబడుతున్నారు.`
        : `Active clients: showing ${displayedCount} of ${totalCount} registered clients.`;
      speechOutput = isTelugu
        ? `మీ సంస్థలో మొత్తం ${totalCount} మంది యాక్టివ్ క్లయింట్లు ఉన్నారు. ప్రస్తుతం ${displayedCount} మందిని చూపిస్తున్నాను.`
        : `Found ${totalCount} active clients in your database. Showing the first ${displayedCount}.`;
    }

    return {
      intent: 'SHOW_CLIENTS',
      category: 'READ',
      summary: summaryText,
      speechText: speechOutput,
      requiresConfirmation: false,
      data: {
        items: clientsWithPositions,
        totalCount,
        displayedCount,
        hasMore,
      },
    };
  }

  // 6.5. STAFF & EMPLOYEES INTENT
  const isStaffQuery =
    !forcedContextIntent &&
    !lower.includes('attendance') &&
    !lower.includes('task') &&
    !lower.includes('todo') &&
    (
      lower.includes('employee') ||
      lower.includes('staff') ||
      lower.includes('team member') ||
      lower.includes('team members') ||
      lower.includes('who works') ||
      lower.includes('colleague') ||
      lower.includes('udhyogulu') ||
      lower.includes('udhyogi') ||
      lower.includes('enthamandhi employees') ||
      lower.includes('enthamandhi staff') ||
      lower.includes('karmachari') ||
      transcript.includes('ఉద్యోగ') ||
      transcript.includes('సిబ్బంది') ||
      transcript.includes('స్టాఫ్') ||
      transcript.includes('ఎంతమంది ఉద్యోగులు')
    );

  if (isStaffQuery) {
    const staff = await prisma.user.findMany({
      where: { organizationId: orgId, role: { not: RoleType.CLIENT }, isActive: true },
      select: {
        id: true,
        fullName: true,
        role: true,
        designation: true,
        department: true,
        email: true,
        phone: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const staffCount = staff.length;
    const summaryList = staff
      .map(s => `• ${s.fullName} (${s.role.replace('_', ' ')}${s.designation ? ` - ${s.designation}` : ''}${s.phone ? `, Ph: ${s.phone}` : ''})`)
      .join('\n');

    const summary = isTelugu
      ? `మన ఆఫీస్‌లో మొత్తం ${staffCount} మంది సిబ్బంది ఉన్నారు:\n${summaryList}`
      : `Our practice has ${staffCount} active team members:\n${summaryList}`;

    const speechText = isTelugu
      ? `మన ఆఫీస్‌లో మొత్తం ${staffCount} మంది ఉద్యోగులు ఉన్నారు. ముఖ్యంగా: ${staff.slice(0, 4).map(s => s.fullName).join(', ')}${staffCount > 4 ? ' తదితరులు ఉన్నారు' : ''}.`
      : `Our office has ${staffCount} staff members, including ${staff.slice(0, 4).map(s => s.fullName).join(', ')}.`;

    return {
      intent: 'SHOW_EMPLOYEES',
      category: 'READ',
      summary,
      speechText,
      requiresConfirmation: false,
      suggestedRoute: '/settings',
      data: {
        staff,
        totalCount: staffCount,
      },
    };
  }

  // 7. TO-DO MANAGEMENT
  const isTodoIntent =
    lower.includes('todo') ||
    lower.includes('to-do') ||
    lower.includes('to do') ||
    lower.includes('reminder') ||
    lower.includes('yaad dila') ||
    lower.includes('gurthu cheyi') ||
    transcript.includes('టు-డూ') ||
    transcript.includes('గుర్తు');

  if (isTodoIntent) {
    // Create Todo
    if (
      lower.startsWith('create ') ||
      lower.startsWith('add ') ||
      lower.includes('add todo') ||
      lower.includes('add to-do') ||
      lower.includes('add to do') ||
      lower.includes('create todo') ||
      lower.includes('create to-do') ||
      lower.includes('create to do') ||
      lower.includes('banao') ||
      lower.includes('raayi') ||
      lower.includes('jodinchu') ||
      transcript.includes('రాయి') ||
      transcript.includes('రాయండి') ||
      transcript.includes('చేర్చు') ||
      transcript.includes('జోడించు')
    ) {
      const titleMatch = transcript.replace(/create|add|todo|to-do|to\s+do|reminder|for|me|tomorrow|today|please|jodinchu|raayi|రాయి|రాయండి|చేర్చు|జోడించు|గుర్తు|చేయి/gi, '').trim();
      const title = titleMatch || 'Follow up with client regarding tax documents';

      const token = generateConfirmationToken({
        actionType: 'CREATE_TODO',
        title,
        userId,
        orgId,
        isTelugu,
      });

      return {
        intent: 'CREATE_TODO',
        category: 'WRITE',
        summary: isTelugu
          ? `వ్యక్తిగత టు-డూ జోడించమంటారా: "${title}"?`
          : `Add personal to-do: "${title}"?`,
        speechText: isTelugu
          ? `మీ వ్యక్తిగత టు-డూ లిస్ట్‌లో "${title}" ను చేర్చమంటారా? దయచేసి నిర్ధారించండి.`
          : `Would you like me to add "${title}" to your personal to-do list? Please confirm.`,
        requiresConfirmation: true,
        confirmationToken: token,
        actionDetails: {
          title,
          target: isTelugu ? 'వ్యక్తిగత టు-డూ' : 'Personal To-Do',
          date: isTelugu ? 'ఈ రోజు' : 'Today',
        },
      };
    }

    // List Todos - Synchronized with /api/todos and TodoPage
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
    const endOfTomorrow = new Date(endOfToday.getTime() + 86400000);

    const isTodayQuery =
      lower.includes('today') ||
      lower.includes('e roju') ||
      lower.includes('eroju') ||
      lower.includes('aaj') ||
      transcript.includes('ఈ రోజు') ||
      transcript.includes('ఈరోజు');

    const isTomorrowQuery =
      lower.includes('tomorrow') ||
      lower.includes('repu') ||
      lower.includes('kal') ||
      transcript.includes('రేపు');

    const isOverdueQuery =
      lower.includes('overdue') ||
      lower.includes('delay') ||
      transcript.includes('ఆలస్యం');

    const isCompletedQuery =
      lower.includes('completed') ||
      lower.includes('done') ||
      lower.includes('finish') ||
      transcript.includes('పూర్తయిన');

    const todoWhere: any = { userId, organizationId: orgId };
    let viewParam = 'all';

    if (isTodayQuery) {
      todoWhere.dueDate = { gte: startOfToday, lte: endOfToday };
      viewParam = 'today';
    } else if (isTomorrowQuery) {
      todoWhere.dueDate = { gte: startOfTomorrow, lte: endOfTomorrow };
      viewParam = 'upcoming';
    } else if (isOverdueQuery) {
      todoWhere.dueDate = { lt: startOfToday };
      todoWhere.status = 'PENDING';
      viewParam = 'overdue';
    }

    if (isCompletedQuery) {
      todoWhere.status = 'COMPLETED';
      viewParam = 'completed';
    } else if (!isOverdueQuery && !lower.includes('all')) {
      todoWhere.status = 'PENDING';
    }

    const totalTodoCount = await prisma.todo.count({ where: todoWhere });
    const todos = await prisma.todo.findMany({
      where: todoWhere,
      include: {
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 10,
    });

    const suggestedRoute = viewParam !== 'all' ? `/todo?view=${viewParam}` : '/todo';

    if (todos.length === 0) {
      // Check whether user/org has tasks in the task module so we can clearly distinguish
      const orgTasksCount = await prisma.task.count({
        where: { organizationId: orgId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      });

      let emptySummary = isTelugu
        ? 'ఈ ఫిల్టర్‌కు సరిపోయే టు-డూ అంశాలు మీ వద్ద ప్రస్తుతం ఏవీ లేవు.'
        : "You don't have any To-Do items matching this filter right now.";

      if (orgTasksCount > 0) {
        emptySummary += isTelugu
          ? ` (గమనిక: టాస్క్ మాడ్యూల్‌లో ${orgTasksCount} క్లయింట్ కంప్లయన్స్ పనులు ఉన్నాయి. వాటిని చూడటానికి 'Show my pending tasks' అని అడగండి.)`
          : ` (Note: You have ${orgTasksCount} client compliance tasks in the Tasks module. Ask "Show my pending tasks" or open Tasks to view them.)`;
      }

      return {
        intent: 'SHOW_TODOS',
        category: 'READ',
        summary: emptySummary,
        speechText: isTelugu
          ? 'మీ టు-డూ లిస్ట్‌లో ఎటువంటి అంశాలు లేవు.'
          : "You don't have any To-Do items matching this filter right now.",
        requiresConfirmation: false,
        suggestedRoute,
        data: {
          items: [],
          totalCount: 0,
          displayedCount: 0,
          hasMore: false,
        },
      };
    }

    const summaryList = todos
      .map(t => `"${t.title}" (${t.category}${t.dueDate ? `, Due: ${new Date(t.dueDate).toLocaleDateString(isTelugu ? 'te-IN' : 'en-IN')}` : ''})`)
      .join('; ');

    const speechText = isTelugu
      ? `మీకు ${totalTodoCount} టు-డూ అంశాలు ఉన్నాయి. మొదటిది: "${todos[0].title}".`
      : `You have ${totalTodoCount} To-Do item${totalTodoCount > 1 ? 's' : ''}. Top item is "${todos[0].title}".`;

    return {
      intent: 'SHOW_TODOS',
      category: 'READ',
      summary: isTelugu
        ? `మీకు ${totalTodoCount} టు-డూ అంశాలు ఉన్నాయి: ${summaryList}`
        : `You have ${totalTodoCount} To-Do item${totalTodoCount > 1 ? 's' : ''}: ${summaryList}`,
      speechText,
      requiresConfirmation: false,
      suggestedRoute,
      data: {
        items: todos,
        totalCount: totalTodoCount,
        displayedCount: todos.length,
        hasMore: totalTodoCount > todos.length,
      },
    };
  }

  // 8. TASK MANAGEMENT & WORKFLOW
  if (
    !isTodoIntent &&
    (
      forcedContextIntent === 'SHOW_TASKS' ||
      lower.includes('task') ||
      lower.includes('panulu') ||
      lower.includes('pani') ||
      lower.includes('kaam') ||
      transcript.includes('టాస్క్') ||
      transcript.includes('పనుల') ||
      transcript.includes('పనులు') ||
      transcript.includes('పని')
    )
  ) {
    // A. CREATE TASK
    if (
      lower.startsWith('create ') ||
      lower.includes('create task') ||
      lower.includes('assign a task') ||
      lower.includes('new task') ||
      lower.includes('task banao') ||
      lower.includes('task create cheyi') ||
      lower.includes('task cheyi')
    ) {
      // Find client in prompt (matching full name or base company name)
      const allClients = await prisma.client.findMany({
        where: { organizationId: orgId, status: 'ACTIVE' },
        select: { id: true, name: true },
      });

      let matchedClient = allClients.find(c => {
        const cLower = c.name.toLowerCase();
        const baseName = cLower.replace(/\s+(pvt|ltd|private|limited|llp|firm|co|company)\.?/gi, '').trim();
        return lower.includes(cLower) || (baseName.length > 2 && lower.includes(baseName));
      });

      // Context resolution: support "this client" or default active client
      if (!matchedClient && (lower.includes('this client') || lower.includes('client') || lower.includes('e client'))) {
        matchedClient = allClients[0] || null;
      }

      // If client not matched, prompt clarification
      if (!matchedClient) {
        return {
          intent: 'CREATE_TASK',
          category: 'CLARIFICATION',
          summary: isTelugu
            ? 'ఈ టాస్క్ ఏ క్లయింట్ కొరకు? దయచేసి క్లయింట్ పేరు పేర్కొనండి.'
            : 'Which client is this task for? Please specify the client name.',
          speechText: isTelugu
            ? 'ఈ టాస్క్ ఏ క్లయింట్ కొరకు? ఉదాహరణకు ' + allClients.slice(0, 3).map(c => c.name).join(', ') + '.'
            : 'Which client is this task for? I found clients such as ' + allClients.slice(0, 3).map(c => c.name).join(', ') + '.',
          requiresConfirmation: false,
          clarificationOptions: allClients.slice(0, 5).map(c => c.name),
        };
      }

      // Find staff assignee in prompt
      const allStaff = await prisma.user.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, fullName: true, role: true },
      });

      const matchedStaff = allStaff.find(s => {
        const sLower = s.fullName.toLowerCase();
        const firstName = sLower.split(' ')[0];
        return lower.includes(sLower) || (firstName.length > 2 && lower.includes(firstName));
      });

      const currentYear = new Date().getFullYear();
      let taskTitle = 'Statutory GST Return Compliance Filing';
      if (lower.includes('gst')) taskTitle = `Statutory GST Return Filing ${currentYear}`;
      else if (lower.includes('tds')) taskTitle = 'Quarterly TDS Return & Form 26Q';
      else if (lower.includes('audit')) taskTitle = `Annual Statutory Financial Audit ${currentYear}`;
      else if (lower.includes('roc')) taskTitle = 'ROC Annual Filing & Compliance';

      const assignedUserId = matchedStaff ? matchedStaff.id : user.id;
      const assignedName = matchedStaff ? matchedStaff.fullName : user.fullName;

      const token = generateConfirmationToken({
        actionType: 'CREATE_TASK',
        title: taskTitle,
        clientId: matchedClient.id,
        assignedUserIds: [assignedUserId],
        priority: lower.includes('urgent') || lower.includes('high') ? 'HIGH' : 'MEDIUM',
        dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
        userId: user.id,
        orgId,
        isTelugu,
      });

      return {
        intent: 'CREATE_TASK',
        category: 'WRITE',
        summary: isTelugu
          ? `"${matchedClient.name}" కొరకు "${taskTitle}" టాస్క్‌ను ${assignedName} గారికి కేటాయించమంటారా?`
          : `Create task "${taskTitle}" for client "${matchedClient.name}" assigned to ${assignedName}?`,
        speechText: isTelugu
          ? `"${matchedClient.name}" కొరకు "${taskTitle}" టాస్క్ సిద్ధంగా ఉంది. దీనిని ${assignedName} గారికి కేటాయించమంటారా? నిర్ధారించండి.`
          : `Ready to create "${taskTitle}" for "${matchedClient.name}" assigned to ${assignedName}. Due in 3 days. Please say Confirm or click to proceed.`,
        requiresConfirmation: true,
        confirmationToken: token,
        actionDetails: {
          title: taskTitle,
          client: matchedClient.name,
          assignee: assignedName,
          priority: 'MEDIUM',
          dueDate: new Date(Date.now() + 86400000 * 3).toLocaleDateString('en-IN'),
        },
      };
    }

    // B. ASSIGN TASK TO EMPLOYEE
    if (lower.includes('assign ') || lower.includes('assign it to') || lower.includes('assign cheyi') || lower.includes('assign karo')) {
      const allStaff = await prisma.user.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, fullName: true },
      });

      const matchedStaff = allStaff.find(s => lower.includes(s.fullName.toLowerCase().split(' ')[0]));

      if (!matchedStaff) {
        return {
          intent: 'ASSIGN_TASK',
          category: 'CLARIFICATION',
          summary: isTelugu
            ? 'ఈ టాస్క్‌ను మన టీమ్‌లో ఎవరికి అసైన్ చేయాలి?'
            : 'Who should this task be assigned to?',
          speechText: isTelugu
            ? 'ఈ టాస్క్‌ను మన టీమ్‌లో ఎవరికి అసైన్ చేయాలి? ఉదాహరణకు: ' + allStaff.map(s => s.fullName).join(', ') + '.'
            : 'Which team member should I assign this to? Options include: ' + allStaff.map(s => s.fullName).join(', ') + '.',
          requiresConfirmation: false,
          clarificationOptions: allStaff.map(s => s.fullName),
        };
      }

      // Find relevant task
      const activeTasks = await prisma.task.findMany({
        where: { organizationId: orgId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      });

      if (activeTasks.length === 0) {
        return {
          intent: 'ASSIGN_TASK',
          category: 'READ',
          summary: isTelugu
            ? 'అసైన్ చేయడానికి యాక్టివ్ టాస్క్‌లు ఏవీ అందుబాటులో లేవు.'
            : 'No active tasks available to assign.',
          speechText: isTelugu
            ? 'అసైన్ చేయడానికి ఎటువంటి ఓపెన్ టాస్క్‌లు లేవు.'
            : 'There are no open tasks currently available for assignment.',
          requiresConfirmation: false,
        };
      }

      const targetTask = activeTasks[0];
      const token = generateConfirmationToken({
        actionType: 'ASSIGN_TASK',
        taskId: targetTask.id,
        userId: matchedStaff.id,
        orgId,
        isTelugu,
      });

      return {
        intent: 'ASSIGN_TASK',
        category: 'WRITE',
        summary: isTelugu
          ? `"${targetTask.title}" టాస్క్‌ను ${matchedStaff.fullName} గారికి అసైన్ చేయమంటారా?`
          : `Assign task "${targetTask.title}" to ${matchedStaff.fullName}?`,
        speechText: isTelugu
          ? `"${targetTask.title}" టాస్క్‌ను ${matchedStaff.fullName} గారికి అసైన్ చేయమంటారా? దయచేసి నిర్ధారించండి.`
          : `Shall I assign "${targetTask.title}" to ${matchedStaff.fullName}? Please confirm to update.`,
        requiresConfirmation: true,
        confirmationToken: token,
        actionDetails: {
          task: targetTask.title,
          assignee: matchedStaff.fullName,
        },
      };
    }

    // C. LIST / SHOW TASKS (Default for task queries)
    const whereClause: any = { organizationId: orgId };

    const isTomorrowTask =
      lower.includes('tomorrow') ||
      lower.includes('repu') ||
      lower.includes('aane wala kal') ||
      transcript.includes('రేపు');

    if (lower.includes('overdue') || lower.includes('delay') || lower.includes('delayed') || transcript.includes('ఆలస్యం')) {
      whereClause.status = { notIn: ['COMPLETED', 'CANCELLED'] };
      whereClause.dueDate = { lt: new Date() };
    } else if (isTomorrowTask) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const startOfDay = new Date(tomorrow);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(tomorrow);
      endOfDay.setHours(23, 59, 59, 999);
      whereClause.dueDate = { gte: startOfDay, lte: endOfDay };
    } else if (
      lower.includes('today') ||
      lower.includes('e roju') ||
      lower.includes('eroju') ||
      lower.includes('aaj') ||
      transcript.includes('ఈ రోజు') ||
      transcript.includes('ఈరోజు')
    ) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      whereClause.dueDate = { gte: startOfDay, lte: endOfDay };
    } else if (lower.includes('completed') || lower.includes('done') || lower.includes('finish') || transcript.includes('పూర్తయిన')) {
      whereClause.status = 'COMPLETED';
    } else {
      whereClause.status = { notIn: ['COMPLETED', 'CANCELLED'] };
    }

    // Scope tasks according to role
    if (user.role === RoleType.CLIENT) {
      if (!user.clientId) {
        return {
          intent: 'SHOW_TASKS',
          category: 'READ',
          summary: isTelugu ? 'మీ క్లయింట్ ప్రొఫైల్ వివరాలు లేవు.' : 'No client profile linked.',
          speechText: isTelugu ? 'మీ క్లయింట్ ప్రొఫైల్ అనుసంధానించబడలేదు.' : 'No client profile is linked to your account.',
          requiresConfirmation: false,
          data: [],
        };
      }
      whereClause.clientId = user.clientId;
    } else if (user.role === RoleType.EMPLOYEE) {
      whereClause.assignments = { some: { userId: user.id } };
    } else if (lower.includes('my pending') || lower.includes('assigned to me') || transcript.includes('నా పెండింగ్')) {
      // Check if current user has assigned tasks; if so, scope to theirs
      const myCount = await prisma.task.count({
        where: { ...whereClause, assignments: { some: { userId: user.id } } },
      });
      if (myCount > 0) {
        whereClause.assignments = { some: { userId: user.id } };
      }
    }

    if (lower.includes('gst')) {
      whereClause.OR = [
        { title: { contains: 'GST', mode: 'insensitive' } },
        { service: { name: { contains: 'GST', mode: 'insensitive' } } },
      ];
    }

    const totalTaskCount = await prisma.task.count({ where: whereClause });
    const isTodayTask =
      lower.includes('today') ||
      lower.includes('e roju') ||
      lower.includes('eroju') ||
      lower.includes('aaj') ||
      transcript.includes('ఈ రోజు') ||
      transcript.includes('ఈరోజు');
    const isOverdue =
      lower.includes('overdue') ||
      lower.includes('delay') ||
      lower.includes('delayed') ||
      transcript.includes('ఆలస్యం');
    const isCompleted =
      lower.includes('completed') ||
      lower.includes('done') ||
      lower.includes('finish') ||
      transcript.includes('పూర్తయిన');

    const targetLabel = isTomorrowTask
      ? (isTelugu ? 'రేపు' : 'tomorrow')
      : isTodayTask
      ? (isTelugu ? 'ఈరోజు' : 'today')
      : isOverdue
      ? (isTelugu ? 'గడువు ముగిసిన' : 'overdue')
      : isCompleted
      ? (isTelugu ? 'పూర్తయిన' : 'completed')
      : (isTelugu ? 'పెండింగ్' : 'pending');

    const timeQualifier = isTodayTask
      ? ' for today'
      : isTomorrowTask
      ? ' for tomorrow'
      : isOverdue
      ? ' that are overdue'
      : '';
    const timeQualifierTe = isTodayTask
      ? ' నేడు'
      : isTomorrowTask
      ? ' రేపు'
      : isOverdue
      ? ' గడువు ముగిసిన'
      : '';

    if (totalTaskCount === 0) {
      return {
        intent: 'SHOW_TASKS',
        category: 'READ',
        summary: isTelugu
          ? `${targetLabel} గడువు ముగిసే పెండింగ్ టాస్క్‌లు ఏవీ లేవు. అన్ని పనులు సమయానికి పూర్తి చేయబడ్డాయి!`
          : `You have 0 pending tasks${timeQualifier}. Great job keeping up with your deadlines!`,
        speechText: isTelugu
          ? `${targetLabel} ఎటువంటి పెండింగ్ పనులు లేవు.`
          : `You have no pending tasks${timeQualifier}. All work is up to date!`,
        requiresConfirmation: false,
        suggestedRoute: '/tasks',
        data: { items: [], totalCount: 0, displayedCount: 0, hasMore: false },
      };
    }

    let taskLimit = 10;
    const taskCountMatch = lower.match(/(\d+)\s*(?:tasks?|పనులు|టాస్క్)/);
    if (taskCountMatch && taskCountMatch[1]) {
      const parsed = parseInt(taskCountMatch[1], 10);
      if (!isNaN(parsed) && parsed > 0) taskLimit = Math.min(parsed, 100);
    } else if (lower.includes('all') || transcript.includes('అన్ని') || transcript.includes('మొత్తం')) {
      taskLimit = Math.min(Math.max(totalTaskCount, 1), 100);
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        client: { select: { name: true } },
        assignments: { include: { user: { select: { fullName: true } } } },
      },
      orderBy: { dueDate: 'asc' },
      take: taskLimit,
    });

    const displayedTaskCount = tasks.length;
    const hasMoreTasks = totalTaskCount > displayedTaskCount;

    const summaryList = tasks
      .map(t => `"${t.title}" (${t.client?.name || 'General'}, Due: ${new Date(t.dueDate).toLocaleDateString(isTelugu ? 'te-IN' : 'en-IN')})`)
      .join('; ');

    const speech = isTelugu
      ? `మొత్తం ${totalTaskCount} పెండింగ్ టాస్క్‌లు ఉన్నాయి${timeQualifierTe}. ముఖ్యమైనది: "${tasks[0].title}", క్లయింట్: ${tasks[0].client?.name || 'జనరల్'}, గడువు తేదీ: ${new Date(tasks[0].dueDate).toLocaleDateString('te-IN')}.`
      : `You have ${totalTaskCount} pending task${totalTaskCount > 1 ? 's' : ''}${timeQualifier}. Top priority is "${tasks[0].title}" for ${tasks[0].client?.name || 'General'}, due on ${new Date(tasks[0].dueDate).toLocaleDateString('en-IN')}.`;

    return {
      intent: 'SHOW_TASKS',
      category: 'READ',
      summary: isTelugu
        ? `పెండింగ్ టాస్క్‌లు (${displayedTaskCount}/${totalTaskCount})${timeQualifierTe}: ${summaryList}`
        : `You have ${totalTaskCount} pending task${totalTaskCount > 1 ? 's' : ''}${timeQualifier}. Here are the details: ${summaryList}`,
      speechText: speech,
      requiresConfirmation: false,
      suggestedRoute: '/tasks',
      data: {
        items: tasks,
        totalCount: totalTaskCount,
        displayedCount: displayedTaskCount,
        hasMore: hasMoreTasks,
      },
    };
  }

  // 9. DEFAULT / CONVERSATIONAL ASSISTANT FALLBACK
  const conversationalFallback = await getConversationalAnswer(
    transcript,
    (history || []) as any,
    resolvedLang,
    {
      fullName: user.fullName,
      role: user.role,
      organizationId: orgId,
      organizationName: user.organization?.name,
    }
  );

  return {
    intent: 'CONVERSATION',
    category: 'HELP',
    summary: conversationalFallback.summary,
    speechText: conversationalFallback.speechText,
    requiresConfirmation: false,
    clarificationOptions: isTelugu
      ? [
          'ఈ రోజు పెండింగ్ పనులను చూపించు',
          'నా ఈ రోజు హాజరును చెక్ చేయి',
          'చెల్లించని ఇన్‌వాయిస్‌లు చూపించు',
          'ఈ నెలలో ముగిసే రెన్యూవల్స్ చూపించు',
        ]
      : [
          "Show today's pending tasks",
          "Check my attendance for today",
          'Find unpaid invoices',
          'Show my clients',
          'Open Finance',
        ],
  };
}

// =========================================================================
// ENDPOINTS
// =========================================================================

/**
 * POST /api/voice/process
 * Accepts natural-language transcript, parses intent, executes read-only actions,
 * or prepares signed confirmation token for consequential write actions.
 */
// Rate-limited process endpoint
router.post('/process', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { transcript, language, context, history } = processSchema.parse(req.body);

    const result = await parseAndExecuteVoiceCommand(transcript, req.user, language, context, history);

    // Record in AuditLog for compliance
    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        entityType: 'VoiceCommand',
        entityId: crypto.randomUUID(),
        action: result.requiresConfirmation ? 'PROPOSED' : 'EXECUTED',
        changesJson: JSON.stringify({
          transcript,
          language,
          intent: result.intent,
          category: result.category,
          requiresConfirmation: result.requiresConfirmation,
        }),
      },
    }).catch(() => {});

    const isTelugu =
      language === 'te-IN' ||
      /[\u0C00-\u0C7F]/.test(transcript) ||
      result.language === 'te-IN';
    const resolvedLang = isTelugu ? 'te-IN' : language;

    res.json({
      success: true,
      ...result,
      groundedData: result.data || null,
      language: resolvedLang,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/voice/confirm
 * Safely executes consequential actions after explicit human confirmation.
 * Protected against: cross-user reuse, replay attacks, and expired tokens.
 */
router.post('/confirm', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { confirmationToken, action } = confirmSchema.parse(req.body);

    const payload = verifyConfirmationToken(confirmationToken);
    const isTelugu = Boolean(payload.isTelugu || payload.language === 'te-IN');

    // 1. Anti-Replay: check if nonce was already executed
    if (usedConfirmationNonces.has(payload.nonce)) {
      res.status(400).json({
        success: false,
        message: 'Confirmation token has already been executed (replay attack prevented)',
      });
      return;
    }

    // 2. User Context Binding: token cannot be confirmed by another user
    if (payload.userId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied: Confirmation token belongs to another user',
      });
      return;
    }

    if (action === 'CANCEL') {
      usedConfirmationNonces.add(payload.nonce);
      res.json({
        success: true,
        status: 'CANCELLED',
        speechText: isTelugu ? 'చర్య రద్దు చేయబడింది. నేను మీకు ఇంకా ఎలా సహాయపడగలను?' : 'Action cancelled. How else can I assist you?',
        summary: isTelugu ? 'చర్య రద్దు చేయబడింది.' : 'Action was cancelled by the user.',
        language: isTelugu ? 'te-IN' : 'en-IN',
      });
      return;
    }

    // 3. Verify Organization Isolation
    if (payload.orgId !== req.user!.organizationId) {
      res.status(403).json({ success: false, message: 'Organization scope mismatch' });
      return;
    }

    // Mark nonce as used
    usedConfirmationNonces.add(payload.nonce);

    let executionResult: any = null;
    let spokenResponse = 'Action completed successfully.';
    let summaryText = 'Executed successfully.';

    // Execute based on actionType
    switch (payload.actionType) {
      case 'CREATE_TASK': {
        const newTask = await prisma.task.create({
          data: {
            organizationId: payload.orgId,
            clientId: payload.clientId,
            title: payload.title,
            priority: payload.priority as Priority,
            dueDate: new Date(payload.dueDate),
            status: TaskStatus.PENDING,
            assignments: {
              create: (payload.assignedUserIds || []).map((uid: string) => ({
                userId: uid,
              })),
            },
            statusHistory: {
              create: {
                fromStatus: TaskStatus.PENDING,
                toStatus: TaskStatus.PENDING,
                remarks: 'Created via CAFlow AI Voice Assistant',
                changedById: req.user!.id,
              },
            },
          },
          include: { client: { select: { name: true } } },
        });

        executionResult = newTask;
        summaryText = isTelugu
          ? `"${newTask.title}" టాస్క్ క్లయింట్ ${newTask.client?.name || ''} కొరకు విజయవంతంగా సృష్టించబడింది.`
          : `Task "${newTask.title}" created for ${newTask.client?.name || 'client'}.`;
        spokenResponse = isTelugu
          ? `"${newTask.title}" టాస్క్ విజయవంతంగా సృష్టించబడింది.`
          : `Created task: "${newTask.title}" successfully.`;
        break;
      }

      case 'ASSIGN_TASK': {
        await prisma.taskAssignment.deleteMany({ where: { taskId: payload.taskId } });
        const assignment = await prisma.taskAssignment.create({
          data: { taskId: payload.taskId, userId: payload.userId },
          include: { user: { select: { fullName: true } }, task: { select: { title: true } } },
        });

        executionResult = assignment;
        summaryText = isTelugu
          ? `"${assignment.task.title}" టాస్క్ ${assignment.user.fullName} గారికి అసైన్ చేయబడింది.`
          : `Assigned task "${assignment.task.title}" to ${assignment.user.fullName}.`;
        spokenResponse = isTelugu
          ? `టాస్క్ ${assignment.user.fullName} గారికి విజయవంతంగా కేటాయించబడింది.`
          : `Assigned "${assignment.task.title}" to ${assignment.user.fullName}.`;
        break;
      }

      case 'ATTENDANCE_CHECK_IN': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const rec = await prisma.attendanceRecord.upsert({
          where: {
            userId_date: {
              userId: payload.userId,
              date: today,
            },
          },
          update: { checkInTime: new Date() },
          create: {
            organizationId: payload.orgId,
            userId: payload.userId,
            date: today,
            checkInTime: new Date(),
          },
        });

        await prisma.attendanceEvent.create({
          data: {
            attendanceRecordId: rec.id,
            eventType: 'CHECK_IN',
            timestamp: new Date(),
          },
        });

        executionResult = rec;
        summaryText = isTelugu
          ? `${req.user!.fullName} గారి హాజరు చెక్-ఇన్ సమయం ${new Date().toLocaleTimeString('te-IN')} కు నమోదు చేయబడింది.`
          : `Attendance check-in logged for ${req.user!.fullName} at ${new Date().toLocaleTimeString('en-IN')}.`;
        spokenResponse = isTelugu
          ? `${req.user!.fullName} గారి హాజరు చెక్-ఇన్ విజయవంతంగా నమోదైంది.`
          : `Check-in recorded successfully for ${req.user!.fullName}.`;
        break;
      }

      case 'ATTENDANCE_CHECK_OUT': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const rec = await prisma.attendanceRecord.findFirst({
          where: {
            organizationId: payload.orgId,
            userId: payload.userId,
            date: { gte: today },
          },
        });

        if (rec) {
          const now = new Date();
          const checkIn = rec.checkInTime ? new Date(rec.checkInTime) : now;
          const mins = Math.max(0, Math.floor((now.getTime() - checkIn.getTime()) / 60000));

          const updated = await prisma.attendanceRecord.update({
            where: { id: rec.id },
            data: {
              checkOutTime: now,
              totalWorkingMinutes: mins,
            },
          });

          await prisma.attendanceEvent.create({
            data: {
              attendanceRecordId: rec.id,
              eventType: 'CHECK_OUT',
              timestamp: now,
            },
          });

          executionResult = updated;
          summaryText = isTelugu
            ? `హాజరు చెక్-అవుట్ నమోదు చేయబడింది. మొత్తం సమయం: ${mins} నిమిషాలు.`
            : `Attendance check-out logged. Total duration: ${mins} minutes.`;
          spokenResponse = isTelugu
            ? `చెక్-అవుట్ నమోదైంది. ఈ రోజు మీరు మొత్తం ${mins} నిమిషాలు పనిచేశారు.`
            : `Check-out recorded. You logged ${mins} minutes today.`;
        } else {
          summaryText = isTelugu ? 'ఈ రోజుకు చెక్-ఇన్ రికార్డు కనిపించలేదు.' : 'No check-in record found for today to check out from.';
          spokenResponse = isTelugu ? 'మీరు ఈ రోజు ఇంకా చెక్-ఇన్ చేయలేదు.' : 'You have not checked in today yet.';
        }
        break;
      }

      case 'CREATE_TODO': {
        const todo = await prisma.todo.create({
          data: {
            organizationId: payload.orgId,
            userId: payload.userId,
            title: payload.title,
            priority: Priority.MEDIUM,
          },
        });

        executionResult = todo;
        summaryText = isTelugu
          ? `వ్యక్తిగత టు-డూ జోడించబడింది: "${todo.title}".`
          : `Added personal to-do: "${todo.title}".`;
        spokenResponse = isTelugu
          ? `మీ టు-డూ లిస్ట్‌లో "${todo.title}" విజయవంతంగా జోడించబడింది.`
          : `Added "${todo.title}" to your to-do list.`;
        break;
      }

      case 'CREATE_CLIENT': {
        const canCreate = (
          [
            RoleType.FIRM_OWNER,
            RoleType.FIRM_ADMIN,
            RoleType.MANAGER,
            RoleType.TAX_PROFESSIONAL,
          ] as RoleType[]
        ).includes(req.user!.role);
        if (!canCreate) {
          throw new Error('Access denied: You do not have permission to add new clients.');
        }

        const existing = await prisma.client.findFirst({
          where: {
            organizationId: payload.orgId,
            name: { equals: payload.name, mode: 'insensitive' },
          },
        });
        if (existing) {
          throw new Error(`Client "${payload.name}" already exists in your office database.`);
        }

        let resolvedClientType = 'PRIVATE_LIMITED';
        if (payload.clientType === 'PROPRIETORSHIP' || payload.clientType === 'SOLE_PROPRIETORSHIP') {
          resolvedClientType = 'SOLE_PROPRIETORSHIP';
        } else if (payload.clientType === 'PARTNERSHIP' || payload.clientType === 'PARTNERSHIP_FIRM') {
          resolvedClientType = 'PARTNERSHIP_FIRM';
        } else if (['INDIVIDUAL', 'LLP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'TRUST', 'OTHER'].includes(payload.clientType)) {
          resolvedClientType = payload.clientType;
        }

        const newClient = await prisma.client.create({
          data: {
            organizationId: payload.orgId,
            name: payload.name,
            clientType: resolvedClientType as any,
            primaryContact: payload.primaryContact || payload.name,
            mobile: payload.mobile || null,
            email: payload.email || null,
            pan: payload.pan || null,
            gstin: payload.gstin || null,
            address: payload.address || null,
            status: 'ACTIVE',
          },
        });

        executionResult = newClient;
        summaryText = isTelugu
          ? `కొత్త క్లయింట్ "${newClient.name}" విజయవంతంగా సృష్టించబడింది.`
          : `Client "${newClient.name}" has been successfully created.`;
        spokenResponse = isTelugu
          ? `క్లయింట్ "${newClient.name}" విజయవంతంగా నమోదైంది.`
          : `Successfully created client "${newClient.name}".`;
        break;
      }

      case 'CREATE_RENEWAL': {
        if (req.user!.role === RoleType.CLIENT) {
          throw new Error('Access denied: Clients cannot create renewal records.');
        }

        const newRenewal = await prisma.renewal.create({
          data: {
            organizationId: payload.orgId,
            clientId: payload.clientId,
            renewalType: payload.renewalType,
            licenseNumber: payload.licenseNumber || null,
            expiryDate: new Date(payload.expiryDate),
            assignedUserId: payload.assignedUserId || null,
            reminderDays: payload.reminderDays || 30,
            notes: payload.notes || 'Created via CAFlow AI Voice Assistant',
            status: 'ACTIVE',
          },
          include: { client: { select: { name: true } } },
        });

        executionResult = newRenewal;
        summaryText = isTelugu
          ? `క్లయింట్ ${newRenewal.client.name} కొరకు "${newRenewal.renewalType}" రెన్యూవల్ విజయవంతంగా నమోదు చేయబడింది.`
          : `Renewal "${newRenewal.renewalType}" for client ${newRenewal.client.name} has been successfully created.`;
        spokenResponse = isTelugu
          ? `రెన్యూవల్ విజయవంతంగా సేవ్ చేయబడింది.`
          : `Created renewal "${newRenewal.renewalType}" for ${newRenewal.client.name} successfully.`;
        break;
      }

      default:
        throw new Error(`Unsupported action type: ${payload.actionType}`);
    }

    // Audit Log for confirmed execution
    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        entityType: 'VoiceCommand',
        entityId: payload.taskId || payload.clientId || req.user!.id,
        action: 'CONFIRMED_EXECUTION',
        changesJson: JSON.stringify({
          actionType: payload.actionType,
          summary: summaryText,
        }),
      },
    }).catch(() => {});

    // Invalidate live knowledge cache so voice agent immediately trains on fresh state
    invalidateKnowledgeCache(payload.orgId);

    res.json({
      success: true,
      status: 'EXECUTED',
      summary: summaryText,
      speechText: spokenResponse,
      language: isTelugu ? 'te-IN' : 'en-IN',
      data: executionResult,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err?.message || 'Failed to execute confirmed action',
    });
  }
});

/**
 * GET /api/voice/history
 * Lists the authenticated user's recent voice command logs.
 */
router.get('/history', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        entityType: 'VoiceCommand',
      },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });

    const parsed = logs.map(l => {
      let details: any = {};
      try {
        details = JSON.parse(l.changesJson || '{}');
      } catch {}
      return {
        id: l.id,
        action: l.action,
        timestamp: l.timestamp,
        transcript: details.transcript || l.action,
        intent: details.intent,
        summary: details.summary,
      };
    });

    res.json({ success: true, history: parsed });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/voice/history
 * Clears voice command audit history for privacy control.
 */
router.delete('/history', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.auditLog.deleteMany({
      where: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        entityType: 'VoiceCommand',
      },
    });

    res.json({ success: true, message: 'Voice history deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// Configure memory storage for incoming audio clips
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
});

/**
 * POST /api/voice/stt
 * High-accuracy Indian Speech-to-Text via Sarvam AI (Saaras)
 */
router.post('/stt', authenticateToken, audioUpload.single('audio'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sarvamKey = process.env.SARVAM_API_KEY;
    if (!sarvamKey) {
      res.status(503).json({
        success: false,
        message: 'Sarvam AI STT not configured. Using client Web Speech API fallback.',
      });
      return;
    }

    if (!req.file || !req.file.buffer) {
      res.status(400).json({ success: false, message: 'Audio recording buffer is required' });
      return;
    }

    const languageCode = (req.body.language as string) || 'en-IN';

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype || 'audio/wav' });
    formData.append('file', blob, 'recording.wav');
    formData.append('model', 'saaras:v3');
    formData.append('language_code', languageCode);

    const sarvamRes = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': sarvamKey,
      },
      body: formData,
    });

    if (!sarvamRes.ok) {
      const errData = await sarvamRes.json().catch(() => ({}));
      throw new Error(`Sarvam STT failed: ${JSON.stringify(errData)}`);
    }

    const data = await sarvamRes.json();
    res.json({
      success: true,
      transcript: data.transcript || '',
      language_code: data.language_code || languageCode,
      provider: 'Sarvam AI (Saaras v3)',
    });
  } catch (err: any) {
    console.warn('[Sarvam STT Warning]', err?.message || err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Sarvam STT service unavailable',
    });
  }
});

/**
 * POST /api/voice/tts
 * High-accuracy Indian Text-to-Speech via Sarvam AI (Bulbul v3)
 */
router.post('/tts', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sarvamKey = process.env.SARVAM_API_KEY;
    if (!sarvamKey) {
      res.status(503).json({
        success: false,
        message: 'Sarvam AI TTS not configured. Using client SpeechSynthesis fallback.',
      });
      return;
    }

    const { text, language } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ success: false, message: 'Text string is required' });
      return;
    }

    let lang = language || 'en-IN';
    // Auto-detect Telugu Unicode characters in speech text
    if (/[\u0C00-\u0C7F]/.test(text)) {
      lang = 'te-IN';
    }

    // Map natural Indian speakers according to Bulbul v4 Flash personas
    // Telugu -> Voice: Kavitha (kavitha_te_conversation) as requested
    const requestedVoice = (req.body.speaker || req.body.voice || '').toLowerCase();
    let speaker = 'simran_en_conversation';
    if (lang === 'te-IN') {
      speaker = requestedVoice.includes('pooja') ? 'pooja_te_conversation' : 'kavitha_te_conversation';
    } else if (lang === 'hi-IN') {
      speaker = 'aditya_hi_conversational';
    } else if (lang === 'en-IN') {
      speaker = 'simran_en_conversation';
    }

    // 1. Try Cartesia AI TTS (Sonic 3.6 with voice 4418bb06-8329-49a1-bb11-53bb64ca0547)
    const cartesiaKey = process.env.CARTESIA_API_KEY;
    const cartesiaVoiceId = process.env.CARTESIA_VOICE_ID || '4418bb06-8329-49a1-bb11-53bb64ca0547';

    if (cartesiaKey) {
      try {
        const cartesiaLang = lang.startsWith('te') ? 'te' : lang.startsWith('hi') ? 'hi' : 'en';
        const cartesiaRes = await fetch('https://api.cartesia.ai/tts/bytes', {
          method: 'POST',
          headers: {
            'X-API-Key': cartesiaKey,
            'Cartesia-Version': '2024-06-10',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model_id: 'sonic-3.6',
            transcript: text.substring(0, 1000),
            voice: { mode: 'id', id: cartesiaVoiceId },
            output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 24000 },
            language: cartesiaLang,
          }),
        });

        if (cartesiaRes.ok) {
          const audioBuffer = await cartesiaRes.arrayBuffer();
          const audioBase64 = Buffer.from(audioBuffer).toString('base64');

          res.json({
            success: true,
            audioBase64,
            mimeType: 'audio/wav',
            provider: 'Cartesia AI (Sonic 3.6)',
            voiceId: cartesiaVoiceId,
            language: cartesiaLang,
          });
          return;
        } else {
          const errText = await cartesiaRes.text().catch(() => '');
          console.warn('[Cartesia TTS Error, falling back to Sarvam]', errText);
        }
      } catch (cartesiaErr) {
        console.warn('[Cartesia TTS Exception, falling back to Sarvam]', cartesiaErr);
      }
    }

    // 2. Fallback to Sarvam AI REST Stream endpoint (Bulbul v4 Flash)
    try {
      const streamRes = await fetch('https://api.sarvam.ai/text-to-speech/stream', {
        method: 'POST',
        headers: {
          'api-subscription-key': sarvamKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.substring(0, 1000),
          target_language_code: lang,
          speaker,
          model: 'bulbul:v4-flash',
        }),
      });

      if (streamRes.ok) {
        const audioBuffer = await streamRes.arrayBuffer();
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');

        res.json({
          success: true,
          audioBase64,
          mimeType: streamRes.headers.get('content-type') || 'audio/mpeg',
          provider: 'Sarvam AI (Bulbul v4 Flash - REST Stream)',
          speaker,
          model: 'bulbul:v4-flash',
        });
        return;
      }
    } catch (streamErr) {
      console.warn('[Sarvam REST Stream Fallback to Batch]', streamErr);
    }

    // 2. Fallback to standard Sarvam batch REST endpoint
    const sarvamRes = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'api-subscription-key': sarvamKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: [text.substring(0, 500)],
        target_language_code: lang,
        speaker,
        model: 'bulbul:v4-flash',
      }),
    });

    if (!sarvamRes.ok) {
      const errData = await sarvamRes.json().catch(() => ({}));
      throw new Error(`Sarvam TTS failed: ${JSON.stringify(errData)}`);
    }

    const data = await sarvamRes.json();
    if (!data.audios || data.audios.length === 0) {
      throw new Error('No audio returned by Sarvam TTS');
    }

    res.json({
      success: true,
      audioBase64: data.audios[0],
      mimeType: 'audio/wav',
      provider: 'Sarvam AI (Bulbul v4 Flash)',
      speaker,
      model: 'bulbul:v4-flash',
    });
  } catch (err: any) {
    console.warn('[Sarvam TTS Warning]', err?.message || err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Sarvam TTS service unavailable',
    });
  }
});

export default router;
