import "./envBootstrap.js";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LddService } from "../services/lddService.js";
import { lddPdfBase64 } from "./lddPdfFixtures.js";
import {
  clientId,
  createAuditMock,
  organizationId,
  recordId,
  userId,
} from "./pessoalCoreTestUtils.js";

function createPrismaMock() {
  return {
    client: {
      findFirst: vi.fn(
        async (): Promise<{ id: string; organization_id: string } | null> => ({
          id: clientId,
          organization_id: organizationId,
        }),
      ),
    },
    lddPessoal: {
      create: vi.fn(async ({ data }) => ({ id: recordId, ...data })),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({
        id: recordId,
        client_id: clientId,
        organization_id: organizationId,
      })),
      update: vi.fn(async ({ data }) => ({ id: recordId, client_id: clientId, ...data })),
      delete: vi.fn(async () => ({
        id: recordId,
        client_id: clientId,
        organization_id: organizationId,
      })),
    },
  };
}

describe("LddService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloqueia mutacoes de LDD para Viewer antes de acessar a persistencia", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new LddService(prisma as never, audit);
    const viewerContext = { organizationId, userId, permission: 1 };
    const operations = [
      () => service.create(viewerContext, { client_id: clientId, type: "FGTS" }),
      () => service.update(viewerContext, recordId, { status: "Regular" }),
      () => service.delete(viewerContext, recordId),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({ statusCode: 403 });
    }

    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    expect(prisma.lddPessoal.findFirst).not.toHaveBeenCalled();
    expect(prisma.lddPessoal.create).not.toHaveBeenCalled();
    expect(prisma.lddPessoal.update).not.toHaveBeenCalled();
    expect(prisma.lddPessoal.delete).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it("cria LDD com organization_id e registra auditoria", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new LddService(prisma as never, audit);

    const result = await service.create(
      { organizationId, userId, permission: 2 },
      { client_id: clientId, type: "FGTS", period: "Mensal" },
    );

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    expect(prisma.lddPessoal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ client_id: clientId, organization_id: organizationId }),
      }),
    );
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Cadastro",
        organizationId,
        userId,
        referring: "pessoal.ldd",
        referringId: recordId,
      }),
    );
    expect(result).toMatchObject({ id: recordId, client_id: clientId });
  });

  it("lista LDD apenas da organizacao autenticada", async () => {
    const prisma = createPrismaMock();
    const service = new LddService(prisma as never, createAuditMock());

    await service.list({ organizationId }, { client_id: clientId });

    expect(prisma.lddPessoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId, client_id: clientId },
      }),
    );
  });

  it("lista LDD por organizacao quando client_id nao e informado", async () => {
    const prisma = createPrismaMock();
    const service = new LddService(prisma as never, createAuditMock());

    await service.list({ organizationId }, {});

    expect(prisma.lddPessoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId },
      }),
    );
  });

  it("atualiza LDD escopado por organizacao", async () => {
    const prisma = createPrismaMock();
    const service = new LddService(prisma as never, createAuditMock());

    await service.update({ organizationId, userId, permission: 2 }, recordId, {
      status: "Regular",
    });

    expect(prisma.lddPessoal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: recordId, organization_id: organizationId } }),
    );
    expect(prisma.lddPessoal.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: recordId }, data: { status: "Regular" } }),
    );
  });

  it("remove LDD e audita snapshot do registro", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new LddService(prisma as never, audit);

    await service.delete({ organizationId, userId, permission: 2 }, recordId);

    expect(prisma.lddPessoal.delete).toHaveBeenCalledWith({ where: { id: recordId } });
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Exclusao",
        changes: expect.objectContaining({ id: recordId, organization_id: organizationId }),
      }),
    );
  });

  it("rejeita cliente fora da organizacao", async () => {
    const prisma = createPrismaMock();
    prisma.client.findFirst.mockResolvedValueOnce(null);
    const service = new LddService(prisma as never, createAuditMock());

    await expect(
      service.create(
        { organizationId, userId, permission: 2 },
        { client_id: clientId, type: "FGTS" },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it("monta a prévia do PDF LDD sem gravar nem auditar", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new LddService(prisma as never, audit);

    const preview = await service.previewImport(
      { organizationId, userId, permission: 2 },
      {
        client_id: clientId,
        file_name: "ldd.pdf",
        content_base64: lddPdfBase64(["CP-SEGUR. 01/2024 20/02/2024 10,00 10,00"]),
      },
    );

    expect(preview.rows).toEqual([
      expect.objectContaining({ period: "01/2024", due_date: "2024-02-20", balance_amount: 10 }),
    ]);
    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    expect(prisma.lddPessoal.create).not.toHaveBeenCalled();
    expect(prisma.lddPessoal.update).not.toHaveBeenCalled();
    expect(audit.recordChange).not.toHaveBeenCalled();
  });

  it("nega a prévia para Viewer e para cliente de outra organização", async () => {
    const prisma = createPrismaMock();
    const service = new LddService(prisma as never, createAuditMock());
    const body = {
      client_id: clientId,
      file_name: "ldd.pdf",
      content_base64: lddPdfBase64(["CP-SEGUR. 01/2024 20/02/2024 10,00 10,00"]),
    };

    await expect(
      service.previewImport({ organizationId, userId, permission: 1 }, body),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.client.findFirst).not.toHaveBeenCalled();

    prisma.client.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.previewImport({ organizationId, userId, permission: 2 }, body),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
