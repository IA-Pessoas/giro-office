import { describe, expect, it, vi } from "vitest";
import { createTriagemWorkerApp, type TriagemWorkerEnv } from "./app.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "d0000000-0000-4000-8000-000000000001";
const ITEM_ID = "c0000000-0000-4000-8000-000000000001";
const TOKEN = "triagem-gateway-token";
const SECRET = "triagem-worker-test-secret-which-is-long-enough";

function env(overrides: Partial<TriagemWorkerEnv> = {}): TriagemWorkerEnv {
  return {
    JWT_SECRET: SECRET,
    INTERNAL_SERVICE_TOKEN: TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
    ...overrides,
  };
}

function forwarded(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    ...extra,
  };
}

async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    exp: Math.floor(Date.now() / 1000) + 600,
    ...payload,
  })}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${Buffer.from(signature).toString("base64url")}`;
}

type Recorded = { sql: string; values: unknown[] };

function fakePrisma(overrides: Record<string, unknown> = {}) {
  const statements: Recorded[] = [];
  const catalogRow = {
    id: ITEM_ID,
    organization_id: ORGANIZATION_ID,
    kind: "LINK_TYPE",
    code: "gov",
    label: "Governo",
    url: null,
    archived_at: null,
    created_at: new Date("2026-09-01T00:00:00Z"),
    updated_at: new Date("2026-09-01T00:00:00Z"),
  };
  const outboxEvent = {
    id: "e0000000-0000-4000-8000-000000000001",
    event_key: "history-key-1",
    aggregate_type: "triage_competence",
    aggregate_id: ITEM_ID,
    organization_id: ORGANIZATION_ID,
    event_type: "triage.competence.created",
    payload: { actor_user_id: USER_ID, before: null, after: { status: "OPEN" } },
    occurred_at: new Date("2026-09-02T10:00:00Z"),
  };
  let pending = 1;
  const transaction = {
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ sql: strings.join("?"), values });
      return 2;
    }),
    triageCatalogItem: {
      findMany: vi.fn(async () => [catalogRow]),
      findFirst: vi.fn(async () => catalogRow),
      create: vi.fn(async () => catalogRow),
      update: vi.fn(async () => catalogRow),
    },
    triageCompetence: { findFirst: vi.fn(async () => null) },
    triageCompetenceCatalogSnapshot: { findMany: vi.fn(async () => []) },
    triageOutboxEvent: {
      findMany: vi.fn(async () => [outboxEvent]),
      updateMany: vi.fn(async (args: { data: Record<string, unknown> }) => {
        if ("dispatched_at" in args.data) pending = 0;
        return { count: 1 };
      }),
      count: vi.fn(async () => pending),
    },
    ...overrides,
  };
  const prisma = {
    $queryRaw: vi.fn(async () => [{ ok: 1 }]),
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
    ...transaction,
  };
  return { prisma, transaction, statements, outboxEvent };
}

describe("triagem Worker — paridade restante", () => {
  it("usa o TriageCatalogService canônico com RLS, filtros de cliente/competência e auth do Node", async () => {
    const { prisma, transaction, statements } = fakePrisma();
    const app = createTriagemWorkerApp({ env: env(), prisma });

    const list = await app.request(
      `https://triagem.test/triagem/catalogs?kind=LINK_TYPE&client_id=${CLIENT_ID}&competence=2026-09`,
      { headers: forwarded({ "x-auth-modules": JSON.stringify({ triagem: 1 }) }) },
    );
    expect(list.status).toBe(200);
    expect(transaction.triageCompetence.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORGANIZATION_ID, client_id: CLIENT_ID, competence: "2026-09" },
      }),
    );
    expect(statements[0]?.sql).toContain('SET LOCAL ROLE "giro_user_runtime"');
    expect(statements[1]).toEqual({
      sql: "SELECT set_config('app.organization_id', ?, true)",
      values: [ORGANIZATION_ID],
    });

    const forbidden = await app.request("https://triagem.test/triagem/catalogs", {
      method: "POST",
      headers: {
        ...forwarded({ "x-auth-modules": JSON.stringify({ triagem: 1 }) }),
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "LINK_TYPE", code: "gov", label: "Governo" }),
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({
      error: "Permissão insuficiente para alterar a Triagem.",
    });
    expect(transaction.triageCatalogItem.create).not.toHaveBeenCalled();
  });

  it("aplica fallback de permissão global quando o gateway não encaminha módulos", async () => {
    const { prisma } = fakePrisma();
    const app = createTriagemWorkerApp({ env: env(), prisma });
    const response = await app.request("https://triagem.test/triagem/catalogs", {
      headers: forwarded({ "x-auth-permission": "2" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Array<Record<string, unknown>> };
    expect(body.data[0]).toMatchObject({ id: ITEM_ID, code: "gov" });
    expect(body.data[0]).not.toHaveProperty("organization_id");
  });

  it("aceita somente Bearer como o Node, sem sessão por cookie", async () => {
    const { prisma } = fakePrisma();
    const app = createTriagemWorkerApp({ env: env(), prisma });
    const token = await signJwt({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      modules: { triagem: 2 },
    });

    const missing = await app.request("https://triagem.test/triagem/catalogs");
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ error: "Token de autenticação não informado." });

    const cookieOnly = await app.request("https://triagem.test/triagem/catalogs", {
      headers: { cookie: `cw.session=${token}` },
    });
    expect(cookieOnly.status).toBe(401);

    const bearer = await app.request("https://triagem.test/triagem/catalogs", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(bearer.status).toBe(200);
  });

  it("devolve 400 para JSON inválido e propaga x-request-id", async () => {
    const { prisma } = fakePrisma();
    const app = createTriagemWorkerApp({ env: env(), prisma });
    const response = await app.request("https://triagem.test/triagem/urgent-requests", {
      method: "POST",
      headers: {
        ...forwarded({ "x-auth-modules": JSON.stringify({ triagem: 2 }) }),
        "content-type": "application/json",
        "x-request-id": "req-triagem-1",
      },
      body: "{",
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("x-request-id")).toBe("req-triagem-1");
    expect(await response.json()).toMatchObject({ requestId: "req-triagem-1" });

    const generated = await app.request("https://triagem.test/health");
    expect(generated.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("falha com 503 explícito sem HYPERDRIVE/DATABASE_URL", async () => {
    const app = createTriagemWorkerApp({ env: env({ HYPERDRIVE: undefined }) });
    expect((await app.request("https://triagem.test/ready")).status).toBe(503);
    const response = await app.request("https://triagem.test/triagem/overview", {
      headers: forwarded({ "x-auth-modules": JSON.stringify({ triagem: 1 }) }),
    });
    expect(response.status).toBe(503);
  });

  it("reconcilia e despacha a outbox para o audit-service via binding", async () => {
    const { prisma, statements, outboxEvent } = fakePrisma();
    const auditFetch = vi.fn(async (_request: Request) => new Response(null, { status: 201 }));
    const app = createTriagemWorkerApp({
      env: env({ AUDIT_SERVICE: { fetch: auditFetch }, AUDIT_SERVICE_TOKEN: "audit-token" }),
      prisma,
    });
    const response = await app.request("https://triagem.test/internal/triagem/audit/reconcile", {
      method: "POST",
      headers: forwarded({ "x-auth-modules": JSON.stringify({ triagem: 2 }) }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { reconciled: 2, dispatched: 1, pending: 0 },
    });
    expect(statements.some((s) => s.sql.includes('INSERT INTO "triagem.outbox_events"'))).toBe(
      true,
    );
    const request = auditFetch.mock.calls[0]?.[0] as Request;
    expect(new URL(request.url).pathname).toBe("/internal/audit/requests");
    expect(request.headers.get("x-internal-service-token")).toBe("audit-token");
    expect(await request.json()).toMatchObject({
      requestId: outboxEvent.event_key,
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      method: "ENTITY_CHANGE",
      path: "/triagem/competencies",
      outcome: "success",
      serviceSource: "triagem-service",
      action: "triage.competence.created",
      referring: "triagem.competences",
      referringId: ITEM_ID,
      createdAt: "2026-09-02T10:00:00.000Z",
      metadata: { event_id: outboxEvent.id, aggregate_type: "triage_competence" },
    });
  });

  it("mantém o evento pendente quando o audit-service responde erro", async () => {
    const { prisma } = fakePrisma();
    const app = createTriagemWorkerApp({
      env: env({
        AUDIT_SERVICE: { fetch: async () => new Response(null, { status: 500 }) },
        AUDIT_SERVICE_TOKEN: "audit-token",
      }),
      prisma,
    });
    const response = await app.request("https://triagem.test/internal/triagem/audit/reconcile", {
      method: "POST",
      headers: forwarded({ "x-auth-modules": JSON.stringify({ triagem: 2 }) }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { dispatched: 0, pending: 1 } });
  });

  it("responde 503 na reconciliação sem binding/token do audit-service", async () => {
    const { prisma, transaction } = fakePrisma();
    const app = createTriagemWorkerApp({ env: env(), prisma });
    const response = await app.request("https://triagem.test/internal/triagem/audit/reconcile", {
      method: "POST",
      headers: forwarded({ "x-auth-modules": JSON.stringify({ triagem: 2 }) }),
    });
    expect(response.status).toBe(503);
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });
});
