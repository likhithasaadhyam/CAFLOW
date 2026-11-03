import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runAudit() {
  try {
    const orgs = await prisma.organization.count();
    const users = await prisma.user.count();
    const clients = await prisma.client.count();
    const tasks = await prisma.task.count();
    const todos = await prisma.todo.count();
    const attendance = await prisma.attendanceRecord.count();
    const renewals = await prisma.renewal.count();
    const documents = await prisma.document.count();
    const docInOut = await prisma.documentInOutRecord.count();
    const invoices = await prisma.invoice.count();
    const payments = await prisma.payment.count();
    const expenses = await prisma.expense.count();
    const timesheets = await prisma.timesheetEntry.count();
    const services = await prisma.service.count();
    const auditLogs = await prisma.auditLog.count();

    console.log('AUDIT_DB_RESULT:' + JSON.stringify({
      status: 'CONNECTED',
      database: 'Neon PostgreSQL',
      counts: {
        organizations: orgs,
        users,
        clients,
        tasks,
        todos,
        attendance,
        renewals,
        documents,
        documentInOutRecords: docInOut,
        invoices,
        payments,
        expenses,
        timesheets,
        services,
        auditLogs
      }
    }, null, 2));
  } catch (err) {
    console.error('DATABASE_CHECK_FAILED:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAudit();
