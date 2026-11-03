import 'dotenv/config';
import prisma from './prisma.js';
import bcrypt from 'bcryptjs';
import { RoleType } from '@prisma/client';

async function main() {
  const org = await prisma.organization.findFirst({
    where: { slug: 'manavi-associates' },
  });
  if (!org) {
    console.error('No organization found');
    return;
  }

  const adminHash = await bcrypt.hash('Admin@123', 8);
  const employeeHash = await bcrypt.hash('Employee@123', 8);
  const taxProHash = await bcrypt.hash('TaxPro@123', 8);
  const clientHash = await bcrypt.hash('Client@123', 8);

  // 1. FIRM_OWNER
  const owner = await prisma.user.upsert({
    where: { email: 'kapil@manavi.com' },
    update: { role: RoleType.FIRM_OWNER, passwordHash: adminHash },
    create: {
      organizationId: org.id,
      email: 'kapil@manavi.com',
      passwordHash: adminHash,
      fullName: 'Kapil Gangapure',
      role: RoleType.FIRM_OWNER,
      designation: 'Managing Partner / CA',
      department: 'Executive',
      isActive: true,
    },
  });

  // FIRM_ADMIN
  const admin = await prisma.user.upsert({
    where: { email: 'admin@manavi.com' },
    update: { role: RoleType.FIRM_ADMIN, passwordHash: adminHash },
    create: {
      organizationId: org.id,
      email: 'admin@manavi.com',
      passwordHash: adminHash,
      fullName: 'Priya Verma',
      role: RoleType.FIRM_ADMIN,
      designation: 'Practice Operations Admin',
      department: 'Administration',
      isActive: true,
    },
  });

  // 2. MANAGER
  const manager = await prisma.user.upsert({
    where: { email: 'neha@manavi.com' },
    update: { role: RoleType.MANAGER, passwordHash: employeeHash },
    create: {
      organizationId: org.id,
      email: 'neha@manavi.com',
      passwordHash: employeeHash,
      fullName: 'Neha Sharma',
      role: RoleType.MANAGER,
      designation: 'Senior Audit Manager',
      department: 'Direct Tax & Audit',
      isActive: true,
    },
  });

  // 3. ACCOUNTANT
  const accountant = await prisma.user.upsert({
    where: { email: 'rajesh@manavi.com' },
    update: { role: RoleType.ACCOUNTANT, passwordHash: employeeHash },
    create: {
      organizationId: org.id,
      email: 'rajesh@manavi.com',
      passwordHash: employeeHash,
      fullName: 'Rajesh Varma',
      role: RoleType.ACCOUNTANT,
      designation: 'Finance Controller',
      department: 'Billing & Accounts',
      isActive: true,
    },
  });

  // 4. CA / TAX PROFESSIONAL
  const taxPro = await prisma.user.upsert({
    where: { email: 'ca.ananya@manavi.com' },
    update: { role: RoleType.TAX_PROFESSIONAL, passwordHash: taxProHash },
    create: {
      organizationId: org.id,
      email: 'ca.ananya@manavi.com',
      passwordHash: taxProHash,
      fullName: 'CA Ananya Reddy',
      role: RoleType.TAX_PROFESSIONAL,
      designation: 'Senior Tax Consultant / CA',
      department: 'Taxation & Regulatory Compliance',
      isActive: true,
    },
  });

  // 5. EMPLOYEE
  const employee = await prisma.user.upsert({
    where: { email: 'jagan@manavi.com' },
    update: { role: RoleType.EMPLOYEE, passwordHash: employeeHash },
    create: {
      organizationId: org.id,
      email: 'jagan@manavi.com',
      passwordHash: employeeHash,
      fullName: 'Jagan M',
      role: RoleType.EMPLOYEE,
      designation: 'Audit Assistant',
      department: 'GST Compliance',
      isActive: true,
    },
  });

  // 6. CLIENT
  const clientUser = await prisma.user.upsert({
    where: { email: 'client@amdairy.com' },
    update: { role: RoleType.CLIENT, passwordHash: clientHash },
    create: {
      organizationId: org.id,
      email: 'client@amdairy.com',
      passwordHash: clientHash,
      fullName: 'Ramesh Kumar (A M Dairy)',
      role: RoleType.CLIENT,
      designation: 'Managing Director',
      department: 'Client Portal',
      isActive: true,
    },
  });

  // Link Client user to A M Dairy Products client record
  const amDairy = await prisma.client.findFirst({
    where: {
      organizationId: org.id,
      name: { contains: 'A M Dairy', mode: 'insensitive' },
    },
  });

  if (amDairy) {
    await prisma.client.update({
      where: { id: amDairy.id },
      data: { portalUserId: clientUser.id },
    });
    console.log(`Linked client user ${clientUser.email} to client entity "${amDairy.name}" (${amDairy.id})`);
  }

  // Assign some GST/ITR tasks to CA Ananya Reddy so CA dashboard has real data
  const taxTasks = await prisma.task.findMany({
    where: {
      organizationId: org.id,
      OR: [
        { title: { contains: 'GST', mode: 'insensitive' } },
        { title: { contains: 'Tax', mode: 'insensitive' } },
        { title: { contains: 'TDS', mode: 'insensitive' } },
      ],
    },
    take: 5,
  });

  for (const t of taxTasks) {
    await prisma.taskAssignment.upsert({
      where: { taskId_userId: { taskId: t.id, userId: taxPro.id } },
      update: {},
      create: {
        taskId: t.id,
        userId: taxPro.id,
      },
    });
  }

  const allActiveRoles = await prisma.user.findMany({
    where: {
      email: {
        in: [
          'kapil@manavi.com',
          'admin@manavi.com',
          'neha@manavi.com',
          'rajesh@manavi.com',
          'ca.ananya@manavi.com',
          'jagan@manavi.com',
          'client@amdairy.com',
        ],
      },
    },
    select: {
      email: true,
      role: true,
      fullName: true,
      designation: true,
      clientProfile: { select: { id: true, name: true } },
    },
    orderBy: { role: 'asc' },
  });

  console.log('✅ ALL 6 CANONICAL ROLES CONFIGURED & SEEDED:');
  console.log(JSON.stringify(allActiveRoles, null, 2));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
