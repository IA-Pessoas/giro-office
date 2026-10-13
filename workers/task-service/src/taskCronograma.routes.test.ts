import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createTaskWorkerApp } from "./app.js";
import { recordingBinding, TOKENS, workerEnv } from "./test/env.js";

const clientId = "11111111-1111-4111-8111-111111111111";

function setup() {
  const prisma = {
    client: {
      findFirst: vi.fn().mockResolvedValue({ id: clientId, name: "Cliente A", company_name: null }),
    },
    task: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "task-1",
          name: "Entregar documentação",
          prevision_date: new Date("2025-12-01T12:00:00Z"),
        },
      ]),
    },
  };
  const env = workerEnv({ AUDIT_SERVICE: recordingBinding() as never });
  const app = createTaskWorkerApp({ env, prisma });
  const send = (level: number, id = clientId) =>
    app.fetch(
      new Request(`https://task.test/task/cronograma?client_id=${id}`, {
        headers: {
          [INTERNAL_SERVICE_TOKEN_HEADER]: TOKENS.internal,
          [FORWARDED_AUTH_USER_ID_HEADER]: "user-1",
          [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "org-1",
          [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: level, contabil: 3 }),
        },
      }),
      env,
    );
  return { prisma, send };
}

describe("cronograma Worker HTTP (#1954)", () => {
  it("retorna previsão vencida do cliente para Integração nível 1", async () => {
    const { prisma, send } = setup();
    const response = await send(1);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { tasks: [{ id: "task-1", name: "Entregar documentação" }] },
    });
    expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({
      organization_id: "org-1",
      client_id: clientId,
    });
  });

  it("nega nível 0 e cliente não localizado na organização", async () => {
    const { prisma, send } = setup();
    expect((await send(0)).status).toBe(403);
    prisma.client.findFirst.mockResolvedValue(null);
    expect((await send(1)).status).toBe(404);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
});
