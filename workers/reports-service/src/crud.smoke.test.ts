// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Roda o entrypoint real do Worker (fetch + scheduled) com os bindings de origem stubados:
// USER_SERVICE (contexto de acesso), CLIENT_SERVICE (linhas da área) e AUDIT_SERVICE.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  expectOk,
  requireSmokeState,
  SMOKE_JWT_SECRET,
  smokeCall,
  smokeEnv,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import type { ReportsWorkerEnv } from "./env.js";
import worker from "./index.js";

const MODULES = Object.fromEntries(
  ["integracao", "ti", "fiscal", "contabil", "rh", "pessoal", "regularize", "triagem"].map(
    (key) => [key, 3],
  ),
);

function base64Url(value: string | Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

async function bearer(claims: Record<string, unknown>) {
  const input = `${base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64Url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SMOKE_JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${base64Url(new Uint8Array(signature))}`;
}

// Composição do ReportBuilder (run-reports-browser-smoke.mjs): versão 2 com áreas.
const composition = (fields: string[]) => ({
  version: 2,
  areas: [{ source: "integracao.clients", fields, filters: [] }],
});

describe.skipIf(!smokeState)("reports-service CRUD smoke (banco real)", () => {
  let accessType: "owner" | "admin" = "owner";
  const binding = (handler: (request: Request) => Response | Promise<Response>) => ({
    fetch: (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init)),
  });
  const env = () => {
    const state = requireSmokeState();
    return smokeEnv<ReportsWorkerEnv>({
      NODE_ENV: "test",
      USER_SERVICE_URL: "https://user-service.binding",
      REPORTS_INTERNAL_TOKEN: "crud-smoke-reports-token",
      REPORTS_GRANT_SECRET: "crud-smoke-reports-grant-secret",
      AUDIT_SERVICE_TOKEN: "crud-smoke-audit-token",
      USER_SERVICE: binding(() =>
        Response.json({
          success: true,
          data: {
            organization: { id: state.organizationId },
            type: accessType,
            department: { id: state.departmentId },
            departmentModule: "ti",
            modules: MODULES,
            user: { name: "Smoke Owner", login: "owner@smoke.local" },
          },
        }),
      ),
      CLIENT_SERVICE: binding(() =>
        Response.json({
          success: true,
          data: { rows: [{ name: "Cliente Smoke", city: "Recife", state: "PE" }] },
        }),
      ),
      AUDIT_SERVICE: binding(() => Response.json({ success: true }, { status: 201 })),
    } as Partial<ReportsWorkerEnv>);
  };
  const app = {
    request: (input: string, init?: RequestInit, requestEnv?: unknown) =>
      worker.fetch(new Request(input, init), requestEnv as ReportsWorkerEnv),
  };
  const headers = async (extra: Record<string, string> = {}) => {
    const state = requireSmokeState();
    const token = await bearer({
      user_id: state.ownerId,
      organization_id: state.organizationId,
      auth_kind: "organization",
      type: "owner",
      modules: MODULES,
      permission: 3,
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    return { authorization: `Bearer ${token}`, "content-type": "application/json", ...extra };
  };
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    extra?: Record<string, string>,
  ) => smokeCall(app, env(), method, path, body, await headers(extra));
  const runCron = async () => {
    const pending: Promise<unknown>[] = [];
    worker.scheduled({}, env(), { waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
  };

  it("health, catálogo, validação e prévia", async () => {
    expectOk(await smokeCall(app, env(), "GET", "/health", undefined, {}), "GET /health");
    expectOk(await smokeCall(app, env(), "GET", "/ready", undefined, {}), "GET /ready");
    const catalog = expectOk(await call("GET", "/reports/catalog"), "GET /reports/catalog");
    expect(
      catalog.data.items.some((item: { key: string }) => item.key === "integracao.clients"),
    ).toBe(true);
    const definition = composition(["name", "city"]);
    expectOk(
      await call("POST", "/reports/definitions/validate", { definition }),
      "POST /reports/definitions/validate",
    );
    const preview = expectOk(
      await call("POST", "/reports/preview", { definition }),
      "POST preview",
    );
    expect(JSON.stringify(preview.data)).toContain("Cliente Smoke");
  });

  it("modelos pessoais, compartilhados, jobs, snapshot, export, exclusão e retenção", async () => {
    const state = requireSmokeState();
    const suffix = randomUUID().slice(0, 8);
    accessType = "owner";

    // Modelo pessoal: create → get → list → patch (nome, descrição, definição) → re-read.
    const model = expectOk(
      await call("POST", "/reports/models", {
        name: `Smoke ${suffix}`,
        description: "Criado pelo smoke",
        definition: composition(["name"]),
      }),
      "POST /reports/models",
      [201],
    ).data;
    expect(model.id).toBeTruthy();
    expectOk(await call("GET", `/reports/models/${model.id}`), "GET /reports/models/:id");
    const models = expectOk(await call("GET", "/reports/models/list"), "GET /reports/models/list");
    expect(models.data.items.some((item: { id: string }) => item.id === model.id)).toBe(true);
    expectOk(
      await call("PATCH", `/reports/models/${model.id}`, {
        name: `Smoke ${suffix} renomeado`,
        description: "Atualizado",
        definition: composition(["name", "city"]),
      }),
      "PATCH /reports/models/:id",
    );
    const updated = expectOk(
      await call("GET", `/reports/models/${model.id}`),
      "GET após PATCH",
    ).data;
    expect(updated).toMatchObject({ name: `Smoke ${suffix} renomeado`, description: "Atualizado" });
    expect(updated.definition.areas[0].fields).toEqual(["name", "city"]);
    expect(updated.version).toBeGreaterThan(model.version);

    // Modelo compartilhado do departamento.
    const shared = expectOk(
      await call("POST", "/reports/models/shared", {
        name: `Compartilhado ${suffix}`,
        description: "Acervo",
        definition: composition(["name"]),
      }),
      "POST /reports/models/shared",
      [201],
    ).data;
    const sharedList = expectOk(
      await call("GET", "/reports/models/shared/list"),
      "GET /reports/models/shared/list",
    );
    expect(sharedList.data.items.some((item: { id: string }) => item.id === shared.id)).toBe(true);
    expectOk(await call("GET", `/reports/models/shared/${shared.id}`), "GET shared/:id");
    expectOk(
      await call("PATCH", `/reports/models/shared/${shared.id}`, {
        name: `Compartilhado ${suffix} v2`,
        description: null,
        definition: composition(["name", "state"]),
      }),
      "PATCH /reports/models/shared/:id",
    );
    const sharedAfter = expectOk(
      await call("GET", `/reports/models/shared/${shared.id}`),
      "GET shared após PATCH",
    ).data;
    expect(sharedAfter.name).toBe(`Compartilhado ${suffix} v2`);
    expect(sharedAfter.description ?? null).toBeNull();
    expect(sharedAfter.definition.areas[0].fields).toEqual(["name", "state"]);
    expectOk(
      await call("POST", `/reports/models/shared/${shared.id}/preview`),
      "POST shared/:id/preview",
    );
    const copy = expectOk(
      await call("POST", `/reports/models/shared/${shared.id}/copy`),
      "POST shared/:id/copy",
      [201],
    ).data;
    expect(copy.id).not.toBe(shared.id);

    // Jobs: por definição (com Idempotency-Key), por versão salva e do acervo.
    const idempotencyKey = `smoke-${suffix}`;
    const adHoc = expectOk(
      await call(
        "POST",
        "/reports/jobs",
        { definition: composition(["name", "city"]) },
        {
          "Idempotency-Key": idempotencyKey,
        },
      ),
      "POST /reports/jobs (definition)",
      [201],
    ).data;
    const again = expectOk(
      await call(
        "POST",
        "/reports/jobs",
        { definition: composition(["name", "city"]) },
        {
          "Idempotency-Key": idempotencyKey,
        },
      ),
      "POST /reports/jobs (idempotente)",
      [201],
    ).data;
    expect(again.id).toBe(adHoc.id);
    const fromModel = expectOk(
      await call("POST", "/reports/jobs", { modelVersionId: updated.version_id, format: "csv" }),
      "POST /reports/jobs (modelVersionId)",
      [201],
    ).data;
    const fromShared = expectOk(
      await call("POST", "/reports/jobs", { modelVersionId: sharedAfter.version_id }),
      "POST /reports/jobs (shared)",
      [201],
    ).data;
    const toCancel = expectOk(
      await call("POST", "/reports/jobs", { definition: composition(["state"]) }),
      "POST /reports/jobs (para cancelar)",
      [201],
    ).data;
    expect(expectOk(await call("GET", `/reports/jobs/${adHoc.id}`), "GET job").data.status).toBe(
      "queued",
    );
    expectOk(
      await call("POST", `/reports/jobs/${toCancel.id}/cancel`),
      "POST jobs/:id/cancel",
      [204],
    );
    expect(
      expectOk(await call("GET", `/reports/jobs/${toCancel.id}`), "GET job cancelado").data.status,
    ).toBe("cancelled");

    // Cron: a fila é drenada pelo scheduled() real (claim via SQL cru + materialização).
    await runCron();
    for (const job of [adHoc, fromModel, fromShared]) {
      const current = expectOk(await call("GET", `/reports/jobs/${job.id}`), "GET job pós-cron");
      expect(current.data.status, JSON.stringify(current.data)).toBe("completed");
    }

    const today = new Date().toISOString().slice(0, 10);
    const personal = expectOk(
      await call(
        "GET",
        `/reports/jobs/list?scope=personal&status=completed&from=${today}T00:00:00.000Z&author_id=${state.ownerId}&model_id=${model.id}&limit=20`,
      ),
      "GET /reports/jobs/list (personal + filtros)",
    ).data;
    expect(personal.items.some((item: { id: string }) => item.id === fromModel.id)).toBe(true);
    expectOk(await call("GET", "/reports/jobs/list?scope=personal"), "GET jobs/list personal");
    const library = expectOk(
      await call("GET", "/reports/jobs/list?scope=library&limit=50"),
      "GET /reports/jobs/list (library)",
    ).data;
    expect(library.items.some((item: { id: string }) => item.id === fromShared.id)).toBe(true);

    const snapshot = expectOk(
      await call("GET", `/reports/jobs/${adHoc.id}/snapshot?scope=personal&limit=100`),
      "GET jobs/:id/snapshot",
    ).data;
    expect(JSON.stringify(snapshot)).toContain("Cliente Smoke");
    const librarySnapshot = expectOk(
      await call("GET", `/reports/jobs/${fromShared.id}/snapshot?scope=library`),
      "GET jobs/:id/snapshot (library)",
    ).data;
    const snapshotId = snapshot.snapshot.id;
    for (const format of ["csv", "xlsx", "pdf"]) {
      const exported = await app.request(
        `https://smoke.test/reports/snapshots/${snapshotId}/export?format=${format}`,
        { headers: await headers() },
        env(),
      );
      expect(exported.status, `export ${format}: ${await exported.clone().text()}`).toBe(200);
    }

    // Exclusão do snapshot exige Admin 3 do departamento.
    accessType = "admin";
    const librarySnapshotId = librarySnapshot.snapshot.id;
    expectOk(
      await call("POST", `/reports/snapshots/${librarySnapshotId}/delete`, {
        justification: "Removido pelo smoke de CRUD",
      }),
      "POST snapshots/:id/delete",
      [204],
    );
    expect(
      expectOk(await call("GET", `/reports/jobs/${fromShared.id}`), "GET job após excluir").data
        .status,
    ).toBe("deleted");
    accessType = "owner";

    // Retenção da organização (owner); restaura o valor original.
    const retention = expectOk(await call("GET", "/reports/retention"), "GET /reports/retention");
    const original = retention.data.retention_days as number;
    const next = original === 45 ? 46 : 45;
    expectOk(await call("PUT", "/reports/retention", { retention_days: next }), "PUT retention");
    expect(
      expectOk(await call("GET", "/reports/retention"), "GET retenção").data.retention_days,
    ).toBe(next);
    expectOk(await call("PUT", "/reports/retention", { retention_days: original }), "PUT restore");

    // Exclusão dos modelos pessoais.
    for (const id of [model.id, copy.id]) {
      expectOk(await call("DELETE", `/reports/models/${id}`), "DELETE /reports/models/:id", [204]);
      expect((await call("GET", `/reports/models/${id}`)).status).toBe(404);
    }
  });
});
