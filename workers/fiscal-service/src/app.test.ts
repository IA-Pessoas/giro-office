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

  it("controle mensal: lista com reconciliação, abre e altera no tenant, leitura sem escrita", async () => {
    const control = {
      id: ICMS_ID,
      client_id: "d0000000-0000-4000-8000-000000000001",
      competence: "2026-08",
      status: "PENDING" as const,
      no_movement: false,
      regime: null,
      opening_reason: null,
      responsible_id: null,
      updated_by: USER_ID,
      updatedAt: "2026-09-28T12:00:00.000Z",
    };
    const controls = {
      list: vi.fn(async () => ({
        competence: "2026-08",
        items: [
          {
            ...control,
            client_name: "Alfa",
            pending_obligations: 0,
            triage_pending: 0,
            responsible_name: null,
            default_responsible_id: null,
            default_responsible_name: null,
          },
        ],
      })),
      open: vi.fn(async () => ({ control, created: true })),
      update: vi.fn(async () => ({ ...control, status: "IN_PROGRESS" as const })),
      transfer: vi.fn(async () => ({ transferred: [ICMS_ID], skipped: [] })),
      responsibles: vi.fn(async () => [{ id: USER_ID, name: "Ana" }]),
      triage: vi.fn(async () => ({
        control_id: ICMS_ID,
        competence: "2026-08",
        source: "NONE" as const,
        pending: null,
        items: [],
      })),
    };
    const app = createFiscalWorkerApp({ env: env(), controlService: controls });
    const reader = gatewayHeaders({
      "x-auth-permission": "1",
      "x-auth-modules": JSON.stringify({ fiscal: 1 }),
    });

    const listed = await app.request(
      "https://fiscal.test/fiscal/monthly-controls?competence=2026-08",
      { headers: reader },
    );
    expect(listed.status).toBe(200);
    expect(controls.list).toHaveBeenCalledWith(
      { competence: "2026-08" },
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
    );

    const transfer = await app.request("https://fiscal.test/fiscal/monthly-controls/transfer", {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ control_ids: [ICMS_ID], to_user_id: USER_ID, reason: "Férias" }),
    });
    expect(transfer.status).toBe(200);
    expect(controls.transfer).toHaveBeenCalledWith(
      expect.objectContaining({ control_ids: [ICMS_ID], to_user_id: USER_ID, permission: 3 }),
    );
    const readerTransfer = await app.request(
      "https://fiscal.test/fiscal/monthly-controls/transfer",
      {
        method: "POST",
        headers: { ...reader, "content-type": "application/json" },
        body: JSON.stringify({ control_ids: [ICMS_ID], to_user_id: USER_ID, reason: "Férias" }),
      },
    );
    expect(readerTransfer.status).toBe(403);
    const candidates = await app.request(
      "https://fiscal.test/fiscal/monthly-controls/responsibles",
      { headers: gatewayHeaders() },
    );
    expect(candidates.status).toBe(200);

    const triage = await app.request(
      `https://fiscal.test/fiscal/monthly-controls/${ICMS_ID}/triage`,
      { headers: reader },
    );
    expect(triage.status).toBe(200);
    expect(controls.triage).toHaveBeenCalledWith(
      ICMS_ID,
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    );

    const opened = await app.request("https://fiscal.test/fiscal/monthly-controls", {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        client_id: control.client_id,
        competence: "2026-08",
        reason: "Avulso",
      }),
    });
    expect(opened.status).toBe(201);
    controls.open.mockResolvedValueOnce({ control, created: false });
    const reopened = await app.request("https://fiscal.test/fiscal/monthly-controls", {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ client_id: control.client_id, competence: "2026-08" }),
    });
    expect(reopened.status).toBe(200);

    const updated = await app.request(`https://fiscal.test/fiscal/monthly-controls/${ICMS_ID}`, {
      method: "PATCH",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    expect(updated.status).toBe(200);
    expect(controls.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: ICMS_ID, status: "IN_PROGRESS", permission: 3 }),
    );

    const readerWrite = await app.request(
      `https://fiscal.test/fiscal/monthly-controls/${ICMS_ID}`,
      {
        method: "PATCH",
        headers: { ...reader, "content-type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      },
    );
    expect(readerWrite.status).toBe(403);
    const invalid = await app.request(`https://fiscal.test/fiscal/monthly-controls/${ICMS_ID}`, {
      method: "PATCH",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    expect(invalid.status).toBe(400);
    expect(controls.update).toHaveBeenCalledOnce();
  });

  it("obrigações do controle: leitura nível 1, inclusão e cumprimento nível 2, contrato validado", async () => {
    const item = {
      code: "PGDAS_D" as const,
      name: "PGDAS-D",
      note: "",
      source: "https://www.gov.br/",
      origin: "SUGGESTED",
      status: "PENDING" as const,
      not_applicable_reason: null,
      completed_on: null,
      completed_by: null,
      protocol: null,
      updatedAt: "2026-09-10T12:00:00.000Z",
    };
    const obligations = {
      list: vi.fn(async () => ({ control_id: ICMS_ID, items: [item], addable: [] })),
      add: vi.fn(async () => item),
      update: vi.fn(async () => ({ ...item, status: "COMPLETED" as const })),
    };
    const app = createFiscalWorkerApp({ env: env(), obligationService: obligations });
    const reader = gatewayHeaders({
      "x-auth-permission": "1",
      "x-auth-modules": JSON.stringify({ fiscal: 1 }),
    });
    const base = `https://fiscal.test/fiscal/monthly-controls/${ICMS_ID}/obligations`;

    const listed = await app.request(base, { headers: reader });
    expect(listed.status).toBe(200);
    expect(obligations.list).toHaveBeenCalledWith(
      ICMS_ID,
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    );

    const added = await app.request(base, {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ code: "DIRBI", reason: "Benefício fiscal" }),
    });
    expect(added.status).toBe(201);

    const completed = await app.request(`${base}/PGDAS_D`, {
      method: "PATCH",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ completed_on: "2026-09-10" }),
    });
    expect(completed.status).toBe(200);
    expect(obligations.update).toHaveBeenCalledWith(
      ICMS_ID,
      "PGDAS_D",
      { completed_on: "2026-09-10" },
      expect.objectContaining({ userId: USER_ID }),
    );

    const readerWrite = await app.request(`${base}/PGDAS_D`, {
      method: "PATCH",
      headers: { ...reader, "content-type": "application/json" },
      body: JSON.stringify({ completed_on: "2026-09-10" }),
    });
    expect(readerWrite.status).toBe(403);
    const unknownCode = await app.request(`${base}/XPTO`, {
      method: "PATCH",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ completed_on: "2026-09-10" }),
    });
    expect(unknownCode.status).toBe(400);
    expect(obligations.update).toHaveBeenCalledOnce();
  });

  it("controle anual: leitura nível 1, declarações com escrita nível 2 e contrato validado", async () => {
    const declaration = {
      code: "DEFIS" as const,
      name: "DEFIS",
      note: "",
      source: "https://www.gov.br/",
      origin: "SUGGESTED",
      status: "PENDING" as const,
      not_applicable_reason: null,
      completed_on: null,
      completed_by: null,
      protocol: null,
      updatedAt: "2026-03-01T12:00:00.000Z",
    };
    const annual = {
      list: vi.fn(async () => ({ year: 2025, items: [] })),
      items: vi.fn(async () => ({ control_id: ICMS_ID, items: [declaration], addable: [] })),
      addItem: vi.fn(async () => declaration),
      updateItem: vi.fn(async () => declaration),
    };
    const app = createFiscalWorkerApp({ env: env(), annualService: annual });
    const reader = gatewayHeaders({
      "x-auth-permission": "1",
      "x-auth-modules": JSON.stringify({ fiscal: 1 }),
    });

    const listed = await app.request("https://fiscal.test/fiscal/annual-controls?year=2025", {
      headers: reader,
    });
    expect(listed.status).toBe(200);
    expect(annual.list).toHaveBeenCalledWith(
      { year: 2025 },
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    );
    const base = `https://fiscal.test/fiscal/annual-controls/${ICMS_ID}/items`;
    expect((await app.request(base, { headers: reader })).status).toBe(200);

    const added = await app.request(base, {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ code: "DIMOB", reason: "Imobiliária" }),
    });
    expect(added.status).toBe(201);
    const readerWrite = await app.request(`${base}/DEFIS`, {
      method: "PATCH",
      headers: { ...reader, "content-type": "application/json" },
      body: JSON.stringify({ completed_on: "2026-03-10" }),
    });
    expect(readerWrite.status).toBe(403);
    const invalid = await app.request(`${base}/DIRBI`, {
      method: "PATCH",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ completed_on: "2026-03-10" }),
    });
    expect(invalid.status).toBe(400);
    expect(annual.updateItem).not.toHaveBeenCalled();
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

  it("acompanha malhas no tenant autenticado, com anexo e leitura para nível 1", async () => {
    const malha = {
      id: ICMS_ID,
      client_id: "d0000000-0000-4000-8000-000000000001",
      period_start: "2025-01",
      period_end: "2025-12",
      reason: "Divergência",
      deadline: null,
      status: "aberta",
      responsible_id: null,
      task_id: null,
      attachment: null,
    };
    const malhas = {
      create: vi.fn(async () => malha),
      update: vi.fn(async () => ({ ...malha, status: "respondida" })),
      list: vi.fn(async () => ({ data: [malha], total: 1, page: 1, limit: 50, hasMore: false })),
      detail: vi.fn(async () => ({ ...malha, history: [] })),
      replaceAttachment: vi.fn(async () => malha),
      attachmentAccess: vi.fn(async () => ({ url: "https://signed", expires_in_seconds: 300 })),
    };
    const app = createFiscalWorkerApp({ env: env(), malhaService: malhas as never });
    const viewer = gatewayHeaders({ "x-auth-modules": JSON.stringify({ fiscal: 1 }) });

    const created = await app.request("https://fiscal.test/fiscal/malhas", {
      method: "POST",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        client_id: malha.client_id,
        period_start: "2025-01",
        period_end: "2025-12",
        reason: "Divergência",
      }),
    });
    expect(created.status).toBe(201);
    expect(malhas.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        status: "aberta",
      }),
    );

    const listed = await app.request(
      `https://fiscal.test/fiscal/malhas/list?status=aberta&client_id=${malha.client_id}`,
      { headers: viewer },
    );
    expect(listed.status).toBe(200);
    expect(malhas.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: "aberta", client_id: malha.client_id }),
      ORGANIZATION_ID,
    );

    const detail = await app.request(`https://fiscal.test/fiscal/malhas/${ICMS_ID}`, {
      headers: viewer,
    });
    expect(detail.status).toBe(200);
    expect(malhas.detail).toHaveBeenCalledWith(ICMS_ID, ORGANIZATION_ID);

    const updated = await app.request(`https://fiscal.test/fiscal/malhas/${ICMS_ID}`, {
      method: "PUT",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ status: "respondida" }),
    });
    expect(updated.status).toBe(200);
    expect(malhas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ICMS_ID,
        status: "respondida",
        organizationId: ORGANIZATION_ID,
      }),
    );

    const form = new FormData();
    form.append("file", new File(["%PDF-1.7"], "intimacao.pdf", { type: "application/pdf" }));
    const attached = await app.request(`https://fiscal.test/fiscal/malhas/${ICMS_ID}/attachment`, {
      method: "POST",
      headers: gatewayHeaders(),
      body: form,
    });
    expect(attached.status).toBe(201);
    expect(malhas.replaceAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ICMS_ID,
        organizationId: ORGANIZATION_ID,
        file: expect.objectContaining({ originalname: "intimacao.pdf", size: 8 }),
      }),
    );

    const access = await app.request(`https://fiscal.test/fiscal/malhas/${ICMS_ID}/attachment`, {
      headers: viewer,
    });
    expect(access.status).toBe(200);
    expect(access.headers.get("cache-control")).toBe("no-store");

    const viewerWrite = await app.request(`https://fiscal.test/fiscal/malhas/${ICMS_ID}`, {
      method: "PUT",
      headers: { ...viewer, "content-type": "application/json" },
      body: JSON.stringify({ status: "encerrada" }),
    });
    expect(viewerWrite.status).toBe(403);
    expect(malhas.update).toHaveBeenCalledOnce();
  });

  it("consulta e altera a condição de atacadista no tenant autenticado", async () => {
    const clientId = "d0000000-0000-4000-8000-000000000001";
    const state = {
      client_id: clientId,
      is_wholesale: true,
      updated_at: null,
      updated_by: null,
      history: [],
    };
    const wholesale = { get: vi.fn(async () => state), set: vi.fn(async () => state) };
    const app = createFiscalWorkerApp({ env: env(), wholesaleService: wholesale });
    const viewer = gatewayHeaders({ "x-auth-modules": JSON.stringify({ fiscal: 1 }) });

    const read = await app.request(`https://fiscal.test/fiscal/clients/${clientId}/wholesale`, {
      headers: viewer,
    });
    expect(read.status).toBe(200);
    expect(wholesale.get).toHaveBeenCalledWith(clientId, ORGANIZATION_ID);

    const updated = await app.request(`https://fiscal.test/fiscal/clients/${clientId}/wholesale`, {
      method: "PUT",
      headers: { ...gatewayHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ is_wholesale: true }),
    });
    expect(updated.status).toBe(200);
    expect(wholesale.set).toHaveBeenCalledWith(
      expect.objectContaining({ clientId, isWholesale: true, organizationId: ORGANIZATION_ID }),
    );

    const viewerWrite = await app.request(
      `https://fiscal.test/fiscal/clients/${clientId}/wholesale`,
      {
        method: "PUT",
        headers: { ...viewer, "content-type": "application/json" },
        body: JSON.stringify({ is_wholesale: false }),
      },
    );
    expect(viewerWrite.status).toBe(403);
    expect(wholesale.set).toHaveBeenCalledOnce();
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
