import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import {
  getLicenseDueDateBounds,
  getLicenseNotificationDateRange,
} from "../schemas/status.schemas.js";
import { RegularizeReconciliationService } from "../services/regularizeReconciliationService.js";

describe("RegularizeReconciliationService license notifications", () => {
  it("notifies once on the calendar date one month before an active client's due date", async () => {
    const referenceDate = new Date("2026-03-16T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(referenceDate);

    const notifications: Array<Record<string, unknown>> = [];
    const findMany = vi.fn(async () => [
      {
        id: "license-1",
        organization_id: "org-1",
        type_license: "Alvara municipal",
        due_date: new Date("2026-04-16T00:00:00.000Z"),
        client: { name: "Acme", organization_id: "org-1" },
      },
    ]);
    const permissionFindMany = vi.fn(async () => [{ user_id: "user-1" }]);
    const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      notifications.find(
        (notification) =>
          notification.organization_id === where.organization_id &&
          notification.user_id === where.user_id &&
          notification.regarding === where.regarding &&
          notification.regarding_id === where.regarding_id &&
          notification.title === where.title &&
          notification.reference_date instanceof Date &&
          where.reference_date instanceof Date &&
          notification.reference_date.getTime() === where.reference_date.getTime(),
      ),
    );
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      notifications.push(data);
      return data;
    });
    const prisma = {
      license: { findMany },
      permission: { findMany: permissionFindMany },
      regularizeNotification: { findFirst, create },
    } as unknown as PrismaClient;

    try {
      const service = new RegularizeReconciliationService(prisma);
      const firstRun = await service.runLicenseNotificationReconciliation();
      const secondRun = await service.runLicenseNotificationReconciliation();

      expect(findMany).toHaveBeenNthCalledWith(1, {
        where: {
          due_date: getLicenseNotificationDateRange(referenceDate),
          client: { status: "Ativo" },
        },
        include: {
          client: { select: { name: true, organization_id: true } },
        },
      });
      expect(firstRun).toEqual({ created: 1 });
      expect(secondRun).toEqual({ created: 0 });
      expect(create).toHaveBeenCalledTimes(1);
      expect(notifications[0]).toMatchObject({
        organization_id: "org-1",
        user_id: "user-1",
        regarding: "regularize.license",
        regarding_id: "license-1",
        reference_date: getLicenseDueDateBounds(referenceDate).today,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips licenses without a due date or with a client from another organization", async () => {
    const prisma = {
      license: {
        findMany: vi.fn(async () => [
          {
            id: "license-without-due-date",
            organization_id: "org-1",
            type_license: "Municipal",
            due_date: null,
            client: { name: "Acme", organization_id: "org-1" },
          },
          {
            id: "license-with-cross-org-client",
            organization_id: "org-1",
            type_license: "Federal",
            due_date: new Date("2026-04-16T00:00:00.000Z"),
            client: { name: "Other", organization_id: "org-2" },
          },
        ]),
      },
      permission: { findMany: vi.fn(async () => [{ user_id: "user-1" }]) },
      regularizeNotification: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    } as unknown as PrismaClient;
    const service = new RegularizeReconciliationService(prisma);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:00.000Z"));

    try {
      await expect(service.runLicenseNotificationReconciliation()).resolves.toEqual({ created: 0 });
      expect(prisma.permission.findMany).not.toHaveBeenCalled();
      expect(prisma.regularizeNotification.create).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not notify inactive clients because the query only includes active clients", async () => {
    const findMany = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      expect(where).toMatchObject({ client: { status: "Ativo" } });
      return [];
    });
    const permissionFindMany = vi.fn(async () => [{ user_id: "user-1" }]);
    const create = vi.fn();
    const prisma = {
      license: { findMany },
      permission: { findMany: permissionFindMany },
      regularizeNotification: {
        findFirst: vi.fn(),
        create,
      },
    } as unknown as PrismaClient;
    const service = new RegularizeReconciliationService(prisma);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:00.000Z"));

    try {
      await expect(service.runLicenseNotificationReconciliation()).resolves.toEqual({ created: 0 });
      expect(permissionFindMany).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats a unique-constraint race as an idempotent no-op", async () => {
    const prisma = {
      license: {
        findMany: vi.fn(async () => [
          {
            id: "license-1",
            organization_id: "org-1",
            type_license: "Municipal",
            due_date: new Date("2026-04-16T00:00:00.000Z"),
            client: { name: "Acme", organization_id: "org-1" },
          },
        ]),
      },
      permission: { findMany: vi.fn(async () => [{ user_id: "user-1" }]) },
      regularizeNotification: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => {
          throw { code: "P2002" };
        }),
      },
    } as unknown as PrismaClient;
    const service = new RegularizeReconciliationService(prisma);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:00.000Z"));

    try {
      await expect(service.runLicenseNotificationReconciliation()).resolves.toEqual({ created: 0 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("RegularizeReconciliationService client PF notifications", () => {
  it("uses a stable reference date so repeated reconciliation stays idempotent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:00.000Z"));

    const notifications: Array<Record<string, unknown>> = [];
    const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      notifications.find(
        (notification) =>
          notification.organization_id === where.organization_id &&
          notification.user_id === where.user_id &&
          notification.regarding === where.regarding &&
          notification.regarding_id === where.regarding_id &&
          notification.title === where.title &&
          notification.reference_date instanceof Date &&
          where.reference_date instanceof Date &&
          notification.reference_date.getTime() === where.reference_date.getTime(),
      ),
    );
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      notifications.push(data);
      return data;
    });
    const prisma = {
      clientPF: {
        findMany: vi.fn(async () => [
          {
            id: "client-pf-1",
            name: "Acme PF",
            organization_id: "org-1",
            rg_validity: new Date("2026-03-15T00:00:00.000Z"),
            cnh_validity: null,
          },
        ]),
      },
      permission: {
        findMany: vi.fn(async () => [{ user_id: "user-1" }]),
      },
      regularizeNotification: { findFirst, create },
    } as unknown as PrismaClient;

    try {
      const service = new RegularizeReconciliationService(prisma);
      await expect(service.runClientPfDocumentNotificationReconciliation()).resolves.toEqual({
        created: 1,
      });
      await expect(service.runClientPfDocumentNotificationReconciliation()).resolves.toEqual({
        created: 0,
      });

      expect(create).toHaveBeenCalledTimes(1);
      expect(notifications[0].reference_date).toEqual(new Date("1970-01-01T00:00:00.000Z"));
    } finally {
      vi.useRealTimers();
    }
  });
});
