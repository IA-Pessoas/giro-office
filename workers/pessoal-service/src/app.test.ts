import { describe, expect, it, vi } from "vitest";
import {
  createPessoalWorkerApp,
  type PessoalGroupPrisma,
  type PessoalGroupService,
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
const TOKEN = "pessoal-gateway-token";

function env(): PessoalWorkerEnv {
  return {
    JWT_SECRET: "pessoal-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: TOKEN,
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
});
