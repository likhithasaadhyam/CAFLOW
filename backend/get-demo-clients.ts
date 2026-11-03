import { PrismaClient } from '@prisma/client';

const poolerUrl = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: { db: { url: poolerUrl } },
});

async function main() {
  const clients = await prisma.client.findMany({
    take: 5,
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
      portalAccount: {
        select: {
          id: true,
          status: true,
          primaryMobile: true,
        },
      },
    },
  });
  console.log('CLIENTS:', JSON.stringify(clients, null, 2));
  await prisma.$disconnect();
}

main();
