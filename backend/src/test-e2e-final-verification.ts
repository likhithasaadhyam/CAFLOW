import prisma from './prisma';

const BASE_URL = 'http://127.0.0.1:5000/api';

interface VerificationResult {
  category: string;
  testCase: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const auditLog: VerificationResult[] = [];

function logResult(category: string, testCase: string, passed: boolean, details: string) {
  auditLog.push({ category, testCase, status: passed ? 'PASS' : 'FAIL', details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] [${category}] ${testCase} -> ${details}`);
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

async function runEndToEndVerification() {
  console.log('========================================================================');
  console.log('     CAFLOW VOICE AI — FINAL END-TO-END VERIFICATION & AUDIT SUITE      ');
  console.log('========================================================================\n');

  // Verify baseline database context
  const org = await prisma.organization.findFirst({ where: { slug: 'manavi-associates' } });
  if (!org) throw new Error('Organization manavi-associates not found');

  const deterministicOrder = [{ name: 'asc' as const }, { id: 'asc' as const }];
  const allActiveClients = await prisma.client.findMany({
    where: { organizationId: org.id, status: 'ACTIVE' },
    orderBy: deterministicOrder,
  });

  const totalClients = allActiveClients.length;
  console.log(`Verified DB Active Clients Count: ${totalClients}`);
  console.log(`[1st Client]: "${allActiveClients[0]?.name}"`);
  console.log(`[27th Client]: "${allActiveClients[26]?.name}"\n`);

  // Log in 6 Canonical Roles
  const owner = await login('kapil@manavi.com', 'Admin@123');
  const manager = await login('neha@manavi.com', 'Employee@123');
  const accountant = await login('rajesh@manavi.com', 'Employee@123');
  const taxPro = await login('ca.ananya@manavi.com', 'TaxPro@123');
  const employee = await login('jagan@manavi.com', 'Employee@123');
  const clientUser = await login('client@amdairy.com', 'Client@123');

  // ---------------------------------------------------------------------------
  // SECTION 1: THE SIX EXACT VOICE REQUESTS (ENGLISH)
  // ---------------------------------------------------------------------------
  console.log('--- 1. Testing The Six Exact English Requests ---');

  // Request 1: "Who is the 27th client in our data?"
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Who is the 27th client in our data?', language: 'en-IN' },
      owner.headers
    );
    const items = res.data.data?.items || [];
    const isSingle = items.length === 1;
    const clientName = items[0]?.name;
    const matches27th = clientName === allActiveClients[26]?.name;
    const isOrdinal = res.data.data?.isOrdinal === true && items[0]?.position === 27;

    logResult(
      'EXACT_REQUESTS',
      'Who is the 27th client in our data?',
      isSingle && matches27th && isOrdinal,
      `Identified: "${clientName}", Items: ${items.length}, Position: #${items[0]?.position}`
    );
  } catch (err: any) {
    logResult('EXACT_REQUESTS', 'Who is the 27th client in our data?', false, err.message);
  }

  // Request 2: "Show me clients 5 to 10."
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show me clients 5 to 10.', language: 'en-IN' },
      owner.headers
    );
    const items = res.data.data?.items || [];
    const countMatches = items.length === 6; // 5, 6, 7, 8, 9, 10
    const startMatches = items[0]?.name === allActiveClients[4]?.name && items[0]?.position === 5;
    const endMatches = items[5]?.name === allActiveClients[9]?.name && items[5]?.position === 10;
    const isRange = res.data.data?.isRange === true;

    logResult(
      'EXACT_REQUESTS',
      'Show me clients 5 to 10.',
      countMatches && startMatches && endMatches && isRange,
      `Items: ${items.length}, First: #${items[0]?.position} "${items[0]?.name}", Last: #${items[5]?.position} "${items[5]?.name}"`
    );
  } catch (err: any) {
    logResult('EXACT_REQUESTS', 'Show me clients 5 to 10.', false, err.message);
  }

  // Request 3: "How many active clients do we have?"
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'How many active clients do we have?', language: 'en-IN' },
      owner.headers
    );
    const count = res.data.data?.totalCount;
    const isCountIntent = res.data.intent === 'COUNT_CLIENTS';
    const noCardsDumped = !res.data.data?.items || res.data.data.items.length === 0;

    logResult(
      'EXACT_REQUESTS',
      'How many active clients do we have?',
      isCountIntent && count === totalClients && noCardsDumped,
      `DB Count: ${count}, Expected: ${totalClients}, Cards dumped: ${res.data.data?.items?.length || 0}`
    );
  } catch (err: any) {
    logResult('EXACT_REQUESTS', 'How many active clients do we have?', false, err.message);
  }

  // Request 4: "Show me my pending tasks."
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show me my pending tasks.', language: 'en-IN' },
      owner.headers
    );
    const items = res.data.data?.items || [];
    const totalCount = res.data.data?.totalCount;
    const intentMatches = res.data.intent === 'SHOW_TASKS';

    logResult(
      'EXACT_REQUESTS',
      'Show me my pending tasks.',
      intentMatches && typeof totalCount === 'number' && items.length > 0,
      `Intent: ${res.data.intent}, Reported totalCount: ${totalCount}, Items returned: ${items.length}`
    );
  } catch (err: any) {
    logResult('EXACT_REQUESTS', 'Show me my pending tasks.', false, err.message);
  }

  // Request 5: "Which invoices are unpaid?"
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Which invoices are unpaid?', language: 'en-IN' },
      accountant.headers
    );
    const items = res.data.data?.items || [];
    const totalCount = res.data.data?.totalCount;
    const intentMatches = res.data.intent === 'SHOW_INVOICES';

    logResult(
      'EXACT_REQUESTS',
      'Which invoices are unpaid?',
      intentMatches && typeof totalCount === 'number' && items.length > 0,
      `Reported Unpaid: ${totalCount}, Items returned: ${items.length}, First invoice balance: ₹${items[0]?.balanceDue}`
    );
  } catch (err: any) {
    logResult('EXACT_REQUESTS', 'Which invoices are unpaid?', false, err.message);
  }

  // Request 6: "What are my upcoming deadlines?"
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'What are my upcoming deadlines?', language: 'en-IN' },
      owner.headers
    );
    const intentMatches = res.data.intent === 'SHOW_NEXT_DEADLINE';
    const nextDeadline = res.data.data?.nextDeadline || res.data.data;
    const summary = res.data.summary;

    logResult(
      'EXACT_REQUESTS',
      'What are my upcoming deadlines?',
      intentMatches && Boolean(nextDeadline?.dueDate),
      `Summary: "${summary}", Due: ${new Date(nextDeadline?.dueDate).toLocaleDateString('en-IN')}`
    );
  } catch (err: any) {
    logResult('EXACT_REQUESTS', 'What are my upcoming deadlines?', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // SECTION 2: MULTILINGUAL VERIFICATION (TELUGU, TELGISH, HINDI)
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Testing Multilingual Voice Intent Handling ---');

  // Telugu 27th client
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'మన డేటాలో 27వ క్లయింట్ ఎవరు?', language: 'te-IN' },
      owner.headers
    );
    const clientName = res.data.data?.items?.[0]?.name;
    const matches27th = clientName === allActiveClients[26]?.name;
    logResult(
      'MULTILINGUAL_TELUGU',
      '27వ క్లయింట్ ఎవరు? (27th client in Telugu)',
      matches27th && res.data.intent === 'CLIENT_ORDINAL',
      `Identified: "${clientName}", Speech: "${res.data.speechText}"`
    );
  } catch (err: any) {
    logResult('MULTILINGUAL_TELUGU', '27వ క్లయింట్ ఎవరు?', false, err.message);
  }

  // Telugu range 5 to 10
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: '5 నుండి 10 వరకు క్లయింట్లను చూపించు', language: 'te-IN' },
      owner.headers
    );
    const items = res.data.data?.items || [];
    logResult(
      'MULTILINGUAL_TELUGU',
      '5 నుండి 10 వరకు క్లయింట్లను చూపించు (Range in Telugu)',
      items.length === 6 && res.data.intent === 'CLIENT_RANGE',
      `Items: ${items.length}, First: #${items[0]?.position} "${items[0]?.name}", Last: #${items[5]?.position} "${items[5]?.name}"`
    );
  } catch (err: any) {
    logResult('MULTILINGUAL_TELUGU', 'Range in Telugu', false, err.message);
  }

  // Telgish 27th client
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: '27th client evaru mana datalo?', language: 'en-IN' },
      owner.headers
    );
    const clientName = res.data.data?.items?.[0]?.name;
    logResult(
      'MULTILINGUAL_TELGISH',
      '27th client evaru mana datalo? (Telgish)',
      clientName === allActiveClients[26]?.name && res.data.intent === 'CLIENT_ORDINAL',
      `Identified: "${clientName}", Pos: #${res.data.data?.items?.[0]?.position}`
    );
  } catch (err: any) {
    logResult('MULTILINGUAL_TELGISH', 'Telgish 27th client', false, err.message);
  }

  // Hindi 27th client
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'hamare data me 27th client kaun hai?', language: 'hi-IN' },
      owner.headers
    );
    const clientName = res.data.data?.items?.[0]?.name;
    logResult(
      'MULTILINGUAL_HINDI',
      'hamare data me 27th client kaun hai? (Hindi)',
      clientName === allActiveClients[26]?.name && res.data.intent === 'CLIENT_ORDINAL',
      `Identified: "${clientName}", Pos: #${res.data.data?.items?.[0]?.position}`
    );
  } catch (err: any) {
    logResult('MULTILINGUAL_HINDI', 'Hindi 27th client', false, err.message);
  }

  // Hindi active client count
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'kitne active clients hain?', language: 'hi-IN' },
      owner.headers
    );
    logResult(
      'MULTILINGUAL_HINDI',
      'kitne active clients hain? (Hindi count)',
      res.data.data?.totalCount === totalClients && res.data.intent === 'COUNT_CLIENTS',
      `Reported count: ${res.data.data?.totalCount}`
    );
  } catch (err: any) {
    logResult('MULTILINGUAL_HINDI', 'Hindi count', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // SECTION 3: THE SIX CANONICAL ROLES — ALLOWED VS DENIED & FIELD MASKING
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Testing Six Canonical Roles Authorization ---');

  // Role 1: FIRM_OWNER -> Can access all firm invoices
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Which invoices are unpaid?', language: 'en-IN' },
      owner.headers
    );
    logResult(
      'RBAC_CANONICAL_ROLES',
      'FIRM_OWNER permitted to view firm invoices',
      res.data.intent === 'SHOW_INVOICES' && res.data.data?.totalCount > 0,
      `Unpaid invoices accessible: count = ${res.data.data?.totalCount}`
    );
  } catch (err: any) {
    logResult('RBAC_CANONICAL_ROLES', 'FIRM_OWNER invoices', false, err.message);
  }

  // Role 2: MANAGER -> Permitted for team task overview
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show team pending tasks', language: 'en-IN' },
      manager.headers
    );
    logResult(
      'RBAC_CANONICAL_ROLES',
      'MANAGER permitted to view team pending tasks',
      res.data.intent === 'SHOW_TASKS',
      `Intent: ${res.data.intent}, Total tasks = ${res.data.data?.totalCount}`
    );
  } catch (err: any) {
    logResult('RBAC_CANONICAL_ROLES', 'MANAGER tasks', false, err.message);
  }

  // Role 3: ACCOUNTANT -> Permitted to view financial summary
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show financial summary', language: 'en-IN' },
      accountant.headers
    );
    logResult(
      'RBAC_CANONICAL_ROLES',
      'ACCOUNTANT permitted to view financial summary',
      res.data.intent === 'SHOW_FINANCIAL_SUMMARY' && typeof res.data.data?.totalBilled === 'number',
      `Billed: ₹${res.data.data?.totalBilled}, Collected: ₹${res.data.data?.totalCollected}`
    );
  } catch (err: any) {
    logResult('RBAC_CANONICAL_ROLES', 'ACCOUNTANT financial summary', false, err.message);
  }

  // Role 4: TAX_PROFESSIONAL -> Permitted to view filing status
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show filing status', language: 'en-IN' },
      taxPro.headers
    );
    logResult(
      'RBAC_CANONICAL_ROLES',
      'TAX_PROFESSIONAL permitted to view compliance filing status',
      res.data.intent === 'SHOW_FILING_STATUS' || res.data.intent === 'SHOW_NEXT_DEADLINE',
      `Intent: ${res.data.intent}`
    );
  } catch (err: any) {
    logResult('RBAC_CANONICAL_ROLES', 'TAX_PROFESSIONAL filings', false, err.message);
  }

  // Role 5: EMPLOYEE -> DENIED financial queries & PAN/GSTIN MASKED in clients
  try {
    const resFinance = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Which invoices are unpaid?', language: 'en-IN' },
      employee.headers
    );
    const denied = resFinance.data.data?.error === 'INSUFFICIENT_PERMISSIONS';

    const resClient = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Tell me the first client', language: 'en-IN' },
      employee.headers
    );
    const clientItem = resClient.data.data?.items?.[0];
    const panMasked = clientItem && clientItem.pan === undefined && clientItem.gstin === undefined;

    logResult(
      'RBAC_CANONICAL_ROLES',
      'EMPLOYEE strictly denied firm invoices & PAN/GSTIN masked',
      denied && panMasked,
      `Denied financial access: ${denied}, Client PAN masked: ${panMasked}`
    );
  } catch (err: any) {
    logResult('RBAC_CANONICAL_ROLES', 'EMPLOYEE restrictions', false, err.message);
  }

  // Role 6: CLIENT -> Strictly isolated to own client records; cannot view 27th client
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Who is the 27th client in our data?', language: 'en-IN' },
      clientUser.headers
    );
    const items = res.data.data?.items || [];
    const clientExposed = items.some((i: any) => i.name === allActiveClients[26]?.name);
    const isolated = !clientExposed && (items.length <= 1);

    logResult(
      'RBAC_CANONICAL_ROLES',
      'CLIENT strictly tenant isolated from other clients',
      isolated,
      `27th client exposed to client: ${clientExposed}, Items visible: ${items.length}`
    );
  } catch (err: any) {
    logResult('RBAC_CANONICAL_ROLES', 'CLIENT tenant isolation', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // SECTION 4: REAL PERSISTENCE VERIFICATION (TASK CREATION & UPDATE)
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Testing Real Database Persistence & Verification ---');

  let createdTaskId = '';
  try {
    // Create a real task via backend API
    const testTitle = `Audit Verification Task - ${Date.now()}`;
    const targetClient = allActiveClients[0];
    const dueDate = new Date(Date.now() + 86400000 * 5).toISOString();

    const createRes = await postJson(
      `${BASE_URL}/tasks`,
      {
        title: testTitle,
        description: 'End to end persistence automated test',
        clientId: targetClient.id,
        priority: 'HIGH',
        dueDate,
      },
      owner.headers
    );

    createdTaskId = createRes.data.task?.id || createRes.data.data?.id || createRes.data.id;
    if (!createdTaskId) {
      throw new Error(`Failed to create task: ${JSON.stringify(createRes.data)}`);
    }

    // Verify record exists in PostgreSQL directly via Prisma
    const dbRecord = await prisma.task.findUnique({ where: { id: createdTaskId } });
    const existsInDb = Boolean(dbRecord && dbRecord.title === testTitle);

    logResult(
      'PERSISTENCE_VERIFICATION',
      'Create task persists to PostgreSQL database',
      existsInDb,
      `Created Task ID: ${createdTaskId}, Title in DB: "${dbRecord?.title}"`
    );

    // Update task status to IN_PROGRESS
    const updateRes = await fetch(`${BASE_URL}/tasks/${createdTaskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...owner.headers },
      body: JSON.stringify({ status: 'IN_PROGRESS', remarks: 'Testing persistence update' }),
    });
    const updateData = await updateRes.json().catch(() => ({}));

    // Verify updated status in PostgreSQL
    const updatedDbRecord = await prisma.task.findUnique({ where: { id: createdTaskId } });
    const statusUpdated = updatedDbRecord?.status === 'IN_PROGRESS';

    logResult(
      'PERSISTENCE_VERIFICATION',
      'Update task status persists to PostgreSQL database',
      statusUpdated,
      `Updated Status in DB: "${updatedDbRecord?.status}"`
    );

    // Clean up created test record
    await prisma.task.delete({ where: { id: createdTaskId } });
    console.log(`Cleaned up temporary test task: ${createdTaskId}`);
  } catch (err: any) {
    logResult('PERSISTENCE_VERIFICATION', 'Task creation/update persistence', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // SECTION 5: CLIENT DOCUMENT VAULT & REFRESH VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Testing Client Document Vault & Dropdown APIs ---');

  try {
    const clientListRes = await getJson(`${BASE_URL}/clients?limit=100`, owner.headers);
    const clientsCount = clientListRes.data.data?.length || clientListRes.data.length || 0;

    logResult(
      'VAULT_AND_DROPDOWN',
      'Client dropdown loads real authorized client list',
      clientsCount >= 27,
      `Authorized clients retrieved: ${clientsCount} (Expected >= 27)`
    );

    const vaultRes = await getJson(`${BASE_URL}/documents/vault`, owner.headers);
    const vaultEntries = Array.isArray(vaultRes.data) ? vaultRes.data : vaultRes.data.data || [];

    logResult(
      'VAULT_AND_DROPDOWN',
      'Client Document Vault returns real persisted records',
      vaultRes.status === 200 && Array.isArray(vaultEntries),
      `Vault records count: ${vaultEntries.length}`
    );
  } catch (err: any) {
    logResult('VAULT_AND_DROPDOWN', 'Client Document Vault API', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('                     FINAL AUDIT EXECUTION SUMMARY                      ');
  console.log('========================================================================');

  const total = auditLog.length;
  const passed = auditLog.filter(a => a.status === 'PASS').length;
  const failed = auditLog.filter(a => a.status === 'FAIL').length;

  console.log(`TOTAL AUDIT CHECKS: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
  if (failed === 0) {
    console.log('>>> ALL END-TO-END VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<\n');
  } else {
    console.log(`>>> ${failed} AUDIT CHECKS FAILED! <<<\n`);
    process.exit(1);
  }
}

runEndToEndVerification()
  .catch(err => {
    console.error('Fatal error running verification:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
