import { hashCsrfToken } from "@workspace/runtime";
import { describe, expect, it, vi } from "vitest";
import { type ContabilWorkerEnv, createContabilWorkerApp } from "./app.js";
import { reportingBodyHash } from "./reporting.js";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TOKEN = "contabil-internal-token";

function env(): ContabilWorkerEnv {
  return {
    JWT_SECRET: "contabil-worker-secret",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    REPORTS_INTERNAL_TOKEN: "reports-token",
    REPORTS_GRANT_SECRET: "reports-secret",
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function headers(permission = "2"): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER,
    "x-auth-organization-id": ORG,
    "x-auth-permission": permission,
    "x-auth-kind": "organization",
    "x-auth-modules": JSON.stringify({ contabil: Number(permission), fiscal: 2 }),
  };
}

function encode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function signJwt(claims: Record<string, unknown>): Promise<string> {
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("contabil-worker-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${encode(new Uint8Array(signature))}`;
}

async function signedReportingHeaders(
  body: Record<string, unknown>,
  operation: "extract" = "extract",
  granted: { source: string; fields: readonly string[] } = {
    source: "contabil.control",
    fields: ["competence"],
  },
): Promise<HeadersInit> {
  const requestId = "report-request";
  const grant = {
    version: 1,
    audience: "contabil-service",
    operation,
    source: operation === "catalog" ? "contabil.catalog" : granted.source,
    organization_id: ORG,
    fields: operation === "catalog" ? [] : granted.fields,
    request_id: requestId,
    issued_at: Math.floor(Date.now() / 1000) - 1,
    expires_at: Math.floor(Date.now() / 1000) + 30,
    body_sha256: await reportingBodyHash(body),
  };
  const grantText = encode(JSON.stringify(grant, Object.keys(grant).sort()));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("reports-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(grantText));
  return {
    "x-internal-service-token": "reports-token",
    "x-reports-grant": grantText,
    "x-reports-grant-signature": Array.from(new Uint8Array(signature), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
    "x-request-id": requestId,
  };
}

function services() {
  return {
    controlService: {
      list: vi.fn(async () => ({ competence: "2026-09", items: [] })),
      create: vi.fn(async () => ({ control: { id: ID }, created: true })),
      createYear: vi.fn(async () => ({ competences: [], created: 0, existing: 12 })),
      detail: vi.fn(async () => ({ id: ID })),
      updateField: vi.fn(async () => ({ id: ID })),
      completeAll: vi.fn(async () => ({ id: ID })),
      archiveCompetence: vi.fn(async () => ({ controls: 1 })),
      restoreCompetence: vi.fn(async () => ({ controls: 1 })),
    },
    relationshipService: {
      create: vi.fn(async () => ({ id: ID })),
      update: vi.fn(async () => ({ id: ID })),
      getByClientId: vi.fn(async () => ({ id: ID })),
      delete: vi.fn(async () => ({ message: "Registro deletado com sucesso." })),
    },
    responsibleService: {
      create: vi.fn(async () => ({ id: ID })),
      update: vi.fn(async () => ({ id: ID })),
      getByClientId: vi.fn(async () => ({ id: ID })),
      delete: vi.fn(async () => ({ message: "Registro deletado com sucesso." })),
    },
    triageClosingService: {
      get: vi.fn(async () => ({ client_id: CLIENT, status: "NOT_RECEIVED" })),
      update: vi.fn(async () => ({ id: ID, status: "CLOSED" })),
      archive: vi.fn(async () => ({ id: ID, archived_at: "2026-09-22" })),
    },
    triageDocumentsService: {
      listFiscalPortfolio: vi.fn(async () => ({ competence: "2026-09", items: [] })),
      getEditability: vi.fn(async () => ({ can_edit: true })),
      getMonthly: vi.fn(async () => ({ id: ID })),
      getOrCreateMonthly: vi.fn(async () => ({ id: ID })),
      updateItem: vi.fn(async () => ({ id: ID })),
      updateAll: vi.fn(async () => ({ id: ID })),
      updateMonthly: vi.fn(async () => ({ id: ID })),
      getConfig: vi.fn(async () => ({ active_items: [] })),
      saveConfig: vi.fn(async () => ({ active_items: [] })),
      getFiscalSettings: vi.fn(async () => ({ priority: false, delivery_method: null })),
      saveFiscalSettings: vi.fn(async () => ({ priority: true, delivery_method: null })),
      listStatements: vi.fn(async () => []),
      listStatementHistory: vi.fn(async () => ({ client_id: CLIENT, competences: [] })),
      listClouds: vi.fn(async () => []),
      createCloud: vi.fn(async () => ({ id: ID })),
      updateCloud: vi.fn(async () => ({ id: ID })),
      upsertStatement: vi.fn(async () => ({ id: ID })),
      archiveStatement: vi.fn(async () => ({ id: ID })),
    },
    reportingService: {
      extract: vi.fn(async () => ({ rows: [], reachedLimit: false })),
    },
  };
}

describe("contabil Worker remainder routes", () => {
  it("expõe controles de escrita com permissão e tenant encaminhados", async () => {
    const deps = services();
    const app = createContabilWorkerApp({ env: env(), ...deps });

    const response = await app.request("https://contabil.test/contabil/controls", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ client_id: CLIENT, competence: "2026-09" }),
    });

    expect(response.status).toBe(201);
    expect(deps.controlService.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: CLIENT, organizationId: ORG, userId: USER }),
    );
  });

  it("expõe relacionamentos, responsáveis e fechamento de triagem", async () => {
    const deps = services();
    const app = createContabilWorkerApp({ env: env(), ...deps });

    const relationship = await app.request("https://contabil.test/contabil/relationships", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT,
        bidding: true,
        chart_accounts: "Plano",
        tool: "ERP",
        system: "Sistema",
        note: "Nota",
      }),
    });
    const responsible = await app.request(
      `https://contabil.test/contabil/responsibles/client/${CLIENT}`,
      { headers: headers("1") },
    );
    const closing = await app.request(
      `https://contabil.test/triagem/closing?client_id=${CLIENT}&competence=2026-09`,
      {
        headers: headers("1"),
      },
    );

    expect(relationship.status).toBe(201);
    expect(responsible.status).toBe(200);
    expect(closing.status).toBe(200);
    expect(deps.relationshipService.create).toHaveBeenCalled();
    expect(deps.responsibleService.getByClientId).toHaveBeenCalledWith(CLIENT, ORG);
    expect(deps.triageClosingService.get).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: expect.any(String) }),
      ORG,
    );
  });

  it("relacionamento aceita estados não selecionados e exige permissão Contábil (#1721)", async () => {
    const deps = services();
    const app = createContabilWorkerApp({ env: env(), ...deps });
    const put = (permission: string) =>
      app.request(`https://contabil.test/contabil/relationships/${ID}`, {
        method: "PUT",
        headers: { ...headers(permission), "content-type": "application/json" },
        body: JSON.stringify({ bidding: null, chart_accounts: null }),
      });

    expect((await put("2")).status).toBe(200);
    expect(deps.relationshipService.update).toHaveBeenCalledWith(
      ID,
      { bidding: null, chart_accounts: null },
      expect.objectContaining({ organizationId: ORG, userId: USER }),
    );
    expect((await put("1")).status).toBe(403);
    const read = await app.request(
      `https://contabil.test/contabil/relationships/client/${CLIENT}`,
      { headers: headers("0") },
    );
    expect(read.status).toBe(403);
    expect(deps.relationshipService.update).toHaveBeenCalledTimes(1);
    expect(deps.relationshipService.getByClientId).not.toHaveBeenCalled();
  });

  it("histórico do controle lê a auditoria da organização e exige módulo Contábil (#1722)", async () => {
    const prisma = {
      controlContabil: { findFirst: vi.fn(async () => ({ id: ID })) },
      auditRequest: {
        findMany: vi.fn(async () => [
          {
            id: "audit-1",
            user_id: USER,
            created_at: new Date("2026-09-10T12:00:00.000Z"),
            action: "Atualização",
            changes_json: { depreciation: { from: false, to: true } },
          },
        ]),
        count: vi.fn(async () => 1),
      },
      user: { findMany: vi.fn(async () => [{ id: USER, name: "Ana" }]) },
    };
    const app = createContabilWorkerApp({ env: env(), prisma: prisma as never });
    const url = `https://contabil.test/contabil/controls/history?client_id=${CLIENT}&competence=2026-09&organization_id=forged`;

    const forged = await app.request(url, { headers: headers("1") });
    const denied = await app.request(url, { headers: headers("0") });

    expect(forged.status).toBe(400);
    expect(denied.status).toBe(403);
    const ok = await app.request(url.replace("&organization_id=forged", ""), {
      headers: headers("1"),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      data: {
        total: 1,
        items: [
          {
            actor: { id: USER, name: "Ana" },
            changes: [{ field: "depreciation", from: false, to: true }],
          },
        ],
      },
    });
    expect(prisma.controlContabil.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organization_id: ORG }) }),
    );
    expect(prisma.auditRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organization_id: ORG }) }),
    );
  });

  it("histórico do relacionamento lê a auditoria da organização e exige módulo Contábil (#1723)", async () => {
    const prisma = {
      relationshipContabil: { findFirst: vi.fn(async () => ({ id: ID })) },
      auditRequest: {
        findMany: vi.fn(async () => [
          {
            id: "audit-1",
            user_id: USER,
            created_at: new Date("2026-10-01T10:00:00.000Z"),
            action: "Atualização",
            changes_json: { bidding: { from: true, to: null } },
          },
        ]),
        count: vi.fn(async () => 1),
      },
      user: { findMany: vi.fn(async () => [{ id: USER, name: "Ana" }]) },
    };
    const app = createContabilWorkerApp({ env: env(), prisma: prisma as never });
    const url = `https://contabil.test/contabil/relationships/client/${CLIENT}/history`;

    const denied = await app.request(url, { headers: headers("0") });
    const ok = await app.request(url, { headers: headers("1") });

    expect(denied.status).toBe(403);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      data: { total: 1, items: [{ changes: [{ field: "bidding", from: true, to: null }] }] },
    });
    expect(prisma.relationshipContabil.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORG, client_id: CLIENT } }),
    );
    expect(prisma.auditRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organization_id: ORG }) }),
    );
  });

  it("expõe triagem documental com validação de entrada", async () => {
    const deps = services();
    const app = createContabilWorkerApp({ env: env(), ...deps });

    const monthly = await app.request(
      `https://contabil.test/triagem/monthly?client_id=${CLIENT}&competence=2026-09`,
      { headers: headers("2") },
    );
    const invalid = await app.request("https://contabil.test/triagem/statements", {
      headers: headers("2"),
    });
    const portfolio = await app.request(
      "https://contabil.test/triagem/fiscal-portfolio?competence=2026-09",
      { headers: headers("2") },
    );
    const invalidPortfolio = await app.request(
      "https://contabil.test/triagem/fiscal-portfolio?competence=2026-13",
      { headers: headers("2") },
    );

    expect(monthly.status).toBe(200);
    expect(invalid.status).toBe(400);
    expect(portfolio.status).toBe(200);
    expect(invalidPortfolio.status).toBe(400);
    expect(deps.triageDocumentsService.listFiscalPortfolio).toHaveBeenCalledOnce();
    expect(deps.triageDocumentsService.listFiscalPortfolio).toHaveBeenCalledWith(
      "2026-09",
      expect.objectContaining({ organizationId: ORG }),
    );
    expect(deps.triageDocumentsService.getMonthly).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: CLIENT, competence: "2026-09" }),
      expect.objectContaining({ organizationId: ORG }),
    );
  });

  it("aplica na carteira fiscal os mesmos filtros da tela", async () => {
    const deps = services();
    const row = (legal_name: string, extra: Record<string, unknown>) => ({
      legal_name,
      cpf_cnpj: "",
      regime: null,
      responsible_id: null,
      planned_checklist: null,
      monthly: null,
      ...extra,
    });
    deps.triageDocumentsService.listFiscalPortfolio.mockResolvedValue({
      competence: "2026-09",
      items: [
        row("Alfa", {
          regime: "Simples Nacional",
          responsible_id: USER,
          monthly: {
            checklist: { inbound_report: "NOT_PRESENT" },
            item_notes: { inbound_report: { note: null, justification: "Sem movimento" } },
          },
        }),
        row("Beta", { regime: "Simples Nacional", responsible_id: USER }),
        row("Gama", {}),
      ],
    });
    const app = createContabilWorkerApp({ env: env(), ...deps });
    const get = (query: string) =>
      app.request(`https://contabil.test/triagem/fiscal-portfolio?competence=2026-09&${query}`, {
        headers: headers("2"),
      });

    const filtered = await get(
      `responsible_id=${USER}&regime=Simples%20Nacional&document_field=inbound_report&justification=with`,
    );
    const byStatus = await get("document_field=inbound_report&document_status=NOT_STARTED");
    const invalid = await get("justification=talvez");

    expect(filtered.status).toBe(200);
    expect(
      (await filtered.json()).data.items.map((item: { legal_name: string }) => item.legal_name),
    ).toEqual(["Alfa"]);
    expect(
      (await byStatus.json()).data.items.map((item: { legal_name: string }) => item.legal_name),
    ).toEqual(["Beta", "Gama"]);
    expect(invalid.status).toBe(400);
  });

  it("carteiras filtradas exigem sessão e consultam só a organização do token (#1690)", async () => {
    const OTHER_ORG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const deps = services();
    const app = createContabilWorkerApp({ env: env(), ...deps });
    const urls = [
      "https://contabil.test/triagem/fiscal-portfolio?competence=2025-03&justification=with",
      "https://contabil.test/contabil/controls/list?competence=2025-03&status=CLOSED",
    ];
    const otherOrg = { ...headers("2"), "x-auth-organization-id": OTHER_ORG };

    for (const url of urls) {
      expect((await app.request(url)).status).toBe(401);
      expect((await app.request(url, { headers: otherOrg })).status).toBe(200);
    }

    expect(deps.triageDocumentsService.listFiscalPortfolio).toHaveBeenCalledOnce();
    expect(deps.triageDocumentsService.listFiscalPortfolio).toHaveBeenCalledWith(
      "2025-03",
      expect.objectContaining({ organizationId: OTHER_ORG }),
    );
    expect(deps.controlService.list).toHaveBeenCalledExactlyOnceWith("2025-03", OTHER_ORG);
  });

  it("filtra a carteira contábil por regime, responsável e estado do fechamento", async () => {
    const deps = services();
    deps.controlService.list.mockResolvedValue({
      competence: "2026-09",
      items: [
        {
          legal_name: "Alfa",
          regime: "Simples Nacional",
          person_responsible_id: USER,
          closing: { status: "CLOSED" },
        },
        {
          legal_name: "Beta",
          regime: null,
          person_responsible_id: null,
          closing: { status: "NOT_RECEIVED" },
        },
      ],
    });
    const app = createContabilWorkerApp({ env: env(), ...deps });
    const get = (query: string) =>
      app.request(`https://contabil.test/contabil/controls/list?competence=2026-09&${query}`, {
        headers: headers("2"),
      });

    const byOwner = await get(`responsible_id=${USER}&regime=Simples%20Nacional&status=CLOSED`);
    const unassigned = await get("responsible_id=none&regime=N%C3%A3o%20informado");
    const invalid = await get("status=QUALQUER");

    expect(
      (await byOwner.json()).data.items.map((item: { legal_name: string }) => item.legal_name),
    ).toEqual(["Alfa"]);
    expect(
      (await unassigned.json()).data.items.map((item: { legal_name: string }) => item.legal_name),
    ).toEqual(["Beta"]);
    expect(invalid.status).toBe(400);
    expect(deps.controlService.list).toHaveBeenCalledWith("2026-09", ORG);
  });

  it("movimento mensal e movimento padrão validam corpo e usam a organização do token (#1691)", async () => {
    const deps = services();
    const app = createContabilWorkerApp({ env: env(), ...deps });
    const send = (method: string, path: string, body?: unknown, auth = true) =>
      app.request(`https://contabil.test${path}`, {
        method,
        headers: auth ? { ...headers("2"), "content-type": "application/json" } : {},
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    const monthly = await send("PATCH", `/triagem/monthly/${ID}`, {
      type: "CONTABIL",
      triad_moviment: true,
      download_date: "2026-10-03",
    });
    const emptyMonthly = await send("PATCH", `/triagem/monthly/${ID}`, { type: "CONTABIL" });
    const badDate = await send("PATCH", `/triagem/monthly/${ID}`, { download_date: "03/10/2026" });
    const impossibleDate = await send("PATCH", `/triagem/monthly/${ID}`, {
      settlement_date: "2026-02-31",
    });
    const config = await send("PUT", "/triagem/config", {
      client_id: CLIENT,
      active_items: ["bank_reconciliation"],
    });
    const fiscalField = await send("PUT", "/triagem/config", {
      client_id: CLIENT,
      active_items: ["inbound_report"],
    });
    const read = await send("GET", `/triagem/config?client_id=${CLIENT}`);
    const anonymous = await send("GET", `/triagem/config?client_id=${CLIENT}`, undefined, false);

    expect(monthly.status).toBe(200);
    expect([
      emptyMonthly.status,
      badDate.status,
      impossibleDate.status,
      fiscalField.status,
    ]).toEqual([400, 400, 400, 400]);
    expect(config.status).toBe(200);
    expect(read.status).toBe(200);
    expect(anonymous.status).toBe(401);
    expect(deps.triageDocumentsService.updateMonthly).toHaveBeenCalledExactlyOnceWith(
      ID,
      { type: "CONTABIL", triad_moviment: true, download_date: "2026-10-03" },
      expect.objectContaining({ organizationId: ORG }),
    );
    expect(deps.triageDocumentsService.saveConfig).toHaveBeenCalledExactlyOnceWith(
      { client_id: CLIENT, type: "CONTABIL", active_items: ["bank_reconciliation"] },
      expect.objectContaining({ organizationId: ORG }),
    );
    expect(deps.triageDocumentsService.getConfig).toHaveBeenCalledExactlyOnceWith(
      { client_id: CLIENT, type: "CONTABIL" },
      expect.objectContaining({ organizationId: ORG }),
    );
  });

  it("prioridade e meio de envio fiscal validam corpo e usam a organização do token (#1692)", async () => {
    const deps = services();
    const app = createContabilWorkerApp({ env: env(), ...deps });
    const send = (method: string, body?: unknown, query = "", auth = true) =>
      app.request(`https://contabil.test/triagem/fiscal-settings${query}`, {
        method,
        headers: auth ? { ...headers("2"), "content-type": "application/json" } : {},
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    const saved = await send("PUT", {
      client_id: CLIENT,
      priority: true,
      delivery_method: "EMAIL",
    });
    const empty = await send("PUT", { client_id: CLIENT });
    const textPriority = await send("PUT", { client_id: CLIENT, priority: "Sim" });
    const read = await send("GET", undefined, `?client_id=${CLIENT}`);
    const anonymous = await send("GET", undefined, `?client_id=${CLIENT}`, false);

    expect([saved.status, read.status]).toEqual([200, 200]);
    expect([empty.status, textPriority.status, anonymous.status]).toEqual([400, 400, 401]);
    expect(deps.triageDocumentsService.saveFiscalSettings).toHaveBeenCalledExactlyOnceWith(
      { client_id: CLIENT, priority: true, delivery_method: "EMAIL" },
      expect.objectContaining({ organizationId: ORG }),
    );
    expect(deps.triageDocumentsService.getFiscalSettings).toHaveBeenCalledExactlyOnceWith(
      { client_id: CLIENT },
      expect.objectContaining({ organizationId: ORG }),
    );
  });

  it("histórico bancário exige sessão e consulta a organização do token (#1694)", async () => {
    const deps = services();
    const app = createContabilWorkerApp({ env: env(), ...deps });
    const url = `https://contabil.test/triagem/statements/history?client_id=${CLIENT}&from=2026-01&to=2026-09&pending=true`;

    const anonymous = await app.request(url);
    const ok = await app.request(url, { headers: headers("2") });
    const inverted = await app.request(
      `https://contabil.test/triagem/statements/history?client_id=${CLIENT}&from=2026-09&to=2026-01`,
      { headers: headers("2") },
    );

    const denied = await app.request(url, {
      headers: {
        ...headers("0"),
        "x-auth-modules": JSON.stringify({ contabil: 0, triagem: 0, fiscal: 0 }),
      },
    });

    expect([anonymous.status, ok.status, inverted.status, denied.status]).toEqual([
      401, 200, 400, 403,
    ]);
    expect(deps.triageDocumentsService.listStatementHistory).toHaveBeenCalledExactlyOnceWith(
      { client_id: CLIENT, from: "2026-01", to: "2026-09", pending: true },
      expect.objectContaining({ organizationId: ORG }),
    );
  });

  it("nuvens do cliente validam link e usam a organização do token (#1695)", async () => {
    const deps = services();
    const app = createContabilWorkerApp({ env: env(), ...deps });
    const send = (method: string, path: string, body?: unknown, auth = true) =>
      app.request(`https://contabil.test${path}`, {
        method,
        headers: auth ? { ...headers("2"), "content-type": "application/json" } : {},
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    const created = await send("POST", "/triagem/clouds", {
      client_id: CLIENT,
      type: "Google Drive",
      link: "https://drive.example/pasta",
    });
    const script = await send("POST", "/triagem/clouds", {
      client_id: CLIENT,
      type: "Drive",
      link: "javascript:alert(1)",
    });
    const updated = await send("PATCH", `/triagem/clouds/${ID}`, { type: "OneDrive" });
    const listed = await send("GET", `/triagem/clouds?client_id=${CLIENT}`);
    const anonymous = await send("GET", `/triagem/clouds?client_id=${CLIENT}`, undefined, false);

    expect([
      created.status,
      script.status,
      updated.status,
      listed.status,
      anonymous.status,
    ]).toEqual([201, 400, 200, 200, 401]);
    expect(deps.triageDocumentsService.createCloud).toHaveBeenCalledExactlyOnceWith(
      { client_id: CLIENT, type: "Google Drive", link: "https://drive.example/pasta" },
      expect.objectContaining({ organizationId: ORG, userId: USER }),
    );
    expect(deps.triageDocumentsService.updateCloud).toHaveBeenCalledExactlyOnceWith(
      ID,
      { type: "OneDrive" },
      expect.objectContaining({ organizationId: ORG }),
    );
  });

  it("mantém reporting interno fechado sem token e grant válidos", async () => {
    const app = createContabilWorkerApp({ env: env(), ...services() });
    const response = await app.request("https://contabil.test/internal/reporting/catalog", {
      headers: { "x-request-id": "report-request" },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("valida CSRF e sessão antes de mutar por cookie", async () => {
    const csrf = "C".repeat(43);
    const token = await signJwt({
      user_id: USER,
      organization_id: ORG,
      permission: 2,
      modules: { contabil: 2 },
      session_id: "session-1",
      session_version: 1,
      csrf_hash: await hashCsrfToken(csrf),
    });
    const userService = { fetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })) };
    const deps = services();
    const app = createContabilWorkerApp({
      env: { ...env(), USER_SERVICE: userService, USER_SERVICE_INTERNAL_TOKEN: "user-token" },
      ...deps,
    });

    const rejected = await app.request("https://contabil.test/contabil/controls", {
      method: "POST",
      headers: {
        cookie: `cw.session=${token}; cw.csrf=${csrf}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ client_id: CLIENT, competence: "2026-09" }),
    });
    expect(rejected.status).toBe(403);
    expect(deps.controlService.create).not.toHaveBeenCalled();

    const accepted = await app.request("https://contabil.test/contabil/controls", {
      method: "POST",
      headers: {
        cookie: `cw.session=${token}; cw.csrf=${csrf}`,
        "x-csrf-token": csrf,
        "content-type": "application/json",
      },
      body: JSON.stringify({ client_id: CLIENT, competence: "2026-09" }),
    });
    expect(accepted.status).toBe(201);
    expect(userService.fetch).toHaveBeenCalledOnce();
  });

  it.each([
    "forwarded",
    "bearer",
    "cookie",
  ] as const)("não permite permission global alto sem claims.modules.contabil em %s", async (transport) => {
    const deps = services();
    const userService = { fetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })) };
    const app = createContabilWorkerApp({
      env: { ...env(), USER_SERVICE: userService, USER_SERVICE_INTERNAL_TOKEN: "user-token" },
      ...deps,
    });
    const token = await signJwt({
      user_id: USER,
      organization_id: ORG,
      permission: 3,
      modules: { contabil: 0 },
    });
    const requestHeaders: HeadersInit =
      transport === "forwarded"
        ? { ...headers("3"), "x-auth-modules": JSON.stringify({ contabil: 0 }) }
        : transport === "bearer"
          ? { authorization: `Bearer ${token}` }
          : { cookie: `cw.session=${token}` };
    const response = await app.request(
      "https://contabil.test/contabil/controls/list?competence=2026-09",
      { headers: requestHeaders },
    );

    expect(response.status).toBe(403);
    expect(deps.controlService.list).not.toHaveBeenCalled();
  });

  it("executa reporting com grant assinado e snapshot RepeatableRead", async () => {
    const delegate = { findMany: vi.fn().mockResolvedValue([{ competence: "2026-09" }]) };
    const prisma = {
      controlContabil: delegate,
      responsibleContabil: { findMany: vi.fn() },
      relationshipContabil: { findMany: vi.fn() },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: unknown) => Promise<unknown>) => callback(prisma),
    );
    const body = {
      source: "contabil.control",
      fields: ["competence"],
      limit: 1,
      query: {
        filters: [
          { field: "competence", operator: "eq", parameter: "competence_filter", value: "2026-09" },
        ],
      },
    };
    const app = createContabilWorkerApp({ env: env(), prisma: prisma as never });
    const response = await app.request("https://contabil.test/internal/reporting/extract", {
      method: "POST",
      headers: { ...(await signedReportingHeaders(body)), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { rows: [{ competence: "2026-09" }], reachedLimit: false },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "RepeatableRead" }),
    );
  });

  it("aplica filtro impossível no reporting em vez de devolver a página bruta", async () => {
    const delegate = { findMany: vi.fn().mockResolvedValue([{ competence: "2026-09" }]) };
    const prisma = {
      controlContabil: delegate,
      responsibleContabil: { findMany: vi.fn() },
      relationshipContabil: { findMany: vi.fn() },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: unknown) => Promise<unknown>) => callback(prisma),
    );
    const body = {
      source: "contabil.control",
      fields: ["competence"],
      limit: 1,
      query: {
        filters: [
          { field: "competence", operator: "eq", parameter: "competence_filter", value: "2099-01" },
        ],
      },
    };
    const app = createContabilWorkerApp({ env: env(), prisma: prisma as never });
    const response = await app.request("https://contabil.test/internal/reporting/extract", {
      method: "POST",
      headers: { ...(await signedReportingHeaders(body)), "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { rows: [], reachedLimit: false },
    });
  });

  it("extrai o movimento Contábil da Triagem filtrado por competência e envio", async () => {
    const monthly = [
      { id: "1", client_id: CLIENT, competence: "2026-09", triad_moviment: true },
      { id: "2", client_id: CLIENT, competence: "2026-10", triad_moviment: true },
      { id: "3", client_id: "other-client", competence: "2026-09", triad_moviment: false },
    ];
    const prisma = {
      triageMonthly: {
        findMany: vi
          .fn()
          .mockImplementation(async ({ skip = 0, take }: { skip?: number; take: number }) =>
            monthly.slice(skip, skip + take),
          ),
      },
      clientCloud: { findMany: vi.fn() },
      client: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: CLIENT, name: "Alfa", company_name: "Alfa Ltda" }]),
      },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: unknown) => Promise<unknown>) => callback(prisma),
    );
    const body = {
      source: "contabil.triage_movement",
      fields: ["legal_name", "competence"],
      limit: 10,
      query: {
        filters: [
          { field: "competence", operator: "eq", parameter: "competencia", value: "2026-09" },
          { field: "sends_movement", operator: "eq", parameter: "envia", value: true },
        ],
      },
    };
    const app = createContabilWorkerApp({ env: env(), prisma: prisma as never });
    const response = await app.request("https://contabil.test/internal/reporting/extract", {
      method: "POST",
      headers: {
        ...(await signedReportingHeaders(body, "extract", {
          source: body.source,
          fields: ["legal_name", "competence", "sends_movement"],
        })),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { rows: [{ legal_name: "Alfa Ltda", competence: "2026-09" }], reachedLimit: false },
    });
    expect(prisma.triageMonthly.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG, type: "CONTABIL", archived_at: null },
      }),
    );
  });

  it("usa a permissão efetiva do módulo contábil como o gateway Node encaminha", async () => {
    const deps = services();
    const app = createContabilWorkerApp({ env: env(), ...deps });
    const post = (extra: Record<string, string>) =>
      app.request("https://contabil.test/contabil/controls", {
        method: "POST",
        headers: { ...headers("1"), ...extra, "content-type": "application/json" },
        body: JSON.stringify({ client_id: CLIENT, competence: "2026-09" }),
      });

    const moduleEditor = await post({ "x-auth-modules": JSON.stringify({ contabil: 2 }) });
    const owner = await post({
      "x-auth-type": "owner",
      "x-auth-modules": JSON.stringify({ contabil: 0 }),
    });
    const ownerRead = await app.request(
      "https://contabil.test/contabil/controls/list?competence=2026-09",
      { headers: { ...headers("1"), "x-auth-type": "owner", "x-auth-modules": "{}" } },
    );

    expect(moduleEditor.status).toBe(201);
    expect(owner.status).toBe(201);
    expect(ownerRead.status).toBe(200);
    expect(deps.controlService.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ permission: 2 }),
    );
    expect(deps.controlService.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ permission: 3 }),
    );
  });

  it("exige módulo contabil ou triagem nas rotas /triagem como a policy do gateway Node", async () => {
    const deps = services();
    const app = createContabilWorkerApp({ env: env(), ...deps });
    const monthly = (modules: Record<string, number>, extra: Record<string, string> = {}) =>
      app.request(`https://contabil.test/triagem/monthly?client_id=${CLIENT}&competence=2026-09`, {
        headers: { ...headers("3"), "x-auth-modules": JSON.stringify(modules), ...extra },
      });

    const denied = await monthly({ contabil: 0, triagem: 0, fiscal: 2 });
    const triagem = await monthly({ triagem: 1 });
    const owner = await monthly({}, { "x-auth-type": "owner" });

    expect(denied.status).toBe(403);
    expect(triagem.status).toBe(200);
    expect(owner.status).toBe(200);
    expect(deps.triageDocumentsService.getMonthly).toHaveBeenCalledTimes(2);
  });

  it("mantém as mensagens de validação da triagem do serviço Node", async () => {
    const deps = services();
    const app = createContabilWorkerApp({ env: env(), ...deps });
    const send = (method: string, path: string, body: Record<string, unknown>) =>
      app.request(`https://contabil.test${path}`, {
        method,
        headers: { ...headers("2"), "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const closing = await send("PUT", "/triagem/closing", {
      client_id: CLIENT,
      competence: "2026-09",
      status: "INVALID",
    });
    const statement = await send("PUT", "/triagem/statements", {
      client_id: CLIENT,
      competence: "2026-09",
      bank_id: " ",
      status: "PENDING",
    });
    const item = await send("PATCH", `/triagem/monthly/${ID}/item`, {
      field: "card_statements",
      status: "PENDING",
      justification: "",
    });

    await expect(closing.json()).resolves.toMatchObject({
      error: "status de fechamento inválido.",
    });
    await expect(statement.json()).resolves.toMatchObject({ error: "bank_id é obrigatório." });
    expect(item.status).toBe(200);
    expect(deps.triageDocumentsService.updateItem).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ justification: "" }),
      expect.anything(),
    );
  });

  it.each([
    "REPORTS_INTERNAL_TOKEN",
    "REPORTS_GRANT_SECRET",
  ] as const)("falha explícita com 503 quando %s não está configurado", async (secret) => {
    const deps = services();
    const app = createContabilWorkerApp({ env: { ...env(), [secret]: undefined }, ...deps });
    const response = await app.request("https://contabil.test/internal/reporting/catalog", {
      headers: { "x-internal-service-token": "reports-token", "x-request-id": "report-request" },
    });

    expect(response.status).toBe(503);
  });
});
