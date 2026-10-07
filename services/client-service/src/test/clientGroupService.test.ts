import { describe, expect, it, vi } from "vitest";

import { ClientGroupService } from "../services/clientGroupService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const clientId = "00000000-0000-4000-8000-000000000003";
const groupId = "00000000-0000-4000-8000-000000000004";
const secondGroupId = "00000000-0000-4000-8000-000000000005";
const authorization = { userId: "user-1", level: 2, isOwner: false } as const;

describe("ClientGroupService", () => {
  it("creates groups scoped to the organization and trims their names", async () => {
    const create = vi.fn().mockResolvedValue({ id: groupId, name: "Holding", clients: [] });
    const prisma = {
      group: { findFirst: vi.fn().mockResolvedValue(null), create },
    };
    const service = new ClientGroupService(prisma as never);

    await expect(service.create(organizationId, " Holding ", authorization)).resolves.toMatchObject(
      { id: groupId, name: "Holding", clients: [] },
    );
    expect(create).toHaveBeenCalledWith({
      data: { name: "Holding", organization_id: organizationId },
      select: expect.any(Object),
    });
  });

  it("rejects client links from another organization without changing memberships", async () => {
    const transaction = {
      group: { findFirst: vi.fn().mockResolvedValue({ id: groupId }) },
      client: { findMany: vi.fn().mockResolvedValue([]) },
      clientsGroup: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    const prisma = {
      ...transaction,
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new ClientGroupService(prisma as never);

    await expect(
      service.replaceClients(groupId, organizationId, [clientId], authorization),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(transaction.clientsGroup.deleteMany).not.toHaveBeenCalled();
  });

  it("allows empty groups and persists clients in more than one group", async () => {
    const groupIds = new Set([groupId, secondGroupId]);
    const memberships: { group_id: string; client_id: string; organization_id: string }[] = [];
    const transaction = {
      group: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
          groupIds.has(where.id)
            ? { id: where.id, organization_id: organizationId, name: "Holding" }
            : null,
        ),
      },
      client: { findMany: vi.fn().mockResolvedValue([{ id: clientId }]) },
      clientsGroup: {
        deleteMany: vi.fn(async ({ where }: { where: { group_id: string } }) => {
          const remainingMemberships = memberships.filter(
            (membership) => membership.group_id !== where.group_id,
          );
          const count = memberships.length - remainingMemberships.length;
          memberships.splice(0, memberships.length, ...remainingMemberships);
          return { count };
        }),
        createMany: vi.fn(
          async ({ data }: { data: typeof memberships; skipDuplicates: boolean }) => {
            memberships.push(...data);
            return { count: data.length };
          },
        ),
      },
    };
    const prisma = {
      ...transaction,
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new ClientGroupService(prisma as never);

    await expect(
      service.replaceClients(groupId, organizationId, [], authorization),
    ).resolves.toEqual({ id: groupId, clients: [] });
    await service.replaceClients(groupId, organizationId, [clientId], authorization);
    await service.replaceClients(secondGroupId, organizationId, [clientId], authorization);

    expect(memberships).toEqual([
      { group_id: groupId, client_id: clientId, organization_id: organizationId },
      { group_id: secondGroupId, client_id: clientId, organization_id: organizationId },
    ]);
  });
});
