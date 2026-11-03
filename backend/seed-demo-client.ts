import { PrismaClient, ClientStatus } from '@prisma/client';
import { SmsService } from './src/services/sms.service.js';

const poolerUrl = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: { db: { url: poolerUrl } },
});

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('No org found');
    process.exit(1);
  }

  // 1. Create or ensure Demo Client
  let demoClient = await prisma.client.findFirst({
    where: { mobile: '9876543210', organizationId: org.id },
  });

  if (!demoClient) {
    demoClient = await prisma.client.create({
      data: {
        organizationId: org.id,
        name: 'Demo Client Enterprises',
        clientType: 'CORPORATE',
        mobile: '9876543210',
        email: 'demo@clientportal.com',
        pan: 'AAACD1234P',
        gstin: '36AAACD1234P1Z5',
        fileNo: 'MA-CL-DEMO',
        address: 'H.No 12-4/B, Cyber Towers Road, Hitec City, Hyderabad, Telangana 500081',
        status: ClientStatus.ACTIVE,
      },
    });
    console.log('Created Demo Client Enterprises:', demoClient.id);
  } else {
    console.log('Found existing Demo Client Enterprises:', demoClient.id);
  }

  // Ensure portal account
  let portal = await prisma.clientPortal.findUnique({
    where: { clientId: demoClient.id },
  });
  if (!portal) {
    portal = await prisma.clientPortal.create({
      data: {
        clientId: demoClient.id,
        status: ClientStatus.ACTIVE,
        primaryMobile: '9876543210',
      },
    });
    console.log('Created ClientPortal account:', portal.id);
  }

  // Also check A M DAIRY PRODUCTS
  let amDairy = await prisma.client.findFirst({
    where: { name: { contains: 'Dairy', mode: 'insensitive' } },
  });
  if (amDairy) {
    await prisma.client.update({
      where: { id: amDairy.id },
      data: { name: 'A M DAIRY PRODUCTS', mobile: '9845012345', status: ClientStatus.ACTIVE },
    });
    const dairyPortal = await prisma.clientPortal.upsert({
      where: { clientId: amDairy.id },
      create: { clientId: amDairy.id, status: ClientStatus.ACTIVE, primaryMobile: '9845012345' },
      update: { status: ClientStatus.ACTIVE, primaryMobile: '9845012345' },
    });
    console.log('Synced A M DAIRY PRODUCTS portal:', dairyPortal.id);
  }

  // Create some sample tasks, services, and invoices for Demo Client Enterprises if none exist
  const existingTasks = await prisma.task.count({ where: { clientId: demoClient.id } });
  if (existingTasks === 0) {
    await prisma.task.createMany({
      data: [
        {
          organizationId: org.id,
          clientId: demoClient.id,
          title: 'GSTR-3B Monthly Return Filing',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          dueDate: new Date(Date.now() + 5 * 86400000),
        },
        {
          organizationId: org.id,
          clientId: demoClient.id,
          title: 'Quarterly Advance Tax Computation (Q3)',
          priority: 'URGENT',
          status: 'PENDING',
          dueDate: new Date(Date.now() + 10 * 86400000),
        },
        {
          organizationId: org.id,
          clientId: demoClient.id,
          title: 'Statutory Audit File Preparation',
          priority: 'MEDIUM',
          status: 'COMPLETED',
          dueDate: new Date(Date.now() - 2 * 86400000),
        },
      ],
    });
    console.log('Added sample compliance tasks for Demo Client');
  }

  // Sample document
  const existingDocs = await prisma.document.count({ where: { clientId: demoClient.id } });
  if (existingDocs === 0) {
    await prisma.document.create({
      data: {
        organizationId: org.id,
        clientId: demoClient.id,
        name: 'GSTR_1_Filing_Challan_Oct2026.pdf',
        fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        category: 'GST',
        fileSize: 1048576,
      },
    });
    console.log('Added sample document for Demo Client');
  }

  // Sample Invoice
  const existingInv = await prisma.invoice.count({ where: { clientId: demoClient.id } });
  if (existingInv === 0) {
    const inv = await prisma.invoice.create({
      data: {
        organizationId: org.id,
        clientId: demoClient.id,
        invoiceNumber: 'INV-2026-DEMO-01',
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 7 * 86400000),
        totalAmount: 15000,
        amountPaid: 10000,
        balanceDue: 5000,
        paymentStatus: 'PARTIALLY_PAID',
        lineItems: {
          create: [
            { description: 'Monthly Retainer for GST & TDS Compliance', quantity: 1, unitPrice: 10000, amount: 10000 },
            { description: 'Quarterly ROC Filing & Corporate Advisory', quantity: 1, unitPrice: 5000, amount: 5000 },
          ],
        },
      },
    });
    console.log('Added sample invoice for Demo Client:', inv.invoiceNumber);

    await prisma.payment.create({
      data: {
        organizationId: org.id,
        clientId: demoClient.id,
        invoiceId: inv.id,
        receiptNumber: 'REC-2026-0099',
        amount: 10000,
        paymentDate: new Date(),
        paymentMode: 'BANK_TRANSFER',
        referenceNumber: 'NEFT/HDFC/2026110199',
      },
    });
    console.log('Added sample payment receipt for Demo Client');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
