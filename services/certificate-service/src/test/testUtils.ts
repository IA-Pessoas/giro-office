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
import { createCertificateFileCrypto } from "../services/certificateFileCrypto.js";
import type { CertificateFileStorage } from "../services/certificateFileStorage.js";

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
      delete: vi.fn(async ({ where }) => ({
        id: where.id,
        organization_id: where.organization_id,
      })),
    },
    certificatePF: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [
        {
          id: "30000000-0000-4000-8000-000000000001",
          name: "Joao Silva",
          cpf: "12345678901",
          model: "A1",
          expiration_date: new Date("2026-12-31T00:00:00.000Z"),
          client_castelo_status: true,
          client_focus_status: false,
          notes: "Renovar com antecedencia",
          enterprise: "Empresa Castelo",
          cnpj: "11222333000144",
          was_paid: true,
          payment_date: new Date("2026-01-10T00:00:00.000Z"),
          payment_amount: 250,
          contact_info: "certificados@example.com",
          file_path: "/certificates/pf/joao.pfx",
          has_certificate: true,
          organization_id: certificateOrganizationId,
        },
      ]),
      findFirst: vi.fn(async ({ where }) => ({
        id: where.id ?? "30000000-0000-4000-8000-000000000001",
        name: "Joao Silva",
        cpf: "12345678901",
        model: "A1",
        password: "secret-password",
        expiration_date: new Date("2026-12-31T00:00:00.000Z"),
        client_castelo_status: true,
        client_focus_status: false,
        notes: "Renovar com antecedencia",
        enterprise: "Empresa Castelo",
        cnpj: "11222333000144",
        was_paid: true,
        payment_date: new Date("2026-01-10T00:00:00.000Z"),
        payment_amount: 250,
        contact_info: "certificados@example.com",
        file_path: "/certificates/pf/joao.pfx",
        has_certificate: true,
        organization_id: where.organization_id,
      })),
      create: vi.fn(async ({ data }) => ({
        id: "30000000-0000-4000-8000-000000000002",
        ...data,
      })),
      update: vi.fn(async ({ where, data }) => ({
        id: where.id,
        organization_id: certificateOrganizationId,
        ...data,
      })),
      delete: vi.fn(async ({ where }) => ({
        id: where.id,
        organization_id: where.organization_id,
      })),
    },
    certificateNotification: {
      findMany: vi.fn(async () => [
        {
          id: "40000000-0000-4000-8000-000000000001",
          certificate_id: "20000000-0000-4000-8000-000000000001",
          client_name: "Empresa Castelo",
          type: "PJ",
          date: new Date("2026-12-31T00:00:00.000Z"),
          organization_id: certificateOrganizationId,
        },
      ]),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({
        id: "40000000-0000-4000-8000-000000000002",
        ...data,
      })),
      update: vi.fn(async ({ where, data }) => ({
        id: where.id,
        certificate_id: "20000000-0000-4000-8000-000000000001",
        type: "PJ",
        organization_id: certificateOrganizationId,
        ...data,
      })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  } as unknown as PrismaClient;
}

export interface CreateCertificateTestAppOptions {
  envOverrides?: Partial<CertificateServiceEnv>;
  fileStorage?: CertificateFileStorage;
  fileCrypto?: ReturnType<typeof createCertificateFileCrypto>;
}

export function createMemoryCertificateFileStorage(): CertificateFileStorage & {
  objects: Map<string, Buffer>;
} {
  const objects = new Map<string, Buffer>();

  return {
    objects,
    async putObject({ path, buffer }) {
      objects.set(path, buffer);
    },
    async getObject(path) {
      const object = objects.get(path);
      if (!object) {
        throw new Error("missing object");
      }
      return object;
    },
    async deleteObject(path) {
      objects.delete(path);
    },
  };
}

export function createCertificateTestApp(
  prisma = createCertificatePrismaMock(),
  options: CreateCertificateTestAppOptions = {},
) {
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
    storageMode: "local",
    storageBucket: "Certificados",
    storageDir: ".data/test-certificate-files",
    certificateFileMaxSizeBytes: 5 * 1024 * 1024,
    certificateFileEncryptionKey: Buffer.alloc(32, 7).toString("base64"),
    certificateFileEncryptionKeyVersion: "v1",
    supabaseUrl: "https://example.supabase.co",
    supabaseServiceRoleKey: "test-service-role",
    uploadRateLimitMax: 30,
    uploadRateLimitWindowMs: 600_000,
    ...options.envOverrides,
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
    certificateFileStorage: options.fileStorage ?? createMemoryCertificateFileStorage(),
    certificateFileCrypto:
      options.fileCrypto ??
      createCertificateFileCrypto({
        keyBase64: env.certificateFileEncryptionKey,
        keyVersion: env.certificateFileEncryptionKeyVersion,
      }),
  });
}
