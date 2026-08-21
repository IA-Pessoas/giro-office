import { bootstrapPlatformAdmin } from "../services/platformAdminBootstrapService.js";

async function main(): Promise<void> {
  const name = process.env.PLATFORM_ADMIN_NAME?.trim();
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error(
      "PLATFORM_ADMIN_NAME, PLATFORM_ADMIN_EMAIL e PLATFORM_ADMIN_PASSWORD são obrigatórias.",
    );
  }

  const { prismaClient } = await import("../prisma/index.js");

  try {
    const result = await bootstrapPlatformAdmin(
      { name, email, password },
      {
        findByEmail: (platformEmail) =>
          prismaClient.platformUser.findUnique({
            where: { email: platformEmail },
            select: { id: true, email: true },
          }),
        create: (data) =>
          prismaClient.platformUser.create({
            data,
            select: { id: true, email: true },
          }),
      },
    );

    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await prismaClient.$disconnect();
  }
}

main().catch(() => {
  process.stderr.write("Não foi possível criar o administrador da plataforma.\n");
  process.exitCode = 1;
});
