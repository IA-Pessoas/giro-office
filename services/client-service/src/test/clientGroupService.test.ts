import { describe, expect, it, vi } from "vitest";

import { ClientGroupService } from "../services/clientGroupService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const clientId = "00000000-0000-4000-8000-000000000003";
const groupId = "00000000-0000-4000-8000-000000000004";
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
    const group = { id: groupId, organization_id: organizationId, name: "Holding" };
    const transaction = {
      group: { findFirst: vi.fn().mockResolvedValue(group) },
      client: { findMany: vi.fn().mockResolvedValue([{ id: clientId }]) },
      clientsGroup: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
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
      service.replaceClients(groupId, organizationId, [clientId], authorization),
    ).resolves.toEqual({ id: groupId, clients: [{ id: clientId }] });
    expect(transaction.clientsGroup.createMany).toHaveBeenCalledWith({
      data: [{ group_id: groupId, client_id: clientId, organization_id: organizationId }],
      skipDuplicates: true,
    });
  });
});
