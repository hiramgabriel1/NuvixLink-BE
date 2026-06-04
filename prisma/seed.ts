import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const email = 'rusty3031@gmail.com';
  const username = 'rusty3031';
  const password = 'Java2003';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists. Updating password...`);
    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: existing.id },
      data: { password: hashed, isVerified: true },
    });
    console.log('Done! User updated.');
  } else {
    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        username,
        password: hashed,
        isVerified: true,
      },
    });
    console.log(`User ${email} created successfully.`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
