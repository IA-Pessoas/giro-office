import { hashCsrfToken } from "@workspace/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createParcelamentoWorkerApp, type ParcelamentoWorkerEnv } from "./app.js";
import { reportingBodyHash } from "./reporting.js";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INSTALLMENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const COMPETENCY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PANORAMA = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const TOKEN = "parcelamento-internal-token";
const JWT_SECRET = "parcelamento-worker-secret";

type Mock = ReturnType<typeof vi.fn>;

function env(overrides: Partial<ParcelamentoWorkerEnv> = {}): ParcelamentoWorkerEnv {
  return {
    JWT_SECRET,
    INTERNAL_SERVICE_TOKEN: TOKEN,
    REPORTS_INTERNAL_TOKEN: "reports-token",
    REPORTS_GRANT_SECRET: "reports-secret",
    AUDIT_SERVICE: { fetch: vi.fn(async () => new Response(null, { status: 201 })) },
    AUDIT_SERVICE_TOKEN: "audit-token",
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
    ...overrides,
  };
}

function headers(): Record<string, string> {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER,
    "x-auth-organization-id": ORG,
    "x-auth-permission": "2",
    "x-auth-kind": "organization",
    "x-auth-modules": JSON.stringify({ parcelamento: 2 }),
    "x-request-id": "parcelamento-request",
    "content-type": "application/json",
  };
}

function installmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INSTALLMENT,
    client_id: CLIENT,
    type: "Federal",
    jurisdiction: "PGFN",
    is_automatic_debit: false,
    consolidated_total_amount: 0,
    first_installment_amount: 100,
    current_month_installment_amount: 50,
    outstanding_balance: 0,
    paid_installments_count: 0,
    agreed_installments_count: 10,
    remaining_installments_count: 10,
    overdue_installments_count: 0,
    enrollment_date: null,
    document_url: "",
    status: "Ativo",
    completion_date: null,
    down_payment_installments_count: 0,
    legal_nature: "Simples",
    situation_shutdown: null,
    agreement_number: null,
    organization_id: ORG,
    ...overrides,
  };
}

function competencyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMPETENCY,
    installment_id: INSTALLMENT,
    competence: "2026-09",
    how_many_paid: 10,
    how_many_overdue: 0,
    download: true,
    download_notes: null,
    upload_file: null,
    is_sent: null,
    submission_type: null,
    notes: null,
    installment_amount: 50,
    organization_id: ORG,
    ...overrides,
  };
}

function panoramaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PANORAMA,
    competence: "2026-09",
    cnd_municipal: false,
    cnd_state: false,
    cnd_federal: false,
    cnd_fgts: false,
    cnd_labor: false,
    protests: false,
    state_tax_situation: false,
    federal_tax_situation: false,
    responsavel_id: null,
    client_id: CLIENT,
    organization_id: ORG,
    ...overrides,
  };
}

function delegate() {
  return {
    count: vi.fn(async () => 0),
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(),
    createMany: vi.fn(async () => ({ count: 0 })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
}

function prismaMock() {
  const prisma = {
    $queryRaw: vi.fn(async () => [{ ok: 1 }]),
    $transaction: vi.fn(),
    installment: delegate(),
    installmentCompetencies: delegate(),
    panoramaParcelameto: delegate(),
    client: delegate(),
    user: delegate(),
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(prisma),
  );
  return prisma;
}

function encode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function hmac(secret: string, input: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input)));
}

async function signJwt(claims: Record<string, unknown>): Promise<string> {
  const input = `${encode(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${encode(JSON.stringify(claims))}`;
  return `${input}.${encode(await hmac(JWT_SECRET, input))}`;
}

async function reportingHeaders(
  body: Record<string, unknown>,
  operation: "catalog" | "extract",
  fields: string[],
): Promise<Record<string, string>> {
  const grant = {
    version: 1,
    audience: "parcelamento-service",
    operation,
    source: operation === "catalog" ? "parcelamento.catalog" : String(body.source),
    organization_id: ORG,
    fields,
    request_id: "report-request",
    issued_at: Math.floor(Date.now() / 1000) - 1,
    expires_at: Math.floor(Date.now() / 1000) + 30,
    body_sha256: await reportingBodyHash(body),
  };
  const grantText = encode(JSON.stringify(grant, Object.keys(grant).sort()));
  const signature = await hmac("reports-secret", grantText);
  return {
    "x-internal-service-token": "reports-token",
    "x-reports-grant": grantText,
    "x-reports-grant-signature": Array.from(signature, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
    "x-request-id": "report-request",
    "content-type": "application/json",
  };
}

async function auditBodies(workerEnv: ParcelamentoWorkerEnv): Promise<Record<string, unknown>[]> {
  const fetch = workerEnv.AUDIT_SERVICE?.fetch as Mock;
  return Promise.all(
    fetch.mock.calls.map(async ([request]) => (await (request as Request).json()) as never),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parcelamento Worker — paridade restante", () => {
  it("devolve x-request-id na resposta como o requestContext do Node", async () => {
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prismaMock() as never });
    const response = await app.request("https://parcelamento.test/health", {
      headers: { "x-request-id": "req-123" },
    });

    expect(response.headers.get("x-request-id")).toBe("req-123");
  });

  it("inclui o request id gerado no envelope de erro", async () => {
    const requestHeaders = headers();
    delete requestHeaders["x-request-id"];
    const app = createParcelamentoWorkerApp({
      env: env({ HYPERDRIVE: undefined }),
    });

    const response = await app.request("https://parcelamento.test/parcelamento/installments", {
      headers: requestHeaders,
    });
    const requestId = response.headers.get("x-request-id");

    expect(response.status).toBe(503);
    expect(requestId).toBeTruthy();
    expect(await response.json()).toMatchObject({ requestId });
  });

  // status/error/code exatos capturados do Express/qs do Node (supertest) em 2026-09-22.
  // O Node não põe requestId no corpo; o Worker o acrescenta (aditivo, ver ba2aed71).
  it.each([
    ["/parcelamento/installments?page=1&page=2", "Expected number, received nan"],
    ["/parcelamento/installments?page_size=10&page_size=10", "Expected number, received nan"],
    ["/parcelamento/installments?status=A&status=B", "Expected string, received array"],
    ["/parcelamento/installments?search=x&search=x", "Expected string, received array"],
    [
      `/parcelamento/installments/${INSTALLMENT}/competencies?page=1&page=2`,
      "Expected number, received nan",
    ],
    [
      "/parcelamento/panoramas?competence=2026-01&competence=2026-02",
      "Expected string, received array",
    ],
    ["/parcelamento/panoramas?page=1&page=1", "Expected number, received nan"],
  ])("rejeita chave repetida na query como o Express: %s", async (path, error) => {
    const prisma = prismaMock();
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request(`https://parcelamento.test${path}`, {
      headers: headers(),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error,
      code: "BAD_REQUEST",
      requestId: "parcelamento-request",
    });
    expect(prisma.installment.findMany).not.toHaveBeenCalled();
    expect(prisma.installmentCompetencies.findMany).not.toHaveBeenCalled();
    expect(prisma.panoramaParcelameto.findMany).not.toHaveBeenCalled();
  });

  it("falha explícito com 503 sem HYPERDRIVE nem DATABASE_URL", async () => {
    const app = createParcelamentoWorkerApp({ env: env({ HYPERDRIVE: undefined }) });
    const response = await app.request("https://parcelamento.test/parcelamento/installments", {
      headers: headers(),
    });

    expect(response.status).toBe(503);
  });

  it("cria parcelamento sem número de acordo em transação Serializable e audita", async () => {
    const prisma = prismaMock();
    prisma.client.findFirst.mockResolvedValue({ id: CLIENT });
    prisma.installment.create.mockResolvedValue(installmentRow());
    const workerEnv = env();
    const app = createParcelamentoWorkerApp({ env: workerEnv, prisma: prisma as never });

    const response = await app.request("https://parcelamento.test/parcelamento/installments", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        client_id: CLIENT,
        type: "Federal",
        legal_nature: "Simples",
        jurisdiction: "PGFN",
        is_automatic_debit: false,
        first_installment_amount: 100,
        current_month_installment_amount: 50,
        agreed_installments_count: 10,
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { success: boolean; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data).not.toHaveProperty("organization_id");
    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT, organization_id: ORG },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(prisma.installment.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organization_id: ORG,
        client_id: CLIENT,
        status: { notIn: ["Liquidado", "Cancelado", "Encerrado", "Inativo"] },
      }),
    });
    expect(prisma.installment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "Ativo",
        remaining_installments_count: 10,
        consolidated_total_amount: 0,
        document_url: "",
        organization_id: ORG,
      }),
      select: expect.any(Object),
    });
    const [audit] = await auditBodies(workerEnv);
    expect(audit).toMatchObject({
      method: "ENTITY_CHANGE",
      path: "/parcelamento/installments",
      action: "Cadastro",
      referring: "parcelamento.installments",
      referringId: INSTALLMENT,
      serviceSource: "parcelamento-service",
      department: "parcelamento",
      organizationId: ORG,
      userId: USER,
      permission: 2,
      metadata: { routeTarget: "parcelamento-service", requestId: "parcelamento-request" },
    });
    expect(audit.changes).not.toHaveProperty("organization_id");
  });

  it("rejeita número de acordo duplicado com 409", async () => {
    const prisma = prismaMock();
    prisma.client.findFirst.mockResolvedValue({ id: CLIENT });
    prisma.installment.findFirst.mockResolvedValue(installmentRow({ agreement_number: "123" }));
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request("https://parcelamento.test/parcelamento/installments", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        client_id: CLIENT,
        agreement_number: " 123 ",
        type: "Federal",
        legal_nature: "Simples",
        jurisdiction: "PGFN",
        is_automatic_debit: false,
        first_installment_amount: 100,
        current_month_installment_amount: 50,
        agreed_installments_count: 10,
      }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Ja existe parcelamento com este numero de acordo.",
    });
    expect(prisma.installment.findFirst).toHaveBeenCalledWith({
      where: { organization_id: ORG, agreement_number: "123" },
    });
    expect(prisma.installment.create).not.toHaveBeenCalled();
  });

  it("valida body estrito com 400 antes de tocar o banco", async () => {
    const prisma = prismaMock();
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request("https://parcelamento.test/parcelamento/installments", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ client_id: CLIENT, unexpected: true }),
    });

    expect(response.status).toBe(400);
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
  });

  it("atualiza parcelamento e recalcula agregados quando o valor mensal muda", async () => {
    const prisma = prismaMock();
    prisma.installment.findFirst.mockImplementation(async (args: { where: object }) =>
      "id" in args.where ? installmentRow() : null,
    );
    prisma.installmentCompetencies.findMany.mockResolvedValue([
      competencyRow({ how_many_paid: 4, how_many_overdue: 6 }),
    ]);
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request(
      `https://parcelamento.test/parcelamento/installments/${INSTALLMENT}`,
      {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ current_month_installment_amount: 80 }),
      },
    );

    expect(response.status).toBe(200);
    expect(prisma.installment.updateMany).toHaveBeenCalledWith({
      where: { id: INSTALLMENT, organization_id: ORG },
      data: { current_month_installment_amount: 80 },
    });
    expect(prisma.installment.updateMany).toHaveBeenLastCalledWith({
      where: { id: INSTALLMENT, organization_id: ORG },
      data: {
        paid_installments_count: 4,
        overdue_installments_count: 2,
        remaining_installments_count: 6,
        outstanding_balance: 300,
      },
    });
  });

  it("rejeita PATCH vazio com 400", async () => {
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prismaMock() as never });
    const response = await app.request(
      `https://parcelamento.test/parcelamento/installments/${INSTALLMENT}`,
      { method: "PATCH", headers: headers(), body: "{}" },
    );

    expect(response.status).toBe(400);
  });

  it("lista competências paginadas do parcelamento da organização", async () => {
    const prisma = prismaMock();
    prisma.installment.findFirst.mockResolvedValue(installmentRow());
    prisma.installmentCompetencies.count.mockResolvedValue(3);
    prisma.installmentCompetencies.findMany.mockResolvedValue([competencyRow()]);
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request(
      `https://parcelamento.test/parcelamento/installments/${INSTALLMENT}/competencies?page=2&page_size=1`,
      { headers: headers() },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { total: 3, page: 2, page_size: 1, has_more: true },
    });
    expect(prisma.installmentCompetencies.findMany).toHaveBeenCalledWith({
      where: { installment_id: INSTALLMENT, organization_id: ORG },
      select: expect.any(Object),
      orderBy: { competence: "asc" },
      skip: 1,
      take: 1,
    });
  });

  it("devolve 404 ao listar competências de parcelamento de outra organização", async () => {
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prismaMock() as never });
    const response = await app.request(
      `https://parcelamento.test/parcelamento/installments/${INSTALLMENT}/competencies`,
      { headers: headers() },
    );

    expect(response.status).toBe(404);
  });

  it("cria competência, liquida o parcelamento quando todas as parcelas foram pagas e audita", async () => {
    const prisma = prismaMock();
    prisma.installment.findFirst.mockResolvedValue(installmentRow());
    prisma.installmentCompetencies.findFirst.mockResolvedValue(null);
    prisma.installmentCompetencies.create.mockResolvedValue(competencyRow());
    prisma.installmentCompetencies.findMany.mockResolvedValue([competencyRow()]);
    const workerEnv = env();
    const app = createParcelamentoWorkerApp({ env: workerEnv, prisma: prisma as never });

    const response = await app.request(
      `https://parcelamento.test/parcelamento/installments/${INSTALLMENT}/competencies`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          competence: "2026-09",
          how_many_paid: 10,
          how_many_overdue: 0,
          download: true,
          installment_amount: 50,
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(prisma.installment.updateMany).toHaveBeenCalledWith({
      where: { id: INSTALLMENT, organization_id: ORG },
      data: expect.objectContaining({
        remaining_installments_count: 0,
        outstanding_balance: 0,
        status: "Liquidado",
        completion_date: expect.any(Date),
      }),
    });
    const [audit] = await auditBodies(workerEnv);
    expect(audit).toMatchObject({
      action: "Cadastro",
      referring: "parcelamento.installmentsCompetencies",
      path: "/parcelamento/installmentsCompetencies",
      referringId: COMPETENCY,
    });
  });

  it("rejeita competência duplicada com 409", async () => {
    const prisma = prismaMock();
    prisma.installment.findFirst.mockResolvedValue(installmentRow());
    prisma.installmentCompetencies.findFirst.mockResolvedValue(competencyRow());
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request(
      `https://parcelamento.test/parcelamento/installments/${INSTALLMENT}/competencies`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          competence: "2026-09",
          how_many_paid: 1,
          how_many_overdue: 0,
          download: false,
          installment_amount: 50,
        }),
      },
    );

    expect(response.status).toBe(409);
    expect(prisma.installmentCompetencies.create).not.toHaveBeenCalled();
  });

  it("atualiza competência e recalcula o parcelamento pai", async () => {
    const prisma = prismaMock();
    prisma.installmentCompetencies.findFirst.mockResolvedValue(competencyRow());
    prisma.installment.findFirst.mockResolvedValue(installmentRow());
    prisma.installmentCompetencies.findMany.mockResolvedValue([
      competencyRow({ how_many_paid: 3 }),
    ]);
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request(
      `https://parcelamento.test/parcelamento/installment-competencies/${COMPETENCY}`,
      { method: "PATCH", headers: headers(), body: JSON.stringify({ how_many_paid: 3 }) },
    );

    expect(response.status).toBe(200);
    expect(prisma.installmentCompetencies.updateMany).toHaveBeenCalledWith({
      where: { id: COMPETENCY, organization_id: ORG },
      data: { how_many_paid: 3 },
    });
    expect(prisma.installment.updateMany).toHaveBeenCalledWith({
      where: { id: INSTALLMENT, organization_id: ORG },
      data: expect.objectContaining({
        paid_installments_count: 3,
        remaining_installments_count: 7,
      }),
    });
  });

  it("lista panoramas com filtros e paginação", async () => {
    const prisma = prismaMock();
    prisma.panoramaParcelameto.count.mockResolvedValue(1);
    prisma.panoramaParcelameto.findMany.mockResolvedValue([panoramaRow()]);
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request(
      `https://parcelamento.test/parcelamento/panoramas?competence=2026-09&client_id=${CLIENT}`,
      { headers: headers() },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { items: Record<string, unknown>[] } };
    expect(body.data.items[0]).not.toHaveProperty("organization_id");
    expect(prisma.panoramaParcelameto.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG, competence: "2026-09", client_id: CLIENT },
      select: expect.any(Object),
      orderBy: { id: "asc" },
      skip: 0,
      take: 50,
    });
  });

  it("cria panorama validando cliente e responsável da organização", async () => {
    const prisma = prismaMock();
    prisma.client.findFirst.mockResolvedValue({ id: CLIENT });
    prisma.user.findFirst.mockResolvedValue(null);
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request("https://parcelamento.test/parcelamento/panoramas", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ client_id: CLIENT, competence: "2026-09", responsavel_id: USER }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: "Responsavel nao encontrado para a organizacao.",
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: USER, organization_id: ORG },
    });
  });

  it("cria panorama com defaults falsos e 201", async () => {
    const prisma = prismaMock();
    prisma.client.findFirst.mockResolvedValue({ id: CLIENT });
    prisma.panoramaParcelameto.create.mockResolvedValue(panoramaRow({ cnd_fgts: true }));
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request("https://parcelamento.test/parcelamento/panoramas", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ client_id: CLIENT, competence: "2026-09", cnd_fgts: true }),
    });

    expect(response.status).toBe(201);
    expect(prisma.panoramaParcelameto.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cnd_fgts: true,
        cnd_state: false,
        responsavel_id: null,
        organization_id: ORG,
      }),
      select: expect.any(Object),
    });
  });

  it("detalha e atualiza panorama no escopo da organização", async () => {
    const prisma = prismaMock();
    prisma.panoramaParcelameto.findFirst.mockResolvedValue(panoramaRow());
    const workerEnv = env();
    const app = createParcelamentoWorkerApp({ env: workerEnv, prisma: prisma as never });

    const detail = await app.request(
      `https://parcelamento.test/parcelamento/panoramas/${PANORAMA}`,
      { headers: headers() },
    );
    const patch = await app.request(
      `https://parcelamento.test/parcelamento/panoramas/${PANORAMA}`,
      { method: "PATCH", headers: headers(), body: JSON.stringify({ cnd_labor: true }) },
    );

    expect(detail.status).toBe(200);
    expect(patch.status).toBe(200);
    expect(prisma.panoramaParcelameto.updateMany).toHaveBeenCalledWith({
      where: { id: PANORAMA, organization_id: ORG },
      data: { cnd_labor: true },
    });
    const [audit] = await auditBodies(workerEnv);
    expect(audit).toMatchObject({
      action: "Atualizacao",
      referring: "parcelamento.panorama",
      changes: { cnd_labor: { from: false, to: true } },
    });
  });

  it("gera panoramas de forma idempotente só para clientes ativos sem panorama", async () => {
    const prisma = prismaMock();
    const OTHER = "99999999-9999-4999-8999-999999999999";
    prisma.client.findMany.mockResolvedValue([{ id: CLIENT }, { id: OTHER }]);
    prisma.panoramaParcelameto.findMany.mockResolvedValue([{ client_id: CLIENT }]);
    prisma.panoramaParcelameto.createMany.mockResolvedValue({ count: 1 });
    const workerEnv = env();
    const app = createParcelamentoWorkerApp({ env: workerEnv, prisma: prisma as never });

    const response = await app.request(
      "https://parcelamento.test/parcelamento/panoramas/competences/2026-09/generate",
      { method: "POST", headers: headers() },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { created: 1, existing: 1, totalActiveClients: 2 },
    });
    expect(prisma.client.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG, status: "Ativo" },
      select: { id: true },
    });
    expect(prisma.panoramaParcelameto.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ client_id: OTHER, competence: "2026-09" })],
      skipDuplicates: true,
    });
    const [audit] = await auditBodies(workerEnv);
    expect(audit).toMatchObject({ action: "Geracao", referringId: "2026-09" });
  });

  it("rejeita body não vazio na geração de panoramas", async () => {
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prismaMock() as never });
    const response = await app.request(
      "https://parcelamento.test/parcelamento/panoramas/competences/2026-09/generate",
      { method: "POST", headers: headers(), body: JSON.stringify({ force: true }) },
    );

    expect(response.status).toBe(400);
  });

  it("não reverte a mutação quando a auditoria falha, mas registra erro observável", async () => {
    const prisma = prismaMock();
    prisma.panoramaParcelameto.findFirst.mockResolvedValue(panoramaRow());
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createParcelamentoWorkerApp({
      env: env({ AUDIT_SERVICE: undefined }),
      prisma: prisma as never,
    });

    const response = await app.request(
      `https://parcelamento.test/parcelamento/panoramas/${PANORAMA}`,
      { method: "PATCH", headers: headers(), body: JSON.stringify({ protests: true }) },
    );

    expect(response.status).toBe(200);
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ event: "parcelamento.audit.failed" }),
    );
  });

  it("exige CSRF e sessão válida para mutação por cookie", async () => {
    const csrf = "C".repeat(43);
    const token = await signJwt({
      user_id: USER,
      organization_id: ORG,
      permission: 2,
      modules: { parcelamento: 2 },
      session_id: "session-1",
      session_version: 1,
      csrf_hash: await hashCsrfToken(csrf),
    });
    const prisma = prismaMock();
    prisma.panoramaParcelameto.findFirst.mockResolvedValue(panoramaRow());
    const userService = { fetch: vi.fn(async () => new Response(null, { status: 204 })) };
    const app = createParcelamentoWorkerApp({
      env: env({ USER_SERVICE: userService, USER_SERVICE_INTERNAL_TOKEN: "user-token" }),
      prisma: prisma as never,
    });
    const url = `https://parcelamento.test/parcelamento/panoramas/${PANORAMA}`;

    const rejected = await app.request(url, {
      method: "PATCH",
      headers: { cookie: `cw.session=${token}; cw.csrf=${csrf}` },
      body: JSON.stringify({ protests: true }),
    });
    expect(rejected.status).toBe(403);
    expect(prisma.panoramaParcelameto.updateMany).not.toHaveBeenCalled();

    const accepted = await app.request(url, {
      method: "PATCH",
      headers: { cookie: `cw.session=${token}; cw.csrf=${csrf}`, "x-csrf-token": csrf },
      body: JSON.stringify({ protests: true }),
    });
    expect(accepted.status).toBe(200);
    expect(userService.fetch).toHaveBeenCalledOnce();
  });

  it("mantém reporting interno fechado sem grant válido", async () => {
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prismaMock() as never });
    const response = await app.request("https://parcelamento.test/internal/reporting/catalog", {
      headers: { "x-internal-service-token": "reports-token", "x-request-id": "report-request" },
    });

    expect(response.status).toBe(403);
  });

  it("publica o catálogo de reporting com grant assinado", async () => {
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prismaMock() as never });
    const response = await app.request("https://parcelamento.test/internal/reporting/catalog", {
      headers: await reportingHeaders({}, "catalog", []),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        sources: expect.arrayContaining([
          expect.objectContaining({ key: "parcelamento.installments" }),
        ]),
      },
    });
  });

  it("extrai reporting por organização do grant com snapshot RepeatableRead", async () => {
    const prisma = prismaMock();
    prisma.installment.findMany.mockResolvedValue([{ status: "Ativo" }]);
    const body = {
      source: "parcelamento.installments",
      fields: ["status"],
      limit: 5,
      query: {
        filters: [{ field: "status", operator: "eq", parameter: "status_filter", value: "Ativo" }],
      },
    };
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prisma as never });

    const response = await app.request("https://parcelamento.test/internal/reporting/extract", {
      method: "POST",
      headers: await reportingHeaders(body, "extract", ["status"]),
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { rows: [{ status: "Ativo" }], reachedLimit: false },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "RepeatableRead" }),
    );
    expect(prisma.installment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORG } }),
    );
  });

  it("recusa campo não publicado no reporting com 403", async () => {
    const body = { source: "parcelamento.installments", fields: ["organization_id"], limit: 5 };
    const app = createParcelamentoWorkerApp({ env: env(), prisma: prismaMock() as never });

    const response = await app.request("https://parcelamento.test/internal/reporting/extract", {
      method: "POST",
      headers: await reportingHeaders(body, "extract", ["organization_id"]),
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(403);
  });
});
