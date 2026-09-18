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
  it("classifica todos os fluxos Contábil do milestone com leitura e escrita corretas", () => {
    const viewer = authContext({ modules: { contabil: 1 } });
    const editor = authContext({ modules: { contabil: 2 } });
    const readRoutes = [
      ["GET", "/contabil/controls"],
      ["GET", "/contabil/controls/list"],
      ["GET", "/triagem/monthly"],
      ["GET", "/triagem/statements"],
      ["GET", "/triagem/closing"],
    ] as const;
    const contabilWriteRoutes = [
      ["POST", "/contabil/controls"],
      ["POST", "/contabil/controls/year"],
      ["PATCH", "/contabil/controls/control-1/items"],
      ["DELETE", "/contabil/controls"],
      ["POST", "/contabil/controls/restore"],
    ] as const;
    const triagemWriteRoutes = [
      ["POST", "/triagem/monthly"],
      ["PUT", "/triagem/statements"],
      ["DELETE", "/triagem/statements"],
      ["PUT", "/triagem/closing"],
    ] as const;

    for (const [method, path] of readRoutes) {
      expect(canAccessRoute(viewer, requiredRoutePolicy(method, path))).toBe(true);
    }
    for (const [method, path] of contabilWriteRoutes) {
      expect(canAccessRoute(viewer, requiredRoutePolicy(method, path))).toBe(false);
      expect(canAccessRoute(editor, requiredRoutePolicy(method, path))).toBe(true);
    }
    for (const [method, path] of triagemWriteRoutes) {
      expect(canAccessRoute(viewer, requiredRoutePolicy(method, path))).toBe(true);
      expect(canAccessRoute(editor, requiredRoutePolicy(method, path))).toBe(true);
    }
  });

  it("permite consulta de triagem para Contábil ou Triagem e não permite quem não tem ambos", () => {
    const policy = requiredRoutePolicy("GET", "/triagem/monthly");

    expect(canAccessRoute(authContext({ modules: { contabil: 1, triagem: 0 } }), policy)).toBe(
      true,
    );
    expect(canAccessRoute(authContext({ modules: { contabil: 0, triagem: 1 } }), policy)).toBe(
      true,
    );
    expect(canAccessRoute(authContext({ modules: { contabil: 0, triagem: 0 } }), policy)).toBe(
      false,
    );
  });

  it("deixa a atribuição de Triagem decidir a escrita no serviço", () => {
    const policy = requiredRoutePolicy("PATCH", "/triagem/monthly/monthly-1/item");

    expect(canAccessRoute(authContext({ modules: { contabil: 0, triagem: 1 } }), policy)).toBe(
      true,
    );
    expect(canAccessRoute(authContext({ modules: { contabil: 0, triagem: 0 } }), policy)).toBe(
      false,
    );
  });

  it.each([
    ["user", 0, false, false],
    ["user", 1, true, false],
    ["user", 2, true, true],
    ["user", 3, true, true],
    ["admin", 0, false, false],
    ["admin", 1, true, false],
    ["admin", 2, true, true],
    ["admin", 3, true, true],
    ["owner", 0, true, true],
    ["owner", 1, true, true],
    ["owner", 2, true, true],
    ["owner", 3, true, true],
  ])("aplica a matriz Comercial para %s com comercial=%i", (type, commercialLevel, canRead, canWrite) => {
    const readPolicy = requiredRoutePolicy("GET", "/commercial/prospecting");
    const editPolicy = requiredRoutePolicy("PATCH", "/commercial/prospecting/prospecting-1");
    const archivePolicy = requiredRoutePolicy("DELETE", "/commercial/prospecting/prospecting-1");
    const context = authContext({
      permission: type === "admin" ? 2 : 0,
      type: type as "user" | "admin" | "owner",
      modules: { comercial: commercialLevel },
    });

    expect(canAccessRoute(context, readPolicy)).toBe(canRead);
    expect(canAccessRoute(context, editPolicy)).toBe(canWrite);
    expect(canAccessRoute(context, archivePolicy)).toBe(canWrite);
  });

  it("não usa permission global como bypass do Comercial", () => {
    const policy = requiredRoutePolicy("GET", "/commercial/prospecting");

    expect(
      canAccessRoute(authContext({ permission: 999, modules: { comercial: 0 } }), policy),
    ).toBe(false);
  });

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

  it("permite usuário autenticado consultar relatórios sem política modular do gateway", () => {
    const policy = requiredRoutePolicy("GET", "/reports/catalog");

    expect(policy).toEqual({ minPermission: 0 });
    expect(canAccessRoute(authContext({ permission: 0, modules: {} }), policy)).toBe(true);
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

  it.each([
    ["PATCH", "/client/client-1/regularize"],
    ["PATCH", "/client/client-1/termination"],
    ["POST", "/client/client-1/histories"],
    ["PATCH", "/client/client-1/pa"],
  ])("bloqueia Viewer do Regularize em %s %s", (method, path) => {
    const policy = requiredRoutePolicy(method, path);

    expect(
      canAccessRoute(
        authContext({
          permission: 0,
          modules: { regularize: 1 },
        }),
        policy,
      ),
    ).toBe(false);
    expect(
      canAccessRoute(
        authContext({
          permission: 0,
          modules: { regularize: 2 },
        }),
        policy,
      ),
    ).toBe(true);
  });

  it.each([
    1, 2, 3,
  ])("permite Integração nível %i consultar a lista sem permission global", (level) => {
    const policy = requiredRoutePolicy("GET", "/client/list");

    expect(
      canAccessRoute(
        authContext({
          permission: 0,
          modules: { integracao: level },
        }),
        policy,
      ),
    ).toBe(true);
  });

  it("não permite módulo aposentado consultar a lista sem permission global", () => {
    const policy = requiredRoutePolicy("GET", "/client/list");

    expect(
      canAccessRoute(
        authContext({
          permission: 0,
          modules: { atendimento: 2 },
        }),
        policy,
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

  it.each([0, 1, 2, 3])("avalia o módulo Parcelamento no nível %i", (level) => {
    const policy = requiredRoutePolicy("GET", "/parcelamento/installments");

    expect(
      canAccessRoute(
        authContext({
          modules: { parcelamento: level },
        }),
        policy,
      ),
    ).toBe(level >= 1);
  });

  it("permite Viewer consultar Parcelamento sem liberar mutações", () => {
    const viewer = authContext({ modules: { parcelamento: 1 } });
    const readRoutes = [
      ["GET", "/parcelamento/installments"],
      ["GET", "/parcelamento/installments/installment-1/competencies"],
      ["GET", "/parcelamento/panoramas"],
    ] as const;
    const mutationRoutes = [
      ["POST", "/parcelamento/installments"],
      ["PATCH", "/parcelamento/installments/installment-1"],
      ["POST", "/parcelamento/installments/installment-1/competencies"],
      ["PATCH", "/parcelamento/installment-competencies/competency-1"],
      ["POST", "/parcelamento/panoramas"],
      ["PATCH", "/parcelamento/panoramas/panorama-1"],
      ["POST", "/parcelamento/panoramas/competences/2026-07/generate"],
    ] as const;

    for (const [method, path] of readRoutes) {
      expect(canAccessRoute(viewer, requiredRoutePolicy(method, path))).toBe(true);
    }

    for (const [method, path] of mutationRoutes) {
      expect(canAccessRoute(viewer, requiredRoutePolicy(method, path))).toBe(false);
    }
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

  it("não usa Integração como bypass e reserva mutações verticais ao Editor", () => {
    const policy = requiredRoutePolicy("PATCH", "/client/client-1/finance");
    expect(canAccessRoute(authContext({ modules: { integracao: 3 } }), policy)).toBe(false);
    expect(canAccessRoute(authContext({ modules: { financeiro: 1 } }), policy)).toBe(false);
    expect(canAccessRoute(authContext({ modules: { financeiro: 2 } }), policy)).toBe(true);
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

  it("protects PUT /user/:id with the user-management policy", () => {
    expect(requiredRoutePolicy("PUT", "/user/user-1")).toEqual({
      special: "manageUsers",
    });
  });
});
