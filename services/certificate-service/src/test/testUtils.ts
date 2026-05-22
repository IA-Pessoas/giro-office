import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import { vi } from "vitest";

import { createCertificateApplication } from "../app.js";
import type { CertificateServiceEnv } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";

export const certificateOrganizationId = "10000000-0000-4000-8000-000000000001";
export const certificateUserId = "00000000-0000-4000-8000-000000000001";

export function certificateGatewayHeaders(certificado = 1): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: certificateUserId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: certificateOrganizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(certificado),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "certificate-service-internal-token-test",
  };
}

export function certificateGatewayHeadersWithoutPermission(): Record<string, string> {
  const headers = certificateGatewayHeaders();
  delete headers[FORWARDED_AUTH_PERMISSION_HEADER];
  return headers;
}

export function createCertificatePrismaMock(): PrismaClient {
  return {
    certificatePJ: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [
        {
          id: "20000000-0000-4000-8000-000000000001",
          name: "Empresa Castelo",
          cnpj: "11222333000144",
          responsible: "Maria Silva",
          model: "A1",
          legal_nature: "LTDA",
          expiration_date: new Date("2026-12-31T00:00:00.000Z"),
          client_castelo_status: true,
          client_focus_status: false,
          notes: "Renovar com antecedencia",
          was_paid: true,
          payment_date: new Date("2026-01-10T00:00:00.000Z"),
          payment_amount: 250,
          contact_info: "certificados@example.com",
          file_path: "/certificates/pj/empresa.pfx",
          has_certificate: true,
          organization_id: certificateOrganizationId,
        },
      ]),
      findFirst: vi.fn(async ({ where }) => ({
        id: where.id ?? "20000000-0000-4000-8000-000000000001",
        name: "Empresa Castelo",
        cnpj: "11222333000144",
        responsible: "Maria Silva",
        model: "A1",
        legal_nature: "LTDA",
        password: "secret-password",
        expiration_date: new Date("2026-12-31T00:00:00.000Z"),
        client_castelo_status: true,
        client_focus_status: false,
        notes: "Renovar com antecedencia",
        was_paid: true,
        payment_date: new Date("2026-01-10T00:00:00.000Z"),
        payment_amount: 250,
        contact_info: "certificados@example.com",
        file_path: "/certificates/pj/empresa.pfx",
        has_certificate: true,
        organization_id: where.organization_id,
      })),
      create: vi.fn(async ({ data }) => ({
        id: "20000000-0000-4000-8000-000000000002",
        ...data,
      })),
      update: vi.fn(async ({ where, data }) => ({
        id: where.id,
        organization_id: certificateOrganizationId,
        ...data,
      })),
    },
  } as unknown as PrismaClient;
}

export function createCertificateTestApp(prisma = createCertificatePrismaMock()) {
  const env = {
    nodeEnv: "test",
    port: 3041,
    databaseUrl: "postgresql://localhost/certificate_service_test",
    jwtSecret: "test-secret",
    auditServiceUrl: "http://localhost:3020",
    auditServiceToken: "audit-service-token-test",
    internalServiceToken: "certificate-service-internal-token-test",
    notificationWindowDays: 30,
    allowedOrigins: ["*"],
    enableApiDocs: false,
    logLevel: "info",
    logPretty: false,
  } satisfies CertificateServiceEnv;
  const logger = createLogger({
    service: "certificate-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });

  return createCertificateApplication({
    env,
    logger,
    prisma,
  });
}
