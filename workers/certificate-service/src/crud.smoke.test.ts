// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa, e o
// "200 mas não salvou": toda escrita é relida pela rota de leitura da tela.
// O Supabase Storage é externo: `fetch` global é trocado por um bucket em memória.
import { randomBytes } from "node:crypto";
import { serializeError } from "@workspace/shared/http";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  expectOk,
  SMOKE_INTERNAL_TOKEN,
  smokeCall,
  smokeEnv,
  smokeHeaders,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { type CertificateWorkerEnv, createCertificateWorkerApp } from "./index.js";

const REPORTS_TOKEN = "crud-smoke-reports-token";
const REPORTS_SECRET = "crud-smoke-reports-secret";
const bucket = new Map<string, ArrayBuffer>();

function fakeStorage(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  const key = new URL(url).pathname.replace(/^\/storage\/v1\/object\//u, "");
  const method = init?.method ?? "GET";
  if (method === "POST") {
    return new Response(init?.body as BodyInit).arrayBuffer().then((bytes) => {
      bucket.set(decodeURIComponent(key), bytes);
      return Response.json({ Key: key });
    });
  }
  if (method === "GET") {
    const bytes = bucket.get(decodeURIComponent(key));
    return Promise.resolve(
      bytes ? new Response(bytes) : new Response("not found", { status: 404 }),
    );
  }
  return Promise.resolve(Response.json([]));
}

function debugApp(env: CertificateWorkerEnv) {
  const app = createCertificateWorkerApp({ env });
  app.onError((error, c) => {
    const serialized = serializeError(error, { fallbackMessage: "erro interno" });
    const cause = (error as { cause?: unknown }).cause;
    const debug = serialized.statusCode >= 500 ? `${error} | cause: ${cause}` : undefined;
    if (debug) console.error(error, cause);
    return c.json(
      { ...(serialized.body as object), debug },
      serialized.statusCode as ContentfulStatusCode,
    );
  });
  return app;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

async function reportsHeaders(
  body: unknown,
  operation: "catalog" | "extract",
  source: string,
  fields: string[],
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const grant = {
    audience: "certificate-service",
    body_sha256: hex(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(body))),
    ),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: smokeState?.organizationId,
    // Grant é de uso único: request_id diferente a cada chamada.
    request_id: `crud-smoke-${crypto.randomUUID()}`,
    source,
    version: 1,
  };
  const encoded = btoa(canonical(grant))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(REPORTS_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return {
    "content-type": "application/json",
    "x-internal-service-token": REPORTS_TOKEN,
    "x-request-id": grant.request_id,
    "x-reports-grant": encoded,
    "x-reports-grant-signature": hex(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)),
    ),
  };
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe.skipIf(!smokeState)("certificate-service CRUD smoke (banco real)", () => {
  const key = randomBytes(32).toString("base64");
  const env = () =>
    smokeEnv<CertificateWorkerEnv>({
      CERTIFICATE_PASSWORD_ENCRYPTION_KEY: key,
      CERTIFICATE_FILE_ENCRYPTION_KEY: key,
      SUPABASE_URL: "https://storage.smoke.test",
      SUPABASE_SERVICE_ROLE_KEY: "crud-smoke-service-role",
      REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
      REPORTS_GRANT_SECRET: REPORTS_SECRET,
      CERTIFICATE_REPORTING_TOKEN: REPORTS_TOKEN,
      CERTIFICATE_REPORTING_GRANT_SECRET: REPORTS_SECRET,
    });
  const call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    smokeCall(debugApp(env()), env(), method, path, body, headers);

  beforeAll(() => vi.stubGlobal("fetch", fakeStorage));
  afterAll(() => vi.unstubAllGlobals());

  const kinds = [
    {
      kind: "pj",
      // getCreatePjPayload (certificateInputNormalization.ts).
      create: (stamp: string) => ({
        client_castelo_status: true,
        client_focus_status: false,
        name: `Smoke PJ ${stamp}`,
        cnpj: "12345678000195",
        responsible: "Fulano",
        model: "A1",
        legal_nature: "LTDA",
        password: "Senha#123",
        expiration_date: inDays(10),
        notes: "Observação",
        was_paid: true,
        payment_date: "2026-09-01",
        payment_amount: 199.9,
        contact_info: "11999998888",
      }),
      update: {
        client_castelo_status: false,
        client_focus_status: true,
        responsible: "Beltrano",
        model: "A3",
        legal_nature: "SA",
        password: "Nova#456",
        expiration_date: inDays(20),
        notes: null,
        was_paid: false,
        payment_date: null,
        payment_amount: null,
        contact_info: "11888887777",
      },
      filters: (stamp: string) =>
        `page=1&page_size=20&name=${encodeURIComponent(stamp)}&cnpj=12345678000195&responsible=Fulano&model=A1&client_castelo_status=true&client_focus_status=false&was_paid=true`,
      reportFields: ["name", "model", "legal_nature", "expiration_date", "has_certificate"],
    },
    {
      kind: "pf",
      // getCreatePfPayload.
      create: (stamp: string) => ({
        client_castelo_status: false,
        client_focus_status: true,
        name: `Smoke PF ${stamp}`,
        cpf: "52998224725",
        model: "A1",
        password: "Senha#123",
        expiration_date: inDays(10),
        notes: null,
        enterprise: "Empresa Smoke",
        cnpj: "12345678000195",
        was_paid: false,
        payment_date: null,
        payment_amount: null,
        contact_info: null,
      }),
      update: {
        client_castelo_status: true,
        cpf: "11144477735",
        model: "A3",
        password: "Nova#456",
        expiration_date: inDays(20),
        notes: "Editado",
        enterprise: "Outra Empresa",
        cnpj: null,
        was_paid: true,
        payment_date: "2026-09-02",
        payment_amount: 250,
        contact_info: "11977776666",
      },
      filters: (stamp: string) =>
        `page=1&page_size=20&search=${encodeURIComponent(stamp)}&cpf=52998224725&enterprise=Empresa&cnpj=12345678000195&model=A1&client_castelo_status=false&client_focus_status=true&was_paid=false`,
      reportFields: ["name", "model", "enterprise", "expiration_date", "has_certificate"],
    },
  ] as const;

  for (const spec of kinds) {
    it(`${spec.kind.toUpperCase()}: cria, lista com filtros, lê, atualiza, arquivo, notificação, relatório e exclui`, async () => {
      const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
      const base = `/certificate/${spec.kind}`;
      const payload = spec.create(stamp);
      const created = expectOk(await call("POST", base, payload), `POST ${base}`).data;
      const id = created.id as string;
      expect((await call("POST", base, payload)).status).toBe(409);

      const list = expectOk(
        await call("GET", `${base}/list?${spec.filters(stamp)}`),
        `GET ${base}/list`,
      ).data;
      expect(list.items.map((row: { id: string }) => row.id)).toContain(id);
      expectOk(await call("GET", `${base}/list?has_certificate=false`), "list has_certificate");

      const detail = expectOk(await call("GET", `${base}/${id}`), `GET ${base}/:id`).data;
      expect(detail).toMatchObject({ name: payload.name, password: "Senha#123" });

      expectOk(await call("PATCH", `${base}/${id}`, spec.update), `PATCH ${base}/:id`);
      const updated = expectOk(await call("GET", `${base}/${id}`), "GET após PATCH").data;
      const { expiration_date, payment_date, ...plain } = spec.update;
      expect(updated).toMatchObject(plain);
      expect(updated.expiration_date.slice(0, 10)).toBe(expiration_date.slice(0, 10));
      expect(updated.payment_date?.slice(0, 10) ?? null).toBe(payment_date);

      // Upload multipart como o CertificateFileActions.
      const form = new FormData();
      form.append(
        "file",
        new File([new Uint8Array([1, 2, 3, 4])], "certificado.pfx", {
          type: "application/x-pkcs12",
        }),
      );
      const headers = await smokeHeaders();
      delete headers["content-type"];
      const upload = await debugApp(env()).request(
        `https://smoke.test${base}/${id}/file`,
        { method: "POST", headers, body: form },
        env(),
      );
      expect(upload.status, await upload.clone().text()).toBe(201);
      expect(
        expectOk(await call("GET", `${base}/${id}`), "GET após upload").data.has_certificate,
      ).toBe(true);
      const download = await call("GET", `${base}/${id}/file`);
      expect(download.status).toBe(200);
      expect(download.text).toBe("\u0001\u0002\u0003\u0004");

      const reportBody = {
        source: `certificado.${spec.kind}`,
        fields: spec.reportFields,
        limit: 5,
      };
      expectOk(
        await call(
          "POST",
          "/internal/reporting/extract",
          reportBody,
          await reportsHeaders(reportBody, "extract", reportBody.source, [...spec.reportFields]),
        ),
        "POST /internal/reporting/extract",
      );

      expectOk(await call("DELETE", `${base}/${id}/file`), `DELETE ${base}/:id/file`);
      expect(
        expectOk(await call("GET", `${base}/${id}`), "GET após remover arquivo").data
          .has_certificate,
      ).toBe(false);
      expectOk(await call("DELETE", `${base}/${id}`), `DELETE ${base}/:id`);
      expect((await call("GET", `${base}/${id}`)).status).toBe(404);
    });
  }

  // Falha hoje: o schema do Worker não nomeia o @@unique como `certificateNotificationIdentity`.
  it("job de notificação reconcilia certificados a vencer", async () => {
    const created = expectOk(
      await call("POST", "/certificate/pj", kinds[0].create(`notif-${Date.now()}`)),
      "POST /certificate/pj",
    ).data;
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([1])], "certificado.pfx", { type: "application/x-pkcs12" }),
    );
    const headers = await smokeHeaders();
    delete headers["content-type"];
    const upload = await debugApp(env()).request(
      `https://smoke.test/certificate/pj/${created.id}/file`,
      { method: "POST", headers, body: form },
      env(),
    );
    expect(upload.status).toBe(201);
    try {
      // Job interno de notificação (vence em 20 dias, janela de 30).
      expectOk(
        await call(
          "POST",
          "/internal/notifications/run",
          {},
          { "content-type": "application/json", "x-internal-service-token": SMOKE_INTERNAL_TOKEN },
        ),
        "POST /internal/notifications/run",
      );
      const notifications = expectOk(
        await call("GET", "/certificate/notifications?page=1&page_size=100"),
        "GET /certificate/notifications",
      ).data;
      expect(notifications.total).toBeGreaterThan(0);
    } finally {
      await call("DELETE", `/certificate/pj/${created.id}`);
    }
  });

  it("catálogo de relatórios consome o grant", async () => {
    expectOk(
      await call(
        "GET",
        "/internal/reporting/catalog",
        undefined,
        await reportsHeaders({}, "catalog", "certificado.catalog", []),
      ),
      "GET /internal/reporting/catalog",
    );
  });
});
