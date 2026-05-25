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
        findMany: vi.fn(async () => [createNotificationRecord()]),
      },
    };
    const service = new CertificateNotificationService(prisma as never);

    const result = await service.listCertificateNotifications({
      organizationId: certificateOrganizationId,
    });

    expect(prisma.certificateNotification.findMany).toHaveBeenCalledWith({
      where: { organization_id: certificateOrganizationId },
      orderBy: [{ date: "asc" }, { client_name: "asc" }],
    });
    expect(result).toEqual([createNotificationRecord()]);
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
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: crypto.randomUUID(), ...data })),
        update: vi.fn(),
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
    expect(prisma.certificateNotification.create).toHaveBeenCalledTimes(2);
    expect(prisma.certificateNotification.create).toHaveBeenNthCalledWith(1, {
      data: {
        certificate_id: "20000000-0000-4000-8000-000000000001",
        client_name: "Empresa Vencida",
        type: "PJ",
        date: new Date("2026-05-20T00:00:00.000Z"),
        organization_id: certificateOrganizationId,
      },
    });
    expect(prisma.certificateNotification.create).toHaveBeenNthCalledWith(2, {
      data: {
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
        findFirst: vi.fn(async () => existingNotification),
        create: vi.fn(),
        update: vi.fn(async ({ where, data }) => ({
          ...existingNotification,
          id: where.id,
          ...data,
        })),
      },
    };
    const service = new CertificateNotificationService(prisma as never);

    const result = await service.runCertificateNotificationReconciliation({
      now,
      windowDays: 30,
    });

    expect(prisma.certificateNotification.findFirst).toHaveBeenCalledWith({
      where: {
        certificate_id: "20000000-0000-4000-8000-000000000001",
        type: "PJ",
        organization_id: certificateOrganizationId,
      },
    });
    expect(prisma.certificateNotification.update).toHaveBeenCalledWith({
      where: { id: existingNotification.id },
      data: {
        client_name: "Empresa Atualizada",
        date: new Date("2026-05-20T00:00:00.000Z"),
      },
    });
    expect(prisma.certificateNotification.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      evaluated: 1,
      created: 0,
      updated: 1,
    });
  });
});
