import { describe, expect, it, vi } from "vitest";
import { type ClientWorkerEnv, type ClientWorkerService, createClientWorkerApp } from "./app.js";

const USER_ID = "c0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000002";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const HISTORY_ID = "d0000000-0000-4000-8000-000000000001";
const PENDING_ID = "e0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "client-gateway-internal-token";
const REGIME_ID = "f0000000-0000-4000-8000-000000000001";

function env(): ClientWorkerEnv {
  return {
    JWT_SECRET: "client-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function headers(overrides: Record<string, string> = {}): HeadersInit {
  return {
    "x-internal-service-token": INTERNAL_TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-type": "owner",
    "x-auth-modules": JSON.stringify({ integracao: 3 }),
    ...overrides,
  };
}

function client() {
  return {
    id: CLIENT_ID,
    name: "Acme",
    organization_id: ORGANIZATION_ID,
    status: "Ativo",
    cpf_cnpj: "",
    company_name: null,
    fantasy_name: null,
    service_unique: false,
    deletion_date: null,
    organization: {
      id: ORGANIZATION_ID,
      name: "Acme Org",
      slug: "acme-org",
      logo_url: null,
      status: "active",
      subscription_plan: "trial",
    },
  };
}

function service(): ClientWorkerService {
  return {
    listByOrganization: vi.fn(async () => ({
      items: [client()],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    })),
    getById: vi.fn(async () => client()),
    create: vi.fn(async () => client()),
    update: vi.fn(async () => client()),
    deactivate: vi.fn(async () => client()),
    activate: vi.fn(async () => client()),
    lookupCnpj: vi.fn(async () => ({ cnpj: "12345678000195", name: "Acme" })),
    createIntegration: vi.fn(async () => client()),
    updateIntegration: vi.fn(async () => client()),
    listHistories: vi.fn(async () => ({ list: [] })),
    createHistory: vi.fn(async () => ({
      id: HISTORY_ID,
      client_id: CLIENT_ID,
      history: "Contato",
    })),
    getHistory: vi.fn(async () => ({ detail: { id: HISTORY_ID, client_id: CLIENT_ID } })),
    updateHistory: vi.fn(async () => ({ id: HISTORY_ID, history: "Atualizado" })),
    createPending: vi.fn(async () => ({ id: PENDING_ID, client_id: CLIENT_ID, reason: "Retorno" })),
    listPending: vi.fn(async () => ({ list: [] })),
    deletePending: vi.fn(async () => undefined),
    deleteHistory: vi.fn(async () => undefined),
    createPA: vi.fn(async () => ({ client_id: CLIENT_ID })),
    getPADetail: vi.fn(async () => ({ client_id: CLIENT_ID })),
    updatePA: vi.fn(async () => ({ client_id: CLIENT_ID })),
    terminate: vi.fn(async () => ({ id: "termination-1" })),
    updateFinance: vi.fn(async () => ({ id: CLIENT_ID })),
    updateRegularize: vi.fn(async () => ({ id: CLIENT_ID })),
    runCompetenceOutputUpdate: vi.fn(async () => ({ updated: 0 })),
    applyCommercialProjection: vi.fn(async () => ({ applied: true })),
    reportingCatalog: vi.fn(async () => ({ sources: [], relations: [] })),
    extractReporting: vi.fn(async () => ({ rows: [], reachedLimit: false })),
    listRegimes: vi.fn(async () => [{ id: REGIME_ID, name: "MEI" }]),
    createRegime: vi.fn(async () => ({ id: REGIME_ID, name: "MEI" })),
    updateRegime: vi.fn(async () => ({ id: REGIME_ID, name: "Imune" })),
    listSegments: vi.fn(async () => [{ id: REGIME_ID, name: "Varejo", type: "comercio" }]),
    createSegment: vi.fn(async () => ({ id: REGIME_ID, name: "Varejo", type: "comercio" })),
    updateSegment: vi.fn(async () => ({ id: REGIME_ID, name: "Atacado", type: "comercio" })),
    listGroups: vi.fn(async () => []),
    createGroup: vi.fn(async () => ({ id: REGIME_ID, name: "Holding", status: true, clients: [] })),
    updateGroup: vi.fn(async () => ({
      id: REGIME_ID,
      name: "Holding",
      status: false,
      clients: [],
    })),
    replaceGroupClients: vi.fn(async () => ({ id: REGIME_ID, clients: [{ id: CLIENT_ID }] })),
    listLicitacaoHistory: vi.fn(async () => []),
    listLicitacaoBidders: vi.fn(async () => []),
  };
}

describe("client Worker", () => {
  it("returns success envelopes for health and readiness", async () => {
    const app = createClientWorkerApp({ env: env(), clientService: service() });

    const health = await app.request("https://client.test/health");
    const ready = await app.request("https://client.test/ready");

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      success: true,
      data: { status: "ok", service: "client-service" },
    });
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({
      success: true,
      data: { status: "ready", service: "client-service" },
    });
  });

  it("rejects client routes without authentication", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService });

    const response = await app.request("https://client.test/client/list");

    expect(response.status).toBe(401);
    expect(clientService.listByOrganization).not.toHaveBeenCalled();
  });

  it("uses the authenticated organization for list and rejects cross-organization create", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService });

    const list = await app.request("https://client.test/client/list", { headers: headers() });
    const create = await app.request("https://client.test/client", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({
        organization_id: OTHER_ORGANIZATION_ID,
        name: "Forbidden",
        status: "Ativo",
      }),
    });

    expect(list.status).toBe(200);
    expect(clientService.listByOrganization).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      expect.objectContaining({ page: 1, pageSize: 20 }),
      expect.anything(),
    );
    expect(create.status).toBe(403);
    expect(clientService.create).not.toHaveBeenCalled();
  });

  it("serves the regime catalog of the authenticated organization before /client/:id", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService });
    const json = { ...headers(), "content-type": "application/json" };

    const list = await app.request("https://client.test/client/regimes", { headers: headers() });
    const create = await app.request("https://client.test/client/regimes", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ name: " MEI " }),
    });
    const update = await app.request(`https://client.test/client/regimes/${REGIME_ID}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ name: "Imune" }),
    });
    const blank = await app.request("https://client.test/client/regimes", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ name: "  " }),
    });

    expect(list.status).toBe(200);
    expect(clientService.listRegimes).toHaveBeenCalledWith(ORGANIZATION_ID, expect.anything());
    expect(create.status).toBe(201);
    expect(clientService.createRegime).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      "MEI",
      expect.anything(),
    );
    expect(update.status).toBe(200);
    expect(clientService.updateRegime).toHaveBeenCalledWith(
      REGIME_ID,
      ORGANIZATION_ID,
      "Imune",
      expect.anything(),
    );
    expect(blank.status).toBe(400);
    expect(clientService.getById).not.toHaveBeenCalled();
  });

  it("serves typed segments and validates the legacy type", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService });
    const json = { ...headers(), "content-type": "application/json" };

    const list = await app.request("https://client.test/client/segments", { headers: headers() });
    const create = await app.request("https://client.test/client/segments", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ name: "Varejo", type: "comercio" }),
    });
    const invalidType = await app.request("https://client.test/client/segments", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ name: "Varejo", type: "agro" }),
    });
    const update = await app.request(`https://client.test/client/segments/${REGIME_ID}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ type: "industria" }),
    });
    const empty = await app.request(`https://client.test/client/segments/${REGIME_ID}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({}),
    });

    expect(list.status).toBe(200);
    expect(clientService.listSegments).toHaveBeenCalledWith(ORGANIZATION_ID, expect.anything());
    expect(create.status).toBe(201);
    expect(clientService.createSegment).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      { name: "Varejo", type: "comercio" },
      expect.anything(),
    );
    expect(invalidType.status).toBe(400);
    expect(update.status).toBe(200);
    expect(clientService.updateSegment).toHaveBeenCalledWith(
      REGIME_ID,
      ORGANIZATION_ID,
      { type: "industria" },
      expect.anything(),
    );
    expect(empty.status).toBe(400);
  });

  it("serves canonical groups before /client/:id and validates the payloads", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService });
    const json = { ...headers(), "content-type": "application/json" };

    const list = await app.request("https://client.test/client/groups", { headers: headers() });
    const create = await app.request("https://client.test/client/groups", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ name: "Holding" }),
    });
    const inactivate = await app.request(`https://client.test/client/groups/${REGIME_ID}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ status: false }),
    });
    const emptyPatch = await app.request(`https://client.test/client/groups/${REGIME_ID}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({}),
    });
    const members = await app.request(`https://client.test/client/groups/${REGIME_ID}/clients`, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ client_ids: [CLIENT_ID] }),
    });
    const badMember = await app.request(`https://client.test/client/groups/${REGIME_ID}/clients`, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ client_ids: ["nao-e-uuid"] }),
    });

    expect(list.status).toBe(200);
    expect(clientService.listGroups).toHaveBeenCalledWith(ORGANIZATION_ID, expect.anything());
    expect(create.status).toBe(201);
    expect(inactivate.status).toBe(200);
    expect(clientService.updateGroup).toHaveBeenCalledWith(
      REGIME_ID,
      ORGANIZATION_ID,
      { status: false },
      expect.anything(),
    );
    expect(emptyPatch.status).toBe(400);
    expect(members.status).toBe(200);
    expect(clientService.replaceGroupClients).toHaveBeenCalledWith(
      REGIME_ID,
      ORGANIZATION_ID,
      [CLIENT_ID],
      expect.anything(),
    );
    expect(badMember.status).toBe(400);
    expect(clientService.getById).not.toHaveBeenCalled();
  });

  it("serves licitação bidders before /client/:id and the history per client", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService });

    const bidders = await app.request("https://client.test/client/licitacao/bidders", {
      headers: headers(),
    });
    const history = await app.request(`https://client.test/client/${CLIENT_ID}/licitacao/history`, {
      headers: headers(),
    });
    const badId = await app.request("https://client.test/client/nao-e-uuid/licitacao/history", {
      headers: headers(),
    });

    expect(bidders.status).toBe(200);
    expect(clientService.listLicitacaoBidders).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      expect.anything(),
    );
    expect(history.status).toBe(200);
    expect(clientService.listLicitacaoHistory).toHaveBeenCalledWith(
      CLIENT_ID,
      ORGANIZATION_ID,
      expect.anything(),
    );
    expect(badId.status).toBe(400);
    expect(clientService.getById).not.toHaveBeenCalled();
  });

  it("preserves representative CRUD and validation behavior", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService });

    const created = await app.request("https://client.test/client", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ name: "Acme", status: "Ativo" }),
    });
    const detail = await app.request(`https://client.test/client/${CLIENT_ID}`, {
      headers: headers(),
    });
    const invalid = await app.request("https://client.test/client", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ status: "Ativo" }),
    });

    expect(created.status).toBe(201);
    expect(detail.status).toBe(200);
    expect(invalid.status).toBe(400);
    expect(clientService.create).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: ORGANIZATION_ID, name: "Acme" }),
      expect.anything(),
    );
    expect(clientService.getById).toHaveBeenCalledWith(
      CLIENT_ID,
      ORGANIZATION_ID,
      expect.anything(),
    );
  });

  it("keeps integration and history flows under the same organization", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService });

    const integration = await app.request(
      "https://client.test/client/integration?cnpj=12.345.678/0001-95",
      {
        headers: headers(),
      },
    );
    const history = await app.request(`https://client.test/client/${CLIENT_ID}/histories`, {
      headers: headers(),
    });
    const pending = await app.request(`https://client.test/client/${CLIENT_ID}/histories/pending`, {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ reason: "Retorno" }),
    });

    expect(integration.status).toBe(200);
    expect(history.status).toBe(200);
    expect(pending.status).toBe(201);
    expect(clientService.lookupCnpj).toHaveBeenCalledWith("12345678000195", ORGANIZATION_ID);
    expect(clientService.listHistories).toHaveBeenCalledWith(CLIENT_ID, ORGANIZATION_ID);
    expect(clientService.createPending).toHaveBeenCalledWith(
      CLIENT_ID,
      ORGANIZATION_ID,
      USER_ID,
      "Retorno",
    );
  });

  it("creates a history with a multipart attachment", async () => {
    const clientService = service();
    const historyStorage = {
      upload: vi.fn(async () => `clients/historys/${CLIENT_ID}/doc.pdf`),
      createSignedAccessUrl: vi.fn(),
      download: vi.fn(),
      remove: vi.fn(),
    };
    const app = createClientWorkerApp({ env: env(), clientService, historyStorage });
    const form = new FormData();
    form.append("date", "2026-09-23T12:00:00.000Z");
    form.append("history", "Contato com anexo");
    form.append("file", new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" }));

    const response = await app.request(`https://client.test/client/${CLIENT_ID}/histories`, {
      method: "POST",
      headers: headers(),
      body: form,
    });

    expect(response.status).toBe(201);
    expect(historyStorage.upload).toHaveBeenCalledWith(CLIENT_ID, expect.any(File));
    expect(clientService.createHistory).toHaveBeenCalledWith(
      CLIENT_ID,
      ORGANIZATION_ID,
      USER_ID,
      expect.objectContaining({
        history: "Contato com anexo",
        file: `clients/historys/${CLIENT_ID}/doc.pdf`,
      }),
    );
  });

  it("removes the uploaded attachment when the history insert fails", async () => {
    const clientService = service();
    vi.mocked(clientService.createHistory).mockRejectedValueOnce(new Error("db down"));
    const historyStorage = {
      upload: vi.fn(async () => "clients/historys/orphan.pdf"),
      createSignedAccessUrl: vi.fn(),
      download: vi.fn(),
      remove: vi.fn(async () => undefined),
    };
    const app = createClientWorkerApp({ env: env(), clientService, historyStorage });
    const form = new FormData();
    form.append("date", "2026-09-23T12:00:00.000Z");
    form.append("history", "Contato");
    form.append("file", new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" }));

    const response = await app.request(`https://client.test/client/${CLIENT_ID}/histories`, {
      method: "POST",
      headers: headers(),
      body: form,
    });

    expect(response.status).toBe(500);
    expect(historyStorage.remove).toHaveBeenCalledWith("clients/historys/orphan.pdf");
  });

  it("rejects a non-file attachment instead of ignoring it", async () => {
    const app = createClientWorkerApp({ env: env(), clientService: service() });

    const response = await app.request(`https://client.test/client/${CLIENT_ID}/histories`, {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({
        date: "2026-09-23T12:00:00.000Z",
        history: "Contato",
        file: "doc.pdf",
      }),
    });

    expect(response.status).toBe(400);
  });

  it("edits a history keeping the offset datetime and rejects one without offset", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService });
    const patch = (date: string) =>
      app.request(`https://client.test/client/${CLIENT_ID}/histories/${HISTORY_ID}`, {
        method: "PATCH",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ date, history: "Contato" }),
      });

    const withOffset = await patch("2026-09-23T10:00:00-03:00");
    const withoutOffset = await patch("2026-09-23T10:00");

    expect(withOffset.status).toBe(200);
    expect(clientService.updateHistory).toHaveBeenCalledWith(
      HISTORY_ID,
      ORGANIZATION_ID,
      USER_ID,
      expect.objectContaining({ date: new Date("2026-09-23T13:00:00.000Z") }),
    );
    expect(withoutOffset.status).toBe(400);
    expect(((await withoutOffset.json()) as { error: string }).error).toBe(
      "Informe data e hora com fuso horário (ISO 8601).",
    );
    expect(clientService.updateHistory).toHaveBeenCalledTimes(1);
  });

  it("deletes a history passing whether the caller manages the organization", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService });
    const remove = (extra: Record<string, string>) =>
      app.request(`https://client.test/client/${CLIENT_ID}/histories/${HISTORY_ID}`, {
        method: "DELETE",
        headers: headers(extra),
      });

    const byOwner = await remove({});
    const byUser = await remove({ "x-auth-type": "user", "x-auth-permission": "1" });

    expect(byOwner.status).toBe(200);
    expect(byUser.status).toBe(200);
    expect(clientService.deleteHistory).toHaveBeenNthCalledWith(
      1,
      CLIENT_ID,
      HISTORY_ID,
      ORGANIZATION_ID,
      USER_ID,
      true,
    );
    expect(clientService.deleteHistory).toHaveBeenNthCalledWith(
      2,
      CLIENT_ID,
      HISTORY_ID,
      ORGANIZATION_ID,
      USER_ID,
      false,
    );
  });

  it("rejects unknown multipart fields with a Portuguese message", async () => {
    const app = createClientWorkerApp({ env: env(), clientService: service() });
    const form = new FormData();
    form.append("date", "2026-09-23T12:00:00.000Z");
    form.append("history", "Contato");
    form.append("extra", "x");

    const response = await app.request(`https://client.test/client/${CLIENT_ID}/histories`, {
      method: "POST",
      headers: headers(),
      body: form,
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Campo não permitido no histórico.");
  });
});
