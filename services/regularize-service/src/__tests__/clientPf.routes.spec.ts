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

describe("regularize client PF and partners routes", () => {
  it("POST /regularize/pf creates a record and triggers reconciliation", async () => {
    const reconciliationService = {
      handleClientPfChanged: vi.fn(async () => undefined),
      handlePartnersChanged: vi.fn(async () => undefined),
      handleLicenseChanged: vi.fn(async () => undefined),
      runFullReconciliation: vi.fn(async () => ({ processed: 0 })),
    };
    const prisma = {
      clientPF: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "pf-1",
          code: "001",
          name: "Nome",
          sex: "F",
          address: "Rua A",
          city: "Cidade",
          zip_code: "01001-000",
          state: "SP",
          profession: "Advogada",
          father: "Pai",
          mother: "Mae",
          marital_status: "Solteira",
          date_of_birth: new Date("1990-01-01"),
          cpf: "123",
          rg: "456",
          rg_expedition: null,
          rg_validity: null,
          military_certificate: "",
          ctps: "",
          cnh: "",
          cnh_expedition: null,
          cnh_validity: null,
          spouse: "",
          notes: "",
          status: "Ativo",
        })),
      },
      logs: {
        create: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    const app = createApp({
      env,
      logger: createLoggerMock(),
      prisma,
      reconciliationService: reconciliationService as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app).post("/regularize/pf").set(gatewayHeaders()).send({
      code: "001",
      name: "Nome",
      sex: "F",
      address: "Rua A",
      city: "Cidade",
      zip_code: "01001-000",
      state: "SP",
      profession: "Advogada",
      father: "Pai",
      mother: "Mae",
      marital_status: "Solteira",
      date_of_birth: "1990-01-01",
      cpf: "123",
      rg: "456",
      status: "Ativo",
    });

    expect(response.status).toBe(201);
    expect(reconciliationService.handleClientPfChanged).toHaveBeenCalledWith(
      "a0000000-0000-4000-8000-000000000001",
      "pf-1",
    );
  });

  it("POST /regularize/partners creates a record and triggers PF reconciliation", async () => {
    const reconciliationService = {
      handleClientPfChanged: vi.fn(async () => undefined),
      handlePartnersChanged: vi.fn(async () => undefined),
      handleLicenseChanged: vi.fn(async () => undefined),
      runFullReconciliation: vi.fn(async () => ({ processed: 0 })),
    };
    const prisma = {
      client: {
        findFirst: vi.fn(async () => ({ id: "pj-1" })),
      },
      clientPF: {
        findFirst: vi.fn(async () => ({ id: "pf-1" })),
      },
      partners: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "partner-1",
          pj_id: "d0000000-0000-4000-8000-000000000001",
          pf_id: "e0000000-0000-4000-8000-000000000001",
          part: 50,
          entry: new Date("2024-01-01"),
          exit: null,
        })),
      },
      logs: {
        create: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    const app = createApp({
      env,
      logger: createLoggerMock(),
      prisma,
      reconciliationService: reconciliationService as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app)
      .post("/regularize/partners")
      .set(gatewayHeaders())
      .send({
        pj_id: "d0000000-0000-4000-8000-000000000001",
        pf_id: "e0000000-0000-4000-8000-000000000001",
        part: 50,
        entry: "2024-01-01",
      });

    expect(response.status).toBe(201);
    expect(reconciliationService.handlePartnersChanged).toHaveBeenCalledWith(
      "a0000000-0000-4000-8000-000000000001",
      "e0000000-0000-4000-8000-000000000001",
    );
  });
});
