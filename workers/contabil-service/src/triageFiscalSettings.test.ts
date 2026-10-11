import { describe, expect, it, vi } from "vitest";
import { createDocumentsService } from "./services.js";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const auth = { userId: USER, organizationId: ORG, modules: { fiscal: 2 } };

function audit() {
  return { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
}

function prisma() {
  const database = {
    client: { findFirst: vi.fn().mockResolvedValue({ id: CLIENT }) },
    triageResponsible: { findFirst: vi.fn().mockResolvedValue(null) },
    triageConfig: { findFirst: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    triageCatalogItem: { findFirst: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
  );
  database.triageConfig.upsert.mockImplementation(async ({ create }) => create);
  return database;
}

describe("prioridade e meio de envio Fiscal do cliente (#1692)", () => {
  it("lê Não e sem meio de envio quando o cliente ainda não tem configuração fiscal", async () => {
    const database = prisma();

    const settings = await createDocumentsService(database as never, audit()).getFiscalSettings(
      { client_id: CLIENT },
      auth,
    );

    expect(database.triageConfig.findFirst).toHaveBeenCalledWith({
      where: { client_id: CLIENT, organization_id: ORG, type: "FISCAL" },
      select: { priority: true, delivery_method: true },
    });
    expect(settings).toEqual({ client_id: CLIENT, priority: false, delivery_method: null });
  });

  it("consulta só cliente da organização e com acesso ao Fiscal", async () => {
    const database = prisma();
    const service = createDocumentsService(database as never, audit());

    database.client.findFirst.mockResolvedValueOnce(null);
    await expect(service.getFiscalSettings({ client_id: CLIENT }, auth)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      service.getFiscalSettings({ client_id: CLIENT }, { ...auth, modules: {} }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(database.triageConfig.findFirst).not.toHaveBeenCalled();
  });

  it("grava prioridade e meio de envio do catálogo ativo sem tocar nos itens configurados", async () => {
    const database = prisma();
    database.triageConfig.findFirst.mockResolvedValue({ priority: false, delivery_method: null });
    database.triageCatalogItem.findFirst.mockResolvedValue({ code: "EMAIL" });
    const log = audit();

    const saved = await createDocumentsService(database as never, log).saveFiscalSettings(
      { client_id: CLIENT, priority: true, delivery_method: "EMAIL" },
      auth,
    );

    expect(database.client.findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT, organization_id: ORG },
      select: { id: true },
    });
    expect(database.triageCatalogItem.findFirst).toHaveBeenCalledWith({
      where: { organization_id: ORG, kind: "DELIVERY_METHOD", code: "EMAIL", archived_at: null },
      select: { code: true },
    });
    const args = database.triageConfig.upsert.mock.calls[0][0];
    expect(args.where).toEqual({
      organization_id_client_id_type: { organization_id: ORG, client_id: CLIENT, type: "FISCAL" },
    });
    expect(args.update).toEqual({ priority: true, delivery_method: "EMAIL" });
    expect(args.create).toEqual({
      organization_id: ORG,
      client_id: CLIENT,
      type: "FISCAL",
      active_items: [],
      priority: true,
      delivery_method: "EMAIL",
    });
    expect(saved).toEqual({ client_id: CLIENT, priority: true, delivery_method: "EMAIL" });
    expect(log.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        referring: "triagem.configs",
        oldData: { priority: false, delivery_method: null },
        updatedData: { priority: true, delivery_method: "EMAIL" },
      }),
    );
  });

  it("recusa meio de envio fora do catálogo ativo da organização", async () => {
    const database = prisma();
    database.triageCatalogItem.findFirst.mockResolvedValue(null);

    await expect(
      createDocumentsService(database as never, audit()).saveFiscalSettings(
        { client_id: CLIENT, delivery_method: "FAX" },
        auth,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(database.triageConfig.upsert).not.toHaveBeenCalled();
  });

  it("recusa cliente de outra organização e usuário sem escrita no Fiscal", async () => {
    const database = prisma();
    const service = createDocumentsService(database as never, audit());

    database.client.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.saveFiscalSettings({ client_id: CLIENT, priority: true }, auth),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.saveFiscalSettings(
        { client_id: CLIENT, priority: true },
        { ...auth, modules: { fiscal: 1 } },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(database.triageConfig.upsert).not.toHaveBeenCalled();
  });
});
