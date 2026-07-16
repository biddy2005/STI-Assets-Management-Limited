// Run with: node prisma/seed.js
// Creates the first admin account so you can log into /admin/login

const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'admin@assetco.com';
  const plainPassword = 'ChangeMe123!'; // change this immediately after first login

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log('Admin already exists:', email);
    return;
  }

  const passwordHash = await bcrypt.hash(plainPassword, 10);

  await prisma.admin.create({
    data: { email, passwordHash, role: 'superadmin' }
  });

  console.log('Admin created:');
  console.log('  email:', email);
  console.log('  password:', plainPassword);
  console.log('Log in at /admin/login and change this password immediately.');
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
