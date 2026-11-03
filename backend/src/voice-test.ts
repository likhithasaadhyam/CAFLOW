import prisma from './prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const BASE_URL = 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'caflow_super_secret_jwt_key_2026_finance_ops';

interface TestRecord {
  name: string;
  passed: boolean;
  details?: string;
  durationMs: number;
}

const testResults: TestRecord[] = [];

async function recordVoiceTest(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    testResults.push({ name, passed: true, durationMs: Date.now() - start });
    console.log(`  ✓ ${name} (${Date.now() - start}ms)`);
  } catch (err: any) {
    testResults.push({ name, passed: false, details: err?.message || String(err), durationMs: Date.now() - start });
    console.error(`  ✗ ${name} FAILED:`, err?.message || err);
  }
}

async function retryQuery<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1200));
      return retryQuery(fn, retries - 1);
    }
    throw err;
  }
}

async function runVoiceAssistantTests() {
  console.log('================================================================');
  console.log('   CAFLOW VOICE ASSISTANT END-TO-END AUTOMATED TEST SUITE       ');
  console.log('================================================================\n');

  // Create isolated test organization to protect production data
  const testOrgSlug = `voice-test-${Date.now()}`;
  const testOrg = await prisma.organization.create({
    data: {
      name: 'Voice Assistant Audit Firm',
      slug: testOrgSlug,
      email: `voice.${Date.now()}@auditor.org`,
      settings: {
        create: {
          invoicePrefix: 'VOI-INV',
          invoiceSequence: 100,
          receiptPrefix: 'VOI-REC',
          receiptSequence: 100,
        },
      },
    },
  });

  const passwordHash = await bcrypt.hash('VoicePass@123', 10);
  const testOwner = await prisma.user.create({
    data: {
      organizationId: testOrg.id,
      email: `managing.partner@${testOrgSlug}.com`,
      passwordHash,
      fullName: 'Voice Test Managing Partner',
      role: 'FIRM_OWNER',
    },
  });

  const testStaff = await prisma.user.create({
    data: {
      organizationId: testOrg.id,
      email: `suresh.kumar@${testOrgSlug}.com`,
      passwordHash,
      fullName: 'Suresh Kumar',
      role: 'EMPLOYEE',
    },
  });

  const ownerToken = jwt.sign(
    { userId: testOwner.id, orgId: testOrg.id },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  // Seed sample client for entity resolution
  const testClient = await prisma.client.create({
    data: {
      organizationId: testOrg.id,
      name: 'Precision Engineering Pvt Ltd',
      pan: 'AAACP9999K',
      gstin: '36AAACP9999K1Z2',
      primaryContact: 'Ramesh Sundaram',
      mobile: '9848012345',
    },
  });

  // Seed sample invoice
  const testInvoice = await prisma.invoice.create({
    data: {
      organizationId: testOrg.id,
      clientId: testClient.id,
      invoiceNumber: 'VOI-INV-101',
      totalAmount: 59000,
      amountPaid: 20000,
      balanceDue: 39000,
      paymentStatus: 'PARTIALLY_PAID',
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 86400000 * 5),
    },
  });

  // Seed sample renewal
  const testRenewal = await prisma.renewal.create({
    data: {
      organizationId: testOrg.id,
      clientId: testClient.id,
      renewalType: 'FSSAI License Renewal',
      expiryDate: new Date(Date.now() + 86400000 * 15),
      status: 'EXPIRING_SOON',
    },
  });

  console.log(`[Setup] Isolated Test Org created: "${testOrg.name}" (${testOrg.id})\n`);

  try {
    // 1. Health check of Voice Router
    await recordVoiceTest('Voice Endpoint Authentication & Route Mount', async () => {
      const res = await fetch(`${BASE_URL}/voice/history`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (!body.success) throw new Error(`History fetch failed: ${JSON.stringify(body)}`);
    });

    // 2. Query Tasks: "Show today's pending tasks"
    await recordVoiceTest('Command: "Show today\'s pending tasks" (Read-only SHOW_TASKS)', async () => {
      const res = await fetch(`${BASE_URL}/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ transcript: "Show today's pending tasks", language: 'en-IN' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed: ${JSON.stringify(data)}`);
      if (data.intent !== 'SHOW_TASKS') throw new Error(`Expected SHOW_TASKS, got ${data.intent}`);
      if (data.requiresConfirmation !== false) throw new Error(`Read commands should not require confirmation`);
      if (!data.speechText) throw new Error('Missing spoken response');
    });

    // 3. Query Invoices: "Show unpaid invoices"
    await recordVoiceTest('Command: "Show unpaid invoices" (PostgreSQL entity aggregation)', async () => {
      const res = await fetch(`${BASE_URL}/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ transcript: 'Show unpaid invoices', language: 'en-IN' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed: ${JSON.stringify(data)}`);
      if (data.intent !== 'SHOW_INVOICES') throw new Error(`Expected SHOW_INVOICES, got ${data.intent}`);
      if (!data.data || data.data.length === 0) throw new Error('Expected unpaid invoice to be found');
      if (data.data[0].balanceDue !== 39000) throw new Error(`Expected balance 39000, got ${data.data[0].balanceDue}`);
    });

    // 4. Query Financial Summary: "Show this month's outstanding payments"
    await recordVoiceTest('Command: "Show financial summary" (Dynamic PostgreSQL sum calculation)', async () => {
      const res = await fetch(`${BASE_URL}/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ transcript: "Show this month's financial summary and outstanding", language: 'en-IN' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed: ${JSON.stringify(data)}`);
      if (data.intent !== 'SHOW_FINANCIAL_SUMMARY') throw new Error(`Expected SHOW_FINANCIAL_SUMMARY, got ${data.intent}`);
      if (data.data.totalOutstanding !== 39000) throw new Error(`Expected outstanding 39000, got ${data.data.totalOutstanding}`);
    });

    // 5. Query Renewals: "Show renewals due this month"
    await recordVoiceTest('Command: "Show renewals due this month" (Regulatory license tracking)', async () => {
      const res = await fetch(`${BASE_URL}/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ transcript: 'Show renewals due this month', language: 'en-IN' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed: ${JSON.stringify(data)}`);
      if (data.intent !== 'SHOW_RENEWALS') throw new Error(`Expected SHOW_RENEWALS, got ${data.intent}`);
      if (!data.data || data.data.length === 0) throw new Error('Expected renewals found');
    });

    // 6. Navigation: "Go to Finance page"
    await recordVoiceTest('Command: "Open Finance page" (Navigation routing)', async () => {
      const res = await fetch(`${BASE_URL}/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ transcript: 'Open Finance page', language: 'en-IN' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed: ${JSON.stringify(data)}`);
      if (data.intent !== 'NAVIGATE') throw new Error(`Expected NAVIGATE, got ${data.intent}`);
      if (data.suggestedRoute !== '/finance') throw new Error(`Expected /finance, got ${data.suggestedRoute}`);
    });

    // 7. Telugu Code-Switching Command: "unpaid invoices chupinchu"
    await recordVoiceTest('Multilingual Telugu Command: "unpaid invoices chupinchu"', async () => {
      const res = await fetch(`${BASE_URL}/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ transcript: 'unpaid invoices chupinchu', language: 'te-IN' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed: ${JSON.stringify(data)}`);
      if (data.intent !== 'SHOW_INVOICES') throw new Error(`Expected SHOW_INVOICES, got ${data.intent}`);
      if (!/[\u0C00-\u0C7F]/.test(data.speechText)) throw new Error(`Expected Telugu script in speechText, got: ${data.speechText}`);
    });

    // 7b. Native Telugu Script Command: "ఈ రోజు పెండింగ్ పనులను చూపించు"
    await recordVoiceTest('Native Telugu Script Command: "ఈ రోజు పెండింగ్ పనులను చూపించు"', async () => {
      const res = await fetch(`${BASE_URL}/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ transcript: 'ఈ రోజు పెండింగ్ పనులను చూపించు', language: 'te-IN' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed: ${JSON.stringify(data)}`);
      if (data.intent !== 'SHOW_TASKS') throw new Error(`Expected SHOW_TASKS, got ${data.intent}`);
      if (!/[\u0C00-\u0C7F]/.test(data.speechText)) throw new Error(`Expected Telugu script speechText, got: ${data.speechText}`);
      if (data.language !== 'te-IN') throw new Error(`Expected te-IN language, got: ${data.language}`);
    });

    // 7c. Telugu Attendance Query: "నా ఈ రోజు హాజరును చెక్ చేయి"
    await recordVoiceTest('Telugu Attendance Status: "నా ఈ రోజు హాజరును చెక్ చేయి"', async () => {
      const res = await fetch(`${BASE_URL}/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ transcript: 'నా ఈ రోజు హాజరును చెక్ చేయి', language: 'te-IN' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed: ${JSON.stringify(data)}`);
      if (data.intent !== 'SHOW_ATTENDANCE') throw new Error(`Expected SHOW_ATTENDANCE, got ${data.intent}`);
      if (!/[\u0C00-\u0C7F]/.test(data.speechText)) throw new Error(`Expected Telugu script, got: ${data.speechText}`);
    });

    // 7d. Sarvam AI Telugu Text-to-Speech Generation with kavitha speaker
    await recordVoiceTest('Sarvam AI Telugu TTS Synthesis (bulbul:v3 + kavitha)', async () => {
      const res = await fetch(`${BASE_URL}/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          text: 'నమస్కారం! మీ ఫైనాన్స్ మరియు ఇన్‌వాయిస్ వివరాలు ఇక్కడ ఉన్నాయి.',
          language: 'te-IN',
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed: ${JSON.stringify(data)}`);
      if (!data.audioBase64 || data.audioBase64.length < 500) {
        throw new Error('Expected audioBase64 from Sarvam AI TTS');
      }
      if (data.speaker !== 'kavitha') {
        throw new Error(`Expected Telugu speaker kavitha, got ${data.speaker}`);
      }
    });

    // 8. Hindi Code-Switching Command: "aaj ke pending tasks dikhao"
    await recordVoiceTest('Multilingual Hindi Command: "aaj ke pending tasks dikhao"', async () => {
      const res = await fetch(`${BASE_URL}/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ transcript: 'aaj ke pending tasks dikhao', language: 'hi-IN' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed: ${JSON.stringify(data)}`);
      if (data.intent !== 'SHOW_TASKS') throw new Error(`Expected SHOW_TASKS, got ${data.intent}`);
    });

    // 9. Consequential Safety: Create Task Requires Confirmation First
    let taskConfirmationToken = '';
    await recordVoiceTest('Consequential Safety: "Create a GST filing task for Precision" requires confirmation', async () => {
      const res = await fetch(`${BASE_URL}/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          transcript: 'Create a GST filing task for Precision Engineering assigned to Suresh',
          language: 'en-IN',
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed: ${JSON.stringify(data)}`);
      if (data.intent !== 'CREATE_TASK') throw new Error(`Expected CREATE_TASK, got ${data.intent}`);
      if (data.requiresConfirmation !== true) throw new Error(`CREATE_TASK MUST require confirmation`);
      if (!data.confirmationToken) throw new Error(`Missing confirmationToken`);
      taskConfirmationToken = data.confirmationToken;

      // Verify task NOT yet created in PostgreSQL before confirmation
      const countBefore = await prisma.task.count({ where: { organizationId: testOrg.id } });
      if (countBefore !== 0) throw new Error(`Database record created prematurely before confirmation!`);
    });

    // 10. Execute Confirmed Consequential Action
    await recordVoiceTest('Consequential Execution: Confirming action creates record in PostgreSQL', async () => {
      const res = await fetch(`${BASE_URL}/voice/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ confirmationToken: taskConfirmationToken, action: 'CONFIRM' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed to confirm: ${JSON.stringify(data)}`);
      if (data.status !== 'EXECUTED') throw new Error(`Expected EXECUTED status`);

      // Verify task IS NOW created in PostgreSQL
      const createdTask = await prisma.task.findFirst({
        where: { organizationId: testOrg.id },
        include: { assignments: true },
      });
      if (!createdTask) throw new Error(`Task was not persisted in PostgreSQL after confirmation!`);
      if (createdTask.assignments[0]?.userId !== testStaff.id) {
        throw new Error(`Assignee mismatch: expected Suresh (${testStaff.id})`);
      }
    });

    // 11. Consequential Safety: Cancel Action Discards Without DB Changes
    await recordVoiceTest('Consequential Safety: Cancel action discards proposal cleanly', async () => {
      const propRes = await fetch(`${BASE_URL}/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          transcript: 'Create a reminder for tomorrow to call tax officer',
          language: 'en-IN',
        }),
      });
      const propData = await propRes.json();
      if (!propData.confirmationToken) throw new Error('Missing confirmationToken');

      // Cancel it
      const cancelRes = await fetch(`${BASE_URL}/voice/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ confirmationToken: propData.confirmationToken, action: 'CANCEL' }),
      });
      const cancelData = await cancelRes.json();
      if (!cancelData.success || cancelData.status !== 'CANCELLED') {
        throw new Error(`Cancellation failed: ${JSON.stringify(cancelData)}`);
      }

      // Verify NO todo created
      const todoCount = await prisma.todo.count({ where: { organizationId: testOrg.id } });
      if (todoCount !== 0) throw new Error('Todo was created despite cancellation!');
    });

    // 12. Security & Anti-Tamper: Reject Expired / Altered Tokens
    await recordVoiceTest('Security: Reject tampered or invalid confirmation tokens', async () => {
      const badToken = 'eyJhbGciOiJIUzI1NiJ9.invalid.signature123';
      const res = await fetch(`${BASE_URL}/voice/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ confirmationToken: badToken, action: 'CONFIRM' }),
      });
      if (res.status === 200) throw new Error('Expected failure on invalid token, but got 200!');
    });

    // 13. Clarification Flow: Ambiguous entity asks clarification question
    await recordVoiceTest('Clarification: Missing client prompts candidate options instead of fabricating', async () => {
      const res = await fetch(`${BASE_URL}/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          transcript: 'Create a GST filing task',
          language: 'en-IN',
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed: ${JSON.stringify(data)}`);
      if (data.category !== 'CLARIFICATION') throw new Error(`Expected CLARIFICATION category, got ${data.category}`);
      if (!data.clarificationOptions || data.clarificationOptions.length === 0) {
        throw new Error('Expected candidate client options in clarification');
      }
    });

    // 14. Voice Audit Log & History Retrieval
    await recordVoiceTest('Auditability: Voice commands recorded in PostgreSQL AuditLog and retrievable', async () => {
      const res = await fetch(`${BASE_URL}/voice/history`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed to fetch history: ${JSON.stringify(data)}`);
      if (!data.history || data.history.length === 0) throw new Error('Expected voice history entries');

      const auditCount = await retryQuery(() =>
        prisma.auditLog.count({
          where: { organizationId: testOrg.id, entityType: 'VoiceCommand' },
        })
      );
      if (auditCount === 0) throw new Error('AuditLog entries not found in PostgreSQL!');
    });

    // 15. Privacy Control: Delete Voice History
    await recordVoiceTest('Privacy: User can delete voice history from PostgreSQL', async () => {
      const res = await fetch(`${BASE_URL}/voice/history`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(`Failed to delete history: ${JSON.stringify(data)}`);

      const remaining = await prisma.auditLog.count({
        where: { organizationId: testOrg.id, entityType: 'VoiceCommand' },
      });
      if (remaining !== 0) throw new Error(`History not cleaned up: ${remaining} logs remained`);
    });

  } finally {
    // Teardown isolated test organization
    console.log('\n[Teardown] Cleaning up isolated voice test organization...');
    try {
      await prisma.auditLog.deleteMany({ where: { organizationId: testOrg.id } });
      await prisma.taskAssignment.deleteMany({ where: { task: { organizationId: testOrg.id } } });
      await prisma.taskStatusHistory.deleteMany({ where: { task: { organizationId: testOrg.id } } });
      await prisma.task.deleteMany({ where: { organizationId: testOrg.id } });
      await prisma.invoice.deleteMany({ where: { organizationId: testOrg.id } });
      await prisma.renewal.deleteMany({ where: { organizationId: testOrg.id } });
      await prisma.client.deleteMany({ where: { organizationId: testOrg.id } });
      await prisma.user.deleteMany({ where: { organizationId: testOrg.id } });
      await prisma.organizationSettings.deleteMany({ where: { organizationId: testOrg.id } });
      await prisma.organization.delete({ where: { id: testOrg.id } });
      console.log('[Teardown] Cleanup completed. Production data untouched!\n');
    } catch (cleanErr) {
      console.warn('[Teardown] Cleanup warning:', cleanErr);
    }
  }

  // Summary
  console.log('================================================================');
  const allPassed = testResults.every(t => t.passed);
  console.log(`VOICE ASSISTANT TEST RESULTS: ${testResults.filter(t => t.passed).length} PASSED / ${testResults.filter(t => !t.passed).length} FAILED (TOTAL: ${testResults.length})`);
  console.log('================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runVoiceAssistantTests()
  .catch(err => {
    console.error('Fatal voice test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
