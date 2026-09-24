// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa: campo fora do
// schema do Worker ("Unknown argument"), tabela sem @@map, coluna NOT NULL não preenchida.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectOk,
  requireSmokeState,
  type SmokeResponse,
  smokeCall,
  smokeEnv,
  smokeHeaders,
  smokeInsert,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { createTaskWorkerApp, type TaskWorkerEnv } from "./app.js";

const REPORTS_TOKEN = "crud-smoke-reports-token";
const REPORTS_SECRET = "crud-smoke-reports-grant-secret";
const COMMERCIAL_TOKEN = "crud-smoke-commercial-token";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

/** Grant assinado como o reports-service assina (ver verifyGrant em app.ts). */
async function grantHeaders(input: {
  operation: "catalog" | "extract";
  source: string;
  fields: string[];
  body: unknown;
}): Promise<Record<string, string>> {
  const requestId = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const bodySha = hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(input.body))),
  );
  const grant = Buffer.from(
    canonicalJson({
      version: 1,
      audience: "task-service",
      operation: input.operation,
      source: input.source,
      organization_id: requireSmokeState().organizationId,
      fields: input.fields,
      request_id: requestId,
      issued_at: now,
      expires_at: now + 30,
      body_sha256: bodySha,
    }),
  ).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(REPORTS_SECRET),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  return {
    "x-internal-service-token": REPORTS_TOKEN,
    "x-reports-grant": grant,
    "x-reports-grant-signature": hex(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(grant)),
    ),
    "x-request-id": requestId,
    "content-type": "application/json",
  };
}

describe.skipIf(!smokeState)("task-service CRUD smoke (banco real)", () => {
  // Bindings de outros Workers: o recálculo de progresso do projeto e a auditoria são stubs.
  const env = () =>
    smokeEnv<TaskWorkerEnv>({
      AUDIT_SERVICE: { fetch: async () => Response.json({ success: true }, { status: 201 }) },
      AUDIT_SERVICE_TOKEN: "crud-smoke-audit-token",
      PROJECT_SERVICE: {
        fetch: async () => Response.json({ success: true, data: { project: {} } }),
      },
      COMMERCIAL_SERVICE_TOKEN: COMMERCIAL_TOKEN,
      REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
      REPORTS_GRANT_SECRET: REPORTS_SECRET,
      SUPABASE_URL: "https://supabase.smoke.test",
      SUPABASE_SERVICE_ROLE_KEY: "crud-smoke-service-role",
      AI_EXTRACTION_MODE: "fake",
    } as Partial<TaskWorkerEnv>);
  const app = () => {
    const instance = createTaskWorkerApp({ env: env() });
    // O onError do Worker esconde a causa; aqui ela vem no corpo para o relatório.
    instance.onError((error, c) => {
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      const cause = (error as { cause?: unknown }).cause;
      return c.json(
        {
          success: false,
          error: error.message,
          cause: cause instanceof Error ? cause.message : cause,
        },
        status as 500,
      );
    });
    return instance;
  };
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ) =>
    smokeCall(app(), env(), method, path, body, {
      ...(await smokeHeaders()),
      ...extraHeaders,
    });

  // Cada etapa roda mesmo que a anterior falhe; as falhas saem juntas no fim.
  const failures: string[] = [];
  async function step<T>(name: string, run: () => Promise<T>): Promise<T | undefined> {
    try {
      return await run();
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }
  const ok = (result: SmokeResponse, context: string, allowed?: number[]) =>
    expectOk(result, context, allowed);

  const ctx = {} as {
    clientId: string;
    projectId: string;
    thirdUserId: string;
    modelId?: string;
    model2Id?: string;
    taskId?: string;
  };

  beforeAll(async () => {
    const state = requireSmokeState();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith("https://supabase.smoke.test"))
        throw new Error(`fetch inesperado ${url}`);
      return Response.json({ public: false, Key: "ok", signedURL: "/object/sign/x?token=t" });
    });
    const stamp = Date.now();
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Cliente Smoke Tarefa ${stamp}`,
      status: "Ativo",
    });
    ctx.clientId = client.id as string;
    const project = await smokeInsert("integracao.projects", {
      id: randomUUID(),
      name: `Projeto Smoke Tarefa ${stamp}`,
      client_id: ctx.clientId,
      status: "Em andamento",
      start_date: new Date(),
      porcentage: 0,
    });
    ctx.projectId = project.id as string;
    const third = await smokeInsert("users", {
      id: randomUUID(),
      name: "Responsável Três",
      login: `smoke-task-${stamp}@smoke.local`,
      department_id: state.departmentId,
      // Responsável elegível: admin ou RH >= 3 (taskResponsibleEligibilityWhere).
      type: "admin",
      status: "active",
    });
    ctx.thirdUserId = third.id as string;
  });

  beforeEach(() => {
    failures.length = 0;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("modelos de tarefa: cria, lê, lista, atualiza responsáveis, dependências e exclui", async () => {
    const state = requireSmokeState();
    const stamp = Date.now();
    // buildCreateTaskModelPayload (TaskModelModal)
    const created = await step("POST /task/model", async () =>
      ok(
        await call("POST", "/task/model", {
          name: `Modelo Smoke ${stamp}`,
          department_id: state.departmentId,
          responsible_id: state.ownerId,
          responsible2_id: state.userId,
          responsible3_id: null,
          observations: "Observação do modelo",
          billing: "Não Realizar",
          prevision: 5,
          type: "Projeto",
        }),
        "POST /task/model",
      ),
    );
    ctx.modelId = created?.data?.id ?? created?.data?.create?.id;
    const model2 = await step("POST /task/model (2)", async () =>
      ok(
        await call("POST", "/task/model", {
          name: `Modelo Smoke Dependente ${stamp}`,
          department_id: state.departmentId,
          responsible_id: state.userId,
          responsible2_id: null,
          responsible3_id: null,
          observations: null,
          billing: "Realizar",
          prevision: 2,
          type: "Projeto",
        }),
        "POST /task/model (2)",
      ),
    );
    ctx.model2Id = model2?.data?.id ?? model2?.data?.create?.id;
    const id = ctx.modelId;
    if (!id) {
      expect(failures).toEqual([]);
      return;
    }

    await step("GET /task/model", async () => {
      const detail = ok(await call("GET", `/task/model?task_id=${id}`), "GET /task/model");
      expect(JSON.stringify(detail.data)).toContain(`Modelo Smoke ${stamp}`);
    });
    await step("GET /task/model/list", async () => {
      const list = ok(
        await call(
          "GET",
          `/task/model/list?type=Projeto&search=${encodeURIComponent(`Smoke ${stamp}`)}`,
        ),
        "GET /task/model/list",
      );
      expect(JSON.stringify(list.data)).toContain(id);
      ok(
        await call("GET", "/task/model/list?billing=Realizar&page=1&limit=20"),
        "GET /task/model/list paginado",
      );
    });

    await step("PUT /task/model", async () => {
      ok(
        await call("PUT", "/task/model", {
          task_id: id,
          name: `Modelo Smoke ${stamp} editado`,
          department_id: state.departmentId,
          responsible_id: state.userId,
          responsible2_id: state.ownerId,
          responsible3_id: ctx.thirdUserId,
          observations: "Obs editada",
          billing: "Realizar",
          prevision: 9,
          type: "Projeto",
        }),
        "PUT /task/model",
      );
      const after = ok(await call("GET", `/task/model?task_id=${id}`), "GET após PUT");
      const detail = after.data.detail ?? after.data;
      expect(detail).toMatchObject({
        name: `Modelo Smoke ${stamp} editado`,
        responsible_id: state.userId,
        responsible2_id: state.ownerId,
        responsible3_id: ctx.thirdUserId,
        observations: "Obs editada",
        billing: "Realizar",
        prevision: 9,
        type: "Projeto",
      });
    });

    if (ctx.model2Id) {
      const model2Id = ctx.model2Id;
      await step("dependentes", async () => {
        ok(
          await call("POST", "/task/model/dependent", {
            task_model_id: id,
            dependent_id: model2Id,
            wait: true,
            observation: "Depois do modelo principal",
          }),
          "POST /task/model/dependent",
        );
        const list = ok(
          await call("GET", `/task/model/dependent?task_model_id=${id}`),
          "GET /task/model/dependent",
        );
        const rows = (list.data.dependents ?? list.data) as Array<{ id: string }>;
        const dependentId = JSON.stringify(list.data).match(/"id":"([0-9a-f-]{36})"/u)?.[1];
        expect(rows).toBeTruthy();
        expect(dependentId).toBeTruthy();
        ok(
          await call("DELETE", "/task/model/dependent", { id: dependentId }),
          "DELETE /task/model/dependent",
        );
      });
    }

    await step("integração regularize", async () => {
      const process = await smokeInsert("regularize.process", {
        id: randomUUID(),
        name: `Processo Smoke ${stamp}`,
      }).catch(() => undefined);
      const referring = (process?.id as string | undefined) ?? randomUUID();
      const link = ok(
        await call("POST", "/task/integration", {
          task_model_id: id,
          referring,
          referring_type: "process",
        }),
        "POST /task/integration",
      );
      const list = ok(
        await call("GET", `/task/integration?task_model_id=${id}`),
        "GET /task/integration",
      );
      const integrationId =
        link.data?.id ?? JSON.stringify(list.data).match(/"id":"([0-9a-f-]{36})"/u)?.[1];
      ok(
        await call("DELETE", "/task/integration", { integration_id: integrationId }),
        "DELETE /task/integration",
      );
    });

    await step("GET /task/deps/list", async () => {
      ok(await call("GET", "/task/deps/list"), "GET /task/deps/list");
      ok(
        await call("GET", `/task/deps/options?department_id=${state.departmentId}`),
        "GET /task/deps/options",
      );
    });

    expect(failures).toEqual([]);
  });

  it("tarefas: cria, lista, atualiza, prorroga, conclui, reabre, financeiro e exclui", async () => {
    const state = requireSmokeState();
    const modelId = ctx.modelId;
    expect(modelId).toBeTruthy();
    // buildCreateIntegracaoTaskPayload
    const created = await step("POST /task", async () =>
      ok(
        await call("POST", "/task", {
          model_id: modelId,
          project_id: ctx.projectId,
          client_id: ctx.clientId,
          prospecting_status: "Fechado",
          name: "Tarefa Smoke",
          status: "Em Andamento",
          department_id: state.departmentId,
          observations: "",
          billing: "Realizar",
          urgency: "Normal",
          responsible_id: state.ownerId,
          // Vencida: só tarefa vencida em andamento pode ser prorrogada.
          prevision_date: "2026-09-01",
        }),
        "POST /task",
      ),
    );
    const taskId = (created?.data?.create?.id ?? created?.data?.id) as string | undefined;
    ctx.taskId = taskId;
    if (!taskId) {
      expect(failures).toEqual([]);
      return;
    }

    await step("GET /task/list", async () => {
      // buildIntegracaoTaskListParams
      const list = ok(
        await call(
          "GET",
          `/task/list?status=Todos&ref=&ref_id=&search=&client_id=${ctx.clientId}&page=1&limit=20`,
        ),
        "GET /task/list client",
      );
      expect(JSON.stringify(list.data)).toContain(taskId);
      for (const ref of ["CobrançaComercial", "CobrançaFinanceiro"]) {
        ok(
          await call(
            "GET",
            `/task/list?status=Todos&ref=${encodeURIComponent(ref)}&ref_id=&search=`,
          ),
          `GET /task/list ${ref}`,
        );
      }
      ok(
        await call(
          "GET",
          `/task/list?status=A%20Realizar&ref=&ref_id=&search=Smoke&client_id=${ctx.clientId}&assignment=assigned&page=1&limit=20`,
        ),
        "GET /task/list client/assignment",
      );
      ok(
        await call("GET", "/task/list?status=Todos&ref=&ref_id=&search=&assignment=unassigned"),
        "GET /task/list unassigned",
      );
    });
    await step("GET /task", async () => {
      ok(await call("GET", `/task?task_id=${taskId}`), "GET /task");
    });

    await step("PUT /task", async () => {
      ok(
        await call("PUT", "/task", {
          task_id: taskId,
          name: "Tarefa Smoke editada",
          status: "A Realizar",
          department_id: state.departmentId,
          observations: "obs editada",
          billing: "Não Realizar",
          urgency: "Alta",
          responsible_id: ctx.thirdUserId,
        }),
        "PUT /task",
      );
      const after = ok(await call("GET", `/task?task_id=${taskId}`), "GET após PUT /task");
      const detail = after.data.detail ?? after.data;
      expect(detail).toMatchObject({
        name: "Tarefa Smoke editada",
        status: "A Realizar",
        observations: "obs editada",
        billing: "Não Realizar",
        urgency: "Alta",
        responsible_id: ctx.thirdUserId,
      });
      ok(
        await call("PUT", "/task", {
          task_id: taskId,
          responsible_id: ctx.thirdUserId,
          model_id: modelId,
          status: "Em Andamento",
        }),
        "PUT resp. de volta",
      );
    });

    await step("prorrogação", async () => {
      ok(
        await call("POST", "/task/postponement", {
          task_id: taskId,
          new_prevision_date: "2026-11-30",
          justification: "Cliente pediu mais prazo",
        }),
        "POST /task/postponement",
      );
      const list = ok(
        await call("GET", `/task/postponement/list?task_id=${taskId}`),
        "GET /task/postponement/list",
      );
      expect(JSON.stringify(list.data)).toContain("Cliente pediu mais prazo");
    });

    await step("solicitação de conclusão (cancelar)", async () => {
      ok(
        await call("POST", "/task/complete-request", { task_id: taskId, reason: "feito" }),
        "POST /task/complete-request",
      );
      const list = ok(
        await call("GET", `/task/complete-request/list?task_id=${taskId}`),
        "GET /task/complete-request/list",
      );
      const requestId = JSON.stringify(list.data).match(/"id":"([0-9a-f-]{36})"/u)?.[1];
      ok(
        await call("DELETE", "/task/complete-request", { task_id: taskId, request_id: requestId }),
        "DELETE /task/complete-request",
      );
    });

    await step("solicitação de conclusão (recusar/aprovar)", async () => {
      ok(
        await call("POST", "/task/complete-request", { task_id: taskId, reason: "de novo" }),
        "POST /task/complete-request 2",
      );
      let list = ok(
        await call("GET", `/task/complete-request/list?task_id=${taskId}`),
        "GET list 2",
      );
      let pending = (list.data as Array<{ id: string; status: string }>).find(
        (row) => row.status === "pending",
      );
      ok(
        await call("PUT", "/task/complete-request", {
          task_id: taskId,
          request_id: pending?.id,
          decision: "refused",
          reason: "falta documento",
        }),
        "PUT /task/complete-request refused",
      );
      ok(
        await call("POST", "/task/complete-request", { task_id: taskId, reason: "agora sim" }),
        "POST /task/complete-request 3",
      );
      list = ok(await call("GET", `/task/complete-request/list?task_id=${taskId}`), "GET list 3");
      pending = (list.data as Array<{ id: string; status: string }>).find(
        (row) => row.status === "pending",
      );
      ok(
        await call("PUT", "/task/complete-request", {
          task_id: taskId,
          request_id: pending?.id,
          decision: "approved",
        }),
        "PUT /task/complete-request approved",
      );
      const after = ok(await call("GET", `/task?task_id=${taskId}`), "GET após aprovar");
      expect((after.data.detail ?? after.data).status).toBe("Concluída");
    });

    await step("PUT /task/reopen", async () => {
      ok(
        await call("PUT", "/task/reopen", { task_id: taskId, reason: "reabrindo" }),
        "PUT /task/reopen",
      );
    });

    await step("PUT /task/conclusion", async () => {
      ok(
        await call("PUT", "/task/conclusion", {
          task_id: taskId,
          status: "Concluída",
          end_date: "2026-09-20",
          responsible_id: ctx.thirdUserId,
          responsible2_id: state.userId,
          responsible3_id: null,
          observations: "concluída pelo smoke",
          justification: "",
        }),
        "PUT /task/conclusion",
      );
      // Sem permissionSpecific.task_completion a conclusão vira solicitação (regra de domínio).
      const after = ok(await call("GET", `/task?task_id=${taskId}`), "GET após conclusão");
      const detail = after.data.detail ?? after.data;
      expect(["Concluída", "Em Andamento"]).toContain(detail.status);
      expect(detail.responsible2_id).toBe(state.userId);
    });

    await step("notificações", async () => {
      ok(await call("GET", "/task/notifications"), "GET /task/notifications");
      // As ações do owner acima notificam o responsável (createMany real).
      const asResponsible = await smokeHeaders({ userId: ctx.thirdUserId, type: "admin" });
      const list = ok(
        await call("GET", "/task/notifications", undefined, asResponsible),
        "GET /task/notifications (responsável)",
      );
      const notificationId = list.data.items?.[0]?.id as string | undefined;
      expect(notificationId).toBeTruthy();
      ok(
        await call(
          "PUT",
          "/task/notifications/read",
          { notification_id: notificationId },
          asResponsible,
        ),
        "PUT /task/notifications/read",
      );
      const after = ok(
        await call("GET", "/task/notifications", undefined, asResponsible),
        "GET após ler",
      );
      expect(after.data.unread_count).toBe(list.data.unread_count - 1);
    });

    await step("anexos (Storage stub)", async () => {
      const form = new FormData();
      form.append("task_id", taskId);
      form.append(
        "file",
        new File(
          [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])],
          "a.pdf",
          {
            type: "application/pdf",
          },
        ),
      );
      const headers = await smokeHeaders();
      delete (headers as Record<string, string | undefined>)["content-type"];
      const response = await app().request(
        "https://smoke.test/task/attachment",
        { method: "POST", headers, body: form },
        env(),
      );
      const text = await response.text();
      if (response.status !== 201)
        throw new Error(`POST /task/attachment: HTTP ${response.status} ${text}`);
      const list = ok(
        await call("GET", `/task/attachment/list?task_id=${taskId}`),
        "GET /task/attachment/list",
      );
      const attachmentId = JSON.stringify(list.data).match(/"id":"([0-9a-f-]{36})"/u)?.[1];
      ok(
        await call(
          "GET",
          `/task/attachment/access?task_id=${taskId}&attachment_id=${attachmentId}`,
        ),
        "GET /task/attachment/access",
      );
      ok(
        await call("DELETE", "/task/attachment", { task_id: taskId, attachment_id: attachmentId }),
        "DELETE /task/attachment",
      );
    });

    await step("financeiro", async () => {
      ok(
        await call("PUT", "/task/financeiro/collectors", {
          department_id: state.departmentId,
          collector_ids: [state.ownerId],
        }),
        "PUT /task/financeiro/collectors",
      );
      const collectors = ok(
        await call("GET", `/task/financeiro/collectors?department_id=${state.departmentId}`),
        "GET /task/financeiro/collectors",
      );
      expect(JSON.stringify(collectors.data)).toContain(state.ownerId);
      ok(
        await call("GET", `/task/financeiro/queue?department_id=${state.departmentId}`),
        "GET /task/financeiro/queue",
      );
      ok(
        await call("GET", `/task/financeiro/queue?client_id=${ctx.clientId}`),
        "GET /task/financeiro/queue client",
      );
      // A tarefa está concluída com cobrança; os 4xx de domínio (nada a baixar) são aceitos.
      ok(
        await call(
          "PUT",
          "/task/financeiro",
          { task_id: taskId },
          {
            "Idempotency-Key": randomUUID(),
          },
        ),
        "PUT /task/financeiro",
        [200, 201, 400, 404, 409, 422],
      );
      ok(
        await call(
          "POST",
          "/task/financeiro/settle",
          { task_ids: [taskId] },
          {
            "Idempotency-Key": randomUUID(),
          },
        ),
        "POST /task/financeiro/settle",
        [200, 201, 400, 404, 409, 422],
      );
      ok(
        await call(
          "POST",
          "/task/financeiro/express",
          { client_id: ctx.clientId },
          {
            "Idempotency-Key": randomUUID(),
          },
        ),
        "POST /task/financeiro/express",
        [200, 201, 400, 404, 409, 422],
      );
    });

    expect(failures).toEqual([]);
  });

  it("planos de projeto e assistente de projeto", async () => {
    const state = requireSmokeState();
    const modelId = ctx.modelId;
    expect(modelId).toBeTruthy();
    const stamp = Date.now();
    const plan = await step("POST /task/project-plan", async () =>
      ok(
        await call("POST", "/task/project-plan", {
          name: `Plano Smoke ${stamp}`,
          color: "#1E88E5",
        }),
        "POST /task/project-plan",
      ),
    );
    const planId = (plan?.data?.id ?? plan?.data?.create?.id) as string | undefined;
    if (planId) {
      await step("plano CRUD", async () => {
        const list = ok(
          await call("GET", "/task/project-plan/list"),
          "GET /task/project-plan/list",
        );
        expect(JSON.stringify(list.data)).toContain(planId);
        ok(
          await call("PUT", "/task/project-plan", {
            id: planId,
            name: `Plano Smoke ${stamp} editado`,
            color: "#43A047",
          }),
          "PUT /task/project-plan",
        );
        const detail = ok(
          await call("GET", `/task/project-plan?plan_id=${planId}`),
          "GET /task/project-plan",
        );
        expect(JSON.stringify(detail.data)).toContain("editado");
        expect(JSON.stringify(detail.data)).toContain("#43A047");
        ok(
          await call("POST", "/task/project-plan/task", { plan_id: planId, task_id: modelId }),
          "POST /task/project-plan/task",
        );
        if (ctx.model2Id) {
          ok(
            await call("POST", "/task/project-plan/task", {
              plan_id: planId,
              task_id: ctx.model2Id,
            }),
            "POST /task/project-plan/task 2",
          );
        }
        const tasks = ok(
          await call("GET", `/task/project-plan/task/list?plan_id=${planId}`),
          "GET /task/project-plan/task/list",
        );
        const planTaskIds = [
          ...JSON.stringify(tasks.data).matchAll(/"id":"([0-9a-f-]{36})"/gu),
        ].map((match) => match[1]);
        const planTaskId = (tasks.data as Array<{ id: string }>)[0]?.id ?? planTaskIds[0];
        ok(
          await call("PUT", "/task/project-plan/task", {
            plan_id: planId,
            plan_task_id: planTaskId,
            direction: "down",
          }),
          "PUT /task/project-plan/task",
          [200, 400, 409],
        );
        const hire = await smokeInsert("integracao.projects", {
          id: randomUUID(),
          name: `Projeto Contratação ${stamp}`,
          client_id: ctx.clientId,
          status: "Em andamento",
          start_date: new Date(),
          porcentage: 0,
        });
        ok(
          await call("POST", "/task/project-plan/hire", { project_id: hire.id, plan_id: planId }),
          "POST /task/project-plan/hire",
        );
        ok(
          await call("DELETE", "/task/project-plan/task", {
            plan_id: planId,
            plan_task_id: planTaskId,
          }),
          "DELETE /task/project-plan/task",
        );
        ok(
          await call("DELETE", "/task/project-plan", { id: planId }),
          "DELETE plano contratado",
          [200, 409],
        );
        const spare = ok(
          await call("POST", "/task/project-plan", {
            name: `Plano Avulso ${stamp}`,
            color: "#000",
          }),
          "POST /task/project-plan avulso",
        );
        const spareId = spare.data.id ?? spare.data.create?.id;
        ok(
          await call("DELETE", "/task/project-plan", { id: spareId }),
          "DELETE /task/project-plan",
        );
        expect((await call("GET", `/task/project-plan?plan_id=${spareId}`)).status).toBe(404);
      });
    }

    await step("assistente de projeto", async () => {
      const tasks = [
        {
          name: "Levantar documentos",
          department_id: state.departmentId,
          model_id: modelId,
          prevision_date: "2026-10-10",
          responsible_id: state.ownerId,
        },
      ];
      const preview = ok(
        await call("POST", "/task/project-wizard/preview", { tasks }),
        "POST /task/project-wizard/preview",
      );
      const revision = (preview.data.revision ?? JSON.stringify(preview.data)) as string;
      ok(
        await call(
          "POST",
          "/task/project-wizard",
          {
            client_id: ctx.clientId,
            name: `Projeto Assistente ${stamp}`,
            start_date: "2026-09-23",
            objective: "Objetivo do assistente",
            end_date: "2026-12-20",
            tasks,
            revision,
          },
          { "Idempotency-Key": randomUUID() },
        ),
        "POST /task/project-wizard",
      );
      ok(
        await call("POST", "/task/project-wizard/extract-tasks", {
          content: "Ata: levantar documentos do cliente até sexta.",
          name: `Projeto Ata ${stamp}`,
          start_date: "2026-09-23",
          objective: "Objetivo da ata",
        }),
        "POST /task/project-wizard/extract-tasks",
      );
    });

    expect(failures).toEqual([]);
  });

  it("rotas internas: relatórios, cobrança comercial, fechamento de prospecção e exclusão", async () => {
    const state = requireSmokeState();
    await step("relatórios", async () => {
      ok(
        await call(
          "GET",
          "/internal/reporting/catalog",
          undefined,
          await grantHeaders({
            operation: "catalog",
            source: "integracao.catalog",
            fields: [],
            body: {},
          }),
        ),
        "GET /internal/reporting/catalog",
      );
      const fields = [
        "name",
        "status",
        "department",
        "billing",
        "urgency",
        "start_date",
        "prevision_date",
        "end_date",
        "date_created",
        "date_updated",
        "pending_approval",
        "charge_comercial",
        "charge_financeiro",
      ];
      const body = { source: "integracao.tasks", fields, limit: 50 };
      ok(
        await call(
          "POST",
          "/internal/reporting/extract",
          body,
          await grantHeaders({ operation: "extract", source: body.source, fields, body }),
        ),
        "POST /internal/reporting/extract",
      );
    });

    const internal = {
      "x-internal-service-token": COMMERCIAL_TOKEN,
      "content-type": "application/json",
    };
    if (ctx.taskId) {
      const taskId = ctx.taskId;
      await step("POST /internal/commercial/task-billing", async () => {
        ok(
          await call(
            "POST",
            "/internal/commercial/task-billing",
            {
              event_id: randomUUID(),
              event_type: "commercial.task_billing.updated",
              event_version: 1,
              organization_id: state.organizationId,
              task_id: taskId,
              hiring_status: "Contratado",
              payment: "À vista",
              billing_description: "Cobrança smoke",
              audit_correlation_id: randomUUID(),
              occurred_at: new Date().toISOString(),
            },
            internal,
          ),
          "POST /internal/commercial/task-billing",
        );
        // "Contratado" liga charge_financeiro: agora a baixa financeira grava de verdade.
        const queue = ok(
          await call("GET", `/task/financeiro/queue?client_id=${ctx.clientId}`),
          "GET /task/financeiro/queue pendente",
        );
        expect(JSON.stringify(queue.data)).toContain(taskId);
        const settled = ok(
          await call(
            "PUT",
            "/task/financeiro",
            { task_id: taskId },
            {
              "Idempotency-Key": randomUUID(),
            },
          ),
          "PUT /task/financeiro pendente",
        );
        expect(settled.data.settled).toBe(1);
        ok(
          await call(
            "POST",
            "/task/financeiro/express",
            { client_id: ctx.clientId },
            {
              "Idempotency-Key": randomUUID(),
            },
          ),
          "POST /task/financeiro/express sem pendência",
          [200, 400],
        );
      });
    }
    await step("POST /internal/commercial/prospecting-close", async () => {
      ok(
        await call(
          "POST",
          "/internal/commercial/prospecting-close",
          {
            event_id: randomUUID(),
            event_type: "commercial.prospecting.transition",
            event_version: 1,
            organization_id: state.organizationId,
            client_id: ctx.clientId,
            prospecting_id: randomUUID(),
            from_status: "Envio de Proposta",
            to_status: "Fechado",
            status_date: new Date().toISOString(),
            description: "Fechado pelo smoke",
            audit_correlation_id: randomUUID(),
            occurred_at: new Date().toISOString(),
          },
          internal,
        ),
        "POST /internal/commercial/prospecting-close",
      );
    });

    if (ctx.taskId) {
      const taskId = ctx.taskId;
      await step("DELETE /task", async () => {
        // A tarefa usada acima tem anexos/prorrogações: exclusão bloqueada é regra de domínio.
        ok(
          await call("DELETE", "/task", { task_id: taskId }),
          "DELETE /task com vínculos",
          [200, 409],
        );
        const fresh = ok(
          await call("POST", "/task", {
            model_id: ctx.model2Id ?? ctx.modelId,
            project_id: ctx.projectId,
            client_id: ctx.clientId,
            prospecting_status: "Fechado",
            department_id: state.departmentId,
            observations: "",
            urgency: "Normal",
            responsible_id: state.ownerId,
          }),
          "POST /task (para excluir)",
        );
        const freshId = fresh.data.create?.id ?? fresh.data.id;
        ok(await call("DELETE", "/task", { task_id: freshId }), "DELETE /task");
        expect((await call("GET", `/task?task_id=${freshId}`)).status).toBe(404);
      });
    }
    if (ctx.model2Id) {
      const model2Id = ctx.model2Id;
      await step("DELETE /task/model", async () => {
        ok(
          await call("DELETE", "/task/model", { task_id: model2Id }),
          "DELETE modelo usado",
          [200, 409],
        );
        const spare = ok(
          await call("POST", "/task/model", {
            name: `Modelo Avulso ${Date.now()}`,
            department_id: state.departmentId,
            responsible_id: state.ownerId,
            responsible2_id: null,
            responsible3_id: null,
            observations: null,
            billing: "Realizar",
            prevision: 1,
            type: "Projeto",
          }),
          "POST /task/model avulso",
        );
        const spareId = spare.data.id ?? spare.data.create?.id;
        ok(await call("DELETE", "/task/model", { task_id: spareId }), "DELETE /task/model");
        expect((await call("GET", `/task/model?task_id=${spareId}`)).status).toBe(404);
      });
    }
    expect(failures).toEqual([]);
  });
});
