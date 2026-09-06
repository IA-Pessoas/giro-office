import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
} from "@workspace/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHttpProjectWizardIntegration } from "../integrations/projectWizard.js";

vi.mock("@workspace/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/shared")>()),
  error: vi.fn(),
}));

const params = {
  userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  organizationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  modules: { integracao: 2 },
  idempotencyKey: "wizard-open-1",
  client_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  name: "Novo projeto",
  start_date: new Date("2026-09-01T00:00:00.000Z"),
  end_date: new Date("2026-09-30T00:00:00.000Z"),
  objective: "Objetivo do projeto",
};

describe("project wizard integration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("encaminha criação, contexto autenticado e a mesma chave ao project-service", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { create: { id: "project-1", name: "Novo projeto" } },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
    );
    const integration = createHttpProjectWizardIntegration({
      serviceUrl: "http://project-service:3033",
      serviceToken: "task-service-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(integration.createProject(params)).resolves.toEqual({
      id: "project-1",
      name: "Novo projeto",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://project-service:3033/project"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "wizard-open-1",
          [INTERNAL_SERVICE_TOKEN_HEADER]: "task-service-token",
          [FORWARDED_AUTH_USER_ID_HEADER]: params.userId,
          [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: params.organizationId,
          [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify(params.modules),
        }),
        body: JSON.stringify({
          client_id: params.client_id,
          name: params.name,
          start_date: params.start_date,
          end_date: params.end_date,
          objective: params.objective,
        }),
      }),
    );
  });

  it("converte falha do project-service em 502", async () => {
    const integration = createHttpProjectWizardIntegration({
      serviceUrl: "http://project-service:3033",
      serviceToken: "task-service-token",
      fetchImpl: (async () => new Response(null, { status: 409 })) as typeof fetch,
    });

    await expect(integration.createProject(params)).rejects.toMatchObject({ statusCode: 502 });
  });

  it.each([
    {
      scenario: "falha de transporte",
      fetchImpl: vi.fn().mockRejectedValue(new Error("token=segredo; body=sensível")),
      message: "Falha ao chamar o project-service.",
    },
    {
      scenario: "JSON inválido",
      fetchImpl: async () => new Response("token=segredo; body=sensível"),
      message: "Resposta inválida do project-service.",
    },
    {
      scenario: "envelope inválido",
      fetchImpl: async () => Response.json({ token: "segredo", body: "sensível" }),
      message: "Resposta inválida do project-service.",
    },
  ])("registra $scenario sem expor dados sensíveis", async ({ fetchImpl, message }) => {
    const integration = createHttpProjectWizardIntegration({
      serviceUrl: "http://project-service:3033",
      serviceToken: "task-service-token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(integration.createProject(params)).rejects.toMatchObject({ statusCode: 502 });
    expect(logError).toHaveBeenCalledExactlyOnceWith(message);
  });
});
