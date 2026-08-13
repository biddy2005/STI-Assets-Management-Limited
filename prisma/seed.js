require('dotenv').config();

const bcrypt = require('bcrypt');
const prisma = require('../config/db');

async function main() {
  const email =
    process.env.INITIAL_ADMIN_EMAIL
      ?.trim()
      .toLowerCase();

  const password =
    process.env.INITIAL_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are required.'
    );
  }

  if (password.length < 14) {
    throw new Error(
      'The initial administrator password must contain at least 14 characters.'
    );
  }

  const existingAdmin =
    await prisma.admin.findUnique({
      where: { email }
    });

  if (existingAdmin) {
    console.log('Administrator already exists.');
    return;
  }

  const passwordHash =
    await bcrypt.hash(password, 12);

  await prisma.admin.create({
  data: {
    email,
    passwordHash,
    role: 'SUPERADMIN'
  }
});

  console.log('Administrator created successfully.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });