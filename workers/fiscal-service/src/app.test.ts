import { createZip } from "@workspace/shared";
import { ServiceError } from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createFiscalWorkerApp, type FiscalWorkerEnv } from "./app.js";

const USER_ID = "c0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const ICMS_ID = "e0000000-0000-4000-8000-000000000001";
const JWT_SECRET = "fiscal-worker-test-secret-which-is-long-enough";
const INTERNAL_TOKEN = "fiscal-gateway-internal-token";

type Icms = { id: string; state: string; description: string; organization_id: string };

type IcmsServiceMock = {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  detail: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

function icms(): Icms {
  return { id: ICMS_ID, state: "SP", description: "ICMS", organization_id: ORGANIZATION_ID };
}

function service(): IcmsServiceMock {
  return {
    create: vi.fn(async () => ({ create: icms() })),
    update: vi.fn(async () => icms()),
    delete: vi.fn(async () => ({ deleted: icms() })),
    detail: vi.fn(async () => ({ detail: icms() })),
    list: vi.fn(async () => ({ data: [icms()], total: 1, page: 1, limit: 50, hasMore: false })),
  };
}

function env(): FiscalWorkerEnv {
  return {
    JWT_SECRET,
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    AUDIT_SERVICE_TOKEN: "audit-token",
    AUDIT_SERVICE: { fetch: vi.fn(async () => new Response(null, { status: 201 })) },
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function gatewayHeaders(overrides: Record<string, string> = {}): HeadersInit {
  return {
    "x-internal-service-token": INTERNAL_TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-permission": "3",
    "x-auth-kind": "organization",
    "x-auth-type": "owner",
    "x-auth-modules": JSON.stringify({ fiscal: 3 }),
    ...overrides,
  };
}

describe("fiscal Worker", () => {
  it("entrega prévia e PDF de alíquota do Simples para leitura, recusando anexo inválido", async () => {
    const clientId = "d0000000-0000-4000-8000-000000000001";
    const emission = {
      client_id: clientId,
      client_name: "Padaria Exemplo Ltda",
      client_document: "12.345.678/0001-90",
      competence: "2026-08",
      applies_to: "2026-09",
      annex: "III" as const,
      tax: "ISS" as const,
      rate: "2.01",
    };
    const simples = {
      preview: vi.fn(async () => ({
        client_id: clientId,
        competence: "2026-08",
        applies_to: "2026-09",
        status: "no_base" as const,
        message: "Não há base para calcular.",
        months: [],
        estimated_month: { competence: "2026-08", amount: "0.00" },
        rbt12: "0.00",
        annexes: [],
      })),
      emission: vi.fn(async () => emission),
      batch: vi.fn(async () => ({
        competence: "2026-08",
        applies_to: "2026-09",
        annex: "III" as const,
        tax: "ISS" as const,
        included: [
          {
            client_id: clientId,
            client_name: "Padaria Exemplo Ltda",
            client_document: "12.345.678/0001-90",
            competence: "2026-08",
            applies_to: "2026-09",
            annex: "III" as const,
            tax: "ISS" as const,
            rate: "2.01",
          },
        ],
        skipped: [
          {
            document: "99999999000199",
            client_name: null,
            reason: "Cliente não encontrado nesta organização.",
          },
        ],
      })),
    };
    const app = createFiscalWorkerApp({ env: env(), simplesService: simples });
    const reader = gatewayHeaders({ "x-auth-modules": JSON.stringify({ fiscal: 1 }) });

    const preview = await app.request(
      `https://fiscal.test/fiscal/simples/preview?client_id=${clientId}&competence=2026-08`,
      { headers: reader },
    );
    expect(preview.status).toBe(200);
    expect(simples.preview).toHaveBeenCalledWith(
      { client_id: clientId, competence: "2026-08" },
      ORGANIZATION_ID,
    );

    const pdf = await app.request(
      `https://fiscal.test/fiscal/simples/pdf?client_id=${clientId}&competence=2026-08&annex=III`,
      { headers: reader },
    );
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.headers.get("content-disposition")).toContain(
      "aliquota-ISS-anexo-III-2026-09-padaria-exemplo-ltda-12345678000190.pdf",
    );
    expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(500);
    expect(simples.emission).toHaveBeenCalledWith(
      { client_id: clientId, competence: "2026-08", annex: "III" },
      ORGANIZATION_ID,
    );

    const invalid = await app.request(
      `https://fiscal.test/fiscal/simples/pdf?client_id=${clientId}&competence=2026-08&annex=VI`,
      { headers: reader },
    );
    expect(invalid.status).toBe(400);
    const withoutFiscal = await app.request(
      `https://fiscal.test/fiscal/simples/pdf?client_id=${clientId}&competence=2026-08&annex=III`,
      { headers: gatewayHeaders({ "x-auth-modules": JSON.stringify({ fiscal: 0 }) }) },
    );
    expect(withoutFiscal.status).toBe(403);
    expect(simples.emission).toHaveBeenCalledOnce();

    const body = { competence: "2026-08", annex: "III", documents: ["12345678000190"] };
    const csv = await app.request("https://fiscal.test/fiscal/simples/csv", {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(csv.status).toBe(200);
    const payload = (await csv.json()) as { data: { csv: string; file_name: string } };
    expect(payload.data.file_name).toBe("aliquotas-ISS-anexo-III-2026-09.csv");
    expect(payload.data.csv).toContain("Padaria Exemplo Ltda;12.345.678/0001-90;2,01");
    expect(simples.batch).toHaveBeenCalledWith(body, ORGANIZATION_ID);

    const readerCsv = await app.request("https://fiscal.test/fiscal/simples/csv", {
      method: "POST",
      headers: { ...reader, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(readerCsv.status).toBe(403);
    expect(simples.batch).toHaveBeenCalledOnce();

    const zip = await app.request("https://fiscal.test/fiscal/simples/zip", {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(zip.status).toBe(200);
    const zipped = (await zip.json()) as { data: { zip_base64: string; file_name: string } };
    expect(zipped.data.file_name).toBe("aliquotas-ISS-anexo-III-2026-09.zip");
    const archive = Buffer.from(zipped.data.zip_base64, "base64");
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.toString("latin1")).toContain(
      "aliquota-ISS-anexo-III-2026-09-padaria-exemplo-ltda-12345678000190.pdf",
    );
    const readerZip = await app.request("https://fiscal.test/fiscal/simples/zip", {
      method: "POST",
      headers: { ...reader, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(readerZip.status).toBe(403);
    expect(simples.batch).toHaveBeenCalledTimes(2);
  });

  it("confere planilhas Domínio × SEFAZ sem banco e só com edição Fiscal", async () => {
    // Sem HYPERDRIVE/DATABASE_URL: qualquer acesso a dados operacionais responderia 503.
    const { HYPERDRIVE: _db, ...noDatabase } = env();
    const app = createFiscalWorkerApp({ env: noDatabase });
    const header = "CNPJ Emitente;Modelo;Série;Número;Valor";
    const body = {
      dominio: { file_name: "d.csv", content: `${header}\n11222333000181;55;1;100;10,00` },
      sefaz: { file_name: "s.csv", content: `${header}\n11222333000181;55;1;100;10,50` },
    };
    const post = (headers: HeadersInit, payload: unknown = body) =>
      app.request("https://fiscal.test/fiscal/conferences/documents", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

    const ok = await post(gatewayHeaders({ "x-auth-permission": "2" }));
    expect(ok.status).toBe(200);
    const payload = (await ok.json()) as {
      data: { status: string; summary: { divergent: number }; csv: string; file_name: string };
    };
    expect(payload.data).toMatchObject({ status: "complete", summary: { divergent: 1 } });
    expect(payload.data.csv).toContain("Divergente;11222333000181|55|1|100;2;10,00;2;10,50");

    expect((await post(gatewayHeaders({ "x-auth-permission": "1" }))).status).toBe(403);
    expect(
      (await post(gatewayHeaders({ "x-auth-modules": JSON.stringify({ fiscal: 1 }) }))).status,
    ).toBe(403);
    const invalid = await post(gatewayHeaders(), {
      ...body,
      sefaz: { file_name: "s.csv", content: "Número\n100" },
    });
    expect(invalid.status).toBe(400);
  });

  it("seleciona XML de notas em ZIP sem banco e só com edição Fiscal", async () => {
    const { HYPERDRIVE: _db, ...noDatabase } = env();
    const app = createFiscalWorkerApp({ env: noDatabase });
    const nfe =
      "<NFe><infNFe><ide><mod>55</mod><serie>1</serie><nNF>7</nNF></ide><emit><CPF>12345678909</CPF></emit></infNFe></NFe>";
    const body = {
      file_name: "notas.zip",
      zip_base64: createZip([{ fileName: "n.xml", body: Buffer.from(nfe) }]).toString("base64"),
      requests: ["7", "8"],
    };
    const post = (headers: HeadersInit) =>
      app.request("https://fiscal.test/fiscal/conferences/xml-selection", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const ok = await post(gatewayHeaders({ "x-auth-permission": "2" }));
    expect(ok.status).toBe(200);
    const payload = (await ok.json()) as {
      data: { status: string; selected: { entry: string }[]; not_found: { request: string }[] };
    };
    expect(payload.data).toMatchObject({
      status: "partial",
      selected: [{ entry: "n.xml" }],
      not_found: [{ request: "8" }],
    });
    expect((await post(gatewayHeaders({ "x-auth-permission": "1" }))).status).toBe(403);
  });

  it("confere CSV SEFAZ contra XML sem banco e só com edição Fiscal", async () => {
    const { HYPERDRIVE: _db, ...noDatabase } = env();
    const app = createFiscalWorkerApp({ env: noDatabase });
    const nfe =
      "<NFe><infNFe><ide><mod>55</mod><serie>1</serie><nNF>7</nNF></ide><emit><CNPJ>11222333000181</CNPJ></emit><total><ICMSTot><vNF>9.90</vNF></ICMSTot></total></infNFe></NFe>";
    const body = {
      sefaz: {
        file_name: "s.csv",
        content:
          "CNPJ Emitente;Modelo;Série;Número;Valor\n11222333000181;55;1;7;9,90\n11222333000181;55;1;8;1,00",
      },
      xml: {
        file_name: "x.zip",
        zip_base64: createZip([{ fileName: "7.xml", body: Buffer.from(nfe) }]).toString("base64"),
      },
    };
    const post = (headers: HeadersInit) =>
      app.request("https://fiscal.test/fiscal/conferences/sefaz-xml", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const ok = await post(gatewayHeaders({ "x-auth-permission": "2" }));
    expect(ok.status).toBe(200);
    const payload = (await ok.json()) as {
      data: { summary: { matched: number; only_sefaz: number }; csv: string };
    };
    expect(payload.data.summary).toMatchObject({ matched: 1, only_sefaz: 1 });
    expect(payload.data.csv).toContain("Só SEFAZ;11222333000181|55|1|8");
    expect((await post(gatewayHeaders({ "x-auth-permission": "1" }))).status).toBe(403);
  });

  it("confere SPED C100/C170 contra XML sem banco e só com edição Fiscal", async () => {
    const { HYPERDRIVE: _db, ...noDatabase } = env();
    const app = createFiscalWorkerApp({ env: noDatabase });
    const nfe =
      '<NFe><infNFe><ide><mod>55</mod><serie>1</serie><nNF>7</nNF></ide><emit><CNPJ>11222333000181</CNPJ></emit><det nItem="1"><prod><cProd>A</cProd><CFOP>5102</CFOP><qCom>2</qCom><vProd>5.00</vProd></prod></det><total><ICMSTot><vNF>5.00</vNF></ICMSTot></total></infNFe></NFe>';
    const body = {
      sped: {
        file_name: "sped.txt",
        content:
          "|0000|017|0|01082026|31082026|EMPRESA|11222333000181||SP|\n|C100|0|0||55|00|1|7||01082026|01082026|5,00|\n|C170|1|A||1|UN|5,00|0|0|000|5102|",
      },
      xml: {
        file_name: "x.zip",
        zip_base64: createZip([{ fileName: "7.xml", body: Buffer.from(nfe) }]).toString("base64"),
      },
    };
    const post = (headers: HeadersInit) =>
      app.request("https://fiscal.test/fiscal/conferences/sped-xml", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const ok = await post(gatewayHeaders({ "x-auth-permission": "2" }));
    expect(ok.status).toBe(200);
    const payload = (await ok.json()) as {
      data: { summary: { divergent: number; items_divergent: number }; csv: string };
    };
    expect(payload.data.summary).toMatchObject({ divergent: 1, items_divergent: 1 });
    expect(payload.data.csv).toContain("Quantidade: SPED 1 × XML 2");
    expect((await post(gatewayHeaders({ "x-auth-permission": "1" }))).status).toBe(403);
  });

  it("soma IPI e ICMS ST de XML sem banco e só com edição Fiscal", async () => {
    const { HYPERDRIVE: _db, ...noDatabase } = env();
    const app = createFiscalWorkerApp({ env: noDatabase });
    const nfe =
      '<NFe><infNFe><ide><mod>55</mod><serie>1</serie><nNF>7</nNF></ide><emit><CNPJ>11222333000181</CNPJ></emit><det nItem="1"><prod><cProd>A</cProd></prod><imposto><ICMS><ICMS10><vICMSST>0.30</vICMSST></ICMS10></ICMS><IPI><IPITrib><vIPI>0.10</vIPI></IPITrib></IPI></imposto></det><det nItem="2"><prod><cProd>B</cProd></prod><imposto><IPI><IPITrib><vIPI>0.20</vIPI></IPITrib></IPI></imposto></det></infNFe></NFe>';
    const body = {
      file_name: "x.zip",
      zip_base64: createZip([{ fileName: "7.xml", body: Buffer.from(nfe) }]).toString("base64"),
    };
    const post = (headers: HeadersInit) =>
      app.request("https://fiscal.test/fiscal/conferences/xml-taxes", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const ok = await post(gatewayHeaders({ "x-auth-permission": "2" }));
    expect(ok.status).toBe(200);
    const payload = (await ok.json()) as { data: { totals: { ipi: string; icms_st: string } } };
    // 0.10 + 0.20 sem erro de ponto flutuante.
    expect(payload.data.totals).toMatchObject({ ipi: "0.30", icms_st: "0.30" });
    expect((await post(gatewayHeaders({ "x-auth-permission": "1" }))).status).toBe(403);
  });

  it("confere IPI entre planilhas sem banco e só com edição Fiscal", async () => {
    const { HYPERDRIVE: _db, ...noDatabase } = env();
    const app = createFiscalWorkerApp({ env: noDatabase });
    const header = "CNPJ Emitente;Modelo;Série;Número;Valor IPI";
    const body = {
      first: {
        file_name: "a.csv",
        content: `${header}\n11222333000181;55;1;7;0,10\n11222333000181;55;1;8;0,20`,
      },
      second: {
        file_name: "b.csv",
        content: `${header}\n11222333000181;55;1;7;0,10\n11222333000181;55;1;8;0,20`,
      },
    };
    const post = (headers: HeadersInit) =>
      app.request("https://fiscal.test/fiscal/conferences/ipi-spreadsheets", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const ok = await post(gatewayHeaders({ "x-auth-permission": "2" }));
    expect(ok.status).toBe(200);
    const payload = (await ok.json()) as { data: { status: string; totals: { first: string } } };
    expect(payload.data).toMatchObject({ status: "complete", totals: { first: "0.30" } });
    expect((await post(gatewayHeaders({ "x-auth-permission": "1" }))).status).toBe(403);
  });

  it("mantém receitas mensais no tenant autenticado e bloqueia escrita sem edição Fiscal", async () => {
    const revenue = {
      id: ICMS_ID,
      client_id: "d0000000-0000-4000-8000-000000000001",
      competence: "2026-08",
      amount: "12345.67",
      created_by: USER_ID,
      updated_by: USER_ID,
      createdAt: "2026-09-28T12:00:00.000Z",
      updatedAt: "2026-09-28T12:00:00.000Z",
    };
    const revenues = {
      create: vi.fn(async () => revenue),
      update: vi.fn(async () => ({ ...revenue, amount: "10.00" })),
      list: vi.fn(async () => ({ data: [revenue], total: 1, page: 1, limit: 24, hasMore: false })),
    };
    const app = createFiscalWorkerApp({ env: env(), revenueService: revenues });

    const created = await app.request("https://fiscal.test/fiscal/revenues", {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        client_id: revenue.client_id,
        competence: "2026-08",
        amount: "12345.67",
      }),
    });
    expect(created.status).toBe(201);
    expect(revenues.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
    );

    const listed = await app.request(
      `https://fiscal.test/fiscal/revenues/list?client_id=${revenue.client_id}&from=2025-09&to=2026-08`,
      { headers: gatewayHeaders({ "x-auth-modules": JSON.stringify({ fiscal: 1 }) }) },
    );
    expect(listed.status).toBe(200);
    expect(revenues.list).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: revenue.client_id, from: "2025-09", to: "2026-08" }),
      ORGANIZATION_ID,
    );

    const updated = await app.request(`https://fiscal.test/fiscal/revenues/${ICMS_ID}`, {
      method: "PUT",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ amount: "10.00" }),
    });
    expect(updated.status).toBe(200);
    expect(revenues.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: ICMS_ID, amount: "10.00", organizationId: ORGANIZATION_ID }),
    );

    const viewerWrite = await app.request(`https://fiscal.test/fiscal/revenues/${ICMS_ID}`, {
      method: "PUT",
      headers: {
        ...gatewayHeaders({ "x-auth-modules": JSON.stringify({ fiscal: 1 }) }),
        "content-type": "application/json",
      },
      body: JSON.stringify({ amount: "1" }),
    });
    expect(viewerWrite.status).toBe(403);
    expect(revenues.update).toHaveBeenCalledOnce();

    const withoutFiscal = await app.request(
      `https://fiscal.test/fiscal/revenues/list?client_id=${revenue.client_id}`,
      { headers: gatewayHeaders({ "x-auth-modules": JSON.stringify({ fiscal: 0 }) }) },
    );
    expect(withoutFiscal.status).toBe(403);
    expect(revenues.list).toHaveBeenCalledOnce();
  });

  it("registra alíquota manual e entrega PDF no tenant autenticado", async () => {
    const rate = {
      id: ICMS_ID,
      client_id: "d0000000-0000-4000-8000-000000000001",
      client_name: "Empresa de Exemplo Ltda",
      client_document: "12.345.678/0001-90",
      competence: "2026-08",
      tax_type: "ICMS",
      rate: "18.0000",
      issued_by: USER_ID,
      createdAt: "2026-09-25T12:00:00.000Z",
    };
    const rates = {
      create: vi.fn(async () => rate),
      list: vi.fn(async () => ({ data: [rate], total: 1, page: 1, limit: 50, hasMore: false })),
      get: vi.fn(async () => rate),
    };
    const app = createFiscalWorkerApp({ env: env(), rateService: rates });
    const created = await app.request("https://fiscal.test/fiscal/rates", {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        client_id: rate.client_id,
        competence: "2026-08",
        tax_type: "ICMS",
        rate: "18",
      }),
    });
    expect(created.status).toBe(201);
    expect(rates.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    );

    const listed = await app.request(
      `https://fiscal.test/fiscal/rates/list?client_id=${rate.client_id}`,
      {
        headers: gatewayHeaders(),
      },
    );
    expect(listed.status).toBe(200);
    expect(rates.list).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: rate.client_id }),
      ORGANIZATION_ID,
    );

    const pdf = await app.request(`https://fiscal.test/fiscal/rates/${ICMS_ID}/pdf`, {
      headers: gatewayHeaders(),
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.headers.get("cache-control")).toBe("no-store");
    expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(100);
    expect(rates.get).toHaveBeenCalledWith(ICMS_ID, ORGANIZATION_ID);
  });

  it("returns success envelopes for health and ready", async () => {
    const app = createFiscalWorkerApp({ env: env(), icmsService: service() });

    const health = await app.request("https://fiscal.test/health");
    const ready = await app.request("https://fiscal.test/ready");

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      success: true,
      data: { status: "ok", service: "fiscal-service" },
    });
    expect(ready.status).toBe(200);
  });

  it("rejects fiscal routes without authentication", async () => {
    const fiscal = service();
    const app = createFiscalWorkerApp({ env: env(), icmsService: fiscal });

    const response = await app.request("https://fiscal.test/fiscal/icms/list");

    expect(response.status).toBe(401);
    expect(fiscal.list).not.toHaveBeenCalled();
  });

  it("passes the authenticated organization to reads and writes", async () => {
    const fiscal = service();
    const app = createFiscalWorkerApp({ env: env(), icmsService: fiscal });

    const list = await app.request("https://fiscal.test/fiscal/icms/list?page=2&page_size=10", {
      headers: gatewayHeaders(),
    });
    const create = await app.request("https://fiscal.test/fiscal/icms", {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ state: "SP", description: "ICMS" }),
    });

    expect(list.status).toBe(200);
    expect(fiscal.list).toHaveBeenCalledWith(
      { icmsCodes: [], page: 2, page_size: 10 },
      ORGANIZATION_ID,
    );
    expect(create.status).toBe(201);
    expect(fiscal.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, organizationId: ORGANIZATION_ID, permission: 3 }),
    );
  });

  it("preserves validation and service errors", async () => {
    const fiscal = service();
    fiscal.detail.mockRejectedValue(new ServiceError(404, "ICMS não encontrado."));
    const app = createFiscalWorkerApp({ env: env(), icmsService: fiscal });

    const invalid = await app.request("https://fiscal.test/fiscal/icms", {
      headers: gatewayHeaders(),
    });
    const missing = await app.request(`https://fiscal.test/fiscal/icms?icms_id=${ICMS_ID}`, {
      headers: gatewayHeaders(),
    });

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      success: false,
      error: "ICMS não encontrado.",
      code: "NOT_FOUND",
      requestId: missing.headers.get("x-request-id"),
    });
  });

  it("runs the representative ICMS read/write paths", async () => {
    const fiscal = service();
    const app = createFiscalWorkerApp({ env: env(), icmsService: fiscal });
    const headers = gatewayHeaders();
    const jsonHeaders = { ...headers, "content-type": "application/json" };

    const detail = await app.request(`https://fiscal.test/fiscal/icms?icms_id=${ICMS_ID}`, {
      headers,
    });
    const update = await app.request("https://fiscal.test/fiscal/icms", {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ icms_id: ICMS_ID, state: "SP", description: "Atualizado" }),
    });
    const remove = await app.request(`https://fiscal.test/fiscal/icms?icms_id=${ICMS_ID}`, {
      method: "DELETE",
      headers,
    });

    expect(detail.status).toBe(200);
    expect(update.status).toBe(200);
    expect(remove.status).toBe(200);
    expect(fiscal.detail).toHaveBeenCalledWith(ICMS_ID, ORGANIZATION_ID);
    expect(fiscal.update).toHaveBeenCalledWith(
      expect.objectContaining({ icms_id: ICMS_ID, organizationId: ORGANIZATION_ID }),
    );
    expect(fiscal.delete).toHaveBeenCalledWith(
      expect.objectContaining({ icms_id: ICMS_ID, organizationId: ORGANIZATION_ID }),
    );
  });
});
