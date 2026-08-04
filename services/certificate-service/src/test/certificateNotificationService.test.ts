import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { CertificateNotificationService } from "../services/certificateNotificationService.js";
import { certificateOrganizationId } from "./testUtils.js";

const now = new Date("2026-05-25T12:00:00.000Z");
const windowEnd = new Date("2026-06-24T23:59:59.999Z");

function createNotificationRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    certificate_id: "20000000-0000-4000-8000-000000000001",
    client_name: "Empresa Castelo",
    type: "PJ",
    date: new Date("2026-05-20T00:00:00.000Z"),
    organization_id: certificateOrganizationId,
    ...overrides,
  };
}

describe("CertificateNotificationService", () => {
  it("listCertificateNotifications filters by organization_id and orders by date", async () => {
    const prisma = {
      certificateNotification: {
        count: vi.fn(async () => 21),
        findMany: vi.fn(async () => [createNotificationRecord()]),
      },
    };
    const service = new CertificateNotificationService(prisma as never);

    const result = await service.listCertificateNotifications({
      organizationId: certificateOrganizationId,
      query: { page: 2, page_size: 10 },
    });

    expect(prisma.certificateNotification.findMany).toHaveBeenCalledWith({
      where: { organization_id: certificateOrganizationId },
      orderBy: [{ date: "asc" }, { client_name: "asc" }],
      skip: 10,
      take: 10,
    });
    expect(result).toEqual({
      items: [createNotificationRecord()],
      total: 21,
      page: 2,
      page_size: 10,
      has_more: true,
    });
  });

  it("runCertificateNotificationReconciliation creates notifications for expired and upcoming certificates", async () => {
    const prisma = {
      certificatePJ: {
        findMany: vi.fn(async () => [
          {
            id: "20000000-0000-4000-8000-000000000001",
            name: "Empresa Vencida",
            expiration_date: new Date("2026-05-20T00:00:00.000Z"),
            organization_id: certificateOrganizationId,
          },
        ]),
      },
      certificatePF: {
        findMany: vi.fn(async () => [
          {
            id: "30000000-0000-4000-8000-000000000001",
            name: "Joao Silva",
            expiration_date: new Date("2026-06-10T00:00:00.000Z"),
            organization_id: certificateOrganizationId,
          },
        ]),
      },
      certificateNotification: {
        findMany: vi.fn(async () => []),
        upsert: vi.fn(async ({ create }) => ({ id: crypto.randomUUID(), ...create })),
      },
    };
    const service = new CertificateNotificationService(prisma as never);

    const result = await service.runCertificateNotificationReconciliation({
      now,
      windowDays: 30,
    });

    expect(prisma.certificatePJ.findMany).toHaveBeenCalledWith({
      where: {
        has_certificate: true,
        expiration_date: { lte: windowEnd },
      },
      select: {
        id: true,
        name: true,
        expiration_date: true,
        organization_id: true,
      },
    });
    expect(prisma.certificatePF.findMany).toHaveBeenCalledWith({
      where: {
        has_certificate: true,
        expiration_date: { lte: windowEnd },
      },
      select: {
        id: true,
        name: true,
        expiration_date: true,
        organization_id: true,
      },
    });
    expect(prisma.certificateNotification.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.certificateNotification.upsert).toHaveBeenNthCalledWith(1, {
      where: {
        certificateNotificationIdentity: {
          organization_id: certificateOrganizationId,
          certificate_id: "20000000-0000-4000-8000-000000000001",
          type: "PJ",
        },
      },
      update: {
        client_name: "Empresa Vencida",
        date: new Date("2026-05-20T00:00:00.000Z"),
      },
      create: {
        certificate_id: "20000000-0000-4000-8000-000000000001",
        client_name: "Empresa Vencida",
        type: "PJ",
        date: new Date("2026-05-20T00:00:00.000Z"),
        organization_id: certificateOrganizationId,
      },
    });
    expect(prisma.certificateNotification.upsert).toHaveBeenNthCalledWith(2, {
      where: {
        certificateNotificationIdentity: {
          organization_id: certificateOrganizationId,
          certificate_id: "30000000-0000-4000-8000-000000000001",
          type: "PF",
        },
      },
      update: {
        client_name: "Joao Silva",
        date: new Date("2026-06-10T00:00:00.000Z"),
      },
      create: {
        certificate_id: "30000000-0000-4000-8000-000000000001",
        client_name: "Joao Silva",
        type: "PF",
        date: new Date("2026-06-10T00:00:00.000Z"),
        organization_id: certificateOrganizationId,
      },
    });
    expect(result).toEqual({
      evaluated: 2,
      created: 2,
      updated: 0,
    });
  });

  it("runCertificateNotificationReconciliation updates existing notifications instead of duplicating them", async () => {
    const existingNotification = createNotificationRecord({
      client_name: "Empresa Antiga",
      date: new Date("2026-05-19T00:00:00.000Z"),
    });
    const prisma = {
      certificatePJ: {
        findMany: vi.fn(async () => [
          {
            id: "20000000-0000-4000-8000-000000000001",
            name: "Empresa Atualizada",
            expiration_date: new Date("2026-05-20T00:00:00.000Z"),
            organization_id: certificateOrganizationId,
          },
        ]),
      },
      certificatePF: {
        findMany: vi.fn(async () => []),
      },
      certificateNotification: {
        findMany: vi.fn(async () => [existingNotification]),
        upsert: vi.fn(async ({ update }) => ({
          ...existingNotification,
          ...update,
        })),
      },
    };
    const service = new CertificateNotificationService(prisma as never);

    const result = await service.runCertificateNotificationReconciliation({
      now,
      windowDays: 30,
    });

    expect(prisma.certificateNotification.findMany).toHaveBeenCalledWith({
      where: {
        type: "PJ",
        organization_id: { in: [certificateOrganizationId] },
        certificate_id: { in: ["20000000-0000-4000-8000-000000000001"] },
      },
      select: {
        certificate_id: true,
        organization_id: true,
        type: true,
      },
    });
    expect(prisma.certificateNotification.upsert).toHaveBeenCalledWith({
      where: {
        certificateNotificationIdentity: {
          organization_id: certificateOrganizationId,
          certificate_id: "20000000-0000-4000-8000-000000000001",
          type: "PJ",
        },
      },
      update: {
        client_name: "Empresa Atualizada",
        date: new Date("2026-05-20T00:00:00.000Z"),
      },
      create: {
        certificate_id: "20000000-0000-4000-8000-000000000001",
        client_name: "Empresa Atualizada",
        type: "PJ",
        date: new Date("2026-05-20T00:00:00.000Z"),
        organization_id: certificateOrganizationId,
      },
    });
    expect(result).toEqual({
      evaluated: 1,
      created: 0,
      updated: 1,
    });
  });

  it("runCertificateNotificationReconciliation batches identity lookups and upserts", async () => {
    const candidates = Array.from({ length: 26 }, (_, index) => ({
      id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: `Empresa ${index + 1}`,
      expiration_date: new Date("2026-05-20T00:00:00.000Z"),
      organization_id: certificateOrganizationId,
    }));
    const prisma = {
      certificatePJ: {
        findMany: vi.fn(async () => candidates),
      },
      certificatePF: {
        findMany: vi.fn(async () => []),
      },
      certificateNotification: {
        findMany: vi.fn(async () => []),
        upsert: vi.fn(async ({ create }) => ({ id: crypto.randomUUID(), ...create })),
      },
    };
    const service = new CertificateNotificationService(prisma as never);

    const result = await service.runCertificateNotificationReconciliation({
      now,
      windowDays: 30,
    });

    expect(prisma.certificateNotification.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.certificateNotification.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        type: "PJ",
        organization_id: { in: [certificateOrganizationId] },
        certificate_id: {
          in: candidates.slice(0, 25).map((candidate) => candidate.id),
        },
      },
      select: {
        certificate_id: true,
        organization_id: true,
        type: true,
      },
    });
    expect(prisma.certificateNotification.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        type: "PJ",
        organization_id: { in: [certificateOrganizationId] },
        certificate_id: {
          in: candidates.slice(25).map((candidate) => candidate.id),
        },
      },
      select: {
        certificate_id: true,
        organization_id: true,
        type: true,
      },
    });
    expect(prisma.certificateNotification.upsert).toHaveBeenCalledTimes(26);
    expect(result).toEqual({
      evaluated: 26,
      created: 26,
      updated: 0,
    });
  });
});
