import { describe, expect, it, vi } from "vitest";
import { type ClientAuditEvent, ClientService } from "./clientService.js";
import type { PrismaClient } from "./generated/prisma/client.js";

const ORG = "org-1";
const regularizeEditor = {
  userId: "user-1",
  level: 0,
  permission: 2,
  modules: { regularize: 2 },
  isOwner: false,
};
const regularizeViewer = { ...regularizeEditor, modules: { regularize: 1 } };
const otherModule = { ...regularizeEditor, modules: { fiscal: 3, comercial: 3 } };

function setup(options: { members?: string[]; organizationClients?: string[] } = {}) {
  const group = { id: "g1", name: "Holding", status: true, organization_id: ORG, clients: [] };
  const organizationClients = options.organizationClients ?? ["c1", "c2", "c3"];
  const prisma = {
    group: {
      findMany: vi.fn().mockResolvedValue([group]),
      findFirst: vi.fn(async ({ where }) =>
        where.id === "g1" && where.organization_id === ORG
          ? group
          : where.name === "Holding" && where.id?.not !== "g1"
            ? { id: "g1" }
            : null,
      ),
      create: vi.fn(async ({ data }) => ({ ...group, id: "g-new", ...data })),
      update: vi.fn(async ({ data }) => ({ ...group, ...data })),
    },
    client: {
      findMany: vi.fn(async ({ where }) =>
        (where.id.in as string[])
          .filter((id) => organizationClients.includes(id))
          .map((id) => ({ id })),
      ),
    },
    clientsGroup: {
      findMany: vi.fn(async () => (options.members ?? []).map((client_id) => ({ client_id }))),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  const events: ClientAuditEvent[] = [];
  const service = new ClientService(
    prisma as unknown as PrismaClient,
    undefined,
    undefined,
    undefined,
    false,
    async (event) => {
      events.push(event);
    },
  );
  return { prisma, service, events };
}

describe("client groups in the worker", () => {
  it("lets Regularize read at level 1 and edit at level 2, scoped to the organization", async () => {
    const { prisma, service } = setup();
    await expect(service.listGroups(ORG, regularizeViewer)).resolves.toHaveLength(1);
    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORG } }),
    );
    await expect(service.createGroup(ORG, "Filiais", regularizeViewer)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(service.createGroup(ORG, "Filiais", regularizeEditor)).resolves.toMatchObject({
      name: "Filiais",
    });
  });

  it("denies users without Integração or Regularize", async () => {
    const { service } = setup();
    await expect(service.listGroups(ORG, otherModule)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects a duplicate name and a group from another organization", async () => {
    const { service } = setup();
    await expect(service.createGroup(ORG, " Holding ", regularizeEditor)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(
      service.updateGroup("g1", "org-2", { status: false }, regularizeEditor),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("inactivates a group and audits the status change", async () => {
    const { prisma, service, events } = setup();
    await service.updateGroup("g1", ORG, { status: false }, regularizeEditor);
    expect(prisma.group.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "g1" }, data: { status: false } }),
    );
    expect(events).toEqual([
      expect.objectContaining({
        referring: "clients.group",
        referringId: "g1",
        changes: { status: { from: true, to: false } },
      }),
    ]);
  });

  it("only adds and removes the difference, never repeating a client in the group", async () => {
    const { prisma, service, events } = setup({ members: ["c1", "c2"] });
    await service.replaceGroupClients("g1", ORG, ["c2", "c3", "c3"], regularizeEditor);
    expect(prisma.clientsGroup.deleteMany).toHaveBeenCalledWith({
      where: { group_id: "g1", organization_id: ORG, client_id: { in: ["c1"] } },
    });
    expect(prisma.clientsGroup.createMany).toHaveBeenCalledWith({
      data: [{ group_id: "g1", client_id: "c3", organization_id: ORG }],
      skipDuplicates: true,
    });
    expect(events[0]).toMatchObject({
      changes: { clients: { from: { removed: ["c1"] }, to: { added: ["c3"] } } },
    });
  });

  it("keeps the links untouched when nothing changes", async () => {
    const { prisma, service, events } = setup({ members: ["c1"] });
    await service.replaceGroupClients("g1", ORG, ["c1"], regularizeEditor);
    expect(prisma.clientsGroup.deleteMany).not.toHaveBeenCalled();
    expect(prisma.clientsGroup.createMany).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("rejects clients from another organization", async () => {
    const { prisma, service } = setup({ organizationClients: ["c1"] });
    await expect(
      service.replaceGroupClients("g1", ORG, ["c1", "foreign"], regularizeEditor),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.clientsGroup.createMany).not.toHaveBeenCalled();
  });
});
