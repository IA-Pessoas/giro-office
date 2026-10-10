import { describe, expect, it, vi } from "vitest";
import { cloudCreateSchema, cloudUpdateSchema } from "./schemas.js";
import { createDocumentsService } from "./services.js";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CLOUD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const auth = { userId: USER, organizationId: ORG, modules: { contabil: 2 } };

function audit() {
  return { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
}

function prisma() {
  const database = {
    client: { findFirst: vi.fn().mockResolvedValue({ id: CLIENT }) },
    triageResponsible: { findFirst: vi.fn().mockResolvedValue(null) },
    clientCloud: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(async ({ data }) => ({ id: CLOUD, ...data })),
      update: vi.fn(async ({ data }) => ({ id: CLOUD, client_id: CLIENT, ...data })),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
  );
  return database;
}

describe("referências de Cloud por cliente (#1695)", () => {
  it("lista as nuvens do cliente da organização", async () => {
    const database = prisma();
    database.clientCloud.findMany.mockResolvedValue([
      { id: CLOUD, type: "Google Drive", link: "https://drive.example/x" },
    ]);

    const clouds = await createDocumentsService(database as never, audit()).listClouds(
      { client_id: CLIENT },
      auth,
    );

    expect(database.client.findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT, organization_id: ORG },
      select: { id: true },
    });
    expect(database.clientCloud.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG, client_id: CLIENT },
      select: { id: true, client_id: true, type: true, link: true, updated_at: true },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
    expect(clouds).toEqual([{ id: CLOUD, type: "Google Drive", link: "https://drive.example/x" }]);
  });

  it("cria a nuvem na organização do usuário e registra a trilha", async () => {
    const database = prisma();
    const log = audit();

    const cloud = await createDocumentsService(database as never, log).createCloud(
      { client_id: CLIENT, type: "OneDrive", link: "https://onedrive.example/pasta" },
      auth,
    );

    expect(database.clientCloud.create).toHaveBeenCalledWith({
      data: {
        organization_id: ORG,
        client_id: CLIENT,
        type: "OneDrive",
        link: "https://onedrive.example/pasta",
      },
    });
    expect(cloud).toMatchObject({ id: CLOUD, type: "OneDrive" });
    expect(log.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        organizationId: ORG,
        referring: "clientes.clouds",
        referringId: CLOUD,
      }),
    );
  });

  it("altera só nuvem da organização e registra o antes e depois", async () => {
    const database = prisma();
    const current = { id: CLOUD, client_id: CLIENT, type: "Drive", link: "https://a.example" };
    database.clientCloud.findFirst.mockResolvedValue(current);
    const log = audit();

    await createDocumentsService(database as never, log).updateCloud(
      CLOUD,
      { link: "https://b.example" },
      auth,
    );

    expect(database.clientCloud.findFirst).toHaveBeenCalledWith({
      where: { id: CLOUD, organization_id: ORG },
    });
    expect(database.clientCloud.update).toHaveBeenCalledWith({
      where: { id: CLOUD },
      data: { link: "https://b.example" },
    });
    expect(log.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        referring: "clientes.clouds",
        referringId: CLOUD,
        oldData: current,
      }),
    );

    database.clientCloud.findFirst.mockResolvedValue(null);
    await expect(
      createDocumentsService(database as never, log).updateCloud(CLOUD, { type: "X" }, auth),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("aceita escrita de quem edita a rotina fiscal e recusa quem não edita nenhuma", async () => {
    const database = prisma();
    const service = createDocumentsService(database as never, audit());
    const input = { client_id: CLIENT, type: "Drive", link: "https://a.example" };

    await expect(
      service.createCloud(input, { ...auth, modules: { contabil: 1, fiscal: 2 } }),
    ).resolves.toMatchObject({ id: CLOUD });
    await expect(
      service.createCloud(input, { ...auth, modules: { contabil: 1, fiscal: 1 } }),
    ).rejects.toMatchObject({ statusCode: 403 });
    database.client.findFirst.mockResolvedValue(null);
    await expect(service.createCloud(input, auth)).rejects.toMatchObject({ statusCode: 404 });
    expect(database.clientCloud.create).toHaveBeenCalledTimes(1);
  });

  it("aceita só link http(s), sem upload", () => {
    const base = { client_id: CLIENT, type: "Drive" };
    expect(cloudCreateSchema.safeParse({ ...base, link: "https://drive.example/a" }).success).toBe(
      true,
    );
    expect(cloudCreateSchema.safeParse({ ...base, link: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(cloudCreateSchema.safeParse({ ...base, link: "ftp://files.example" }).success).toBe(
      false,
    );
    expect(
      cloudCreateSchema.safeParse({ ...base, link: "https://a.example", file: "x" }).success,
    ).toBe(false);
    expect(cloudUpdateSchema.safeParse({}).success).toBe(false);
  });
});
