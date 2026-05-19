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
      findFirst: vi.fn(async ({ where }) => {
        if (!where.id) {
          return null;
        }

        return {
          id: where.id,
          name: "Hardware",
          active: where.active ?? true,
          organization_id: where.organization_id,
        };
      }),
      create: vi.fn(async ({ data }) => ({ id: "cat-1", ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    user: {
      findFirst: vi.fn(async ({ where }) => ({
        id: where.id,
        organization_id: where.organization_id,
      })),
    },
    tIRequest: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async ({ where }) => ({
        id: where.id,
        status: "New",
        organization_id: where.organization_id,
      })),
      create: vi.fn(async ({ data }) => ({ id: "req-1", ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    tIMessage: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }) => ({ id: "msg-1", ...data })),
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
