import { createHash, createHmac } from "node:crypto";
import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";
import { createTaskWorkerApp, type TaskServices } from "../app.js";
import type { TaskWorkerEnv } from "../env.js";
import { canonicalJson } from "../internalReporting.js";

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const UUID = "33333333-3333-4333-8333-333333333333";
const UUID2 = "44444444-4444-4444-8444-444444444444";

const env: TaskWorkerEnv = {
  JWT_SECRET: "jwt-secret",
  INTERNAL_SERVICE_TOKEN: "internal-token",
  COMMERCIAL_SERVICE_TOKEN: "commercial-token",
  REPORTS_INTERNAL_TOKEN: "reports-token",
  REPORTS_GRANT_SECRET: "reports-secret",
};

function identity(modules: Record<string, number> = { integracao: 3, financeiro: 3 }) {
  return {
    "x-internal-service-token": "internal-token",
    "x-auth-user-id": USER,
    "x-auth-organization-id": ORG,
    "x-auth-type": "admin",
    "x-auth-modules": JSON.stringify(modules),
  };
}

type Service = keyof TaskServices;
type RouteCase = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  service: Service;
  fn: string;
  status?: number;
  body?: unknown;
  /** Argumentos esperados na chamada (objectContaining por posição). */
  args: unknown[];
  /** Entrada inválida: a rota responde 400 sem chamar o service. */
  invalid?: { path?: string; body?: unknown };
};

const who = { user_id: USER, organization_id: ORG, integracaoLevel: 3, isOwner: false };
const whoFinanceiro = {
  user_id: USER,
  organization_id: ORG,
  integracao_level: 3,
  financeiro_level: 3,
  is_owner: false,
};
const planWho = who;
const accessOf = { userId: USER, integracaoLevel: 3, isOwner: false };

const routes: RouteCase[] = [
  // taskModel
  {
    method: "POST",
    path: "/task/model",
    service: "taskModel",
    fn: "createModel",
    status: 201,
    body: {
      name: "M",
      department_id: "d",
      responsible_id: "u",
      billing: "Realizar",
      prevision: "3",
    },
    args: [{ ...who, name: "M", prevision: 3, responsible2_id: null, type: null }],
    invalid: { body: { name: "M", responsible_id: "u" } },
  },
  {
    method: "GET",
    path: "/task/model?task_id=m1",
    service: "taskModel",
    fn: "detailModel",
    args: ["m1", ORG, accessOf],
    invalid: { path: "/task/model" },
  },
  {
    method: "PUT",
    path: "/task/model",
    service: "taskModel",
    fn: "updateModel",
    body: {
      task_id: "m1",
      name: "M",
      department_id: "d",
      responsible_id: "u",
      billing: "Realizar",
      prevision: 2,
    },
    args: [{ ...who, task_id: "m1", prevision: 2 }],
    invalid: { body: { task_id: "m1", responsible_id: "u" } },
  },
  {
    method: "GET",
    path: "/task/model/list?page=2&type=Projeto",
    service: "taskModel",
    fn: "listModel",
    args: [{ organizationId: ORG, paginationRequested: true, page: 2, type: "Projeto" }],
    invalid: { path: "/task/model/list?limit=500" },
  },
  {
    method: "DELETE",
    path: "/task/model?task_id=m1",
    service: "taskModel",
    fn: "deleteModel",
    args: [{ ...who, task_id: "m1" }],
    invalid: { path: "/task/model" },
  },
  // taskDependent
  {
    method: "POST",
    path: "/task/model/dependent",
    service: "taskDependent",
    fn: "addDependent",
    status: 201,
    body: { task_model_id: "m1", dependent_id: "m2", wait: 1, observation: 7 },
    args: [{ ...who, task_model_id: "m1", wait: true, observation: "7" }],
    invalid: { body: { task_model_id: "m1", dependent_id: "m2" } },
  },
  {
    method: "GET",
    path: "/task/model/dependent?task_model_id=m1",
    service: "taskDependent",
    fn: "listDependents",
    args: ["m1", ORG, accessOf],
    invalid: { path: "/task/model/dependent" },
  },
  {
    method: "DELETE",
    path: "/task/model/dependent",
    service: "taskDependent",
    fn: "deleteDependent",
    body: { id: "dep-1" },
    args: [{ ...who, id: "dep-1" }],
    invalid: { body: {} },
  },
  // taskIntegrationRegularize
  {
    method: "POST",
    path: "/task/integration",
    service: "taskIntegrationRegularize",
    fn: "createLink",
    status: 201,
    body: { task_model_id: "m1", referring: "p1", referring_type: "process" },
    args: [{ ...who, referring_type: "process" }],
    invalid: { body: { task_model_id: "m1", referring: "p1", referring_type: "x" } },
  },
  {
    method: "DELETE",
    path: "/task/integration",
    service: "taskIntegrationRegularize",
    fn: "removeLink",
    body: { integration_id: "i1" },
    args: [{ ...who, integration_id: "i1" }],
    invalid: { body: {} },
  },
  {
    method: "GET",
    path: "/task/integration?task_model_id=m1",
    service: "taskIntegrationRegularize",
    fn: "list",
    args: [ORG, "m1", accessOf],
    invalid: { path: "/task/integration?extra=1" },
  },
  // taskLifecycle
  {
    method: "PUT",
    path: "/task/conclusion",
    service: "taskLifecycle",
    fn: "concludeTask",
    body: { task_id: "t1", status: "Concluída", responsible_id: null },
    args: [{ ...who, body: expect.objectContaining({ task_id: "t1", justification: "" }) }],
    invalid: { body: { task_id: "t1", status: "Inexistente", responsible_id: null } },
  },
  {
    method: "POST",
    path: "/task/complete-request",
    service: "taskLifecycle",
    fn: "requestTaskCompletion",
    body: { task_id: "t1" },
    args: [{ ...who, task_id: "t1", reason: "" }],
    invalid: { body: {} },
  },
  {
    method: "PUT",
    path: "/task/complete-request",
    service: "taskLifecycle",
    fn: "approveTaskCompletion",
    body: { task_id: "t1", decision: "approved" },
    args: [{ ...who, task_id: "t1", decision: "approved" }],
    invalid: { body: { task_id: "t1", decision: "refused" } },
  },
  {
    method: "DELETE",
    path: "/task/complete-request",
    service: "taskLifecycle",
    fn: "cancelTaskCompletion",
    body: { task_id: "t1", request_id: "r1" },
    args: [{ ...who, task_id: "t1", request_id: "r1" }],
    invalid: { body: { request_id: "r1" } },
  },
  {
    method: "GET",
    path: "/task/complete-request/list?task_id=t1",
    service: "taskLifecycle",
    fn: "listTaskCompletionRequests",
    args: [{ ...who, task_id: "t1" }],
    invalid: { path: "/task/complete-request/list" },
  },
  {
    method: "PUT",
    path: "/task/reopen",
    service: "taskLifecycle",
    fn: "reopenTask",
    body: { task_id: "t1", reason: "voltou" },
    args: [{ ...who, task_id: "t1", reason: "voltou" }],
    invalid: { body: { task_id: "t1" } },
  },
  // taskPostponement
  {
    method: "POST",
    path: "/task/postponement",
    service: "taskPostponement",
    fn: "create",
    status: 201,
    body: { task_id: "t1", new_prevision_date: "2026-10-01", justification: "atraso" },
    args: [{ ...who, new_prevision_date: "2026-10-01" }],
    invalid: { body: { task_id: "t1", new_prevision_date: "2026-02-31", justification: "x" } },
  },
  {
    method: "GET",
    path: "/task/postponement/list?task_id=t1",
    service: "taskPostponement",
    fn: "list",
    args: [{ ...who, task_id: "t1" }],
    invalid: { path: "/task/postponement/list" },
  },
  // taskOperationalNotification
  {
    method: "GET",
    path: "/task/notifications",
    service: "taskOperationalNotification",
    fn: "list",
    args: [{ user_id: USER, organization_id: ORG }],
  },
  {
    method: "PUT",
    path: "/task/notifications/read",
    service: "taskOperationalNotification",
    fn: "markRead",
    body: { notification_id: "n1" },
    args: [{ user_id: USER, organization_id: ORG, notification_id: "n1" }],
    invalid: { body: {} },
  },
  // taskAttachment (upload tem testes próprios)
  {
    method: "GET",
    path: "/task/attachment/list?task_id=t1",
    service: "taskAttachment",
    fn: "list",
    args: [{ ...who, task_id: "t1" }],
    invalid: { path: "/task/attachment/list" },
  },
  {
    method: "GET",
    path: "/task/attachment/access?task_id=t1&attachment_id=a1",
    service: "taskAttachment",
    fn: "createAccessUrl",
    args: [{ ...who, task_id: "t1", attachment_id: "a1" }],
    invalid: { path: "/task/attachment/access?task_id=t1" },
  },
  {
    method: "DELETE",
    path: "/task/attachment",
    service: "taskAttachment",
    fn: "remove",
    body: { task_id: "t1", attachment_id: "a1" },
    args: [{ ...who, attachment_id: "a1" }],
    invalid: { body: { task_id: "t1" } },
  },
  // taskFinanceiro
  {
    method: "PUT",
    path: "/task/financeiro",
    service: "taskFinanceiro",
    fn: "settle",
    body: { task_id: "t1" },
    args: [{ ...whoFinanceiro, task_ids: ["t1"], idempotency_key: expect.any(String) }],
    invalid: { body: { task_ids: ["t1"] } },
  },
  {
    method: "GET",
    path: `/task/financeiro/queue?department_id=${UUID}`,
    service: "taskFinanceiro",
    fn: "listQueue",
    args: [{ ...whoFinanceiro, department_id: UUID }],
    invalid: { path: "/task/financeiro/queue?x=1" },
  },
  {
    method: "PUT",
    path: "/task/financeiro/collectors",
    service: "taskFinanceiro",
    fn: "setCollectors",
    body: { department_id: "d1", collector_ids: [USER] },
    args: [{ ...whoFinanceiro, department_id: "d1", collector_ids: [USER] }],
    invalid: { body: { department_id: "d1" } },
  },
  {
    method: "GET",
    path: "/task/financeiro/collectors?department_id=d1",
    service: "taskFinanceiro",
    fn: "listCollectors",
    args: [{ ...whoFinanceiro, department_id: "d1" }],
    invalid: { path: "/task/financeiro/collectors" },
  },
  {
    method: "POST",
    path: "/task/financeiro/settle",
    service: "taskFinanceiro",
    fn: "settle",
    body: { task_ids: ["t1", "t2"] },
    args: [{ ...whoFinanceiro, task_ids: ["t1", "t2"] }],
    invalid: { body: { task_ids: [] } },
  },
  {
    method: "POST",
    path: "/task/financeiro/express",
    service: "taskFinanceiro",
    fn: "settleExpress",
    body: { client_id: "c1" },
    args: [{ ...whoFinanceiro, client_id: "c1" }],
    invalid: { body: {} },
  },
  // taskCrud
  {
    method: "POST",
    path: "/task",
    service: "taskCrud",
    fn: "createTask",
    status: 201,
    body: {
      model_id: "m1",
      project_id: "p1",
      client_id: "c1",
      prospecting_status: "Fechado",
      department_id: "d1",
      urgency: "Alta",
    },
    args: [{ ...who, model_id: "m1", observations: "" }],
    invalid: { body: { model_id: "m1" } },
  },
  {
    method: "GET",
    path: "/task/list?status=Todos&page=2",
    service: "taskCrud",
    fn: "listTasks",
    args: [{ ...who, status: "Todos", page: 2, limit: 20 }],
    invalid: { path: "/task/list?client_id=nao-uuid" },
  },
  {
    method: "PUT",
    path: "/task",
    service: "taskCrud",
    fn: "updateTask",
    body: { task_id: "t1", name: "Nova" },
    args: [{ ...who, task_id: "t1", name: "Nova" }],
    invalid: { body: { task_id: "t1", extra: true } },
  },
  {
    method: "GET",
    path: "/task?task_id=t1",
    service: "taskCrud",
    fn: "detailTask",
    args: ["t1", ORG, { user_id: USER, integracaoLevel: 3, isOwner: false }],
    invalid: { path: "/task" },
  },
  {
    method: "DELETE",
    path: "/task",
    service: "taskCrud",
    fn: "deleteTask",
    body: { task_id: "t1" },
    args: [{ ...who, task_id: "t1" }],
    invalid: { body: {} },
  },
  // projectWizard (create e extract-tasks têm testes próprios)
  {
    method: "POST",
    path: "/task/project-wizard/preview",
    service: "projectWizard",
    fn: "preview",
    body: { tasks: [] },
    args: [{ userId: USER, organizationId: ORG, tasks: [] }],
    invalid: { body: { tasks: "x" } },
  },
  // projectPlan
  {
    method: "POST",
    path: "/task/project-plan",
    service: "projectPlan",
    fn: "create",
    status: 201,
    body: { name: "Plano", color: "#fff" },
    args: [{ ...planWho, name: "Plano", color: "#fff" }],
    invalid: { body: { name: "Plano" } },
  },
  {
    method: "GET",
    path: "/task/project-plan/list",
    service: "projectPlan",
    fn: "list",
    args: [ORG, planWho],
  },
  {
    method: "PUT",
    path: "/task/project-plan",
    service: "projectPlan",
    fn: "update",
    body: { id: UUID, name: "Plano", color: "#000" },
    args: [{ ...planWho, id: UUID }],
    invalid: { body: { id: "x", name: "Plano", color: "#000" } },
  },
  {
    method: "GET",
    path: `/task/project-plan?plan_id=${UUID}`,
    service: "projectPlan",
    fn: "detail",
    args: [UUID, ORG, planWho],
    invalid: { path: "/task/project-plan?plan_id=x" },
  },
  {
    method: "DELETE",
    path: `/task/project-plan?id=${UUID}`,
    service: "projectPlan",
    fn: "delete",
    args: [{ ...planWho, id: UUID }],
    invalid: { path: "/task/project-plan" },
  },
  {
    method: "POST",
    path: "/task/project-plan/task",
    service: "projectPlan",
    fn: "addTask",
    status: 201,
    body: { plan_id: UUID, task_id: UUID2 },
    args: [{ ...planWho, plan_id: UUID, task_id: UUID2 }],
    invalid: { body: { plan_id: UUID } },
  },
  {
    method: "GET",
    path: `/task/project-plan/task/list?plan_id=${UUID}`,
    service: "projectPlan",
    fn: "listTasks",
    args: [UUID, ORG, planWho],
    invalid: { path: "/task/project-plan/task/list" },
  },
  {
    method: "PUT",
    path: "/task/project-plan/task",
    service: "projectPlan",
    fn: "reorderTask",
    body: { plan_id: UUID, plan_task_id: UUID2, direction: "up" },
    args: [{ ...planWho, direction: "up" }],
    invalid: { body: { plan_id: UUID, plan_task_id: UUID2, direction: "left" } },
  },
  {
    method: "DELETE",
    path: "/task/project-plan/task",
    service: "projectPlan",
    fn: "deleteTask",
    body: { plan_id: UUID, plan_task_id: UUID2 },
    args: [{ ...planWho, plan_task_id: UUID2 }],
    invalid: { body: { plan_id: UUID } },
  },
  {
    method: "POST",
    path: "/task/project-plan/hire",
    service: "projectPlan",
    fn: "hirePlan",
    body: { project_id: UUID, plan_id: UUID2 },
    args: [{ ...planWho, project_id: UUID, plan_id: UUID2 }],
    invalid: { body: { project_id: UUID } },
  },
  // depsTasks
  {
    method: "GET",
    path: "/task/deps/list",
    service: "depsTasks",
    fn: "listDepartmentsWithTaskModels",
    args: [ORG],
  },
  {
    method: "GET",
    path: `/task/deps/options?department_id=${UUID}`,
    service: "depsTasks",
    fn: "listTaskModelOptions",
    args: [ORG, UUID],
    invalid: { path: "/task/deps/options?department_id=x" },
  },
];

function appWith(services: Partial<TaskServices>, overrides: Partial<TaskWorkerEnv> = {}) {
  return createTaskWorkerApp({ env: { ...env, ...overrides }, services });
}

function send(
  app: ReturnType<typeof createTaskWorkerApp>,
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
) {
  return app.request(`https://task.test${path}`, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

describe.each(routes)("$method $path", (route) => {
  const cleanPath = route.path.split("?")[0];

  it("responde o envelope de sucesso e repassa identidade e entrada ao service", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    const app = appWith({ [route.service]: { [route.fn]: fn } } as Partial<TaskServices>);

    const response = await send(app, route.method, route.path, {
      body: route.body,
      headers: identity(),
    });

    expect(response.status).toBe(route.status ?? 200);
    await expect(response.json()).resolves.toEqual({ success: true, data: { ok: true } });
    expect(fn).toHaveBeenCalledWith(
      ...route.args.map((arg) =>
        arg && typeof arg === "object" && !Array.isArray(arg) ? expect.objectContaining(arg) : arg,
      ),
    );
  });

  it("responde 401 sem identidade", async () => {
    const fn = vi.fn();
    const app = appWith({ [route.service]: { [route.fn]: fn } } as Partial<TaskServices>);

    const response = await send(app, route.method, cleanPath, { body: route.body });

    expect(response.status).toBe(401);
    expect(fn).not.toHaveBeenCalled();
  });

  it("propaga o 403 de permissão do service no envelope de erro", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new ServiceError(403, "Acesso negado para esta operação."));
    const app = appWith({ [route.service]: { [route.fn]: fn } } as Partial<TaskServices>);

    const response = await send(app, route.method, route.path, {
      body: route.body,
      headers: identity(),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Acesso negado para esta operação.",
      code: "FORBIDDEN",
    });
  });

  if (route.invalid) {
    const invalid = route.invalid;
    it("responde 400 para entrada inválida sem chamar o service", async () => {
      const fn = vi.fn();
      const app = appWith({ [route.service]: { [route.fn]: fn } } as Partial<TaskServices>);

      const response = await send(app, route.method, invalid.path ?? route.path, {
        body: invalid.body ?? (invalid.path ? route.body : undefined),
        headers: identity(),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ success: false, code: "BAD_REQUEST" });
      expect(fn).not.toHaveBeenCalled();
    });
  }
});

describe("permissão verificada na própria rota", () => {
  // /task/notifications também checa na rota, mas a política admite o nível básico.
  it.each([
    ["GET", "/task/deps/list", "depsTasks", "listDepartmentsWithTaskModels", undefined],
    ["GET", "/task/deps/options", "depsTasks", "listTaskModelOptions", undefined],
  ] as const)("%s %s recusa usuário sem acesso ao módulo integração", async (method, path, service, fn, body) => {
    const call = vi.fn();
    const app = appWith({ [service]: { [fn]: call } } as Partial<TaskServices>);

    const response = await send(app, method, path, { body, headers: identity({ integracao: 0 }) });

    expect(response.status).toBe(403);
    expect(call).not.toHaveBeenCalled();
  });
});

describe("autenticação", () => {
  it("recusa identidade repassada com token interno errado", async () => {
    const app = appWith({ taskCrud: { listTasks: vi.fn() } as never });
    const response = await send(app, "GET", "/task/list", {
      headers: { ...identity(), "x-internal-service-token": "outro" },
    });
    expect(response.status).toBe(401);
  });

  it("revalida no user-service a sessão por cookie repassada pelo gateway", async () => {
    const userService = { fetch: vi.fn(async () => new Response("{}", { status: 401 })) };
    const app = appWith(
      { taskCrud: { listTasks: vi.fn() } as never },
      { USER_SERVICE: userService, USER_SERVICE_INTERNAL_TOKEN: "user-token" },
    );
    const response = await send(app, "GET", "/task/list", {
      headers: { ...identity(), cookie: "cw.session=jwt-do-navegador" },
    });
    expect(userService.fetch).toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it("responde 503 quando há cookie mas falta a validação de sessão", async () => {
    const app = appWith({ taskCrud: { listTasks: vi.fn() } as never });
    const response = await send(app, "GET", "/task/list", {
      headers: { ...identity(), cookie: "cw.session=jwt-do-navegador" },
    });
    expect(response.status).toBe(503);
  });

  it("recusa ator de plataforma sem organização", async () => {
    const app = appWith({ taskCrud: { listTasks: vi.fn() } as never });
    const headers: Record<string, string> = { ...identity(), "x-auth-organization-id": "" };
    const response = await send(app, "GET", "/task/list", { headers });
    expect(response.status).toBe(401);
  });
});

describe("corpo JSON", () => {
  it("responde 400 para JSON malformado", async () => {
    const app = appWith({ taskCrud: { createTask: vi.fn() } as never });
    const response = await app.request("https://task.test/task", {
      method: "POST",
      headers: { ...identity(), "content-type": "application/json" },
      body: "{x",
    });
    expect(response.status).toBe(400);
  });

  it("responde 413 acima de 1 MB", async () => {
    const app = appWith({ taskCrud: { createTask: vi.fn() } as never });
    const response = await send(app, "POST", "/task", {
      body: { observations: "x".repeat(1024 * 1024) },
      headers: identity(),
    });
    expect(response.status).toBe(413);
  });
});

describe("POST /task/financeiro/settle — Idempotency-Key", () => {
  it("repassa a chave do header", async () => {
    const settle = vi.fn().mockResolvedValue({});
    const app = appWith({ taskFinanceiro: { settle } as never });
    await send(app, "POST", "/task/financeiro/settle", {
      body: { task_ids: ["t1"] },
      headers: { ...identity(), "Idempotency-Key": "chave-1" },
    });
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({ idempotency_key: "chave-1" }));
  });

  it("recusa chave maior que 255 caracteres", async () => {
    const settle = vi.fn();
    const app = appWith({ taskFinanceiro: { settle } as never });
    const response = await send(app, "POST", "/task/financeiro/settle", {
      body: { task_ids: ["t1"] },
      headers: { ...identity(), "Idempotency-Key": "k".repeat(256) },
    });
    expect(response.status).toBe(400);
    expect(settle).not.toHaveBeenCalled();
  });
});

describe("POST /task/project-wizard", () => {
  const body = {
    client_id: UUID,
    name: "Projeto",
    start_date: "2026-10-01",
    objective: "Objetivo",
    tasks: [],
    revision: "rev-1",
  };

  it("cria com a Idempotency-Key e a identidade completa", async () => {
    const create = vi.fn().mockResolvedValue({ project: { id: "p1" } });
    const app = appWith({ projectWizard: { create } as never });
    const response = await send(app, "POST", "/task/project-wizard", {
      body,
      headers: { ...identity(), "Idempotency-Key": "wizard-1" },
    });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        organizationId: ORG,
        userType: "admin",
        idempotencyKey: "wizard-1",
        client_id: UUID,
        start_date: expect.any(Date),
      }),
    );
  });

  it("exige Idempotency-Key", async () => {
    const create = vi.fn();
    const app = appWith({ projectWizard: { create } as never });
    const response = await send(app, "POST", "/task/project-wizard", {
      body,
      headers: identity(),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Idempotency-Key é obrigatória.",
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("POST /task/project-wizard/extract-tasks", () => {
  const project = { name: "Projeto", start_date: "2026-10-01", objective: "Objetivo" };

  function form(file?: File, fields: Record<string, string> = project) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    if (file) data.set("file", file);
    return data;
  }

  it("aceita a Ata em JSON", async () => {
    const extractTasks = vi.fn().mockResolvedValue({ tasks: [] });
    const app = appWith({ projectWizardExtraction: { extractTasks } });
    const response = await send(app, "POST", "/task/project-wizard/extract-tasks", {
      body: { ...project, content: "- Tarefa 1" },
      headers: identity(),
    });
    expect(response.status).toBe(200);
    expect(extractTasks).toHaveBeenCalledWith(
      expect.objectContaining({ content: "- Tarefa 1", organizationId: ORG }),
    );
  });

  it("extrai o texto da Ata enviada como arquivo", async () => {
    const extractTasks = vi.fn().mockResolvedValue({ tasks: [] });
    const app = appWith({ projectWizardExtraction: { extractTasks } });
    const response = await app.request("https://task.test/task/project-wizard/extract-tasks", {
      method: "POST",
      headers: identity(),
      body: form(new File(["- Tarefa do arquivo"], "ata.txt", { type: "text/plain" })),
    });
    expect(response.status).toBe(200);
    expect(extractTasks).toHaveBeenCalledWith(
      expect.objectContaining({ content: "- Tarefa do arquivo", name: "Projeto" }),
    );
  });

  it("recusa extensão não permitida", async () => {
    const extractTasks = vi.fn();
    const app = appWith({ projectWizardExtraction: { extractTasks } });
    const response = await app.request("https://task.test/task/project-wizard/extract-tasks", {
      method: "POST",
      headers: identity(),
      body: form(new File(["x"], "ata.exe", { type: "application/octet-stream" })),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Tipo de arquivo não permitido.",
    });
    expect(extractTasks).not.toHaveBeenCalled();
  });

  it("recusa arquivo vazio", async () => {
    const app = appWith({ projectWizardExtraction: { extractTasks: vi.fn() } });
    const response = await app.request("https://task.test/task/project-wizard/extract-tasks", {
      method: "POST",
      headers: identity(),
      body: form(new File([], "ata.txt", { type: "text/plain" })),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "O arquivo da Ata é obrigatório e não pode estar vazio.",
    });
  });

  it("limita extrações por usuário com 429 e Retry-After", async () => {
    const extractTasks = vi.fn().mockResolvedValue({ tasks: [] });
    const app = appWith(
      { projectWizardExtraction: { extractTasks } },
      { AI_EXTRACTION_RATE_LIMIT_MAX: "1" },
    );
    const request = () =>
      send(app, "POST", "/task/project-wizard/extract-tasks", {
        body: { ...project, content: "- Tarefa" },
        headers: identity(),
      });
    expect((await request()).status).toBe(200);
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("responde 503 quando a IA não está configurada", async () => {
    const app = appWith({});
    const response = await send(app, "POST", "/task/project-wizard/extract-tasks", {
      body: { ...project, content: "- Tarefa" },
      headers: identity(),
    });
    expect(response.status).toBe(503);
  });
});

describe("POST /task/attachment", () => {
  const pdf = () => new File(["%PDF-1.7 conteúdo"], "comprovante.pdf", { type: "application/pdf" });

  function upload(app: ReturnType<typeof createTaskWorkerApp>, file?: File, taskId = "t1") {
    const data = new FormData();
    data.set("task_id", taskId);
    if (file) data.set("file", file);
    return app.request("https://task.test/task/attachment", {
      method: "POST",
      headers: identity(),
      body: data,
    });
  }

  it("anexa o arquivo validado e responde 201", async () => {
    const service = { upload: vi.fn().mockResolvedValue({ id: "a1" }) };
    const app = appWith({ taskAttachment: service as never });
    const response = await upload(app, pdf());
    expect(response.status).toBe(201);
    expect(service.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        ...who,
        task_id: "t1",
        file: expect.objectContaining({
          mimetype: "application/pdf",
          originalname: "comprovante.pdf",
          buffer: expect.any(Buffer),
        }),
      }),
    );
  });

  it("exige arquivo", async () => {
    const service = { upload: vi.fn() };
    const response = await upload(appWith({ taskAttachment: service as never }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Arquivo é obrigatório." });
  });

  it("recusa tipo não permitido", async () => {
    const service = { upload: vi.fn() };
    const response = await upload(
      appWith({ taskAttachment: service as never }),
      new File(["MZ"], "a.exe", { type: "application/x-msdownload" }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Tipo de arquivo não permitido.",
    });
  });

  it("recusa assinatura que não corresponde ao tipo", async () => {
    const service = { upload: vi.fn() };
    const response = await upload(
      appWith({ taskAttachment: service as never }),
      new File(["não é pdf"], "a.pdf", { type: "application/pdf" }),
    );
    expect(response.status).toBe(400);
    expect(service.upload).not.toHaveBeenCalled();
  });

  it("responde 503 sem Supabase configurado", async () => {
    const response = await upload(appWith({}), pdf());
    expect(response.status).toBe(503);
  });
});

describe("rotas internas de reporting", () => {
  function grantHeaders(
    operation: "catalog" | "extract",
    source: string,
    fields: string[],
    body: unknown,
  ) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      version: 1,
      audience: "task-service",
      operation,
      source,
      organization_id: ORG,
      fields,
      request_id: "req-1",
      issued_at: now,
      expires_at: now + 30,
      body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    };
    const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
    return {
      "x-internal-service-token": "reports-token",
      "x-request-id": "req-1",
      "x-reports-grant": grant,
      "x-reports-grant-signature": createHmac("sha256", "reports-secret")
        .update(grant)
        .digest("hex"),
    };
  }

  it("publica o catálogo com grant válido", async () => {
    const app = appWith({});
    const response = await send(app, "GET", "/internal/reporting/catalog", {
      headers: grantHeaders("catalog", "integracao.catalog", [], {}),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { sources: Array<Record<string, unknown>> } };
    expect(body.data.sources.length).toBeGreaterThan(0);
    expect(body.data.sources[0]).not.toHaveProperty("keys");
  });

  it("recusa o catálogo com token errado", async () => {
    const app = appWith({});
    const response = await send(app, "GET", "/internal/reporting/catalog", {
      headers: {
        ...grantHeaders("catalog", "integracao.catalog", [], {}),
        "x-internal-service-token": "x",
      },
    });
    expect(response.status).toBe(403);
  });

  it("extrai com o organization_id do grant", async () => {
    const extract = vi.fn().mockResolvedValue({ rows: [], reachedLimit: false });
    const app = appWith({ reporting: { extract } });
    const body = { source: "integracao.tasks", fields: ["name"], limit: 10 };
    const response = await send(app, "POST", "/internal/reporting/extract", {
      body,
      headers: grantHeaders("extract", "integracao.tasks", ["name"], body),
    });
    expect(response.status).toBe(200);
    expect(extract).toHaveBeenCalledWith({
      organizationId: ORG,
      source: "integracao.tasks",
      fields: ["name"],
      limit: 10,
    });
  });

  it("recusa extração com grant de outro corpo", async () => {
    const extract = vi.fn();
    const app = appWith({ reporting: { extract } });
    const body = { source: "integracao.tasks", fields: ["name"], limit: 10 };
    const response = await send(app, "POST", "/internal/reporting/extract", {
      body,
      headers: grantHeaders("extract", "integracao.tasks", ["name"], { ...body, limit: 11 }),
    });
    expect(response.status).toBe(403);
    expect(extract).not.toHaveBeenCalled();
  });

  it("responde 503 sem segredos de reporting", async () => {
    const app = appWith({}, { REPORTS_INTERNAL_TOKEN: undefined, REPORTS_GRANT_SECRET: undefined });
    const response = await send(app, "GET", "/internal/reporting/catalog", {
      headers: grantHeaders("catalog", "integracao.catalog", [], {}),
    });
    expect(response.status).toBe(503);
  });
});

describe("rotas internas do commercial", () => {
  const billing = {
    event_id: "c0000000-0000-4000-8000-000000000001",
    event_type: "commercial.task_billing.updated",
    event_version: 1,
    organization_id: ORG,
    task_id: UUID,
    hiring_status: "Não Contratado",
    payment: null,
    billing_description: null,
    audit_correlation_id: "audit-1",
    occurred_at: "2026-09-10T12:00:00.000Z",
  };
  const close = {
    event_id: "10000000-0000-4000-8000-000000000001",
    event_type: "commercial.prospecting.transition",
    event_version: 1,
    organization_id: ORG,
    client_id: UUID,
    prospecting_id: UUID2,
    from_status: "Envio de Proposta",
    to_status: "Fechado",
    status_date: "2026-09-10T12:00:00.000Z",
    description: null,
    audit_correlation_id: "audit-1",
    occurred_at: "2026-09-10T12:00:00.000Z",
  };

  it.each([
    ["/internal/commercial/task-billing", "commercialTaskBilling", billing],
    ["/internal/commercial/prospecting-close", "commercialProspectingClose", close],
  ] as const)("%s aplica o evento com o token do commercial", async (path, service, event) => {
    const apply = vi.fn().mockResolvedValue({ applied: true });
    const app = appWith({ [service]: { apply } });
    const response = await send(app, "POST", path, {
      body: event,
      headers: { "x-internal-service-token": "commercial-token" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: { applied: true } });
    expect(apply).toHaveBeenCalledWith(event);
  });

  it.each([
    ["/internal/commercial/task-billing", "commercialTaskBilling"],
    ["/internal/commercial/prospecting-close", "commercialProspectingClose"],
  ] as const)("%s recusa sem o token", async (path, service) => {
    const apply = vi.fn();
    const app = appWith({ [service]: { apply } });
    const response = await send(app, "POST", path, { body: {} });
    expect(response.status).toBe(403);
    expect(apply).not.toHaveBeenCalled();
  });

  it("valida o evento", async () => {
    const apply = vi.fn();
    const app = appWith({ commercialTaskBilling: { apply } });
    const response = await send(app, "POST", "/internal/commercial/task-billing", {
      body: { ...billing, event_version: 2 },
      headers: { "x-internal-service-token": "commercial-token" },
    });
    expect(response.status).toBe(400);
    expect(apply).not.toHaveBeenCalled();
  });

  it("responde 503 quando o token do commercial não está configurado", async () => {
    const app = appWith({}, { COMMERCIAL_SERVICE_TOKEN: undefined });
    const response = await send(app, "POST", "/internal/commercial/task-billing", {
      body: billing,
    });
    expect(response.status).toBe(503);
  });
});

describe("infraestrutura", () => {
  it("GET /health", async () => {
    const response = await appWith({}).request("https://task.test/health");
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { status: "ok", service: "task-service" },
    });
  });

  it("registra e mascara erro inesperado como 500", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = appWith({
      taskCrud: { listTasks: vi.fn().mockRejectedValue(new Error("boom")) } as never,
    });
    const response = await send(app, "GET", "/task/list", { headers: identity() });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Erro interno no task-service.",
      code: "INTERNAL_ERROR",
    });
    expect(error).toHaveBeenCalledWith(
      "Erro inesperado no task-service",
      expect.objectContaining({ path: "/task/list", message: "boom" }),
    );
    error.mockRestore();
  });

  it("responde 404 no envelope para rota inexistente", async () => {
    const response = await send(appWith({}), "GET", "/task/inexistente", { headers: identity() });
    expect(response.status).toBe(404);
  });
});
