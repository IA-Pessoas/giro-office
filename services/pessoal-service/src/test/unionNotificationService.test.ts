import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { UnionNotificationService } from "../services/unionNotificationService.js";
import { organizationId, otherOrganizationId, unionId, userId } from "./pessoalCoreTestUtils.js";

const activeUserId = userId;
const duplicateUserId = "00000000-0000-4000-8000-000000000002";
const inactiveUserId = "00000000-0000-4000-8000-000000000003";
const lowPermissionUserId = "00000000-0000-4000-8000-000000000004";
const monthAgoUnionId = "40000000-0000-4000-8000-000000000002";
const otherOrganizationUnionId = "40000000-0000-4000-8000-000000000099";

type CreatedNotification = {
  user_id: string;
};

function createPrismaMock() {
  return {
    unionPessoal: {
      findMany: vi.fn(async ({ select, where }) => {
        if (select?.organization_id && !select?.id) {
          return [{ organization_id: organizationId }, { organization_id: otherOrganizationId }];
        }

        if (where?.organization_id === organizationId) {
          return [
            {
              id: unionId,
              name: "Sindicato A",
              base_date: new Date("2020-07-01T00:00:00.000Z"),
              organization_id: organizationId,
            },
            {
              id: monthAgoUnionId,
              name: "Sindicato B",
              base_date: new Date("2020-06-01T00:00:00.000Z"),
              organization_id: organizationId,
            },
            {
              id: "40000000-0000-4000-8000-000000000003",
              name: "Sindicato sem match",
              base_date: new Date("2020-07-15T00:00:00.000Z"),
              organization_id: organizationId,
            },
          ];
        }

        if (where?.organization_id === otherOrganizationId) {
          return [
            {
              id: otherOrganizationUnionId,
              name: "Sindicato Outra Org",
              base_date: new Date("2020-07-01T00:00:00.000Z"),
              organization_id: otherOrganizationId,
            },
          ];
        }

        return [];
      }),
    },
    permission: {
      findMany: vi.fn(async ({ where }) => {
        if (where?.organization_id === organizationId) {
          return [{ user_id: activeUserId }, { user_id: duplicateUserId }];
        }

        return [];
      }),
    },
    pessoalNotification: {
      findMany: vi.fn(async ({ where }) => {
        if (where?.organization_id !== organizationId) {
          return [];
        }

        return [
          {
            user_id: duplicateUserId,
            regarding_id: unionId,
            title: "Sindicato prestes a vencer",
          },
        ];
      }),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
  };
}

describe("UnionNotificationService", () => {
  it("cria notificacoes para data base de amanha e do mes anterior sem duplicar", async () => {
    const prisma = createPrismaMock();
    const service = new UnionNotificationService(prisma as never);

    const result = await service.runForDate({ now: new Date("2026-06-30T12:00:00.000Z") });

    expect(result).toEqual({
      organizations: 2,
      unionsMatched: 3,
      notificationsCreated: 3,
      duplicatesSkipped: 1,
    });
    expect(prisma.permission.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        pessoal: { gte: 1 },
        user: {
          organization_id: organizationId,
          status: "Ativo",
        },
      },
      select: { user_id: true },
    });
    expect(prisma.permission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: otherOrganizationId }),
      }),
    );
    expect(prisma.pessoalNotification.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.pessoalNotification.createMany).toHaveBeenCalledWith({
      data: [
        {
          user_id: activeUserId,
          regarding: "union",
          regarding_id: unionId,
          title: "Sindicato prestes a vencer",
          message: "Data base sera alcancada amanha.",
          organization_id: organizationId,
        },
        {
          user_id: activeUserId,
          regarding: "union",
          regarding_id: monthAgoUnionId,
          title: "Sindicato vencido",
          message: "Data base foi alcancada no mes passado.",
          organization_id: organizationId,
        },
        {
          user_id: duplicateUserId,
          regarding: "union",
          regarding_id: monthAgoUnionId,
          title: "Sindicato vencido",
          message: "Data base foi alcancada no mes passado.",
          organization_id: organizationId,
        },
      ],
    });
    expect(
      prisma.pessoalNotification.createMany.mock.calls.flatMap(([call]) =>
        (call.data as CreatedNotification[]).map((notification) => notification.user_id),
      ),
    ).not.toContain(inactiveUserId);
    expect(
      prisma.pessoalNotification.createMany.mock.calls.flatMap(([call]) =>
        (call.data as CreatedNotification[]).map((notification) => notification.user_id),
      ),
    ).not.toContain(lowPermissionUserId);
  });
});
