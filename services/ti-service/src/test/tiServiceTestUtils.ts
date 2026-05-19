import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import { vi } from "vitest";

import { createTiApplication } from "../app.js";
import type { TiServiceEnv } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";

export function createPrismaMock(): PrismaClient {
  return {
    tICategoryRequest: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({ id: "cat-1", ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
  } as unknown as PrismaClient;
}

export function createTestApp(prisma = createPrismaMock()) {
  const env = {
    nodeEnv: "test",
    port: 3040,
    databaseUrl: "postgresql://localhost/ti_service_test",
    auditServiceUrl: "http://localhost:3020",
    auditServiceToken: "audit-service-token-test",
    internalServiceToken: "ti-service-internal-token-test",
    allowedOrigins: ["*"],
    enableApiDocs: false,
    logLevel: "info",
    logPretty: false,
  } satisfies TiServiceEnv;
  const logger = createLogger({
    service: "ti-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });

  return createTiApplication({
    env,
    logger,
    prisma,
  });
}
