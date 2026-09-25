import { ServiceError } from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import {
  type CertificateWorkerEnv,
  createCertificateWorkerApp,
  runScheduledCertificateNotifications,
} from "./app.js";

const USER_ID = "c0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000002";
const CERTIFICATE_ID = "e0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "certificate-gateway-internal-token";

type CertificatePj = {
  id: string;
  name: string;
  cnpj: string;
  responsible: string;
  model: string;
  legal_nature: string;
  expiration_date: Date;
  client_castelo_status: boolean;
  client_focus_status: boolean;
  was_paid: boolean;
  has_certificate: boolean;
  organization_id: string;
};

type CertificatePjServiceMock = {
  listCertificatePj: ReturnType<typeof vi.fn>;
  getCertificatePj: ReturnType<typeof vi.fn>;
  createCertificatePj: ReturnType<typeof vi.fn>;
  updateCertificatePj: ReturnType<typeof vi.fn>;
  deleteCertificatePj: ReturnType<typeof vi.fn>;
  uploadCertificatePjFile: ReturnType<typeof vi.fn>;
  downloadCertificatePjFile: ReturnType<typeof vi.fn>;
  deleteCertificatePjFile: ReturnType<typeof vi.fn>;
};

function certificate(): CertificatePj {
  return {
    id: CERTIFICATE_ID,
    name: "Empresa Castelo",
    cnpj: "11222333000144",
    responsible: "Maria Silva",
    model: "A1",
    legal_nature: "LTDA",
    expiration_date: new Date("2026-12-31T00:00:00.000Z"),
    client_castelo_status: true,
    client_focus_status: false,
    was_paid: true,
    has_certificate: false,
    organization_id: ORGANIZATION_ID,
  };
}

function service(): CertificatePjServiceMock {
  return {
    listCertificatePj: vi.fn(async () => ({
      items: [certificate()],
      total: 1,
      page: 1,
      page_size: 50,
      has_more: false,
    })),
    getCertificatePj: vi.fn(async () => certificate()),
    createCertificatePj: vi.fn(async () => certificate()),
    updateCertificatePj: vi.fn(async () => certificate()),
    deleteCertificatePj: vi.fn(async () => ({ ok: true })),
    uploadCertificatePjFile: vi.fn(async () => ({
      file_original_name: "cert.p12",
      file_mime_type: "application/x-pkcs12",
      file_size_bytes: 3,
      file_uploaded_at: new Date("2026-09-22T00:00:00.000Z"),
      file_uploaded_by_user_id: USER_ID,
      has_certificate: true,
    })),
    downloadCertificatePjFile: vi.fn(async () => ({
      buffer: Buffer.from("p12"),
      originalName: "empresa final.p12",
      mimeType: "application/x-pkcs12",
    })),
    deleteCertificatePjFile: vi.fn(async () => ({ ok: true })),
  };
}

function pfService() {
  return {
    listCertificatePf: vi.fn(async () => ({
      items: [{ id: CERTIFICATE_ID, cpf: "12345678901" }],
      total: 1,
      page: 1,
      page_size: 50,
      has_more: false,
    })),
    getCertificatePf: vi.fn(async () => ({ id: CERTIFICATE_ID, cpf: "12345678901" })),
    createCertificatePf: vi.fn(async () => ({ id: CERTIFICATE_ID })),
    updateCertificatePf: vi.fn(async () => ({ id: CERTIFICATE_ID })),
    deleteCertificatePf: vi.fn(async () => ({ ok: true })),
    uploadCertificatePfFile: vi.fn(async () => ({
      file_original_name: "cert.p12",
      file_mime_type: "application/x-pkcs12",
      file_size_bytes: 3,
      file_uploaded_at: new Date("2026-09-22T00:00:00.000Z"),
      file_uploaded_by_user_id: USER_ID,
      has_certificate: true,
    })),
    downloadCertificatePfFile: vi.fn(async () => ({
      buffer: Buffer.from("p12"),
      originalName: "pessoa final.p12",
      mimeType: "application/x-pkcs12",
    })),
    deleteCertificatePfFile: vi.fn(async () => ({ ok: true })),
  };
}

function notificationService() {
  return {
    listCertificateNotifications: vi.fn(async () => ({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
      has_more: false,
    })),
    runCertificateNotificationReconciliation: vi.fn(async () => ({
      evaluated: 2,
      created: 1,
      updated: 1,
      removed: 0,
    })),
  };
}

function env(): CertificateWorkerEnv {
  return {
    JWT_SECRET: "certificate-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    CERTIFICATE_PASSWORD_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    CERTIFICATE_PASSWORD_ENCRYPTION_KEY_VERSION: "v1",
  };
}

function gatewayHeaders(permission = 3, organizationId = ORGANIZATION_ID): HeadersInit {
  return {
    "x-internal-service-token": INTERNAL_TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": organizationId,
    "x-auth-permission": String(permission),
  };
}

const jsonBody = {
  client_castelo_status: true,
  client_focus_status: false,
  name: "Empresa Castelo",
  cnpj: "11222333000144",
  responsible: "Maria Silva",
  model: "A1",
  legal_nature: "LTDA",
  password: "secret-password",
  expiration_date: "2026-12-31T00:00:00.000Z",
  was_paid: true,
};

const pfJsonBody = {
  client_castelo_status: true,
  client_focus_status: false,
  name: "Pessoa Castelo",
  cpf: "12345678901",
  model: "A1",
  password: "secret-password",
  expiration_date: "2026-12-31T00:00:00.000Z",
  was_paid: true,
};

describe("certificate Worker PJ slice", () => {
  it("returns success envelopes for health and ready", async () => {
    const app = createCertificateWorkerApp({ env: env(), service: service() });

    const health = await app.request("https://certificate.test/health");
    const ready = await app.request("https://certificate.test/ready");

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      success: true,
      data: { status: "ok", service: "certificate-service" },
    });
    expect(ready.status).toBe(200);
  });

  it("rejects certificate routes without the gateway auth context", async () => {
    const certificateService = service();
    const app = createCertificateWorkerApp({ env: env(), service: certificateService });

    const response = await app.request("https://certificate.test/certificate/pj/list");

    expect(response.status).toBe(401);
    expect(certificateService.listCertificatePj).not.toHaveBeenCalled();
  });

  it("routes notifications by organization and protects internal reconciliation", async () => {
    const certificateNotificationService = notificationService();
    const app = createCertificateWorkerApp({
      env: env(),
      notificationService: certificateNotificationService,
    });
    const list = await app.request("https://certificate.test/certificate/notifications?page=2", {
      headers: gatewayHeaders(1),
    });
    const denied = await app.request("https://certificate.test/internal/notifications/run", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-service-token": "wrong" },
      body: "{}",
    });
    const run = await app.request("https://certificate.test/internal/notifications/run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": INTERNAL_TOKEN,
      },
      body: "{}",
    });

    expect([list.status, denied.status, run.status]).toEqual([200, 401, 200]);
    expect(certificateNotificationService.listCertificateNotifications).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      query: { page: 2 },
    });
    expect(
      certificateNotificationService.runCertificateNotificationReconciliation,
    ).toHaveBeenCalledWith({ windowDays: 30 });
  });

  it("runs the scheduled notification reconciliation with the configured window", async () => {
    const certificateNotificationService = notificationService();

    await expect(
      runScheduledCertificateNotifications({
        env: { ...env(), CERTIFICATE_NOTIFICATION_WINDOW_DAYS: 15 },
        notificationService: certificateNotificationService,
      }),
    ).resolves.toEqual({ evaluated: 2, created: 1, updated: 1, removed: 0 });
    expect(
      certificateNotificationService.runCertificateNotificationReconciliation,
    ).toHaveBeenCalledWith({ windowDays: 15 });
  });

  it("keeps the authenticated organization on the PJ CRUD flow", async () => {
    const certificateService = service();
    const app = createCertificateWorkerApp({ env: env(), service: certificateService });
    const headers = gatewayHeaders();
    const jsonHeaders = { ...headers, "content-type": "application/json" };

    const list = await app.request(
      "https://certificate.test/certificate/pj/list?page=2&page_size=10",
      {
        headers,
      },
    );
    const detail = await app.request(`https://certificate.test/certificate/pj/${CERTIFICATE_ID}`, {
      headers,
    });
    const create = await app.request("https://certificate.test/certificate/pj", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(jsonBody),
    });
    const update = await app.request(`https://certificate.test/certificate/pj/${CERTIFICATE_ID}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ name: "Empresa Atualizada" }),
    });
    const remove = await app.request(`https://certificate.test/certificate/pj/${CERTIFICATE_ID}`, {
      method: "DELETE",
      headers,
    });

    expect([list.status, detail.status, create.status, update.status, remove.status]).toEqual([
      200, 200, 201, 200, 200,
    ]);
    expect(certificateService.listCertificatePj).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      query: { page: 2, page_size: 10 },
    });
    expect(certificateService.getCertificatePj).toHaveBeenCalledWith({
      id: CERTIFICATE_ID,
      organizationId: ORGANIZATION_ID,
      canViewPassword: true,
    });
    expect(certificateService.createCertificatePj).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      data: expect.objectContaining({ name: jsonBody.name }),
    });
    expect(certificateService.updateCertificatePj).toHaveBeenCalledWith({
      id: CERTIFICATE_ID,
      organizationId: ORGANIZATION_ID,
      data: { name: "Empresa Atualizada" },
    });
    expect(certificateService.deleteCertificatePj).toHaveBeenCalledWith({
      id: CERTIFICATE_ID,
      organizationId: ORGANIZATION_ID,
    });
  });

  it("does not allow a viewer to mutate certificates", async () => {
    const certificateService = service();
    const app = createCertificateWorkerApp({ env: env(), service: certificateService });
    const headers = gatewayHeaders(1);
    const response = await app.request("https://certificate.test/certificate/pj", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(jsonBody),
    });

    expect(response.status).toBe(403);
    expect(certificateService.createCertificatePj).not.toHaveBeenCalled();
  });

  it("routes PJ file upload, download and deletion with the authenticated user", async () => {
    const certificateService = service();
    const app = createCertificateWorkerApp({ env: env(), service: certificateService });
    const headers = gatewayHeaders();
    const form = new FormData();
    form.set("file", new File(["p12"], "cert.p12", { type: "application/x-pkcs12" }));

    const upload = await app.request(
      `https://certificate.test/certificate/pj/${CERTIFICATE_ID}/file`,
      {
        method: "POST",
        headers,
        body: form,
      },
    );
    const download = await app.request(
      `https://certificate.test/certificate/pj/${CERTIFICATE_ID}/file`,
      { headers },
    );
    const remove = await app.request(
      `https://certificate.test/certificate/pj/${CERTIFICATE_ID}/file`,
      { method: "DELETE", headers },
    );

    expect([upload.status, download.status, remove.status]).toEqual([201, 200, 200]);
    expect(certificateService.uploadCertificatePjFile).toHaveBeenCalledWith({
      id: CERTIFICATE_ID,
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      file: expect.objectContaining({
        originalname: "cert.p12",
        mimetype: "application/x-pkcs12",
        size: 3,
      }),
    });
    expect(download.headers.get("content-disposition")).toBe(
      'attachment; filename="empresa_final.p12"',
    );
    expect(await download.text()).toBe("p12");
    expect(certificateService.deleteCertificatePjFile).toHaveBeenCalledWith({
      id: CERTIFICATE_ID,
      organizationId: ORGANIZATION_ID,
    });
  });

  it("surfaces service errors without changing the organization scope", async () => {
    const certificateService = service();
    certificateService.getCertificatePj.mockRejectedValueOnce(
      new ServiceError(404, "Certificado PJ não encontrado."),
    );
    const app = createCertificateWorkerApp({ env: env(), service: certificateService });

    const response = await app.request(
      `https://certificate.test/certificate/pj/${CERTIFICATE_ID}`,
      {
        headers: gatewayHeaders(1, OTHER_ORGANIZATION_ID),
      },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "NOT_FOUND",
    });
    expect(certificateService.getCertificatePj).toHaveBeenCalledWith({
      id: CERTIFICATE_ID,
      organizationId: OTHER_ORGANIZATION_ID,
      canViewPassword: false,
    });
  });

  it("routes PF CRUD through the same organization and permission boundary", async () => {
    const certificatePfService = pfService();
    const app = createCertificateWorkerApp({ env: env(), pfService: certificatePfService });
    const headers = gatewayHeaders();
    const jsonHeaders = { ...headers, "content-type": "application/json" };

    const list = await app.request("https://certificate.test/certificate/pf/list?page=2", {
      headers,
    });
    const detail = await app.request(`https://certificate.test/certificate/pf/${CERTIFICATE_ID}`, {
      headers,
    });
    const create = await app.request("https://certificate.test/certificate/pf", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(pfJsonBody),
    });
    const update = await app.request(`https://certificate.test/certificate/pf/${CERTIFICATE_ID}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ name: "Pessoa Atualizada" }),
    });
    const remove = await app.request(`https://certificate.test/certificate/pf/${CERTIFICATE_ID}`, {
      method: "DELETE",
      headers,
    });

    expect([list.status, detail.status, create.status, update.status, remove.status]).toEqual([
      200, 200, 201, 200, 200,
    ]);
    expect(certificatePfService.listCertificatePf).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      query: { page: 2 },
    });
    expect(certificatePfService.getCertificatePf).toHaveBeenCalledWith({
      id: CERTIFICATE_ID,
      organizationId: ORGANIZATION_ID,
      canViewPassword: true,
    });
    expect(certificatePfService.createCertificatePf).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      data: expect.objectContaining({ cpf: pfJsonBody.cpf }),
    });
    expect(certificatePfService.updateCertificatePf).toHaveBeenCalledWith({
      id: CERTIFICATE_ID,
      organizationId: ORGANIZATION_ID,
      data: { name: "Pessoa Atualizada" },
    });
    expect(certificatePfService.deleteCertificatePf).toHaveBeenCalledWith({
      id: CERTIFICATE_ID,
      organizationId: ORGANIZATION_ID,
    });
  });

  it("routes PF file upload, download and deletion", async () => {
    const certificatePfService = pfService();
    const app = createCertificateWorkerApp({ env: env(), pfService: certificatePfService });
    const headers = gatewayHeaders();
    const form = new FormData();
    form.set("file", new File(["p12"], "cert.p12", { type: "application/x-pkcs12" }));

    const upload = await app.request(
      `https://certificate.test/certificate/pf/${CERTIFICATE_ID}/file`,
      {
        method: "POST",
        headers,
        body: form,
      },
    );
    const download = await app.request(
      `https://certificate.test/certificate/pf/${CERTIFICATE_ID}/file`,
      { headers },
    );
    const remove = await app.request(
      `https://certificate.test/certificate/pf/${CERTIFICATE_ID}/file`,
      { method: "DELETE", headers },
    );

    expect([upload.status, download.status, remove.status]).toEqual([201, 200, 200]);
    expect(certificatePfService.uploadCertificatePfFile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: CERTIFICATE_ID,
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
      }),
    );
    expect(await download.text()).toBe("p12");
    expect(certificatePfService.deleteCertificatePfFile).toHaveBeenCalledWith({
      id: CERTIFICATE_ID,
      organizationId: ORGANIZATION_ID,
    });
  });
});
