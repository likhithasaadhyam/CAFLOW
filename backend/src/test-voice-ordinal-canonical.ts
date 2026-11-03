import prisma from './prisma';

const BASE_URL = 'http://127.0.0.1:5000/api';

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

async function loginUser(email: string, pass: string) {
  const res = await postJson(`${BASE_URL}/auth/login`, { email, password: pass });
  if (!res.data.token) {
    throw new Error(`Failed to login ${email}: ${JSON.stringify(res.data)}`);
  }
  return { token: res.data.token, user: res.data.user, headers: { Authorization: `Bearer ${res.data.token}` } };
}

async function run() {
  console.log('================================================================');
  console.log('   CAFLOW VOICE AI — ORDINAL, RANGE, COUNT & 6-ROLE AUDIT SUITE   ');
  console.log('================================================================\n');

  // Verify baseline DB records
  const org = await prisma.organization.findFirst({ where: { slug: 'manavi-associates' } });
  if (!org) throw new Error('Org manavi-associates not found');

  const deterministicOrder = [{ name: 'asc' as const }, { id: 'asc' as const }];
  const allClients = await prisma.client.findMany({
    where: { organizationId: org.id, status: 'ACTIVE' },
    orderBy: deterministicOrder,
    select: { id: true, name: true, pan: true },
  });

  const totalClients = allClients.length;
  console.log(`Verified DB Active Clients: ${totalClients}`);
  console.log(`[#1 Client]: ${allClients[0]?.name}`);
  console.log(`[#27 Client]: ${allClients[26]?.name}\n`);

  // Log in 6 Canonical Roles
  const owner = await loginUser('kapil@manavi.com', 'Admin@123');
  const manager = await loginUser('neha@manavi.com', 'Employee@123');
  const accountant = await loginUser('rajesh@manavi.com', 'Employee@123');
  const taxPro = await loginUser('ca.ananya@manavi.com', 'TaxPro@123');
  const employee = await loginUser('jagan@manavi.com', 'Employee@123');
  const client = await loginUser('client@amdairy.com', 'Client@123');

  // -------------------------------------------------------------
  // TEST 1: Specific Ordinal Question "Who is the 27th client in our data?"
  // -------------------------------------------------------------
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Who is the 27th client in our data?', language: 'en-IN' },
      owner.headers
    );

    const intentMatches = res.data.intent === 'CLIENT_ORDINAL';
    const items = res.data.data?.items || [];
    const clientName = items[0]?.name;
    const isSingleRecord = items.length === 1;
    const is27th = clientName === allClients[26]?.name; // ZENFOMED REMEDIES PRIVATE LIMITED
    const spokenIdentifies = res.data.speechText.includes(clientName);
    const hasPosition = items[0]?.position === 27;

    record(
      'ORDINAL_LOOKUP',
      'Who is the 27th client directly identifies 27th client without dumping list',
      intentMatches && isSingleRecord && is27th && spokenIdentifies && hasPosition,
      `Identified: "${clientName}" (Expected: "${allClients[26]?.name}"), Rendered items count = ${items.length}, Position = ${items[0]?.position}`
    );
  } catch (err: any) {
    record('ORDINAL_LOOKUP', 'Who is the 27th client in our data?', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 2: "Tell me the first client."
  // -------------------------------------------------------------
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Tell me the first client', language: 'en-IN' },
      owner.headers
    );

    const items = res.data.data?.items || [];
    const isFirst = items[0]?.name === allClients[0]?.name; // A M DAIRY PRODUCTS
    const isSingle = items.length === 1;

    record(
      'ORDINAL_LOOKUP',
      'Tell me the first client returns exactly 1st client',
      isSingle && isFirst,
      `Identified: "${items[0]?.name}", Position = ${items[0]?.position}`
    );
  } catch (err: any) {
    record('ORDINAL_LOOKUP', 'Tell me the first client', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 3: "Who is the last client?"
  // -------------------------------------------------------------
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Who is the last client?', language: 'en-IN' },
      owner.headers
    );

    const items = res.data.data?.items || [];
    const isLast = items[0]?.name === allClients[allClients.length - 1]?.name;
    const isSingle = items.length === 1;

    record(
      'ORDINAL_LOOKUP',
      'Who is the last client returns exactly last client',
      isSingle && isLast,
      `Identified: "${items[0]?.name}", Position = ${items[0]?.position} of ${totalClients}`
    );
  } catch (err: any) {
    record('ORDINAL_LOOKUP', 'Who is the last client?', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 4: "Show me clients 5 to 10."
  // -------------------------------------------------------------
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show me clients 5 to 10', language: 'en-IN' },
      owner.headers
    );

    const intentMatches = res.data.intent === 'CLIENT_RANGE';
    const items = res.data.data?.items || [];
    const count6 = items.length === 6;
    const pos5 = items[0]?.position === 5;
    const pos10 = items[5]?.position === 10;
    const name5Matches = items[0]?.name === allClients[4]?.name;
    const name10Matches = items[5]?.name === allClients[9]?.name;

    record(
      'RANGE_LOOKUP',
      'Show me clients 5 to 10 returns exactly 6 records (#5 to #10) with positions',
      intentMatches && count6 && pos5 && pos10 && name5Matches && name10Matches,
      `Count: ${items.length}, First in range: #${items[0]?.position} ${items[0]?.name}, Last in range: #${items[5]?.position} ${items[5]?.name}`
    );
  } catch (err: any) {
    record('RANGE_LOOKUP', 'Show me clients 5 to 10', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 5: "How many active clients do we have?"
  // -------------------------------------------------------------
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'How many active clients do we have?', language: 'en-IN' },
      owner.headers
    );

    const intentMatches = res.data.intent === 'COUNT_CLIENTS';
    const totalCountMatches = res.data.data?.totalCount === totalClients;
    const spokenHasCount = res.data.speechText.includes(String(totalClients));
    const noCardsDumped = !res.data.data?.items || res.data.data.items.length === 0;

    record(
      'COUNT_AGGREGATE',
      'How many active clients returns accurate database count without dumping cards',
      intentMatches && totalCountMatches && spokenHasCount && noCardsDumped,
      `Reported count: ${res.data.data?.totalCount}, Spoken: "${res.data.speechText}"`
    );
  } catch (err: any) {
    record('COUNT_AGGREGATE', 'How many active clients do we have?', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 6: Out of bounds: "Who is the 50th client in our data?"
  // -------------------------------------------------------------
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Who is the 50th client in our data?', language: 'en-IN' },
      owner.headers
    );

    const items = res.data.data?.items || [];
    const notFoundHonest = res.data.speechText.includes('cannot be found') || res.data.speechText.includes('only ' + totalClients);
    const zeroSubstituted = items.length === 0;

    record(
      'ORDINAL_LOOKUP',
      '50th client when only 27 exist honestly reports out-of-bounds without fabricating',
      notFoundHonest && zeroSubstituted,
      `Spoken: "${res.data.speechText}", Items returned: ${items.length}`
    );
  } catch (err: any) {
    record('ORDINAL_LOOKUP', 'Who is the 50th client', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 7: Role Permission Scoping: EMPLOYEE masks sensitive PAN/GSTIN
  // -------------------------------------------------------------
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Who is the 1st client?', language: 'en-IN' },
      employee.headers
    );

    const items = res.data.data?.items || [];
    const panMasked = items[0]?.pan === undefined || items[0]?.pan === false || items[0]?.pan === null;
    const namePresent = Boolean(items[0]?.name);

    record(
      'ROLE_RBAC',
      'EMPLOYEE role masks sensitive PAN/GSTIN in client lookup',
      namePresent && panMasked,
      `Client: ${items[0]?.name}, PAN field: ${items[0]?.pan}`
    );
  } catch (err: any) {
    record('ROLE_RBAC', 'Employee role field masking', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 8: Role Permission Scoping: CLIENT cannot access 27th client
  // -------------------------------------------------------------
  try {
    const res = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Who is the 27th client in our data?', language: 'en-IN' },
      client.headers
    );

    const items = res.data.data?.items || [];
    // Client only has 1 client in their scope, so 27th cannot be found
    const outOfBoundsOrOwn = items.length === 0 || (items.length === 1 && items[0].id === client.user.clientId);
    const didNotExpose27 = items[0]?.name !== allClients[26]?.name;

    record(
      'ROLE_RBAC',
      'CLIENT role cannot access 27th firm client (strict tenant isolation)',
      outOfBoundsOrOwn && didNotExpose27,
      `Client access restricted, 27th client exposed: ${!didNotExpose27}`
    );
  } catch (err: any) {
    record('ROLE_RBAC', 'Client role isolation', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 9: Telugu Ordinal & Count Recognition
  // -------------------------------------------------------------
  try {
    const ordRes = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: '27వ క్లయింట్ ఎవరు?', language: 'te-IN' },
      owner.headers
    );
    const ordItems = ordRes.data.data?.items || [];
    const teluguOrdPassed = ordItems[0]?.name === allClients[26]?.name && ordRes.data.speechText.includes(allClients[26]?.name);

    const countRes = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'మొత్తం ఎంతమంది క్లయింట్లు ఉన్నారు?', language: 'te-IN' },
      owner.headers
    );
    const teluguCountPassed = countRes.data.intent === 'COUNT_CLIENTS' && countRes.data.data?.totalCount === totalClients;

    record(
      'MULTILINGUAL_TELUGU',
      'Telugu queries correctly resolve 27వ క్లయింట్ and aggregate count',
      teluguOrdPassed && teluguCountPassed,
      `27th Client: ${ordItems[0]?.name}, Count: ${countRes.data.data?.totalCount}`
    );
  } catch (err: any) {
    record('MULTILINGUAL_TELUGU', 'Telugu voice queries', false, err.message);
  }

  // -------------------------------------------------------------
  // TEST 10: Canonical Roles Verification: ACCOUNTANT vs EMPLOYEE Invoices
  // -------------------------------------------------------------
  try {
    const acctRes = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show unpaid invoices', language: 'en-IN' },
      accountant.headers
    );
    const acctPermitted = acctRes.data.intent === 'SHOW_INVOICES' && acctRes.data.data?.totalCount !== undefined;

    const empRes = await postJson(
      `${BASE_URL}/voice/process`,
      { transcript: 'Show unpaid invoices', language: 'en-IN' },
      employee.headers
    );
    const empDenied = empRes.data.data?.error === 'INSUFFICIENT_PERMISSIONS' || empRes.data.summary.includes('restricted');

    record(
      'CANONICAL_ROLES',
      'ACCOUNTANT permitted for invoices, EMPLOYEE strictly denied',
      acctPermitted && empDenied,
      `Accountant permitted: ${acctPermitted}, Employee denied: ${empDenied}`
    );
  } catch (err: any) {
    record('CANONICAL_ROLES', 'Accountant vs Employee invoice RBAC', false, err.message);
  }

  console.log('\n================================================================');
  console.log('                     TEST EXECUTION SUMMARY                     ');
  console.log('================================================================');
  const passedCount = results.filter(r => r.passed).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${results.length - passedCount}`);
  if (passedCount === results.length) {
    console.log('>>> ALL 10 TESTS PASSED! DIRECT DATABASE ANSWERS VERIFIED. <<<');
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
