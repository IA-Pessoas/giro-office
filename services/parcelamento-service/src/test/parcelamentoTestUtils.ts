import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import { vi } from "vitest";

import type { ParcelamentoServiceEnv } from "../config/env.js";
import type { ParcelamentoRequestContext } from "../middlewares/requestContext.js";

export const organizationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const otherOrganizationId = "aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb";
export const userId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
export const clientId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
export const otherClientId = "cccccccc-cccc-cccc-cccc-dddddddddddd";
export const installmentId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
export const otherInstallmentId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
export const competencyId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
export const panoramaId = "11111111-1111-1111-1111-111111111111";
export const responsavelId = "22222222-2222-2222-2222-222222222222";
export const requestId = "request-installment-1";

export const parcelamentoContext: ParcelamentoRequestContext = {
  requestId,
  userId,
  organizationId,
  permission: "2",
};

export const enrollmentDate = new Date("2026-02-10T00:00:00.000Z");
export const completionDate = new Date("2026-07-01T00:00:00.000Z");

export function createInstallmentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: installmentId,
    client_id: clientId,
    type: "Federal",
    jurisdiction: "PGFN",
    is_automatic_debit: false,
    consolidated_total_amount: 0,
    first_installment_amount: 100,
    current_month_installment_amount: 120,
    outstanding_balance: 1200,
    paid_installments_count: 0,
    agreed_installments_count: 10,
    remaining_installments_count: 10,
    overdue_installments_count: 0,
    enrollment_date: enrollmentDate,
    document_url: "",
    status: "Ativo",
    completion_date: null,
    down_payment_installments_count: 0,
    legal_nature: "Tributario",
    situation_shutdown: null,
    agreement_number: null,
    organization_id: organizationId,
    ...overrides,
  };
}

export function createCreateInstallmentBody(overrides: Record<string, unknown> = {}) {
  return {
    client_id: clientId,
    agreement_number: " AC-123 ",
    type: "Federal",
    legal_nature: "Tributario",
    jurisdiction: "PGFN",
    is_automatic_debit: false,
    first_installment_amount: 100,
    current_month_installment_amount: 120,
    agreed_installments_count: 10,
    enrollment_date: "2026-02-10T00:00:00.000Z",
    ...overrides,
  };
}

export function createInstallmentCompetencyFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: competencyId,
    installment_id: installmentId,
    competence: "2026-07",
    how_many_paid: 1,
    how_many_overdue: 0,
    download: false,
    download_notes: null,
    upload_file: false,
    is_sent: false,
    submission_type: null,
    notes: null,
    installment_amount: 120,
    organization_id: organizationId,
    ...overrides,
  };
}

export function createCreateInstallmentCompetencyBody(overrides: Record<string, unknown> = {}) {
  return {
    competence: "2026-07",
    how_many_paid: 1,
    how_many_overdue: 0,
    download: false,
    download_notes: "Sem pendencias",
    upload_file: false,
    is_sent: false,
    submission_type: "manual",
    notes: "Primeira competencia",
    installment_amount: 120,
    ...overrides,
  };
}

export function createPanoramaFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: panoramaId,
    competence: "2026-07",
    cnd_municipal: false,
    cnd_state: false,
    cnd_federal: false,
    cnd_fgts: false,
    cnd_labor: false,
    protests: false,
    state_tax_situation: false,
    federal_tax_situation: false,
    responsavel_id: null,
    client_id: clientId,
    organization_id: organizationId,
    ...overrides,
  };
}

export function createCreatePanoramaBody(overrides: Record<string, unknown> = {}) {
  return {
    client_id: clientId,
    competence: "2026-07",
    ...overrides,
  };
}

export function createPrismaMock() {
  const fixture = createInstallmentFixture();

  const prisma = {
    client: {
      findFirst: vi.fn(async () => ({ id: clientId, organization_id: organizationId })),
      findMany: vi.fn(async () => [{ id: clientId }]),
    },
    user: {
      findFirst: vi.fn(async () => ({ id: responsavelId, organization_id: organizationId })),
    },
    installment: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [fixture]),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => createInstallmentFixture(data)),
      update: vi.fn(async ({ data }) => createInstallmentFixture(data)),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    installmentCompetencies: {
      count: vi.fn(async () => 1),
      create: vi.fn(async ({ data }) => createInstallmentCompetencyFixture(data)),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async ({ data }) => createInstallmentCompetencyFixture(data)),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    panoramaParcelameto: {
      count: vi.fn(async () => 1),
      create: vi.fn(async ({ data }) => createPanoramaFixture(data)),
      createMany: vi.fn(async ({ data }) => ({ count: Array.isArray(data) ? data.length : 0 })),
      findMany: vi.fn(async () => [createPanoramaFixture()]),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async ({ data }) => createPanoramaFixture(data)),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $queryRaw: vi.fn(async () => [{ ok: 1 }]),
    $transaction: vi.fn(async (callback) => callback(prisma)),
  };

  return prisma;
}

export function createAuditMock() {
  return {
    recordChange: vi.fn(async () => undefined),
  };
}

export function createTestLogger() {
  return createLogger({
    service: "parcelamento-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });
}

export function createEnv(overrides: Partial<ParcelamentoServiceEnv> = {}): ParcelamentoServiceEnv {
  return {
    port: 3043,
    nodeEnv: "test",
    databaseUrl: "postgresql://user:pass@localhost:5432/db",
    jwtSecret: "test-jwt-secret",
    auditEnabled: true,
    auditServiceUrl: "http://localhost:3020",
    auditServiceToken: "test-audit-token",
    logLevel: "silent",
    logPretty: false,
    allowedOrigins: ["*"],
    enableApiDocs: false,
    ...overrides,
  };
}

export function parcelamentoHeaders(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    "x-request-id": requestId,
    "x-auth-user-id": userId,
    "x-auth-organization-id": organizationId,
    "x-auth-permission": "2",
    ...overrides,
  };
}
