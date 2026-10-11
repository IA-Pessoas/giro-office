import { type AuthContext, type AuthPolicy, canAccessRoute } from "@workspace/shared";
import { ACTIVE_MODULE_KEYS } from "@workspace/shared/auth";
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
  // #1343 / ADR 0002: o papel Visualizador (nível 1) só lê; o owner escreve em tudo.
  it("bloqueia escrita do Visualizador em cada módulo e libera o owner", () => {
    const viewer = authContext({
      permission: 1,
      modules: Object.fromEntries(ACTIVE_MODULE_KEYS.map((module) => [module, 1])),
    });
    const owner = authContext({ type: "owner", permission: 2, modules: {} });
    const writeRoutes = [
      ["rh", "PUT", "/rh/requests"],
      ["ti", "POST", "/ti/inventory"],
      ["ti", "POST", "/department"],
      ["integracao", "POST", "/project"],
      ["integracao", "POST", "/task"],
      ["comercial", "POST", "/commercial/prospects"],
      ["integracao", "DELETE", "/client/client-1"],
      ["financeiro", "PUT", "/task/financeiro/collectors"],
      ["pessoal", "POST", "/pessoal/groups"],
      ["parcelamento", "POST", "/parcelamento/panoramas"],
      ["regularize", "POST", "/regularize/passwords"],
      ["fiscal", "POST", "/fiscal/ncm"],
      ["contabil", "POST", "/contabil/controls"],
      ["certificado", "DELETE", "/certificate/cert-1"],
      ["marketing", "POST", "/marketing/events"],
      ["marketing", "PUT", "/marketing/events/event-1"],
      ["marketing", "POST", "/marketing/events/event-1/editions"],
      ["marketing", "PUT", "/marketing/events/event-1/editions/edition-1"],
    ] as const;

    for (const [module, method, path] of writeRoutes) {
      const policy = requiredRoutePolicy(method, path);
      expect(canAccessRoute(viewer, policy), `${module}: ${method} ${path}`).toBe(false);
      expect(canAccessRoute(owner, policy), `owner: ${method} ${path}`).toBe(true);
    }

    // Exceções do ADR 0002: fluxos operacionais em que o nível 1 executa.
    const covered = new Set<string>([
      ...writeRoutes.map(([module]) => module),
      "triagem",
      "marketing",
    ]);
    expect(ACTIVE_MODULE_KEYS.filter((module) => !covered.has(module))).toEqual([]);
    for (const [method, path] of [
      ["POST", "/triagem/monthly"],
      ["POST", "/task/financeiro/settle"],
    ] as const) {
      expect(canAccessRoute(viewer, requiredRoutePolicy(method, path)), `${method} ${path}`).toBe(
        true,
      );
    }
  });

  it("permite RH nível 1 no próprio perfil, sem liberar as demais mutações RH", () => {
    const profilePolicy = requiredRoutePolicy("PUT", "/rh/profile/colaborator");
    const createRequestPolicy = requiredRoutePolicy("POST", "/rh/requests");
    const createMessagePolicy = requiredRoutePolicy("POST", "/rh/messages");
    const requestsPolicy = requiredRoutePolicy("PUT", "/rh/requests");

    expect(profilePolicy).toEqual({ modulePermission: { module: "rh", minPermission: 1 } });
    expect(canAccessRoute(authContext({ modules: { rh: 1 } }), profilePolicy)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { rh: 1 } }), createRequestPolicy)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { rh: 1 } }), createMessagePolicy)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { rh: 1 } }), requestsPolicy)).toBe(false);
    expect(canAccessRoute(authContext({ modules: { rh: 2 } }), requestsPolicy)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { rh: 0 } }), profilePolicy)).toBe(false);
  });

  it("mantém notificações de RH no mesmo nível de acesso do módulo", () => {
    const listPolicy = requiredRoutePolicy("GET", "/rh/notifications");
    const readPolicy = requiredRoutePolicy("PUT", "/rh/notifications/read");

    expect(canAccessRoute(authContext({ modules: { rh: 1 } }), listPolicy)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { rh: 1 } }), readPolicy)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { rh: 0 } }), listPolicy)).toBe(false);
  });

  it("classifica todos os fluxos Contábil do milestone com leitura e escrita corretas", () => {
    const viewer = authContext({ modules: { contabil: 1 } });
    const editor = authContext({ modules: { contabil: 2 } });
    const readRoutes = [
      ["GET", "/contabil/controls"],
      ["GET", "/contabil/controls/list"],
      ["GET", "/triagem/monthly"],
      ["GET", "/triagem/statements"],
      ["GET", "/triagem/closing"],
      ["GET", "/triagem/external-links"],
      ["GET", "/triagem/catalogs"],
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
      ["POST", "/triagem/external-links"],
      ["PUT", "/triagem/external-links/link-1"],
      ["PATCH", "/triagem/external-links/link-1/archive"],
      ["POST", "/triagem/catalogs"],
      ["PATCH", "/triagem/catalogs/catalog-1"],
      ["PATCH", "/triagem/catalogs/catalog-1/archive"],
      ["GET", "/triagem/urgent-requests"],
      ["POST", "/triagem/urgent-requests"],
      ["PUT", "/triagem/urgent-requests/request-1"],
      ["PATCH", "/triagem/urgent-requests/request-1/close"],
      ["PATCH", "/triagem/urgent-requests/request-1/reopen"],
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

  // #1774: o Pessoal escolhe o responsável do evento e da carteira no catálogo operacional.
  it("libera o catálogo de responsáveis para quem só tem Pessoal", () => {
    const policy = requiredRoutePolicy("GET", "/rh/operational-users");

    expect(canAccessRoute(authContext({ modules: { pessoal: 1 } }), policy)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { pessoal: 0, fiscal: 3 } }), policy)).toBe(false);
  });

  // #1699: a agenda é de departamento, não da Integração; o task-service confere o módulo pedido.
  it("libera a agenda compartilhada para Contábil ou Triagem, sem exigir Integração", () => {
    const read = requiredRoutePolicy("GET", "/task/agenda");

    expect(canAccessRoute(authContext({ modules: { triagem: 1 } }), read)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { contabil: 1 } }), read)).toBe(true);
    // #1773: o Pessoal consulta o próprio recorte da agenda.
    expect(canAccessRoute(authContext({ modules: { pessoal: 1 } }), read)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { integracao: 3 } }), read)).toBe(false);

    for (const method of ["POST", "PUT", "DELETE"]) {
      const write = requiredRoutePolicy(method, "/task/agenda");

      expect(canAccessRoute(authContext({ modules: { triagem: 2 } }), write)).toBe(true);
      expect(canAccessRoute(authContext({ modules: { contabil: 2 } }), write)).toBe(true);
      expect(canAccessRoute(authContext({ modules: { triagem: 1 } }), write)).toBe(false);
      expect(canAccessRoute(authContext({ modules: { integracao: 3 } }), write)).toBe(false);
    }
  });

  // #1747: o Regularize entra na agenda compartilhada com os níveis do próprio módulo.
  it("libera a agenda compartilhada para o Regularize: leitura no nível 1, escrita no 2", () => {
    const read = requiredRoutePolicy("GET", "/task/agenda");

    expect(canAccessRoute(authContext({ modules: { regularize: 1 } }), read)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { regularize: 0 } }), read)).toBe(false);

    for (const method of ["POST", "PUT", "DELETE"]) {
      const write = requiredRoutePolicy(method, "/task/agenda");

      expect(canAccessRoute(authContext({ modules: { regularize: 2 } }), write)).toBe(true);
      expect(canAccessRoute(authContext({ modules: { regularize: 1 } }), write)).toBe(false);
    }
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

  it("libera licitantes e histórico de licitação para quem lê clientes pelo Regularize", () => {
    const regularizeReader = authContext({ modules: { regularize: 1 } });
    const noModule = authContext({ modules: {} });
    for (const path of [
      "/client/licitacao/bidders",
      "/client/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/licitacao/history",
    ]) {
      const policy = requiredRoutePolicy("GET", path);
      expect(canAccessRoute(regularizeReader, policy), `Regularize 1: ${path}`).toBe(true);
      expect(canAccessRoute(noModule, policy), `sem módulo: ${path}`).toBe(false);
    }
  });

  it("libera os grupos de empresas para Integração e Regularize, e só para eles", () => {
    const regularizeReader = authContext({ modules: { regularize: 1 } });
    const regularizeEditor = authContext({ modules: { regularize: 2 } });
    const integracaoEditor = authContext({ modules: { integracao: 2 } });
    const otherModule = authContext({ modules: { comercial: 3, contabil: 3 } });
    const routes = [
      ["GET", "/client/groups", true],
      ["POST", "/client/groups", false],
      ["PATCH", "/client/groups/group-1", false],
      ["PUT", "/client/groups/group-1/clients", false],
    ] as const;

    for (const [method, path, readerCanAccess] of routes) {
      const policy = requiredRoutePolicy(method, path);
      expect(canAccessRoute(regularizeReader, policy), `Regularize 1: ${method} ${path}`).toBe(
        readerCanAccess,
      );
      expect(canAccessRoute(regularizeEditor, policy), `Regularize 2: ${method} ${path}`).toBe(
        true,
      );
      expect(canAccessRoute(integracaoEditor, policy), `Integração 2: ${method} ${path}`).toBe(
        true,
      );
      expect(canAccessRoute(otherModule, policy), `outro módulo: ${method} ${path}`).toBe(false);
    }
  });

  it("libera regimes e segmentos para Integração e Regularize; a leitura segue a lista de clientes", () => {
    const regularizeReader = authContext({ modules: { regularize: 1 } });
    const regularizeEditor = authContext({ modules: { regularize: 2 } });
    const integracaoEditor = authContext({ modules: { integracao: 2 } });
    const otherModule = authContext({ modules: { comercial: 3, contabil: 3 } });

    for (const path of ["/client/regimes", "/client/segments"]) {
      const read = requiredRoutePolicy("GET", path);
      expect(canAccessRoute(otherModule, read), `leitura na ficha: ${path}`).toBe(true);
      expect(canAccessRoute(authContext({ modules: {} }), read)).toBe(false);
    }

    for (const [method, path] of [
      ["POST", "/client/regimes"],
      ["PATCH", "/client/regimes/regime-1"],
      ["POST", "/client/segments"],
      ["PATCH", "/client/segments/segment-1"],
    ] as const) {
      const policy = requiredRoutePolicy(method, path);
      expect(canAccessRoute(regularizeReader, policy), `Regularize 1: ${method} ${path}`).toBe(
        false,
      );
      expect(canAccessRoute(regularizeEditor, policy), `Regularize 2: ${method} ${path}`).toBe(
        true,
      );
      expect(canAccessRoute(integracaoEditor, policy), `Integração 2: ${method} ${path}`).toBe(
        true,
      );
      expect(canAccessRoute(otherModule, policy), `outro módulo: ${method} ${path}`).toBe(false);
    }
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

  it("documenta os limiares atuais do gateway para leitura e escrita de PA", () => {
    const path = "/client/client-1/pa";
    const cases = [
      { name: "Pessoal 0 isolado", modules: { pessoal: 0 }, canRead: false, canWrite: false },
      { name: "Pessoal 1 isolado", modules: { pessoal: 1 }, canRead: false, canWrite: false },
      { name: "Pessoal 2 isolado", modules: { pessoal: 2 }, canRead: false, canWrite: true },
      {
        name: "Comercial 1 e Pessoal 1",
        modules: { comercial: 1, pessoal: 1 },
        canRead: true,
        canWrite: false,
      },
      {
        name: "Comercial 1 e Pessoal 2",
        modules: { comercial: 1, pessoal: 2 },
        canRead: true,
        canWrite: true,
      },
      {
        name: "Comercial 2 e Pessoal 0",
        modules: { comercial: 2, pessoal: 0 },
        canRead: true,
        canWrite: true,
      },
    ];

    for (const { name, modules, canRead, canWrite } of cases) {
      const context = authContext({ modules });
      expect(canAccessRoute(context, requiredRoutePolicy("GET", path)), `${name}: GET`).toBe(
        canRead,
      );
      for (const method of ["POST", "PATCH"]) {
        expect(
          canAccessRoute(context, requiredRoutePolicy(method, path)),
          `${name}: ${method}`,
        ).toBe(canWrite);
      }
    }

    const owner = authContext({ type: "owner", modules: {} });
    for (const method of ["GET", "POST", "PATCH"]) {
      expect(canAccessRoute(owner, requiredRoutePolicy(method, path)), `owner: ${method}`).toBe(
        true,
      );
    }
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

  it("libera as rotas de responsável da Integração para os níveis 0 e 1", () => {
    for (const [method, path] of [
      ["POST", "/task/complete-request"],
      ["DELETE", "/task/complete-request"],
      ["GET", "/task/complete-request/list"],
      ["POST", "/task/postponement"],
      ["GET", "/task/postponement/list"],
      ["POST", "/task/attachment"],
      ["GET", "/task/attachment/list"],
      ["GET", "/task/attachment/access"],
      ["PUT", "/task/conclusion"],
      ["GET", "/task"],
      ["GET", "/task/list"],
    ] as const) {
      const policy = requiredRoutePolicy(method, path);
      expect(
        canAccessRoute(authContext({ modules: { integracao: 0 } }), policy),
        `${method} ${path}`,
      ).toBe(true);
    }
  });

  it("mantém as demais mutações de tarefa restritas ao nível 2", () => {
    const policy = requiredRoutePolicy("PUT", "/task");
    expect(canAccessRoute(authContext({ modules: { integracao: 1 } }), policy)).toBe(false);
    expect(canAccessRoute(authContext({ modules: { integracao: 2 } }), policy)).toBe(true);
  });

  it("permite o fluxo financeiro pelo módulo Financeiro ou Integração", () => {
    const viewRoutes = [
      ["GET", "/task/financeiro/queue"],
      ["PUT", "/task/financeiro"],
      ["POST", "/task/financeiro/settle"],
    ] as const;
    const adminRoutes = [
      ["GET", "/task/financeiro/collectors"],
      ["PUT", "/task/financeiro/collectors"],
    ] as const;

    for (const [method, path] of viewRoutes) {
      const policy = requiredRoutePolicy(method, path);
      expect(canAccessRoute(authContext({ modules: { financeiro: 1 } }), policy)).toBe(true);
      expect(canAccessRoute(authContext({ modules: { integracao: 1 } }), policy)).toBe(true);
      expect(
        canAccessRoute(authContext({ modules: { financeiro: 0, integracao: 0 } }), policy),
      ).toBe(false);
    }

    for (const [method, path] of adminRoutes) {
      const policy = requiredRoutePolicy(method, path);
      expect(canAccessRoute(authContext({ modules: { financeiro: 2 } }), policy)).toBe(false);
      expect(canAccessRoute(authContext({ modules: { financeiro: 3 } }), policy)).toBe(true);
    }
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

  it("reutiliza o módulo RH com limiares distintos por operação de ponto", () => {
    const selfServicePolicy = requiredRoutePolicy("POST", "/rh/point/adjustment/request");
    const registerPolicy = requiredRoutePolicy("POST", "/rh/point/register");
    const signPolicy = requiredRoutePolicy("PUT", "/rh/timesheets/sign");
    const pdfPolicy = requiredRoutePolicy("GET", "/rh/timesheets/sheet-1/pdf");
    const managerPolicy = requiredRoutePolicy("PUT", "/rh/point/adjustment/approve-bulk");
    const managementRoutes = [
      ["POST", "/rh/point/recalculate"],
      ["POST", "/rh/point/adjustment/retroactive"],
      ["PUT", "/rh/timesheets/reopen"],
      ["PUT", "/rh/timesheets/rebuild"],
      ["POST", "/rh/point/point-1/calculate"],
      ["POST", "/rh/timesheets"],
    ] as const;

    expect(canAccessRoute(authContext({ modules: { rh: 1 } }), selfServicePolicy)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { rh: 1 } }), registerPolicy)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { rh: 1 } }), signPolicy)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { rh: 1 } }), pdfPolicy)).toBe(true);
    expect(canAccessRoute(authContext({ modules: { rh: 1 } }), managerPolicy)).toBe(false);
    expect(canAccessRoute(authContext({ modules: { rh: 2 } }), managerPolicy)).toBe(true);

    for (const [method, path] of managementRoutes) {
      const policy = requiredRoutePolicy(method, path);
      expect(canAccessRoute(authContext({ modules: { rh: 2 } }), policy)).toBe(false);
      expect(canAccessRoute(authContext({ modules: { rh: 3 } }), policy)).toBe(true);
    }
  });
});
