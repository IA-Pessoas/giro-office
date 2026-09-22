import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashCsrfToken } from "@workspace/runtime";
import {
  FORWARDED_AUTH_CSRF_HASH_HEADER,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_SESSION_ID_HEADER,
  FORWARDED_AUTH_SESSION_VERSION_HEADER,
  REQUEST_ID_HEADER,
} from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createProjectWorkerApp, type ProjectWorkerEnv } from "./app.js";

const TOKEN = "project-internal-token";
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function env(): ProjectWorkerEnv {
  return {
    JWT_SECRET: "project-secret",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    REPORTS_INTERNAL_TOKEN: "reports-token",
    REPORTS_GRANT_SECRET: "reports-grant-secret",
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}
function headers(modules: Record<string, number> = { integracao: 3 }): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "x-auth-organization-id": ORG,
    "x-auth-kind": "organization",
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify(modules),
  };
}
function service() {
  return {
    list: vi.fn(async () => []),
    detail: vi.fn(async () => ({ detail: {} })),
    create: vi.fn(async () => ({ create: {} })),
    update: vi.fn(async () => ({ id: "project-id" })),
    delete: vi.fn(async () => ({ response: { id: "project-id" } })),
  };
}

const PROJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CLIENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function jsonHeaders(extra: HeadersInit = {}): Headers {
  const result = new Headers(headers());
  result.set("content-type", "application/json");
  for (const [key, value] of Object.entries(extra)) result.set(key, value);
  return result;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function base64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function reportHeaders(
  operation: "catalog" | "extract",
  body: unknown,
  fields: string[],
): Promise<Headers> {
  const requestId = crypto.randomUUID();
  const payload = {
    version: 1,
    audience: "project-service",
    operation,
    source: operation === "catalog" ? "integracao.catalog" : "integracao.projects",
    organization_id: ORG,
    fields,
    request_id: requestId,
    issued_at: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 30,
    body_sha256: await sha256(canonicalJson(body)),
  };
  const grant = base64Url(new TextEncoder().encode(canonicalJson(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env().REPORTS_GRANT_SECRET),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(grant)),
  );
  const signature = Array.from(signatureBytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return new Headers({
    "x-internal-service-token": env().REPORTS_INTERNAL_TOKEN,
    [REQUEST_ID_HEADER]: requestId,
    "x-reports-grant": grant,
    "x-reports-grant-signature": signature,
  });
}

describe("project Worker", () => {
  it("returns health and ready", async () => {
    const app = createProjectWorkerApp({ env: env(), projectService: service() });
    expect((await app.request("https://project.test/health")).status).toBe(200);
    expect((await app.request("https://project.test/ready")).status).toBe(200);
  });
  it("requires auth and forwards organization scope", async () => {
    const projectService = service();
    const app = createProjectWorkerApp({ env: env(), projectService });
    expect(
      (
        await app.request(
          "https://project.test/project/list?ref=client&id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        )
      ).status,
    ).toBe(401);
    const response = await app.request(
      "https://project.test/project/list?ref=client&id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      { headers: headers() },
    );
    expect(response.status).toBe(200);
    expect(projectService.list).toHaveBeenCalledWith("client", USER_ID, ORG, expect.any(Object));
  });

  it("returns 503 when no Hyperdrive binding or DATABASE_URL is configured", async () => {
    const { HYPERDRIVE: _hyperdrive, ...withoutDatabase } = env();
    const app = createProjectWorkerApp({ env: withoutDatabase });

    const response = await app.request(
      `https://project.test/project/list?ref=client&id=${CLIENT_ID}`,
      { headers: headers() },
    );

    expect(response.status).toBe(503);
  });

  it("keeps the Worker schema aligned with canonical project detail fields and relations", () => {
    const workerSchema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const canonicalSchema = readFileSync(
      resolve(process.cwd(), "../../infra/prisma/schema.prisma"),
      "utf8",
    );

    expect(canonicalSchema).toContain("name             String");
    expect(canonicalSchema).toContain("taskModel           TaskModel");
    expect(workerSchema).toContain("name");
    expect(workerSchema).toContain("company_name");
    expect(workerSchema).toContain("fantasy_name");
    expect(workerSchema).toContain("taskModel");
    expect(workerSchema).toContain("department");
  });

  it("returns canonical client and task relations in project detail", async () => {
    const findFirst = vi.fn(async () => ({
      id: PROJECT_ID,
      name: "Implantação",
      client_id: CLIENT_ID,
      status: "Em andamento",
      start_date: null,
      end_date: null,
      objective: "Automatizar fluxo",
      sponsor_id: null,
      porcentage: 0,
      client: { id: CLIENT_ID, name: "Cliente A", company_name: null, fantasy_name: null },
      tasks: [
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          name: "Tarefa A",
          status: "A Realizar",
          observations: null,
          model_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          client_id: CLIENT_ID,
          project_id: PROJECT_ID,
          department: { id: "11111111-1111-4111-8111-111111111111", name: "Operações" },
          taskModel: {
            id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            name: "Modelo A",
            department: { id: "11111111-1111-4111-8111-111111111111", name: "Operações" },
          },
        },
      ],
    }));
    const app = createProjectWorkerApp({
      env: env(),
      prisma: {
        project: { findFirst },
        client: { findFirst: vi.fn(), update: vi.fn() },
        task: { findMany: vi.fn(), groupBy: vi.fn() },
        $transaction: vi.fn(),
        $disconnect: vi.fn(async () => undefined),
      } as never,
    });

    const response = await app.request(`https://project.test/project?project_id=${PROJECT_ID}`, {
      headers: headers(),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data.detail).toMatchObject({
      client: { name: "Cliente A" },
      tasks: [{ name: "Tarefa A", model: { name: "Modelo A" } }],
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          client: expect.objectContaining({ select: expect.objectContaining({ name: true }) }),
          tasks: expect.objectContaining({ select: expect.objectContaining({ name: true }) }),
        }),
      }),
    );
  });

  it("preserves the complete CRUD contract and auth claims", async () => {
    const projectService = service();
    const app = createProjectWorkerApp({ env: env(), projectService });
    const createBody = {
      name: "Implantação",
      client_id: CLIENT_ID,
      start_date: "2026-04-02T00:00:00.000Z",
      objective: "Automatizar fluxo",
    };

    expect(
      (
        await app.request("https://project.test/project", {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify(createBody),
        })
      ).status,
    ).toBe(201);
    expect(projectService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ...createBody,
        start_date: new Date(createBody.start_date),
        userId: USER_ID,
        organizationId: ORG,
        integracaoLevel: 3,
        isOwner: false,
      }),
    );

    expect(
      (
        await app.request(`https://project.test/project?project_id=${PROJECT_ID}`, {
          method: "PUT",
          headers: jsonHeaders(),
          body: JSON.stringify({
            project_id: PROJECT_ID,
            name: "Implantação 2",
            start_date: "2026-04-02T00:00:00.000Z",
            end_date: "2026-05-10T00:00:00.000Z",
            objective: "Concluir rollout",
          }),
        })
      ).status,
    ).toBe(200);
    expect(projectService.update).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: PROJECT_ID, organizationId: ORG, integracaoLevel: 3 }),
    );

    expect(
      (
        await app.request(`https://project.test/project?project_id=${PROJECT_ID}`, {
          method: "DELETE",
          headers: jsonHeaders(),
          body: JSON.stringify({ project_id: PROJECT_ID }),
        })
      ).status,
    ).toBe(200);
    expect(projectService.delete).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: PROJECT_ID, organizationId: ORG, integracaoLevel: 3 }),
    );
  });

  it("maps a concurrent project creation conflict to 409", async () => {
    const project = {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: PROJECT_ID })),
    };
    const client = { findFirst: vi.fn(async () => ({ id: CLIENT_ID })) };
    const prisma = {
      project: { ...project, findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
      client: { ...client, update: vi.fn() },
      task: { findMany: vi.fn(), groupBy: vi.fn() },
      $transaction: vi.fn(async () => {
        throw { code: "P2034" };
      }),
      $disconnect: vi.fn(async () => undefined),
    };
    const app = createProjectWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request("https://project.test/project", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        name: "Implantação",
        client_id: CLIENT_ID,
        start_date: "2026-04-02T00:00:00.000Z",
        objective: "Automatizar fluxo",
      }),
    });

    expect(response.status).toBe(409);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("enforces module permission before dispatching project reads", async () => {
    const projectFindMany = vi.fn(async () => []);
    const app = createProjectWorkerApp({
      env: env(),
      prisma: {
        project: { findMany: projectFindMany },
        client: { findFirst: vi.fn(), update: vi.fn() },
        task: { findMany: vi.fn(), groupBy: vi.fn() },
        $transaction: vi.fn(),
        $disconnect: vi.fn(async () => undefined),
      } as never,
    });
    const response = await app.request(
      `https://project.test/project/list?ref=client&id=${CLIENT_ID}`,
      { headers: headers({ integracao: 0 }) },
    );

    expect(response.status).toBe(403);
    expect(projectFindMany).not.toHaveBeenCalled();
  });

  it("keeps resource authorization after organization scoping", async () => {
    const projectFindFirst = vi.fn(async () => ({ id: PROJECT_ID }));
    const app = createProjectWorkerApp({
      env: env(),
      prisma: {
        project: { findFirst: projectFindFirst },
        client: { findFirst: vi.fn(), update: vi.fn() },
        task: { findMany: vi.fn(), groupBy: vi.fn() },
        $transaction: vi.fn(),
        $disconnect: vi.fn(async () => undefined),
      } as never,
    });

    const response = await app.request(`https://project.test/project?project_id=${PROJECT_ID}`, {
      headers: headers({ integracao: 0 }),
    });

    expect(response.status).toBe(403);
    expect(projectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PROJECT_ID, organization_id: ORG } }),
    );
  });

  it("rejects invalid JSON and invalid CSRF for browser sessions", async () => {
    const projectService = service();
    const app = createProjectWorkerApp({ env: env(), projectService });
    const invalidJson = await app.request("https://project.test/project", {
      method: "POST",
      headers: jsonHeaders(),
      body: "{",
    });
    expect(invalidJson.status).toBe(400);

    const csrfHash = await hashCsrfToken("valid-csrf-token");
    const invalidCsrfHeaders = new Headers(jsonHeaders());
    invalidCsrfHeaders.set("cookie", "cw.session=session; cw.csrf=wrong-token");
    invalidCsrfHeaders.set(FORWARDED_AUTH_CSRF_HASH_HEADER, csrfHash);
    const invalidCsrf = await app.request("https://project.test/project", {
      method: "POST",
      headers: invalidCsrfHeaders,
      body: JSON.stringify({
        name: "Implantação",
        client_id: CLIENT_ID,
        start_date: "2026-04-02T00:00:00.000Z",
        objective: "Automatizar fluxo",
      }),
    });
    expect(invalidCsrf.status).toBe(403);
  });

  it("validates a browser session through USER_SERVICE after CSRF", async () => {
    const projectService = service();
    const userService = {
      fetch: vi.fn(async (request: Request) => {
        expect(new URL(request.url).pathname).toBe("/user/session/validate");
        expect(request.headers.get("authorization")).toBe("Bearer session");
        return new Response(null, { status: 204 });
      }),
    };
    const app = createProjectWorkerApp({
      env: { ...env(), USER_SERVICE: userService, USER_SERVICE_INTERNAL_TOKEN: "user-token" },
      projectService,
    });
    const csrfToken = "A".repeat(43);
    const sessionHeaders = new Headers(jsonHeaders());
    sessionHeaders.set("cookie", `cw.session=session; cw.csrf=${csrfToken}`);
    sessionHeaders.set("x-csrf-token", csrfToken);
    sessionHeaders.set(FORWARDED_AUTH_CSRF_HASH_HEADER, await hashCsrfToken(csrfToken));
    sessionHeaders.set(FORWARDED_AUTH_SESSION_ID_HEADER, "session-id");
    sessionHeaders.set(FORWARDED_AUTH_SESSION_VERSION_HEADER, "1");

    const response = await app.request("https://project.test/project", {
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify({
        name: "Implantação",
        client_id: CLIENT_ID,
        start_date: "2026-04-02T00:00:00.000Z",
        objective: "Automatizar fluxo",
      }),
    });

    expect(response.status).toBe(201);
    expect(userService.fetch).toHaveBeenCalledOnce();
  });

  it("accepts DELETE project_id from the query with an empty JSON body", async () => {
    const projectService = service();
    const app = createProjectWorkerApp({ env: env(), projectService });
    const response = await app.request(`https://project.test/project?project_id=${PROJECT_ID}`, {
      method: "DELETE",
      headers: { ...headers(), "content-type": "application/json" },
    });

    expect(response.status).toBe(200);
    expect(projectService.delete).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: PROJECT_ID }),
    );
  });

  it("exposes metrics and progress with organization and module claims", async () => {
    const metricsService = { getGlobalMetrics: vi.fn(async () => ({ total: 1 })) };
    const progressService = { recalculateFromTasks: vi.fn(async () => ({ project: {} })) };
    const app = createProjectWorkerApp({ env: env(), metricsService, progressService });

    expect(
      (await app.request("https://project.test/project/metrics", { headers: headers() })).status,
    ).toBe(200);
    expect(metricsService.getGlobalMetrics).toHaveBeenCalledWith(ORG, {
      userId: USER_ID,
      integracaoLevel: 3,
      isOwner: false,
    });

    const progress = await app.request("https://project.test/project/progress", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ project_id: PROJECT_ID }),
    });
    expect(progress.status).toBe(200);
    expect(progressService.recalculateFromTasks).toHaveBeenCalledWith(PROJECT_ID, ORG, {
      userId: USER_ID,
      integracaoLevel: 3,
      isOwner: false,
    });
  });

  it("protects internal reporting with canonical grants and forwards the grant scope", async () => {
    const reportingService = {
      extract: vi.fn(async () => ({ rows: [{ name: "Implantação" }], reachedLimit: false })),
    };
    const app = createProjectWorkerApp({ env: env(), reportingService });
    const catalogHeaders = await reportHeaders("catalog", {}, []);
    const catalog = await app.request("https://project.test/internal/reporting/catalog", {
      headers: catalogHeaders,
    });
    expect(catalog.status).toBe(200);
    expect((await catalog.json()).data.sources[0].key).toBe("integracao.projects");

    const body = { source: "integracao.projects", fields: ["name"], limit: 10 };
    const extractHeaders = await reportHeaders("extract", body, ["name"]);
    const extract = await app.request("https://project.test/internal/reporting/extract", {
      method: "POST",
      headers: new Headers({
        ...Object.fromEntries(extractHeaders),
        "content-type": "application/json",
      }),
      body: JSON.stringify(body),
    });
    expect(extract.status).toBe(200);
    expect(reportingService.extract).toHaveBeenCalledWith({
      organizationId: ORG,
      source: "integracao.projects",
      fields: ["name"],
      limit: 10,
    });

    const invalidHeaders = new Headers(catalogHeaders);
    invalidHeaders.set("x-reports-grant-signature", "0".repeat(64));
    expect(
      (
        await app.request("https://project.test/internal/reporting/catalog", {
          headers: invalidHeaders,
        })
      ).status,
    ).toBe(403);
  });

  it("creates through a scoped transaction and records best-effort audit", async () => {
    const project = {
      findFirst: vi.fn(async (args: { where: Record<string, unknown> }) =>
        args.where.name ? null : { id: PROJECT_ID, client_id: CLIENT_ID, status: "Em andamento" },
      ),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: PROJECT_ID,
        ...args.data,
      })),
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({ id: PROJECT_ID })),
      delete: vi.fn(async () => ({ id: PROJECT_ID })),
    };
    const client = {
      findFirst: vi.fn(async () => ({ id: CLIENT_ID })),
      update: vi.fn(async () => ({ id: CLIENT_ID })),
    };
    const prisma = {
      project,
      client,
      task: { findMany: vi.fn(async () => []), groupBy: vi.fn(async () => []) },
      $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({ project, client }),
      ),
      $disconnect: vi.fn(async () => undefined),
    };
    const audit = { fetch: vi.fn(async () => new Response(null, { status: 201 })) };
    const app = createProjectWorkerApp({
      env: { ...env(), AUDIT_SERVICE: audit, AUDIT_SERVICE_TOKEN: "audit-token" },
      prisma: prisma as never,
    });
    const response = await app.request("https://project.test/project", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        name: "Implantação",
        client_id: CLIENT_ID,
        start_date: "2026-04-02T00:00:00.000Z",
        objective: "Automatizar fluxo",
      }),
    });

    expect(response.status).toBe(201);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(client.findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, organization_id: ORG },
    });
    expect(project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organization_id: ORG, porcentage: 0 }),
      }),
    );
    expect(audit.fetch).toHaveBeenCalledOnce();
  });

  it("calculates metrics from organization-scoped projects and tasks", async () => {
    const prisma = {
      project: {
        findMany: vi.fn(async () => [{ id: PROJECT_ID, client_id: CLIENT_ID, status: "Fechado" }]),
      },
      task: {
        findMany: vi.fn(async () => [
          { project_id: PROJECT_ID, client_id: CLIENT_ID, status: "Concluída" },
        ]),
      },
      $disconnect: vi.fn(async () => undefined),
    };
    const app = createProjectWorkerApp({ env: env(), prisma: prisma as never });
    const response = await app.request("https://project.test/project/metrics", {
      headers: headers(),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      total: 1,
      completed: 1,
      inProgress: 0,
      paused: 0,
      toDo: 0,
      notContracted: 0,
      taskMetrics: { total: 1, completed: 1, open: 0, paused: 0, emptyStatus: 0 },
    });
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORG } }),
    );
  });

  it("uses a transaction to complete progress and inactivate a unique client", async () => {
    const project = {
      findFirst: vi.fn(async () => ({ id: PROJECT_ID, client_id: CLIENT_ID })),
      update: vi.fn(async () => ({
        id: PROJECT_ID,
        status: "Concluído",
        porcentage: 100,
        client_id: CLIENT_ID,
      })),
    };
    const client = {
      findFirst: vi.fn(async () => ({ id: CLIENT_ID, service_unique: true })),
      update: vi.fn(async () => ({ id: CLIENT_ID })),
    };
    const prisma = {
      project,
      client,
      task: {
        groupBy: vi.fn(async () => [{ status: "Concluída", _count: { status: 1 } }]),
      },
      $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({ project, client, task: prisma.task }),
      ),
      $disconnect: vi.fn(async () => undefined),
    };
    const app = createProjectWorkerApp({ env: env(), prisma: prisma as never });
    const response = await app.request("https://project.test/project/progress", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ project_id: PROJECT_ID }),
    });
    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(client.update).toHaveBeenCalledWith({
      where: { id: CLIENT_ID },
      data: { status: "Inativo", deletion_date: expect.any(Date) },
    });
  });

  it("reads tasks and writes derived progress inside one RepeatableRead transaction", async () => {
    const transactionProject = {
      findFirst: vi.fn(async () => ({ id: PROJECT_ID, client_id: CLIENT_ID })),
      update: vi.fn(async () => ({
        id: PROJECT_ID,
        status: "Em andamento",
        porcentage: 0,
        client_id: CLIENT_ID,
      })),
    };
    const transactionTask = { groupBy: vi.fn(async () => []) };
    const prisma = {
      project: { findFirst: vi.fn(), update: vi.fn() },
      client: { findFirst: vi.fn(), update: vi.fn() },
      task: { findMany: vi.fn(), groupBy: vi.fn() },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>, options: unknown) => {
        expect(options).toEqual({ isolationLevel: "RepeatableRead" });
        return callback({
          project: transactionProject,
          task: transactionTask,
          client: { findFirst: vi.fn(), update: vi.fn() },
        });
      }),
      $disconnect: vi.fn(async () => undefined),
    };
    const app = createProjectWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request("https://project.test/project/progress", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ project_id: PROJECT_ID }),
    });

    expect(response.status).toBe(200);
    expect(transactionProject.findFirst).toHaveBeenCalledOnce();
    expect(transactionTask.groupBy).toHaveBeenCalledOnce();
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
    expect(prisma.task.groupBy).not.toHaveBeenCalled();
  });

  it("keeps internal reporting reads paginated and snapshot-capable", async () => {
    const rows = [{ name: "A" }, { name: "B" }];
    const findMany = vi.fn(async () => rows);
    const prisma = {
      project: { findMany },
      $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback(prisma),
      ),
      $disconnect: vi.fn(async () => undefined),
    };
    const app = createProjectWorkerApp({ env: env(), prisma: prisma as never });
    const body = { source: "integracao.projects", fields: ["name"], limit: 1 };
    const responseHeaders = await reportHeaders("extract", body, ["name"]);
    const response = await app.request("https://project.test/internal/reporting/extract", {
      method: "POST",
      headers: new Headers({
        ...Object.fromEntries(responseHeaders),
        "content-type": "application/json",
      }),
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ rows: [{ name: "A" }], reachedLimit: true });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, where: { organization_id: ORG } }),
    );
  });

  it("accepts legacy key fields and filters through the reporting handler", async () => {
    const findMany = vi.fn(async () => [
      { name: "Implantação", client_id: CLIENT_ID, sponsor_id: USER_ID },
    ]);
    const prisma = {
      project: { findMany },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
      $disconnect: vi.fn(async () => undefined),
    };
    const app = createProjectWorkerApp({ env: env(), prisma: prisma as never });
    const body = {
      source: "integracao.projects",
      fields: ["name", "sponsor_id"],
      limit: 10,
      query: {
        filters: [{ field: "client_id", operator: "eq", parameter: "client", value: CLIENT_ID }],
      },
    };
    const responseHeaders = await reportHeaders("extract", body, [
      "name",
      "sponsor_id",
      "client_id",
    ]);
    const response = await app.request("https://project.test/internal/reporting/extract", {
      method: "POST",
      headers: new Headers({
        ...Object.fromEntries(responseHeaders),
        "content-type": "application/json",
      }),
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data.rows).toEqual([
      { name: "Implantação", sponsor_id: USER_ID },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG },
        select: { name: true, sponsor_id: true, client_id: true },
      }),
    );
  });
});
