import { PrismaClient, RoleType, ClientType, ClientStatus, TaskStatus, Priority, InOutCategory, InOutStatus, InvoiceStatus, PaymentMode, RenewalStatus, AttendanceStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding CAFlow database...');

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { slug: 'manavi-associates' },
    update: {},
    create: {
      name: 'MANAVI ASSOCIATES',
      slug: 'manavi-associates',
      email: 'contact@manaviassociates.com',
      phone: '+91 98765 43210',
      address: 'Suite 402, Financial Towers, Banjara Hills, Hyderabad, Telangana - 500034',
      gstin: '36AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
      website: 'https://manaviassociates.com',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      settings: {
        create: {
          financialYearStart: '04-01',
          defaultDueDays: 7,
          workHoursPerDay: 8.5,
          lateThresholdMinutes: 15,
          allowClientPortal: true,
          invoicePrefix: 'MA-INV',
          invoiceSequence: 1042,
          receiptPrefix: 'MA-REC',
          receiptSequence: 1028,
        },
      },
    },
  });

  console.log('Organization seeded:', org.name);

  // 2. Roles and Permissions
  const permissionsData = [
    { module: 'CLIENTS', action: 'VIEW', description: 'View client records' },
    { module: 'CLIENTS', action: 'MANAGE', description: 'Create and edit clients' },
    { module: 'TASKS', action: 'VIEW', description: 'View tasks' },
    { module: 'TASKS', action: 'MANAGE', description: 'Create and assign tasks' },
    { module: 'TASKS', action: 'REVIEW', description: 'Review and approve tasks' },
    { module: 'FINANCE', action: 'VIEW', description: 'View invoices and receipts' },
    { module: 'FINANCE', action: 'MANAGE', description: 'Create invoices and record payments' },
    { module: 'ATTENDANCE', action: 'VIEW_ALL', description: 'View all team attendance' },
    { module: 'DOCUMENTS', action: 'MANAGE', description: 'Manage vault and In-Out register' },
  ];

  for (const perm of permissionsData) {
    await prisma.permission.upsert({
      where: { module_action: { module: perm.module, action: perm.action } },
      update: {},
      create: perm,
    });
  }

  // 3. Users
  const passwordHash = await bcrypt.hash('Admin@123', 8);
  const employeeHash = await bcrypt.hash('Employee@123', 8);

  const adminUser = await prisma.user.upsert({
    where: { email: 'kapil@manavi.com' },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: 'kapil@manavi.com',
      passwordHash,
      fullName: 'Kapil Gangapure',
      phone: '+91 9988776655',
      role: RoleType.FIRM_OWNER,
      designation: 'Managing Partner / CA',
      department: 'Executive',
      isActive: true,
    },
  });

  const managerUser = await prisma.user.upsert({
    where: { email: 'neha@manavi.com' },
    update: { passwordHash: employeeHash },
    create: {
      organizationId: org.id,
      email: 'neha@manavi.com',
      passwordHash: employeeHash,
      fullName: 'Neha Sharma',
      phone: '+91 9811223344',
      role: RoleType.MANAGER,
      designation: 'Senior Audit Manager',
      department: 'Direct Tax & Audit',
      isActive: true,
    },
  });

  const accountantUser = await prisma.user.upsert({
    where: { email: 'rajesh@manavi.com' },
    update: { passwordHash: employeeHash },
    create: {
      organizationId: org.id,
      email: 'rajesh@manavi.com',
      passwordHash: employeeHash,
      fullName: 'Rajesh Varma',
      phone: '+91 9722334455',
      role: RoleType.ACCOUNTANT,
      designation: 'Finance Controller',
      department: 'Billing & Accounts',
      isActive: true,
    },
  });

  const emp1 = await prisma.user.upsert({
    where: { email: 'jagan@manavi.com' },
    update: { passwordHash: employeeHash },
    create: {
      organizationId: org.id,
      email: 'jagan@manavi.com',
      passwordHash: employeeHash,
      fullName: 'Jagan M',
      phone: '+91 9633445566',
      role: RoleType.EMPLOYEE,
      designation: 'Audit Assistant',
      department: 'GST Compliance',
      isActive: true,
    },
  });

  const emp2 = await prisma.user.upsert({
    where: { email: 'mohan@manavi.com' },
    update: { passwordHash: employeeHash },
    create: {
      organizationId: org.id,
      email: 'mohan@manavi.com',
      passwordHash: employeeHash,
      fullName: 'K. Mohan',
      phone: '+91 9544556677',
      role: RoleType.EMPLOYEE,
      designation: 'Article Assistant',
      department: 'Corporate ROC',
      isActive: true,
    },
  });

  const emp3 = await prisma.user.upsert({
    where: { email: 'suresh@manavi.com' },
    update: { passwordHash: employeeHash },
    create: {
      organizationId: org.id,
      email: 'suresh@manavi.com',
      passwordHash: employeeHash,
      fullName: 'A. Suresh',
      phone: '+91 9455667788',
      role: RoleType.EMPLOYEE,
      designation: 'Junior Accountant',
      department: 'TDS & Bookkeeping',
      isActive: true,
    },
  });

  console.log('Seeded Users.');

  // 4. Client Groups
  const groupMfg = await prisma.clientGroup.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Manufacturing & Agro' } },
    update: {},
    create: { organizationId: org.id, name: 'Manufacturing & Agro', description: 'FMCG and Agriculture' },
  });

  const groupHealth = await prisma.clientGroup.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Healthcare & Pharma' } },
    update: {},
    create: { organizationId: org.id, name: 'Healthcare & Pharma', description: 'Clinics, Hospitals, Labs' },
  });

  const groupTech = await prisma.clientGroup.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'IT & Startups' } },
    update: {},
    create: { organizationId: org.id, name: 'IT & Startups', description: 'Tech entities and SaaS' },
  });

  // 5. Client Tags
  await prisma.clientTag.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'VIP Client' } },
    update: {},
    create: { organizationId: org.id, name: 'VIP Client', color: '#176B57' },
  });
  await prisma.clientTag.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Quarterly Audit' } },
    update: {},
    create: { organizationId: org.id, name: 'Quarterly Audit', color: '#DDAA45' },
  });

  // 6. Services
  const servicesData = [
    { name: 'Trademark Registration', category: 'IPR & Legal', defaultDueDays: 15, standardFee: 8500, billingFrequency: 'ONE_TIME', code: 'TMR' },
    { name: 'FSSAI FOOD LICENSE RENEWAL', category: 'Licensing', defaultDueDays: 30, standardFee: 4500, billingFrequency: 'ANNUALLY', code: 'FSSAI-REN' },
    { name: 'DSC APPLICATION', category: 'Digital Signatures', defaultDueDays: 3, standardFee: 1800, billingFrequency: 'ONE_TIME', code: 'DSC-NEW' },
    { name: 'DSC Renewal', category: 'Digital Signatures', defaultDueDays: 5, standardFee: 1500, billingFrequency: 'ONE_TIME', code: 'DSC-REN' },
    { name: 'DSC SIGN& ENCRYPTION', category: 'Digital Signatures', defaultDueDays: 3, standardFee: 2200, billingFrequency: 'ONE_TIME', code: 'DSC-COMBO' },
    { name: 'SOCIETY REGISTRATION', category: 'Registrations', defaultDueDays: 20, standardFee: 12000, billingFrequency: 'ONE_TIME', code: 'SOC-REG' },
    { name: 'UDYAM REGISTRATION', category: 'MSME', defaultDueDays: 2, standardFee: 1200, billingFrequency: 'ONE_TIME', code: 'UDYAM' },
    { name: 'TDS 24Q (QUARTERLY RETURN)', category: 'Direct Tax', defaultDueDays: 30, standardFee: 3500, billingFrequency: 'QUARTERLY', code: 'TDS-24Q' },
    { name: 'GST Monthly Return (GSTR-3B & GSTR-1)', category: 'Indirect Tax', defaultDueDays: 20, standardFee: 4000, billingFrequency: 'MONTHLY', code: 'GST-RET' },
    { name: 'Income Tax Return (Corporate)', category: 'Direct Tax', defaultDueDays: 45, standardFee: 25000, billingFrequency: 'ANNUALLY', code: 'ITR-CORP' },
    { name: 'Statutory Audit & Tax Audit', category: 'Audit', defaultDueDays: 60, standardFee: 50000, billingFrequency: 'ANNUALLY', code: 'AUDIT-STAT' },
  ];

  const serviceMap = new Map();
  for (const s of servicesData) {
    const srv = await prisma.service.upsert({
      where: { organizationId_name: { organizationId: org.id, name: s.name } },
      update: {},
      create: {
        organizationId: org.id,
        name: s.name,
        category: s.category,
        defaultDueDays: s.defaultDueDays,
        standardFee: s.standardFee,
        billingFrequency: s.billingFrequency,
        code: s.code,
        isActive: true,
      },
    });
    serviceMap.set(s.name, srv);
  }

  // 7. Clients
  const clientsData = [
    { name: 'A M DAIRY PRODUCTS', type: ClientType.PARTNERSHIP_FIRM, fileNo: 'FIL-2026-001', contact: 'Anil Mehta', mobile: '9845012345', email: 'anil@amdairy.com', pan: 'AAFFA1234A', gstin: '36AAFFA1234A1Z1', groupId: groupMfg.id },
    { name: 'ABHAYA AGRO FARMS', type: ClientType.PARTNERSHIP_FIRM, fileNo: 'FIL-2026-002', contact: 'Raghavendra Rao', mobile: '9845023456', email: 'info@abhayaagro.com', pan: 'AAGFA2345B', gstin: '36AAGFA2345B1Z2', groupId: groupMfg.id },
    { name: 'ABHAYA AGRO FARMS, Karnataka', type: ClientType.PARTNERSHIP_FIRM, fileNo: 'FIL-2026-003', contact: 'Mahesh Patil', mobile: '9845034567', email: 'blr@abhayaagro.com', pan: 'AAGFA2345C', gstin: '29AAGFA2345C1Z3', groupId: groupMfg.id },
    { name: 'ABHAYA AGRO FARMS, Maharashtra', type: ClientType.PARTNERSHIP_FIRM, fileNo: 'FIL-2026-004', contact: 'Sanjay Deshmukh', mobile: '9845045678', email: 'pune@abhayaagro.com', pan: 'AAGFA2345D', gstin: '27AAGFA2345D1Z4', groupId: groupMfg.id },
    { name: 'ACUPRESSURE HEALTH CARE SYSTEMS_SANJAY CHOUDHARY', type: ClientType.SOLE_PROPRIETORSHIP, fileNo: 'FIL-2026-005', contact: 'Sanjay Choudhary', mobile: '8332857297', email: 'sanjay@acupressure.in', pan: 'AQCPC5678E', gstin: '36AQCPC5678E1Z5', groupId: groupHealth.id },
    { name: 'ACUPRESSURE HEALTHCARE SYSTEMS', type: ClientType.PARTNERSHIP_FIRM, fileNo: 'FIL-2026-006', contact: 'Sanjay & Sunita Choudhary', mobile: '8332857297', email: 'accounts@acupressure.in', pan: 'AARFA6789F', gstin: '36AARFA6789F1Z6', groupId: groupHealth.id },
    { name: 'ADHVITHI HOMES PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-007', contact: 'Vikram Reddy', mobile: '9845078901', email: 'vikram@adhvithihomes.com', pan: 'AAACA7890G', gstin: '36AAACA7890G1Z7', groupId: groupMfg.id },
    { name: 'ADON-TECH', type: ClientType.PARTNERSHIP_FIRM, fileNo: 'FIL-2026-008', contact: 'Prashant Nair', mobile: '9845089012', email: 'contact@adontech.in', pan: 'AABFA8901H', gstin: '36AABFA8901H1Z8', groupId: groupTech.id },
    { name: 'AFC FOODS PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-009', contact: 'Farhan Khan', mobile: '9845090123', email: 'farhan@afcfoods.in', pan: 'AACCA9012I', gstin: '36AACCA9012I1Z9', groupId: groupMfg.id },
    { name: 'AINDRI SILKS PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-010', contact: 'Kavitha Swamy', mobile: '9845101234', email: 'kavitha@aindrisilks.com', pan: 'AADCA0123J', gstin: '36AADCA0123J1Z0', groupId: groupMfg.id },
    { name: 'AK PHARMA', type: ClientType.SOLE_PROPRIETORSHIP, fileNo: 'FIL-2026-011', contact: 'Ashok Kumar', mobile: '9845112345', email: 'ashok@akpharma.in', pan: 'AAKPA1234K', gstin: '36AAKPA1234K1Z1', groupId: groupHealth.id },
    { name: 'ALKAPALLY KOMURAIAH', type: ClientType.INDIVIDUAL, fileNo: 'FIL-2026-012', contact: 'Alkapally Komuraiah', mobile: '9845123456', email: 'komuraiah@gmail.com', pan: 'APPAK2345L', gstin: '', groupId: null },
    { name: 'ENINE REMEDIES PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-013', contact: 'Dr. E. Narayana', mobile: '9845134567', email: 'narayana@enine.com', pan: 'AAECA3456M', gstin: '36AAECA3456M1Z2', groupId: groupHealth.id },
    { name: 'NOVOPOR ADVANCED SCIENCE PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-014', contact: 'Dr. Vivek Saxena', mobile: '9845145678', email: 'vivek@novopor.com', pan: 'AANCA4567N', gstin: '36AANCA4567N1Z3', groupId: groupTech.id },
    { name: 'CHAITU ENGINEERING PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-015', contact: 'Chaitanya Krishna', mobile: '9845156789', email: 'chaitu@chaituengg.com', pan: 'AACCC5678O', gstin: '36AACCC5678O1Z4', groupId: groupMfg.id },
    { name: 'NEHA & CO PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-016', contact: 'Neha G', mobile: '9845167890', email: 'neha@nehaco.in', pan: 'AANCN6789P', gstin: '36AANCN6789P1Z5', groupId: null },
    { name: 'AKSHARA DAIRY FARM', type: ClientType.PARTNERSHIP_FIRM, fileNo: 'FIL-2026-017', contact: 'K. Sridhar', mobile: '9845178901', email: 'sridhar@aksharadairy.in', pan: 'AAKFA7890Q', gstin: '36AAKFA7890Q1Z6', groupId: groupMfg.id },
    { name: 'INDO INFRA DEVELOPERS PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-018', contact: 'P. Ravinder Reddy', mobile: '9845189012', email: 'ravi@indoinfra.com', pan: 'AAICI8901R', gstin: '36AAICI8901R1Z7', groupId: groupMfg.id },
    { name: 'PERIWINKLE HEALTH CARE PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-019', contact: 'Dr. Shobha Rani', mobile: '9845190123', email: 'shobha@periwinkle.care', pan: 'AAPCP9012S', gstin: '36AAPCP9012S1Z8', groupId: groupHealth.id },
    { name: 'CURYZ LIFESCIENCES PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-020', contact: 'M. Venkat', mobile: '9845201234', email: 'venkat@curyz.com', pan: 'AACCC0123T', gstin: '36AACCC0123T1Z9', groupId: groupHealth.id },
    { name: 'BRICENT HEALTHCARE PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-021', contact: 'C. Harish', mobile: '9845212345', email: 'harish@bricent.in', pan: 'AABCB1234U', gstin: '36AABCB1234U1Z0', groupId: groupHealth.id },
    { name: 'ZENFOCHEM PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-022', contact: 'G. Suresh', mobile: '9845223456', email: 'suresh@zenfochem.com', pan: 'AAZCZ2345V', gstin: '36AAZCZ2345V1Z1', groupId: groupMfg.id },
    { name: 'ZENFOMED REMEDIES PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-023', contact: 'T. Srinivas', mobile: '9845234567', email: 'srinivas@zenfomed.com', pan: 'AAZCR3456W', gstin: '36AAZCR3456W1Z2', groupId: groupHealth.id },
    { name: 'PLANTEX IMPORT & EXPORT PRIVATE LIMITED', type: ClientType.PRIVATE_LIMITED, fileNo: 'FIL-2026-024', contact: 'K. Ramesh', mobile: '9845245678', email: 'ramesh@planteximpex.com', pan: 'AAPCP4567X', gstin: '36AAPCP4567X1Z3', groupId: groupMfg.id },
  ];

  const clientMap = new Map();
  for (const c of clientsData) {
    let client = await prisma.client.findFirst({
      where: { organizationId: org.id, name: c.name },
    });
    if (!client) {
      client = await prisma.client.create({
        data: {
          organizationId: org.id,
          name: c.name,
          clientType: c.type,
          fileNo: c.fileNo,
          primaryContact: c.contact,
          mobile: c.mobile,
          email: c.email,
          pan: c.pan,
          gstin: c.gstin,
          status: ClientStatus.ACTIVE,
          clientGroupId: c.groupId,
        },
      });
    }
    clientMap.set(c.name, client);
  }
  console.log(`Clients verified: ${clientMap.size}`);

  // 8. Tasks - Check if tasks already exist
  const existingTasksCount = await prisma.task.count({ where: { organizationId: org.id } });
  if (existingTasksCount === 0) {
    console.log('Seeding tasks...');
    const now = new Date('2026-10-14T12:00:00Z');
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const in3Days = new Date(today);
    in3Days.setDate(today.getDate() + 3);
    const in7Days = new Date(today);
    in7Days.setDate(today.getDate() + 7);
    const past3Days = new Date(today);
    past3Days.setDate(today.getDate() - 3);
    const oct31 = new Date(2026, 9, 31);

    const sampleTasks = [
      { title: 'Trademark Registration', client: 'ALKAPALLY KOMURAIAH', service: 'Trademark Registration', dueDate: new Date(2026, 9, 13), status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH, users: [managerUser.id, emp1.id] },
      { title: 'FSSAI FOOD LICENSE RENEWAL', client: 'ENINE REMEDIES PRIVATE LIMITED', service: 'FSSAI FOOD LICENSE RENEWAL', dueDate: new Date(2026, 10, 8), status: TaskStatus.PENDING, priority: Priority.MEDIUM, users: [emp2.id] },
      { title: 'DSC APPLICATION', client: 'NOVOPOR ADVANCED SCIENCE PRIVATE LIMITED', service: 'DSC APPLICATION', dueDate: new Date(2026, 9, 15), status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH, users: [emp1.id, emp2.id] },
      { title: 'DSC Renewal', client: 'CHAITU ENGINEERING PRIVATE LIMITED', service: 'DSC Renewal', dueDate: new Date(2026, 9, 10), status: TaskStatus.IN_PROGRESS, priority: Priority.MEDIUM, users: [emp1.id] },
      { title: 'Trademark Registration', client: 'NEHA & CO PRIVATE LIMITED', service: 'Trademark Registration', dueDate: oct31, status: TaskStatus.PENDING, priority: Priority.MEDIUM, users: [emp3.id] },
      { title: 'Trademark Registration', client: 'AKSHARA DAIRY FARM', service: 'Trademark Registration', dueDate: new Date(2026, 9, 22), status: TaskStatus.PENDING, priority: Priority.MEDIUM, users: [emp1.id] },
      { title: 'DSC Renewal', client: 'INDO INFRA DEVELOPERS PRIVATE LIMITED', service: 'DSC Renewal', dueDate: new Date(2026, 9, 7), status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH, users: [emp2.id] },
      { title: 'TDS 24Q (QUARTERLY RETURN) Jul - Sep 2026', client: 'ENINE REMEDIES PRIVATE LIMITED', service: 'TDS 24Q (QUARTERLY RETURN)', dueDate: oct31, status: TaskStatus.PENDING, priority: Priority.URGENT, users: [emp1.id] },
      { title: 'TDS 24Q (QUARTERLY RETURN) Jul - Sep 2026', client: 'PERIWINKLE HEALTH CARE PRIVATE LIMITED', service: 'TDS 24Q (QUARTERLY RETURN)', dueDate: oct31, status: TaskStatus.PENDING, priority: Priority.URGENT, users: [emp2.id] },
      { title: 'TDS 24Q (QUARTERLY RETURN) Jul - Sep 2026', client: 'CURYZ LIFESCIENCES PRIVATE LIMITED', service: 'TDS 24Q (QUARTERLY RETURN)', dueDate: oct31, status: TaskStatus.PENDING, priority: Priority.HIGH, users: [emp1.id] },
      { title: 'TDS 24Q (QUARTERLY RETURN) Jul - Sep 2026', client: 'BRICENT HEALTHCARE PRIVATE LIMITED', service: 'TDS 24Q (QUARTERLY RETURN)', dueDate: oct31, status: TaskStatus.PENDING, priority: Priority.HIGH, users: [emp3.id] },
      { title: 'TDS 24Q (QUARTERLY RETURN) Jul - Sep 2026', client: 'ZENFOCHEM PRIVATE LIMITED', service: 'TDS 24Q (QUARTERLY RETURN)', dueDate: oct31, status: TaskStatus.PENDING, priority: Priority.HIGH, users: [emp1.id] },
      { title: 'TDS 24Q (QUARTERLY RETURN) Jul - Sep 2026', client: 'ZENFOMED REMEDIES PRIVATE LIMITED', service: 'TDS 24Q (QUARTERLY RETURN)', dueDate: oct31, status: TaskStatus.PENDING, priority: Priority.MEDIUM, users: [emp2.id] },
      { title: 'TDS 24Q (QUARTERLY RETURN) Jul - Sep 2026', client: 'PLANTEX IMPORT & EXPORT PRIVATE LIMITED', service: 'TDS 24Q (QUARTERLY RETURN)', dueDate: oct31, status: TaskStatus.PENDING, priority: Priority.HIGH, users: [emp3.id] },
      { title: 'GST GSTR-3B Verification & Filing', client: 'ADHVITHI HOMES PRIVATE LIMITED', service: 'GST Monthly Return (GSTR-3B & GSTR-1)', dueDate: today, status: TaskStatus.IN_PROGRESS, priority: Priority.URGENT, users: [emp1.id] },
      { title: 'Advance Tax Calculation Review', client: 'AFC FOODS PRIVATE LIMITED', service: 'Income Tax Return (Corporate)', dueDate: tomorrow, status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH, users: [emp2.id] },
      { title: 'Statutory Audit Document Vouching', client: 'AINDRI SILKS PRIVATE LIMITED', service: 'Statutory Audit & Tax Audit', dueDate: in7Days, status: TaskStatus.PENDING, priority: Priority.MEDIUM, users: [emp3.id] },
      { title: 'Udyam Certificate Revision', client: 'AK PHARMA', service: 'UDYAM REGISTRATION', dueDate: past3Days, status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH, users: [emp1.id] },
    ];

    // Add 10 completed tasks
    for (let i = 1; i <= 10; i++) {
      const c = clientsData[i % clientsData.length];
      sampleTasks.push({
        title: `Compliance Review & Filing #${i}`,
        client: c.name,
        service: 'GST Monthly Return (GSTR-3B & GSTR-1)',
        dueDate: new Date(2026, 8, 20),
        status: TaskStatus.COMPLETED,
        priority: Priority.LOW,
        users: [emp1.id],
      });
    }

    const taskAssignmentsData: any[] = [];
    const checklistsData: any[] = [];

    for (const t of sampleTasks) {
      const cl = clientMap.get(t.client);
      const srv = serviceMap.get(t.service);
      if (!cl) continue;

      const created = await prisma.task.create({
        data: {
          organizationId: org.id,
          clientId: cl.id,
          serviceId: srv?.id || null,
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

      for (const u of t.users) {
        taskAssignmentsData.push({ taskId: created.id, userId: u });
      }

      checklistsData.push(
        { taskId: created.id, title: 'Obtain bank statements & invoices', isCompleted: t.status === TaskStatus.COMPLETED, sortOrder: 1 },
        { taskId: created.id, title: 'Reconcile 26AS / GSTR-2B data', isCompleted: t.status === TaskStatus.COMPLETED, sortOrder: 2 },
        { taskId: created.id, title: 'File return on official portal', isCompleted: t.status === TaskStatus.COMPLETED, sortOrder: 3 }
      );
    }

    if (taskAssignmentsData.length > 0) {
      await prisma.taskAssignment.createMany({ data: taskAssignmentsData, skipDuplicates: true });
    }
    if (checklistsData.length > 0) {
      await prisma.taskChecklistItem.createMany({ data: checklistsData });
    }
    console.log('Tasks & checklists created.');
  }

  // 9. To-Do Items
  const existingTodos = await prisma.todo.count({ where: { organizationId: org.id } });
  if (existingTodos === 0) {
    const today = new Date('2026-10-14T12:00:00Z');
    await prisma.todo.createMany({
      data: [
        { organizationId: org.id, userId: adminUser.id, title: 'Call ACUPRESSURE HEALTHCARE regarding pending TDS challans', priority: Priority.HIGH, dueDate: today, category: 'Calls', status: 'PENDING' },
        { organizationId: org.id, userId: adminUser.id, title: 'Review GSTR-1 draft computation for ADHVITHI HOMES', priority: Priority.MEDIUM, dueDate: today, category: 'Review', status: 'PENDING' },
        { organizationId: org.id, userId: adminUser.id, title: 'Send quotation for Trademark Objection response to ALKAPALLY KOMURAIAH', priority: Priority.HIGH, dueDate: today, category: 'Follow-up', status: 'PENDING' },
        { organizationId: org.id, userId: adminUser.id, title: 'Collect physical DSC tokens from courier desk', priority: Priority.LOW, dueDate: today, category: 'Admin', status: 'PENDING' },
      ],
    });
    console.log('To-Dos created.');
  }

  // 10. Attendance
  const existingAtt = await prisma.attendanceRecord.count({ where: { organizationId: org.id } });
  if (existingAtt === 0) {
    const today = new Date('2026-10-14T00:00:00Z');
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
    console.log('Attendance created.');
  }

  // 11. Renewals
  const existingRenewals = await prisma.renewal.count({ where: { organizationId: org.id } });
  if (existingRenewals === 0) {
    const fssaiClient = clientMap.get('ENINE REMEDIES PRIVATE LIMITED');
    const dscClient = clientMap.get('CHAITU ENGINEERING PRIVATE LIMITED');
    if (fssaiClient) {
      await prisma.renewal.create({
        data: {
          organizationId: org.id,
          clientId: fssaiClient.id,
          renewalType: 'FSSAI License',
          licenseNumber: '10019047001234',
          issueDate: new Date('2023-10-10'),
          expiryDate: new Date('2026-11-08'),
          status: RenewalStatus.EXPIRING_SOON,
          assignedUserId: emp2.id,
          reminderDays: 30,
          notes: 'State food manufacturing license renewal.',
        },
      });
    }
    if (dscClient) {
      await prisma.renewal.create({
        data: {
          organizationId: org.id,
          clientId: dscClient.id,
          renewalType: 'Class 3 DSC (Combo)',
          licenseNumber: 'DSC-V3-99882',
          issueDate: new Date('2024-10-10'),
          expiryDate: new Date('2026-10-10'),
          status: RenewalStatus.EXPIRED,
          assignedUserId: emp1.id,
          reminderDays: 15,
          notes: 'Director DSC expired on Oct 10, 2026.',
        },
      });
    }
    console.log('Renewals created.');
  }

  // 12. Documents In-Out Register
  const existingInOut = await prisma.documentInOutRecord.count({ where: { organizationId: org.id } });
  if (existingInOut === 0) {
    const dscClient = clientMap.get('CHAITU ENGINEERING PRIVATE LIMITED');
    const fssaiClient = clientMap.get('ENINE REMEDIES PRIVATE LIMITED');
    if (dscClient) {
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
          expectedReturnDate: new Date('2026-10-21'),
          status: InOutStatus.IN_CUSTODY,
          notes: 'Received original token for signing MCA annual e-forms.',
        },
      });
    }
    if (fssaiClient) {
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
          actualReturnDate: new Date('2026-10-14'),
          status: InOutStatus.RETURNED,
          notes: 'Handed back following bank loan mortgage appraisal inspection.',
        },
      });
    }
    console.log('Doc in-out created.');
  }

  // 13. Invoices & Payments
  const existingInvoices = await prisma.invoice.count({ where: { organizationId: org.id } });
  if (existingInvoices === 0) {
    const dairyClient = clientMap.get('A M DAIRY PRODUCTS');
    const infraClient = clientMap.get('INDO INFRA DEVELOPERS PRIVATE LIMITED');
    if (dairyClient) {
      const inv = await prisma.invoice.create({
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
          invoiceId: inv.id,
          receiptNumber: 'MA-REC-1025',
          paymentDate: new Date('2026-10-05'),
          amount: 14160,
          paymentMode: PaymentMode.BANK_TRANSFER,
          referenceNumber: 'NEFT/HDFC/992837461',
          notes: 'Payment received in HDFC Bank Current A/c.',
          recordedById: accountantUser.id,
        },
      });
    }
    if (infraClient) {
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
    }
    console.log('Invoices and payments created.');
  }

  // 14. Timesheet
  const existingTimesheet = await prisma.timesheetEntry.count({ where: { organizationId: org.id } });
  if (existingTimesheet === 0) {
    const dairyClient = clientMap.get('A M DAIRY PRODUCTS');
    await prisma.timesheetEntry.create({
      data: {
        organizationId: org.id,
        userId: emp1.id,
        clientId: dairyClient?.id,
        workDate: new Date('2026-10-14'),
        durationMinutes: 120,
        description: 'Reconciled September GSTR-2B with purchase register',
        isBillable: true,
        status: 'APPROVED',
        reviewedById: managerUser.id,
      },
    });
    console.log('Timesheet created.');
  }

  console.log('Database seeding successfully finished!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
