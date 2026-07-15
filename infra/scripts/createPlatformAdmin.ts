import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "../generated/prisma/client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function showHelp(): void {
  console.log(`
Usage:
  pnpm --filter @workspace/infra run platform-admin:create

Required environment variables:
  DATABASE_URL
  PLATFORM_ADMIN_EMAIL
  PLATFORM_ADMIN_PASSWORD

Optional environment variables:
  PLATFORM_ADMIN_NAME
`);
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  const connectionString = readRequiredEnv("DATABASE_URL");
  const platformAdminEmail = readRequiredEnv("PLATFORM_ADMIN_EMAIL").toLowerCase();
  const platformAdminPassword = readRequiredEnv("PLATFORM_ADMIN_PASSWORD");
  const platformAdminName = process.env.PLATFORM_ADMIN_NAME?.trim() || "Platform Admin";

  if (platformAdminPassword.length < 12) {
    throw new Error("PLATFORM_ADMIN_PASSWORD must have at least 12 characters");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await bcrypt.hash(platformAdminPassword, 12);
    const platformUser = await prisma.platformUser.upsert({
      where: { email: platformAdminEmail },
      update: {
        name: platformAdminName,
        password: passwordHash,
        status: "active",
        platform_role: "super_admin",
      },
      create: {
        name: platformAdminName,
        email: platformAdminEmail,
        password: passwordHash,
        status: "active",
        platform_role: "super_admin",
      },
      select: {
        id: true,
        email: true,
        platform_role: true,
        status: true,
      },
    });

    console.log(
      `Platform admin ready: ${platformUser.email} (${platformUser.id}, ${platformUser.status})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Failed to create platform admin:", err);
  process.exitCode = 1;
});
