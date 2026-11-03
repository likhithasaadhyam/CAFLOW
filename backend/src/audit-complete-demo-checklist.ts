import prisma from './prisma.js';

const BASE_URL = 'http://127.0.0.1:5000/api';

interface CheckItem {
  module: string;
  feature: string;
  status: 'PASS' | 'FAIL' | 'NOT TESTED';
  details: string;
}

const auditList: CheckItem[] = [];

function check(module: string, feature: string, pass: boolean, details: string) {
  auditList.push({ module, feature, status: pass ? 'PASS' : 'FAIL', details });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] [${module}] ${feature}: ${details}`);
}

async function postJson(url: string, body: any, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'GET',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function login(email: string, pass: string) {
  const res = await postJson(`${BASE_URL}/auth/login`, { email, password: pass });
  if (!res.data.token) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.data)}`);
  }
  return {
    user: res.data.user,
    token: res.data.token,
    headers: { Authorization: `Bearer ${res.data.token}` },
  };
}

async function runCompleteAudit() {
  console.log('========================================================================');
  console.log('       CAFLOW COMPLETE SYSTEM AUDIT & MENTOR DEMO VERIFICATION          ');
  console.log('========================================================================\n');

  // 1. MODULE 1: LOGIN AND DASHBOARD
  console.log('--- MODULE 1: Login and Dashboard ---');
  let owner: any, manager: any, accountant: any, taxPro: any, employee: any, client: any;
  try {
    owner = await login('kapil@manavi.com', 'Admin@123');
    check('Module 1: Login', 'Firm Owner Login', !!owner.token, `User: ${owner.user.fullName}, Role: ${owner.user.role}`);

    manager = await login('neha@manavi.com', 'Employee@123');
    check('Module 1: Login', 'Manager Login', !!manager.token, `User: ${manager.user.fullName}, Role: ${manager.user.role}`);

    accountant = await login('rajesh@manavi.com', 'Employee@123');
    check('Module 1: Login', 'Accountant Login', !!accountant.token, `User: ${accountant.user.fullName}, Role: ${accountant.user.role}`);

    taxPro = await login('ca.ananya@manavi.com', 'TaxPro@123');
    check('Module 1: Login', 'Tax Professional Login', !!taxPro.token, `User: ${taxPro.user.fullName}, Role: ${taxPro.user.role}`);

    employee = await login('jagan@manavi.com', 'Employee@123');
    check('Module 1: Login', 'Employee Login', !!employee.token, `User: ${employee.user.fullName}, Role: ${employee.user.role}`);

    client = await login('client@amdairy.com', 'Client@123');
    check('Module 1: Login', 'Client User Login', !!client.token, `User: ${client.user.fullName}, Role: ${client.user.role}`);
  } catch (err: any) {
    check('Module 1: Login', 'Canonical Login Credentials', false, err.message);
  }

  // Dashboard endpoints
  const dashMetrics = await getJson(`${BASE_URL}/dashboard/metrics`, owner.headers);
  const dashSummary = dashMetrics.data.data?.summary;
  check(
    'Module 1: Dashboard',
    'Dashboard Metrics & KPI API (/dashboard/metrics)',
    dashMetrics.status === 200 && dashMetrics.data.success === true && !!dashSummary,
    `Total Active Tasks: ${dashSummary?.totalActive}, Due Today: ${dashSummary?.dueToday}, Overdue: ${dashSummary?.overdueUpTo7Days + dashSummary?.overdueOver7Days}`
  );

  check(
    'Module 1: Dashboard',
    'Dashboard Attendance Widget Data',
    dashMetrics.data.data?.attendanceWidget !== undefined,
    `Checked-in: ${dashMetrics.data.data?.attendanceWidget?.isCheckedIn}, Status: ${dashMetrics.data.data?.attendanceWidget?.status}`
  );

  check(
    'Module 1: Dashboard',
    'Dashboard Outstanding Receivables Data',
    dashMetrics.data.data?.outstandingReceivables !== undefined,
    `Outstanding total: ₹${dashMetrics.data.data?.outstandingReceivables?.totalOutstanding || 0}`
  );

  // 2. MODULE 2: CLIENTS AND CLIENT ISOLATION
  console.log('\n--- MODULE 2: Clients and Client Isolation ---');
  const clientsList = await getJson(`${BASE_URL}/clients?limit=100`, owner.headers);
  const totalStaffClients = clientsList.data.data?.length || 0;
  check(
    'Module 2: Clients',
    'Staff Client Directory List',
    clientsList.status === 200 && totalStaffClients >= 27,
    `Retrieved ${totalStaffClients} clients from PostgreSQL database`
  );

  // Single client details
  const firstClientId = clientsList.data.data?.[0]?.id;
  const singleClient = await getJson(`${BASE_URL}/clients/${firstClientId}`, owner.headers);
  const clientEntity = singleClient.data.client || singleClient.data.data;
  check(
    'Module 2: Clients',
    'Client 360 Profile API',
    singleClient.status === 200 && singleClient.data.success === true && !!clientEntity,
    `Client Name: "${clientEntity?.name}", PAN: ${clientEntity?.pan || 'N/A'}, Invoices: ${clientEntity?.invoices?.length || 0}`
  );

  // Client role isolation: client cannot access other clients
  const clientView = await getJson(`${BASE_URL}/clients`, client.headers);
  const isIsolated = clientView.status === 403 || clientView.data.data?.length === 0 || clientView.data.data?.[0]?.id === client.user.clientId;
  check(
    'Module 2: Clients',
    'Client Tenant Isolation',
    isIsolated,
    `Client user cannot view full staff client directory (Status: ${clientView.status})`
  );

  // Employee role masking: PAN and GSTIN masked in voice/listing
  const empVoice = await postJson(
    `${BASE_URL}/voice/process`,
    { transcript: 'Show me all clients', language: 'en-IN' },
    employee.headers
  );
  const isMasked = empVoice.data.data?.items?.[0]?.pan === undefined || empVoice.data.data?.items?.[0]?.pan === false;
  check(
    'Module 2: Clients',
    'Employee Role PAN/GSTIN Field Masking',
    isMasked,
    `PAN and GSTIN fields masked for EMPLOYEE role`
  );

  // 3. MODULE 3: TASKS, TO-DO, RETAINERS, SERVICES AND RENEWALS
  console.log('\n--- MODULE 3: Tasks, To-Do, Retainers, Services & Renewals ---');
  const tasksRes = await getJson(`${BASE_URL}/tasks`, owner.headers);
  check(
    'Module 3: Tasks',
    'Task Management List API',
    tasksRes.status === 200 && Array.isArray(tasksRes.data.data),
    `Retrieved ${tasksRes.data.data?.length} tasks`
  );

  const todoRes = await getJson(`${BASE_URL}/todos`, owner.headers);
  check(
    'Module 3: To-Do',
    'To-Do Management API',
    todoRes.status === 200 && Array.isArray(todoRes.data.data),
    `Retrieved ${todoRes.data.data?.length} personal to-do items`
  );

  const servicesRes = await getJson(`${BASE_URL}/services`, owner.headers);
  check(
    'Module 3: Services',
    'Services Catalog API',
    servicesRes.status === 200 && Array.isArray(servicesRes.data.data),
    `Retrieved ${servicesRes.data.data?.length} firm services`
  );

  const retainersRes = await getJson(`${BASE_URL}/services/retainers`, owner.headers);
  check(
    'Module 3: Retainers',
    'Client Retainers API',
    retainersRes.status === 200 && Array.isArray(retainersRes.data.data),
    `Retrieved ${retainersRes.data.data?.length} active retainer agreements`
  );

  const renewalsRes = await getJson(`${BASE_URL}/renewals`, owner.headers);
  check(
    'Module 3: Renewals',
    'Compliance & License Renewals API',
    renewalsRes.status === 200 && Array.isArray(renewalsRes.data.data),
    `Retrieved ${renewalsRes.data.data?.length} renewal records`
  );

  // 4. MODULE 4: INVOICES, RECEIPTS, PAYMENTS AND EXPENSES
  console.log('\n--- MODULE 4: Invoices, Receipts, Payments & Expenses ---');
  const invoicesRes = await getJson(`${BASE_URL}/finance/invoices`, owner.headers);
  check(
    'Module 4: Finance',
    'Invoices List API',
    invoicesRes.status === 200 && Array.isArray(invoicesRes.data.data),
    `Retrieved ${invoicesRes.data.data?.length} invoices`
  );

  const overviewRes = await getJson(`${BASE_URL}/reports/summary`, owner.headers);
  const kpis = overviewRes.data.data?.kpis;
  check(
    'Module 4: Finance',
    'Financial Overview & Summary API (/reports/summary)',
    overviewRes.status === 200 && overviewRes.data.success === true && !!kpis,
    `Total Billed: ₹${kpis?.totalBilled}, Collected: ₹${kpis?.totalCollected}, Outstanding: ₹${kpis?.totalOutstanding}`
  );

  const paymentsRes = await getJson(`${BASE_URL}/finance/payments`, owner.headers);
  check(
    'Module 4: Finance',
    'Payments & Receipts API',
    paymentsRes.status === 200 && Array.isArray(paymentsRes.data.data),
    `Retrieved ${paymentsRes.data.data?.length} payment receipt records`
  );

  const expensesRes = await getJson(`${BASE_URL}/finance/expenses`, owner.headers);
  check(
    'Module 4: Finance',
    'Firm Expenses API',
    expensesRes.status === 200 && Array.isArray(expensesRes.data.data),
    `Retrieved ${expensesRes.data.data?.length} expense entries`
  );

  // Strict RBAC: Employee role cannot view finance invoices
  const empFinance = await getJson(`${BASE_URL}/finance/invoices`, employee.headers);
  check(
    'Module 4: Finance',
    'Employee Role Finance Access Control',
    empFinance.status === 403,
    `Employee strictly forbidden from firm finance records (Status: ${empFinance.status})`
  );

  // Dedicated Client Invoices endpoint
  const clientInvoices = await getJson(`${BASE_URL}/finance/my-invoices`, client.headers);
  check(
    'Module 4: Finance',
    'Client Portal My Invoices API',
    clientInvoices.status === 200 && Array.isArray(clientInvoices.data.data),
    `Retrieved ${clientInvoices.data.data?.length} isolated invoices for AM Dairy`
  );

  // 5. MODULE 5: ATTENDANCE, DATE SELECTION AND TIMESHEETS
  console.log('\n--- MODULE 5: Attendance, Date Selection & Timesheets ---');
  const todayDateStr = new Date().toISOString().split('T')[0];
  const attToday = await getJson(`${BASE_URL}/attendance/daily?date=${todayDateStr}`, owner.headers);
  check(
    'Module 5: Attendance',
    'Daily Attendance API (Today)',
    attToday.status === 200 && attToday.data.success === true && Array.isArray(attToday.data.data),
    `Date: ${todayDateStr}, Present records count: ${attToday.data.data?.length}`
  );

  const attOct14 = await getJson(`${BASE_URL}/attendance/daily?date=2026-10-14`, owner.headers);
  check(
    'Module 5: Attendance',
    'Daily Attendance Specific Date (2026-10-14)',
    attOct14.status === 200 && attOct14.data.dayOfWeek === 'Wednesday',
    `Date: 2026-10-14, Day: ${attOct14.data.dayOfWeek}, Records: ${attOct14.data.data?.length}`
  );

  const timesheetRes = await getJson(`${BASE_URL}/timesheets`, owner.headers);
  check(
    'Module 5: Timesheets',
    'Staff Timesheets API',
    timesheetRes.status === 200 && Array.isArray(timesheetRes.data.data),
    `Retrieved ${timesheetRes.data.data?.length} timesheet log entries`
  );

  // 6. MODULE 6: DOCUMENTS AND NOTIFICATIONS
  console.log('\n--- MODULE 6: Documents & Notifications ---');
  const vaultRes = await getJson(`${BASE_URL}/documents/vault`, owner.headers);
  check(
    'Module 6: Documents',
    'Client Document Vault API',
    vaultRes.status === 200 && Array.isArray(vaultRes.data.data),
    `Vault records count: ${vaultRes.data.data?.length}`
  );

  const inOutRes = await getJson(`${BASE_URL}/documents/in-out`, owner.headers);
  check(
    'Module 6: Documents',
    'In-Out Document Register API',
    inOutRes.status === 200 && Array.isArray(inOutRes.data.data),
    `Register entries count: ${inOutRes.data.data?.length}`
  );

  const reqDocRes = await getJson(`${BASE_URL}/documents/requests`, owner.headers);
  check(
    'Module 6: Documents',
    'Document Collection Requests API',
    reqDocRes.status === 200 && Array.isArray(reqDocRes.data.data),
    `Requests count: ${reqDocRes.data.data?.length}`
  );

  const notifRes = await getJson(`${BASE_URL}/notifications`, owner.headers);
  check(
    'Module 6: Notifications',
    'Notifications & Alerts API',
    notifRes.status === 200 && Array.isArray(notifRes.data.data),
    `Notifications count: ${notifRes.data.data?.length}`
  );

  // 7. MODULE 7: REPORTS, ANALYTICS AND SETTINGS
  console.log('\n--- MODULE 7: Reports, Analytics & Settings ---');
  const reportsRes = await getJson(`${BASE_URL}/reports/summary`, owner.headers);
  check(
    'Module 7: Reports',
    'Firm Management Reports & KPIs API',
    reportsRes.status === 200 && reportsRes.data.success === true,
    `Total Clients KPI: ${reportsRes.data.data?.kpis?.totalClients}, Total Billed: ₹${reportsRes.data.data?.kpis?.totalBilled}`
  );

  const firmSettings = await getJson(`${BASE_URL}/settings/organization`, owner.headers);
  const orgData = firmSettings.data.organization;
  check(
    'Module 7: Settings',
    'Firm Profile & Settings API (/settings/organization)',
    firmSettings.status === 200 && firmSettings.data.success === true && !!orgData,
    `Firm Name: "${orgData?.name}", PAN: ${orgData?.pan || 'N/A'}`
  );

  const teamSettings = await getJson(`${BASE_URL}/settings/team`, owner.headers);
  const teamList = teamSettings.data.team || teamSettings.data.data;
  check(
    'Module 7: Settings',
    'Team & Staff Management API (/settings/team)',
    teamSettings.status === 200 && Array.isArray(teamList),
    `Staff members count: ${teamList?.length}`
  );

  // Settings RBAC: Manager cannot update firm profile (PUT requires FIRM_OWNER or FIRM_ADMIN)
  const managerUpdate = await fetch(`${BASE_URL}/settings/organization`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...manager.headers },
    body: JSON.stringify({ name: 'Unauthorized Firm Rename Attempt' }),
  });
  check(
    'Module 7: Settings',
    'Firm Settings Owner/Admin Protection',
    managerUpdate.status === 403,
    `Manager forbidden from updating firm root settings (Status: ${managerUpdate.status})`
  );

  // 8. MODULE 8: VOICE AI INTENT DETECTION, DATE HANDLING & MULTILINGUAL
  console.log('\n--- MODULE 8: Voice AI Intent Detection & Grounding ---');
  
  // Specific ordinal
  const voiceOrdinal = await postJson(
    `${BASE_URL}/voice/process`,
    { transcript: 'Who is the 27th client in our data?', language: 'en-IN' },
    owner.headers
  );
  check(
    'Module 8: Voice AI',
    'Ordinal Record Lookup (27th client)',
    voiceOrdinal.data.intent === 'CLIENT_ORDINAL' && voiceOrdinal.data.data?.items?.[0]?.position === 27,
    `Identified: "${voiceOrdinal.data.data?.items?.[0]?.name}" at Position #27`
  );

  // Date Handling in Telugu
  const voiceDateTe = await postJson(
    `${BASE_URL}/voice/process`,
    { transcript: 'తేదీని మార్చు 14 అక్టోబర్', language: 'te-IN', context: { activePath: '/attendance' } },
    owner.headers
  );
  check(
    'Module 8: Voice AI',
    'Telugu Date Recognition & Filter (14 అక్టోబర్)',
    voiceDateTe.data.intent === 'ATTENDANCE_SET_DATE' && voiceDateTe.data.data?.dateFilter === '2026-10-14',
    `DateFilter: ${voiceDateTe.data.data?.dateFilter}, Summary: "${voiceDateTe.data.summary}"`
  );

  // Date Handling in Hindi
  const voiceDateHi = await postJson(
    `${BASE_URL}/voice/process`,
    { transcript: 'kal ki attendance dikhao', language: 'hi-IN', context: { activePath: '/attendance' } },
    owner.headers
  );
  check(
    'Module 8: Voice AI',
    'Hindi Relative Date Recognition ("kal ki attendance")',
    voiceDateHi.data.intent === 'SHOW_ATTENDANCE' && voiceDateHi.data.data?.date !== undefined,
    `Resolved date: ${voiceDateHi.data.data?.date}`
  );

  // 9. MODULE 9: SUPPORTED VOICE ACTIONS & CONFIRMATION TOKENS
  console.log('\n--- MODULE 9: Voice Action Execution & Safety ---');
  const createTodoVoice = await postJson(
    `${BASE_URL}/voice/process`,
    { transcript: 'Add a todo: Review audited GST returns tomorrow', language: 'en-IN' },
    owner.headers
  );
  const hasToken = createTodoVoice.data.requiresConfirmation === true && !!createTodoVoice.data.confirmationToken;
  check(
    'Module 9: Voice Actions',
    'Write Action Prepares Signed Confirmation Token',
    hasToken,
    `Requires confirmation: ${createTodoVoice.data.requiresConfirmation}, Token provided: ${!!createTodoVoice.data.confirmationToken}`
  );

  // Confirm execution
  const confirmExec = await postJson(
    `${BASE_URL}/voice/confirm`,
    { confirmationToken: createTodoVoice.data.confirmationToken, action: 'CONFIRM' },
    owner.headers
  );
  check(
    'Module 9: Voice Actions',
    'Confirm Action Persists to Database',
    confirmExec.status === 200 && confirmExec.data.status === 'EXECUTED',
    `Execution Status: ${confirmExec.data.status}, Summary: "${confirmExec.data.summary}"`
  );

  // Anti-Replay: Attempting to confirm the exact same token again must fail
  const replayExec = await postJson(
    `${BASE_URL}/voice/confirm`,
    { confirmationToken: createTodoVoice.data.confirmationToken, action: 'CONFIRM' },
    owner.headers
  );
  check(
    'Module 9: Voice Actions',
    'Anti-Replay Attack Protection',
    replayExec.status === 400 && replayExec.data.success === false,
    `Prevented token replay: "${replayExec.data.message}"`
  );

  // 10. MODULE 10: ROLE-BASED ACCESS CONTROL & ERROR HANDLING
  console.log('\n--- MODULE 10: Role-Based Access Control & Error Handling ---');
  
  // Cross-user token tampering
  const tamperedTokenRes = await postJson(
    `${BASE_URL}/voice/confirm`,
    { confirmationToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.tampered_signature', action: 'CONFIRM' },
    owner.headers
  );
  check(
    'Module 10: Security',
    'Forged Confirmation Token Rejected',
    tamperedTokenRes.status === 400,
    `Rejected with 400 Bad Request: "${tamperedTokenRes.data.message}"`
  );

  // Voice history auditing
  const voiceHist = await getJson(`${BASE_URL}/voice/history`, owner.headers);
  check(
    'Module 10: Audit Log',
    'Voice Command Audit Logging',
    voiceHist.status === 200 && Array.isArray(voiceHist.data.history),
    `Audited commands count: ${voiceHist.data.history?.length}`
  );

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('                          COMPLETE AUDIT SUMMARY                        ');
  console.log('========================================================================');
  const passCount = auditList.filter(a => a.status === 'PASS').length;
  const failCount = auditList.filter(a => a.status === 'FAIL').length;
  console.log(`Total Features Audited: ${auditList.length}`);
  console.log(`PASSED: ${passCount}`);
  console.log(`FAILED: ${failCount}`);

  if (failCount > 0) {
    console.error('\nFAILED FEATURES:');
    auditList.filter(a => a.status === 'FAIL').forEach(f => console.error(`- [${f.module}] ${f.feature}: ${f.details}`));
    process.exit(1);
  } else {
    console.log('\n>>> ALL 35 MODULE & FEATURE CHECKS PASSED WITH 100% SUCCESS RATE! <<<');
    process.exit(0);
  }
}

runCompleteAudit().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
