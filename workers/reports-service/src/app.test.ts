import { hashCsrfToken } from "@workspace/runtime";
import { describe, expect, it, vi } from "vitest";
import { createReportsWorkerApp } from "./app.js";
import type { ReportsWorkerEnv } from "./env.js";

const env: ReportsWorkerEnv = {
  JWT_SECRET: "reports-test-secret",
  NODE_ENV: "test",
};

function encode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function sign(claims: Record<string, unknown>): Promise<string> {
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${encode(new Uint8Array(signature))}`;
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

function fakePrisma() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe("reports-service Worker", () => {
  it("mantém health/ready e usa Prisma por request no ready", async () => {
    const prisma = fakePrisma();
    const app = createReportsWorkerApp({ env, prisma });

    const health = await app.request("https://reports.test/health");
    const ready = await app.request("https://reports.test/ready");

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({
      success: true,
      data: { status: "ok", service: "reports-service", env: "test" },
    });
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({
      success: true,
      data: { status: "ready", service: "reports-service" },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("exige autenticação no catálogo", async () => {
    const app = createReportsWorkerApp({ env });

    const response = await app.request("https://reports.test/reports/catalog");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ success: false, code: "UNAUTHORIZED" });
  });

  it("recusa mutação por cookie sem CSRF antes de chamar o serviço", async () => {
    const csrf = "A".repeat(43);
    const token = await sign({
      user_id: "user-1",
      organization_id: "org-1",
      session_id: "session-1",
      session_version: 1,
      csrf_hash: await hashCsrfToken(csrf),
    });
    const cancel = vi.fn();
    const app = createReportsWorkerApp({
      env: { ...env, REPORTS_INTERNAL_TOKEN: "reports-internal-token" },
      services: { jobService: { cancel } } as never,
    });

    const response = await app.request(
      "https://reports.test/reports/jobs/00000000-0000-4000-8000-000000000003/cancel",
      {
        method: "POST",
        headers: { cookie: `cw.session=${token}; cw.csrf=${csrf}` },
      },
    );

    expect(response.status).toBe(403);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("valida sessão e CSRF para mutação por cookie, mantendo Bearer sem essa barreira", async () => {
    const csrf = "B".repeat(43);
    const token = await sign({
      user_id: "user-1",
      organization_id: "org-1",
      session_id: "session-1",
      session_version: 1,
      csrf_hash: await hashCsrfToken(csrf),
    });
    const userService = {
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    };
    const cancel = vi.fn().mockResolvedValue(undefined);
    const app = createReportsWorkerApp({
      env: {
        ...env,
        REPORTS_INTERNAL_TOKEN: "reports-internal-token",
        USER_SERVICE: userService,
      } as never,
      services: { jobService: { cancel } } as never,
    });

    const response = await app.request(
      "https://reports.test/reports/jobs/00000000-0000-4000-8000-000000000003/cancel",
      {
        method: "POST",
        headers: {
          cookie: `cw.session=${token}; cw.csrf=${csrf}`,
          "x-csrf-token": csrf,
        },
      },
    );

    expect(response.status).toBe(204);
    expect(userService.fetch).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      id: "00000000-0000-4000-8000-000000000003",
    });
  });

  it("repassa a chave de idempotência do POST de jobs ao serviço", async () => {
    const token = await sign({
      user_id: "user-1",
      organization_id: "org-1",
      modules: { integracao: 1 },
    });
    const definition = {
      sources: ["integracao.clients"],
      columns: [{ source: "integracao.clients", field: "name", alias: "name" }],
      joins: [],
      filters: [],
      filter_groups: [],
      parameters: [],
      aggregations: [],
      order_by: [],
    };
    const createFromDefinition = vi.fn().mockResolvedValue({ id: "job-1", status: "queued" });
    const app = createReportsWorkerApp({
      env,
      services: {
        authorizationService: { validateDefinition: vi.fn().mockResolvedValue({ definition }) },
        jobService: { createFromDefinition },
      } as never,
    });

    const response = await app.request("https://reports.test/reports/jobs", {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "content-type": "application/json",
        "Idempotency-Key": "job-attempt-1",
      },
      body: JSON.stringify({ definition, format: "json" }),
    });

    expect(response.status).toBe(201);
    expect(createFromDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "job-attempt-1",
        idempotencyHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    );
  });

  it("expõe somente fontes autorizadas pelo organization_id e pelos módulos do JWT", async () => {
    const token = await sign({
      user_id: "user-1",
      organization_id: "org-1",
      modules: { integracao: 1 },
    });
    const app = createReportsWorkerApp({ env });

    const response = await app.request("https://reports.test/reports/catalog", {
      headers: authHeaders(token),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        items: expect.arrayContaining([
          expect.objectContaining({ key: "integracao.clients", module: "integracao" }),
        ]),
      },
    });
  });

  it("valida o fluxo principal de definição sem aceitar fonte fora do escopo", async () => {
    const token = await sign({
      user_id: "user-1",
      organization_id: "org-1",
      modules: { integracao: 1 },
    });
    const app = createReportsWorkerApp({ env });
    const definition = {
      version: 2,
      areas: [{ source: "integracao.clients", fields: ["name"] }],
    };

    const valid = await app.request("https://reports.test/reports/definitions/validate", {
      method: "POST",
      headers: { ...authHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({ definition }),
    });
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toEqual({ success: true, data: { definition } });

    const deniedToken = await sign({
      user_id: "user-1",
      organization_id: "org-2",
      modules: { integracao: 0 },
    });
    const denied = await app.request("https://reports.test/reports/definitions/validate", {
      method: "POST",
      headers: { ...authHeaders(deniedToken), "content-type": "application/json" },
      body: JSON.stringify({ definition }),
    });
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" });
  });

  it("mantém todas as superfícies Node de catálogo, preview, modelos, jobs, snapshots, exportação e retenção", async () => {
    const token = await sign({
      user_id: "user-1",
      organization_id: "org-1",
      type: "owner",
      modules: { integracao: 3 },
    });
    const headers = { ...authHeaders(token), "content-type": "application/json" };
    const modelId = "00000000-0000-4000-8000-000000000001";
    const versionId = "00000000-0000-4000-8000-000000000002";
    const jobId = "00000000-0000-4000-8000-000000000003";
    const snapshotId = "00000000-0000-4000-8000-000000000004";
    const definition = {
      sources: ["integracao.clients"],
      columns: [{ source: "integracao.clients", field: "name", alias: "name" }],
      joins: [],
      filters: [],
      filter_groups: [],
      parameters: [],
      aggregations: [],
      order_by: [],
    };
    const sharedModel = {
      id: modelId,
      organization_id: "org-1",
      department_id: "department-1",
      name: "Compartilhado",
      description: null,
      version: 1,
      version_id: versionId,
      definition,
      grant: { sources: { "integracao.clients": ["name"] }, relations: [] },
    };
    const services = {
      previewService: {
        preview: vi.fn().mockResolvedValue({
          rows: [],
          presentation: { columns: [] },
          limit: 100,
          hasMore: false,
        }),
        previewComposition: vi.fn().mockResolvedValue({ blocks: [] }),
      },
      authorizationService: {
        validateDefinition: vi.fn().mockResolvedValue({ definition }),
        validateComposition: vi.fn().mockResolvedValue({ definition }),
        getSharedDepartment: vi.fn().mockResolvedValue({ id: "department-1" }),
        getSharedExecutionContext: vi.fn().mockResolvedValue({
          department: { id: "department-1" },
          scope: { organization_id: "org-1", modules: { integracao: 3 } },
          grant: sharedModel.grant,
        }),
        authorizeSharedModel: vi.fn().mockResolvedValue({
          department_id: "department-1",
          definition,
        }),
        validateSharedDefinition: vi.fn().mockResolvedValue({
          department_id: "department-1",
          definition,
          grant: sharedModel.grant,
        }),
      },
      modelService: {
        create: vi.fn().mockResolvedValue(sharedModel),
        list: vi.fn().mockResolvedValue([sharedModel]),
        get: vi.fn().mockResolvedValue(sharedModel),
        update: vi.fn().mockResolvedValue(sharedModel),
        delete: vi.fn().mockResolvedValue(undefined),
        createShared: vi.fn().mockResolvedValue(sharedModel),
        listShared: vi.fn().mockResolvedValue([sharedModel]),
        getShared: vi.fn().mockResolvedValue(sharedModel),
        updateShared: vi.fn().mockResolvedValue(sharedModel),
      },
      jobService: {
        create: vi.fn().mockResolvedValue({ id: jobId, status: "queued" }),
        createFromDefinition: vi.fn().mockResolvedValue({ id: jobId, status: "queued" }),
        getVersion: vi.fn().mockResolvedValue({
          model: { id: modelId, created_by_user_id: "user-1", department_id: "department-1" },
          version: { id: versionId, definition_json: definition },
        }),
        getRetentionDays: vi.fn().mockResolvedValue(30),
        get: vi.fn().mockResolvedValue({ id: jobId, status: "completed" }),
        getVersionId: vi.fn().mockResolvedValue({ report_model_version_id: versionId }),
        listHistory: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
        cancel: vi.fn().mockResolvedValue(undefined),
      },
      snapshotService: {
        get: vi.fn().mockResolvedValue({
          snapshot: { id: snapshotId, created_at: new Date("2026-09-22T00:00:00.000Z") },
          rows: [],
          nextCursor: null,
        }),
      },
      exportService: {
        export: vi.fn().mockResolvedValue({
          contentType: "text/csv; charset=utf-8",
          fileName: "report.csv",
          body: new TextEncoder().encode("name\r\n"),
        }),
      },
      retentionService: {
        getOrganizationPolicy: vi.fn().mockResolvedValue({ retention_days: 30 }),
        updateOrganizationPolicy: vi.fn().mockResolvedValue({ retention_days: 45 }),
      },
      lifecycleService: { deleteSnapshot: vi.fn().mockResolvedValue(undefined) },
    };
    const accessContextClient = {
      getAccessContext: vi.fn().mockImplementation(({ requestId }: { requestId: string }) => ({
        organization: { id: "org-1" },
        type: requestId === "reports-snapshot-delete" ? "admin" : "owner",
        department: { id: "department-1" },
        departmentModule: "integracao",
        modules: { integracao: 3 },
      })),
    };
    const app = createReportsWorkerApp({
      env,
      accessContextClient,
      services,
    } as never);

    const requests: Array<Promise<Response>> = [
      app.request("https://reports.test/reports/catalog", { headers }),
      app.request("https://reports.test/reports/definitions/validate", {
        method: "POST",
        headers,
        body: JSON.stringify({ definition }),
      }),
      app.request("https://reports.test/reports/preview", {
        method: "POST",
        headers,
        body: JSON.stringify({ definition }),
      }),
      app.request("https://reports.test/reports/models/shared", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Compartilhado", definition }),
      }),
      app.request("https://reports.test/reports/models/shared/list", { headers }),
      app.request(`https://reports.test/reports/models/shared/${modelId}/copy`, {
        method: "POST",
        headers,
      }),
      app.request(`https://reports.test/reports/models/shared/${modelId}/preview`, {
        method: "POST",
        headers,
      }),
      app.request(`https://reports.test/reports/models/shared/${modelId}`, { headers }),
      app.request(`https://reports.test/reports/models/shared/${modelId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name: "Atualizado", definition }),
      }),
      app.request("https://reports.test/reports/models", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Pessoal", definition }),
      }),
      app.request("https://reports.test/reports/models/list", { headers }),
      app.request(`https://reports.test/reports/models/${modelId}`, { headers }),
      app.request(`https://reports.test/reports/models/${modelId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name: "Atualizado" }),
      }),
      app.request(`https://reports.test/reports/models/${modelId}`, { method: "DELETE", headers }),
      app.request("https://reports.test/reports/jobs", {
        method: "POST",
        headers,
        body: JSON.stringify({ definition, format: "csv" }),
      }),
      app.request("https://reports.test/reports/jobs/list", { headers }),
      app.request(`https://reports.test/reports/jobs/${jobId}`, { headers }),
      app.request(`https://reports.test/reports/jobs/${jobId}/snapshot`, { headers }),
      app.request(`https://reports.test/reports/snapshots/${snapshotId}/export?format=csv`, {
        headers,
      }),
      app.request(`https://reports.test/reports/snapshots/${snapshotId}/delete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ justification: "Solicitado pelo administrador" }),
      }),
      app.request(`https://reports.test/reports/jobs/${jobId}/cancel`, { method: "POST", headers }),
      app.request("https://reports.test/reports/retention", { headers }),
      app.request("https://reports.test/reports/retention", {
        method: "PUT",
        headers,
        body: JSON.stringify({ retention_days: 45 }),
      }),
    ];

    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200, 201, 200, 201, 200, 200, 200, 201, 200, 200, 200, 204, 201, 200, 200, 200, 200,
      204, 204, 200, 200,
    ]);
    expect(services.previewService.preview).toHaveBeenCalledWith(
      definition,
      expect.objectContaining({ organization_id: "org-1" }),
      expect.any(String),
      undefined,
    );
    expect(services.modelService.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", userId: "user-1" }),
    );
    expect(services.jobService.createFromDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", userId: "user-1" }),
    );
    expect(services.exportService.export).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotId,
        organizationId: "org-1",
        userId: "user-1",
        format: "csv",
      }),
    );
    const exportResponse = responses[18];
    expect(exportResponse?.headers.get("content-type")).toContain("text/csv");
    expect(exportResponse?.headers.get("content-disposition")).toBe(
      'attachment; filename="report.csv"',
    );
    expect(exportResponse?.headers.get("cache-control")).toBe("no-store");
    await expect(exportResponse?.text()).resolves.toBe("name\r\n");
    await expect(responses[0]?.json()).resolves.toMatchObject({
      success: true,
      data: { items: expect.any(Array) },
    });
  });
});
