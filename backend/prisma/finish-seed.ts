import { PrismaClient, TaskStatus, Priority, InOutCategory, InOutStatus, InvoiceStatus, PaymentMode, RenewalStatus, AttendanceStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Completing seed...');
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error('No org found');

  const users = await prisma.user.findMany({ where: { organizationId: org.id } });
  const adminUser = users.find(u => u.role === 'FIRM_OWNER') || users[0];
  const managerUser = users.find(u => u.role === 'MANAGER') || users[1];
  const accountantUser = users.find(u => u.role === 'ACCOUNTANT') || users[2];
  const emp1 = users.find(u => u.fullName.includes('Jagan')) || users[3];
  const emp2 = users.find(u => u.fullName.includes('Mohan')) || users[4];
  const emp3 = users.find(u => u.fullName.includes('Suresh')) || users[5];

  const clients = await prisma.client.findMany({ where: { organizationId: org.id } });
  const services = await prisma.service.findMany({ where: { organizationId: org.id } });

  const getClient = (name: string) => clients.find(c => c.name.toLowerCase().includes(name.toLowerCase())) || clients[0];
  const getService = (name: string) => services.find(s => s.name.toLowerCase().includes(name.toLowerCase())) || services[0];

  const today = new Date('2026-10-14T00:00:00Z');
  const tomorrow = new Date('2026-10-15T00:00:00Z');
  const in3Days = new Date('2026-10-17T00:00:00Z');
  const in7Days = new Date('2026-10-21T00:00:00Z');
  const past3Days = new Date('2026-10-11T00:00:00Z');
  const past15Days = new Date('2026-09-29T00:00:00Z');

  // Check and insert specific tasks to match screenshots
  const taskCount = await prisma.task.count({ where: { organizationId: org.id } });
  if (taskCount < 20) {
    const extraTasks = [
      { title: 'Trademark Registration', client: 'ALKAPALLY KOMURAIAH', service: 'Trademark Registration', dueDate: past3Days, status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH, users: [managerUser.id, emp1.id] },
      { title: 'FSSAI FOOD LICENSE RENEWAL', client: 'ENINE REMEDIES PRIVATE LIMITED', service: 'FSSAI FOOD LICENSE RENEWAL', dueDate: new Date('2026-11-08'), status: TaskStatus.PENDING, priority: Priority.MEDIUM, users: [emp2.id] },
      { title: 'DSC APPLICATION', client: 'NOVOPOR ADVANCED SCIENCE PRIVATE LIMITED', service: 'DSC APPLICATION', dueDate: tomorrow, status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH, users: [emp1.id, emp2.id] },
      { title: 'DSC Renewal', client: 'CHAITU ENGINEERING PRIVATE LIMITED', service: 'DSC Renewal', dueDate: past3Days, status: TaskStatus.IN_PROGRESS, priority: Priority.MEDIUM, users: [emp1.id] },
      { title: 'GST GSTR-3B Verification & Filing', client: 'ADHVITHI HOMES PRIVATE LIMITED', service: 'GST Monthly Return (GSTR-3B & GSTR-1)', dueDate: today, status: TaskStatus.IN_PROGRESS, priority: Priority.URGENT, users: [emp1.id] },
      { title: 'Advance Tax Calculation Review', client: 'AFC FOODS PRIVATE LIMITED', service: 'Income Tax Return (Corporate)', dueDate: tomorrow, status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH, users: [emp2.id] },
      { title: 'Statutory Audit Document Vouching', client: 'AINDRI SILKS PRIVATE LIMITED', service: 'Statutory Audit & Tax Audit', dueDate: in7Days, status: TaskStatus.PENDING, priority: Priority.MEDIUM, users: [emp3.id] },
      { title: 'Udyam Certificate Revision', client: 'AK PHARMA', service: 'UDYAM REGISTRATION', dueDate: past15Days, status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH, users: [emp1.id] },
      { title: 'TDS 24Q (QUARTERLY RETURN) Jul - Sep 2026', client: 'ENINE REMEDIES PRIVATE LIMITED', service: 'TDS 24Q (QUARTERLY RETURN)', dueDate: new Date('2026-10-31'), status: TaskStatus.PENDING, priority: Priority.URGENT, users: [emp1.id] },
      { title: 'TDS 24Q (QUARTERLY RETURN) Jul - Sep 2026', client: 'PERIWINKLE HEALTH CARE PRIVATE LIMITED', service: 'TDS 24Q (QUARTERLY RETURN)', dueDate: new Date('2026-10-31'), status: TaskStatus.PENDING, priority: Priority.HIGH, users: [emp2.id] },
      { title: 'TDS 24Q (QUARTERLY RETURN) Jul - Sep 2026', client: 'CURYZ LIFESCIENCES PRIVATE LIMITED', service: 'TDS 24Q (QUARTERLY RETURN)', dueDate: new Date('2026-10-31'), status: TaskStatus.PENDING, priority: Priority.HIGH, users: [emp1.id] },
      { title: 'TDS 24Q (QUARTERLY RETURN) Jul - Sep 2026', client: 'ZENFOCHEM PRIVATE LIMITED', service: 'TDS 24Q (QUARTERLY RETURN)', dueDate: new Date('2026-10-31'), status: TaskStatus.PENDING, priority: Priority.HIGH, users: [emp1.id] },
    ];

    for (const t of extraTasks) {
      const c = getClient(t.client);
      const s = getService(t.service);
      const created = await prisma.task.create({
        data: {
          organizationId: org.id,
          clientId: c.id,
          serviceId: s.id,
          title: t.title,
          dueDate: t.dueDate,
          targetDate: t.dueDate,
          status: t.status,
          priority: t.priority,
          reviewerId: adminUser.id,
          reportingPeriod: 'Jul - Sep 2026',
          description: `Compliance workflow for ${t.title}. Verified books and statutory obligations.`,
        },
      });
      for (const uid of t.users) {
        await prisma.taskAssignment.create({
          data: { taskId: created.id, userId: uid },
        }).catch(() => {});
      }
    }
    console.log('Extra tasks seeded.');
  }

  // Attendance
  const attCount = await prisma.attendanceRecord.count({ where: { organizationId: org.id } });
  if (attCount === 0) {
    await prisma.attendanceRecord.create({
      data: {
        organizationId: org.id,
        userId: emp1.id,
        date: today,
        checkInTime: new Date('2026-10-14T09:15:00Z'),
        status: AttendanceStatus.PRESENT,
        totalWorkingMinutes: 180,
      },
    });
    await prisma.attendanceRecord.create({
      data: {
        organizationId: org.id,
        userId: managerUser.id,
        date: today,
        checkInTime: new Date('2026-10-14T09:00:00Z'),
        status: AttendanceStatus.PRESENT,
        totalWorkingMinutes: 195,
      },
    });
    console.log('Attendance seeded.');
  }

  // Renewals
  const renewalCount = await prisma.renewal.count({ where: { organizationId: org.id } });
  if (renewalCount === 0) {
    const fssaiClient = getClient('ENINE REMEDIES');
    const dscClient = getClient('CHAITU ENGINEERING');
    await prisma.renewal.create({
      data: {
        organizationId: org.id,
        clientId: fssaiClient.id,
        renewalType: 'FSSAI Food License',
        licenseNumber: '10019047001234',
        issueDate: new Date('2023-10-10'),
        expiryDate: new Date('2026-11-08'),
        status: RenewalStatus.EXPIRING_SOON,
        assignedUserId: emp2.id,
        reminderDays: 30,
        notes: 'State food manufacturing license renewal. Water analysis test submitted.',
      },
    });
    await prisma.renewal.create({
      data: {
        organizationId: org.id,
        clientId: dscClient.id,
        renewalType: 'Class 3 DSC (Combo Signing & Encryption)',
        licenseNumber: 'DSC-V3-99882',
        issueDate: new Date('2024-10-10'),
        expiryDate: new Date('2026-10-10'),
        status: RenewalStatus.EXPIRED,
        assignedUserId: emp1.id,
        reminderDays: 15,
        notes: 'Director DSC expired on Oct 10, 2026. Renewal initiated.',
      },
    });
    console.log('Renewals seeded.');
  }

  // Document In-Out Register
  const inOutCount = await prisma.documentInOutRecord.count({ where: { organizationId: org.id } });
  if (inOutCount === 0) {
    const dscClient = getClient('CHAITU ENGINEERING');
    const fssaiClient = getClient('ENINE REMEDIES');
    await prisma.documentInOutRecord.create({
      data: {
        organizationId: org.id,
        clientId: dscClient.id,
        docType: 'Physical USB DSC Token (ePass 2003)',
        category: InOutCategory.RECEIVED,
        isReturnable: true,
        physicalLocation: 'Locker 3 - Key Box A',
        responsibleUserId: emp1.id,
        receiverName: 'Suresh (Driver for Chaitu Engg)',
        expectedReturnDate: in7Days,
        status: InOutStatus.IN_CUSTODY,
        notes: 'Received original token for signing MCA annual e-forms AOC-4 and MGT-7.',
      },
    });
    await prisma.documentInOutRecord.create({
      data: {
        organizationId: org.id,
        clientId: fssaiClient.id,
        docType: 'Original Partnership Deed & Land Agreement',
        category: InOutCategory.GIVEN,
        isReturnable: true,
        physicalLocation: 'Client Office Receipt',
        responsibleUserId: managerUser.id,
        receiverName: 'Dr. E. Narayana',
        actualReturnDate: today,
        status: InOutStatus.RETURNED,
        notes: 'Handed back following bank loan mortgage appraisal inspection.',
      },
    });
    console.log('Document in-out seeded.');
  }

  // Invoices & Payments
  const invoiceCount = await prisma.invoice.count({ where: { organizationId: org.id } });
  if (invoiceCount === 0) {
    const dairyClient = getClient('A M DAIRY PRODUCTS');
    const infraClient = getClient('INDO INFRA DEVELOPERS');

    const inv1 = await prisma.invoice.create({
      data: {
        organizationId: org.id,
        clientId: dairyClient.id,
        invoiceNumber: 'MA-INV-1040',
        invoiceDate: new Date('2026-09-30'),
        dueDate: new Date('2026-10-15'),
        subtotal: 12000,
        taxTotal: 2160,
        totalAmount: 14160,
        amountPaid: 14160,
        balanceDue: 0,
        paymentStatus: InvoiceStatus.PAID,
        notes: 'Monthly GST Retainership & Quarterly TDS Filing for Q2 FY26.',
        lineItems: {
          create: [
            { description: 'GST Monthly Retainer (Aug & Sep 2026)', quantity: 2, unitPrice: 4000, taxRate: 18, amount: 8000 },
            { description: 'TDS 24Q Filing Q2', quantity: 1, unitPrice: 4000, taxRate: 18, amount: 4000 },
          ],
        },
      },
    });

    await prisma.payment.create({
      data: {
        organizationId: org.id,
        clientId: dairyClient.id,
        invoiceId: inv1.id,
        receiptNumber: 'MA-REC-1025',
        paymentDate: new Date('2026-10-05'),
        amount: 14160,
        paymentMode: PaymentMode.BANK_TRANSFER,
        referenceNumber: 'NEFT/HDFC/992837461',
        notes: 'Payment received in HDFC Bank Current A/c.',
        recordedById: accountantUser.id,
      },
    });

    await prisma.invoice.create({
      data: {
        organizationId: org.id,
        clientId: infraClient.id,
        invoiceNumber: 'MA-INV-1041',
        invoiceDate: new Date('2026-10-05'),
        dueDate: new Date('2026-10-20'),
        subtotal: 35000,
        taxTotal: 6300,
        totalAmount: 41300,
        amountPaid: 0,
        balanceDue: 41300,
        paymentStatus: InvoiceStatus.ISSUED,
        notes: 'Advance for Statutory Audit & MCA Compliance for FY 2025-26.',
        lineItems: {
          create: [
            { description: 'Statutory Audit Fee (50% Advance)', quantity: 1, unitPrice: 25000, taxRate: 18, amount: 25000 },
            { description: 'ROC Annual Compliance & Filing', quantity: 1, unitPrice: 10000, taxRate: 18, amount: 10000 },
          ],
        },
      },
    });
    console.log('Invoices and payments seeded.');
  }

  // Retainers
  const retainerCount = await prisma.retainer.count({ where: { organizationId: org.id } });
  if (retainerCount === 0) {
    const dairyClient = getClient('A M DAIRY PRODUCTS');
    const gstSrv = getService('GST Monthly Return');
    await prisma.retainer.create({
      data: {
        organizationId: org.id,
        clientId: dairyClient.id,
        serviceId: gstSrv.id,
        agreementNo: 'RET-2026-004',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2027-03-31'),
        fee: 4000,
        billingFrequency: 'MONTHLY',
        status: 'ACTIVE',
        notes: 'Standard monthly retainer with unlimited return revisions.',
      },
    });
    console.log('Retainer seeded.');
  }

  // Timesheets
  const tsCount = await prisma.timesheetEntry.count({ where: { organizationId: org.id } });
  if (tsCount === 0) {
    const dairyClient = getClient('A M DAIRY PRODUCTS');
    await prisma.timesheetEntry.create({
      data: {
        organizationId: org.id,
        userId: emp1.id,
        clientId: dairyClient.id,
        workDate: today,
        durationMinutes: 120,
        description: 'Reconciled September GSTR-2B with purchase register',
        isBillable: true,
        status: 'APPROVED',
        reviewedById: managerUser.id,
      },
    });
    console.log('Timesheets seeded.');
  }

  console.log('Finish-seed complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
