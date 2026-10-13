import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createTaskWorkerApp } from "./app.js";
import { recordingBinding, TOKENS, workerEnv } from "./test/env.js";

const ORG = "org-1";
const CONTABIL = "dep-contabil";
const INTEGRACAO = "dep-integracao";

function setup() {
  const prisma = {
    department: {
      findMany: vi.fn().mockResolvedValue([
        { id: CONTABIL, name: "Contábil" },
        { id: "dep-fiscal", name: "Fiscal" },
        { id: INTEGRACAO, name: "Integração" },
      ]),
    },
    agenda: {
      findMany: vi.fn().mockResolvedValue([{ id: "evt-1", agenda: "Fechamento" }]),
      findFirst: vi.fn().mockResolvedValue({ id: "evt-1", recurring_agenda_id: null }),
      create: vi.fn(async ({ data }) => ({ id: "evt-1", ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    client: { count: vi.fn().mockResolvedValue(1) },
    user: { count: vi.fn().mockResolvedValue(1) },
    recurringAgenda: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(async ({ data }) => ({
        occurrences: [{ id: "evt-1", ...data.occurrences.create }],
      })),
    },
  };
  const env = workerEnv({ AUDIT_SERVICE: recordingBinding() as never });
  const app = createTaskWorkerApp({ env, prisma });
  const send = (
    method: string,
    path: string,
    options: { body?: unknown; modules?: Record<string, number>; type?: string } = {},
  ) =>
    app.fetch(
      new Request(`https://task.test${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: TOKENS.internal,
          [FORWARDED_AUTH_USER_ID_HEADER]: "user-1",
          [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG,
          [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify(options.modules ?? { contabil: 2 }),
          ...(options.type ? { [FORWARDED_AUTH_TYPE_HEADER]: options.type } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      }),
      env,
    );
  return { prisma, send };
}

describe("agenda compartilhada por departamento (#1727)", () => {
  it("lista a agenda do módulo pedido, filtrada por organização e departamento", async () => {
    const { prisma, send } = setup();

    const response = await send("GET", "/task/agenda?module=contabil&month=2026-12");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [{ id: "evt-1" }] });
    expect(prisma.agenda.findMany.mock.calls[0][0].where).toMatchObject({
      organization_id: ORG,
      department_control_id: { in: [CONTABIL] },
    });
  });

  it("minha agenda filtra pelo usuário autenticado e pelos eventos sem responsável (#1773)", async () => {
    const { prisma, send } = setup();

    const response = await send("GET", "/task/agenda?module=contabil&month=2026-12&mine=true");

    expect(response.status).toBe(200);
    expect(prisma.agenda.findMany.mock.calls[0][0].where).toMatchObject({
      organization_id: ORG,
      OR: [{ participant_id: "user-1" }, { participant_id: null }],
    });
    expect((await send("GET", "/task/agenda?module=contabil&month=2026-12&mine=1")).status).toBe(
      400,
    );
  });

  it("usa o nível do módulo pedido, não o de outro módulo", async () => {
    const { prisma, send } = setup();

    const response = await send("GET", "/task/agenda?module=contabil&month=2026-12", {
      modules: { fiscal: 3 },
    });

    expect(response.status).toBe(403);
    expect(prisma.agenda.findMany).not.toHaveBeenCalled();
  });

  it("recusa escrita de quem só visualiza e aceita a do owner", async () => {
    const { prisma, send } = setup();
    const body = { module: "contabil", agenda: "Fechamento", date: "2026-12-31T12:00:00.000Z" };

    const denied = await send("POST", "/task/agenda", { body, modules: { contabil: 1 } });
    const created = await send("POST", "/task/agenda", { body, modules: {}, type: "owner" });

    expect(denied.status).toBe(403);
    expect(created.status).toBe(201);
    expect(prisma.agenda.create).toHaveBeenCalledTimes(1);
  });

  it("edita só dentro do departamento e responde 404 para ID alheio", async () => {
    const { prisma, send } = setup();

    const updated = await send("PUT", "/task/agenda", {
      body: { module: "contabil", agenda_id: "evt-1", status: "Realizado" },
    });
    const removed = await send("DELETE", "/task/agenda", {
      body: { module: "contabil", agenda_id: "evt-de-outro-departamento" },
    });

    expect(updated.status).toBe(200);
    expect(prisma.agenda.updateMany).toHaveBeenCalledWith({
      where: {
        id: "evt-1",
        organization_id: ORG,
        module: null,
        department_control_id: { in: [CONTABIL] },
      },
      data: { status: "Realizado" },
    });
    expect(removed.status).toBe(404);
  });

  it("aceita a recorrência mensal na criação e na edição, e recusa valor que não é booleano (#1700)", async () => {
    const { prisma, send } = setup();
    const body = { module: "contabil", agenda: "Fechamento", date: "2026-12-31T12:00:00.000Z" };

    const created = await send("POST", "/task/agenda", { body: { ...body, recurrent: true } });
    const updated = await send("PUT", "/task/agenda", {
      body: { module: "contabil", agenda_id: "evt-1", recurrent: false },
    });
    const invalid = await send("POST", "/task/agenda", { body: { ...body, recurrent: "sim" } });

    expect(created.status).toBe(201);
    expect(prisma.recurringAgenda.create.mock.calls[0][0].data).toMatchObject({
      day: 31,
      recurrence: "mensal",
      organization_id: ORG,
      department_control_id: CONTABIL,
      generated_through: "2026-12",
    });
    expect(prisma.agenda.create).not.toHaveBeenCalled();
    expect(updated.status).toBe(200);
    expect(invalid.status).toBe(400);
  });

  it("aceita cliente e responsável e recusa o que não é desta organização (#1774)", async () => {
    const { prisma, send } = setup();
    const body = {
      module: "contabil",
      agenda: "Fechamento",
      date: "2026-12-31T12:00:00.000Z",
      client_id: "cli-1",
      participant_id: "user-2",
    };

    expect((await send("POST", "/task/agenda", { body })).status).toBe(201);
    expect(prisma.agenda.create.mock.calls[0][0].data).toMatchObject({
      client_id: "cli-1",
      participant_id: "user-2",
    });

    prisma.user.count.mockResolvedValue(0);
    expect((await send("POST", "/task/agenda", { body })).status).toBe(404);
    expect((await send("POST", "/task/agenda", { body: { ...body, client_id: "" } })).status).toBe(
      400,
    );
    expect(prisma.agenda.create).toHaveBeenCalledTimes(1);
  });

  it("valida módulo, mês e estado", async () => {
    const { send } = setup();
    const put = (body: Record<string, unknown>) =>
      send("PUT", "/task/agenda", { body: { module: "contabil", agenda_id: "evt-1", ...body } });

    // Sem campo para mudar não há edição; data nula não vira 1970.
    expect((await put({})).status).toBe(400);
    expect((await put({ date: null })).status).toBe(400);

    expect((await send("GET", "/task/agenda?module=wiki&month=2026-12")).status).toBe(400);
    expect((await send("GET", "/task/agenda?module=contabil&month=2026-13")).status).toBe(400);
    expect(
      (
        await send("PUT", "/task/agenda", {
          body: { module: "contabil", agenda_id: "evt-1", status: "Qualquer" },
        })
      ).status,
    ).toBe(400);
  });
});

describe("agenda de Integração (#1952)", () => {
  const participants = [
    { department_id: INTEGRACAO, participant_id: "user-1" },
    { department_id: "dep-fiscal", participant_id: "user-2" },
    { department_id: "dep-fiscal", participant_id: "user-3" },
    { department_id: CONTABIL, participant_id: "user-4" },
  ];
  const body = {
    module: "integracao",
    agenda: "Reunião de implantação",
    date: "2026-12-31T12:00:00.000Z",
    client_id: "client-1",
    participants,
  };

  it("aplica o mês civil e nega exclusão direta", async () => {
    const { prisma, send } = setup();
    const modules = { integracao: 2 };
    const path =
      "/task/agenda?module=integracao&month=2026-12&timezone_offset_start=180&timezone_offset_end=120";
    expect((await send("GET", path, { modules })).status).toBe(200);
    expect(prisma.agenda.findMany.mock.calls[0][0].where.date).toEqual({
      gte: new Date("2026-12-01T03:00:00Z"),
      lt: new Date("2027-01-01T02:00:00Z"),
    });
    expect(
      (
        await send("DELETE", "/task/agenda", {
          modules,
          body: { module: "integracao", agenda_id: "evt-1" },
        })
      ).status,
    ).toBe(403);
    expect(prisma.agenda.deleteMany).not.toHaveBeenCalled();
  });

  it("permite leitura ao nível 1 e recusa nível 0 mesmo com permissão em outro módulo", async () => {
    const { prisma, send } = setup();
    const path = "/task/agenda?module=integracao&month=2026-12";

    expect((await send("GET", path, { modules: { integracao: 1 } })).status).toBe(200);
    expect(prisma.agenda.findMany.mock.calls[0][0].where).toMatchObject({
      organization_id: ORG,
      module: "integracao",
    });
    expect((await send("GET", path, { modules: { integracao: 0, contabil: 3 } })).status).toBe(403);
  });

  it("exige cliente, pauta e primeiro par, e valida os quatro participantes", async () => {
    const { prisma, send } = setup();
    const modules = { integracao: 2 };

    expect((await send("POST", "/task/agenda", { body, modules })).status).toBe(201);
    expect(prisma.agenda.create.mock.calls[0][0].data).toMatchObject({
      module: "integracao",
      client_id: "client-1",
      status: "Pendente",
      department_control_id: INTEGRACAO,
      participant_id: "user-1",
      participant_id_2: "user-2",
      participant_id_3: "user-3",
      participant_id_4: "user-4",
    });
    expect(
      (await send("POST", "/task/agenda", { body: { ...body, client_id: null }, modules })).status,
    ).toBe(400);
    expect(
      (await send("POST", "/task/agenda", { body: { ...body, participants: [] }, modules })).status,
    ).toBe(400);
    expect(
      (
        await send("POST", "/task/agenda", {
          body: { ...body, department_id: INTEGRACAO },
          modules,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send("PUT", "/task/agenda", {
          body: { module: "integracao", agenda_id: "evt-1", participant_id: "user-2" },
          modules,
        })
      ).status,
    ).toBe(400);
    expect((await send("POST", "/task/agenda", { body, modules: { integracao: 1 } })).status).toBe(
      403,
    );
  });

  it("aceita os seis estados legados em edição e recusa estado alheio", async () => {
    const { send } = setup();
    for (const status of [
      "Realizado",
      "Agendada",
      "Atrasada",
      "Desmarcada pelo cliente",
      "Pendente",
      "Previsão",
    ]) {
      expect(
        (
          await send("PUT", "/task/agenda", {
            body: { module: "integracao", agenda_id: "evt-1", status },
            modules: { integracao: 2 },
          })
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await send("PUT", "/task/agenda", {
          body: { module: "integracao", agenda_id: "evt-1", status: "Cancelado" },
          modules: { integracao: 2 },
        })
      ).status,
    ).toBe(400);
  });
});
