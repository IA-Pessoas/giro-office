import { describe, expect, it, vi } from "vitest";
import {
  createTriagemWorkerApp,
  type TriagemAuditService,
  type TriagemCatalogPrisma,
  type TriagemCatalogService,
  type TriagemCompetenceService,
  type TriagemExternalLinkService,
  type TriagemOverviewService,
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
    const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as TriagemCatalogPrisma;
    const app = createTriagemWorkerApp({ env: env(), prisma, catalogService: service() });
    expect((await app.request("https://triagem.test/health")).status).toBe(200);
    expect((await app.request("https://triagem.test/ready")).status).toBe(200);
  });

  it("requires authentication and module permission", async () => {
    const catalogService = service();
    const app = createTriagemWorkerApp({ env: env(), catalogService });
    expect((await app.request("https://triagem.test/triagem/catalogs")).status).toBe(401);
    expect(
      (await app.request("https://triagem.test/triagem/catalogs", { headers: headers("0") }))
        .status,
    ).toBe(403);
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
    expect(catalogService.list).toHaveBeenCalledWith(ORGANIZATION_ID, {
      kind: "LINK_TYPE",
      include_archived: false,
    });
    expect(catalogService.create).toHaveBeenCalledWith(ORGANIZATION_ID, {
      kind: "LINK_TYPE",
      code: "gov",
      label: "Governo",
    });
    expect(catalogService.update).toHaveBeenCalledWith(ORGANIZATION_ID, ITEM_ID, {
      label: "Governo Federal",
    });
    expect(catalogService.archive).toHaveBeenCalledWith(ORGANIZATION_ID, ITEM_ID);
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
