const BASE_URL = 'http://localhost:5000/api';

interface TestResult {
  category: string;
  testName: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(category: string, testName: string, passed: boolean, details: string) {
  results.push({ category, testName, passed, details });
  const symbol = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${symbol} [${category}] ${testName} - ${details}`);
}

async function apiRequest(endpoint: string, options: { method?: string; body?: any; token?: string } = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const status = res.status;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-json
  }

  return { status, data, ok: res.ok };
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 CAFlow Phase 9: Automated Verification Suite (RBAC & Voice)');
  console.log('===============================================================\n');

  // Test credentials for 6 canonical roles
  const credentials = {
    FIRM_OWNER: { email: 'kapil@manavi.com', pass: 'Admin@123' },
    FIRM_ADMIN: { email: 'admin@manavi.com', pass: 'Admin@123' },
    MANAGER: { email: 'neha@manavi.com', pass: 'Employee@123' },
    ACCOUNTANT: { email: 'rajesh@manavi.com', pass: 'Employee@123' },
    TAX_PROFESSIONAL: { email: 'ca.ananya@manavi.com', pass: 'TaxPro@123' },
    EMPLOYEE: { email: 'jagan@manavi.com', pass: 'Employee@123' },
    CLIENT: { email: 'client@amdairy.com', pass: 'Client@123' },
  };

  const tokens: Record<string, string> = {};
  const userProfiles: Record<string, any> = {};

  // 1. Authenticate All 6 Roles
  console.log('--- 1. Authentication for All 6 Canonical Roles ---');
  for (const [roleKey, cred] of Object.entries(credentials)) {
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: { email: cred.email, password: cred.pass },
      });
      if (res.ok && res.data?.token) {
        tokens[roleKey] = res.data.token;
        userProfiles[roleKey] = res.data.user;
        record('AUTH', `Login ${roleKey}`, true, `Role: ${res.data.user.role}, Name: ${res.data.user.fullName}`);
      } else {
        record('AUTH', `Login ${roleKey}`, false, `Login failed: ${res.data?.message || res.status}`);
      }
    } catch (err: any) {
      record('AUTH', `Login ${roleKey}`, false, `Error: ${err.message}`);
    }
  }

  // 2. Unauthenticated access rejected with 401
  console.log('\n--- 2. Unauthenticated Access Protection ---');
  try {
    const res = await apiRequest('/finance/invoices');
    const is401 = res.status === 401;
    record('SECURITY', 'Unauthenticated request rejection', is401, `Status: ${res.status} (${res.data?.message || 'Unauthorized'})`);
  } catch (err: any) {
    record('SECURITY', 'Unauthenticated request rejection', false, `Error: ${err.message}`);
  }

  // 3. Role-Scoped Dashboard Metric API (/api/dashboard/metrics)
  console.log('\n--- 3. Role-Scoped Dashboard Metrics ---');
  for (const [roleKey, token] of Object.entries(tokens)) {
    try {
      const res = await apiRequest('/dashboard/metrics', { token });
      const data = res.data?.data;
      const summary = data?.summary || {};
      let check = false;
      let desc = '';
      if (roleKey === 'FIRM_OWNER' || roleKey === 'FIRM_ADMIN') {
        check = data?.outstandingReceivables !== null && data?.managerMetrics !== null;
        desc = `Owner overview: TotalBilled=₹${data?.outstandingReceivables?.totalBilled}, Receivables=₹${data?.outstandingReceivables?.total}`;
      } else if (roleKey === 'MANAGER') {
        check = data?.managerMetrics !== null && data?.employeeMetrics === null;
        desc = `Manager queue: ReviewQueue=${data?.managerMetrics?.reviewQueue?.length}, PendingTimesheets=${data?.managerMetrics?.pendingTimesheetsCount}`;
      } else if (roleKey === 'ACCOUNTANT') {
        check = data?.outstandingReceivables !== null && data?.managerMetrics === null;
        desc = `Accountant billing: TotalBilled=₹${data?.outstandingReceivables?.totalBilled}, Receivables=₹${data?.outstandingReceivables?.total}`;
      } else if (roleKey === 'TAX_PROFESSIONAL') {
        check = data?.taxProMetrics !== null && data?.outstandingReceivables === null;
        desc = `Tax Pro: GST Filings=${data?.taxProMetrics?.activeGstFilings}, Tax Returns=${data?.taxProMetrics?.activeTaxReturns}`;
      } else if (roleKey === 'EMPLOYEE') {
        check = data?.employeeMetrics !== null && data?.outstandingReceivables === null;
        desc = `Employee: AssignedTasks=${data?.employeeMetrics?.assignedTasksCount}, WeeklyHours=${data?.employeeMetrics?.weeklyHours} (No firm finances)`;
      } else if (roleKey === 'CLIENT') {
        check = data?.clientEntity !== undefined && summary.activeTasks !== undefined;
        desc = `Client: Entity=${data?.clientEntity?.name}, ActiveTasks=${summary.activeTasks}, UnpaidAmount=₹${summary.unpaidAmount}`;
      }
      record('DASHBOARD', `Scoped Dashboard for ${roleKey}`, check, desc);
    } catch (err: any) {
      record('DASHBOARD', `Scoped Dashboard for ${roleKey}`, false, `Error: ${err.message}`);
    }
  }

  // 4. API Authorization & Forbidden Roles (Employee forbidden finance)
  console.log('\n--- 4. Backend RBAC: Employee Denied Financial Reports ---');
  try {
    const res = await apiRequest('/finance/invoices', { token: tokens['EMPLOYEE'] });
    const is403 = res.status === 403;
    record('RBAC', 'Employee blocked from /finance/invoices', is403, `Returned HTTP ${res.status}: ${res.data?.message}`);
  } catch (err: any) {
    record('RBAC', 'Employee blocked from /finance/invoices', false, `Error: ${err.message}`);
  }

  try {
    const res = await apiRequest('/reports/summary', { token: tokens['EMPLOYEE'] });
    const is403 = res.status === 403;
    record('RBAC', 'Employee blocked from /reports/summary', is403, `Returned HTTP ${res.status}: ${res.data?.message}`);
  } catch (err: any) {
    record('RBAC', 'Employee blocked from /reports/summary', false, `Error: ${err.message}`);
  }

  // 5. Manager Denied Organization Settings Mutation
  console.log('\n--- 5. Backend RBAC: Manager Denied Org Settings Mutation ---');
  try {
    const res = await apiRequest('/settings/organization', {
      method: 'PUT',
      token: tokens['MANAGER'],
      body: { name: 'Unauthorized Firm Rename' }
    });
    const is403 = res.status === 403;
    record('RBAC', 'Manager blocked from altering org settings', is403, `Returned HTTP ${res.status}: ${res.data?.message}`);
  } catch (err: any) {
    record('RBAC', 'Manager blocked from altering org settings', false, `Error: ${err.message}`);
  }

  // 6. Client Isolation: Client Cannot Access Other Clients' Records
  console.log('\n--- 6. Data Isolation: Client Cross-Access Prevention ---');
  const clientEntityId = userProfiles['CLIENT']?.clientId;
  try {
    // 6a. Client accessing own client record
    const ownRes = await apiRequest(`/clients/${clientEntityId}`, { token: tokens['CLIENT'] });
    record('ISOLATION', 'Client accessing own authorized entity', ownRes.status === 200, `Entity: ${ownRes.data?.client?.name}`);
  } catch (err: any) {
    record('ISOLATION', 'Client accessing own authorized entity', false, `Failed: ${err.message}`);
  }

  try {
    // 6b. Client attempting to access an unauthorized arbitrary client ID
    const fakeOtherClientId = '11111111-2222-3333-4444-555555555555';
    const otherRes = await apiRequest(`/clients/${fakeOtherClientId}`, { token: tokens['CLIENT'] });
    const is403 = otherRes.status === 403;
    record('ISOLATION', 'Client blocked from other client ID', is403, `Returned HTTP ${otherRes.status}: ${otherRes.data?.message}`);
  } catch (err: any) {
    record('ISOLATION', 'Client blocked from other client ID', false, `Error: ${err.message}`);
  }

  try {
    // 6c. Client attempting to call staff user list
    const usersRes = await apiRequest('/auth/users', { token: tokens['CLIENT'] });
    const is403 = usersRes.status === 403;
    record('ISOLATION', 'Client blocked from internal staff list', is403, `Returned HTTP ${usersRes.status}: ${usersRes.data?.message}`);
  } catch (err: any) {
    record('ISOLATION', 'Client blocked from internal staff list', false, `Error: ${err.message}`);
  }

  // 7. Grounded Voice AI: Telugu, English, and Permission Enforcement
  console.log('\n--- 7. Grounded Voice AI (Telugu, English, Grounded DB) ---');
  
  // 7a. Telugu query: "I roju pending tasks chupinchu"
  try {
    const voiceRes1 = await apiRequest('/voice/process', {
      method: 'POST',
      token: tokens['FIRM_OWNER'],
      body: { transcript: 'I roju pending tasks chupinchu', language: 'te-IN' }
    });
    const ans = voiceRes1.data?.speechText || voiceRes1.data?.summary;
    const hasGroundedData = voiceRes1.data?.groundedData !== undefined;
    record('VOICE_AI', 'Telugu Query: "I roju pending tasks chupinchu"', hasGroundedData, `Answer: "${ans}"`);
  } catch (err: any) {
    record('VOICE_AI', 'Telugu Query: "I roju pending tasks chupinchu"', false, `Error: ${err.message}`);
  }

  // 7b. English query: "Show my pending GST tasks" (Tax Pro role)
  try {
    const voiceRes2 = await apiRequest('/voice/process', {
      method: 'POST',
      token: tokens['TAX_PROFESSIONAL'],
      body: { transcript: 'Show my pending GST tasks', language: 'en-IN' }
    });
    const ans = voiceRes2.data?.speechText || voiceRes2.data?.summary;
    record('VOICE_AI', 'English Query: "Show my pending GST tasks"', voiceRes2.status === 200, `Answer: "${ans}"`);
  } catch (err: any) {
    record('VOICE_AI', 'English Query: "Show my pending GST tasks"', false, `Error: ${err.message}`);
  }

  // 7c. Mixed Telugu query: "Suresh client filing status enti?"
  try {
    const voiceRes3 = await apiRequest('/voice/process', {
      method: 'POST',
      token: tokens['FIRM_OWNER'],
      body: { transcript: 'Suresh client filing status enti?', language: 'te-IN' }
    });
    const ans = voiceRes3.data?.speechText || voiceRes3.data?.summary;
    record('VOICE_AI', 'Mixed Telugu: "Suresh client filing status enti?"', voiceRes3.status === 200, `Answer: "${ans}"`);
  } catch (err: any) {
    record('VOICE_AI', 'Mixed Telugu: "Suresh client filing status enti?"', false, `Error: ${err.message}`);
  }

  // 7d. Query: "Na next deadline eppudu?"
  try {
    const voiceRes4 = await apiRequest('/voice/process', {
      method: 'POST',
      token: tokens['FIRM_OWNER'],
      body: { transcript: 'Na next deadline eppudu?', language: 'te-IN' }
    });
    const ans = voiceRes4.data?.speechText || voiceRes4.data?.summary;
    record('VOICE_AI', 'Query: "Na next deadline eppudu?"', voiceRes4.status === 200, `Answer: "${ans}"`);
  } catch (err: any) {
    record('VOICE_AI', 'Query: "Na next deadline eppudu?"', false, `Error: ${err.message}`);
  }

  // 7e. Voice RBAC Security: Employee asking for firm financials
  try {
    const voiceRes5 = await apiRequest('/voice/process', {
      method: 'POST',
      token: tokens['EMPLOYEE'],
      body: { transcript: 'Show unpaid invoices I have permission to access', language: 'en-IN' }
    });
    const ans = voiceRes5.data?.speechText || voiceRes5.data?.summary || '';
    const isBlocked = ans.includes('Access Restricted') || ans.includes('permission');
    record('VOICE_AI', 'Voice RBAC: Employee asking for financial invoices blocked', isBlocked, `Response: "${ans}"`);
  } catch (err: any) {
    record('VOICE_AI', 'Voice RBAC: Employee asking for financial invoices blocked', false, `Error: ${err.message}`);
  }

  // 8. Voice Action Confirmation & Anti-Replay Token
  console.log('\n--- 8. Mutating Voice Commands & Anti-Replay Tokens ---');
  let validToken = '';
  try {
    // 8a. Propose task creation via voice
    const createReq = await apiRequest('/voice/process', {
      method: 'POST',
      token: tokens['MANAGER'],
      body: { transcript: 'Create a task for this client tomorrow', language: 'en-IN' }
    });
    const data = createReq.data;
    const requiresConfirm = data?.requiresConfirmation === true && !!data?.confirmationToken;
    validToken = data?.confirmationToken;
    record('MUTATION', 'Voice mutation proposes preview & confirmation token', requiresConfirm, `Token issued: ${validToken ? validToken.slice(0, 20) + '...' : 'none'}`);
  } catch (err: any) {
    record('MUTATION', 'Voice mutation proposes preview & confirmation token', false, `Error: ${err.message}`);
  }

  if (validToken) {
    // 8b. Execute valid confirmation token
    try {
      const confirmRes = await apiRequest('/voice/confirm', {
        method: 'POST',
        token: tokens['MANAGER'],
        body: { confirmationToken: validToken, action: 'CONFIRM' }
      });
      const executed = confirmRes.data?.success === true && confirmRes.data?.status === 'EXECUTED';
      record('MUTATION', 'Execute valid voice confirmation token', executed, `Result: ${confirmRes.data?.speechText || confirmRes.data?.summary}`);
    } catch (err: any) {
      record('MUTATION', 'Execute valid voice confirmation token', false, `Execution failed: ${err.message}`);
    }

    // 8c. Anti-Replay Protection: Reusing the same confirmation token must fail
    try {
      const replayRes = await apiRequest('/voice/confirm', {
        method: 'POST',
        token: tokens['MANAGER'],
        body: { confirmationToken: validToken, action: 'CONFIRM' }
      });
      const is400 = replayRes.status === 400;
      record('MUTATION', 'Anti-replay: Reusing spent confirmation token', is400, `Properly rejected with status ${replayRes.status}: ${replayRes.data?.message}`);
    } catch (err: any) {
      record('MUTATION', 'Anti-replay: Reusing spent confirmation token', false, `Error: ${err.message}`);
    }

    // 8d. Cross-User Protection: Another user attempting to execute someone else's token
    try {
      // Create a fresh token with Manager
      const freshReq = await apiRequest('/voice/process', {
        method: 'POST',
        token: tokens['MANAGER'],
        body: { transcript: 'Create a task for this client tomorrow', language: 'en-IN' }
      });
      const freshToken = freshReq.data?.confirmationToken;

      // Attempt to execute freshToken using EMPLOYEE credentials
      const crossRes = await apiRequest('/voice/confirm', {
        method: 'POST',
        token: tokens['EMPLOYEE'],
        body: { confirmationToken: freshToken, action: 'CONFIRM' }
      });
      const is403 = crossRes.status === 403;
      record('MUTATION', 'Cross-user token execution rejected', is403, `Properly blocked with status ${crossRes.status}: ${crossRes.data?.message}`);
    } catch (err: any) {
      record('MUTATION', 'Cross-user token execution rejected', false, `Error: ${err.message}`);
    }
  }

  // Summary
  console.log('\n===============================================================');
  console.log('📊 VERIFICATION SUMMARY');
  console.log('===============================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`Total Tests Executed: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
