import {
  AUTH_SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  createCsrfToken,
  hashCsrfToken,
} from "@workspace/runtime";
import { FORWARDED_AUTH_CSRF_HASH_HEADER } from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import {
  type CommercialWorkerEnv,
  type CommercialWorkerServices,
  createCommercialWorkerApp,
} from "./app.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "c0000000-0000-4000-8000-000000000001";
const PROSPECTING_ID = "d0000000-0000-4000-8000-000000000001";
const TASK_ID = "e0000000-0000-4000-8000-000000000001";
const CONFIG_ID = "f0000000-0000-4000-8000-000000000001";
const TOKEN = "commercial-worker-token";

function env(overrides: Partial<CommercialWorkerEnv> = {}): CommercialWorkerEnv {
  return {
    JWT_SECRET: "commercial-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
    ...overrides,
  };
}

function headers(modules: Record<string, number> = { comercial: 2 }): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-type": "user",
    "x-auth-modules": JSON.stringify(modules),
  };
}

function services(): CommercialWorkerServices {
  return {
    proposal: {
      list: vi.fn().mockResolvedValue([{ id: CONFIG_ID, name: "Mensal", contract_value: 100 }]),
      detail: vi.fn().mockResolvedValue({ id: CONFIG_ID, name: "Mensal", contract_value: 100 }),
      create: vi.fn().mockResolvedValue({ id: CONFIG_ID, name: "Mensal", contract_value: 100 }),
      update: vi.fn().mockResolvedValue({ id: CONFIG_ID, name: "Anual", contract_value: 1200 }),
      delete: vi.fn().mockResolvedValue({ id: CONFIG_ID, deleted: true }),
    },
    prospecting: {
      list: vi.fn().mockResolvedValue([]),
      listClients: vi.fn().mockResolvedValue([]),
      detail: vi.fn().mockResolvedValue({ id: PROSPECTING_ID }),
      create: vi.fn().mockResolvedValue({ id: PROSPECTING_ID }),
      update: vi.fn().mockResolvedValue({ id: PROSPECTING_ID }),
      archive: vi.fn().mockResolvedValue({ id: PROSPECTING_ID, deleted: true }),
    },
    billing: {
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ task_id: TASK_ID, hiring_status: "Contratado" }),
    },
    outbox: {
      status: vi.fn().mockResolvedValue({ counts: {}, latestFailure: null }),
    },
  };
}

describe("commercial Worker remainder", () => {
  it("preserves all commercial route seams and organization context", async () => {
    const service = services();
    const app = createCommercialWorkerApp({ env: env(), services: service });

    await app.request("https://commercial.test/commercial/proposal-configs", {
      headers: headers(),
    });
    await app.request(`https://commercial.test/commercial/proposal-configs/${CONFIG_ID}`, {
      headers: headers(),
    });
    await app.request("https://commercial.test/commercial/proposal-configs", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ name: "Mensal", contract_value: 100 }),
    });
    await app.request(`https://commercial.test/commercial/proposal-configs/${CONFIG_ID}`, {
      method: "PATCH",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ contract_value: 1200 }),
    });
    await app.request(`https://commercial.test/commercial/proposal-configs/${CONFIG_ID}`, {
      method: "DELETE",
      headers: headers(),
    });
    await app.request("https://commercial.test/commercial/prospecting/clients", {
      headers: headers(),
    });
    await app.request("https://commercial.test/commercial/prospecting", { headers: headers() });
    await app.request(`https://commercial.test/commercial/prospecting/${PROSPECTING_ID}`, {
      headers: headers(),
    });
    await app.request("https://commercial.test/commercial/prospecting", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, status: "Análise Financeira" }),
    });
    await app.request(`https://commercial.test/commercial/prospecting/${PROSPECTING_ID}`, {
      method: "PATCH",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ status: "Envio de Proposta" }),
    });
    await app.request(`https://commercial.test/commercial/prospecting/${PROSPECTING_ID}`, {
      method: "DELETE",
      headers: headers(),
    });
    await app.request("https://commercial.test/commercial/task-billing", {
      headers: headers(),
    });
    await app.request(`https://commercial.test/commercial/task-billing/${TASK_ID}`, {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ hiring_status: "Contratado" }),
    });
    await app.request("https://commercial.test/commercial/outbox/status", {
      headers: headers(),
    });

    expect(service.proposal.list).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(service.prospecting.listClients).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(service.prospecting.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID, organization_id: ORGANIZATION_ID }),
    );
    expect(service.billing.update).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID, organization_id: ORGANIZATION_ID }),
    );
    expect(service.outbox.status).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it("aplica claims do módulo Comercial para leitura e escrita", async () => {
    const service = services();
    const app = createCommercialWorkerApp({ env: env(), services: service });

    const deniedRead = await app.request("https://commercial.test/commercial/prospecting", {
      headers: headers({ comercial: 0 }),
    });
    const deniedWrite = await app.request("https://commercial.test/commercial/prospecting", {
      method: "POST",
      headers: { ...headers({ comercial: 1 }), "content-type": "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, status: "Análise Financeira" }),
    });

    expect(deniedRead.status).toBe(403);
    expect(deniedWrite.status).toBe(403);
    expect(service.prospecting.list).not.toHaveBeenCalled();
    expect(service.prospecting.create).not.toHaveBeenCalled();
  });

  it("valida CSRF antes da sessão quando a autenticação usa cookie", async () => {
    const service = services();
    const csrfToken = createCsrfToken();
    const app = createCommercialWorkerApp({ env: env(), services: service });
    const response = await app.request("https://commercial.test/commercial/prospecting", {
      method: "POST",
      headers: {
        ...headers(),
        cookie: `${AUTH_SESSION_COOKIE_NAME}=session; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        [CSRF_HEADER_NAME]: csrfToken,
        [FORWARDED_AUTH_CSRF_HASH_HEADER]: await hashCsrfToken(csrfToken),
        "content-type": "application/json",
      },
      body: JSON.stringify({ client_id: CLIENT_ID, status: "Análise Financeira" }),
    });

    expect(response.status).toBe(503);
    expect(service.prospecting.create).not.toHaveBeenCalled();
  });
});
