import { describe, expect, it, vi } from "vitest";

import { AgendaService, monthlyOccurrenceDate } from "../services/agendaService.js";

const ORG = "org-1";
const TRIAGEM = "dep-triagem";
const editor = { organizationId: ORG, userId: "user-1", module: "triagem", level: 2 } as const;
const viewer = { ...editor, level: 1 } as const;

type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

/** Filtros que o serviço usa: igualdade, `in`, `lt` e `gte` (nulo nunca é menor). */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key] as never;
    if (condition === null || typeof condition !== "object" || condition instanceof Date) {
      return value === condition;
    }
    const { in: list, lt, gte } = condition as { in?: unknown[]; lt?: never; gte?: never };
    if (list) return list.includes(value);
    return (
      (lt === undefined || (value != null && value < lt)) && (gte === undefined || value >= gte)
    );
  });
}

/** Banco em memória: a regra e as ocorrências sobrevivem entre chamadas, como no Postgres. */
function setup() {
  const rules: Row[] = [];
  const events: Row[] = [];
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;
  const occurrenceKey = (row: Where) => `${row.recurring_agenda_id}|${row.recurrence_month}`;

  const table = (rows: Row[]) => ({
    findMany: vi.fn(async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where))),
    findFirst: vi.fn(
      async ({ where }: { where: Where }) => rows.find((r) => matches(r, where)) ?? null,
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Where }) => {
      const hits = rows.filter((r) => matches(r, where));
      const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      for (const row of hits) Object.assign(row, defined);
      return { count: hits.length };
    }),
    deleteMany: vi.fn(async ({ where }: { where: Where }) => {
      const hits = rows.filter((r) => matches(r, where));
      for (const row of hits) rows.splice(rows.indexOf(row), 1);
      return { count: hits.length };
    }),
  });

  const prisma = {
    department: { findMany: vi.fn().mockResolvedValue([{ id: TRIAGEM, name: "Triagem" }]) },
    client: { count: vi.fn().mockResolvedValue(1) },
    user: { count: vi.fn().mockResolvedValue(1) },
    agenda: {
      ...table(events),
      create: vi.fn(async ({ data }: { data: Where }) => {
        const row = {
          recurring_agenda_id: null,
          recurrence_month: null,
          ...data,
          id: nextId("evt"),
        };
        events.push(row);
        return row;
      }),
      // Índice único (regra, competência): `skipDuplicates` ignora a ocorrência repetida.
      createMany: vi.fn(async ({ data }: { data: Where[] }) => {
        const fresh = data.filter(
          (row) => !events.some((event) => occurrenceKey(event) === occurrenceKey(row)),
        );
        events.push(...fresh.map((row) => ({ ...row, id: nextId("evt") })));
        return { count: fresh.length };
      }),
    },
    recurringAgenda: {
      ...table(rules),
      create: vi.fn(async ({ data }: { data: Where }) => {
        const { occurrences, ...rule } = data as Where & { occurrences?: { create: Where } };
        const id = nextId("rule");
        rules.push({ ...rule, id });
        const created = occurrences
          ? [{ ...occurrences.create, recurring_agenda_id: id, id: nextId("evt") }]
          : [];
        events.push(...created);
        return { id, occurrences: created };
      }),
    },
  };
  const audit = { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
  const service = new AgendaService(prisma as never, audit as never);
  const days = (month: string, now: string) =>
    service
      .list(viewer, month, false, new Date(now))
      .then((rows) => rows.map((row) => `${row.date.toISOString().slice(0, 10)} ${row.agenda}`));
  return { prisma, rules, events, service, days };
}

const noon = (day: string) => new Date(`${day}T12:00:00.000Z`);
const monthly = { agenda: "Fechamento", date: noon("2026-11-16"), recurrent: true };

describe("monthlyOccurrenceDate", () => {
  it("mantém o dia da regra e volta ao dia 31 depois de um mês curto", () => {
    expect(monthlyOccurrenceDate(16, "2026-12")).toEqual(noon("2026-12-16"));
    expect(monthlyOccurrenceDate(31, "2027-03")).toEqual(noon("2027-03-31"));
    expect(monthlyOccurrenceDate(31, "2027-04")).toEqual(noon("2027-04-30"));
  });

  it("fim de semana vai para a sexta anterior, sem sair do mês", () => {
    // 28/02/2027 é domingo: a regra do dia 31 cai na sexta 26.
    expect(monthlyOccurrenceDate(31, "2027-02")).toEqual(noon("2027-02-26"));
    // 01/05/2027 é sábado e 01/08/2027 é domingo: não há sexta no mês, vai para a segunda.
    expect(monthlyOccurrenceDate(1, "2027-05")).toEqual(noon("2027-05-03"));
    expect(monthlyOccurrenceDate(1, "2027-08")).toEqual(noon("2027-08-02"));
    expect(monthlyOccurrenceDate(2, "2027-05")).toEqual(noon("2027-05-03"));
  });
});

describe("recorrência mensal da agenda (#1700)", () => {
  it("cria a regra e a primeira ocorrência juntas", async () => {
    const { rules, events, service } = setup();

    const created = await service.create(editor, monthly);

    expect(rules).toMatchObject([
      {
        agenda: "Fechamento",
        day: 16,
        recurrence: "mensal",
        organization_id: ORG,
        department_control_id: TRIAGEM,
        generated_through: "2026-11",
      },
    ]);
    expect(events).toMatchObject([
      { id: created.id, recurring_agenda_id: rules[0].id, recurrence_month: "2026-11" },
    ]);
  });

  it("gera a ocorrência do mês uma única vez, por mais que a agenda seja aberta", async () => {
    const { events, service, days } = setup();
    await service.create(editor, monthly);

    await days("2026-12", "2026-12-01T03:00:00.000Z");
    await days("2026-11", "2026-12-20T15:00:00.000Z");

    expect(await days("2026-12", "2026-12-31T23:00:00.000Z")).toEqual(["2026-12-16 Fechamento"]);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      status: "Pendente",
      organization_id: ORG,
      department_control_id: TRIAGEM,
    });
  });

  it("vira de dezembro para janeiro sem duplicar nem pular", async () => {
    const { events, service, days } = setup();
    await service.create(editor, monthly);
    await days("2026-12", "2026-12-10T12:00:00.000Z");

    await days("2027-01", "2027-01-01T00:30:00.000Z");

    // 16/01/2027 é sábado: a ocorrência vai para a sexta 15.
    expect(await days("2027-01", "2027-01-31T12:00:00.000Z")).toEqual(["2027-01-15 Fechamento"]);
    expect(await days("2026-12", "2027-01-31T12:00:00.000Z")).toEqual(["2026-12-16 Fechamento"]);
    expect(events.map((event) => event.recurrence_month)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("regra do dia 31 gera uma ocorrência no fim de cada mês", async () => {
    const { service, days } = setup();
    await service.create(editor, { ...monthly, date: noon("2027-01-31") });

    expect(await days("2027-02", "2027-02-28T12:00:00.000Z")).toEqual(["2027-02-26 Fechamento"]);
    expect(await days("2027-03", "2027-03-31T12:00:00.000Z")).toEqual(["2027-03-31 Fechamento"]);
    expect(await days("2027-04", "2027-04-30T12:00:00.000Z")).toEqual(["2027-04-30 Fechamento"]);
  });

  it("não duplica quando o marcador da regra ficou para trás", async () => {
    const { rules, events, service, days } = setup();
    await service.create(editor, monthly);
    await days("2026-12", "2026-12-10T12:00:00.000Z");
    // Falha entre criar a ocorrência e avançar o marcador, ou duas leituras ao mesmo tempo.
    rules[0].generated_through = "2026-11";

    await days("2026-12", "2026-12-11T12:00:00.000Z");

    expect(events).toHaveLength(2);
    expect(rules[0].generated_through).toBe("2026-12");
  });

  it("evento marcado para um mês futuro só repete depois dele", async () => {
    const { events, service, days } = setup();
    await service.create(editor, { ...monthly, date: noon("2027-02-10") });

    await days("2026-12", "2026-12-10T12:00:00.000Z");
    await days("2027-02", "2027-02-20T12:00:00.000Z");
    expect(events).toHaveLength(1);

    expect(await days("2027-03", "2027-03-02T12:00:00.000Z")).toEqual(["2027-03-10 Fechamento"]);
  });

  it("ignora regra legada sem marcador e regra de outro departamento", async () => {
    const { rules, events, days } = setup();
    const legacy = {
      agenda: "Legada",
      day: 5,
      recurrence: "mensal",
      organization_id: ORG,
      department_control_id: TRIAGEM,
    };
    rules.push(
      { ...legacy, id: "rule-legada", generated_through: null },
      {
        ...legacy,
        id: "rule-alheia",
        department_control_id: "dep-regularize",
        generated_through: "2026-11",
      },
      { ...legacy, id: "rule-outra-org", organization_id: "org-2", generated_through: "2026-11" },
    );

    await days("2026-12", "2026-12-10T12:00:00.000Z");

    expect(events).toEqual([]);
  });

  it("mudança de estado vale só para a ocorrência", async () => {
    const { events, service, days } = setup();
    const first = await service.create(editor, monthly);

    await service.update(editor, first.id, { status: "Realizado" });
    await days("2026-12", "2026-12-10T12:00:00.000Z");

    expect(events.map((event) => event.status)).toEqual(["Realizado", "Pendente"]);
  });

  it("edição da ocorrência mais recente vale para as próximas; a de uma antiga, não", async () => {
    const { events, service, days } = setup();
    const first = await service.create(editor, monthly);
    await days("2026-12", "2026-12-10T12:00:00.000Z");
    const december = events[1].id;

    await service.update(editor, first.id, { agenda: "Antiga renomeada" });
    await service.update(editor, december, { agenda: "Entrega", date: noon("2026-12-18") });

    expect(await days("2027-01", "2027-01-20T12:00:00.000Z")).toEqual(["2027-01-18 Entrega"]);
    expect(await days("2026-12", "2027-01-20T12:00:00.000Z")).toEqual(["2026-12-18 Entrega"]);
  });

  it("adiar a ocorrência para o mês seguinte não desloca nem duplica a de lá", async () => {
    const { events, service, days } = setup();
    await service.create(editor, monthly);
    await days("2026-12", "2026-12-10T12:00:00.000Z");

    await service.update(editor, events[1].id, { date: noon("2027-01-05") });

    expect(await days("2026-12", "2027-01-20T12:00:00.000Z")).toEqual([]);
    expect(await days("2027-01", "2027-01-20T12:00:00.000Z")).toEqual([
      "2027-01-05 Fechamento",
      "2027-01-15 Fechamento",
    ]);
  });

  it("remover uma ocorrência não a traz de volta nem encerra a série", async () => {
    const { events, service, days } = setup();
    await service.create(editor, monthly);
    await days("2026-12", "2026-12-10T12:00:00.000Z");

    await service.remove(editor, events[1].id);

    expect(await days("2026-12", "2026-12-11T12:00:00.000Z")).toEqual([]);
    expect(await days("2027-01", "2027-01-20T12:00:00.000Z")).toEqual(["2027-01-15 Fechamento"]);
  });

  it("desligar a recorrência encerra a série e mantém o que já existe", async () => {
    const { rules, events, service, days } = setup();
    const first = await service.create(editor, monthly);

    await service.update(editor, first.id, { recurrent: false });

    expect(rules).toEqual([]);
    expect(await days("2026-12", "2026-12-10T12:00:00.000Z")).toEqual([]);
    expect(events).toMatchObject([
      { id: first.id, recurring_agenda_id: null, recurrence_month: null },
    ]);
  });

  it("ligar a recorrência em um evento comum passa a repeti-lo", async () => {
    const { rules, service, days } = setup();
    const plain = await service.create(editor, { agenda: "Reunião", date: noon("2026-11-09") });
    expect(rules).toEqual([]);

    await service.update(editor, plain.id, { recurrent: true });
    await service.update(editor, plain.id, { recurrent: true });

    expect(rules).toHaveLength(1);
    expect(await days("2026-12", "2026-12-10T12:00:00.000Z")).toEqual(["2026-12-09 Reunião"]);
  });

  // #1774: a ocorrência do mês seguinte nasce com o cliente e o responsável da série.
  it("as próximas ocorrências levam o cliente e o responsável da série", async () => {
    const { events, service } = setup();
    const first = await service.create(editor, {
      ...monthly,
      client_id: "cli-1",
      participant_id: "user-2",
    });

    await service.list(viewer, "2026-12", false, new Date("2026-12-01T12:00:00.000Z"));
    const december = events.find((row) => row.recurrence_month === "2026-12");
    expect(december).toMatchObject({ client_id: "cli-1", participant_id: "user-2" });
    expect(december?.id).not.toBe(first.id);

    // Trocar o responsável na ocorrência mais recente vale para janeiro; limpar o cliente também.
    await service.update(editor, String(december?.id), {
      participant_id: "user-3",
      client_id: null,
    });
    await service.list(viewer, "2027-01", false, new Date("2027-01-04T12:00:00.000Z"));
    expect(events.find((row) => row.recurrence_month === "2027-01")).toMatchObject({
      client_id: null,
      participant_id: "user-3",
    });
    expect(events.filter((row) => row.recurring_agenda_id)).toHaveLength(3);
  });

  it("ligar a recorrência em evento com responsável mantém a atribuição na série", async () => {
    const { events, service } = setup();
    const single = await service.create(editor, {
      agenda: "Folha",
      date: noon("2026-11-16"),
      client_id: "cli-1",
      participant_id: "user-2",
    });

    await service.update(editor, single.id, { recurrent: true });
    await service.list(viewer, "2026-12", false, new Date("2026-12-01T12:00:00.000Z"));

    expect(events.find((row) => row.recurrence_month === "2026-12")).toMatchObject({
      client_id: "cli-1",
      participant_id: "user-2",
    });
  });

  it("não deixa regra sem evento quando a edição perde a corrida ou falha", async () => {
    const { prisma, rules, service } = setup();
    const plain = await service.create(editor, { agenda: "Reunião", date: noon("2026-11-09") });

    // Outra edição ligou a recorrência entre a leitura e a gravação desta.
    prisma.agenda.findFirst.mockResolvedValueOnce({ ...plain, recurring_agenda_id: null });
    await service.update(editor, plain.id, { recurrent: true });
    prisma.agenda.findFirst.mockResolvedValueOnce({ ...plain, recurring_agenda_id: null });
    await expect(service.update(editor, plain.id, { recurrent: true })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(rules).toHaveLength(1);

    const other = await service.create(editor, { agenda: "Outra", date: noon("2026-11-10") });
    prisma.agenda.updateMany.mockRejectedValueOnce(new Error("banco fora"));
    await expect(service.update(editor, other.id, { recurrent: true })).rejects.toThrow(
      "banco fora",
    );
    expect(rules).toHaveLength(1);
  });

  it("quem só visualiza não liga nem desliga recorrência", async () => {
    const { rules, service } = setup();
    const first = await service.create(editor, monthly);

    await expect(service.create(viewer, monthly)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.update(viewer, first.id, { recurrent: false })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(rules).toHaveLength(1);
  });
});
