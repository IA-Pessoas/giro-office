import { pathToFileURL } from "node:url";

import { error as logError } from "@workspace/shared";
import {
  bootstrapPlatformAdmin,
  parsePlatformAdminBootstrapInput,
} from "../services/platformAdminBootstrapService.js";

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

  return parsePlatformAdminBootstrapInput({ name, email, password });
}

async function main(): Promise<void> {
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
  main().catch((error: unknown) => {
    logError("Falha ao criar administrador da plataforma", {
      errorName: error instanceof Error ? error.name : typeof error,
      ...(error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? { errorCode: error.code }
        : {}),
    });
    const errorMessage =
      error instanceof Error && /PLATFORM_ADMIN_(?:NAME|EMAIL|PASSWORD)/u.test(error.message)
        ? error.message
        : "Não foi possível criar o administrador da plataforma.";
    process.stderr.write(`${errorMessage}\n`);
    process.exitCode = 1;
  });
}
