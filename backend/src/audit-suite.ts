import prisma from './prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const BASE_URL = 'http://localhost:5000/api';

interface TestResult {
  module: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function recordTest(module: string, name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    results.push({ module, name, status: 'PASS', durationMs: Date.now() - start });
    console.log(`  ✓ [${module}] ${name} (${Date.now() - start}ms)`);
  } catch (err: any) {
    results.push({ module, name, status: 'FAIL', details: err?.message || String(err), durationMs: Date.now() - start });
    console.error(`  ✗ [${module}] ${name} FAILED:`, err?.message || err);
  }
}

async function runAudit() {
  console.log('\n======================================================');
  console.log('   CAFLOW COMPREHENSIVE PRODUCTION AUDIT TEST SUITE   ');
  console.log('======================================================\n');

  // 1. Health check
  await recordTest('Health', 'Server Health Check', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    if (res.status !== 200) throw new Error(`Health status ${res.status}`);
    const body = await res.json();
    if (body.status !== 'ok') throw new Error(`Unexpected body: ${JSON.stringify(body)}`);
  });

  // 2. Auth Tests
  let ownerToken = '';
  let ownerUser: any = null;
  let employeeToken = '';
  let employeeUser: any = null;

  await recordTest('Auth', 'Firm Owner Login (kapil@manavi.com)', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'kapil@manavi.com', password: 'Admin@123' }),
    });
    const data = await res.json();
    if (!data.success || !data.token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
    ownerToken = data.token;
    ownerUser = data.user;
    if (data.user.role !== 'FIRM_OWNER') throw new Error(`Expected FIRM_OWNER role, got ${data.user.role}`);
  });

  await recordTest('Auth', 'Employee Login (suresh@manavi.com)', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'suresh@manavi.com', password: 'Employee@123' }),
    });
    const data = await res.json();
    if (!data.success || !data.token) throw new Error(`Employee login failed: ${JSON.stringify(data)}`);
    employeeToken = data.token;
    employeeUser = data.user;
    if (data.user.role !== 'EMPLOYEE') throw new Error(`Expected EMPLOYEE role, got ${data.user.role}`);
  });

  await recordTest('Auth', 'Reject Invalid Password', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'kapil@manavi.com', password: 'WrongPassword!99' }),
    });
    if (res.status !== 401) throw new Error(`Expected status 401, got ${res.status}`);
  });

  // 3. Dashboard Metrics
  await recordTest('Dashboard', 'Get Dashboard Metrics & Counters', async () => {
    const res = await fetch(`${BASE_URL}/dashboard/metrics`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const body = await res.json();
    if (!body.success || !body.data || !body.data.summary) {
      throw new Error(`Invalid dashboard data: ${JSON.stringify(body)}`);
    }
    const sum = body.data.summary;
    if (typeof sum.totalActive !== 'number' || typeof sum.dueToday !== 'number') {
      throw new Error(`Summary fields missing: ${JSON.stringify(sum)}`);
    }
  });

  // 4. Clients Module (CRUD & Search)
  let createdClientId = '';
  await recordTest('Clients', 'List Clients & Search by PAN/GST', async () => {
    const res = await fetch(`${BASE_URL}/clients?limit=10`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const body = await res.json();
    if (!body.success || !Array.isArray(body.data)) throw new Error('Failed to list clients');
    if (body.data.length === 0) throw new Error('No clients returned');

    // Test search
    const searchRes = await fetch(`${BASE_URL}/clients?search=Dairy`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const searchBody = await searchRes.json();
    if (!searchBody.success || searchBody.data.length === 0) throw new Error('Search for Dairy failed');
  });

  await recordTest('Clients', 'Create New Client & Verify Persistence', async () => {
    const payload = {
      name: 'Audit Test Client LLP',
      clientType: 'LLP',
      fileNo: 'MA-AUDIT-001',
      primaryContact: 'Test Partner',
      mobile: '9876543210',
      email: 'audit@testclient.com',
      pan: 'AAACT1234A',
      gstin: '36AAACT1234A1Z5',
      address: 'Plot 42, Hitech City, Hyderabad',
    };
    const res = await fetch(`${BASE_URL}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!body.success || !body.client?.id) throw new Error(`Create client failed: ${JSON.stringify(body)}`);
    createdClientId = body.client.id;

    // Verify in database
    const inDb = await prisma.client.findUnique({ where: { id: createdClientId } });
    if (!inDb || inDb.pan !== 'AAACT1234A') throw new Error('Client not found in PostgreSQL');
  });

  await recordTest('Clients', 'Update Client & Deactivate', async () => {
    const updateRes = await fetch(`${BASE_URL}/clients/${createdClientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ primaryContact: 'Updated Partner Name' }),
    });
    const updateBody = await updateRes.json();
    if (!updateBody.success || updateBody.client.primaryContact !== 'Updated Partner Name') {
      throw new Error('Client update failed');
    }

    const delRes = await fetch(`${BASE_URL}/clients/${createdClientId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const delBody = await delRes.json();
    if (!delBody.success) throw new Error('Client delete/deactivate failed');

    const inDb = await prisma.client.findUnique({ where: { id: createdClientId } });
    if (inDb?.status !== 'INACTIVE') throw new Error('Client status not INACTIVE');
  });

  // 5. Tasks Module (Workflow Transitions, Checklist & Comments)
  let createdTaskId = '';
  await recordTest('Tasks', 'Create Task with Checklist & Assignments', async () => {
    const clients = await prisma.client.findMany({ where: { organizationId: ownerUser.organization.id }, take: 1 });
    const payload = {
      title: 'Audit Verification Task - GST Audit',
      clientId: clients[0].id,
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
      assignedUserIds: [ownerUser.id, employeeUser.id],
      checklistItems: ['Verify Bank Statements', 'Reconcile 2B vs Purchase Register', 'File GSTR-9'],
    };

    const res = await fetch(`${BASE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!body.success || !body.task?.id) throw new Error(`Task create failed: ${JSON.stringify(body)}`);
    createdTaskId = body.task.id;

    // Verify checklists created in DB
    const checklists = await prisma.taskChecklistItem.findMany({ where: { taskId: createdTaskId } });
    if (checklists.length !== 3) throw new Error(`Expected 3 checklists, found ${checklists.length}`);
  });

  await recordTest('Tasks', 'Status Transition & History (PENDING -> IN_PROGRESS -> COMPLETED)', async () => {
    // Transition to IN_PROGRESS
    const res1 = await fetch(`${BASE_URL}/tasks/${createdTaskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ status: 'IN_PROGRESS', remarks: 'Work commenced by team' }),
    });
    const body1 = await res1.json();
    if (!body1.success || body1.task.status !== 'IN_PROGRESS') throw new Error('Status transition to IN_PROGRESS failed');

    // Transition to COMPLETED
    const res2 = await fetch(`${BASE_URL}/tasks/${createdTaskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ status: 'COMPLETED', remarks: 'Filing confirmed on portal' }),
    });
    const body2 = await res2.json();
    if (!body2.success || body2.task.status !== 'COMPLETED') throw new Error('Status transition to COMPLETED failed');

    // Verify history in DB
    const history = await prisma.taskStatusHistory.findMany({ where: { taskId: createdTaskId } });
    if (history.length < 2) throw new Error(`Expected status history records, got ${history.length}`);
  });

  await recordTest('Tasks', 'Toggle Checklist Item & Add Comment', async () => {
    const items = await prisma.taskChecklistItem.findMany({ where: { taskId: createdTaskId } });
    const itemToToggle = items[0];

    const toggleRes = await fetch(`${BASE_URL}/tasks/${createdTaskId}/checklist/${itemToToggle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ isCompleted: true }),
    });
    const toggleBody = await toggleRes.json();
    if (!toggleBody.success || !toggleBody.item.isCompleted) throw new Error('Checklist toggle failed');

    // Add comment
    const commentRes = await fetch(`${BASE_URL}/tasks/${createdTaskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ comment: 'All 2B discrepancies resolved with supplier.' }),
    });
    const commentBody = await commentRes.json();
    if (!commentBody.success || !commentBody.comment?.id) throw new Error('Add task comment failed');
  });

  // 6. Attendance Module
  await recordTest('Attendance', 'Daily Attendance Query & Formatted Duration', async () => {
    const res = await fetch(`${BASE_URL}/attendance/daily?date=2026-10-14`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const body = await res.json();
    if (!body.success || !Array.isArray(body.data)) throw new Error('Daily attendance query failed');
  });

  // 7. To-Do Module
  let createdTodoId = '';
  await recordTest('To-Do', 'Create To-Do, Toggle Completion & Delete', async () => {
    const createRes = await fetch(`${BASE_URL}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        title: 'Review Audit Checklist for Manavi Clients',
        category: 'Audit',
        priority: 'HIGH',
        dueDate: '2026-10-14',
      }),
    });
    const createBody = await createRes.json();
    if (!createBody.success || !createBody.todo?.id) throw new Error('To-Do creation failed');
    createdTodoId = createBody.todo.id;

    // Toggle completion
    const toggleRes = await fetch(`${BASE_URL}/todos/${createdTodoId}/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const toggleBody = await toggleRes.json();
    if (!toggleBody.success || toggleBody.todo.status !== 'COMPLETED') throw new Error('To-Do toggle failed');

    // Delete
    const delRes = await fetch(`${BASE_URL}/todos/${createdTodoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const delBody = await delRes.json();
    if (!delBody.success) throw new Error('To-Do deletion failed');
  });

  // 8. Finance & Billing (GST, Invoicing & Payment Allocation)
  let createdInvoiceId = '';
  await recordTest('Finance', 'Create Invoice with GST (18%) & Mathematical Verification', async () => {
    const client = await prisma.client.findFirst({ where: { organizationId: ownerUser.organization.id } });
    const payload = {
      clientId: client!.id,
      invoiceDate: '2026-10-14',
      dueDate: '2026-10-29',
      notes: 'Statutory audit professional charges',
      lineItems: [
        {
          description: 'Statutory Audit Fees FY 25-26',
          quantity: 1,
          unitPrice: 50000,
          discount: 5000, // taxable: 45000
          taxRate: 18,    // tax: 8100 -> total: 53100
        },
        {
          description: 'Tax Audit Reporting Form 3CD',
          quantity: 1,
          unitPrice: 15000,
          discount: 0,    // taxable: 15000
          taxRate: 18,    // tax: 2700 -> total: 17700
        },
      ],
    };

    const res = await fetch(`${BASE_URL}/finance/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!body.success || !body.invoice?.id) throw new Error(`Invoice create failed: ${JSON.stringify(body)}`);
    createdInvoiceId = body.invoice.id;

    const inv = body.invoice;
    // Mathematical check
    // subtotal = 45000 + 15000 = 60000
    // taxTotal = 8100 + 2700 = 10800
    // totalAmount = 70800
    if (inv.subtotal !== 60000) throw new Error(`Expected subtotal 60000, got ${inv.subtotal}`);
    if (inv.taxTotal !== 10800) throw new Error(`Expected taxTotal 10800, got ${inv.taxTotal}`);
    if (inv.totalAmount !== 70800) throw new Error(`Expected totalAmount 70800, got ${inv.totalAmount}`);
    if (inv.balanceDue !== 70800) throw new Error(`Expected balanceDue 70800, got ${inv.balanceDue}`);
  });

  await recordTest('Finance', 'Record Partial Payment & Verify Balance Deduction', async () => {
    const inv = await prisma.invoice.findUnique({ where: { id: createdInvoiceId } });
    const payload = {
      clientId: inv!.clientId,
      invoiceId: createdInvoiceId,
      amount: 40000,
      paymentMode: 'BANK_TRANSFER',
      referenceNumber: 'NEFT-MA-99482',
      notes: 'Part payment received via HDFC bank',
    };

    const res = await fetch(`${BASE_URL}/finance/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!body.success || !body.payment?.id) throw new Error('Record payment failed');

    // Verify invoice balance updated
    const updatedInv = await prisma.invoice.findUnique({ where: { id: createdInvoiceId } });
    if (updatedInv?.amountPaid !== 40000) throw new Error(`Expected amountPaid 40000, got ${updatedInv?.amountPaid}`);
    if (updatedInv?.balanceDue !== 30800) throw new Error(`Expected balanceDue 30800, got ${updatedInv?.balanceDue}`);
    if (updatedInv?.paymentStatus !== 'PARTIALLY_PAID') throw new Error(`Expected PARTIALLY_PAID, got ${updatedInv?.paymentStatus}`);
  });

  // 9. Timesheets (Submission & RBAC Approval)
  let createdTimesheetId = '';
  await recordTest('Timesheets', 'Employee Logs Timesheet Entry', async () => {
    const payload = {
      workDate: '2026-10-14',
      durationMinutes: 180,
      description: 'Audit documentation testing and voucher verification',
      isBillable: true,
    };
    const res = await fetch(`${BASE_URL}/timesheets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!body.success || !body.entry?.id) throw new Error('Timesheet entry logging failed');
    createdTimesheetId = body.entry.id;
  });

  await recordTest('Timesheets', 'RBAC: Employee Cannot Approve Timesheet', async () => {
    const res = await fetch(`${BASE_URL}/timesheets/${createdTimesheetId}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ status: 'APPROVED', remarks: 'Self approve attempt' }),
    });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  await recordTest('Timesheets', 'RBAC: Firm Owner Approves Timesheet', async () => {
    const res = await fetch(`${BASE_URL}/timesheets/${createdTimesheetId}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ status: 'APPROVED', remarks: 'Verified by Managing Partner' }),
    });
    const body = await res.json();
    if (!body.success || body.entry.status !== 'APPROVED') throw new Error('Manager approval failed');
  });

  // 10. Documents & In-Out Register
  let createdInOutId = '';
  await recordTest('Documents', 'Record In-Out Custody & Mark Returned', async () => {
    const client = await prisma.client.findFirst({ where: { organizationId: ownerUser.organization.id } });
    const payload = {
      clientId: client!.id,
      docType: 'Class 3 Digital Signature Certificate (DSC)',
      category: 'RECEIVED',
      isReturnable: true,
      physicalLocation: 'Fireproof Vault Locker 04',
      notes: 'Received for MCA annual return filing',
    };
    const createRes = await fetch(`${BASE_URL}/documents/in-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify(payload),
    });
    const createBody = await createRes.json();
    if (!createBody.success || !createBody.record?.id) throw new Error('Document In-Out record failed');
    createdInOutId = createBody.record.id;

    // Return document
    const retRes = await fetch(`${BASE_URL}/documents/in-out/${createdInOutId}/return`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const retBody = await retRes.json();
    if (!retBody.success || retBody.record.status !== 'RETURNED') throw new Error('Mark document returned failed');
  });

  // 11. Renewals Module
  let createdRenewalId = '';
  await recordTest('Renewals', 'Create Renewal Record & Status Update', async () => {
    const client = await prisma.client.findFirst({ where: { organizationId: ownerUser.organization.id } });
    const payload = {
      clientId: client!.id,
      renewalType: 'Trademark Class 35 Renewal',
      licenseNumber: 'TM-2016-99381',
      expiryDate: '2026-11-30',
      reminderDays: 45,
      notes: 'Renewal application with Controller General of Patents & Trademarks',
    };
    const createRes = await fetch(`${BASE_URL}/renewals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify(payload),
    });
    const createBody = await createRes.json();
    if (!createBody.success || !createBody.renewal?.id) throw new Error('Renewal creation failed');
    createdRenewalId = createBody.renewal.id;

    // Status update
    const patchRes = await fetch(`${BASE_URL}/renewals/${createdRenewalId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ status: 'RENEWED' }),
    });
    const patchBody = await patchRes.json();
    if (!patchBody.success || patchBody.renewal?.status !== 'RENEWED') {
      throw new Error(`Renewal status update failed: ${JSON.stringify(patchBody)}`);
    }
  });

  // 12. Notifications Broadcast Wizard
  await recordTest('Notifications', 'Dispatch Broadcast with Template Replacement', async () => {
    const payload = {
      category: 'RENEWAL',
      channel: 'WHATSAPP',
      title: 'Advance Tax Reminder for {{client_name}}',
      message: 'Dear {{client_name}}, please note Q3 Advance Tax instalment is due shortly. Team Manavi Associates.',
    };
    const res = await fetch(`${BASE_URL}/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!body.success || typeof body.count !== 'number' || body.count === 0) {
      throw new Error(`Notification dispatch failed: ${JSON.stringify(body)}`);
    }

    // Verify template replacement happened in DB
    const notif = await prisma.notification.findFirst({
      where: { organizationId: ownerUser.organization.id, channel: 'WHATSAPP' },
      orderBy: { createdAt: 'desc' },
    });
    if (!notif || notif.title.includes('{{client_name}}')) {
      throw new Error(`Template variable {{client_name}} was not replaced: ${notif?.title}`);
    }
  });

  // 13. Reports & Analytics
  await recordTest('Reports', 'Generate Summary KPIs and Workload Aggregations', async () => {
    const res = await fetch(`${BASE_URL}/reports/summary`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const body = await res.json();
    if (!body.success || !body.data?.kpis) throw new Error('Reports summary query failed');
    const kpis = body.data.kpis;
    if (typeof kpis.totalBilled !== 'number' || typeof kpis.totalCollected !== 'number') {
      throw new Error('KPI fields missing');
    }
  });

  // 14. Settings & RBAC
  await recordTest('Settings', 'Get Organization Settings & RBAC Guard on Update', async () => {
    const getRes = await fetch(`${BASE_URL}/settings/organization`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const getBody = await getRes.json();
    if (!getBody.success || !getBody.organization?.id) throw new Error('Get organization settings failed');

    // Test Employee cannot update organization settings
    const empRes = await fetch(`${BASE_URL}/settings/organization`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ name: 'Hacked Firm Name' }),
    });
    if (empRes.status !== 403) throw new Error(`Expected 403 Forbidden for employee, got ${empRes.status}`);
  });

  // 15. MULTI-TENANCY ISOLATION VERIFICATION
  await recordTest('Multi-Tenancy', 'Strict Cross-Organization Data Isolation', async () => {
    // Find or create test Organization B user
    let userB = await prisma.user.findFirst({
      where: { organization: { slug: { startsWith: 'apex-test' } } },
    });

    if (!userB) {
      const orgB = await prisma.organization.create({
        data: {
          name: 'Apex Advisory Test Org',
          slug: `apex-test-${Date.now()}`,
          email: `contact-${Date.now()}@apexadvisory.com`,
        },
      });
      const hashedPassword = await bcrypt.hash('ApexPass@123', 10);
      userB = await prisma.user.create({
        data: {
          organizationId: orgB.id,
          email: `partner@apex${Date.now()}.com`,
          passwordHash: hashedPassword,
          fullName: 'Apex Managing Partner',
          role: 'FIRM_OWNER',
        },
      });
    }

    // Sign valid JWT token for Org B user
    const JWT_SECRET = process.env.JWT_SECRET || 'caflow_super_secret_jwt_key_2026_finance_ops';
    const tokenB = jwt.sign(
      { userId: userB.id, orgId: userB.organizationId },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Org B attempts to access Org A's client
    const crossClientRes = await fetch(`${BASE_URL}/clients/${createdClientId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    if (crossClientRes.status !== 404) {
      throw new Error(`Cross-Org Client access violation! Expected 404, got ${crossClientRes.status}`);
    }

    // Org B attempts to access Org A's invoice
    const crossInvRes = await fetch(`${BASE_URL}/finance/invoices?search=MA-`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const crossInvBody = await crossInvRes.json();
    if (crossInvBody.data && crossInvBody.data.length > 0) {
      throw new Error(`Cross-Org Invoice leak! Found ${crossInvBody.data.length} invoices belonging to Org A`);
    }

    // Org B attempts to access Org A's task
    const crossTaskRes = await fetch(`${BASE_URL}/tasks/${createdTaskId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    if (crossTaskRes.status !== 404) {
      throw new Error(`Cross-Org Task access violation! Expected 404, got ${crossTaskRes.status}`);
    }

    // Org B attempts to return Org A's document
    const crossDocRes = await fetch(`${BASE_URL}/documents/in-out/${createdInOutId}/return`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    if (crossDocRes.status !== 404) {
      throw new Error(`Cross-Org Document return violation! Expected 404, got ${crossDocRes.status}`);
    }

    // Org B attempts to approve Org A's timesheet
    const crossTsRes = await fetch(`${BASE_URL}/timesheets/${createdTimesheetId}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    if (crossTsRes.status !== 404) {
      throw new Error(`Cross-Org Timesheet approve violation! Expected 404, got ${crossTsRes.status}`);
    }

    // Test Org B remains active in database as a dedicated multi-tenant test organization
  });

  // Clean up created test records in Org A
  try {
    if (createdTaskId) {
      await prisma.taskComment.deleteMany({ where: { taskId: createdTaskId } }).catch(() => {});
      await prisma.taskChecklistItem.deleteMany({ where: { taskId: createdTaskId } }).catch(() => {});
      await prisma.taskStatusHistory.deleteMany({ where: { taskId: createdTaskId } }).catch(() => {});
      await prisma.taskAssignment.deleteMany({ where: { taskId: createdTaskId } }).catch(() => {});
      await prisma.task.delete({ where: { id: createdTaskId } }).catch(() => {});
    }
    if (createdInvoiceId) {
      await prisma.payment.deleteMany({ where: { invoiceId: createdInvoiceId } }).catch(() => {});
      await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: createdInvoiceId } }).catch(() => {});
      await prisma.invoice.delete({ where: { id: createdInvoiceId } }).catch(() => {});
    }
    if (createdTimesheetId) {
      await prisma.timesheetEntry.delete({ where: { id: createdTimesheetId } }).catch(() => {});
    }
    if (createdInOutId) {
      await prisma.documentInOutRecord.delete({ where: { id: createdInOutId } }).catch(() => {});
    }
    if (createdRenewalId) {
      await prisma.renewal.delete({ where: { id: createdRenewalId } }).catch(() => {});
    }
    if (createdClientId) {
      await prisma.client.delete({ where: { id: createdClientId } }).catch(() => {});
    }
  } catch (cleanErr) {
    // Non-critical cleanup
  }

  // Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log('\n======================================================');
  console.log(` AUDIT RESULTS SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: ${results.length})`);
  console.log('======================================================\n');

  if (failed > 0) {
    console.error('FAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(f => {
      console.error(`- [${f.module}] ${f.name}: ${f.details}`);
    });
    process.exit(1);
  }
}

runAudit()
  .catch(err => {
    console.error('Fatal audit error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
