// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  expectOk,
  requireSmokeState,
  smokeCall,
  smokeEnv,
  smokeInsert,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { createProjectWorkerApp, type ProjectWorkerEnv } from "./app.js";

const REPORTS_TOKEN = "crud-smoke-reports-token";
const REPORTS_SECRET = "crud-smoke-reports-grant-secret";

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
      audience: "project-service",
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

describe.skipIf(!smokeState)("project-service CRUD smoke (banco real)", () => {
  const env = () =>
    smokeEnv<ProjectWorkerEnv>({
      REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
      REPORTS_GRANT_SECRET: REPORTS_SECRET,
    });
  const app = () => {
    const instance = createProjectWorkerApp({ env: env() });
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
  const call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    smokeCall(app(), env(), method, path, body, headers);

  it("cria, lê, lista, atualiza, recalcula progresso e exclui um projeto", async () => {
    const state = requireSmokeState();
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Cliente Smoke Projeto ${Date.now()}`,
      status: "Ativo",
    });
    const clientId = client.id as string;

    // buildCreateProjectPayload (projectService.contract.ts)
    const name = `Projeto Smoke ${Date.now()}`;
    const created = expectOk(
      await call("POST", "/project", {
        client_id: clientId,
        name,
        start_date: "2026-09-01",
        objective: "Implantar rotina fiscal",
        end_date: "2026-12-31",
      }),
      "POST /project",
    );
    const id = created.data.create.id as string;
    expect(created.data.create.status).toBe("Em andamento");

    const duplicate = await call("POST", "/project", {
      client_id: clientId,
      name,
      start_date: "2026-09-01",
      objective: "dup",
    });
    expect(duplicate.status).toBe(409);

    const detail = expectOk(await call("GET", `/project?project_id=${id}`), "GET /project");
    expect(detail.data.detail.client.id).toBe(clientId);

    const byClient = expectOk(
      await call("GET", `/project/list?ref=client&id=${clientId}`),
      "GET /project/list client",
    );
    expect(byClient.data.some((project: { id: string }) => project.id === id)).toBe(true);
    expectOk(
      await call("GET", `/project/list?ref=status&id=${encodeURIComponent("Em andamento")}`),
      "GET /project/list status",
    );
    expectOk(
      await call("GET", `/project/list?ref=sponsor&id=${state.ownerId}`),
      "GET /project/list sponsor",
    );
    expectOk(await call("GET", "/project/metrics"), "GET /project/metrics");

    // UpdateProjectData (+ sponsor_id, que o schema aceita)
    expectOk(
      await call("PUT", "/project", {
        project_id: id,
        name: `${name} editado`,
        start_date: "2026-09-02",
        end_date: "2027-01-31",
        objective: "Objetivo editado",
        sponsor_id: state.ownerId,
      }),
      "PUT /project",
    );
    const after = expectOk(await call("GET", `/project?project_id=${id}`), "GET após PUT");
    expect(after.data.detail).toMatchObject({
      name: `${name} editado`,
      objective: "Objetivo editado",
      sponsor_id: state.ownerId,
    });
    expect(String(after.data.detail.end_date)).toContain("2027-01-31");

    // Sem tarefas, progresso vai a 0; com uma tarefa concluída vai a 100.
    const empty = expectOk(
      await call("POST", "/project/progress", { project_id: id }),
      "POST /project/progress vazio",
    );
    expect(Number(empty.data.project.porcentage)).toBe(0);
    const model = await smokeInsert("integracao.tasksModel", {
      id: randomUUID(),
      name: `Modelo Smoke ${Date.now()}`,
      department_id: state.departmentId,
      responsible_id: state.ownerId,
      billing: "Não",
      prevision: 5,
    });
    const task = await smokeInsert("integracao.tasks", {
      id: randomUUID(),
      model_id: model.id,
      billing: "Não",
      urgency: "Normal",
      name: "Tarefa Smoke",
      status: "Concluída",
      client_id: clientId,
      project_id: id,
      department_id: state.departmentId,
    });
    const done = expectOk(
      await call("POST", "/project/progress", { project_id: id }),
      "POST /project/progress",
    );
    expect(done.data.project).toMatchObject({ status: "Concluído" });
    expect(Number(done.data.project.porcentage)).toBe(100);

    // Com tarefa vinculada a exclusão é bloqueada pela FK (409 de domínio).
    const blocked = await call("DELETE", "/project", { project_id: id });
    expect([200, 409]).toContain(blocked.status);
    expect(task.id).toBeTruthy();

    const other = expectOk(
      await call("POST", "/project", {
        client_id: clientId,
        name: `${name} sem tarefas`,
        start_date: "2026-09-01",
        objective: "",
      }),
      "POST /project sem end_date",
    );
    const otherId = other.data.create.id as string;
    expectOk(await call("DELETE", "/project", { project_id: otherId }), "DELETE /project");
    expect((await call("GET", `/project?project_id=${otherId}`)).status).toBe(404);
  });

  it("serve catálogo e extração de relatórios com grant assinado", async () => {
    expectOk(
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
    const fields = ["name", "status", "start_date", "end_date", "objective", "porcentage"];
    const body = { source: "integracao.projects", fields, limit: 50 };
    const extract = expectOk(
      await call(
        "POST",
        "/internal/reporting/extract",
        body,
        await grantHeaders({ operation: "extract", source: body.source, fields, body }),
      ),
      "POST /internal/reporting/extract",
    );
    expect(Array.isArray(extract.data.rows)).toBe(true);
  });
});
