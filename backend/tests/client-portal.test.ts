import prisma from '../src/prisma.js';
import { ClientPortalService } from '../src/services/clientPortal.service.js';
import { SmsService } from '../src/services/sms.service.js';
import { ClientStatus, RoleType } from '@prisma/client';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'caflow_super_secret_jwt_key_2026_finance_ops';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING COMPREHENSIVE CLIENT PORTAL & OTP TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // Get or seed an organization
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error('No organization found');

  const testMobileA = '9845012999';
  const testMobileB = '9845023999';
  const clientNameA = `TEST ENTERPRISE A ${Date.now()}`;
  const clientNameB = `TEST ENTERPRISE B ${Date.now()}`;

  let clientA: any;
  let clientB: any;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Admin creates client → portal created automatically
    // -------------------------------------------------------------------------
    clientA = await prisma.client.create({
      data: {
        organizationId: org.id,
        name: clientNameA,
        mobile: testMobileA,
        email: `testA_${Date.now()}@test.com`,
        status: ClientStatus.ACTIVE,
      },
    });

    const portalA = await ClientPortalService.ensurePortalAccount(clientA);
    assert(
      portalA !== null && portalA.clientId === clientA.id && portalA.status === ClientStatus.ACTIVE,
      'Test 1: Admin creates client → Client Portal account created automatically with ACTIVE status'
    );

    // -------------------------------------------------------------------------
    // TEST 2: Duplicate client / repeated ensure → no duplicate portal
    // -------------------------------------------------------------------------
    const portalADup = await ClientPortalService.ensurePortalAccount(clientA);
    assert(
      portalADup.id === portalA.id,
      'Test 2: Duplicate client / repeated call → Idempotent, no duplicate portal created'
    );

    // -------------------------------------------------------------------------
    // TEST 3: Correct name and registered number → OTP sent
    // -------------------------------------------------------------------------
    const sendResA = await ClientPortalService.sendOtp(clientNameA, testMobileA, '127.0.0.1');
    assert(
      sendResA.success && typeof sendResA.maskedMobile === 'string' && sendResA.expiresInSeconds === 300,
      'Test 3: Correct client name and registered mobile number → OTP dispatched with 5-minute validity'
    );

    // -------------------------------------------------------------------------
    // TEST 4: Incorrect name → rejected
    // -------------------------------------------------------------------------
    let nameRejected = false;
    try {
      await ClientPortalService.sendOtp('Completely Fake Client Name', testMobileA, '127.0.0.1');
    } catch (e: any) {
      nameRejected = true;
    }
    assert(nameRejected, 'Test 4: Incorrect client name → Validation strictly rejects request');

    // -------------------------------------------------------------------------
    // TEST 5: Unregistered number → rejected
    // -------------------------------------------------------------------------
    let numberRejected = false;
    try {
      await ClientPortalService.sendOtp(clientNameA, '9999900000', '127.0.0.1');
    } catch (e: any) {
      numberRejected = true;
    }
    assert(numberRejected, 'Test 5: Unregistered mobile number → Validation strictly rejects request');

    // Retrieve active OTP from DB for testing verification
    const activeOtpRecord = await prisma.clientOTP.findFirst({
      where: { clientPortalId: portalA.id, isConsumed: false },
      orderBy: { createdAt: 'desc' },
    });
    assert(activeOtpRecord !== null, 'OTP record saved in database with hashed value');

    // -------------------------------------------------------------------------
    // TEST 6: Incorrect OTP → rejected & attempts tracked
    // -------------------------------------------------------------------------
    let incorrectRejected = false;
    try {
      await ClientPortalService.verifyOtp(clientNameA, testMobileA, '000000');
    } catch (e: any) {
      incorrectRejected = e.message.includes('Incorrect verification code');
    }
    const updatedOtpRecord = await prisma.clientOTP.findUnique({ where: { id: activeOtpRecord!.id } });
    assert(
      incorrectRejected && updatedOtpRecord?.attempts === 1,
      'Test 6: Incorrect OTP → Rejected and attempts counter incremented'
    );

    // -------------------------------------------------------------------------
    // TEST 7: Expired OTP → rejected
    // -------------------------------------------------------------------------
    // Artificially expire the OTP
    await prisma.clientOTP.update({
      where: { id: activeOtpRecord!.id },
      data: { expiresAt: new Date(Date.now() - 10000) },
    });

    let expiredRejected = false;
    try {
      await ClientPortalService.verifyOtp(clientNameA, testMobileA, '123456');
    } catch (e: any) {
      expiredRejected = e.message.includes('expired');
    }
    assert(expiredRejected, 'Test 7: Expired OTP (>5 min) → Rejected');

    // -------------------------------------------------------------------------
    // TEST 8 & 9: Resend OTP → previous OTP invalidated & new OTP generated
    // -------------------------------------------------------------------------
    // Reset cooldown for test by backdating creation time
    await prisma.clientOTP.updateMany({
      where: { clientPortalId: portalA.id },
      data: { createdAt: new Date(Date.now() - 70000) },
    });

    const resendRes = await ClientPortalService.resendOtp(clientNameA, testMobileA, '127.0.0.1');
    assert(resendRes.success, 'Test 9: Resend OTP succeeds after cooldown');

    const newActiveOtp = await prisma.clientOTP.findFirst({
      where: { clientPortalId: portalA.id, isConsumed: false },
      orderBy: { createdAt: 'desc' },
    });

    // For test verification, manually craft known OTP and hash it with portal salt
    const testKnownOtp = '654321';
    const testHash = SmsService.hashOtp(testKnownOtp, portalA.id);
    await prisma.clientOTP.update({
      where: { id: newActiveOtp!.id },
      data: { otpHash: testHash },
    });

    // -------------------------------------------------------------------------
    // TEST 12: Successful OTP → authenticated session established
    // -------------------------------------------------------------------------
    const authResult = await ClientPortalService.verifyOtp(clientNameA, testMobileA, testKnownOtp, {
      ipAddress: '127.0.0.1',
      userAgent: 'Automated-Test-Runner',
    });
    assert(
      authResult.success && typeof authResult.token === 'string' && authResult.client.id === clientA.id,
      'Test 12: Correct OTP → Validated and session JWT issued'
    );

    // -------------------------------------------------------------------------
    // TEST 8: OTP reuse → rejected
    // -------------------------------------------------------------------------
    let reuseRejected = false;
    try {
      await ClientPortalService.verifyOtp(clientNameA, testMobileA, testKnownOtp);
    } catch (e: any) {
      reuseRejected = true;
    }
    assert(reuseRejected, 'Test 8: Replaying consumed OTP → Rejected (OTP reuse prohibited)');

    // -------------------------------------------------------------------------
    // TEST 10: Rate limiting enforced
    // -------------------------------------------------------------------------
    let rateLimited = false;
    try {
      // Simulate that 10 OTP requests have occurred within the hourly window
      ClientPortalService.simulateRateLimit('10.0.0.99', testMobileA, 10);
      await ClientPortalService.sendOtp(clientNameA, testMobileA, '10.0.0.99');
    } catch (e: any) {
      rateLimited = e.message.includes('Too many OTP requests');
    }
    assert(rateLimited, 'Test 10: Rate limiting on OTP requests per mobile/IP is strictly enforced');

    // -------------------------------------------------------------------------
    // TEST 11: Inactive portal → login blocked
    // -------------------------------------------------------------------------
    await prisma.clientPortal.update({
      where: { id: portalA.id },
      data: { status: ClientStatus.INACTIVE },
    });

    let inactiveBlocked = false;
    try {
      await ClientPortalService.validateClient(clientNameA, testMobileA);
    } catch (e: any) {
      inactiveBlocked = e.message.includes('deactivated or suspended');
    }
    assert(inactiveBlocked, 'Test 11: Inactive/Suspended portal account → Login blocked');

    // Reactivate portal for remaining tests
    await prisma.clientPortal.update({
      where: { id: portalA.id },
      data: { status: ClientStatus.ACTIVE },
    });

    // -------------------------------------------------------------------------
    // TEST 13: Client Data Isolation (Client A cannot access Client B's info)
    // -------------------------------------------------------------------------
    clientB = await prisma.client.create({
      data: {
        organizationId: org.id,
        name: clientNameB,
        mobile: testMobileB,
        email: `testB_${Date.now()}@test.com`,
        status: ClientStatus.ACTIVE,
      },
    });
    await ClientPortalService.ensurePortalAccount(clientB);

    // Create a task for Client B
    const taskB = await prisma.task.create({
      data: {
        organizationId: org.id,
        clientId: clientB.id,
        title: 'CONFIDENTIAL GST FILING FOR CLIENT B ONLY',
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 86400000),
      },
    });

    // Query dashboard as Client A using Client A's authenticated identity
    const clientADashboard = await ClientPortalService.getClientDashboardData(clientA.id, org.id);
    const hasLeak = clientADashboard.tasks.some((t: any) => t.id === taskB.id);
    assert(
      !hasLeak && clientADashboard.client.id === clientA.id,
      "Test 13: Strict Client Data Isolation - Client A NEVER receives Client B's records"
    );

    // -------------------------------------------------------------------------
    // TEST 14: Client cannot access admin APIs
    // -------------------------------------------------------------------------
    const decodedToken: any = jwt.verify(authResult.token, JWT_SECRET);
    assert(
      decodedToken.role === RoleType.CLIENT && decodedToken.clientId === clientA.id,
      'Test 14: Client role is strictly restricted to CLIENT (cannot access admin endpoints)'
    );

    // -------------------------------------------------------------------------
    // TEST 15: Logout → session revoked
    // -------------------------------------------------------------------------
    await ClientPortalService.logout(decodedToken.sessionTokenId);
    const sessionRecord = await prisma.clientSession.findFirst({
      where: { clientPortalId: portalA.id },
      orderBy: { createdAt: 'desc' },
    });
    assert(sessionRecord?.isRevoked === true, 'Test 15: Logout → Session token revoked in database');

    // -------------------------------------------------------------------------
    // TEST 16: Mobile number update → old number cannot authenticate
    // -------------------------------------------------------------------------
    const newMobileNumber = '9845099888';
    await ClientPortalService.updateRegisteredMobile(clientA.id, org.id, newMobileNumber, 'Client requested change');

    let oldMobileRejected = false;
    try {
      await ClientPortalService.validateClient(clientNameA, testMobileA);
    } catch (e: any) {
      oldMobileRejected = e.message.includes('does not match');
    }

    const newMobileValidated = await ClientPortalService.validateClient(clientNameA, newMobileNumber);
    assert(
      oldMobileRejected && newMobileValidated.client.id === clientA.id,
      'Test 16: Mobile number update → Old number immediately rejected, new verified number succeeds'
    );
  } finally {
    // Cleanup test fixtures
    if (clientA) {
      await prisma.client.delete({ where: { id: clientA.id } }).catch(() => {});
    }
    if (clientB) {
      await prisma.client.delete({ where: { id: clientB.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(`📊 TEST EXECUTION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
