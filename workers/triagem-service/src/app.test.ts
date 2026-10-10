import { describe, expect, it, vi } from "vitest";
import {
  createTriagemWorkerApp,
  type TriagemAuditService,
  type TriagemCatalogService,
  type TriagemCompetenceService,
  type TriagemExternalLinkService,
  type TriagemOverviewService,
  type TriagemPrisma,
  type TriagemSolicitationService,
  type TriagemUrgentRequestService,
  type TriagemWorkerEnv,
} from "./app.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const ITEM_ID = "c0000000-0000-4000-8000-000000000001";
const TOKEN = "triagem-gateway-token";

function env(): TriagemWorkerEnv {
  return {
    JWT_SECRET: "triagem-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function headers(permission = "2"): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-modules": JSON.stringify({ triagem: Number(permission) }),
  };
}

function service(): TriagemCatalogService {
  return {
    list: vi.fn(async () => [{ id: ITEM_ID, kind: "LINK_TYPE", code: "gov", label: "Governo" }]),
    create: vi.fn(async () => ({ id: ITEM_ID, kind: "LINK_TYPE", code: "gov", label: "Governo" })),
    update: vi.fn(async () => ({ id: ITEM_ID, kind: "LINK_TYPE", code: "gov", label: "Governo" })),
    archive: vi.fn(async () => ({ id: ITEM_ID, archived_at: new Date().toISOString() })),
  };
}

function overviewService(): TriagemOverviewService {
  return {
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, page_size: 20, indicators: {} })),
  };
}

function externalLinkService(): TriagemExternalLinkService {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: ITEM_ID })),
    update: vi.fn(async () => ({ id: ITEM_ID })),
    archive: vi.fn(async () => ({ id: ITEM_ID, archived_at: new Date().toISOString() })),
  };
}

function competenceService(): TriagemCompetenceService {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: ITEM_ID, competence: "2026-09" })),
    archive: vi.fn(async () => ({ id: ITEM_ID, archived_at: new Date().toISOString() })),
  };
}

function urgentRequestService(): TriagemUrgentRequestService {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: ITEM_ID, status: "OPEN" })),
    update: vi.fn(async () => ({ id: ITEM_ID, status: "OPEN" })),
    close: vi.fn(async () => ({ id: ITEM_ID, status: "CLOSED" })),
    reopen: vi.fn(async () => ({ id: ITEM_ID, status: "OPEN" })),
  };
}

function auditService(): TriagemAuditService {
  return {
    listTimeline: vi.fn(async () => ({ items: [], total: 0, page: 1, page_size: 20 })),
    reconcile: vi.fn(async () => ({ reconciled: 0, dispatched: 0, pending: 0 })),
  };
}

describe("triagem Worker", () => {
  it("serves health and readiness", async () => {
    const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as TriagemPrisma;
    const app = createTriagemWorkerApp({ env: env(), prisma, catalogService: service() });
    expect((await app.request("https://triagem.test/health")).status).toBe(200);
    expect((await app.request("https://triagem.test/ready")).status).toBe(200);
  });

  // A permissão de módulo fica no service canônico, como no Node (ver remainder.routes.test.ts).
  it("requires authentication", async () => {
    const catalogService = service();
    const app = createTriagemWorkerApp({ env: env(), catalogService });
    expect((await app.request("https://triagem.test/triagem/catalogs")).status).toBe(401);
    expect(catalogService.list).not.toHaveBeenCalled();
  });

  it("keeps catalog CRUD and archive scoped to the organization", async () => {
    const catalogService = service();
    const app = createTriagemWorkerApp({ env: env(), catalogService });
    const list = await app.request("https://triagem.test/triagem/catalogs?kind=LINK_TYPE", {
      headers: headers(),
    });
    const created = await app.request("https://triagem.test/triagem/catalogs", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ kind: "LINK_TYPE", code: "gov", label: "Governo" }),
    });
    const updated = await app.request(`https://triagem.test/triagem/catalogs/${ITEM_ID}`, {
      method: "PATCH",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ label: "Governo Federal" }),
    });
    const archived = await app.request(`https://triagem.test/triagem/catalogs/${ITEM_ID}/archive`, {
      method: "PATCH",
      headers: headers(),
    });
    expect(list.status).toBe(200);
    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(archived.status).toBe(200);
    const scoped = expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID });
    expect(catalogService.list).toHaveBeenCalledWith(
      { kind: "LINK_TYPE", includeArchived: false, clientId: undefined, competence: undefined },
      scoped,
    );
    expect(catalogService.create).toHaveBeenCalledWith(
      { kind: "LINK_TYPE", code: "gov", label: "Governo" },
      scoped,
    );
    expect(catalogService.update).toHaveBeenCalledWith(
      ITEM_ID,
      { label: "Governo Federal" },
      scoped,
    );
    expect(catalogService.archive).toHaveBeenCalledWith(ITEM_ID, scoped);
  });

  it("routes the remaining triagem contracts through scoped services", async () => {
    const overview = overviewService();
    const externalLinks = externalLinkService();
    const competencies = competenceService();
    const urgentRequests = urgentRequestService();
    const audit = auditService();
    const app = createTriagemWorkerApp({
      env: env(),
      catalogService: service(),
      overviewService: overview,
      externalLinkService: externalLinks,
      competenceService: competencies,
      urgentRequestService: urgentRequests,
      auditService: audit,
    });
    const bodyHeaders = { ...headers(), "content-type": "application/json" };
    const externalBody = {
      client_id: ORGANIZATION_ID,
      competence: "2026-09",
      type: "gov",
      url: "https://example.com/portal",
      description: "Portal oficial",
    };
    const urgentBody = {
      client_id: ORGANIZATION_ID,
      competence: "2026-09",
      urgency_code: "HIGH",
      description: "Solicitação urgente",
      responsible_id: USER_ID,
    };
    const responses = await Promise.all([
      app.request("https://triagem.test/triagem/overview?page=1&page_size=20", {
        headers: headers(),
      }),
      app.request(
        `https://triagem.test/triagem/external-links?client_id=${ORGANIZATION_ID}&competence=2026-09`,
        { headers: headers() },
      ),
      app.request("https://triagem.test/triagem/external-links", {
        method: "POST",
        headers: bodyHeaders,
        body: JSON.stringify(externalBody),
      }),
      app.request(`https://triagem.test/triagem/external-links/${ITEM_ID}`, {
        method: "PUT",
        headers: bodyHeaders,
        body: JSON.stringify({ type: "gov", url: externalBody.url }),
      }),
      app.request(`https://triagem.test/triagem/external-links/${ITEM_ID}/archive`, {
        method: "PATCH",
        headers: headers(),
      }),
      app.request("https://triagem.test/triagem/competencies", { headers: headers() }),
      app.request("https://triagem.test/triagem/competencies", {
        method: "POST",
        headers: bodyHeaders,
        body: JSON.stringify({ client_id: ORGANIZATION_ID, competence: "2026-09" }),
      }),
      app.request(`https://triagem.test/triagem/competencies/${ITEM_ID}/archive`, {
        method: "PATCH",
        headers: headers(),
      }),
      app.request(
        `https://triagem.test/triagem/urgent-requests?client_id=${ORGANIZATION_ID}&competence=2026-09`,
        { headers: headers() },
      ),
      app.request("https://triagem.test/triagem/urgent-requests", {
        method: "POST",
        headers: bodyHeaders,
        body: JSON.stringify(urgentBody),
      }),
      app.request(`https://triagem.test/triagem/urgent-requests/${ITEM_ID}`, {
        method: "PUT",
        headers: bodyHeaders,
        body: JSON.stringify({ description: "Atualizada" }),
      }),
      app.request(`https://triagem.test/triagem/urgent-requests/${ITEM_ID}/close`, {
        method: "PATCH",
        headers: bodyHeaders,
        body: JSON.stringify({ resolution_note: "Resolvida" }),
      }),
      app.request(`https://triagem.test/triagem/urgent-requests/${ITEM_ID}/reopen`, {
        method: "PATCH",
        headers: headers(),
      }),
      app.request(
        `https://triagem.test/triagem/competencies/${ITEM_ID}/history?page=1&page_size=20`,
        { headers: headers() },
      ),
      app.request("https://triagem.test/internal/triagem/audit/reconcile", {
        method: "POST",
        headers: headers(),
      }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 201, 200, 200, 200, 201, 200, 200, 201, 200, 200, 200, 200, 200,
    ]);
    expect(overview.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
    );
    expect(externalLinks.create).toHaveBeenCalled();
    expect(competencies.create).toHaveBeenCalled();
    expect(urgentRequests.close).toHaveBeenCalledWith(
      ITEM_ID,
      "Resolvida",
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    );
    expect(audit.reconcile).toHaveBeenCalled();
  });
});

describe("triagem Worker — solicitações", () => {
  it("cria, lista, consulta e fecha solicitações pelo serviço escopado", async () => {
    const solicitations: TriagemSolicitationService = {
      list: vi.fn(async () => []),
      get: vi.fn(async () => ({ id: ITEM_ID }) as never),
      create: vi.fn(async () => ({ id: ITEM_ID }) as never),
      close: vi.fn(async () => ({ id: ITEM_ID, status: "CLOSED" }) as never),
      getNoteCounts: vi.fn(async () => ({ xml_inbound: 0 }) as never),
      updateNoteCounts: vi.fn(async () => ({ xml_inbound: 3 }) as never),
      indicators: vi.fn(async () => ({ totals: {} }) as never),
    };
    const app = createTriagemWorkerApp({ env: env(), solicitationService: solicitations });
    const body = {
      client_id: ITEM_ID,
      competence: "2026-09",
      category_id: ITEM_ID,
      description: "Conferir notas.",
      responsible_id: USER_ID,
    };

    const created = await app.request("https://triagem.test/triagem/solicitations", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const listed = await app.request("https://triagem.test/triagem/solicitations?status=OPEN", {
      headers: headers("1"),
    });
    const detail = await app.request(`https://triagem.test/triagem/solicitations/${ITEM_ID}`, {
      headers: headers("1"),
    });
    const closed = await app.request(
      `https://triagem.test/triagem/solicitations/${ITEM_ID}/close`,
      { method: "PATCH", headers: headers() },
    );

    expect([created.status, listed.status, detail.status, closed.status]).toEqual([
      201, 200, 200, 200,
    ]);
    const scope = expect.objectContaining({ userId: USER_ID, organizationId: ORGANIZATION_ID });
    expect(solicitations.create).toHaveBeenCalledWith(body, scope);
    expect(solicitations.list).toHaveBeenCalledWith(
      { status: "OPEN", clientId: undefined, competence: undefined },
      scope,
    );
    expect(solicitations.get).toHaveBeenCalledWith(ITEM_ID, scope);
    expect(solicitations.close).toHaveBeenCalledWith(ITEM_ID, scope);

    const counts = { xml_inbound: 3, xml_outbound: 5, nfse_issued: 2, nfse_received: 1 };
    const countsUrl = `https://triagem.test/triagem/solicitations/${ITEM_ID}/note-counts`;
    const read = await app.request(countsUrl, { headers: headers("1") });
    const saved = await app.request(countsUrl, {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify(counts),
    });
    expect([read.status, saved.status]).toEqual([200, 200]);
    expect(solicitations.getNoteCounts).toHaveBeenCalledWith(ITEM_ID, scope);
    expect(solicitations.updateNoteCounts).toHaveBeenCalledWith(ITEM_ID, counts, scope);

    const indicators = await app.request(
      "https://triagem.test/triagem/solicitations/indicators?competence=2026-09",
      { headers: headers("1") },
    );
    expect(indicators.status).toBe(200);
    expect(solicitations.indicators).toHaveBeenCalledWith({ competence: "2026-09" }, scope);
    expect(solicitations.get).toHaveBeenCalledTimes(1);
  });
});

describe("triagem Worker — OpenAPI docs", () => {
  const app = (extra: Partial<TriagemWorkerEnv>) =>
    createTriagemWorkerApp({ env: { ...env(), ...extra } });

  it("serve /openapi.json e /docs com ENABLE_API_DOCS fora de produção", async () => {
    const docsApp = app({ ENABLE_API_DOCS: "true" });
    const spec = await docsApp.request("https://triagem.test/openapi.json");
    expect(spec.status).toBe(200);
    expect(((await spec.json()) as { paths: Record<string, unknown> }).paths).toHaveProperty(
      "/triagem/overview",
    );
    const docs = await docsApp.request("https://triagem.test/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
    const html = await docs.text();
    expect(html).toContain("<title>triagem-service - OpenAPI</title>");
    expect(html).toContain('url: "/openapi.json"');
  });

  it.each([
    {},
    { ENABLE_API_DOCS: "false" },
    { ENABLE_API_DOCS: "true", NODE_ENV: "production" },
  ])("oculta /openapi.json e /docs com %o", async (extra) => {
    const docsApp = app(extra);
    expect((await docsApp.request("https://triagem.test/openapi.json")).status).toBe(404);
    expect((await docsApp.request("https://triagem.test/docs")).status).toBe(404);
  });
});
