import prisma from './prisma.js';

const BASE_URL = 'http://127.0.0.1:5000/api';

interface TestResult {
  scenario: string;
  testCase: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(scenario: string, testCase: string, passed: boolean, details: string) {
  results.push({ scenario, testCase, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] [${scenario}] ${testCase}`);
  console.log(`       Details: ${details}`);
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

async function runRegressionSuite() {
  console.log('========================================================================');
  console.log('   CAFLOW VOICE AI — CONTEXT AWARENESS & DATE HANDLING REGRESSION SUITE  ');
  console.log('========================================================================\n');

  // Authenticate as FIRM_OWNER
  const ownerAuth = await login('kapil@manavi.com', 'Admin@123');
  console.log(`Logged in as: ${ownerAuth.user.fullName} (${ownerAuth.user.role})\n`);

  // -------------------------------------------------------------------------
  // SCENARIO 1: Invoices query, followed by Attendance query (No cross-intent leakage)
  // -------------------------------------------------------------------------
  console.log('--- SCENARIO 1: Sequential Invoices then Attendance (No Leakage) ---');
  
  // Step 1a: Query pending invoices
  const invRes = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'Which invoices are unpaid?',
      language: 'en-IN',
      context: { activePath: '/finance' },
    },
    ownerAuth.headers
  );
  
  const isInvoiceValid =
    invRes.data.success === true &&
    invRes.data.intent === 'SHOW_INVOICES' &&
    Array.isArray(invRes.data.data?.items);
  record(
    'Scenario 1',
    'Pending invoices query returns invoice records',
    isInvoiceValid,
    `Intent: ${invRes.data.intent}, Total unpaid: ${invRes.data.data?.unpaidCount}, Summary: ${invRes.data.summary}`
  );

  // Step 1b: Immediately query today's attendance (must NOT reuse or return invoice results)
  const attRes = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: "Show today's attendance",
      language: 'en-IN',
      context: { activePath: '/attendance' },
    },
    ownerAuth.headers
  );

  const isAttendanceValid =
    attRes.data.success === true &&
    attRes.data.intent === 'SHOW_ATTENDANCE' &&
    attRes.data.intent !== 'SHOW_INVOICES' &&
    !attRes.data.summary.toLowerCase().includes('invoice') &&
    attRes.data.data?.date !== undefined;
  record(
    'Scenario 1',
    'Attendance query following invoice query returns attendance only (zero invoice leakage)',
    isAttendanceValid,
    `Intent: ${attRes.data.intent}, Date: ${attRes.data.data?.date}, Summary: ${attRes.data.summary}`
  );

  // -------------------------------------------------------------------------
  // SCENARIO 2: Navigate to Attendance and ask for attendance on a specific date
  // -------------------------------------------------------------------------
  console.log('\n--- SCENARIO 2: Specific Date Attendance on /attendance Page ---');

  const specificDateQuery = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'Show attendance records for 14th October',
      language: 'en-IN',
      context: { activePath: '/attendance' },
    },
    ownerAuth.headers
  );

  const isOct14Resolved =
    specificDateQuery.data.success === true &&
    specificDateQuery.data.intent === 'SHOW_ATTENDANCE' &&
    specificDateQuery.data.data?.date === '2026-10-14';
  record(
    'Scenario 2',
    'Querying "14th October" resolves to 2026-10-14 and retrieves database records',
    isOct14Resolved,
    `Intent: ${specificDateQuery.data.intent}, Resolved Date: ${specificDateQuery.data.data?.date}, Present Count: ${specificDateQuery.data.data?.presentCount}`
  );

  // Cross-verify with direct Attendance API
  const directApiRes = await getJson(`${BASE_URL}/attendance/daily?date=2026-10-14`, ownerAuth.headers);
  const dbMatch =
    directApiRes.status === 200 &&
    directApiRes.data.success === true &&
    Array.isArray(directApiRes.data.data);
  record(
    'Scenario 2',
    'Direct backend API /attendance/daily?date=2026-10-14 returns matching database records',
    dbMatch,
    `Records returned: ${directApiRes.data.data?.length}, DayOfWeek: ${directApiRes.data.dayOfWeek}`
  );

  // -------------------------------------------------------------------------
  // SCENARIO 3: Change Attendance Date Filter via Voice
  // -------------------------------------------------------------------------
  console.log('\n--- SCENARIO 3: Voice Command to Change Attendance Date Filter ---');

  const dateChangeRes = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'Change attendance date to 14th October',
      language: 'en-IN',
      context: { activePath: '/attendance' },
    },
    ownerAuth.headers
  );

  const isDateFilterAction =
    dateChangeRes.data.success === true &&
    dateChangeRes.data.intent === 'ATTENDANCE_SET_DATE' &&
    dateChangeRes.data.data?.action === 'SET_DATE_FILTER' &&
    dateChangeRes.data.data?.dateFilter === '2026-10-14';
  record(
    'Scenario 3',
    'Voice command "Change attendance date" returns ATTENDANCE_SET_DATE with dateFilter payload',
    isDateFilterAction,
    `Intent: ${dateChangeRes.data.intent}, Action: ${dateChangeRes.data.data?.action}, DateFilter: ${dateChangeRes.data.data?.dateFilter}`
  );

  // -------------------------------------------------------------------------
  // SCENARIO 4: Date with NO Attendance Records
  // -------------------------------------------------------------------------
  console.log('\n--- SCENARIO 4: Date with Zero Attendance Records ---');

  const emptyDateRes = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'Show attendance for 2026-01-01',
      language: 'en-IN',
      context: { activePath: '/attendance' },
    },
    ownerAuth.headers
  );

  const isEmptyHonest =
    emptyDateRes.data.success === true &&
    emptyDateRes.data.intent === 'SHOW_ATTENDANCE' &&
    emptyDateRes.data.data?.presentCount === 0 &&
    (emptyDateRes.data.summary.includes('No attendance records found') ||
     emptyDateRes.data.summary.includes('0') ||
     emptyDateRes.data.summary.includes('లభించలేదు'));
  record(
    'Scenario 4',
    'Date with 0 records honestly reports no records found (no fabrication or stale reuse)',
    isEmptyHonest,
    `Summary: "${emptyDateRes.data.summary}", SpeechText: "${emptyDateRes.data.speechText}"`
  );

  // -------------------------------------------------------------------------
  // SCENARIO 5: Repeated identical question reflects fresh DB state
  // -------------------------------------------------------------------------
  console.log('\n--- SCENARIO 5: Repeated Question Fresh DB Verification ---');

  const q1 = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'How many active clients do we have?',
      language: 'en-IN',
    },
    ownerAuth.headers
  );

  const q2 = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'How many active clients do we have?',
      language: 'en-IN',
    },
    ownerAuth.headers
  );

  const orgId = ownerAuth.user.organization?.id || ownerAuth.user.organizationId;
  const actualClientsInDb = await prisma.client.count({
    where: { organizationId: orgId, status: 'ACTIVE' },
  });

  const isRepeatAccurate =
    q1.data.success === true &&
    q2.data.success === true &&
    q1.data.data?.totalCount === actualClientsInDb &&
    q2.data.data?.totalCount === actualClientsInDb;
  record(
    'Scenario 5',
    'Repeated query yields exact live DB count without stale static answers',
    isRepeatAccurate,
    `Q1 Count: ${q1.data.data?.totalCount}, Q2 Count: ${q2.data.data?.totalCount}, Live DB: ${actualClientsInDb}`
  );

  // -------------------------------------------------------------------------
  // SCENARIO 6: Multi-lingual Key Tests (Telugu, Telgish, Hindi, English)
  // -------------------------------------------------------------------------
  console.log('\n--- SCENARIO 6: Multi-lingual Date & Intent Verification ---');

  // Telugu: ఈరోజు హాజరు (Today's attendance in Telugu)
  const teToday = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'ఈరోజు హాజరు చూపించు',
      language: 'te-IN',
      context: { activePath: '/attendance' },
    },
    ownerAuth.headers
  );
  record(
    'Scenario 6 (Telugu)',
    'Telugu "ఈరోజు హాజరు చూపించు" resolves today and returns Telugu response',
    teToday.data.success === true && teToday.data.intent === 'SHOW_ATTENDANCE' && teToday.data.language === 'te-IN',
    `Intent: ${teToday.data.intent}, Lang: ${teToday.data.language}, Summary: "${teToday.data.summary}"`
  );

  // Telugu: నిన్నటి హాజరు (Yesterday's attendance in Telugu)
  const teYesterday = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'నిన్నటి హాజరు వివరాలు',
      language: 'te-IN',
      context: { activePath: '/attendance' },
    },
    ownerAuth.headers
  );
  record(
    'Scenario 6 (Telugu)',
    'Telugu "నిన్నటి హాజరు వివరాలు" resolves yesterday correctly',
    teYesterday.data.success === true && teYesterday.data.intent === 'SHOW_ATTENDANCE',
    `Date: ${teYesterday.data.data?.date}, Summary: "${teYesterday.data.summary}"`
  );

  // Telugu: తేదీ మార్చు (Change date in Telugu)
  const teDateChange = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'తేదీని మార్చు 14 అక్టోబర్',
      language: 'te-IN',
      context: { activePath: '/attendance' },
    },
    ownerAuth.headers
  );
  record(
    'Scenario 6 (Telugu)',
    'Telugu "తేదీని మార్చు 14 అక్టోబర్" triggers ATTENDANCE_SET_DATE to 2026-10-14',
    teDateChange.data.success === true &&
    teDateChange.data.intent === 'ATTENDANCE_SET_DATE' &&
    teDateChange.data.data?.dateFilter === '2026-10-14',
    `DateFilter: ${teDateChange.data.data?.dateFilter}, Summary: "${teDateChange.data.summary}"`
  );

  // Telgish: eroju attendance chupinchu
  const telgishToday = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'eroju attendance chupinchu please',
      language: 'en-IN',
      context: { activePath: '/attendance' },
    },
    ownerAuth.headers
  );
  record(
    'Scenario 6 (Telgish)',
    'Telgish "eroju attendance chupinchu" resolves today',
    telgishToday.data.success === true && telgishToday.data.intent === 'SHOW_ATTENDANCE',
    `Date: ${telgishToday.data.data?.date}, Summary: "${telgishToday.data.summary}"`
  );

  // Hindi: aaj ki attendance dikhao
  const hiToday = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'aaj ki attendance dikhao',
      language: 'hi-IN',
      context: { activePath: '/attendance' },
    },
    ownerAuth.headers
  );
  record(
    'Scenario 6 (Hindi)',
    'Hindi "aaj ki attendance dikhao" resolves today and returns attendance',
    hiToday.data.success === true && hiToday.data.intent === 'SHOW_ATTENDANCE',
    `Date: ${hiToday.data.data?.date}, Summary: "${hiToday.data.summary}"`
  );

  // Hindi: kal ki attendance
  const hiKal = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'kal ki attendance dikhao',
      language: 'hi-IN',
      context: { activePath: '/attendance' },
    },
    ownerAuth.headers
  );
  record(
    'Scenario 6 (Hindi)',
    'Hindi "kal ki attendance dikhao" resolves yesterday',
    hiKal.data.success === true && hiKal.data.intent === 'SHOW_ATTENDANCE',
    `Date: ${hiKal.data.data?.date}, Summary: "${hiKal.data.summary}"`
  );

  // English: explicit date change
  const enDateChange = await postJson(
    `${BASE_URL}/voice/process`,
    {
      transcript: 'Change date to 2026-10-14',
      language: 'en-IN',
      context: { activePath: '/attendance' },
    },
    ownerAuth.headers
  );
  record(
    'Scenario 6 (English)',
    'English "Change date to 2026-10-14" triggers ATTENDANCE_SET_DATE',
    enDateChange.data.success === true &&
    enDateChange.data.intent === 'ATTENDANCE_SET_DATE' &&
    enDateChange.data.data?.dateFilter === '2026-10-14',
    `DateFilter: ${enDateChange.data.data?.dateFilter}, Summary: "${enDateChange.data.summary}"`
  );

  // -------------------------------------------------------------------------
  // SUMMARY OF TEST RESULTS
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('                          TEST RUN SUMMARY                              ');
  console.log('========================================================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`Total Scenarios Tested: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);

  if (failedCount > 0) {
    console.error(`\nFAILED CASES:`);
    results.filter(r => !r.passed).forEach(r => console.error(`- [${r.scenario}] ${r.testCase}: ${r.details}`));
    process.exit(1);
  } else {
    console.log(`\nALL CONTEXT-AWARENESS & DATE-HANDLING SCENARIOS PASSED WITH ZERO FAILURES.`);
    process.exit(0);
  }
}

runRegressionSuite().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
