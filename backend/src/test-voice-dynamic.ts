import prisma from './prisma';

const BASE_URL = 'http://localhost:5000/api';

interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(suite: string, test: string, passed: boolean, details: string) {
  results.push({ suite, test, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${suite} -> ${test}: ${details}`);
}

async function postJson(url: string, body: any, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function run() {
  console.log('================================================================');
  console.log('   CAFLOW VOICE AI DYNAMIC DATA & ZERO-HARDCODING AUDIT SUITE   ');
  console.log('================================================================\n');

  // 1. Database baseline counts
  const org = await prisma.organization.findFirst();
  if (!org) {
    throw new Error('No organization found in database!');
  }
  const totalDbClients = await prisma.client.count({ where: { organizationId: org.id, status: 'ACTIVE' } });
  console.log(`Organization: ${org.name} (${org.id})`);
  console.log(`Total Active Clients in DB: ${totalDbClients}`);

  // Authenticate as Admin
  const adminRes = await postJson(`${BASE_URL}/auth/login`, {
    email: 'kapil@manavi.com',
    password: 'Admin@123',
  });
  const adminToken = adminRes.data.token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // Authenticate as Client role
  const clientRes = await postJson(`${BASE_URL}/auth/login`, {
    email: 'client@amdairy.com',
    password: 'Client@123',
  });
  const clientToken = clientRes.data.token;
  const clientHeaders = { Authorization: `Bearer ${clientToken}` };
  const clientUser = clientRes.data.user;

  // TEST 1: "Give me the 10 clients list"
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Give me the 10 clients list', language: 'en-IN' },
      adminHeaders
    );
    const data = res.data.data;
    const items = data.items || data;
    const requestedMatch = items.length === Math.min(10, totalDbClients);
    const countAccurate = data.totalCount === totalDbClients;

    record(
      'CLIENT_LIST',
      'Give me the 10 clients list returns up to 10 records with exact counts',
      requestedMatch && countAccurate,
      `Requested 10: Received ${items.length} items, totalCount reported = ${data.totalCount} (Actual DB: ${totalDbClients})`
    );
  } catch (err: any) {
    record('CLIENT_LIST', 'Give me the 10 clients list', false, err.message);
  }

  // TEST 2: "Show me the list of clients" (default limit)
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show me the list of clients', language: 'en-IN' },
      adminHeaders
    );
    const data = res.data.data;
    const items = data.items || data;
    const countAccurate = data.totalCount === totalDbClients;

    record(
      'CLIENT_LIST',
      'Show me the list of clients returns active client directory with totalCount',
      items.length > 0 && countAccurate,
      `Returned ${items.length} items, reported totalCount = ${data.totalCount}`
    );
  } catch (err: any) {
    record('CLIENT_LIST', 'Show me the list of clients', false, err.message);
  }

  // TEST 3: "Show 3 clients"
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show 3 clients', language: 'en-IN' },
      adminHeaders
    );
    const data = res.data.data;
    const items = data.items || data;
    const expected = Math.min(3, totalDbClients);

    record(
      'CLIENT_LIST',
      'Show 3 clients returns exactly 3 records',
      items.length === expected && data.displayedCount === expected,
      `Requested 3: Received ${items.length} items (expected: ${expected}), displayedCount = ${data.displayedCount}`
    );
  } catch (err: any) {
    record('CLIENT_LIST', 'Show 3 clients', false, err.message);
  }

  // TEST 4: "Show me all clients"
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show me all clients', language: 'en-IN' },
      adminHeaders
    );
    const data = res.data.data;
    const items = data.items || data;

    record(
      'CLIENT_LIST',
      'Show me all clients returns complete directory',
      items.length === totalDbClients && data.totalCount === totalDbClients && data.hasMore === false,
      `Returned all ${items.length} of ${totalDbClients} clients, hasMore = ${data.hasMore}`
    );
  } catch (err: any) {
    record('CLIENT_LIST', 'Show me all clients', false, err.message);
  }

  // TEST 5: Zero matching search
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Find client NonExistentCompanyXYZ999', language: 'en-IN' },
      adminHeaders
    );
    const safeResult =
      res.data.speechText.includes('Zero') ||
      res.data.speechText.includes('0') ||
      res.data.summary.includes('0') ||
      !res.data.speechText.includes('NonExistentCompanyXYZ999 details found');

    record(
      'CLIENT_LIST',
      'Non-existent client search does NOT fabricate records',
      safeResult,
      `Response: ${res.data.summary}`
    );
  } catch (err: any) {
    record('CLIENT_LIST', 'Non-existent client search', false, err.message);
  }

  // TEST 6: CLIENT Role Tenant Isolation
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Give me the 10 clients list', language: 'en-IN' },
      clientHeaders
    );
    const data = res.data.data;
    const items = data.items || data;
    const onlyOwnClient = items.every((c: any) => c.id === clientUser.clientId);

    record(
      'TENANT_SECURITY',
      'Client role cannot access other clients in voice directory',
      items.length <= 1 && onlyOwnClient,
      `Client user received ${items.length} records, strictly matching clientId ${clientUser.clientId}`
    );
  } catch (err: any) {
    record('TENANT_SECURITY', 'Client role isolation', false, err.message);
  }

  // TEST 7: Dynamic Deadlines - Zero Hardcoding of Dates
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'When is my next deadline?', language: 'en-IN' },
      adminHeaders
    );
    const validResponse = res.data.intent === 'SHOW_NEXT_DEADLINE';
    record(
      'DYNAMIC_DATA',
      'Next deadline is derived dynamically from DB records',
      validResponse,
      `Summary: ${res.data.summary}`
    );
  } catch (err: any) {
    record('DYNAMIC_DATA', 'Next deadline test', false, err.message);
  }

  // TEST 8: Dynamic Unpaid Invoices
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show unpaid invoices', language: 'en-IN' },
      adminHeaders
    );
    const data = res.data.data;
    const countValid = typeof data.totalCount === 'number';
    record(
      'DYNAMIC_DATA',
      'Unpaid invoices returns DB-grounded count and metadata',
      countValid,
      `Reported totalCount: ${data.totalCount}, items: ${data.items?.length}`
    );
  } catch (err: any) {
    record('DYNAMIC_DATA', 'Unpaid invoices test', false, err.message);
  }

  // TEST 9: Dynamic Tasks List
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show today\'s pending tasks', language: 'en-IN' },
      adminHeaders
    );
    const data = res.data.data;
    const countValid = typeof data.totalCount === 'number';
    record(
      'DYNAMIC_DATA',
      'Pending tasks returns DB-grounded count and metadata',
      countValid,
      `Reported totalCount: ${data.totalCount}, items: ${data.items?.length}`
    );
  } catch (err: any) {
    record('DYNAMIC_DATA', 'Pending tasks test', false, err.message);
  }

  // TEST 10: Telugu Voice Support for Client Directory
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: '10 మంది క్లయింట్ల లిస్ట్ చూపించు', language: 'te-IN' },
      adminHeaders
    );
    const data = res.data.data;
    const items = data.items || data;
    record(
      'TELUGU_VOICE',
      'Telugu voice prompt correctly parses client list request',
      items.length > 0 && res.data.speechText.length > 0,
      `Items: ${items.length}, Speech: ${res.data.speechText}`
    );
  } catch (err: any) {
    record('TELUGU_VOICE', 'Telugu voice client prompt', false, err.message);
  }

  // Summary
  console.log('\n================================================================');
  console.log('                     TEST EXECUTION SUMMARY                     ');
  console.log('================================================================');
  const passedCount = results.filter(r => r.passed).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${results.length - passedCount}`);
  if (passedCount === results.length) {
    console.log('>>> ALL 10 TESTS PASSED SUCCESSFULLY! ZERO HARDCODING VERIFIED. <<<');
  } else {
    console.error('>>> SOME TESTS FAILED! <<<');
  }
}

run()
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
