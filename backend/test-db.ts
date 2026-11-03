import { PrismaClient } from '@prisma/client';

const poolerUrl = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: poolerUrl,
    },
  },
});

import bcrypt from 'bcryptjs';

async function main() {
  try {
    const users = await prisma.user.findMany({
      select: { email: true, fullName: true, role: true, isActive: true, passwordHash: true }
    });
    console.log('USERS FOUND:', users.length);
    for (const u of users) {
      const matchAdmin = await bcrypt.compare('Admin@123', u.passwordHash);
      const matchEmp = await bcrypt.compare('Employee@123', u.passwordHash);
      console.log(u.email, u.role, { matchAdmin, matchEmp });
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
