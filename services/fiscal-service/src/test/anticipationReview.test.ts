import "./envBootstrap.js";

import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { AnticipationService } from "../services/anticipationService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const responsibleId = "c0000000-0000-4000-8000-000000000001";
const reviewerId = "c0000000-0000-4000-8000-000000000002";
const batchId = "b0000000-0000-4000-8000-000000000001";
const itemIds = ["e0000000-0000-4000-8000-000000000001", "e0000000-0000-4000-8000-000000000002"];

const responsible = { organizationId, userId: responsibleId, permission: 2 };
const reviewer = { organizationId, userId: reviewerId, permission: 2 };

type Row = Record<string, unknown>;
const matches = (row: Row, where: Row) =>
  Object.entries(where).every(([key, value]) =>
    key === "classification" && value === null ? row[key] == null : row[key] === value,
  );

/** Prisma em memória: lote, itens e histórico, com o updateMany condicional do serviço. */
function fakeDatabase(status = "pending_review") {
  const batch: Row = {
    id: batchId,
    organization_id: organizationId,
    client_id: "d0000000-0000-4000-8000-000000000001",
    competence: new Date("2026-09-01T00:00:00.000Z"),
    file_name: "notas.zip",
    status,
    responsible_id: responsibleId,
    reviewer_id: status === "pending_review" ? null : reviewerId,
    entry_count: 1,
    note_count: 1,
    item_count: 2,
    issues: [],
    created_by: responsibleId,
    createdAt: new Date("2026-10-09T12:00:00.000Z"),
    updatedAt: new Date("2026-10-09T12:00:00.000Z"),
  };
  const items: Row[] = itemIds.map((id, index) => ({
    id,
    organization_id: organizationId,
    batch_id: batchId,
    entry: "100.xml",
    access_key: "3".repeat(44),
    issuer: "11222333000181",
    model: "55",
    series: "1",
    note_number: "100",
    item_number: index + 1,
    code: `P${index + 1}`,
    description: "Produto",
    ncm: "22030000",
    cfop: "6102",
    quantity: "2",
    value: "10.00",
    ipi: null,
    icms_st: "1.50",
    classification: null,
    manual_value: null,
    corrections: {},
  }));
  const history: Row[] = [];
  const fiscalAnticipationBatch = {
    findFirst: vi.fn(async ({ where }: { where: Row }) =>
      matches(batch, where) ? { ...batch } : null,
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      if (!matches(batch, where)) return { count: 0 };
      Object.assign(batch, data);
      return { count: 1 };
    }),
  };
  const fiscalAnticipationItem = {
    findFirst: vi.fn(async ({ where }: { where: Row }) => {
      const item = items.find((row) => matches(row, where));
      return item ? { ...item } : null;
    }),
    findMany: vi.fn(async ({ where }: { where: Row }) =>
      items.filter((item) => matches(item, where)),
    ),
    count: vi.fn(
      async ({ where }: { where: Row }) => items.filter((item) => matches(item, where)).length,
    ),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const item = items.find((row) => row.id === where.id);
      if (!item) throw new Error("item inexistente");
      Object.assign(item, data);
      return item;
    }),
  };
  const fiscalAnticipationHistory = {
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      history.push(...data);
      return { count: data.length };
    }),
    findMany: vi.fn(async () =>
      history.map((row, index) => ({
        id: `h${index}`,
        item_id: null,
        previous_value: null,
        new_value: null,
        reason: null,
        created_at: new Date("2026-10-09T13:00:00.000Z"),
        ...row,
      })),
    ),
  };
  const tx = { fiscalAnticipationBatch, fiscalAnticipationItem, fiscalAnticipationHistory };
  const prisma = {
    ...tx,
    client: { findFirst: vi.fn(async () => ({ id: "client" })) },
    user: { findFirst: vi.fn(async () => ({ id: reviewerId }) as { id: string } | null) },
    permission: { findFirst: vi.fn(async () => ({ id: "p1" }) as { id: string } | null) },
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const audit = { createLog: vi.fn(async () => undefined) };
  return {
    batch,
    items,
    history,
    prisma,
    audit,
    service: new AnticipationService(prisma as never, audit),
  };
}

describe("AnticipationService revisão de itens", () => {
  it("classifica, corrige e informa valor manual com anterior, novo, motivo e ator", async () => {
    const { service, history, items } = fakeDatabase();

    const item = await service.updateItem({
      ...responsible,
      batchId,
      itemId: itemIds[0] as string,
      classification: "partial",
      manual_value: "7.5",
      corrections: { ncm: "22029900", value: "9.90" },
      reason: "Conferido com o pedido de compra",
    });

    expect(item).toMatchObject({
      classification: "partial",
      manual_value: "7.50",
      corrections: { ncm: "22029900", value: "9.90" },
      ncm: "22030000",
      value: "10.00",
    });
    expect(items[0]?.ncm).toBe("22030000");
    expect(history).toEqual([
      expect.objectContaining({
        organization_id: organizationId,
        batch_id: batchId,
        item_id: itemIds[0],
        field: "classification",
        previous_value: null,
        new_value: "partial",
        reason: "Conferido com o pedido de compra",
        actor_user_id: responsibleId,
      }),
      expect.objectContaining({ field: "manual_value", previous_value: null, new_value: "7.50" }),
      expect.objectContaining({
        field: "correction.ncm",
        previous_value: null,
        new_value: "22029900",
      }),
      expect.objectContaining({
        field: "correction.value",
        previous_value: null,
        new_value: "9.90",
      }),
    ]);
  });

  it("desfaz correção com null e não grava histórico quando nada muda", async () => {
    const { service, history, items } = fakeDatabase();
    Object.assign(items[0] as Row, { classification: "total", corrections: { cfop: "6403" } });

    await service.updateItem({
      ...responsible,
      batchId,
      itemId: itemIds[0] as string,
      classification: "total",
      corrections: { cfop: null },
      reason: "CFOP do XML estava certo",
    });

    expect(items[0]?.corrections).toEqual({});
    expect(history).toEqual([
      expect.objectContaining({
        field: "correction.cfop",
        previous_value: "6403",
        new_value: null,
      }),
    ]);
  });

  it("recusa alteração fora da classificação e item de outro lote ou organização", async () => {
    const awaiting = fakeDatabase("awaiting_check");
    await expect(
      awaiting.service.updateItem({
        ...responsible,
        batchId,
        itemId: itemIds[0] as string,
        classification: "freight",
        reason: "x",
      }),
    ).rejects.toEqual(
      new ServiceError(409, "O lote não está em classificação; devolva-o antes de alterar itens."),
    );

    const { service } = fakeDatabase();
    await expect(
      service.updateItem({
        ...responsible,
        organizationId: "a0000000-0000-4000-8000-000000000009",
        batchId,
        itemId: itemIds[0] as string,
        classification: "freight",
        reason: "x",
      }),
    ).rejects.toEqual(new ServiceError(404, "Lote de antecipação não encontrado."));
    await expect(
      service.updateItem({
        ...responsible,
        batchId,
        itemId: "e0000000-0000-4000-8000-000000000099",
        classification: "freight",
        reason: "x",
      }),
    ).rejects.toEqual(new ServiceError(404, "Item não encontrado no lote."));
  });
});

describe("AnticipationService conferência do lote", () => {
  async function classifyAll(service: AnticipationService) {
    for (const itemId of itemIds) {
      await service.updateItem({
        ...responsible,
        batchId,
        itemId,
        classification: "total",
        reason: "ok",
      });
    }
  }

  it("só envia à conferência com todos os itens classificados", async () => {
    const { service, batch } = fakeDatabase();
    await service.updateItem({
      ...responsible,
      batchId,
      itemId: itemIds[0] as string,
      classification: "total",
      reason: "ok",
    });

    await expect(
      service.submit({ ...responsible, batchId, reviewer_id: reviewerId }),
    ).rejects.toEqual(
      new ServiceError(
        400,
        "Classifique todos os itens antes de enviar à conferência (1 pendente).",
      ),
    );
    expect(batch.status).toBe("pending_review");
  });

  it("envia, devolve com motivo, reenvia e o conferente aprova, com histórico de cada estado", async () => {
    const { service, batch, history } = fakeDatabase();
    await classifyAll(service);
    history.length = 0;

    const submitted = await service.submit({ ...responsible, batchId, reviewer_id: reviewerId });
    expect(submitted).toMatchObject({ status: "awaiting_check", reviewer_id: reviewerId });

    await expect(
      service.updateItem({
        ...responsible,
        batchId,
        itemId: itemIds[0] as string,
        classification: "freight",
        reason: "x",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.check({ ...responsible, batchId, decision: "approve" })).rejects.toEqual(
      new ServiceError(403, "Só o conferente designado ou Fiscal nível 3 conclui a conferência."),
    );

    await service.check({ ...reviewer, batchId, decision: "return", reason: "Item 2 é frete" });
    expect(batch.status).toBe("pending_review");
    await service.submit({ ...responsible, batchId, reviewer_id: reviewerId });
    const checked = await service.check({ ...reviewer, batchId, decision: "approve" });

    expect(checked.status).toBe("checked");
    expect(
      history.map((row) => [row.field, row.previous_value, row.new_value, row.actor_user_id]),
    ).toEqual([
      ["status", "pending_review", "awaiting_check", responsibleId],
      ["reviewer_id", null, reviewerId, responsibleId],
      ["status", "awaiting_check", "pending_review", reviewerId],
      ["status", "pending_review", "awaiting_check", responsibleId],
      ["status", "awaiting_check", "checked", reviewerId],
    ]);
    expect(history[2]).toMatchObject({ reason: "Item 2 é frete", item_id: null });
    await expect(service.check({ ...reviewer, batchId, decision: "approve" })).rejects.toEqual(
      new ServiceError(409, "O lote não está aguardando conferência."),
    );
  });

  it("recusa conferente sem acesso ao Fiscal na organização", async () => {
    const { service, prisma } = fakeDatabase();
    await classifyAll(service);
    prisma.permission.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.submit({ ...responsible, batchId, reviewer_id: reviewerId }),
    ).rejects.toEqual(
      new ServiceError(404, "Conferente não encontrado ou sem Fiscal nível 2 ou superior."),
    );
  });

  it("detalhe traz itens e histórico do lote", async () => {
    const { service } = fakeDatabase();
    await classifyAll(service);

    const detail = await service.detail(batchId, organizationId);

    expect(detail.items[0]).toMatchObject({
      classification: "total",
      manual_value: null,
      corrections: {},
    });
    expect(detail.history).toHaveLength(2);
    expect(detail.history[0]).toMatchObject({
      field: "classification",
      new_value: "total",
      reason: "ok",
    });
  });

  it("Fiscal nível 3 conclui no lugar do conferente e a decisão fica no nome dele", async () => {
    const { service, history } = fakeDatabase("awaiting_check");
    const supervisor = {
      organizationId,
      userId: "c0000000-0000-4000-8000-000000000003",
      permission: 3,
    };

    const returned = await service.check({
      ...supervisor,
      batchId,
      decision: "return",
      reason: "Conferente de férias; rever item 1",
    });

    expect(returned.status).toBe("pending_review");
    expect(history).toEqual([
      expect.objectContaining({
        field: "status",
        new_value: "pending_review",
        actor_user_id: supervisor.userId,
      }),
    ]);
  });
});
