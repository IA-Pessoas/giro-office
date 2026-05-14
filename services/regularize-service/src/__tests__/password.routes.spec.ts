import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { RegularizeServiceEnv } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { EncryptionService } from "../services/encryptionService.js";
import { RegularizeReconciliationService } from "../services/regularizeReconciliationService.js";

const env: RegularizeServiceEnv = {
  port: 3411,
  nodeEnv: "test",
  databaseUrl: "postgresql://localhost/test",
  jwtSecret: "secret",
  auditServiceToken: "audit-service-token",
  internalServiceToken: "internal-token",
  encryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  logLevel: "info",
  logPretty: false,
  enableApiDocs: false,
};

process.env.DATABASE_URL = env.databaseUrl;
process.env.JWT_SECRET = env.jwtSecret;
process.env.AUDIT_SERVICE_TOKEN = env.auditServiceToken;
process.env.MTK_ENCRYPTION_KEY = env.encryptionKey;

function gatewayHeaders() {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: env.auditServiceToken,
    [FORWARDED_AUTH_USER_ID_HEADER]: "user-1",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "a0000000-0000-4000-8000-000000000001",
  };
}

function createLoggerMock() {
  const child = vi.fn();
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: child.mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
      child: vi.fn(),
    }),
  } as never;
}

describe("regularize password routes", () => {
  it("POST /regularize/passwords without auth returns 401", async () => {
    const prisma = {} as PrismaClient;
    const app = createApp({
      env,
      logger: createLoggerMock(),
      prisma,
      reconciliationService: new RegularizeReconciliationService(prisma),
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app).post("/regularize/passwords").send({});

    expect(response.status).toBe(401);
  });

  it("POST /regularize/passwords with gateway auth creates a password", async () => {
    const prisma = {
      client: {
        findFirst: vi.fn(async () => ({ id: "client-1" })),
      },
      sitePasswordsRegularize: {
        findFirst: vi.fn(async () => ({ id: "site-1" })),
      },
      passwordRegularize: {
        findMany: vi.fn(async () => []),
        create: vi.fn(async () => {
          const encryption = new EncryptionService(env.encryptionKey);
          return {
            id: "pass-1",
            client_id: "d0000000-0000-4000-8000-000000000001",
            site_id: "e0000000-0000-4000-8000-000000000001",
            login: encryption.encrypt("login"),
            password: encryption.encrypt("password"),
            notes: "nota",
          };
        }),
      },
      logs: {
        create: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    const app = createApp({
      env,
      logger: createLoggerMock(),
      prisma,
      reconciliationService: new RegularizeReconciliationService(prisma),
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app).post("/regularize/passwords").set(gatewayHeaders()).send({
      client_id: "d0000000-0000-4000-8000-000000000001",
      site_id: "e0000000-0000-4000-8000-000000000001",
      login: "login",
      password: "password",
      notes: "nota",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe("pass-1");
  });
});
