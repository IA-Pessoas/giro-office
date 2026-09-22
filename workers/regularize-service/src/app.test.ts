import { describe, expect, it, vi } from "vitest";
import {
  createRegularizeWorkerApp,
  type RegularizeClientPfService,
  type RegularizeGuidanceService,
  type RegularizeLicensePrisma,
  type RegularizeLicenseService,
  type RegularizeMunicipalTaxesService,
  type RegularizePartnersService,
  type RegularizePasswordService,
  type RegularizeProcessService,
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

function processService(): RegularizeProcessService {
  return {
    create: vi.fn(async () => ({ create: { id: "process-1", status: "Pendente" } })),
    update: vi.fn(async () => ({ id: "process-1", status: "Andamento" })),
    detail: vi.fn(async () => ({ detail: { id: "process-1" } })),
    list: vi.fn(async () => ({ data: [{ id: "process-1" }], total: 1 })),
    sendToFiscal: vi.fn(async () => ({ action: "Envio ao Fiscal" })),
    returnFromFiscal: vi.fn(async () => ({ action: "Retorno do Fiscal" })),
  };
}

function municipalTaxesService(): RegularizeMunicipalTaxesService {
  return {
    create: vi.fn(async () => ({ create: { id: "municipal-1" } })),
    update: vi.fn(async () => ({ id: "municipal-1" })),
    detail: vi.fn(async () => ({ detail: { id: "municipal-1" } })),
    list: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20, hasMore: false })),
  };
}

function clientPfService(): RegularizeClientPfService {
  return {
    create: vi.fn(async () => ({ create: { id: "client-pf-1" } })),
    update: vi.fn(async () => ({ id: "client-pf-1" })),
    detail: vi.fn(async () => ({ detail: { id: "client-pf-1" } })),
    list: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20, hasMore: false })),
  };
}

function partnersService(): RegularizePartnersService {
  return {
    create: vi.fn(async () => ({ create: { id: "partner-1" } })),
    update: vi.fn(async () => ({ id: "partner-1" })),
    detail: vi.fn(async () => ({ detail: { id: "partner-1" } })),
    list: vi.fn(async () => []),
    remove: vi.fn(async () => ({ ok: true })),
  };
}

function passwordService(): RegularizePasswordService {
  return {
    create: vi.fn(async () => ({ id: "password-1" })),
    update: vi.fn(async () => ({ id: "password-1" })),
    list: vi.fn(async () => []),
    detail: vi.fn(async () => ({ id: "password-1", login: "login", password: "secret" })),
    createSite: vi.fn(async () => ({ id: "site-1" })),
    updateSite: vi.fn(async () => ({ id: "site-1" })),
    listSites: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20, hasMore: false })),
    detailSite: vi.fn(async () => ({ id: "site-1", password: "secret" })),
  };
}

function guidanceService(): RegularizeGuidanceService {
  return {
    create: vi.fn(async () => ({ id: "guidance-1", status: "Em andamento" })),
    update: vi.fn(async () => ({ id: "guidance-1", status: "Em andamento" })),
    detail: vi.fn(async () => ({ id: "guidance-1", checklist_items: [] })),
    listByProcess: vi.fn(async () => []),
    addEconomicActivity: vi.fn(async () => ({ id: "guidance-1" })),
    updateEconomicActivity: vi.fn(async () => ({ id: "guidance-1" })),
    removeEconomicActivity: vi.fn(async () => ({ id: "guidance-1" })),
    addPartner: vi.fn(async () => ({ id: "guidance-1" })),
    updatePartner: vi.fn(async () => ({ id: "guidance-1" })),
    removePartner: vi.fn(async () => ({ id: "guidance-1" })),
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

  it("routes process CRUD, listing and fiscal actions through the process service", async () => {
    const regularizeProcess = processService();
    const app = createRegularizeWorkerApp({
      env: env(),
      licenseService: service(),
      processService: regularizeProcess,
    });
    const body = {
      client_pj_id: ORGANIZATION_ID,
      cpf_cnpj: "12345678000199",
      process_type: "Abertura",
      description: "Processo de teste",
      status: "Pendente",
    };

    const created = await app.request("https://regularize.test/regularize/process", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const updated = await app.request("https://regularize.test/regularize/process", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ ...body, id: LICENSE_ID, status: "Andamento" }),
    });
    const list = await app.request(
      "https://regularize.test/regularize/processes?status=Todos&page=1&limit=10",
      { headers: headers() },
    );
    const detail = await app.request(
      `https://regularize.test/regularize/process?id=${LICENSE_ID}`,
      { headers: headers() },
    );
    const sent = await app.request("https://regularize.test/regularize/process/send-to-fiscal", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id: LICENSE_ID }),
    });
    const returned = await app.request(
      "https://regularize.test/regularize/process/return-from-fiscal",
      {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ id: LICENSE_ID }),
      },
    );

    expect(
      [created, updated, list, detail, sent, returned].map((response) => response.status),
    ).toEqual([201, 200, 200, 200, 200, 200]);
    expect(regularizeProcess.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
    );
    expect(regularizeProcess.sendToFiscal).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      processId: LICENSE_ID,
    });
  });

  it("routes municipal taxes CRUD, detail and filtered listing", async () => {
    const municipal = municipalTaxesService();
    const app = createRegularizeWorkerApp({
      env: env(),
      licenseService: service(),
      municipalTaxesService: municipal,
    });
    const body = {
      client_id: ORGANIZATION_ID,
      year: 2026,
      tff_is_applicable: true,
      tff_amount: 10,
      tff_analysis_is_done: false,
      tlp_is_applicable: true,
      tlp_amount: 20,
      tlp_is_sent: "Não",
      tlp_not_email: false,
      tll_is_applicable: false,
      tll_amount: 0,
      tll_is_sent: "Não se aplica",
      tll_analysis_is_done: false,
    };
    const created = await app.request("https://regularize.test/regularize/municipal-taxes", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const updated = await app.request("https://regularize.test/regularize/municipal-taxes", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ ...body, id: LICENSE_ID }),
    });
    const detail = await app.request(
      `https://regularize.test/regularize/municipal-taxes-detail?id=${LICENSE_ID}`,
      { headers: headers() },
    );
    const list = await app.request(
      "https://regularize.test/regularize/municipal-taxes?year=2026&status=Criado&type=TFF&page=1&limit=20",
      { headers: headers() },
    );

    expect([created, updated, detail, list].map((response) => response.status)).toEqual([
      201, 200, 200, 200,
    ]);
    expect(municipal.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
    );
    expect(municipal.list).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      year: 2026,
      search: "",
      status: "Criado",
      type: "TFF",
      page: 1,
      limit: 20,
    });
  });

  it("routes PF clients and partners through their scoped services", async () => {
    const clientPf = clientPfService();
    const partners = partnersService();
    const app = createRegularizeWorkerApp({
      env: env(),
      licenseService: service(),
      clientPfService: clientPf,
      partnersService: partners,
    });
    const pfBody = {
      code: "PF-1",
      name: "Pessoa Teste",
      sex: "F",
      address: "Rua A",
      city: "São Paulo",
      zip_code: "01000000",
      state: "SP",
      profession: "Analista",
      father: "Pai",
      mother: "Mãe",
      marital_status: "Solteiro",
      date_of_birth: "1990-01-01",
      cpf: "12345678901",
      rg: "1234567",
      status: "Ativo",
    };
    const createdPf = await app.request("https://regularize.test/regularize/pf", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify(pfBody),
    });
    const updatedPf = await app.request("https://regularize.test/regularize/pf", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ ...pfBody, id: LICENSE_ID }),
    });
    const detailPf = await app.request(`https://regularize.test/regularize/pf?id=${LICENSE_ID}`, {
      headers: headers(),
    });
    const listPf = await app.request(
      "https://regularize.test/regularize/pfs?status=Todos&search=Pessoa&page=1&limit=20",
      { headers: headers() },
    );
    const partnerBody = {
      pj_id: ORGANIZATION_ID,
      pf_id: LICENSE_ID,
      part: 50,
      entry: "2026-01-01",
    };
    const createdPartner = await app.request("https://regularize.test/regularize/partners", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify(partnerBody),
    });
    const updatedPartner = await app.request("https://regularize.test/regularize/partners", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ ...partnerBody, id: LICENSE_ID }),
    });
    const detailPartner = await app.request(
      `https://regularize.test/regularize/partner?id=${LICENSE_ID}`,
      { headers: headers() },
    );
    const listPartners = await app.request(
      `https://regularize.test/regularize/partners?type=pf&client_id=${LICENSE_ID}`,
      { headers: headers() },
    );
    const removedPartner = await app.request(
      `https://regularize.test/regularize/partners/${LICENSE_ID}`,
      { method: "DELETE", headers: headers() },
    );

    expect(
      [
        createdPf,
        updatedPf,
        detailPf,
        listPf,
        createdPartner,
        updatedPartner,
        detailPartner,
        listPartners,
        removedPartner,
      ].map((response) => response.status),
    ).toEqual([201, 200, 200, 200, 201, 200, 200, 200, 200]);
    expect(clientPf.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
    );
    expect(partners.remove).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      id: LICENSE_ID,
    });
  });

  it("routes encrypted passwords and sites while requiring reveal permission", async () => {
    const passwords = passwordService();
    const app = createRegularizeWorkerApp({
      env: env(),
      licenseService: service(),
      passwordService: passwords,
    });
    const passwordBody = {
      client_id: ORGANIZATION_ID,
      site_id: LICENSE_ID,
      login: "user@example.com",
      password: "secret",
      notes: "nota",
    };
    const created = await app.request("https://regularize.test/regularize/passwords", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify(passwordBody),
    });
    const updated = await app.request("https://regularize.test/regularize/passwords", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ ...passwordBody, id: LICENSE_ID }),
    });
    const list = await app.request(
      `https://regularize.test/regularize/passwords?client_id=${ORGANIZATION_ID}`,
      { headers: headers() },
    );
    const detail = await app.request(
      `https://regularize.test/regularize/password?id=${LICENSE_ID}`,
      { headers: { ...headers(), "x-auth-permission": "2" } },
    );
    const siteBody = {
      name: "Portal",
      sphere: "Federal",
      link: "https://example.com",
      user: "admin",
      password: "site-secret",
    };
    const createdSite = await app.request("https://regularize.test/regularize/sites-pass", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify(siteBody),
    });
    const updatedSite = await app.request("https://regularize.test/regularize/sites-pass", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ ...siteBody, id: LICENSE_ID, status: true }),
    });
    const listSites = await app.request(
      "https://regularize.test/regularize/sites-pass?status=true&search=Portal&page=1&limit=20",
      { headers: headers() },
    );
    const detailSite = await app.request(
      `https://regularize.test/regularize/sites-pass-detail?id=${LICENSE_ID}`,
      { headers: { ...headers(), "x-auth-permission": "2" } },
    );

    expect(
      [created, updated, list, detail, createdSite, updatedSite, listSites, detailSite].map(
        (response) => response.status,
      ),
    ).toEqual([201, 200, 200, 200, 201, 200, 200, 200]);
    expect(passwords.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
    );
    expect(passwords.detail).toHaveBeenCalledWith(ORGANIZATION_ID, LICENSE_ID);
  });

  it("routes the complete guidance contract through the scoped service", async () => {
    const guidance = guidanceService();
    const app = createRegularizeWorkerApp({
      env: env(),
      licenseService: service(),
      guidanceService: guidance,
    });
    const guidanceId = "d0000000-0000-4000-8000-000000000001";
    const body = {
      target_type: "SEM_CLIENTE",
      target_snapshot: { version: 1, source: "manual", name: "Alvo" },
      checklist: Array.from({ length: 17 }, (_, index) => ({
        code: [
          "type",
          "request",
          "framework_obs",
          "legal_nature",
          "company_name",
          "trade_name",
          "cpf_cnpj",
          "share_capital",
          "iptu",
          "address",
          "comporate_purpose",
          "carryng",
          "regime",
          "legal_representative",
          "economic_activities",
          "partners",
          "branch",
        ][index],
        status: "Pendente",
      })),
      status: "Em andamento",
    };
    const activity = { code: "1", description: "Atividade", type: "Principal" };
    const partner = { name: "Sócio", cpf: "12345678901" };
    const requests = [
      app.request("https://regularize.test/regularize/guidance", {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      app.request("https://regularize.test/regularize/guidance", {
        method: "PUT",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ id: guidanceId, status: "Em andamento" }),
      }),
      app.request(`https://regularize.test/regularize/guidance/detail?id=${guidanceId}`, {
        headers: headers(),
      }),
      app.request("https://regularize.test/regularize/guidance/list?target_type=SEM_CLIENTE", {
        headers: headers(),
      }),
      app.request("https://regularize.test/regularize/guidance/activity/add", {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ guidance_id: guidanceId, activity }),
      }),
      app.request("https://regularize.test/regularize/guidance/activity/remove", {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ guidance_id: guidanceId, item_id: guidanceId }),
      }),
      app.request("https://regularize.test/regularize/guidance/activity", {
        method: "PUT",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({
          guidance_id: guidanceId,
          activity: { ...activity, id: guidanceId },
        }),
      }),
      app.request("https://regularize.test/regularize/guidance/partner/add", {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ guidance_id: guidanceId, partner }),
      }),
      app.request("https://regularize.test/regularize/guidance/partner/remove", {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ guidance_id: guidanceId, item_id: guidanceId }),
      }),
      app.request("https://regularize.test/regularize/guidance/partner", {
        method: "PUT",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ guidance_id: guidanceId, partner: { ...partner, id: guidanceId } }),
      }),
    ];

    expect((await Promise.all(requests)).map((response) => response.status)).toEqual([
      201, 200, 200, 200, 200, 200, 200, 200, 200, 200,
    ]);
    expect(guidance.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
    );
    expect(guidance.listByProcess).toHaveBeenCalledWith(ORGANIZATION_ID, undefined, "SEM_CLIENTE");
    expect(guidance.updatePartner).toHaveBeenCalledWith(
      expect.objectContaining({ guidanceId, organizationId: ORGANIZATION_ID }),
    );
  });
});
