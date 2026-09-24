// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa: campo fora do
// schema do Worker ("Unknown argument"), tabela sem @@map, coluna NOT NULL não preenchida.
import { describe, expect, it } from "vitest";
import {
  expectOk,
  requireSmokeState,
  smokeCall,
  smokeEnv,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { createUserWorkerApp, type UserWorkerEnv } from "./app.js";

describe.skipIf(!smokeState)("user-service CRUD smoke (banco real)", () => {
  const env = () =>
    smokeEnv<UserWorkerEnv>({ AUTH_COOKIE_SECURE: false } as Partial<UserWorkerEnv>);
  const app = () => createUserWorkerApp({ env: env() });
  const call = (method: string, path: string, body?: unknown) =>
    smokeCall(app(), env(), method, path, body);

  it("cria, lê, lista, atualiza permissões e desativa um usuário", async () => {
    const state = requireSmokeState();
    const login = `smoke-${Date.now()}@smoke.local`;

    // Payload de buildAdminCreateUserPayload (CreateUserModal), com invited_by.
    const created = expectOk(
      await call("POST", "/user", {
        name: "Smoke Criado",
        login,
        password: "Smoke#12345",
        department_id: state.departmentId,
        permission: 1,
        organization_id: state.organizationId,
        type: "admin",
        status: "active",
        modules: { ti: 3, rh: 1, fiscal: 2 },
        invited_by: state.ownerId,
      }),
      "POST /user",
    );
    const id = created.data.id as string;
    expect(id).toBeTruthy();

    expect(expectOk(await call("GET", `/user/${id}`), "GET /user/:id").data.login).toBe(login);
    const list = expectOk(await call("GET", "/user?take=100"), "GET /user");
    expect(list.data.users.some((user: { id: string }) => user.id === id)).toBe(true);
    expectOk(await call("GET", "/user/me"), "GET /user/me");

    // Tela de permissões: syncDepartmentPermission manda permission + type + modules.
    expectOk(
      await call("PUT", `/user/${id}`, { permission: 2, type: "admin", modules: { fiscal: 2 } }),
      "PUT /user/:id",
    );
    const permissions = expectOk(await call("GET", `/user/permission/${id}`), "GET permission");
    expect(permissions.data).toMatchObject({ fiscal: 2, ti: 3 });
    expectOk(
      await call("PUT", `/user/permission/${id}`, { contabil: 2 }),
      "PUT /user/permission/:id",
    );
    expectOk(await call("PUT", `/user/${id}`, { name: "Smoke Renomeado" }), "PUT nome");
    expectOk(await call("DELETE", `/user/${id}`), "DELETE /user/:id");
    const after = expectOk(await call("GET", `/user/${id}`), "GET após desativar");
    expect(after.data.status).toBe("inactive");
  });
});
