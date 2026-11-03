import prisma from './prisma';

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: 'manavi-associates' } });
  if (!org) {
    console.log('No org');
    return;
  }
  const clients = await prisma.client.findMany({
    where: { organizationId: org.id, status: 'ACTIVE' },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, pan: true, gstin: true, mobile: true, primaryContact: true },
  });

  console.log(`TOTAL ACTIVE CLIENTS: ${clients.length}`);
  clients.forEach((c, i) => {
    console.log(`[#${i + 1}] ${c.name} (PAN: ${c.pan || 'N/A'}, Contact: ${c.primaryContact || c.mobile || 'N/A'})`);
  });
}

main().finally(() => prisma.$disconnect());
