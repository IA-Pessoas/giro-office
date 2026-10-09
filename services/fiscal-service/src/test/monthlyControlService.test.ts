import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { MonthlyControlService } from "../services/monthlyControlService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const userId = "c0000000-0000-4000-8000-000000000001";
const clientA = "d0000000-0000-4000-8000-000000000001";
const clientB = "d0000000-0000-4000-8000-000000000002";
const controlId = "f0000000-0000-4000-8000-000000000001";
const responsibleA = "e0000000-0000-4000-8000-00000000000a";
const responsibleB = "e0000000-0000-4000-8000-00000000000b";
const competence = new Date("2026-08-01T00:00:00.000Z");

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: controlId,
    organization_id: organizationId,
    client_id: clientA,
    competence,
    status: "PENDING",
    no_movement: false,
    regime: "Simples Nacional",
    opening_reason: null as string | null,
    responsible_id: null as string | null,
    created_by: userId,
    updated_by: userId,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    ...overrides,
  };
}

function dependencies() {
  const control = {
    findMany: vi.fn(async () => [] as ReturnType<typeof stored>[]),
    findFirst: vi.fn(async () => null as ReturnType<typeof stored> | null),
    createManyAndReturn: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) =>
      data.map((row, index) => ({
        id: `generated-${index}`,
        client_id: row.client_id,
        regime: row.regime,
      })),
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => stored(data)),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  const event = { createMany: vi.fn(async () => ({ count: 1 })) };
  const obligation = {
    createMany: vi.fn(async () => ({ count: 1 })),
    groupBy: vi.fn(async () => [] as Array<{ control_id: string; _count: { _all: number } }>),
  };
  const prisma = {
    client: {
      findMany: vi.fn(async () => [] as Array<Record<string, unknown>>),
      findFirst: vi.fn(async () => null as Record<string, unknown> | null),
      count: vi.fn(async () => 1),
    },
    fiscalMonthlyControl: control,
    triageResponsible: {
      findMany: vi.fn(async () => [] as Array<{ client_id: string; user_id: string }>),
    },
    user: {
      findMany: vi.fn(async () => [] as Array<{ id: string; name: string }>),
      findFirst: vi.fn(async () => ({ id: responsibleB }) as { id: string } | null),
    },
    triageMonthly: {
      findMany: vi.fn(async () => [] as Array<{ client_id: string; checklist: unknown }>),
    },
    triageCompetence: {
      findMany: vi.fn(
        async () => [] as Array<{ client_id: string; configuration_snapshot: unknown }>,
      ),
    },
    fiscalMonthlyControlEvent: event,
    fiscalMonthlyControlObligation: obligation,
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        fiscalMonthlyControl: control,
        fiscalMonthlyControlEvent: event,
        fiscalMonthlyControlObligation: obligation,
      }),
    ),
  };
  const audit = { createLog: vi.fn(async () => {}) };
  const now = () => new Date("2026-09-15T12:00:00.000Z");
  return { prisma, audit, service: new MonthlyControlService(prisma as never, audit, now) };
}

const actor = { organizationId, userId, permission: 2 };

describe("MonthlyControlService.list", () => {
  it("gera só os controles que faltam para os clientes Fiscal elegíveis e registra a criação", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findMany
      .mockResolvedValueOnce([
        { id: clientA, regime: "Simples Nacional" },
        { id: clientB, regime: null },
      ])
      .mockResolvedValueOnce([
        { id: clientA, name: "Beta", company_name: null },
        { id: clientB, name: "x", company_name: "Alfa Ltda" },
      ]);
    prisma.fiscalMonthlyControl.findMany
      .mockResolvedValueOnce([stored()])
      .mockResolvedValueOnce([stored(), stored({ id: "generated-0", client_id: clientB })]);

    const result = await service.list({ competence: "2026-08" }, actor);

    expect(prisma.client.findMany).toHaveBeenNthCalledWith(1, {
      select: { id: true, regime: true },
      where: {
        organization_id: organizationId,
        fiscal: true,
        AND: [
          {
            OR: [
              { competence_entry: null },
              { competence_entry: { lte: new Date("2026-08-31T23:59:59.999Z") } },
            ],
          },
          {
            OR: [{ competence_output: null }, { competence_output: { gte: competence } }],
          },
        ],
      },
    });
    expect(prisma.fiscalMonthlyControl.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        {
          organization_id: organizationId,
          client_id: clientB,
          competence,
          status: "PENDING",
          regime: null,
          responsible_id: null,
          created_by: userId,
          updated_by: userId,
        },
      ],
      skipDuplicates: true,
      select: { id: true, regime: true },
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          organization_id: organizationId,
          control_id: "generated-0",
          action: "CREATED",
          from_value: null,
          to_value: "PENDING",
          reason: null,
          actor_id: userId,
        },
      ],
    });
    expect(result.competence).toBe("2026-08");
    expect(result.items.map((item) => item.client_name)).toEqual(["Alfa Ltda", "Beta"]);
    expect(result.items[1]).toMatchObject({
      id: controlId,
      competence: "2026-08",
      status: "PENDING",
      no_movement: false,
      regime: "Simples Nacional",
    });
  });

  it("sugere as obrigações do regime registrado ao nascer, nunca a DIRBI, e conta pendências", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findMany.mockResolvedValueOnce([
      { id: clientA, regime: " simples NACIONAL " },
      { id: clientB, regime: "Lucro Presumido" },
    ]);
    prisma.fiscalMonthlyControl.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([stored()]);
    prisma.fiscalMonthlyControlObligation.groupBy.mockResolvedValueOnce([
      { control_id: controlId, _count: { _all: 2 } },
    ]);

    const result = await service.list({ competence: "2026-08" }, actor);

    expect(prisma.fiscalMonthlyControlObligation.createMany).toHaveBeenCalledWith({
      data: [
        {
          organization_id: organizationId,
          control_id: "generated-0",
          code: "PGDAS_D",
          origin: "SUGGESTED",
        },
        {
          organization_id: organizationId,
          control_id: "generated-1",
          code: "DCTFWEB",
          origin: "SUGGESTED",
        },
        {
          organization_id: organizationId,
          control_id: "generated-1",
          code: "EFD_CONTRIBUICOES",
          origin: "SUGGESTED",
        },
      ],
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          control_id: "generated-1",
          obligation_code: "EFD_CONTRIBUICOES",
          action: "OBLIGATION_SUGGESTED",
          actor_id: userId,
        }),
      ]),
    });
    expect(prisma.fiscalMonthlyControlObligation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ applicable: true, completed_on: null }),
      }),
    );
    expect(result.items[0].pending_obligations).toBe(2);
    // Sem registro na Triagem: null (nada confirma os documentos).
    expect(result.items[0].triage_pending).toBeNull();
    // Pendência não altera a situação do controle.
    expect(result.items[0].status).toBe("PENDING");
  });

  it("não escreve nada quando todos os elegíveis já têm controle", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findMany.mockResolvedValueOnce([{ id: clientA, regime: null }]);
    prisma.fiscalMonthlyControl.findMany.mockResolvedValue([stored()]);

    await service.list({ competence: "2026-08" }, actor);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.fiscalMonthlyControl.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("não gera controles além do mês seguinte ao corrente", async () => {
    const { prisma, service } = dependencies();

    await service.list({ competence: "2026-11" }, actor);
    await service.list({ competence: "2026-10" }, actor);

    expect(prisma.client.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, regime: true } }),
    );
  });

  it("sob concorrência registra criação só para as linhas que este processo inseriu", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findMany.mockResolvedValueOnce([{ id: clientA, regime: null }]);
    prisma.fiscalMonthlyControl.createManyAndReturn.mockResolvedValueOnce([]);

    await service.list({ competence: "2026-08" }, actor);

    expect(prisma.fiscalMonthlyControlEvent.createMany).not.toHaveBeenCalled();
  });
});

describe("MonthlyControlService responsáveis", () => {
  it("registra o responsável padrão ao nascer e mostra o da competência e o atual da carteira", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findMany
      .mockResolvedValueOnce([{ id: clientB, regime: null }])
      .mockResolvedValueOnce([
        { id: clientA, name: "Alfa", company_name: null },
        { id: clientB, name: "Beta", company_name: null },
      ]);
    // clientA nasceu com responsibleA; hoje a carteira dele é de responsibleB.
    prisma.fiscalMonthlyControl.findMany
      .mockResolvedValueOnce([stored({ responsible_id: responsibleA })])
      .mockResolvedValueOnce([
        stored({ responsible_id: responsibleA }),
        stored({ id: "generated-0", client_id: clientB, responsible_id: responsibleB }),
      ]);
    prisma.triageResponsible.findMany.mockResolvedValueOnce([
      { client_id: clientA, user_id: responsibleB },
      { client_id: clientB, user_id: responsibleB },
    ]);
    prisma.user.findMany.mockResolvedValueOnce([
      { id: responsibleA, name: "Ana" },
      { id: responsibleB, name: "Bruno" },
    ]);

    const result = await service.list({ competence: "2026-08" }, actor);

    expect(prisma.fiscalMonthlyControl.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ client_id: clientB, responsible_id: responsibleB })],
      }),
    );
    expect(prisma.triageResponsible.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        type: "FISCAL",
        client_id: { in: [clientB, clientA] },
      },
      select: { client_id: true, user_id: true },
    });
    expect(result.items[0]).toMatchObject({
      client_name: "Alfa",
      responsible_id: responsibleA,
      responsible_name: "Ana",
      default_responsible_id: responsibleB,
      default_responsible_name: "Bruno",
    });
  });

  it("nível 2 edita o controle mesmo sem ser o responsável", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst
      .mockResolvedValueOnce(stored({ responsible_id: responsibleA }))
      .mockResolvedValueOnce(stored({ responsible_id: responsibleA, status: "IN_PROGRESS" }));

    const result = await service.update({ ...actor, id: controlId, status: "IN_PROGRESS" });

    expect(result.status).toBe("IN_PROGRESS");
    expect(userId).not.toBe(responsibleA);
  });

  it("transferência exige nível 3 e destino com acesso ao Fiscal", async () => {
    const { prisma, service } = dependencies();
    const input = {
      ...actor,
      control_ids: [controlId],
      to_user_id: responsibleB,
      reason: "Férias da Ana",
    };
    await expect(service.transfer(input)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.responsibles(actor)).rejects.toMatchObject({ statusCode: 403 });

    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.transfer({ ...input, permission: 3 })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: responsibleB,
        status: "active",
        permissions: { some: { organization_id: organizationId, fiscal: { gt: 0 } } },
      },
      select: { id: true },
    });
  });

  it("transfere em lote só os abertos, com motivo e trilha; concluídos ficam de fora", async () => {
    const { prisma, audit, service } = dependencies();
    const open = "f0000000-0000-4000-8000-0000000000a1";
    const completed = "f0000000-0000-4000-8000-0000000000a2";
    const already = "f0000000-0000-4000-8000-0000000000a3";
    const missing = "f0000000-0000-4000-8000-0000000000a4";
    prisma.fiscalMonthlyControl.findMany.mockResolvedValueOnce([
      stored({ id: open, responsible_id: responsibleA, status: "IN_PROGRESS" }),
      stored({ id: completed, responsible_id: responsibleA, status: "COMPLETED" }),
      stored({ id: already, responsible_id: responsibleB }),
    ]);

    const result = await service.transfer({
      ...actor,
      permission: 3,
      control_ids: [open, completed, already, missing],
      to_user_id: responsibleB,
      reason: "Redistribuição da carteira",
    });

    expect(result).toEqual({
      transferred: [open],
      skipped: [
        { id: completed, reason: "Controle concluído." },
        { id: already, reason: "Já é o responsável." },
        { id: missing, reason: "Controle não encontrado." },
      ],
    });
    expect(prisma.fiscalMonthlyControl.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.fiscalMonthlyControl.updateMany).toHaveBeenCalledWith({
      where: {
        id: open,
        organization_id: organizationId,
        responsible_id: responsibleA,
        status: { not: "COMPLETED" },
      },
      data: { responsible_id: responsibleB, updated_by: userId },
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          control_id: open,
          action: "RESPONSIBLE_TRANSFERRED",
          from_value: responsibleA,
          to_value: responsibleB,
          reason: "Redistribuição da carteira",
          actor_id: userId,
        }),
      ],
    });
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Transferência de responsável" }),
    );
  });

  it("transferência individual de concluído é 409; conflito concorrente vira skipped", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findMany.mockResolvedValueOnce([
      stored({ status: "COMPLETED", responsible_id: responsibleA }),
    ]);
    await expect(
      service.transfer({
        ...actor,
        permission: 3,
        control_ids: [controlId],
        to_user_id: responsibleB,
        reason: "Férias",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    prisma.fiscalMonthlyControl.findMany.mockResolvedValueOnce([
      stored({ responsible_id: responsibleA }),
    ]);
    prisma.fiscalMonthlyControl.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await service.transfer({
      ...actor,
      permission: 3,
      control_ids: [controlId],
      to_user_id: responsibleB,
      reason: "Férias",
    });
    expect(result).toEqual({
      transferred: [],
      skipped: [{ id: controlId, reason: "Alterado por outra pessoa." }],
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).not.toHaveBeenCalled();
  });

  it("lista candidatos com acesso ao Fiscal para o nível 3", async () => {
    const { prisma, service } = dependencies();
    prisma.user.findMany.mockResolvedValueOnce([{ id: responsibleB, name: "Bruno" }]);

    const result = await service.responsibles({ ...actor, permission: 3 });

    expect(result).toEqual([{ id: responsibleB, name: "Bruno" }]);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        status: "active",
        permissions: { some: { organization_id: organizationId, fiscal: { gt: 0 } } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });
});

describe("MonthlyControlService.open", () => {
  it("abre fora da elegibilidade só com motivo e guarda o motivo no controle e na trilha", async () => {
    const { prisma, audit, service } = dependencies();
    prisma.client.findFirst.mockResolvedValue({
      id: clientA,
      regime: "Lucro Presumido",
    });
    prisma.client.count.mockResolvedValue(0);

    await expect(
      service.open({ ...actor, client_id: clientA, competence: "2026-08" }),
    ).rejects.toMatchObject({ statusCode: 400 });

    const result = await service.open({
      ...actor,
      client_id: clientA,
      competence: "2026-08",
      reason: "Cliente pediu apuração avulsa",
    });

    expect(result.created).toBe(true);
    expect(prisma.fiscalMonthlyControl.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        client_id: clientA,
        competence,
        status: "PENDING",
        regime: "Lucro Presumido",
        responsible_id: null,
        opening_reason: "Cliente pediu apuração avulsa",
        created_by: userId,
        updated_by: userId,
      },
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          control_id: controlId,
          action: "EXCEPTIONAL_OPENING",
          to_value: "PENDING",
          reason: "Cliente pediu apuração avulsa",
          actor_id: userId,
        }),
      ],
    });
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ referring: "fiscal.monthly_controls", referringId: controlId }),
    );
  });

  it("cliente sem Fiscal ativo na competência (consulta com a mesma regra da geração) exige motivo", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findFirst.mockResolvedValue({
      id: clientA,
      regime: null,
    });
    prisma.client.count.mockResolvedValue(0);

    await expect(
      service.open({ ...actor, client_id: clientA, competence: "2026-08" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("devolve o controle existente sem duplicar", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findFirst.mockResolvedValue({
      id: clientA,
      regime: null,
      fiscal: true,
      competence_entry: null,
      competence_output: null,
    });
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValue(stored());

    const result = await service.open({ ...actor, client_id: clientA, competence: "2026-08" });

    expect(result.created).toBe(false);
    expect(prisma.fiscalMonthlyControl.create).not.toHaveBeenCalled();
  });

  it("corrida na criação devolve o controle que venceu", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findFirst.mockResolvedValue({
      id: clientA,
      regime: null,
      fiscal: true,
      competence_entry: null,
      competence_output: null,
    });
    prisma.fiscalMonthlyControl.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(stored());
    prisma.fiscalMonthlyControl.create.mockRejectedValueOnce({ code: "P2002" });

    const result = await service.open({ ...actor, client_id: clientA, competence: "2026-08" });

    expect(result).toMatchObject({ created: false, control: { id: controlId } });
  });

  it("cliente de outra organização é 404", async () => {
    const { service } = dependencies();
    await expect(
      service.open({ ...actor, client_id: clientA, competence: "2026-08", reason: "teste" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("MonthlyControlService.update", () => {
  it("muda situação e movimento com trilha de cada campo e checagem otimista", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst
      .mockResolvedValueOnce(stored())
      .mockResolvedValueOnce(stored({ status: "IN_PROGRESS", no_movement: true }));

    const result = await service.update({
      ...actor,
      id: controlId,
      status: "IN_PROGRESS",
      no_movement: true,
    });

    expect(prisma.fiscalMonthlyControl.updateMany).toHaveBeenCalledWith({
      where: {
        id: controlId,
        organization_id: organizationId,
        status: "PENDING",
        no_movement: false,
      },
      data: { status: "IN_PROGRESS", no_movement: true, updated_by: userId },
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "STATUS",
          from_value: "PENDING",
          to_value: "IN_PROGRESS",
        }),
        expect.objectContaining({ action: "NO_MOVEMENT", from_value: "false", to_value: "true" }),
      ],
    });
    expect(result).toMatchObject({ status: "IN_PROGRESS", no_movement: true });
  });

  it("alteração concorrente vira 409 em vez de sobrescrever", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValueOnce(stored());
    prisma.triageMonthly.findMany.mockResolvedValueOnce([
      { client_id: clientA, checklist: { inbound_report: "COMPLETED" } },
    ]);
    prisma.fiscalMonthlyControl.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.update({ ...actor, id: controlId, status: "COMPLETED" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.fiscalMonthlyControlEvent.createMany).not.toHaveBeenCalled();
  });

  it("reabrir controle concluído exige Fiscal nível 3 e motivo", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValue(stored({ status: "COMPLETED" }));

    await expect(
      service.update({ ...actor, id: controlId, status: "IN_PROGRESS", reason: "Erro" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.update({ ...actor, permission: 3, id: controlId, status: "IN_PROGRESS" }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await service.update({
      ...actor,
      permission: 3,
      id: controlId,
      status: "IN_PROGRESS",
      reason: "Retificação da DCTFWeb",
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "REOPENED",
          from_value: "COMPLETED",
          to_value: "IN_PROGRESS",
          reason: "Retificação da DCTFWeb",
        }),
      ],
    });
  });

  it("controle concluído não muda o movimento sem reabrir", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValue(stored({ status: "COMPLETED" }));

    await expect(
      service.update({ ...actor, permission: 3, id: controlId, no_movement: true }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.fiscalMonthlyControl.updateMany).not.toHaveBeenCalled();
  });

  it("nível 2 conclui sem pendência documental na Triagem, que fica intacta", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst
      .mockResolvedValueOnce(stored({ status: "IN_PROGRESS" }))
      .mockResolvedValueOnce(stored({ status: "COMPLETED" }));
    prisma.triageMonthly.findMany.mockResolvedValueOnce([
      {
        client_id: clientA,
        checklist: { inbound_report: "COMPLETED", sped_fiscal: "NOT_PRESENT" },
      },
    ]);

    await service.update({ ...actor, id: controlId, status: "COMPLETED" });

    expect(prisma.triageMonthly.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        competence: "2026-08",
        archived_at: null,
        client_id: { in: [clientA] },
        type: "FISCAL",
      },
      select: { client_id: true, checklist: true },
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ action: "STATUS", to_value: "COMPLETED" })],
    });
  });

  it("com pendência na Triagem, concluir exige nível 3 e justificativa e vira conclusão excepcional", async () => {
    const { prisma, audit, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValue(stored({ status: "IN_PROGRESS" }));
    prisma.triageMonthly.findMany.mockResolvedValue([
      { client_id: clientA, checklist: { inbound_report: "PENDING" } },
    ]);

    await expect(
      service.update({ ...actor, id: controlId, status: "COMPLETED", reason: "Urgente" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.update({ ...actor, permission: 3, id: controlId, status: "COMPLETED" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.fiscalMonthlyControl.updateMany).not.toHaveBeenCalled();

    await service.update({
      ...actor,
      permission: 3,
      id: controlId,
      status: "COMPLETED",
      reason: "Cliente enviou o relatório por e-mail; Triagem atualiza amanhã",
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "EXCEPTIONAL_COMPLETION",
          from_value: "IN_PROGRESS",
          to_value: "COMPLETED",
          reason: "Cliente enviou o relatório por e-mail; Triagem atualiza amanhã",
        }),
      ],
    });
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Conclusão excepcional",
        changes: expect.objectContaining({ triage: { source: "MONTHLY", pending: 1 } }),
      }),
    );
  });

  it("sem registro na Triagem, concluir também é excepcional", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValue(stored({ status: "IN_PROGRESS" }));
    await expect(
      service.update({ ...actor, id: controlId, status: "COMPLETED" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("consulta os documentos da Triagem do controle sem gravar", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValueOnce(stored());
    prisma.triageCompetence.findMany.mockResolvedValueOnce([
      {
        client_id: clientA,
        configuration_snapshot: { configs: [{ type: "FISCAL", active_items: ["sped_fiscal"] }] },
      },
    ]);

    const result = await service.triage(controlId, { ...actor, permission: 1 });

    expect(result).toEqual({
      control_id: controlId,
      competence: "2026-08",
      source: "PLANNED",
      pending: 1,
      items: [{ field: "sped_fiscal", status: "PENDING" }],
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("controle de outra organização é 404", async () => {
    const { service } = dependencies();
    await expect(
      service.update({ ...actor, id: controlId, status: "IN_PROGRESS" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("MonthlyControlService.responsibleReport", () => {
  it("por competência usa o responsável gravado no controle, sem gerar controles", async () => {
    const { prisma, service } = dependencies();
    // clientA nasceu com responsibleA e a carteira passou para responsibleB depois.
    prisma.fiscalMonthlyControl.findMany.mockResolvedValueOnce([
      stored({ responsible_id: responsibleA }),
      stored({ id: "c2", client_id: clientB, responsible_id: null }),
    ]);
    prisma.triageResponsible.findMany.mockResolvedValue([
      { client_id: clientA, user_id: responsibleB },
    ]);
    prisma.client.findMany.mockResolvedValueOnce([
      { id: clientA, name: "Alfa", company_name: null },
      { id: clientB, name: "beta", company_name: "Beta Ltda" },
    ]);
    prisma.user.findMany.mockResolvedValueOnce([{ id: responsibleA, name: "Ana" }]);

    const report = await service.responsibleReport(
      { basis: "competence", competence: "2026-08" },
      actor,
    );

    expect(prisma.fiscalMonthlyControl.findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId, competence },
      select: { client_id: true, responsible_id: true },
    });
    expect(prisma.triageResponsible.findMany).not.toHaveBeenCalled();
    expect(prisma.fiscalMonthlyControl.createManyAndReturn).not.toHaveBeenCalled();
    expect(report.items).toEqual([
      {
        client_id: clientA,
        client_name: "Alfa",
        responsible_id: responsibleA,
        responsible_name: "Ana",
      },
      {
        client_id: clientB,
        client_name: "Beta Ltda",
        responsible_id: null,
        responsible_name: null,
      },
    ]);
    expect(report.csv).toBe("﻿Responsável;Empresa\r\nAna;Alfa\r\nSem responsável;Beta Ltda\r\n");
    expect(report.file_name).toBe("responsaveis-empresas-2026-08.csv");
  });

  it("atual usa a carteira vigente dos clientes Fiscal e filtra tela e CSV juntos", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findMany
      .mockResolvedValueOnce([{ id: clientA }, { id: clientB }])
      .mockResolvedValueOnce([{ id: clientB, name: "Beta", company_name: null }]);
    prisma.triageResponsible.findMany.mockResolvedValueOnce([
      { client_id: clientA, user_id: responsibleA },
      { client_id: clientB, user_id: responsibleB },
    ]);
    prisma.user.findMany.mockResolvedValueOnce([]);

    const report = await service.responsibleReport(
      { basis: "current", responsible_id: responsibleB },
      actor,
    );

    expect(prisma.client.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: organizationId, fiscal: true }),
        select: { id: true },
      }),
    );
    expect(prisma.fiscalMonthlyControl.findMany).not.toHaveBeenCalled();
    // Responsável sem acesso atual continua aparecendo, com rótulo próprio.
    expect(report.items).toEqual([
      {
        client_id: clientB,
        client_name: "Beta",
        responsible_id: responsibleB,
        responsible_name: null,
      },
    ]);
    expect(report.csv).toBe("﻿Responsável;Empresa\r\nUsuário sem acesso atual;Beta\r\n");
    expect(report.file_name).toBe("responsaveis-empresas-atual.csv");
  });

  it("filtro 'none' devolve só clientes sem responsável", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findMany.mockResolvedValueOnce([
      stored({ responsible_id: responsibleA }),
      stored({ id: "c2", client_id: clientB, responsible_id: null }),
    ]);
    prisma.client.findMany.mockResolvedValueOnce([
      { id: clientB, name: "Beta", company_name: null },
    ]);

    const report = await service.responsibleReport(
      { basis: "competence", competence: "2026-08", responsible_id: "none" },
      actor,
    );

    expect(report.items.map((item) => item.client_id)).toEqual([clientB]);
  });
});
