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

function setup() {
  const prisma = {
    department: {
      findMany: vi.fn().mockResolvedValue([
        { id: CONTABIL, name: "Contábil" },
        { id: "dep-fiscal", name: "Fiscal" },
      ]),
    },
    agenda: {
      findMany: vi.fn().mockResolvedValue([{ id: "evt-1", agenda: "Fechamento" }]),
      create: vi.fn(async ({ data }) => ({ id: "evt-1", ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
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
      where: { id: "evt-1", organization_id: ORG, department_control_id: { in: [CONTABIL] } },
      data: { status: "Realizado" },
    });
    expect(removed.status).toBe(404);
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
