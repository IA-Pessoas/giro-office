import { pathToFileURL } from "node:url";

import { bootstrapPlatformAdmin } from "../services/platformAdminBootstrapService.js";

export function getPlatformAdminBootstrapInput(environment: NodeJS.ProcessEnv): {
  name: string;
  email: string;
  password: string;
} {
  const name = environment.PLATFORM_ADMIN_NAME?.trim();
  const email = environment.PLATFORM_ADMIN_EMAIL?.trim();
  const password = environment.PLATFORM_ADMIN_PASSWORD;

  if (!name || !email || !password || !password.trim()) {
    throw new Error(
      "PLATFORM_ADMIN_NAME, PLATFORM_ADMIN_EMAIL e PLATFORM_ADMIN_PASSWORD são obrigatórias.",
    );
  }

  return { name, email, password };
}

async function main(): Promise<void> {
  const input = getPlatformAdminBootstrapInput(process.env);
  const { prismaClient } = await import("../prisma/index.js");

  try {
    const result = await bootstrapPlatformAdmin(
      input,
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

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    process.stderr.write("Não foi possível criar o administrador da plataforma.\n");
    process.exitCode = 1;
  });
}
