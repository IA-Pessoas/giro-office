// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa.
import { describe, expect, it } from "vitest";
import {
  expectOk,
  requireSmokeState,
  smokeCall,
  smokeEnv,
  smokeHeaders,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { createDepartmentWorkerApp } from "./app.js";
import type { DepartmentWorkerEnv } from "./env.js";

describe.skipIf(!smokeState)("department-service CRUD smoke (banco real)", () => {
  const env = () =>
    smokeEnv<DepartmentWorkerEnv>({
      AUDIT_SERVICE_TOKEN: "crud-smoke-audit",
      AUDIT_SERVICE: { fetch: async () => new Response(null, { status: 204 }) },
    } as Partial<DepartmentWorkerEnv>);
  const call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    smokeCall(createDepartmentWorkerApp({ env: env() }), env(), method, path, body, headers);

  it("cria, lê, lista, atualiza e inativa um departamento", async () => {
    const state = requireSmokeState();
    const name = `Smoke Dep ${Date.now()}`;

    // CreateDepData do front: name, color, solution.
    const created = expectOk(
      await call("POST", "/department", { name, color: "#123456", solution: true }),
      "POST /department",
    );
    const id = created.data.dep.id as string;
    expect(created.data.dep).toMatchObject({ name, color: "#123456", status: "Ativo" });

    expect(
      (await call("POST", "/department", { name, color: "#000000" })).status,
      "nome duplicado é 409",
    ).toBe(409);

    const detail = expectOk(await call("GET", `/department?dep_id=${id}`), "GET /department");
    expect(detail.data.dep.solution).toBe(true);
    const seeded = expectOk(
      await call("GET", `/department?dep_id=${state.departmentId}`),
      "GET seed",
    );
    expect(seeded.data.dep.name).toBe("Tecnologia");

    for (const status of ["Todos", "Ativo", "Inativo"]) {
      expectOk(await call("GET", `/department/list?status=${status}`), `GET list ${status}`);
    }
    const all = expectOk(await call("GET", "/department/list"), "GET /department/list");
    expect(all.data.some((dep: { id: string }) => dep.id === id)).toBe(true);

    // UpdateDepData do front: name, color, solution, status.
    const renamed = `${name} Renomeado`;
    expectOk(
      await call("PUT", "/department", {
        dep_id: id,
        name: renamed,
        color: "#654321",
        solution: false,
        status: "Inativo",
      }),
      "PUT /department",
    );
    const after = expectOk(await call("GET", `/department?dep_id=${id}`), "GET após PUT");
    expect(after.data.dep).toMatchObject({
      name: renamed,
      color: "#654321",
      solution: false,
      status: "Inativo",
    });
    const inactive = expectOk(await call("GET", "/department/list?status=Inativo"), "Inativo");
    expect(inactive.data.some((dep: { id: string }) => dep.id === id)).toBe(true);

    expectOk(await call("PUT", "/department", { dep_id: id, status: "Ativo" }), "reativar");

    // Usuário comum sem módulo TI não escreve (403 de domínio, não de schema).
    const denied = await call(
      "POST",
      "/department",
      { name: `${name} negado`, color: "#111111" },
      await smokeHeaders({ userId: state.userId, type: "user", modules: { ti: 1 } }),
    );
    expect(denied.status).toBe(403);
  });
});
