import {
  AUTH_SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  createCsrfToken,
  hashCsrfToken,
} from "@workspace/runtime";
import { FORWARDED_AUTH_CSRF_HASH_HEADER } from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { type ClientWorkerEnv, createClientWorkerApp } from "./app.js";

const USER_ID = "c0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const EVENT_ID = "e0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "client-gateway-internal-token";
const REPORTS_TOKEN = "reports-internal-token";
const REPORTS_SECRET = "reports-grant-secret";

function env(): ClientWorkerEnv {
  return {
    JWT_SECRET: "client-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    REPORTS_INTERNAL_TOKEN: REPORTS_TOKEN,
    REPORTS_GRANT_SECRET: REPORTS_SECRET,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function headers(modules: Record<string, number> = { integracao: 3 }): HeadersInit {
  return {
    "x-internal-service-token": INTERNAL_TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-type": "owner",
    "x-auth-modules": JSON.stringify(modules),
  };
}

function service() {
  return {
    createPA: vi.fn().mockResolvedValue({ client_id: CLIENT_ID }),
    getPADetail: vi.fn().mockResolvedValue({ client_id: CLIENT_ID }),
    updatePA: vi.fn().mockResolvedValue({ client_id: CLIENT_ID, activities: "Serviços" }),
    terminate: vi.fn().mockResolvedValue({ id: "termination-1" }),
    updateFinance: vi.fn().mockResolvedValue({ id: CLIENT_ID, contract: true }),
    updateRegularize: vi.fn().mockResolvedValue({ id: CLIENT_ID, dominio_code: "DOM-1" }),
    runCompetenceOutputUpdate: vi.fn().mockResolvedValue({ updated: 1 }),
    applyCommercialProjection: vi.fn().mockResolvedValue({
      event_id: EVENT_ID,
      applied: true,
      duplicate: false,
      client_id: CLIENT_ID,
    }),
    reportingCatalog: vi.fn().mockResolvedValue({ sources: [], relations: [] }),
    extractReporting: vi.fn().mockResolvedValue({ rows: [], reachedLimit: false }),
  };
}

async function signedGrant(body: unknown, operation: "catalog" | "extract") {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
        .join(",")}}`;
    }
    return JSON.stringify(value);
  };
  const bytes = new TextEncoder().encode(canonical(body));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    audience: "client-service",
    body_sha256: digest,
    expires_at: issuedAt + 60,
    fields: operation === "catalog" ? [] : ["name"],
    issued_at: issuedAt,
    operation,
    organization_id: ORGANIZATION_ID,
    request_id: "request-1",
    source: operation === "catalog" ? "integracao.catalog" : "integracao.clients",
    version: 1,
  };
  const encoded = btoa(canonical(payload))
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
  const signature = Array.from(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return { encoded, signature };
}

describe("client Worker remainder", () => {
  it("routes PA CRUD with the authenticated organization", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService: clientService as never });

    const created = await app.request(`https://client.test/client/${CLIENT_ID}/pa`, {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: "{}",
    });
    const detail = await app.request(`https://client.test/client/${CLIENT_ID}/pa`, {
      headers: headers(),
    });
    const updated = await app.request(`https://client.test/client/${CLIENT_ID}/pa`, {
      method: "PATCH",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ activities: "Serviços" }),
    });

    expect(created.status).toBe(201);
    expect(detail.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(clientService.createPA).toHaveBeenCalledWith(CLIENT_ID, ORGANIZATION_ID);
    expect(clientService.getPADetail).toHaveBeenCalledWith(CLIENT_ID, ORGANIZATION_ID);
    expect(clientService.updatePA).toHaveBeenCalledWith(
      CLIENT_ID,
      ORGANIZATION_ID,
      expect.objectContaining({ activities: "Serviços" }),
    );
  });

  it("keeps vertical mutations behind their module claims", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService: clientService as never });

    const denied = await app.request(`https://client.test/client/${CLIENT_ID}/finance`, {
      method: "PATCH",
      headers: { ...headers({ integracao: 3 }), "content-type": "application/json" },
      body: JSON.stringify({ contract: true }),
    });
    const allowed = await app.request(`https://client.test/client/${CLIENT_ID}/finance`, {
      method: "PATCH",
      headers: { ...headers({ financeiro: 2 }), "content-type": "application/json" },
      body: JSON.stringify({ contract: true }),
    });

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(clientService.updateFinance).toHaveBeenCalledWith(CLIENT_ID, ORGANIZATION_ID, {
      contract: true,
    });
  });

  it("allows the client catalog through a domain module claim", async () => {
    const clientService = {
      listByOrganization: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      }),
    };
    const app = createClientWorkerApp({ env: env(), clientService: clientService as never });

    const response = await app.request("https://client.test/client/list", {
      headers: headers({ financeiro: 1 }),
    });

    expect(response.status).toBe(200);
    expect(clientService.listByOrganization).toHaveBeenCalled();
  });

  it("protects internal competence and commercial routes with the service token", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService: clientService as never });
    const event = {
      event_id: EVENT_ID,
      event_type: "commercial.prospecting.transition",
      event_version: 1,
      organization_id: ORGANIZATION_ID,
      client_id: CLIENT_ID,
      prospecting_id: "f0000000-0000-4000-8000-000000000001",
      from_status: null,
      to_status: "Fechado",
      status_date: null,
      description: null,
      audit_correlation_id: "audit-1",
      occurred_at: "2026-09-22T12:00:00.000Z",
    };

    const denied = await app.request("https://client.test/internal/competence-output-update", {
      method: "POST",
    });
    const applied = await app.request(
      "https://client.test/internal/commercial/prospecting-transition",
      {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify(event),
      },
    );

    expect(denied.status).toBe(403);
    expect(applied.status).toBe(200);
    expect(clientService.applyCommercialProjection).toHaveBeenCalledWith(event);
  });

  it("verifies canonical report grants before extraction", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService: clientService as never });
    const body = { source: "integracao.clients", fields: ["name"], limit: 10 };
    const signed = await signedGrant(body, "extract");

    const response = await app.request("https://client.test/internal/reporting/extract", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": REPORTS_TOKEN,
        "x-request-id": "request-1",
        "x-reports-grant": signed.encoded,
        "x-reports-grant-signature": signed.signature,
      },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    expect(clientService.extractReporting).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      source: "integracao.clients",
      fields: ["name"],
      limit: 10,
    });
  });

  it("validates CSRF before requiring the configured session validator", async () => {
    const clientService = service();
    const app = createClientWorkerApp({ env: env(), clientService: clientService as never });
    const csrfToken = createCsrfToken();
    const csrfHash = await hashCsrfToken(csrfToken);

    const response = await app.request(`https://client.test/client/${CLIENT_ID}/pa`, {
      method: "PATCH",
      headers: {
        ...headers(),
        cookie: `${AUTH_SESSION_COOKIE_NAME}=session; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        [CSRF_HEADER_NAME]: csrfToken,
        [FORWARDED_AUTH_CSRF_HASH_HEADER]: csrfHash,
        "content-type": "application/json",
      },
      body: "{}",
    });

    expect(response.status).toBe(503);
    expect(clientService.updatePA).not.toHaveBeenCalled();
  });
});
