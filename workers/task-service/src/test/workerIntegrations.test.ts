import { describe, expect, it, vi } from "vitest";
import { runInTaskContext } from "../context.js";
import type { TaskWorkerEnv } from "../env.js";
import { createLog, logUpdateIfChanged } from "../integrations/audit.js";
import { createHttpProjectProgressIntegration } from "../integrations/projectProgress.js";
import prismaClient from "../prisma/index.js";

function envWith(overrides: Partial<TaskWorkerEnv> = {}): TaskWorkerEnv {
  return { JWT_SECRET: "jwt", INTERNAL_SERVICE_TOKEN: "internal-token", ...overrides };
}

function binding(status = 200) {
  return { fetch: vi.fn(async (_request: Request) => new Response("{}", { status })) };
}

const audit = {
  userId: "user-1",
  organizationId: "org-1",
  action: "Cadastro",
  referring: "integracao.tasks",
  referringId: "task-1",
  changes: { name: "Tarefa" },
};

describe("prisma da requisição", () => {
  it("falha fora do contexto de requisição", () => {
    expect(() => prismaClient.task).toThrow("Contexto de requisição do task Worker ausente.");
  });

  it("responde 503 quando não há Hyperdrive nem DATABASE_URL", async () => {
    await expect(runInTaskContext(envWith(), async () => prismaClient.task)).rejects.toMatchObject({
      statusCode: 503,
      message: "Banco de dados não configurado.",
    });
  });
});

describe("auditoria pelo binding AUDIT_SERVICE", () => {
  it("envia o payload de ENTITY_CHANGE com o token de auditoria", async () => {
    const service = binding();
    await runInTaskContext(
      envWith({ AUDIT_SERVICE: service, AUDIT_SERVICE_TOKEN: "audit-token" }),
      () => createLog({ ...audit, required: true }),
    );

    const request = service.fetch.mock.calls[0][0];
    expect(new URL(request.url).pathname).toBe("/internal/audit/requests");
    expect(request.headers.get("x-internal-service-token")).toBe("audit-token");
    await expect(request.json()).resolves.toMatchObject({
      method: "ENTITY_CHANGE",
      path: "/integracao/tasks",
      serviceSource: "task-service",
      referringId: "task-1",
      changes: { name: "Tarefa" },
    });
  });

  it("registra só os campos alterados", async () => {
    const service = binding();
    await runInTaskContext(
      envWith({ AUDIT_SERVICE: service, AUDIT_SERVICE_TOKEN: "audit-token" }),
      () =>
        logUpdateIfChanged({
          ...audit,
          oldData: { name: "A", status: "Ativo" },
          updatedData: { name: "B", status: "Ativo" },
        }),
    );

    await expect(service.fetch.mock.calls[0][0].json()).resolves.toMatchObject({
      changes: { name: { from: "A", to: "B" } },
    });
  });

  it("best-effort não derruba a operação quando a auditoria falha", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runInTaskContext(envWith({ AUDIT_SERVICE: binding(500), AUDIT_SERVICE_TOKEN: "t" }), () =>
        createLog(audit),
      ),
    ).resolves.toBeUndefined();
    error.mockRestore();
  });

  it("auditoria obrigatória falha a operação sem binding configurado", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runInTaskContext(envWith(), () => createLog({ ...audit, required: true })),
    ).rejects.toThrow("Audit persistence unavailable");
    error.mockRestore();
  });
});

describe("progresso do projeto pelo binding PROJECT_SERVICE", () => {
  const params = { projectId: "project-1", userId: "user-1", organizationId: "org-1" };

  it("chama POST /project/progress com a identidade repassada", async () => {
    const service = binding();
    await runInTaskContext(envWith({ PROJECT_SERVICE: service }), () =>
      createHttpProjectProgressIntegration().recalculateProjectProgress(params),
    );

    const request = service.fetch.mock.calls[0][0];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/project/progress");
    expect(request.headers.get("x-internal-service-token")).toBe("internal-token");
    expect(request.headers.get("x-auth-user-id")).toBe("user-1");
    expect(request.headers.get("x-auth-organization-id")).toBe("org-1");
    await expect(request.json()).resolves.toEqual({ project_id: "project-1" });
  });

  it("converte resposta de erro do project-service em 502", async () => {
    await expect(
      runInTaskContext(envWith({ PROJECT_SERVICE: binding(500) }), () =>
        createHttpProjectProgressIntegration().recalculateProjectProgress(params),
      ),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("responde 502 quando o binding não existe", async () => {
    await expect(
      runInTaskContext(envWith(), () =>
        createHttpProjectProgressIntegration().recalculateProjectProgress(params),
      ),
    ).rejects.toMatchObject({ statusCode: 502, message: "Falha ao chamar o project-service." });
  });
});
