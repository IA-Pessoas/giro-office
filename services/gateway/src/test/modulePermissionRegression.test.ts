import { type AuthContext, type AuthPolicy, canAccessRoute } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { getRoutePolicy } from "../security/policies.js";

function authContext(overrides: Partial<AuthContext["claims"]> = {}): AuthContext {
  const claims = {
    user_id: "user-1",
    organization_id: "org-a",
    permission: 0,
    type: "user" as const,
    ...overrides,
  };

  return {
    token: "test-token",
    userId: claims.user_id,
    organizationId: claims.organization_id,
    claims,
  };
}

function requiredRoutePolicy(method: string, path: string): AuthPolicy {
  const policy = getRoutePolicy(method, path);

  if (!policy) {
    throw new Error(`Política não encontrada para ${method} ${path}.`);
  }

  return policy;
}

describe("matriz de regressão das políticas modulares", () => {
  it("permite Viewer global consultar a lista de clientes sem módulo", () => {
    const policy = requiredRoutePolicy("GET", "/client/list");

    expect(
      canAccessRoute(
        authContext({
          permission: 1,
          modules: {},
        }),
        policy,
      ),
    ).toBe(true);
    expect(canAccessRoute(authContext({ permission: 0, modules: {} }), policy)).toBe(false);
  });

  it("permite Viewer de Pessoal listar clientes sem ampliar outros acessos de cliente", () => {
    const listPolicy = requiredRoutePolicy("GET", "/client/list");
    const clientDetailPolicy = requiredRoutePolicy("GET", "/client/client-1");

    expect(
      canAccessRoute(
        authContext({
          permission: 0,
          modules: { pessoal: 1 },
        }),
        listPolicy,
      ),
    ).toBe(true);
    expect(
      canAccessRoute(
        authContext({
          permission: 0,
          modules: { integracao: 1 },
        }),
        listPolicy,
      ),
    ).toBe(false);
    expect(
      canAccessRoute(
        authContext({
          permission: 0,
          modules: { pessoal: 1 },
        }),
        clientDetailPolicy,
      ),
    ).toBe(false);
  });

  it("permite Viewer do Regularize listar clientes sem ampliar outros acessos de cliente", () => {
    const listPolicy = requiredRoutePolicy("GET", "/client/list");
    const clientDetailPolicy = requiredRoutePolicy("GET", "/client/client-1");

    expect(
      canAccessRoute(
        authContext({
          permission: 0,
          modules: { regularize: 1 },
        }),
        listPolicy,
      ),
    ).toBe(true);
    expect(
      canAccessRoute(
        authContext({
          permission: 0,
          modules: { regularize: 1 },
        }),
        clientDetailPolicy,
      ),
    ).toBe(false);
  });

  it.each([0, 1, 2, 3])("avalia o módulo Integração no nível %i", (level) => {
    const policy = requiredRoutePolicy("GET", "/client/123");
    expect(
      canAccessRoute(
        authContext({
          modules: { integracao: level },
        }),
        policy,
      ),
    ).toBe(level >= 1);
  });

  it.each([1, 2, 3])("respeita o limiar modular %i em toda a matriz 0-3", (minPermission) => {
    const observed = [0, 1, 2, 3].map((level) =>
      canAccessRoute(authContext({ modules: { integracao: level } }), {
        modulePermission: { module: "integracao", minPermission },
      }),
    );

    expect(observed).toEqual([0, 1, 2, 3].map((level) => level >= minPermission));
  });

  it("não usa permission global nem departamento como bypass modular", () => {
    const policy = requiredRoutePolicy("GET", "/client/123");
    expect(
      canAccessRoute(
        authContext({
          permission: 999,
          modules: { integracao: 0 },
        }),
        policy,
      ),
    ).toBe(false);
  });

  it("protege os endpoints de projeto pelo módulo Integração", () => {
    const policy = requiredRoutePolicy("GET", "/project/list");
    expect(canAccessRoute(authContext({ modules: { integracao: 0 } }), policy)).toBe(false);
    expect(canAccessRoute(authContext({ modules: { integracao: 1 } }), policy)).toBe(true);
  });

  it.each([
    "/pessoal",
    "/pessoal/unions",
    "/pessoal/payroll/client-1",
    "/pessoal/obligations",
    "/pessoal/ldd",
    "/pessoal/situations",
    "/pessoal/passwords",
  ])("permite Viewer de Pessoal consultar %s", (path) => {
    const policy = requiredRoutePolicy("GET", path);

    expect(canAccessRoute(authContext({ modules: { pessoal: 1 } }), policy)).toBe(true);
  });

  it.each([
    ["POST", "/pessoal/unions"],
    ["PATCH", "/pessoal/payroll/client-1"],
    ["PUT", "/pessoal/obligations/obligation-1"],
    ["DELETE", "/pessoal/situations/situation-1"],
  ])("reserva %s %s para Editor de Pessoal", (method, path) => {
    const policy = requiredRoutePolicy(method, path);

    expect(canAccessRoute(authContext({ modules: { pessoal: 1 } }), policy)).toBe(false);
    expect(canAccessRoute(authContext({ modules: { pessoal: 2 } }), policy)).toBe(true);
  });

  it("mantém owner como único bypass global explícito", () => {
    const policy = requiredRoutePolicy("GET", "/client/123");
    expect(
      canAccessRoute(
        authContext({
          type: "owner",
          permission: 0,
          modules: { integracao: 0 },
        }),
        policy,
      ),
    ).toBe(true);
  });

  it("não usa Integração como bypass para mutações verticais de cliente", () => {
    const policy = requiredRoutePolicy("PATCH", "/client/client-1/finance");
    expect(canAccessRoute(authContext({ modules: { integracao: 3 } }), policy)).toBe(false);
    expect(canAccessRoute(authContext({ modules: { financeiro: 1 } }), policy)).toBe(true);
  });

  it("reserva a alteração modular ao owner, inclusive contra RH administrador", () => {
    const policy = requiredRoutePolicy("PUT", "/user/permission/user-1");

    expect(policy).toEqual({ special: "ownerOnly" });
    expect(
      canAccessRoute(
        authContext({
          type: "admin",
          modules: { rh: 3 },
        }),
        policy,
      ),
    ).toBe(false);
    expect(
      canAccessRoute(
        authContext({
          type: "owner",
          modules: { rh: 0 },
        }),
        policy,
      ),
    ).toBe(true);
  });
});
