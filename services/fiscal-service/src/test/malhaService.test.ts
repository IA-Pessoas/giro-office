import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { MalhaService, validateMalhaAttachment } from "../services/malhaService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const otherOrganizationId = "a0000000-0000-4000-8000-000000000002";
const userId = "c0000000-0000-4000-8000-000000000001";
const responsibleId = "c0000000-0000-4000-8000-000000000002";
const clientId = "d0000000-0000-4000-8000-000000000001";
const taskId = "e0000000-0000-4000-8000-000000000001";
const malhaId = "f0000000-0000-4000-8000-000000000001";

const PDF = new TextEncoder().encode("%PDF-1.7 fake");

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: malhaId,
    organization_id: organizationId,
    client_id: clientId,
    period_start: new Date("2025-01-01T00:00:00.000Z"),
    period_end: new Date("2025-12-01T00:00:00.000Z"),
    reason: "Divergência DCTFWeb",
    deadline: null as Date | null,
    status: "aberta",
    responsible_id: null as string | null,
    task_id: null as string | null,
    attachment_path: null as string | null,
    attachment_original_name: null as string | null,
    attachment_mime_type: null as string | null,
    attachment_size_bytes: null as number | null,
    attachment_uploaded_at: null as Date | null,
    attachment_uploaded_by: null as string | null,
    created_by: userId,
    updated_by: userId,
    createdAt: new Date("2026-10-08T12:00:00.000Z"),
    updatedAt: new Date("2026-10-08T12:00:00.000Z"),
    ...overrides,
  };
}

function dependencies(current = stored()) {
  let row = current;
  const fiscalMalha = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => stored(data)),
    // Simula a trava otimista: só grava se organização e updatedAt baterem.
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { organization_id: string; updatedAt: Date };
        data: Record<string, unknown>;
      }) => {
        if (
          where.organization_id !== row.organization_id ||
          where.updatedAt.getTime() !== row.updatedAt.getTime()
        ) {
          return { count: 0 };
        }
        row = { ...row, ...data, updatedAt: new Date(row.updatedAt.getTime() + 1000) };
        return { count: 1 };
      },
    ),
    findFirst: vi.fn(async ({ where }: { where: { organization_id: string } }) =>
      where.organization_id === row.organization_id ? row : null,
    ),
    findMany: vi.fn(async () => [current]),
    count: vi.fn(async () => 1),
  };
  const fiscalMalhaHistory = {
    createMany: vi.fn(async () => ({ count: 1 })),
    findMany: vi.fn(async () => [
      {
        id: "h1",
        field: "status",
        previous_value: "aberta",
        new_value: "respondida",
        actor_user_id: userId,
        created_at: new Date("2026-10-08T13:00:00.000Z"),
      },
    ]),
  };
  const prisma = {
    client: { findFirst: vi.fn(async () => ({ id: clientId }) as { id: string } | null) },
    task: { findFirst: vi.fn(async () => ({ id: taskId }) as { id: string } | null) },
    user: { findFirst: vi.fn(async () => ({ id: responsibleId }) as { id: string } | null) },
    permission: { findFirst: vi.fn(async () => ({ id: "p1" }) as { id: string } | null) },
    fiscalMalha,
    fiscalMalhaHistory,
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ fiscalMalha, fiscalMalhaHistory }),
    ),
  };
  const audit = { createLog: vi.fn(async () => {}) };
  const storage = {
    upload: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    createSignedUrl: vi.fn(async () => "https://storage.test/signed"),
  };
  return { prisma, audit, storage, service: new MalhaService(prisma as never, audit, storage) };
}

const actor = { organizationId, userId, permission: 2 };

describe("MalhaService", () => {
  it("cadastra malha do cliente da organização e registra histórico inicial na transação", async () => {
    const { prisma, service, audit } = dependencies();

    const result = await service.create({
      ...actor,
      client_id: clientId,
      period_start: "2025-01",
      period_end: "2025-12",
      reason: "Divergência DCTFWeb",
      deadline: "2026-11-10",
      status: "aberta",
      responsible_id: responsibleId,
      task_id: taskId,
    });

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: taskId, organization_id: organizationId },
      select: { id: true },
    });
    expect(prisma.permission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: responsibleId, organization_id: organizationId, fiscal: { gt: 0 } },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.fiscalMalhaHistory.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          field: "deadline",
          previous_value: null,
          new_value: "2026-11-10",
        }),
        expect.objectContaining({ field: "status", previous_value: null, new_value: "aberta" }),
        expect.objectContaining({
          field: "responsible_id",
          new_value: responsibleId,
          actor_user_id: userId,
          organization_id: organizationId,
        }),
      ],
    });
    expect(result).toMatchObject({
      period_start: "2025-01",
      period_end: "2025-12",
      deadline: "2026-11-10",
      task_id: taskId,
      attachment: null,
    });
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Cadastro", referring: "fiscal.malhas" }),
    );
  });

  it("recusa cliente, tarefa ou responsável fora da organização", async () => {
    const base = {
      ...actor,
      client_id: clientId,
      period_start: "2025-01",
      period_end: "2025-12",
      reason: "x",
      status: "aberta" as const,
    };

    const noClient = dependencies();
    noClient.prisma.client.findFirst.mockResolvedValueOnce(null);
    await expect(noClient.service.create(base)).rejects.toMatchObject({ statusCode: 404 });

    const noTask = dependencies();
    noTask.prisma.task.findFirst.mockResolvedValueOnce(null);
    await expect(noTask.service.create({ ...base, task_id: taskId })).rejects.toMatchObject({
      statusCode: 404,
      message: "Tarefa não encontrada na organização.",
    });

    const noPermission = dependencies();
    noPermission.prisma.permission.findFirst.mockResolvedValueOnce(null);
    await expect(
      noPermission.service.create({ ...base, responsible_id: responsibleId }),
    ).rejects.toMatchObject({ statusCode: 404 });

    for (const deps of [noClient, noTask, noPermission]) {
      expect(deps.prisma.$transaction).not.toHaveBeenCalled();
    }
  });

  it("grava histórico só dos campos rastreados que mudaram, com ator e valores", async () => {
    const { prisma, service } = dependencies(
      stored({ deadline: new Date("2026-11-10T00:00:00.000Z") }),
    );

    await service.update({
      ...actor,
      id: malhaId,
      status: "respondida",
      deadline: "2026-11-10",
      reason: "Respondida via e-CAC",
    });

    expect(prisma.fiscalMalhaHistory.createMany).toHaveBeenCalledWith({
      data: [
        {
          organization_id: organizationId,
          malha_id: malhaId,
          field: "status",
          previous_value: "aberta",
          new_value: "respondida",
          actor_user_id: userId,
        },
      ],
    });
  });

  it("não encontra malha de outra organização", async () => {
    const { service, prisma } = dependencies(stored({ organization_id: otherOrganizationId }));

    await expect(
      service.update({ ...actor, id: malhaId, status: "encerrada" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.detail(malhaId, organizationId)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.attachmentAccess(malhaId, organizationId)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.fiscalMalha.updateMany).not.toHaveBeenCalled();
  });

  it("edição concorrente perde com 409 e não grava histórico", async () => {
    const { prisma, service } = dependencies();
    // Outra pessoa salvou entre a leitura e a gravação.
    prisma.fiscalMalha.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.update({ ...actor, id: malhaId, status: "encerrada" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.fiscalMalhaHistory.createMany).not.toHaveBeenCalled();
  });

  it("transferir responsável já atribuído exige nível 3; o primeiro responsável não", async () => {
    const assigned = dependencies(stored({ responsible_id: userId }));
    await expect(
      assigned.service.update({ ...actor, id: malhaId, responsible_id: responsibleId }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(assigned.prisma.fiscalMalha.updateMany).not.toHaveBeenCalled();

    const admin = dependencies(stored({ responsible_id: userId }));
    await admin.service.update({
      ...actor,
      permission: 3,
      id: malhaId,
      responsible_id: responsibleId,
    });
    expect(admin.prisma.fiscalMalhaHistory.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          field: "responsible_id",
          previous_value: userId,
          new_value: responsibleId,
        }),
      ],
    });

    const first = dependencies();
    await first.service.update({ ...actor, id: malhaId, responsible_id: responsibleId });
    expect(first.prisma.fiscalMalha.updateMany).toHaveBeenCalledOnce();
  });

  it("recusa período invertido considerando o valor já gravado", async () => {
    const { service } = dependencies();
    await expect(
      service.update({ ...actor, id: malhaId, period_start: "2026-01" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("lista sempre filtrada pela organização e pelos filtros informados", async () => {
    const { prisma, service } = dependencies();

    const result = await service.list(
      { client_id: clientId, status: "aberta", responsible_id: responsibleId, page_size: 10 },
      organizationId,
    );

    expect(prisma.fiscalMalha.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: organizationId,
          client_id: clientId,
          status: "aberta",
          responsible_id: responsibleId,
        },
        take: 10,
      }),
    );
    expect(result.total).toBe(1);
  });

  it("detalha a malha com o histórico da organização", async () => {
    const { prisma, service } = dependencies();
    const result = await service.detail(malhaId, organizationId);
    expect(prisma.fiscalMalhaHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { malha_id: malhaId, organization_id: organizationId } }),
    );
    expect(result.history[0]).toMatchObject({ field: "status", new_value: "respondida" });
  });

  it("anexa arquivo no caminho da organização e substitui o anterior", async () => {
    const previous = `fiscal/organizations/${organizationId}/malhas/${malhaId}/old.pdf`;
    const { storage, service, prisma } = dependencies(stored({ attachment_path: previous }));

    const result = await service.replaceAttachment({
      ...actor,
      id: malhaId,
      file: {
        bytes: PDF,
        mimetype: "application/pdf",
        originalname: "intimacao.pdf",
        size: PDF.length,
      },
    });

    const [objectPath] = storage.upload.mock.calls[0] as unknown as [string];
    expect(objectPath).toMatch(
      new RegExp(`^fiscal/organizations/${organizationId}/malhas/${malhaId}/[0-9a-f-]{36}\\.pdf$`),
    );
    expect(prisma.fiscalMalha.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attachment_path: objectPath,
          attachment_uploaded_by: userId,
        }),
      }),
    );
    expect(storage.remove).toHaveBeenCalledWith(previous);
    expect(result.attachment).toMatchObject({
      original_name: "intimacao.pdf",
      size_bytes: PDF.length,
    });
  });

  it("remove o objeto enviado se a gravação falhar", async () => {
    const { storage, service, prisma } = dependencies();
    prisma.fiscalMalha.updateMany.mockRejectedValueOnce(new Error("db down"));
    await expect(
      service.replaceAttachment({
        ...actor,
        id: malhaId,
        file: { bytes: PDF, mimetype: "application/pdf", originalname: "a.pdf", size: PDF.length },
      }),
    ).rejects.toThrow("db down");
    expect(storage.remove).toHaveBeenCalledWith(storage.upload.mock.calls[0]?.[0 as never]);
  });

  it("gera URL assinada curta só para anexo da própria malha", async () => {
    const path = `fiscal/organizations/${organizationId}/malhas/${malhaId}/x.pdf`;
    const ok = dependencies(stored({ attachment_path: path }));
    await expect(ok.service.attachmentAccess(malhaId, organizationId)).resolves.toEqual({
      url: "https://storage.test/signed",
      expires_in_seconds: 300,
    });

    const foreign = dependencies(
      stored({ attachment_path: "fiscal/organizations/x/malhas/y/z.pdf" }),
    );
    await expect(foreign.service.attachmentAccess(malhaId, organizationId)).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it("valida tipo, extensão e assinatura do anexo", () => {
    const file = {
      bytes: PDF,
      mimetype: "application/pdf",
      originalname: "a.pdf",
      size: PDF.length,
    };
    expect(validateMalhaAttachment(file).mimetype).toBe("application/pdf");
    expect(() => validateMalhaAttachment(undefined)).toThrow("obrigatório");
    expect(() => validateMalhaAttachment({ ...file, originalname: "a.png" })).toThrow("Extensão");
    expect(() => validateMalhaAttachment({ ...file, mimetype: "text/plain" })).toThrow("Formato");
    expect(() =>
      validateMalhaAttachment({ ...file, bytes: new TextEncoder().encode("MZ......") }),
    ).toThrow("Assinatura");
    expect(() => validateMalhaAttachment({ ...file, size: 11 * 1024 * 1024 })).toThrow("10 MB");
  });

  it("sem storage configurado responde 503 nas operações de anexo", async () => {
    const { prisma, audit } = dependencies();
    const service = new MalhaService(prisma as never, audit);
    await expect(service.attachmentAccess(malhaId, organizationId)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});
