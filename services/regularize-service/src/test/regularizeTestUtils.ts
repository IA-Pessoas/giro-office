import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { vi } from "vitest";

import { createApp } from "../app.js";
import type { RegularizeServiceEnv } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { RegularizeReconciliationService } from "../services/regularizeReconciliationService.js";

export const regularizeTestEnv: RegularizeServiceEnv = {
  port: 3039,
  nodeEnv: "test",
  databaseUrl: "postgresql://localhost/test",
  jwtSecret: "secret",
  auditServiceToken: "audit-service-token",
  internalServiceToken: "internal-token",
  encryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  logLevel: "info",
  logPretty: false,
  enableApiDocs: false,
  allowedOrigins: ["*"],
};

export function gatewayHeaders(permission = 1) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: regularizeTestEnv.auditServiceToken,
    [FORWARDED_AUTH_USER_ID_HEADER]: "user-1",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "a0000000-0000-4000-8000-000000000001",
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

export function createLoggerMock() {
  const childLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  };

  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(() => childLogger),
  } as never;
}

export function createTestApp(prisma: PrismaClient = {} as PrismaClient) {
  return createApp({
    env: regularizeTestEnv,
    logger: createLoggerMock(),
    prisma,
    reconciliationService: new RegularizeReconciliationService(prisma),
    runReconciliation: vi.fn(async () => ({ processed: 0 })),
    runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
    runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
    runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
  });
}
