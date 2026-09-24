import { describe, expect, it, vi } from "vitest";
import {
  createPessoalWorkerApp,
  type PessoalGroupPrisma,
  type PessoalGroupService,
  type PessoalLddService,
  type PessoalObligationService,
  type PessoalOverviewService,
  type PessoalPasswordService,
  type PessoalPayrollService,
  type PessoalSituationService,
  type PessoalUnionService,
  type PessoalWorkerEnv,
} from "./app.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const GROUP_ID = "c0000000-0000-4000-8000-000000000001";
const UNION_ID = "d0000000-0000-4000-8000-000000000001";
const SITUATION_ID = "e0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "f0000000-0000-4000-8000-000000000001";
const LDD_ID = "90000000-0000-4000-8000-000000000001";
const PASSWORD_ID = "91000000-0000-4000-8000-000000000001";
const PAYROLL_ID = "92000000-0000-4000-8000-000000000001";
const OBLIGATION_ID = "93000000-0000-4000-8000-000000000001";
const TOKEN = "pessoal-gateway-token";

function env(): PessoalWorkerEnv {
  return {
    JWT_SECRET: "pessoal-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    PESSOAL_PASSWORD_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64"),
    PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION: "v1",
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function headers(permission = "2"): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-permission": permission,
  };
}

function service(): PessoalGroupService {
  return {
    list: vi.fn(async () => [{ id: GROUP_ID, name: "Administrativo", policy: "NORMAL" }]),
    detail: vi.fn(async () => ({ id: GROUP_ID, name: "Administrativo", policy: "NORMAL" })),
    create: vi.fn(async () => ({ id: GROUP_ID, name: "Administrativo", policy: "NORMAL" })),
    update: vi.fn(async () => ({ id: GROUP_ID, name: "Fiscal", policy: "NORMAL" })),
    archive: vi.fn(async () => ({ id: GROUP_ID, archived_at: new Date().toISOString() })),
    reactivate: vi.fn(async () => ({ id: GROUP_ID, archived_at: null })),
  };
}

function unionService(): PessoalUnionService {
  return {
    list: vi.fn(async () => ({ data: [], total: 0, page: 2, limit: 20, hasMore: false })),
    detail: vi.fn(async () => ({ id: UNION_ID, name: "Sindicato", cnpj: "123" })),
    create: vi.fn(async () => ({ id: UNION_ID, name: "Sindicato", cnpj: "123" })),
    update: vi.fn(async () => ({ id: UNION_ID, name: "Sindicato Atualizado", cnpj: "123" })),
    delete: vi.fn(async () => ({ id: UNION_ID, name: "Sindicato", cnpj: "123" })),
  };
}

function situationService(): PessoalSituationService {
  return {
    list: vi.fn(async () => []),
    detail: vi.fn(async () => ({ id: SITUATION_ID, client_id: CLIENT_ID, status: "Em andamento" })),
    create: vi.fn(async () => ({ id: SITUATION_ID, client_id: CLIENT_ID })),
    update: vi.fn(async () => ({ id: SITUATION_ID, status: "Finalizado" })),
    delete: vi.fn(async () => ({ id: SITUATION_ID, client_id: CLIENT_ID })),
  };
}

function lddService(): PessoalLddService {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: LDD_ID, client_id: CLIENT_ID, type: "FGTS" })),
    update: vi.fn(async () => ({ id: LDD_ID, status: "Regular" })),
    delete: vi.fn(async () => ({ id: LDD_ID, client_id: CLIENT_ID })),
  };
}

function passwordService(): PessoalPasswordService {
  return {
    list: vi.fn(async () => [{ id: PASSWORD_ID, client_id: CLIENT_ID, service_name: "eSocial" }]),
    detail: vi.fn(async () => ({
      id: PASSWORD_ID,
      client_id: CLIENT_ID,
      service_name: "eSocial",
      senha_main: "segredo",
    })),
    create: vi.fn(async () => ({ id: PASSWORD_ID, client_id: CLIENT_ID })),
    update: vi.fn(async () => ({ id: PASSWORD_ID, service_name: "eSocial atualizado" })),
    delete: vi.fn(async () => ({ id: PASSWORD_ID, client_id: CLIENT_ID })),
  };
}

function payrollService(): PessoalPayrollService {
  return {
    detail: vi.fn(async () => ({ id: PAYROLL_ID, client_id: CLIENT_ID, employees: 2 })),
    create: vi.fn(async () => ({ id: PAYROLL_ID, client_id: CLIENT_ID, employees: 2 })),
    update: vi.fn(async () => ({ id: PAYROLL_ID, client_id: CLIENT_ID, employees: 3 })),
  };
}

function obligationService(): PessoalObligationService {
  return {
    detail: vi.fn(async () => ({ id: OBLIGATION_ID, client_id: CLIENT_ID, competence: "2026-09" })),
    create: vi.fn(async () => ({
      created: true,
      obligation: { id: OBLIGATION_ID, client_id: CLIENT_ID },
      skippedNoObligations: false,
    })),
    updateField: vi.fn(async () => ({ id: OBLIGATION_ID, payroll: true })),
    generateForCompetence: vi.fn(async () => ({
      clients: 1,
      payrollRows: 1,
      existing: 0,
      created: 1,
      skippedExisting: 0,
      skippedArchivedGroup: 0,
      skippedNoObligations: 0,
      skippedNoGroup: 0,
      skippedNoPayroll: 0,
    })),
  };
}

function overviewService(): PessoalOverviewService {
  return {
    getSummary: vi.fn(async () => ({
      unions: { total: 1, withBaseDate: 1, withoutBaseDate: 0, withCnpj: 1 },
      ldd: { total: 1, open: 1, overdue: 0, paid: 0 },
    })),
  };
}

describe("pessoal Worker", () => {
  it("serves health and readiness", async () => {
    const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as PessoalGroupPrisma;
    const app = createPessoalWorkerApp({ env: env(), prisma, groupService: service() });
    expect((await app.request("https://pessoal.test/health")).status).toBe(200);
    expect((await app.request("https://pessoal.test/ready")).status).toBe(200);
  });

  it("requires authentication and permission", async () => {
    const groupService = service();
    const app = createPessoalWorkerApp({ env: env(), groupService });
    expect((await app.request("https://pessoal.test/pessoal/groups")).status).toBe(401);
    expect(
      (await app.request("https://pessoal.test/pessoal/groups", { headers: headers("0") })).status,
    ).toBe(403);
    expect(groupService.list).not.toHaveBeenCalled();
  });

  it("keeps group CRUD scoped to the authenticated organization", async () => {
    const groupService = service();
    const app = createPessoalWorkerApp({ env: env(), groupService });
    const list = await app.request("https://pessoal.test/pessoal/groups", {
      headers: headers("1"),
    });
    const created = await app.request("https://pessoal.test/pessoal/groups", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ name: "Administrativo", policy: "NORMAL" }),
    });
    const updated = await app.request(`https://pessoal.test/pessoal/groups/${GROUP_ID}`, {
      method: "PATCH",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ name: "Fiscal" }),
    });
    const archived = await app.request(`https://pessoal.test/pessoal/groups/${GROUP_ID}`, {
      method: "DELETE",
      headers: headers(),
    });
    expect(list.status).toBe(200);
    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(archived.status).toBe(200);
    expect(groupService.list).toHaveBeenCalledOnce();
    expect(groupService.create).toHaveBeenCalledWith(ORGANIZATION_ID, USER_ID, {
      name: "Administrativo",
      policy: "NORMAL",
    });
    expect(groupService.update).toHaveBeenCalledWith(ORGANIZATION_ID, USER_ID, GROUP_ID, {
      name: "Fiscal",
    });
    expect(groupService.archive).toHaveBeenCalledWith(ORGANIZATION_ID, USER_ID, GROUP_ID);
  });

  it("routes unions and situations through the existing domain services", async () => {
    const unions = unionService();
    const situations = situationService();
    const app = createPessoalWorkerApp({
      env: env(),
      unionService: unions,
      situationService: situations,
    });
    const authHeaders = headers();
    const jsonHeaders = { ...authHeaders, "content-type": "application/json" };
    const unionList = await app.request("https://pessoal.test/pessoal/unions?page=2", {
      headers: authHeaders,
    });
    const unionDetail = await app.request(`https://pessoal.test/pessoal/unions/${UNION_ID}`, {
      headers: authHeaders,
    });
    const unionCreate = await app.request("https://pessoal.test/pessoal/unions", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name: "Sindicato", cnpj: "123" }),
    });
    const unionUpdate = await app.request(`https://pessoal.test/pessoal/unions/${UNION_ID}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ name: "Sindicato Atualizado" }),
    });
    const unionDelete = await app.request(`https://pessoal.test/pessoal/unions/${UNION_ID}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    const situationList = await app.request(
      `https://pessoal.test/pessoal/situations?client_id=${CLIENT_ID}`,
      { headers: authHeaders },
    );
    const situationDetail = await app.request(
      `https://pessoal.test/pessoal/situations/${SITUATION_ID}`,
      { headers: authHeaders },
    );
    const situationCreate = await app.request("https://pessoal.test/pessoal/situations", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ client_id: CLIENT_ID, title: "Pendência", description: "Detalhes" }),
    });
    const situationUpdate = await app.request(
      `https://pessoal.test/pessoal/situations/${SITUATION_ID}`,
      {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ status: "Finalizado" }),
      },
    );
    const situationDelete = await app.request(
      `https://pessoal.test/pessoal/situations/${SITUATION_ID}`,
      { method: "DELETE", headers: authHeaders },
    );

    expect([
      unionList.status,
      unionDetail.status,
      unionCreate.status,
      unionUpdate.status,
      unionDelete.status,
      situationList.status,
      situationDetail.status,
      situationCreate.status,
      situationUpdate.status,
      situationDelete.status,
    ]).toEqual([200, 200, 201, 200, 200, 200, 200, 201, 200, 200]);
    expect(unions.list).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID },
      { search: "", page: 2, limit: 20, paginationRequested: true },
    );
    expect(unions.create).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      { name: "Sindicato", cnpj: "123" },
    );
    expect(unions.delete).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      UNION_ID,
    );
    expect(situations.list).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID },
      { client_id: CLIENT_ID },
    );
    expect(situations.create).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      { client_id: CLIENT_ID, title: "Pendência", description: "Detalhes" },
    );
  });

  it("routes LDD operations with client and organization scope", async () => {
    const ldd = lddService();
    const app = createPessoalWorkerApp({ env: env(), lddService: ldd });
    const authHeaders = headers();
    const jsonHeaders = { ...authHeaders, "content-type": "application/json" };
    const list = await app.request(`https://pessoal.test/pessoal/ldd?client_id=${CLIENT_ID}`, {
      headers: authHeaders,
    });
    const created = await app.request("https://pessoal.test/pessoal/ldd", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ client_id: CLIENT_ID, type: "FGTS", balance_amount: 10 }),
    });
    const updated = await app.request(`https://pessoal.test/pessoal/ldd/${LDD_ID}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ status: "Regular" }),
    });
    const removed = await app.request(`https://pessoal.test/pessoal/ldd/${LDD_ID}`, {
      method: "DELETE",
      headers: authHeaders,
    });

    expect([list.status, created.status, updated.status, removed.status]).toEqual([
      200, 201, 200, 200,
    ]);
    expect(ldd.list).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID },
      { client_id: CLIENT_ID },
    );
    expect(ldd.create).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      { client_id: CLIENT_ID, type: "FGTS", balance_amount: 10 },
    );
    expect(ldd.delete).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      LDD_ID,
    );
  });

  it("keeps Pessoal password mutations behind permission 3", async () => {
    const passwords = passwordService();
    const app = createPessoalWorkerApp({ env: env(), passwordService: passwords });
    const read = await app.request(`https://pessoal.test/pessoal/passwords/${PASSWORD_ID}`, {
      headers: headers("2"),
    });
    const list = await app.request(
      `https://pessoal.test/pessoal/passwords?client_id=${CLIENT_ID}`,
      {
        headers: headers("1"),
      },
    );
    const denied = await app.request("https://pessoal.test/pessoal/passwords", {
      method: "POST",
      headers: { ...headers("2"), "content-type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        service_name: "eSocial",
        senha_main: "segredo",
      }),
    });
    const created = await app.request("https://pessoal.test/pessoal/passwords", {
      method: "POST",
      headers: { ...headers("3"), "content-type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        service_name: "eSocial",
        senha_main: "segredo",
      }),
    });

    expect([read.status, list.status, denied.status, created.status]).toEqual([200, 200, 403, 201]);
    expect(passwords.detail).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      PASSWORD_ID,
    );
    expect(passwords.create).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 3 },
      { client_id: CLIENT_ID, service_name: "eSocial", senha_main: "segredo" },
    );
  });

  it("routes payroll detail and mutations with organization scope", async () => {
    const payroll = payrollService();
    const app = createPessoalWorkerApp({ env: env(), payrollService: payroll });
    const authHeaders = headers();
    const jsonHeaders = { ...authHeaders, "content-type": "application/json" };
    const body = {
      client_id: CLIENT_ID,
      advance: true,
      info: "Folha mensal",
      previous: false,
      onvio: true,
      group_id: GROUP_ID,
      vt: false,
      va: false,
      assistance_fee: false,
      bem_mais: false,
      bsf: false,
      reinf: false,
      employees: 2,
    };
    const detail = await app.request(`https://pessoal.test/pessoal/payroll/${CLIENT_ID}`, {
      headers: authHeaders,
    });
    const created = await app.request("https://pessoal.test/pessoal/payroll", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(body),
    });
    const updated = await app.request(`https://pessoal.test/pessoal/payroll/${CLIENT_ID}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ group_id: GROUP_ID, employees: 3 }),
    });

    expect([detail.status, created.status, updated.status]).toEqual([200, 201, 200]);
    expect(payroll.detail).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID }, CLIENT_ID);
    expect(payroll.create).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      body,
    );
    expect(payroll.update).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      CLIENT_ID,
      { group_id: GROUP_ID, employees: 3 },
    );
  });

  it("routes obligation detail, create, update and competence generation", async () => {
    const obligations = obligationService();
    const app = createPessoalWorkerApp({ env: env(), obligationService: obligations });
    const authHeaders = headers();
    const jsonHeaders = { ...authHeaders, "content-type": "application/json" };
    const detail = await app.request(
      `https://pessoal.test/pessoal/obrigations?client_id=${CLIENT_ID}&competence=2026-09`,
      { headers: authHeaders },
    );
    const created = await app.request("https://pessoal.test/pessoal/obrigations", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ client_id: CLIENT_ID, competence: "2026-09" }),
    });
    const generated = await app.request(
      "https://pessoal.test/pessoal/obrigations/competences/2026-09/generate",
      { method: "POST", headers: authHeaders },
    );
    const updated = await app.request(`https://pessoal.test/pessoal/obrigations/${OBLIGATION_ID}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ payroll: true }),
    });

    expect([detail.status, created.status, generated.status, updated.status]).toEqual([
      200, 201, 200, 200,
    ]);
    expect(obligations.detail).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID },
      { client_id: CLIENT_ID, competence: "2026-09" },
    );
    expect(obligations.create).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      { client_id: CLIENT_ID, competence: "2026-09" },
    );
    expect(obligations.generateForCompetence).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      "2026-09",
    );
  });

  it("returns the Pessoal overview scoped to the organization", async () => {
    const overview = overviewService();
    const app = createPessoalWorkerApp({ env: env(), overviewService: overview });
    const response = await app.request("https://pessoal.test/pessoal/overview", {
      headers: headers("1"),
    });

    expect(response.status).toBe(200);
    expect(overview.getSummary).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
  });
});
