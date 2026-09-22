import { describe, expect, it, vi } from "vitest";
import {
  createRegularizeWorkerApp,
  type RegularizeLicensePrisma,
  type RegularizeLicenseService,
  type RegularizeWorkerEnv,
} from "./app.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const LICENSE_ID = "c0000000-0000-4000-8000-000000000001";
const TOKEN = "regularize-gateway-token";

function env(): RegularizeWorkerEnv {
  return {
    JWT_SECRET: "regularize-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function headers(): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
  };
}

function service(): RegularizeLicenseService {
  return {
    list: vi.fn(async () => ({ data: [{ id: LICENSE_ID, status: "Em Andamento" }], total: 1 })),
    detail: vi.fn(async () => ({ id: LICENSE_ID, status: "Em Andamento" })),
    create: vi.fn(async (_input) => ({ id: LICENSE_ID, status: "Em Andamento" })),
    update: vi.fn(async (_input) => ({ id: LICENSE_ID, status: "Finalizado" })),
    replaceProtocol: vi.fn(async (_input) => ({
      original_name: "protocolo.pdf",
      mime_type: "application/pdf",
      size_bytes: 9,
      uploaded_at: new Date("2026-09-22T00:00:00.000Z"),
    })),
    createProtocolAccess: vi.fn(async (_input) => ({
      url: "https://storage.example/signed/protocolo.pdf",
      expires_in_seconds: 300,
    })),
  };
}

describe("regularize Worker", () => {
  it("serves health and readiness", async () => {
    const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as RegularizeLicensePrisma;
    const app = createRegularizeWorkerApp({ env: env(), prisma, licenseService: service() });
    expect((await app.request("https://regularize.test/health")).status).toBe(200);
    expect((await app.request("https://regularize.test/ready")).status).toBe(200);
  });

  it("requires authentication for license reads", async () => {
    const licenseService = service();
    const app = createRegularizeWorkerApp({ env: env(), licenseService });
    expect(
      (await app.request("https://regularize.test/regularize/licenses?status=Todos")).status,
    ).toBe(401);
    expect(licenseService.list).not.toHaveBeenCalled();
  });

  it("keeps list and detail scoped to the authenticated organization", async () => {
    const licenseService = service();
    const app = createRegularizeWorkerApp({ env: env(), licenseService });
    const list = await app.request(
      "https://regularize.test/regularize/licenses?status=Todos&page=2&limit=10",
      {
        headers: headers(),
      },
    );
    const detail = await app.request(
      `https://regularize.test/regularize/license?id=${LICENSE_ID}`,
      {
        headers: headers(),
      },
    );
    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
    expect(licenseService.list).toHaveBeenCalledWith(ORGANIZATION_ID, "Todos", 2, 10, true);
    expect(licenseService.detail).toHaveBeenCalledWith(ORGANIZATION_ID, LICENSE_ID);
  });

  it("creates and updates licenses with the forwarded identity", async () => {
    const licenseService = service();
    const app = createRegularizeWorkerApp({ env: env(), licenseService });
    const body = {
      has: true,
      type_license: "Alvará sanitário",
      entry_date: "2026-09-22T00:00:00.000Z",
      protocol: "PROTO-1",
      status: "Em Andamento",
      current_situation: "Em análise",
      contact: "contato@example.com",
      urgency: "Normal",
      type: "Municipal",
    };

    const created = await app.request("https://regularize.test/regularize/license", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const updated = await app.request("https://regularize.test/regularize/license", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ ...body, id: LICENSE_ID, status: "Finalizado" }),
    });

    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(licenseService.create).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      body: expect.objectContaining({ protocol: "PROTO-1" }),
    });
    expect(licenseService.update).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      body: expect.objectContaining({ id: LICENSE_ID, status: "Finalizado" }),
    });
  });

  it("accepts a validated protocol upload and creates signed access", async () => {
    const licenseService = service();
    const app = createRegularizeWorkerApp({ env: env(), licenseService });
    const form = new FormData();
    form.set(
      "file",
      new File(["%PDF-1.7 protocol"], "protocolo.pdf", {
        type: "application/pdf",
      }),
    );

    const uploaded = await app.request(
      `https://regularize.test/regularize/license/${LICENSE_ID}/protocol`,
      { method: "POST", headers: headers(), body: form },
    );
    const access = await app.request(
      `https://regularize.test/regularize/license/${LICENSE_ID}/protocol`,
      { headers: headers() },
    );

    expect(uploaded.status).toBe(201);
    expect(access.status).toBe(200);
    expect(licenseService.replaceProtocol).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        licenseId: LICENSE_ID,
        file: expect.objectContaining({
          mimetype: "application/pdf",
          originalname: "protocolo.pdf",
        }),
      }),
    );
    expect(licenseService.createProtocolAccess).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      licenseId: LICENSE_ID,
    });
  });
});
