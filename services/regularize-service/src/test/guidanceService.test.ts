import { randomUUID } from "node:crypto";
import { REGULARIZE_GUIDANCE_CHECKLIST_ITEMS } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import type { CreateGuidanceBody } from "../schemas/guidance.schemas.js";
import { GuidanceService } from "../services/guidanceService.js";

// biome-ignore lint/suspicious/noExplicitAny: fake restrito à borda Prisma, com argumentos de nested writes e registros heterogêneos.
type Row = Record<string, any>;
type State = { guidances: Row[]; logs: Row[] };
const organizationId = "org-a";
const userId = "user-a";
const checklist = (): CreateGuidanceBody["checklist"] =>
  REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.map(({ code }) => ({ code, status: "Pendente" }));
const body = (overrides: Partial<CreateGuidanceBody> = {}): CreateGuidanceBody => ({
  target_type: "PF",
  client_pf_id: "pf-a",
  status: "Em andamento",
  checklist: checklist(),
  ...overrides,
});

// Apenas a borda Prisma é substituída. As regras e o serviço de log são reais.
function setup() {
  let state: State = { guidances: [], logs: [] };
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => value === undefined || row[key] === value);
  const fixtures = {
    client: [{ id: "pj-a", organization_id: organizationId, name: "Empresa", cpf_cnpj: "123" }],
    clientPF: [{ id: "pf-a", organization_id: organizationId, name: "Pessoa", cpf: "456" }],
    process: [
      { id: "process-a", organization_id: organizationId },
      { id: "process-b", organization_id: organizationId },
    ],
  };
  let failLog = false;
  let writeError: unknown;
  function client(getState: () => State) {
    const expand = (row: Row | undefined, include?: Row) => {
      if (!row) return null;
      const result = structuredClone(row);
      if (!include?.checklist_items) delete result.checklist_items;
      return result;
    };
    function save(data: Row, previous?: Row) {
      if (writeError) throw writeError;
      const { checklist_items: nested, ...fields } = data;
      const row = previous ?? {
        id: randomUUID(),
        process_id: null,
        branch_data: null,
        economic_activities: [],
        partners: [],
        checklist_items: [],
      };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) row[key] = value === Prisma.DbNull ? null : value;
      }
      for (const item of nested?.create ?? []) {
        row.checklist_items.push({ id: randomUUID(), guidance_id: row.id, ...item });
      }
      for (const item of nested?.upsert ?? []) {
        const existing = row.checklist_items.find(
          (child: Row) => child.code === item.where.guidance_id_code.code,
        );
        if (existing) Object.assign(existing, item.update);
        else row.checklist_items.push({ id: randomUUID(), guidance_id: row.id, ...item.create });
      }
      return row;
    }
    return {
      client: {
        findFirst: vi.fn(
          async ({ where }: Row) => fixtures.client.find((r) => matches(r, where)) ?? null,
        ),
      },
      clientPF: {
        findFirst: vi.fn(
          async ({ where }: Row) => fixtures.clientPF.find((r) => matches(r, where)) ?? null,
        ),
      },
      process: {
        findFirst: vi.fn(
          async ({ where }: Row) => fixtures.process.find((r) => matches(r, where)) ?? null,
        ),
      },
      proceduralGuidance: {
        findFirst: vi.fn(async ({ where, include }: Row) =>
          expand(
            getState().guidances.find((r) => matches(r, where)),
            include,
          ),
        ),
        findMany: vi.fn(async ({ where, include }: Row) =>
          getState()
            .guidances.filter((r) => matches(r, where))
            .map((r) => expand(r, include)),
        ),
        create: vi.fn(async ({ data, include }: Row) => {
          const row = save(data);
          getState().guidances.push(row);
          return expand(row, include);
        }),
        update: vi.fn(async ({ where, data, include }: Row) => {
          const row = getState().guidances.find((r) => matches(r, where));
          if (!row) throw new Error("Registro ausente");
          return expand(save(data, row), include);
        }),
      },
      logs: {
        create: vi.fn(async ({ data }: Row) => {
          if (failLog) throw new Error("Falha no log");
          getState().logs.push(structuredClone(data));
          return data;
        }),
      },
    };
  }
  const root = client(() => state);
  let lastTransactionClient: ReturnType<typeof client> | undefined;
  const prisma = {
    ...root,
    $transaction: vi.fn(async (callback: (tx: ReturnType<typeof client>) => Promise<unknown>) => {
      const draft = structuredClone(state);
      lastTransactionClient = client(() => draft);
      const result = await callback(lastTransactionClient);
      state = draft;
      return result;
    }),
  };
  const service = new GuidanceService(prisma as unknown as PrismaClient);
  return {
    service,
    prisma,
    fixtures,
    get lastTransactionClient() {
      return lastTransactionClient;
    },
    get state() {
      return state;
    },
    set failLog(value: boolean) {
      failLog = value;
    },
    set writeError(value: unknown) {
      writeError = value;
    },
    create: (overrides: Partial<CreateGuidanceBody> = {}) =>
      service.create({ organizationId, userId, body: body(overrides) }),
  };
}

describe("GuidanceService", () => {
  it("preserva snapshot, filial, checklist e ids legados quando omitidos", async () => {
    const f = setup();
    const branch = { name: "Filial", address: "Rua A", city: "Salvador", state: "BA" };
    const created = await f.create({
      checklist: checklist().map((item) =>
        item.code === "branch" ? { ...item, status: "Concluído" } : item,
      ),
      branch_data: branch,
      economic_activities: [
        { id: "activity-original", code: "123", description: "Serviço", type: "Principal" },
      ],
      partners: [{ id: "partner-original", name: "Sócio", cpf: "456" }],
    });
    f.fixtures.clientPF[0].name = "Nome cadastral alterado";
    const updated = await f.service.update({
      organizationId,
      userId,
      body: { id: created.id as string, request: "Novo pedido" },
    });
    expect(updated).toEqual({ ...created, request: "Novo pedido" });
    expect(f.state.logs.at(-1)?.changes).toEqual({
      request: { from: undefined, to: "Novo pedido" },
    });
    const logs = f.state.logs.length;
    await f.service.update({
      organizationId,
      userId,
      body: { id: created.id as string, request: "Novo pedido" },
    });
    expect(f.state.logs).toHaveLength(logs);
  });

  it("rejeita checklist ou filial inválidos em update sem alterar orientação", async () => {
    const f = setup();
    const created = await f.create();
    for (const fields of [
      { checklist: checklist().slice(1) },
      {
        checklist: checklist().map((item) =>
          item.code === "branch" ? { ...item, status: "Concluído" as const } : item,
        ),
      },
      { branch_data: { name: "Filial", address: "Rua A", city: "Salvador", state: "BA" } },
    ]) {
      await expect(
        f.service.update({ organizationId, userId, body: { id: created.id as string, ...fields } }),
      ).rejects.toMatchObject({ statusCode: 422 });
      expect(await f.service.detail(organizationId, created.id as string)).toEqual(created);
    }
  });

  it.each([
    "PJ",
    "PF",
  ] as const)("rejeita troca para cadastro %s de outro tenant", async (target_type) => {
    const f = setup();
    const created = await f.create();
    f.fixtures.client[0].organization_id = "org-b";
    f.fixtures.clientPF[0].organization_id = "org-b";
    await expect(
      f.service.update({
        organizationId,
        userId,
        body: {
          id: created.id as string,
          target_type,
          ...(target_type === "PJ" ? { client_pj_id: "pj-a" } : { client_pf_id: "pf-a" }),
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404, message: "Cadastro não encontrado." });
    expect(await f.service.detail(organizationId, created.id as string)).toEqual(created);
  });

  it("faz rollback e retorna 409 ao conflitar em vínculo posterior", async () => {
    const f = setup();
    const created = await f.create();
    f.writeError = new Prisma.PrismaClientKnownRequestError("segredo do banco", {
      code: "P2002",
      clientVersion: "7.9.1",
    });
    await expect(
      f.service.update({
        organizationId,
        userId,
        body: { id: created.id as string, process_id: "process-a" },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Já existe orientação em andamento para este processo.",
    });
    expect(await f.service.detail(organizationId, created.id as string)).toEqual(created);
    expect(f.state.logs).toHaveLength(1);
  });

  it("reverte também a filial quando a auditoria falha", async () => {
    const f = setup();
    const created = await f.create();
    f.failLog = true;
    await expect(
      f.service.update({
        organizationId,
        userId,
        body: {
          id: created.id as string,
          checklist: checklist().map((item) =>
            item.code === "branch" ? { ...item, status: "Concluído" } : item,
          ),
          branch_data: { name: "Filial", address: "Rua A", city: "Salvador", state: "BA" },
        },
      }),
    ).rejects.toThrow("Falha no log");
    expect(await f.service.detail(organizationId, created.id as string)).toEqual(created);
  });

  it("cria PF sem processo com snapshot, 17 filhos ordenados e log no mesmo tx", async () => {
    const f = setup();
    const result = await f.create({ checklist: checklist().reverse() });
    expect(result).toMatchObject({
      process_id: null,
      target_type: "PF",
      client_pf_id: "pf-a",
      client_pj_id: null,
      target_snapshot: { version: 1, source: "client_pf", name: "Pessoa", document: "456" },
    });
    expect(result.checklist_items).toHaveLength(17);
    expect((result.checklist_items as Row[]).map(({ code, label }) => ({ code, label }))).toEqual(
      REGULARIZE_GUIDANCE_CHECKLIST_ITEMS,
    );
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(f.lastTransactionClient?.clientPF.findFirst).toHaveBeenCalledWith({
      where: { id: "pf-a", organization_id: organizationId },
    });
    expect(f.lastTransactionClient?.logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "Cadastro", referring_id: result.id }),
    });
    expect(f.prisma.logs.create).not.toHaveBeenCalled();
    expect(f.prisma.proceduralGuidance.create).not.toHaveBeenCalled();
  });

  it("cria PJ com processo da organização", async () => {
    const f = setup();
    expect(
      await f.create({
        target_type: "PJ",
        client_pf_id: null,
        client_pj_id: "pj-a",
        process_id: "process-a",
      }),
    ).toMatchObject({
      process_id: "process-a",
      target_snapshot: { source: "client_pj", name: "Empresa" },
    });
    expect(f.lastTransactionClient?.client.findFirst).toHaveBeenCalledWith({
      where: { id: "pj-a", organization_id: organizationId },
    });
    expect(f.lastTransactionClient?.process.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "process-a", organization_id: organizationId } }),
    );
  });

  it("cria não cliente com snapshot manual e processo nulo", async () => {
    const f = setup();
    const snapshot = { version: 1 as const, source: "manual" as const, name: "Interessado" };
    expect(
      await f.create({
        target_type: "SEM_CLIENTE",
        client_pf_id: null,
        target_snapshot: snapshot,
        process_id: null,
      }),
    ).toMatchObject({
      target_snapshot: snapshot,
      client_pf_id: null,
      client_pj_id: null,
      process_id: null,
    });
  });

  it.each(["PF", "PJ", "process"])("rejeita %s de outro tenant com 404 genérico", async (kind) => {
    const f = setup();
    if (kind === "PF") f.fixtures.clientPF[0].organization_id = "org-b";
    if (kind === "PJ") f.fixtures.client[0].organization_id = "org-b";
    if (kind === "process") f.fixtures.process[0].organization_id = "org-b";
    await expect(
      f.create(
        kind === "PJ"
          ? { target_type: "PJ", client_pf_id: null, client_pj_id: "pj-a" }
          : { process_id: "process-a" },
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: kind === "process" ? "Processo não encontrado." : "Cadastro não encontrado.",
    });
    expect(f.state.guidances).toHaveLength(0);
  });

  it("converte P2002 em 409 sem detalhes do banco", async () => {
    const f = setup();
    f.writeError = new Prisma.PrismaClientKnownRequestError("segredo do banco", {
      code: "P2002",
      clientVersion: "7.9.1",
    });
    await expect(f.create()).rejects.toMatchObject({
      statusCode: 409,
      message: "Já existe orientação em andamento para este processo.",
    });
    expect(f.state.logs).toHaveLength(0);
  });

  it("preserva histórico finalizado ao criar outra orientação", async () => {
    const f = setup();
    const old = await f.create({ status: "Finalizado", process_id: "process-a" });
    await f.create({ process_id: "process-a" });
    expect(await f.service.detail(organizationId, old.id as string)).toMatchObject({
      status: "Finalizado",
    });
    expect(await f.service.listByProcess(organizationId, "process-a")).toHaveLength(2);
  });

  it("vincula depois, preserva em update legado, troca e remove processo", async () => {
    const f = setup();
    const { id } = await f.create();
    const update = (fields: Row) =>
      f.service.update({ organizationId, userId, body: { id: id as string, ...fields } });
    const linked = await update({ process_id: "process-a" });
    expect(linked.process_id).toBe("process-a");
    const legacy = await update({ request: "Ajuste" });
    expect(legacy).toMatchObject({
      process_id: "process-a",
      request: "Ajuste",
      checklist_items: linked.checklist_items,
    });
    expect((await update({ process_id: "process-b" })).process_id).toBe("process-b");
    expect((await update({ process_id: null })).process_id).toBeNull();
    expect(f.lastTransactionClient?.logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "Atualizacao",
        changes: expect.objectContaining({ process_id: { from: "process-b", to: null } }),
      }),
    });
    expect(f.prisma.logs.create).not.toHaveBeenCalled();
  });

  it("rejeita processo de outro tenant em update e mantém vínculo", async () => {
    const f = setup();
    const { id } = await f.create({ process_id: "process-a" });
    f.fixtures.process[1].organization_id = "org-b";
    await expect(
      f.service.update({
        organizationId,
        userId,
        body: { id: id as string, process_id: "process-b" },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect((await f.service.detail(organizationId, id as string)).process_id).toBe("process-a");
  });

  it("troca PF por PJ e por não cliente com referências coerentes", async () => {
    const f = setup();
    const { id } = await f.create();
    expect(
      await f.service.update({
        organizationId,
        userId,
        body: { id: id as string, target_type: "PJ", client_pj_id: "pj-a" },
      }),
    ).toMatchObject({
      target_type: "PJ",
      client_pf_id: null,
      client_pj_id: "pj-a",
      target_snapshot: { source: "client_pj" },
    });
    expect(
      await f.service.update({
        organizationId,
        userId,
        body: {
          id: id as string,
          target_type: "SEM_CLIENTE",
          target_snapshot: { version: 1, source: "manual", name: "Manual" },
        },
      }),
    ).toMatchObject({
      client_pj_id: null,
      client_pf_id: null,
      target_snapshot: { source: "manual", name: "Manual" },
    });
  });

  it("rejeita referência incoerente e snapshot manual inválido", async () => {
    const f = setup();
    const { id } = await f.create();
    await expect(
      f.service.update({
        organizationId,
        userId,
        body: { id: id as string, client_pj_id: "pj-a" },
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      f.service.update({
        organizationId,
        userId,
        body: { id: id as string, target_type: "SEM_CLIENTE" },
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("atualiza checklist e filial atomicamente, limpa filial ao reabrir", async () => {
    const f = setup();
    const created = await f.create();
    const completed = checklist().map((item) =>
      item.code === "branch" ? { ...item, status: "Concluído" as const } : item,
    );
    const branch = { name: "Filial", address: "Rua A", city: "Salvador", state: "BA" };
    const updated = await f.service.update({
      organizationId,
      userId,
      body: { id: created.id as string, checklist: completed, branch_data: branch },
    });
    expect(updated.branch_data).toEqual(branch);
    expect((updated.checklist_items as Row[]).map((item) => item.id)).toEqual(
      (created.checklist_items as Row[]).map((item) => item.id),
    );
    const cleared = await f.service.update({
      organizationId,
      userId,
      body: { id: created.id as string, checklist: checklist() },
    });
    expect(cleared.branch_data).toBeNull();
    expect(cleared.checklist_items).toHaveLength(17);
  });

  it("não grava nem audita quando o checklist reenviado é funcionalmente idêntico", async () => {
    const f = setup();
    const created = await f.create();
    const logCount = f.state.logs.length;

    const result = await f.service.update({
      organizationId,
      userId,
      body: { id: created.id as string, checklist: checklist() },
    });

    expect(result).toEqual(created);
    expect(f.lastTransactionClient?.proceduralGuidance.update).not.toHaveBeenCalled();
    expect(f.lastTransactionClient?.logs.create).not.toHaveBeenCalled();
    expect(f.state.logs).toHaveLength(logCount);
  });

  it("rejeita filial concluída sem dados e checklist incompleto sem persistir", async () => {
    const f = setup();
    await expect(
      f.create({
        checklist: checklist().map((item) =>
          item.code === "branch" ? { ...item, status: "Concluído" } : item,
        ),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(f.create({ checklist: checklist().slice(1) })).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(f.state.guidances).toHaveLength(0);
  });

  it("faz rollback de pai e filhos quando o log de cadastro falha", async () => {
    const f = setup();
    f.failLog = true;
    await expect(f.create()).rejects.toThrow("Falha no log");
    expect(f.state).toEqual({ guidances: [], logs: [] });
  });

  it("faz rollback de update, filhos e filial quando o log falha", async () => {
    const f = setup();
    const created = await f.create();
    f.failLog = true;
    await expect(
      f.service.update({
        organizationId,
        userId,
        body: {
          id: created.id as string,
          process_id: "process-a",
          checklist: checklist().map((item) => ({ ...item, status: "Não se aplica" })),
        },
      }),
    ).rejects.toThrow("Falha no log");
    expect(await f.service.detail(organizationId, created.id as string)).toEqual(created);
    expect(f.state.logs).toHaveLength(1);
  });

  it("isola detail/list/update por organização e lista sem processo opcional", async () => {
    const f = setup();
    const created = await f.create();
    await f.create({ process_id: "process-a" });
    await f.create({
      target_type: "SEM_CLIENTE",
      client_pf_id: null,
      target_snapshot: { version: 1, source: "manual", name: "Interessado" },
    });
    expect(await f.service.listByProcess(organizationId)).toHaveLength(3);
    expect(await f.service.listByProcess(organizationId, "process-a")).toHaveLength(1);
    expect(await f.service.listByProcess(organizationId, undefined, "SEM_CLIENTE")).toHaveLength(1);
    expect(await f.service.listByProcess("org-b")).toEqual([]);
    await expect(f.service.detail("org-b", created.id as string)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      f.service.update({
        organizationId: "org-b",
        userId,
        body: { id: created.id as string, request: "Não" },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    const [listed] = await f.service.listByProcess(organizationId);
    expect(listed.checklist_items).toHaveLength(17);
  });

  it.each([
    "activity",
    "partner",
  ])("mantém ids e arrays e sincroniza projeção de %s em transação", async (kind) => {
    const f = setup();
    const { id } = await f.create();
    const input = { organizationId, userId, guidanceId: id as string };
    let sequence = 0;
    const add = () => {
      const current = sequence++;
      return kind === "activity"
        ? f.service.addEconomicActivity({
            ...input,
            activity: {
              code: `123-${current}`,
              description: `Serviço ${current}`,
              type: "Principal",
            },
          })
        : f.service.addPartner({
            ...input,
            partner: { name: `Sócio ${current}`, cpf: `456${current}` },
          });
    };
    const remove = (itemId: string) =>
      kind === "activity"
        ? f.service.removeEconomicActivity({ ...input, itemId })
        : f.service.removePartner({ ...input, itemId });
    const field = kind === "activity" ? "economic_activities" : "partners";
    const first = await add();
    expect(f.lastTransactionClient?.proceduralGuidance.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, organization_id: organizationId } }),
    );
    const firstId = (first[field] as Row[])[0].id;
    expect(firstId).toEqual(expect.any(String));
    expect(first.checklist_items).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: field, status: "Concluído" })]),
    );
    const second = await add();
    expect(f.lastTransactionClient?.proceduralGuidance.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, organization_id: organizationId } }),
    );
    expect((second[field] as Row[])[0].id).toBe(firstId);
    const removed = await remove(firstId);
    expect(f.lastTransactionClient?.proceduralGuidance.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, organization_id: organizationId } }),
    );
    expect(removed[field]).toHaveLength(1);
    const emptied = await remove((removed[field] as Row[])[0].id);
    expect(f.lastTransactionClient?.proceduralGuidance.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, organization_id: organizationId } }),
    );
    expect(emptied.checklist_items).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: field, status: "Pendente" })]),
    );
    expect(f.lastTransactionClient?.logs.create).toHaveBeenCalledTimes(1);
    expect(f.prisma.logs.create).not.toHaveBeenCalled();
    f.failLog = true;
    await expect(add()).rejects.toThrow("Falha no log");
    expect((await f.service.detail(organizationId, id as string))[field]).toEqual([]);
  });

  it("normaliza atividades, garante uma principal e audita edição e remoção", async () => {
    const f = setup();
    const created = await f.create({
      economic_activities: [
        { code: " 4711 ", description: " Comércio  varejista ", type: "Secundaria" },
      ],
    });
    const activity = (created.economic_activities as Row[])[0];

    await expect(
      f.service.addEconomicActivity({
        organizationId,
        userId,
        guidanceId: created.id as string,
        activity: { code: "4711", description: "Outro", type: "Secundária" },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const firstPrincipal = await f.service.addEconomicActivity({
      organizationId,
      userId,
      guidanceId: created.id as string,
      activity: { code: "6201", description: "Desenvolvimento", type: "Principal" },
    });
    const firstPrincipalId = (firstPrincipal.economic_activities as Row[])[1].id;
    const secondPrincipal = await f.service.addEconomicActivity({
      organizationId,
      userId,
      guidanceId: created.id as string,
      activity: { code: "6202", description: "Consultoria", type: "Principal" },
    });
    expect(secondPrincipal.economic_activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstPrincipalId, type: "Secundária" }),
        expect.objectContaining({ code: "6202", type: "Principal" }),
      ]),
    );

    const edited = await f.service.updateEconomicActivity({
      organizationId,
      userId,
      guidanceId: created.id as string,
      activity: {
        id: activity.id,
        code: "4712",
        description: "Comercio atualizado",
        type: "Secundária",
      },
    });
    expect(edited.economic_activities).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: activity.id, code: "4712" })]),
    );
    expect(f.state.logs.at(-1)?.changes).toEqual(
      expect.objectContaining({ before: expect.any(Array), after: expect.any(Array) }),
    );

    await f.service.removeEconomicActivity({
      organizationId,
      userId,
      guidanceId: created.id as string,
      itemId: activity.id as string,
    });
    expect(f.state.logs.at(-1)?.changes).toEqual(
      expect.objectContaining({ before: expect.any(Array), after: expect.any(Array) }),
    );
  });

  it("preserva snapshot completo de socio, rejeita CPF duplicado e respeita organização", async () => {
    const f = setup();
    const created = await f.create({
      partners: [
        {
          name: "Sócio original",
          cpf: "123.456.789-01",
          percentage: 40,
          profession: "Administrador",
          marital_status: "Casado",
          rg: "12.345",
          cnh: "9988",
          address: "Rua A",
          role: "Administrador",
        },
      ],
    });
    const partner = (created.partners as Row[])[0];
    expect(partner).toMatchObject({
      cpf: "12345678901",
      percentage: 40,
      share: 40,
      profession: "Administrador",
      marital_status: "Casado",
      rg: "12.345",
      cnh: "9988",
      address: "Rua A",
      role: "Administrador",
    });

    await expect(
      f.service.addPartner({
        organizationId,
        userId,
        guidanceId: created.id as string,
        partner: { name: "Duplicado", cpf: "12345678901" },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const edited = await f.service.updatePartner({
      organizationId,
      userId,
      guidanceId: created.id as string,
      partner: {
        id: partner.id,
        name: "Sócio atualizado",
        cpf: "12345678901",
        percentage: 55,
        profession: "Diretor",
        marital_status: "Solteiro",
        rg: "99",
        cnh: "77",
        address: "Rua B",
        role: "Diretor",
      },
    });
    expect(edited.partners).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: partner.id, name: "Sócio atualizado", percentage: 55 }),
      ]),
    );

    await expect(
      f.service.removePartner({
        organizationId: "org-b",
        userId,
        guidanceId: created.id as string,
        itemId: partner.id as string,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await f.service.removePartner({
      organizationId,
      userId,
      guidanceId: created.id as string,
      itemId: partner.id as string,
    });
    expect(f.state.logs.at(-1)?.changes).toEqual(
      expect.objectContaining({ before: expect.any(Array), after: [] }),
    );
  });

  it("isola os quatro métodos legados por organização", async () => {
    const f = setup();
    const { id } = await f.create();
    const input = { organizationId: "org-b", userId, guidanceId: id as string, itemId: "missing" };
    for (const operation of [
      () =>
        f.service.addEconomicActivity({
          ...input,
          activity: { code: "123", description: "Serviço", type: "Principal" },
        }),
      () => f.service.removeEconomicActivity(input),
      () => f.service.addPartner({ ...input, partner: { name: "Sócio", cpf: "456" } }),
      () => f.service.removePartner(input),
    ])
      await expect(operation()).rejects.toMatchObject({ statusCode: 404 });
  });
});
