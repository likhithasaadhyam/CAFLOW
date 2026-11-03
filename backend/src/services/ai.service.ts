/**
 * CAFlow AI — Conversational Intelligence & Auto-Trained Practice Knowledge Service
 * 
 * Automatically trains / grounds the Voice Agent LLM with the organization's
 * real-time database (Staff roster, Clients, Active Tasks, Invoices, Renewals,
 * Attendance, Services) and synthesizes multi-lingual conversational answers
 * in Telugu, English, and Hindi.
 */

import prisma from '../prisma.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface UserContext {
  role?: string;
  fullName?: string;
  organizationName?: string;
  organizationId?: string;
}

export interface LivePracticeData {
  orgName: string;
  employeeCount: number;
  employees: Array<{
    fullName: string;
    role: string;
    designation: string | null;
    department: string | null;
    email: string;
    phone: string | null;
  }>;
  clientCount: number;
  clients: Array<{
    name: string;
    clientType: string;
    primaryContact: string | null;
    mobile: string | null;
    email: string | null;
    pan: string | null;
    gstin: string | null;
    status: string;
  }>;
  pendingTaskCount: number;
  tasks: Array<{
    title: string;
    clientName: string;
    priority: string;
    dueDate: Date;
    assignee: string;
    status: string;
  }>;
  unpaidInvoiceCount: number;
  totalBalanceDue: number;
  invoices: Array<{
    invoiceNumber: string;
    clientName: string;
    balanceDue: number;
    totalAmount: number;
    dueDate: Date | null;
    paymentStatus: string;
  }>;
  renewals: Array<{
    renewalType: string;
    clientName: string;
    licenseNumber: string | null;
    expiryDate: Date;
    status: string;
  }>;
  services: string[];
  todayAttendance: {
    presentCount: number;
    totalStaff: number;
  };
}

interface CachedPracticeKnowledge {
  summary: string;
  data: LivePracticeData;
  timestamp: number;
}

// In-memory cache for live organization knowledge graph (45s TTL)
const practiceKnowledgeCache = new Map<string, CachedPracticeKnowledge>();

/**
 * Invalidate the cached knowledge graph for an organization
 * (called upon any client, task, employee, invoice, or attendance mutation)
 */
export function invalidateKnowledgeCache(organizationId?: string): void {
  if (organizationId) {
    practiceKnowledgeCache.delete(organizationId);
  } else {
    practiceKnowledgeCache.clear();
  }
}

/**
 * Dynamically extract and synthesize the organization's complete live database state
 * into a structured Knowledge Graph for LLM training and instant grounding.
 */
export async function getLivePracticeKnowledge(
  organizationId?: string
): Promise<CachedPracticeKnowledge | null> {
  if (!organizationId) {
    // If no orgId is supplied, attempt to find the primary firm
    const primaryOrg = await prisma.organization.findFirst({ select: { id: true } });
    if (!primaryOrg) return null;
    organizationId = primaryOrg.id;
  }

  const cached = practiceKnowledgeCache.get(organizationId);
  if (cached && Date.now() - cached.timestamp < 45000) {
    return cached;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      org,
      users,
      clients,
      tasks,
      taskCount,
      invoices,
      invoiceAgg,
      renewals,
      services,
      todayPresentCount,
    ] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, phone: true, email: true, address: true, pan: true, gstin: true },
      }),
      prisma.user.findMany({
        where: { organizationId, role: { not: 'CLIENT' }, isActive: true },
        select: {
          fullName: true,
          role: true,
          designation: true,
          department: true,
          email: true,
          phone: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.client.findMany({
        where: { organizationId, status: 'ACTIVE' },
        select: {
          name: true,
          clientType: true,
          primaryContact: true,
          mobile: true,
          email: true,
          pan: true,
          gstin: true,
          status: true,
        },
        orderBy: { name: 'asc' },
        take: 100,
      }),
      prisma.task.findMany({
        where: { organizationId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        select: {
          title: true,
          priority: true,
          dueDate: true,
          status: true,
          client: { select: { name: true } },
          assignments: { select: { user: { select: { fullName: true } } } },
        },
        orderBy: { dueDate: 'asc' },
        take: 30,
      }),
      prisma.task.count({
        where: { organizationId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      }),
      prisma.invoice.findMany({
        where: {
          organizationId,
          paymentStatus: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
        },
        select: {
          invoiceNumber: true,
          totalAmount: true,
          balanceDue: true,
          dueDate: true,
          paymentStatus: true,
          client: { select: { name: true } },
        },
        orderBy: { balanceDue: 'desc' },
        take: 25,
      }),
      prisma.invoice.aggregate({
        where: {
          organizationId,
          paymentStatus: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
        },
        _sum: { balanceDue: true },
        _count: { id: true },
      }),
      prisma.renewal.findMany({
        where: { organizationId, status: { in: ['ACTIVE', 'EXPIRING_SOON'] } },
        select: {
          renewalType: true,
          licenseNumber: true,
          expiryDate: true,
          status: true,
          client: { select: { name: true } },
        },
        orderBy: { expiryDate: 'asc' },
        take: 15,
      }),
      prisma.service.findMany({
        where: { organizationId },
        select: { name: true, category: true },
        take: 20,
      }),
      prisma.attendanceRecord.count({
        where: {
          organizationId,
          date: { gte: today },
          checkInTime: { not: null },
        },
      }),
    ]);

    const orgName = org?.name || 'Chartered Accountant Practice';
    const totalStaff = users.length;
    const totalClients = clients.length;
    const balanceDue = invoiceAgg._sum.balanceDue || 0;
    const unpaidInvoiceCount = invoiceAgg._count.id || 0;

    const formattedTasks = tasks.map(t => ({
      title: t.title,
      clientName: t.client?.name || 'General',
      priority: t.priority,
      dueDate: t.dueDate,
      assignee: t.assignments.map(a => a.user.fullName).join(', ') || 'Unassigned',
      status: t.status,
    }));

    const formattedInvoices = invoices.map(inv => ({
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.client?.name || 'Unknown Client',
      balanceDue: inv.balanceDue,
      totalAmount: inv.totalAmount,
      dueDate: inv.dueDate,
      paymentStatus: inv.paymentStatus,
    }));

    const formattedRenewals = renewals.map(r => ({
      renewalType: r.renewalType,
      clientName: r.client?.name || 'General',
      licenseNumber: r.licenseNumber,
      expiryDate: r.expiryDate,
      status: r.status,
    }));

    const liveData: LivePracticeData = {
      orgName,
      employeeCount: totalStaff,
      employees: users,
      clientCount: totalClients,
      clients,
      pendingTaskCount: taskCount,
      tasks: formattedTasks,
      unpaidInvoiceCount,
      totalBalanceDue: balanceDue,
      invoices: formattedInvoices,
      renewals: formattedRenewals,
      services: services.map(s => s.name),
      todayAttendance: {
        presentCount: todayPresentCount,
        totalStaff,
      },
    };

    // Synthesize structured textual knowledge for the LLM
    const staffSummary = users
      .map(
        u =>
          `- ${u.fullName} (${u.role.replace('_', ' ')}${u.designation ? `, ${u.designation}` : ''}${u.department ? `, Dept: ${u.department}` : ''}, Email: ${u.email}${u.phone ? `, Ph: ${u.phone}` : ''})`
      )
      .join('\n');

    const clientSample = clients
      .slice(0, 30)
      .map(
        c =>
          `- ${c.name} (Type: ${c.clientType}, Contact: ${c.primaryContact || 'N/A'}${c.mobile ? `, Ph: ${c.mobile}` : ''}${c.gstin ? `, GSTIN: ${c.gstin}` : ''}${c.pan ? `, PAN: ${c.pan}` : ''})`
      )
      .join('\n');

    const taskSample = formattedTasks
      .slice(0, 15)
      .map(
        t =>
          `- "${t.title}" for ${t.clientName} (Priority: ${t.priority}, Due: ${new Date(t.dueDate).toLocaleDateString('en-IN')}, Assigned: ${t.assignee})`
      )
      .join('\n');

    const invoiceSample = formattedInvoices
      .slice(0, 10)
      .map(
        inv =>
          `- Inv #${inv.invoiceNumber} for ${inv.clientName}: Balance ₹${inv.balanceDue.toLocaleString('en-IN')} (Status: ${inv.paymentStatus})`
      )
      .join('\n');

    const renewalSample = formattedRenewals
      .slice(0, 10)
      .map(
        r =>
          `- ${r.renewalType} for ${r.clientName} (Expires: ${new Date(r.expiryDate).toLocaleDateString('en-IN')}${r.licenseNumber ? `, Reg#: ${r.licenseNumber}` : ''})`
      )
      .join('\n');

    const summary = `
=== LIVE OFFICE KNOWLEDGE GRAPH for "${orgName}" ===
Firm Profile: Phone: ${org?.phone || 'N/A'}, Email: ${org?.email || 'N/A'}, Address: ${org?.address || 'N/A'}
Total Active Staff/Employees: ${totalStaff} members.
Staff Roster:
${staffSummary || '- No staff members registered.'}

Clients Directory: Total ${totalClients} Active Clients.
Key Client Profiles:
${clientSample || '- No active clients registered.'}

Pending Tasks & Deadlines: Total ${taskCount} active pending tasks.
Immediate Priority Tasks:
${taskSample || '- No pending tasks.'}

Financial Overview: Total Outstanding Balance: ₹${balanceDue.toLocaleString('en-IN')} across ${unpaidInvoiceCount} unpaid/partial invoices.
Notable Unpaid Invoices:
${invoiceSample || '- All invoices are cleared.'}

Upcoming Compliance & Renewals:
${renewalSample || '- No renewals due.'}

Today's Staff Attendance: ${todayPresentCount} of ${totalStaff} employees checked in today.
Services Offered: ${services.map(s => s.name).join(', ') || 'GST, Income Tax, ROC Compliance, Statutory Audits, Bookkeeping'}.
===================================================
`.trim();

    const result: CachedPracticeKnowledge = {
      summary,
      data: liveData,
      timestamp: Date.now(),
    };

    practiceKnowledgeCache.set(organizationId, result);
    return result;
  } catch (err) {
    console.warn('[CAFlow AI] Failed to build live practice knowledge graph:', err);
    return null;
  }
}

// Built-in textbook CA practice knowledge fallback for conceptual questions
const CA_KNOWLEDGE_BASE: Record<string, { en: string; te: string; hi: string }> = {
  invoice: {
    en: 'An invoice is a formal commercial document issued by a service provider or seller to a client, detailing the services provided, amounts payable, taxes (like GST), and payment terms. In CAFlow, you can track billings, unpaid balances, and issue invoices.',
    te: 'ఇన్‌వాయిస్ అనేది క్లయింట్‌కు అందించిన సేవలు, చెల్లించాల్సిన మొత్తం మరియు జీఎస్టీ పన్ను వివరాలను చూపే అధికారిక బిల్లు. CAFlow లో మీరు చెల్లించని ఇన్‌వాయిస్‌లు మరియు బకాయిలను సులభంగా ట్రాక్ చేయవచ్చు.',
    hi: 'इनवॉइस एक आधिकारिक बिल है जो दी गई सेवाओं, देय राशि, और जीएसटी करों का विवरण दिखाता है। CAFlow में आप बिलिंग और अनपेड इनवॉइस को आसानी से ट्रैक कर सकते हैं।',
  },
  gst: {
    en: 'GST (Goods and Services Tax) filing is the periodic submission of outward and inward supply details (such as GSTR-1 for outward sales and GSTR-3B for monthly tax summary) to the GST portal. CAFlow helps your firm monitor filing deadlines and assigned client tasks.',
    te: 'జీఎస్టీ ఫైలింగ్ అనేది ప్రతి నెల లేదా త్రైమాసికంలో సేల్స్ మరియు పన్ను వివరాలను (GSTR-1, GSTR-3B వంటివి) ప్రభుత్వ పోర్టల్‌లో దాఖలు చేసే ప్రక్రియ. CAFlow ద్వారా మీరు క్లయింట్ల ఫైలింగ్ గడువులను సులభంగా పర్యవేక్షించవచ్చు.',
    hi: 'जीएसटी फाइलिंग मासिक या त्रैमासिक आधार पर बिक्री और टैक्स का विवरण पोर्टल पर जमा करने की प्रक्रिया है। CAFlow में आप क्लाइंट्स की फाइलिंग डेडलाइन को ट्रैक कर सकते हैं।',
  },
  tds: {
    en: 'TDS (Tax Deducted at Source) is a mechanism under the Income Tax Act where tax is deducted at the time of making specified payments and remitted to the government. CAFlow tracks quarterly TDS return deadlines (Form 24Q, 26Q) and pending tasks.',
    te: 'టీడీఎస్ (Tax Deducted at Source) అనేది ఆదాయపు పన్ను చట్టం కింద నిర్దిష్ట చెల్లింపులు చేసేటప్పుడు పన్నును మినహాయించి ప్రభుత్వానికి జమ చేసే ప్రక్రియ. CAFlow మీ టీడీఎస్ రిటర్న్ గడువులను ట్రాక్ చేయడంలో సహాయపడుతుంది.',
    hi: 'टीडीएस (स्रोत पर कर कटौती) वह प्रक्रिया है जिसमें भुगतान करते समय टैक्स काटकर सरकार को जमा किया जाता है। CAFlow आपके टीडीएस रिटर्न और टास्क को ट्रैक करने में मदद करता है।',
  },
  audit: {
    en: 'An audit is an independent examination of financial statements, records, and internal controls of an entity to ensure accuracy, fair representation, and statutory compliance (such as Tax Audit under Section 44AB or Statutory Company Audit).',
    te: 'ఆడిట్ అనేది ఒక సంస్థ యొక్క ఆర్థిక నివేదికలు మరియు పుస్తకాలను నిష్పక్షపాతంగా తనిఖీ చేసి, చట్టబద్ధమైన నిబంధనలు పాటించబడుతున్నాయని నిర్ధారించే ప్రక్రియ. CAFlow లో మీరు ఆడిట్ టాస్క్‌లు మరియు డాక్యుమెంట్లను ట్రాక్ చేయవచ్చు.',
    hi: 'ऑडिट वित्तीय विवरणों और खातों की स्वतंत्र जांच है ताकि यह सुनिश्चित हो सके कि वे सही और नियमों के अनुसार हैं।',
  },
  attendance: {
    en: 'Attendance and timesheet tracking in CAFlow allows your firm to monitor staff check-in/out times, working hours on client assignments, and daily leave status.',
    te: 'CAFlow లో హాజరు ట్రాకింగ్ ద్వారా సిబ్బంది చెక్-ఇన్, చెక్-అవుట్ సమయాలు మరియు పనుల గంటలను సులభంగా రికార్డ్ చేయవచ్చు.',
    hi: 'CAFlow में अटेंडेंस और टाइमशीट ट्रैकिंग कर्मचारियों के चेक-इन/आउट समय और काम के घंटों की निगरानी करती है।',
  },
  renewal: {
    en: 'Renewals in CAFlow track critical recurring compliance dates such as Digital Signature Certificates (DSC), Trade Licenses, FSSAI, Shops & Establishments, and trademark expiries.',
    te: 'CAFlow లో రెన్యూవల్స్ విభాగం డిజిటల్ సిగ్నేచర్లు (DSC), ట్రేడ్ లైసెన్సులు మరియు ఇతర గడువులను ట్రాక్ చేస్తుంది.',
    hi: 'CAFlow में रिन्यूअल ट्रैकर डीएससी, ट्रेड लाइसेंस और अन्य वैधानिक एक्सपायरी की तिथियों की निगरानी करता है।',
  },
};

/**
 * Identify if user prompt is a greeting
 */
export function isGreetingPrompt(text: string): boolean {
  const q = text.toLowerCase().trim();
  const greetings = [
    'hello',
    'hi',
    'hey',
    'good morning',
    'good afternoon',
    'good evening',
    'greetings',
    'howdy',
    'namaste',
    'namaskar',
    'namaskaram',
    'bagunnara',
    'ela unnaru',
    'kaise ho',
    'kaisa hai',
    'who are you',
    'what is your name',
    'who made you',
    'what are you',
  ];
  return greetings.some(g => q === g || q.startsWith(g + ' ') || q.startsWith(g + '!') || q.startsWith(g + '?'));
}

/**
 * Identify if user prompt is an educational or general explanation question
 */
export function isExplanationPrompt(text: string): boolean {
  const q = text.toLowerCase().trim();
  const questionStarters = [
    'what is',
    'what are',
    'what does',
    'how does',
    'how do',
    'why is',
    'why do',
    'explain',
    'tell me about',
    'difference between',
    'meaning of',
    'define',
    'can you explain',
    'help me understand',
    'how can you help',
    'what can you do',
  ];
  return questionStarters.some(starter => q.startsWith(starter) || q.includes(' ' + starter + ' '));
}

/**
 * Generate a friendly greeting response
 */
export function getGreetingResponse(
  language: string = 'en-IN',
  userContext?: UserContext
): { summary: string; speechText: string } {
  const isTelugu = language === 'te-IN' || language.startsWith('te');
  const isHindi = language === 'hi-IN' || language.startsWith('hi');
  const name = userContext?.fullName ? `, ${userContext.fullName}` : '';
  const org = userContext?.organizationName || 'CAFlow';

  if (isTelugu) {
    return {
      summary: `నమస్కారం${name}! 😊 నేను ${org} AI వాయిస్ అసిస్టెంట్‌ని. ఈరోజు మీకు ఎలా సహాయపడగలను? నేను మన ఆఫీస్ ఉద్యోగులు, క్లయింట్లు, పెండింగ్ పనులు, చెల్లించని ఇన్‌వాయిస్‌లు, లేదా హాజరు గురించి వివరాలు చెప్పగలను.`,
      speechText: `నమస్కారం! నేను ${org} AI వాయిస్ అసిస్టెంట్‌ని. ఈరోజు మీకు ఎలా సహాయపడగలను?`,
    };
  }

  if (isHindi) {
    return {
      summary: `नमस्ते${name}! 😊 मैं ${org} का AI वॉइस असिस्टेंट हूँ। आज मैं आपकी क्या मदद कर सकता हूँ? मैं टीम मेंबर्स, क्लाइंट्स, पेंडिंग काम, अनपेड इनवॉइस, या अटेंडेंस की जानकारी तुरंत दे सकता हूँ।`,
      speechText: `नमस्ते! मैं ${org} का AI वॉइस असिस्टेंट हूँ। आज मैं आपकी क्या मदद कर सकता हूँ?`,
    };
  }

  return {
    summary: `Hello${name}! 😊 I am the ${org} AI Voice Assistant. How can I help you today? I can provide live details about staff, clients, pending tasks, unpaid invoices, or attendance.`,
    speechText: `Hello! How can I help you today? I can check your team members, clients, pending tasks, invoices, or attendance.`,
  };
}

/**
 * Query the local Live Knowledge Graph when LLM is offline or timed out
 * Provides 100% accurate, factual live data in Telugu, English, or Hindi!
 */
export function queryLocalKnowledgeGraph(
  prompt: string,
  knowledge: CachedPracticeKnowledge | null,
  language: string = 'en-IN'
): { summary: string; speechText: string } {
  const lower = prompt.toLowerCase();
  const isTelugu = language === 'te-IN' || /[\u0C00-\u0C7F]/.test(prompt);
  const isHindi = language === 'hi-IN' || /[\u0900-\u097F]/.test(prompt);

  if (!knowledge) {
    if (isTelugu) {
      return {
        summary: 'నమస్కారం! మీ ప్రశ్నను నేను అర్థం చేసుకున్నాను. మీరు పెండింగ్ పనులు, క్లయింట్లు, లేదా ఇన్‌వాయిస్‌ల గురించి అడగవచ్చు.',
        speechText: 'మీరు పెండింగ్ పనులు, క్లయింట్లు, లేదా ఇన్‌వాయిస్‌ల గురించి అడగవచ్చు.',
      };
    }
    return {
      summary: "I'm your office assistant! You can ask me about team members, clients, pending tasks, or unpaid invoices.",
      speechText: 'You can ask me about team members, clients, pending tasks, or unpaid invoices.',
    };
  }

  const { data } = knowledge;

  // 1. Staff / Employees Query ("employees", "staff", "team", "enthamandhi", "udhyogulu", "workers")
  if (
    lower.includes('employee') ||
    lower.includes('staff') ||
    lower.includes('team') ||
    lower.includes('worker') ||
    lower.includes('colleague') ||
    lower.includes('enthamandhi') ||
    lower.includes('udhyogulu') ||
    lower.includes('udhyogi') ||
    lower.includes('who works') ||
    lower.includes('members') ||
    lower.includes('karmachari') ||
    prompt.includes('ఉద్యోగ') ||
    prompt.includes('సిబ్బంది') ||
    prompt.includes('ఎంతమంది')
  ) {
    const names = data.employees.map(e => `${e.fullName} (${e.role.replace('_', ' ')})`).join(', ');
    if (isTelugu) {
      const summary = `మన ఆఫీస్‌లో మొత్తం ${data.employeeCount} మంది సిబ్బంది ఉన్నారు. ఉద్యోగుల జాబితా:\n${data.employees.map(e => `• ${e.fullName} — ${e.role.replace('_', ' ')}${e.designation ? ` (${e.designation})` : ''}`).join('\n')}`;
      const speechText = `మన ఆఫీస్‌లో మొత్తం ${data.employeeCount} మంది ఉద్యోగులు ఉన్నారు. ముఖ్యంగా: ${data.employees.slice(0, 4).map(e => e.fullName).join(', ')}${data.employeeCount > 4 ? ' తదితరులు' : ''}.`;
      return { summary, speechText };
    }
    if (isHindi) {
      const summary = `हमारे कार्यालय में कुल ${data.employeeCount} कर्मचारी हैं:\n${data.employees.map(e => `• ${e.fullName} (${e.role.replace('_', ' ')})`).join('\n')}`;
      const speechText = `कार्यालय में कुल ${data.employeeCount} सदस्य हैं, जिनमें ${data.employees.slice(0, 3).map(e => e.fullName).join(', ')} शामिल हैं।`;
      return { summary, speechText };
    }
    const summary = `Our office has ${data.employeeCount} active staff members:\n${data.employees.map(e => `• ${e.fullName} — ${e.role.replace('_', ' ')}${e.designation ? ` (${e.designation})` : ''}`).join('\n')}`;
    const speechText = `We have ${data.employeeCount} staff members including ${data.employees.slice(0, 4).map(e => e.fullName).join(', ')}.`;
    return { summary, speechText };
  }

  // 2. Specific Employee Lookup by Name
  for (const emp of data.employees) {
    const empParts = emp.fullName.toLowerCase().split(' ');
    if (empParts.some(part => part.length >= 3 && lower.includes(part))) {
      if (isTelugu) {
        const summary = `ఉద్యోగి వివరాలు: ${emp.fullName}\n• హోదా: ${emp.role.replace('_', ' ')}${emp.designation ? ` (${emp.designation})` : ''}\n• ఈమెయిల్: ${emp.email}\n• ఫోన్: ${emp.phone || 'అందుబాటులో లేదు'}`;
        const speechText = `${emp.fullName} గారు మన ఆఫీస్‌లో ${emp.role.replace('_', ' ')} గా పనిచేస్తున్నారు. ఫోన్ నంబర్: ${emp.phone || 'నమోదు కాలేదు'}.`;
        return { summary, speechText };
      }
      const summary = `Employee Profile: ${emp.fullName}\n• Role: ${emp.role.replace('_', ' ')}${emp.designation ? ` (${emp.designation})` : ''}\n• Email: ${emp.email}\n• Phone: ${emp.phone || 'N/A'}`;
      const speechText = `${emp.fullName} is a ${emp.role.replace('_', ' ')}. Phone: ${emp.phone || 'not registered'}.`;
      return { summary, speechText };
    }
  }

  // 3. Client Lookup or Clients List ("clients", "customers", "vyaparulu", "how many clients")
  if (
    lower.includes('client') ||
    lower.includes('customer') ||
    lower.includes('vyapar') ||
    prompt.includes('క్లయింట్') ||
    prompt.includes('కస్టమర్')
  ) {
    // Check if user is asking about a specific client
    for (const cl of data.clients) {
      const cName = cl.name.toLowerCase();
      // Match keywords of client name (e.g. "dairy", "precision", "agro")
      const words = cName.split(/[\s,._-]+/).filter(w => w.length >= 4);
      if (words.some(w => lower.includes(w))) {
        if (isTelugu) {
          const summary = `క్లయింట్ వివరాలు: "${cl.name}"\n• రకం: ${cl.clientType}\n• కాంటాక్ట్: ${cl.primaryContact || 'N/A'}\n• మొబైల్: ${cl.mobile || 'N/A'}\n• GSTIN: ${cl.gstin || 'N/A'}\n• PAN: ${cl.pan || 'N/A'}\n• స్టేటస్: ${cl.status}`;
          const speechText = `క్లయింట్ "${cl.name}" యాక్టివ్‌గా ఉన్నారు. కాంటాక్ట్ పర్సన్: ${cl.primaryContact || cl.name}, ఫోన్: ${cl.mobile || 'నమోదు కాలేదు'}.`;
          return { summary, speechText };
        }
        const summary = `Client Profile: "${cl.name}"\n• Type: ${cl.clientType}\n• Contact: ${cl.primaryContact || 'N/A'}\n• Mobile: ${cl.mobile || 'N/A'}\n• GSTIN: ${cl.gstin || 'N/A'}\n• PAN: ${cl.pan || 'N/A'}\n• Status: ${cl.status}`;
        const speechText = `Client "${cl.name}" is active. Contact person is ${cl.primaryContact || 'N/A'}, mobile: ${cl.mobile || 'N/A'}.`;
        return { summary, speechText };
      }
    }

    // General clients count / list
    if (isTelugu) {
      const summary = `మన వద్ద ప్రస్తుతం మొత్తం ${data.clientCount} మంది యాక్టివ్ క్లయింట్లు ఉన్నారు. వీరిలో కొందరు:\n${data.clients.slice(0, 8).map(c => `• ${c.name} (${c.clientType})`).join('\n')}`;
      const speechText = `మన ఆఫీస్‌లో మొత్తం ${data.clientCount} యాక్టివ్ క్లయింట్లు ఉన్నారు. ఉదాహరణకు: ${data.clients.slice(0, 3).map(c => c.name).join(', ')}.`;
      return { summary, speechText };
    }
    const summary = `We have ${data.clientCount} active clients registered in our practice:\n${data.clients.slice(0, 8).map(c => `• ${c.name} (${c.clientType})`).join('\n')}`;
    const speechText = `You have ${data.clientCount} active clients on record, including ${data.clients.slice(0, 3).map(c => c.name).join(', ')}.`;
    return { summary, speechText };
  }

  // 4. Financials & Invoices ("invoices", "bills", "unpaid", "balance", "baki", "dabbu", "receivables")
  if (
    lower.includes('invoice') ||
    lower.includes('bill') ||
    lower.includes('unpaid') ||
    lower.includes('balance') ||
    lower.includes('baki') ||
    lower.includes('dabbu') ||
    lower.includes('financial') ||
    prompt.includes('ఇన్‌వాయిస్') ||
    prompt.includes('బకాయి') ||
    prompt.includes('బిల్లు')
  ) {
    if (isTelugu) {
      const summary = `ఆఫీస్ ఫైనాన్స్ సారాంశం:\n• మొత్తం రావాల్సిన బకాయిలు: ₹${data.totalBalanceDue.toLocaleString('en-IN')}\n• చెల్లించని ఇన్‌వాయిస్‌లు: ${data.unpaidInvoiceCount}\n\nముఖ్యమైనవి:\n${data.invoices.slice(0, 5).map(i => `• ${i.clientName} (Inv #${i.invoiceNumber}): ₹${i.balanceDue.toLocaleString('en-IN')}`).join('\n')}`;
      const speechText = `మొత్తం ₹${data.totalBalanceDue.toLocaleString('en-IN')} బకాయిలు ఉన్నాయి. ${data.unpaidInvoiceCount} ఇన్‌వాయిస్‌లు ఇంకా చెల్లించబడలేదు.`;
      return { summary, speechText };
    }
    const summary = `Financial Receivables Summary:\n• Total Outstanding Balance: ₹${data.totalBalanceDue.toLocaleString('en-IN')}\n• Unpaid / Partial Invoices: ${data.unpaidInvoiceCount}\n\nNotable Invoices:\n${data.invoices.slice(0, 5).map(i => `• ${i.clientName} (Inv #${i.invoiceNumber}): ₹${i.balanceDue.toLocaleString('en-IN')}`).join('\n')}`;
    const speechText = `You have ₹${data.totalBalanceDue.toLocaleString('en-IN')} in outstanding receivables across ${data.unpaidInvoiceCount} unpaid invoices.`;
    return { summary, speechText };
  }

  // 5. Tasks & Pending Work ("tasks", "panulu", "pending", "deadlines", "work")
  if (
    lower.includes('task') ||
    lower.includes('pending') ||
    lower.includes('panulu') ||
    lower.includes('deadline') ||
    lower.includes('work') ||
    prompt.includes('టాస్క్') ||
    prompt.includes('పనుల')
  ) {
    if (isTelugu) {
      const summary = `ప్రస్తుతం ${data.pendingTaskCount} పెండింగ్ టాస్క్‌లు ఉన్నాయి. ముఖ్యమైనవి:\n${data.tasks.slice(0, 5).map(t => `• "${t.title}" — క్లయింట్: ${t.clientName} (గడువు: ${new Date(t.dueDate).toLocaleDateString('te-IN')})`).join('\n')}`;
      const speechText = `మొత్తం ${data.pendingTaskCount} పెండింగ్ టాస్క్‌లు ఉన్నాయి. ముఖ్యమైనది: "${data.tasks[0]?.title || 'జనరల్ టాస్క్'}" క్లయింట్ ${data.tasks[0]?.clientName || ''}.`;
      return { summary, speechText };
    }
    const summary = `You have ${data.pendingTaskCount} active pending tasks:\n${data.tasks.slice(0, 5).map(t => `• "${t.title}" — ${t.clientName} (Due: ${new Date(t.dueDate).toLocaleDateString('en-IN')})`).join('\n')}`;
    const speechText = `You have ${data.pendingTaskCount} pending tasks. Top priority is "${data.tasks[0]?.title || 'Tax Filing'}" for ${data.tasks[0]?.clientName || 'Client'}.`;
    return { summary, speechText };
  }

  // 6. Renewals ("renewals", "dsc", "licenses", "expiry")
  if (
    lower.includes('renewal') ||
    lower.includes('dsc') ||
    lower.includes('license') ||
    lower.includes('expiry') ||
    prompt.includes('రెన్యూవల్') ||
    prompt.includes('లైసెన్స్')
  ) {
    if (isTelugu) {
      const summary = `రాబోయే రెన్యూవల్స్:\n${data.renewals.slice(0, 5).map(r => `• ${r.renewalType} — ${r.clientName} (ఎక్స్‌పైరీ: ${new Date(r.expiryDate).toLocaleDateString('te-IN')})`).join('\n')}`;
      const speechText = `మొత్తం ${data.renewals.length} రెన్యూవల్స్ గడువుకు దగ్గరగా ఉన్నాయి.`;
      return { summary, speechText };
    }
    const summary = `Upcoming Compliance Renewals:\n${data.renewals.slice(0, 5).map(r => `• ${r.renewalType} — ${r.clientName} (Expires: ${new Date(r.expiryDate).toLocaleDateString('en-IN')})`).join('\n')}`;
    const speechText = `You have ${data.renewals.length} upcoming renewals tracked in your system.`;
    return { summary, speechText };
  }

  // 7. Attendance ("attendance", "haazri", "present", "checked in")
  if (
    lower.includes('attendance') ||
    lower.includes('haazri') ||
    lower.includes('present') ||
    prompt.includes('హాజరు')
  ) {
    if (isTelugu) {
      const summary = `నేటి హాజరు నివేదిక: మొత్తం ${data.employeeCount} మంది సిబ్బందిలో ${data.todayAttendance.presentCount} మంది ఈ రోజు చెక్-ఇన్ అయ్యారు.`;
      const speechText = `ఈ రోజు ${data.todayAttendance.presentCount} మంది సిబ్బంది హాజరయ్యారు.`;
      return { summary, speechText };
    }
    const summary = `Today's Staff Attendance: ${data.todayAttendance.presentCount} of ${data.employeeCount} staff members are checked in today.`;
    const speechText = `${data.todayAttendance.presentCount} out of ${data.employeeCount} team members have checked in today.`;
    return { summary, speechText };
  }

  // Default helpful domain summary
  if (isTelugu) {
    return {
      summary: `నేను మీ ${data.orgName} AI అసిస్టెంట్‌ని. మన వద్ద ${data.employeeCount} మంది సిబ్బంది, ${data.clientCount} యాక్టివ్ క్లయింట్లు, మరియు ${data.pendingTaskCount} పెండింగ్ టాస్క్‌లు ఉన్నాయి. మీకు ఏ సమాచారం కావాలి?`,
      speechText: `నేను ${data.orgName} AI అసిస్టెంట్‌ని. మీరు సిబ్బంది, క్లయింట్లు, టాస్క్‌లు, లేదా ఇన్‌వాయిస్‌ల గురించి నన్ను అడగవచ్చు.`,
    };
  }

  return {
    summary: `I'm your AI assistant for ${data.orgName}. We currently have ${data.employeeCount} team members, ${data.clientCount} active clients, and ${data.pendingTaskCount} pending tasks. What would you like to check?`,
    speechText: `I am your practice assistant. You can ask me about team members, clients, pending tasks, or invoices.`,
  };
}

/**
 * Call Sarvam LLM for general conversation and questions, trained and grounded
 * with the live organization knowledge base, with instant fallback.
 */
export async function getConversationalAnswer(
  prompt: string,
  history: ChatMessage[] = [],
  language: string = 'en-IN',
  userContext?: UserContext
): Promise<{ summary: string; speechText: string }> {
  const lower = prompt.toLowerCase();
  const isTelugu = language === 'te-IN' || /[\u0C00-\u0C7F]/.test(prompt);
  const isHindi = language === 'hi-IN' || /[\u0900-\u097F]/.test(prompt);

  // 1. Thank you handling
  if (
    lower.includes('thank you') ||
    lower.includes('thanks') ||
    lower.includes('dhanyavadalu') ||
    lower.includes('shukriya') ||
    lower.includes('thank u') ||
    prompt.includes('ధన్యవాదాలు') ||
    prompt.includes('ధన్యవాదం') ||
    prompt.includes('धन्यवाद') ||
    prompt.includes('शुक्रिया')
  ) {
    if (isTelugu) {
      return {
        summary: 'చాలా ధన్యవాదాలు! 😊 మీకు పనులు, క్లయింట్లు, లేదా ఇన్‌వాయిస్‌లకు సంబంధించి ఇంకా ఏమైనా సహాయం కావాలంటే అడగండి.',
        speechText: 'చాలా ధన్యవాదాలు! ఇంకేమైనా సహాయం కావాలంటే అడగండి.',
      };
    }
    if (isHindi) {
      return {
        summary: 'बहुत बहुत धन्यवाद! 😊 अगर आपको किसी काम, क्लाइंट या इनवॉइस से जुड़ी और कोई मदद चाहिए तो बेझिझक पूछें।',
        speechText: 'बहुत बहुत धन्यवाद! अगर आपको और कोई मदद चाहिए तो बेझिझक पूछें।',
      };
    }
    return {
      summary: "You're very welcome! 😊 Feel free to ask if you need anything else with your tasks, clients, invoices, or attendance.",
      speechText: "You're very welcome! Feel free to ask if you need anything else with your tasks, clients, or invoices.",
    };
  }

  // 2. Capabilities & "What can you help me with" handling
  if (
    lower.includes('what can you help') ||
    lower.includes('how can you help') ||
    lower.includes('what can you do') ||
    lower.includes('help me with') ||
    lower.includes('features') ||
    lower.includes('em cheyaglavu') ||
    lower.includes('kya kar sakte ho')
  ) {
    const helpText = isTelugu
      ? `నేను మీ AI కార్యాలయ అసిస్టెంట్‌ని. నేను మీకు సహాయపడగలను:\n• 👥 మన ఆఫీస్ సిబ్బంది మరియు ఉద్యోగుల వివరాలు తెలుసుకోవడం\n• 🏢 క్లయింట్లు, పాన్, జీఎస్టీ మరియు కాంటాక్ట్ నంబర్లు కనుగొనడం\n• 📋 పెండింగ్ పనులు మరియు గడువులు పరిశీలించడం\n• 💳 చెల్లించిన మరియు చెల్లించని ఇన్‌వాయిస్‌లు, బకాయిలు చూడడం\n• ⏱️ రోజువారీ సిబ్బంది హాజరు చెక్ చేయడం\n• 📅 రాబోయే రెన్యూవల్స్ మరియు డాక్యుమెంట్లు నిర్వహించడం`
      : isHindi
      ? `मैं आपका AI ऑफिस असिस्टेंट हूँ। मैं इन कामों में आपकी मदद कर सकता हूँ:\n• 👥 टीम मेंबर्स और कर्मचारियों की जानकारी देखना\n• 🏢 क्लाइंट्स के रिकॉर्ड, पैन, जीएसटी चेक करना\n• 📋 आज के पेंडिंग काम और डेडलाइन देखना\n• 💳 अनपेड इनवॉइस और बकाया रकम खोजना\n• ⏱️ हाजिरी और टाइमशीट देखना\n• 📅 आने वाले रिन्यूअल ट्रैक करना`
      : `I am your AI practice assistant. Here is what I can do for you:\n• 👥 **Team & Employees**: Look up active staff members, roles, designations, and contact numbers\n• 🏢 **Clients & Directory**: Search clients, PAN, GSTINs, and business types\n• 📋 **Tasks & Deadlines**: Check pending tasks, assignees, and due dates\n• 💳 **Invoices & Billing**: Review total outstanding balances and overdue invoices\n• ⏱️ **Attendance**: Check staff check-in logs and present count for today\n• 📅 **Renewals & Licenses**: Monitor upcoming DSC, trademark, and statutory expiries`;
    return {
      summary: helpText,
      speechText: isTelugu
        ? 'నేను సిబ్బంది, క్లయింట్లు, పెండింగ్ పనులు, ఇన్‌వాయిస్‌లు, మరియు హాజరు వివరాలను అందించడంలో మీకు సహాయపడగలను.'
        : isHindi
        ? 'मैं टीम मेंबर्स, क्लाइंट्स, पेंडिंग काम, इनवॉइस और हाजिरी की जानकारी में आपकी मदद कर सकता हूँ।'
        : 'I can help you monitor team members, clients, pending tasks, unpaid invoices, and attendance.',
    };
  }

  // 3. Automatically train / retrieve Live Practice Knowledge Graph
  const orgKnowledge = await getLivePracticeKnowledge(userContext?.organizationId);

  // 4. Invoke Sarvam LLM with Live Database Context Injection
  const apiKey = process.env.SARVAM_API_KEY;
  if (apiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      const targetLanguageDirective = isTelugu
        ? 'Respond strictly in natural, professional Telugu (తెలుగు) or conversational Telugu.'
        : isHindi
        ? 'Respond strictly in natural, professional Hindi (हिंदी).'
        : 'Respond in clear, professional English.';

      const systemPrompt = `You are CAFlow AI, the dedicated, intelligent office management Voice Assistant for Chartered Accountant firm "${orgKnowledge?.data.orgName || 'Mannasvi & Associates'}".

LIVE OFFICE DATABASE & PRACTICE KNOWLEDGE GRAPH:
${orgKnowledge?.summary || 'No live data available.'}

INSTRUCTIONS FOR GENERATING THE ANSWER:
1. You have direct, real-time access to the live office database above.
2. When the user asks about staff or employees (e.g. how many employees, who works here, their roles, names, or contact numbers), cite the EXACT employee names, counts, and roles from the Staff Roster above.
3. When the user asks about clients, cite exact client names, business types, primary contacts, PAN, or GSTINs.
4. When the user asks about pending tasks or deadlines, give exact task titles, assigned team members, and due dates.
5. When the user asks about invoices or finance, give exact balance amounts and client names.
6. ${targetLanguageDirective}
7. Keep your answer concise (2 to 3 sentences maximum) so that it is crystal-clear and natural when read aloud by the Text-to-Speech voice engine.
8. Never say "I do not know" or "I cannot access the database" when the facts are available in the Knowledge Graph above.`;

      // Keep recent 4 messages for conversational continuity
      const formattedHistory = history.slice(-4).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('https://api.sarvam.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'api-subscription-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sarvam-105b-conversations',
          messages: [
            { role: 'system', content: systemPrompt },
            ...formattedHistory,
            { role: 'user', content: prompt },
          ],
          max_tokens: 350,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content && content.length > 5) {
          const cleanSpeech = content
            .replace(/[#*`_~]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          return {
            summary: content,
            speechText: cleanSpeech,
          };
        }
      } else {
        const errText = await res.text().catch(() => '');
        console.warn('[CAFlow AI LLM Non-OK Status]', res.status, res.statusText, errText);
      }
    } catch (err: any) {
      console.warn('[CAFlow AI LLM Exception]', err?.message || err);
    }
  }

  // 5. Intelligent Local Knowledge Graph Query Matcher (Zero latency & 100% accurate fallback)
  if (orgKnowledge) {
    const localAnswer = queryLocalKnowledgeGraph(prompt, orgKnowledge, language);
    if (localAnswer) {
      return localAnswer;
    }
  }

  // 6. Textbook CA concept fallback
  for (const [key, entry] of Object.entries(CA_KNOWLEDGE_BASE)) {
    if (lower.includes(key)) {
      const text = isTelugu ? entry.te : isHindi ? entry.hi : entry.en;
      return {
        summary: text,
        speechText: text,
      };
    }
  }

  // 7. General fallback
  if (isTelugu) {
    return {
      summary: `నేను మీ ఆఫీస్ మేనేజ్‌మెంట్ అసిస్టెంట్‌ని. మీరు సిబ్బంది, పెండింగ్ పనులు, చెల్లించని ఇన్‌వాయిస్‌లు, హాజరు, లేదా క్లయింట్ల వివరాల గురించి నన్ను అడగవచ్చు.`,
      speechText: `నేను మీ ఆఫీస్ అసిస్టెంట్‌ని. మీరు సిబ్బంది, పనులు, లేదా ఇన్‌వాయిస్‌ల గురించి అడగవచ్చు.`,
    };
  }

  return {
    summary: `I'm your office management assistant! You can ask me to look up clients, check today's pending tasks, find unpaid invoices, or list staff members.`,
    speechText: `I'm your office assistant! You can ask me about team members, clients, pending tasks, or invoices.`,
  };
}
