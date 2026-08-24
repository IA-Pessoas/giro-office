import { pathToFileURL } from "node:url";

import {
  bootstrapPlatformAdmin,
  parsePlatformAdminBootstrapInput,
} from "../services/platformAdminBootstrapService.js";

export function getPlatformAdminBootstrapInput(environment: NodeJS.ProcessEnv): {
  name: string;
  email: string;
} {
  const name = environment.PLATFORM_ADMIN_NAME?.trim();
  const email = environment.PLATFORM_ADMIN_EMAIL?.trim();

  if (!name || !email) {
    throw new Error("PLATFORM_ADMIN_NAME e PLATFORM_ADMIN_EMAIL são obrigatórias.");
  }

  if (environment.PLATFORM_ADMIN_PASSWORD !== undefined) {
    throw new Error("PLATFORM_ADMIN_PASSWORD não é aceita; a senha é gerada pelo próprio comando.");
  }

  return parsePlatformAdminBootstrapInput({ name, email });
}

export function assertInteractiveSecretOutput(isTTY: boolean | undefined): void {
  if (isTTY !== true) {
    throw new Error("Execute o bootstrap em um terminal interativo para receber o segredo.");
  }
}

async function main(): Promise<void> {
  assertInteractiveSecretOutput(process.stdout.isTTY);
  const input = getPlatformAdminBootstrapInput(process.env);
  const { prismaClient } = await import("../prisma/index.js");

  try {
    const result = await bootstrapPlatformAdmin(input, {
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
    });

    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await prismaClient.$disconnect();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("Não foi possível criar o administrador da plataforma.\n");
    process.exitCode = 1;
  });
}
