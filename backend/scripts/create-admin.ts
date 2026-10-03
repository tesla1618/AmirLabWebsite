import { AccountStatus, PlatformRole } from '../generated/prisma/client';
import { hashPassword, PASSWORD_MIN_LENGTH } from '../src/auth/password';
import { buildPersonSlug } from '../src/users/person-slug';
import { createCliPrisma } from './prisma';
import { seedAdminCredentials } from './seed-credentials';

async function main(): Promise<void> {
  const defaults = seedAdminCredentials({
    ...process.env,
    ADMIN_EMAIL: process.argv[2] ?? process.env.ADMIN_EMAIL,
    ADMIN_NAME: process.argv[3] ?? process.env.ADMIN_NAME,
    ADMIN_PASSWORD: process.argv[4] ?? process.env.ADMIN_PASSWORD,
  });
  const { email, fullName, password } = defaults;

  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Provide a password with at least ${PASSWORD_MIN_LENGTH} characters as the third argument or ADMIN_PASSWORD`,
    );
  }

  const passwordHash = await hashPassword(password);

  const prisma = createCliPrisma();
  try {
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        activatedAt: new Date(),
        email,
        isSystemAccount: true,
        passwordHash,
        passwordSetAt: new Date(),
        role: PlatformRole.ADMIN,
        status: AccountStatus.ACTIVE,
      },
      update: {
        activatedAt: new Date(),
        passwordHash,
        passwordSetAt: new Date(),
        role: PlatformRole.ADMIN,
        status: AccountStatus.ACTIVE,
      },
      include: { person: true },
    });

    if (fullName && !user.person) {
      await prisma.person.create({
        data: {
          fullName,
          isPublished: false,
          slug: buildPersonSlug(fullName, user.id),
          userId: user.id,
        },
      });
    }

    console.log(`Admin ready: ${email}`);
    console.log('Log in with the password supplied to this command.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
