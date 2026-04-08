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

function createReconciliationServiceMock() {
  return {
    handleClientPfChanged: vi.fn(async () => undefined),
    handlePartnersChanged: vi.fn(async () => undefined),
    handleLicenseChanged: vi.fn(async () => undefined),
    runFullReconciliation: vi.fn(async () => ({ processed: 0 })),
    runClientPfDocumentNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
    runInactiveClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
    runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
  };
}

describe("regularize remaining routes", () => {
  it("POST /regularize/municipal-taxes creates a municipal taxes record", async () => {
    const prisma = {
      client: {
        findFirst: vi.fn(async () => ({ id: "client-1" })),
      },
      municipalTaxes: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "tax-1",
          client_id: "d0000000-0000-4000-8000-000000000001",
          year: 2025,
          tff_is_applicable: true,
          tff_amount: 100,
          tff_notes: null,
          tff_analysis_is_done: false,
          tff_analysis_notes: null,
          tff_sent_date: null,
          tff_due_date: null,
          tlp_is_applicable: true,
          tlp_amount: 50,
          tlp_notes: null,
          tlp_is_sent: "Nao",
          tlp_sent_date: null,
          tlp_due_date: null,
          tlp_not_email: false,
          tll_is_applicable: false,
          tll_amount: 0,
          tll_notes: null,
          tll_is_sent: "Nao",
          tll_sent_date: null,
          tll_due_date: null,
          tll_analysis_is_done: false,
          tll_analysis_notes: null,
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
      reconciliationService: createReconciliationServiceMock() as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app)
      .post("/regularize/municipal-taxes")
      .set(gatewayHeaders())
      .send({
        client_id: "d0000000-0000-4000-8000-000000000001",
        year: 2025,
        tff_is_applicable: true,
        tff_amount: 100,
        tff_analysis_is_done: false,
        tlp_is_applicable: true,
        tlp_amount: 50,
        tlp_is_sent: "Nao",
        tlp_not_email: false,
        tll_is_applicable: false,
        tll_amount: 0,
        tll_is_sent: "Nao",
        tll_analysis_is_done: false,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("POST /regularize/process creates a process", async () => {
    const prisma = {
      process: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "process-1",
          client_pj_id: "d0000000-0000-4000-8000-000000000001",
          client_pf_id: null,
          cpf_cnpj: "12345678901",
          process_type: "Abertura",
          description: "Descricao",
          entry_date: null,
          completion_date: null,
          expected_date: null,
          status: "Aberto",
          observation: null,
          responsible1_id: null,
          responsible2_id: null,
          responsible3_id: null,
          locking_type: null,
          urgency: null,
          task_id: null,
        })),
      },
      client: {
        findFirst: vi.fn(async () => ({ id: "client-1" })),
      },
      clientPF: {
        findFirst: vi.fn(async () => null),
      },
      logs: {
        create: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    const app = createApp({
      env,
      logger: createLoggerMock(),
      prisma,
      reconciliationService: createReconciliationServiceMock() as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app)
      .post("/regularize/process")
      .set(gatewayHeaders())
      .send({
        client_pj_id: "d0000000-0000-4000-8000-000000000001",
        cpf_cnpj: "12345678901",
        process_type: "Abertura",
        description: "Descricao",
        status: "Aberto",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("POST /regularize/guidance creates a procedural guidance", async () => {
    const prisma = {
      process: {
        findFirst: vi.fn(async () => ({ id: "process-1" })),
      },
      proceduralGuidance: {
        create: vi.fn(async () => ({
          id: "guidance-1",
          process_id: "d0000000-0000-4000-8000-000000000001",
          status: "Em andamento",
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
      reconciliationService: createReconciliationServiceMock() as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app)
      .post("/regularize/guidance")
      .set(gatewayHeaders())
      .send({
        process_id: "d0000000-0000-4000-8000-000000000001",
        status: "Em andamento",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("POST /regularize/license creates a license and triggers reconciliation", async () => {
    const reconciliationService = createReconciliationServiceMock();
    const prisma = {
      client: {
        findFirst: vi.fn(async () => ({ id: "client-1" })),
      },
      license: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "license-1",
          client_id: "d0000000-0000-4000-8000-000000000001",
          has: true,
          type_license: "Alvara",
          entry_date: new Date("2025-01-01"),
          protocol: "PROTO-1",
          responsible_id: null,
          status: "Ativo",
          date_last_consultation: null,
          current_situation: "Regular",
          contact: "Contato",
          observation: null,
          urgency: "Media",
          type: "Anual",
          due_date: new Date("2025-02-01"),
          task_id: null,
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
      .post("/regularize/license")
      .set(gatewayHeaders())
      .send({
        client_id: "d0000000-0000-4000-8000-000000000001",
        has: true,
        type_license: "Alvara",
        entry_date: "2025-01-01",
        protocol: "PROTO-1",
        status: "Ativo",
        current_situation: "Regular",
        contact: "Contato",
        urgency: "Media",
        type: "Anual",
        due_date: "2025-02-01",
      });

    expect(response.status).toBe(201);
    expect(reconciliationService.handleLicenseChanged).toHaveBeenCalledWith(
      "a0000000-0000-4000-8000-000000000001",
      "license-1",
    );
  });
});
