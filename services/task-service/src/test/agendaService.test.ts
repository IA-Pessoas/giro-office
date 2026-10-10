import { describe, expect, it, vi } from "vitest";

import { AgendaService } from "../services/agendaService.js";

const ORG = "org-1";
const CONTABIL = "dep-contabil";
const FISCAL = "dep-fiscal";
const EVENT = "evt-1";

const editor = { organizationId: ORG, userId: "user-1", module: "contabil", level: 2 } as const;
const viewer = { ...editor, level: 1 } as const;

function setup() {
  const prisma = {
    department: {
      findMany: vi.fn().mockResolvedValue([
        { id: CONTABIL, name: "Contábil" },
        { id: FISCAL, name: "Fiscal" },
      ]),
    },
    agenda: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(async ({ data }) => ({ id: EVENT, ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const audit = { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
  return { prisma, audit, service: new AgendaService(prisma as never, audit as never) };
}

const event = { agenda: "Fechamento", date: new Date("2026-12-31T12:00:00.000Z") };

describe("AgendaService", () => {
  it("lista só os eventos do departamento do módulo, na organização e no mês", async () => {
    const { prisma, service } = setup();

    await service.list(viewer, "2026-12");

    expect(prisma.department.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    expect(prisma.agenda.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: ORG,
          department_control_id: { in: [CONTABIL] },
          date: {
            gte: new Date("2026-12-01T00:00:00.000Z"),
            lt: new Date("2027-01-01T00:00:00.000Z"),
          },
        },
      }),
    );
  });

  it("recusa leitura sem permissão no módulo", async () => {
    const { prisma, service } = setup();

    await expect(service.list({ ...editor, level: 0 }, "2026-12")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prisma.agenda.findMany).not.toHaveBeenCalled();
  });

  it("cria o evento no departamento do módulo e registra a trilha", async () => {
    const { prisma, audit, service } = setup();

    const created = await service.create(editor, event);

    expect(prisma.agenda.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          ...event,
          status: "Pendente",
          organization_id: ORG,
          department_control_id: CONTABIL,
        },
      }),
    );
    expect(created).toMatchObject({ id: EVENT });
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", organizationId: ORG, referringId: EVENT }),
    );
  });

  it("recusa escrita de quem só visualiza", async () => {
    const { prisma, service } = setup();

    await expect(service.create(viewer, event)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.update(viewer, EVENT, event)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.remove(viewer, EVENT)).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.agenda.create).not.toHaveBeenCalled();
    expect(prisma.agenda.updateMany).not.toHaveBeenCalled();
    expect(prisma.agenda.deleteMany).not.toHaveBeenCalled();
  });

  it("recusa criar em departamento de outro módulo", async () => {
    const { prisma, service } = setup();

    await expect(service.create(editor, { ...event, department_id: FISCAL })).rejects.toMatchObject(
      { statusCode: 404 },
    );
    expect(prisma.agenda.create).not.toHaveBeenCalled();
  });

  it("edita e remove por ID só dentro da organização e do departamento", async () => {
    const { prisma, service } = setup();
    const scoped = { id: EVENT, organization_id: ORG, department_control_id: { in: [CONTABIL] } };

    await service.update(editor, EVENT, { status: "Realizado" });
    await service.remove(editor, EVENT);

    expect(prisma.agenda.updateMany).toHaveBeenCalledWith({
      where: scoped,
      data: { status: "Realizado" },
    });
    expect(prisma.agenda.deleteMany).toHaveBeenCalledWith({ where: scoped });
  });

  it("responde 404 para ID de outro departamento ou organização, sem trilha", async () => {
    const { prisma, audit, service } = setup();
    prisma.agenda.updateMany.mockResolvedValue({ count: 0 });
    prisma.agenda.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.update(editor, "alheio", event)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.remove(editor, "alheio")).rejects.toMatchObject({ statusCode: 404 });
    expect(audit.createLog).not.toHaveBeenCalled();
  });
});
