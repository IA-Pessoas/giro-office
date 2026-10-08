import { ServiceError } from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createParcelamentoWorkerApp, type ParcelamentoWorkerEnv } from "./app.js";

const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORGANIZATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INSTALLMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const JWT_SECRET = "parcelamento-worker-test-secret";
const INTERNAL_TOKEN = "parcelamento-worker-internal-token";

type Installment = {
  id: string;
  client_id: string;
  type: string;
  jurisdiction: string;
  status: string;
};

type InstallmentServiceMock = {
  list: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
};

function env(): ParcelamentoWorkerEnv {
  return {
    JWT_SECRET,
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function service(): InstallmentServiceMock {
  const installment: Installment = {
    id: INSTALLMENT_ID,
    client_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    type: "Federal",
    jurisdiction: "PGFN",
    status: "Ativo",
  };

  return {
    list: vi.fn(async () => ({
      items: [installment],
      total: 1,
      page: 1,
      page_size: 50,
      has_more: false,
    })),
    getById: vi.fn(async () => installment),
  };
}

function gatewayHeaders(overrides: Record<string, string> = {}): HeadersInit {
  return {
    "x-internal-service-token": INTERNAL_TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-type": "owner",
    "x-auth-permission": "3",
    "x-auth-modules": JSON.stringify({ parcelamento: 3 }),
    "x-request-id": "parcelamento-request-1",
    ...overrides,
  };
}

describe("parcelamento Worker", () => {
  it("retorna envelopes de sucesso para health e ready", async () => {
    const prisma = { $queryRaw: vi.fn(async () => [{ ok: 1 }]) };
    const app = createParcelamentoWorkerApp({ env: env(), prisma });

    const health = await app.request("https://parcelamento.test/health");
    const ready = await app.request("https://parcelamento.test/ready");

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      success: true,
      data: { status: "ok", service: "parcelamento-service" },
    });
    expect(ready.status).toBe(200);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejeita o fluxo de parcelamento sem autenticação", async () => {
    const installmentService = service();
    const app = createParcelamentoWorkerApp({ env: env(), installmentService });

    const response = await app.request("https://parcelamento.test/parcelamento/installments");

    expect(response.status).toBe(401);
    expect(installmentService.list).not.toHaveBeenCalled();
  });

  it("preserva auth encaminhada e isolamento por organization_id no list", async () => {
    const installmentService = service();
    const app = createParcelamentoWorkerApp({ env: env(), installmentService });

    const response = await app.request(
      "https://parcelamento.test/parcelamento/installments?page=2&page_size=10&search=PGFN",
      { headers: gatewayHeaders() },
    );

    expect(response.status).toBe(200);
    expect(installmentService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "parcelamento-request-1",
        userId: USER_ID,
        organizationId: ORGANIZATION_ID,
        permission: "3",
      }),
      { page: 2, page_size: 10, search: "PGFN" },
    );
  });

  it("detalha parcelamento usando a organização autenticada", async () => {
    const installmentService = service();
    const app = createParcelamentoWorkerApp({ env: env(), installmentService });

    const response = await app.request(
      `https://parcelamento.test/parcelamento/installments/${INSTALLMENT_ID}`,
      { headers: gatewayHeaders() },
    );

    expect(response.status).toBe(200);
    expect(installmentService.getById).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
      INSTALLMENT_ID,
    );
  });

  it("serializa erro de domínio do fluxo de detalhe", async () => {
    const installmentService = service();
    installmentService.getById.mockRejectedValue(
      new ServiceError(404, "Parcelamento não encontrado."),
    );
    const app = createParcelamentoWorkerApp({ env: env(), installmentService });

    const response = await app.request(
      `https://parcelamento.test/parcelamento/installments/${INSTALLMENT_ID}`,
      { headers: gatewayHeaders() },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Parcelamento não encontrado.",
      code: "NOT_FOUND",
    });
  });
});

describe("parcelamento Worker — OpenAPI docs", () => {
  const app = (extra: Partial<ParcelamentoWorkerEnv>) =>
    createParcelamentoWorkerApp({ env: { ...env(), ...extra } });

  it("serve /openapi.json e /docs com ENABLE_API_DOCS fora de produção", async () => {
    const docsApp = app({ ENABLE_API_DOCS: "true" });
    const spec = await docsApp.request("https://parcelamento.test/openapi.json");
    expect(spec.status).toBe(200);
    expect(((await spec.json()) as { paths: Record<string, unknown> }).paths).toHaveProperty(
      "/parcelamento/installments",
    );
    const docs = await docsApp.request("https://parcelamento.test/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
    const html = await docs.text();
    expect(html).toContain("<title>Parcelamento Service - OpenAPI</title>");
    expect(html).toContain('url: "/openapi.json"');
  });

  it.each([
    {},
    { ENABLE_API_DOCS: "false" },
    { ENABLE_API_DOCS: "true", NODE_ENV: "production" },
  ])("oculta /openapi.json e /docs com %o", async (extra) => {
    const docsApp = app(extra);
    expect((await docsApp.request("https://parcelamento.test/openapi.json")).status).toBe(404);
    expect((await docsApp.request("https://parcelamento.test/docs")).status).toBe(404);
  });
});
