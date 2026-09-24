// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// domain.ts acessa os models via `delegate(database, "nome")`, então nem o typecheck nem os
// testes com Prisma mockado veem campo fora do schema, model sem @@map ou coluna NOT NULL.
import { createHash, createHmac, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  requireSmokeState,
  SMOKE_INTERNAL_TOKEN,
  type SmokeResponse,
  smokeCall,
  smokeEnv,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { createTiWorkerApp, type TiWorkerEnv } from "./app.js";

const REPORTS_SECRET = "crud-smoke-reports-grant-secret";

// Mesmo formato que verifyReportingGrant (app.ts) exige.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function reportingHeaders(
  operation: "catalog" | "extract",
  source: string,
  fields: string[],
  body: unknown,
): Record<string, string> {
  const requestId = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const grant = Buffer.from(
    canonicalJson({
      version: 1,
      audience: "ti-service",
      operation,
      source,
      organization_id: requireSmokeState().organizationId,
      fields,
      request_id: requestId,
      issued_at: now - 1,
      expires_at: now + 30,
      body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    }),
  ).toString("base64url");
  return {
    "content-type": "application/json",
    "x-internal-service-token": SMOKE_INTERNAL_TOKEN,
    "x-request-id": requestId,
    "x-reports-grant": grant,
    "x-reports-grant-signature": createHmac("sha256", REPORTS_SECRET).update(grant).digest("hex"),
  };
}

describe.skipIf(!smokeState)("ti-service CRUD smoke (banco real)", () => {
  const env = () =>
    smokeEnv<TiWorkerEnv>({
      // EncryptionService exige 32 bytes em base64 (AES-256-GCM).
      MTK_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      REPORTS_INTERNAL_TOKEN: SMOKE_INTERNAL_TOKEN,
      REPORTS_GRANT_SECRET: REPORTS_SECRET,
    });
  const app = () => createTiWorkerApp({ env: env() });
  const suffix = () => `${Date.now()}-${randomUUID().slice(0, 6)}`;

  // Continua depois de uma falha para listar todas as rotas quebradas de uma vez.
  let failures: string[] = [];
  afterEach(() => {
    const found = failures;
    failures = [];
    expect(found, found.join("\n\n")).toEqual([]);
  });
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    allowed: number[] = [200, 201],
    headers?: Record<string, string>,
  ): Promise<SmokeResponse & { data: Record<string, unknown> }> => {
    const result = await smokeCall(app(), env(), method, path, body, headers);
    if (!allowed.includes(result.status)) {
      failures.push(`${method} ${path}: HTTP ${result.status} ${result.text.slice(0, 1200)}`);
    }
    return { ...result, data: result.json?.data ?? {} };
  };

  it("inventário: categorias, locais, ativos, atribuição e devolução", async () => {
    const { userId, ownerId } = requireSmokeState();
    const category = await call("POST", "/ti/inventory-categories", {
      name: `Notebook ${suffix()}`,
      tag: "NB",
    });
    const categoryId = category.data.id as string;
    await call("GET", "/ti/inventory-categories/list");
    await call("PATCH", `/ti/inventory-categories/${categoryId}`, {
      name: `Notebook editado ${suffix()}`,
      tag: "NBK",
      active: true,
    });

    const location = await call("POST", "/ti/inventory-locations", { name: `Sala ${suffix()}` });
    const locationId = location.data.id as string;
    await call("GET", "/ti/inventory-locations/list");
    await call("PATCH", `/ti/inventory-locations/${locationId}`, {
      name: `Sala editada ${suffix()}`,
      active: true,
    });

    const asset = await call("POST", "/ti/inventory", {
      asset_code: `PAT-${suffix()}`,
      category_id: categoryId,
      location_id: locationId,
      user_id: userId,
      responsible_it_staff_id: ownerId,
      notes: "Criado pelo smoke",
      delivery_date: "2026-09-01",
    });
    const assetId = asset.data.id as string;
    await call("GET", `/ti/inventory/${assetId}`);
    await call(
      "GET",
      `/ti/inventory/list?page=1&page_size=20&category_id=${categoryId}&location_id=${locationId}&user_id=${userId}&asset_code=PAT&status=assigned`,
    );
    await call("GET", "/ti/inventory/list?status=available");
    await call("PATCH", `/ti/inventory/${assetId}`, {
      asset_code: `PAT-ED-${suffix()}`,
      category_id: categoryId,
      location_id: locationId,
      responsible_it_staff_id: ownerId,
      notes: "Editado pelo smoke",
      delivery_date: "2026-09-02",
    });
    await call("PATCH", `/ti/inventory/${assetId}/return`, {
      return_date: "2026-09-10",
      notes: "Devolvido",
    });
    await call("PATCH", `/ti/inventory/${assetId}/assign-user`, {
      user_id: userId,
      delivery_date: "2026-09-11",
    });
    await call("PATCH", `/ti/inventory-categories/${categoryId}`, { active: false });
    await call("PATCH", `/ti/inventory-locations/${locationId}`, { active: false });
  });

  it("ramais", async () => {
    const { userId } = requireSmokeState();
    const number = () => String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
    const created = await call(
      "POST",
      "/ti/extensions",
      { user_id: userId, number: number() },
      [201, 409],
    );
    const id = created.data.id as string;
    if (!id) return;
    await call("GET", `/ti/extensions/${id}`);
    await call("GET", `/ti/extensions/list?page=1&page_size=20&user_id=${userId}`);
    await call("PATCH", `/ti/extensions/${id}`, { user_id: userId, number: number() }, [200, 409]);
  });

  it("senhas: cria, lê, lista, edita e inativa", async () => {
    const { userId } = requireSmokeState();
    const created = await call("POST", "/ti/passwords", {
      local: `VPN ${suffix()}`,
      user_id: userId,
      password: "Smoke#Senha123",
      notes: "Criada pelo smoke",
    });
    const id = created.data.id as string;
    const detail = await call("GET", `/ti/passwords/${id}`);
    expect(detail.data.password).toBe("Smoke#Senha123");
    await call(
      "GET",
      `/ti/passwords/list?page=1&page_size=20&user_id=${userId}&local=VPN&search=VPN&status=active`,
    );
    await call("GET", "/ti/passwords/list?status=all");
    await call("PATCH", `/ti/passwords/${id}`, {
      local: `VPN editada ${suffix()}`,
      user_id: userId,
      password: "Smoke#Senha456",
      notes: "Editada",
    });
    await call("POST", `/ti/passwords/${id}/deactivate`, { reason: "Smoke encerrado" });
    await call("GET", "/ti/passwords/list?status=inactive");
  });

  it("chamados: categorias, CRUD, atribuição, status e mensagens", async () => {
    const { userId, ownerId } = requireSmokeState();
    const category = await call("POST", "/ti/request-categories", { name: `Hardware ${suffix()}` });
    const categoryId = category.data.id as string;
    await call("GET", "/ti/request-categories/list?active=true");
    await call("GET", "/ti/request-categories/list");
    await call("PATCH", `/ti/request-categories/${categoryId}`, {
      name: `Hardware editado ${suffix()}`,
      active: true,
    });

    const created = await call("POST", "/ti/requests", {
      title: "Notebook não liga",
      description: "Aberto pelo smoke",
      category_id: categoryId,
      requester_id: userId,
      assigned_to_id: ownerId,
      urgency: "High",
      attachment: "https://example.com/evidencia.png",
    });
    const id = created.data.id as string;
    await call("GET", `/ti/requests/${id}`);
    await call(
      "GET",
      `/ti/requests/list?page=1&page_size=20&status=New&urgency=High&category_id=${categoryId}&requester_id=${userId}&assigned_to_id=${ownerId}&created_from=2026-01-01&created_to=2027-01-01`,
    );
    await call("PATCH", `/ti/requests/${id}`, {
      title: "Notebook não liga (editado)",
      description: "Editado pelo smoke",
      category_id: categoryId,
      urgency: "Critical",
      attachment: "https://example.com/evidencia2.png",
    });
    await call("GET", `/ti/requests/${id}/transfer-candidates`);
    await call("PATCH", `/ti/requests/${id}/assign`, { assigned_to_id: userId });
    for (const status of ["In_Progress", "Waiting", "Resolved", "Closed"]) {
      await call("PATCH", `/ti/requests/${id}/status`, { status });
    }
    // Sem arquivo: upload de imagem depende do storage do Supabase, fora do smoke.
    await call("POST", `/ti/requests/${id}/messages`, {
      message: "Resposta do smoke",
      type: "Solution",
    });
    await call(
      "GET",
      `/ti/requests/${id}/messages?page=1&page_size=50&created_from=2026-01-01&created_to=2027-01-01`,
    );
    await call("PATCH", `/ti/request-categories/${categoryId}`, { active: false });
  });

  it("robôs e execuções", async () => {
    const created = await call("POST", "/ti/robots", {
      name: `Backup noturno ${suffix()}`,
      description: "Criado pelo smoke",
      type: "Backup",
      schedule: "0 2 * * *",
      status: "active",
      active: true,
    });
    const id = created.data.id as string;
    await call("POST", `/ti/robots/${id}/runs`, {
      status: "success",
      finished_at: "2026-09-23T02:10:00.000Z",
      message: "OK",
      metadata_json: { files: 3 },
    });
    await call("GET", `/ti/robots/${id}`);
    await call("GET", "/ti/robots/list?page=1&page_size=20&type=Backup&status=active&active=true");
    await call("GET", `/ti/robots/${id}/runs/list?page=1&page_size=20&status=success`);
    await call("PATCH", `/ti/robots/${id}`, {
      name: `Backup editado ${suffix()}`,
      description: null,
      type: "Manutencao",
      schedule: null,
      status: "inactive",
      active: false,
    });
  });

  it("estoque: categorias, locais, itens, entradas, saídas e movimentações", async () => {
    const { userId, ownerId } = requireSmokeState();
    const category = await call("POST", "/ti/stock/categories", { name: `Cabos ${suffix()}` });
    const categoryId = category.data.id as string;
    await call("GET", "/ti/stock/categories/list");
    await call("PATCH", `/ti/stock/categories/${categoryId}`, {
      name: `Cabos editado ${suffix()}`,
      status: true,
    });

    const location = await call("POST", "/ti/stock/locations", {
      name: `Almoxarifado ${suffix()}`,
      floor: 2,
    });
    const locationId = location.data.id as string;
    const destination = await call("POST", "/ti/stock/locations", {
      name: `Destino ${suffix()}`,
    });
    await call("GET", "/ti/stock/locations/list");
    await call("PATCH", `/ti/stock/locations/${locationId}`, {
      name: `Almoxarifado editado ${suffix()}`,
      floor: null,
      status: true,
    });

    const item = await call("POST", "/ti/stock/items", {
      name: `Cabo HDMI ${suffix()}`,
      category_id: categoryId,
      location_id: locationId,
      quantity: 10,
      description: "Criado pelo smoke",
    });
    const id = item.data.id as string;
    await call("GET", `/ti/stock/items/${id}`);
    await call(
      "GET",
      `/ti/stock/items/list?page=1&page_size=20&category_id=${categoryId}&location_id=${locationId}&name=Cabo&status=true`,
    );
    await call("GET", "/ti/stock?page=1&page_size=20");
    await call("PATCH", `/ti/stock/items/${id}`, {
      name: `Cabo HDMI editado ${suffix()}`,
      category_id: categoryId,
      location_id: locationId,
      description: "Editado",
      status: true,
    });
    await call("POST", `/ti/stock/items/${id}/entries`, { quantity: 5, entry_date: "2026-09-20" });
    await call("POST", `/ti/stock/items/${id}/exits`, {
      quantity: 3,
      destination: "Sala 2",
      requester_id: userId,
      approver_id: ownerId,
      operator_id: ownerId,
      location_destination_id: destination.data.id,
      exit_date: "2026-09-21",
    });
    await call("GET", `/ti/stock/items/${id}/movements/list`);
    await call("PATCH", `/ti/stock/items/${id}`, { status: false });
    await call("PATCH", `/ti/stock/categories/${categoryId}`, { status: false });
    await call("PATCH", `/ti/stock/locations/${locationId}`, { status: false });
  });

  it("termos: cria, lê, lista, edita e assina", async () => {
    const { userId, departmentId } = requireSmokeState();
    const created = await call("POST", "/ti/terms", {
      date: "2026-09-23",
      user_id: userId,
      department_id: departmentId,
      address: "Rua do Smoke, 1",
      reason: "Entrega de equipamento",
      equipament_list: "Notebook, mouse",
      brand: "Dell",
      asset_code: `PAT-${suffix()}`,
      imei: "356938035643809",
    });
    const id = created.data.id as string;
    await call("GET", `/ti/terms/${id}`);
    await call("GET", `/ti/terms/list?page=1&page_size=20&user_id=${userId}&status=pending`);
    await call("PATCH", `/ti/terms/${id}`, {
      date: "2026-09-24",
      department_id: departmentId,
      address: "Rua do Smoke, 2",
      reason: "Troca",
      equipament_list: "Notebook",
      brand: "Lenovo",
      asset_code: `PAT-ED-${suffix()}`,
      imei: "356938035643810",
    });
    await call("PATCH", `/ti/terms/${id}/sign`, { reason: "Assinado pelo smoke" });
    await call("GET", "/ti/terms/list?status=signed");
  });

  it("dashboard", async () => {
    await call("GET", "/ti/dashboard");
  });

  it("relatórios internos: catálogo e extração de todos os campos de cada fonte", async () => {
    const catalog = await call("GET", "/internal/reporting/catalog", undefined, [200], {
      ...reportingHeaders("catalog", "ti.catalog", [], {}),
    });
    const sources = (catalog.data.sources ?? []) as { key: string; fields: { key: string }[] }[];
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      const body = {
        source: source.key,
        fields: source.fields.map((field) => field.key).slice(0, 25),
        limit: 101,
      };
      await call(
        "POST",
        "/internal/reporting/extract",
        body,
        [200],
        reportingHeaders("extract", body.source, body.fields, body),
      );
    }
  });
});
