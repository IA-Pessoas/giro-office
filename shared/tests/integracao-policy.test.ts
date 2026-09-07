import assert from "node:assert/strict";
import test from "node:test";
import type { IntegracaoRoutePolicy } from "../src/auth/integracao.js";
import {
  evaluateIntegracaoAction,
  findIntegracaoRoutePolicy,
  INTEGRACAO_ROUTE_POLICIES,
  requireIntegracaoRouteAccess,
} from "../src/auth/integracao.js";

const expectedRoutes = [
  "GET /client/list",
  "GET /client/:id",
  "POST /client",
  "PATCH /client/:id",
  "POST /client/integration",
  "PATCH /client/:id/integration",
  "DELETE /client/:id",
  "POST /client/:id/activate",
  "GET /project/list",
  "GET /project",
  "GET /project/metrics",
  "POST /project/progress",
  "POST /project",
  "PUT /project",
  "DELETE /project",
  "GET /task/list",
  "GET /task",
  "POST /task",
  "POST /task/project-wizard",
  "POST /task/project-wizard/extract-tasks",
  "PUT /task",
  "DELETE /task",
  "PUT /task/conclusion",
  "PUT /task/complete-request",
  "GET /task/model/list",
  "GET /task/deps/list",
  "GET /task/deps/options",
  "GET /task/model",
  "POST /task/model",
  "PUT /task/model",
  "DELETE /task/model",
  "GET /task/model/dependent",
  "POST /task/model/dependent",
  "DELETE /task/model/dependent",
] as const;

function requirePolicy(method: string, path: string): IntegracaoRoutePolicy {
  const policy = findIntegracaoRoutePolicy(method, path);
  assert.ok(policy, `política ausente para ${method} ${path}`);
  return policy;
}

test("publica uma política para cada operação consumida pela Integração", () => {
  const routeKeys = INTEGRACAO_ROUTE_POLICIES.map(({ method, path }) => `${method} ${path}`);

  assert.deepEqual(routeKeys, expectedRoutes);
  assert.ok(INTEGRACAO_ROUTE_POLICIES.every((policy) => policy.organization === "active"));
  assert.ok(INTEGRACAO_ROUTE_POLICIES.every((policy) => policy.responses.forbidden === 403));
  assert.ok(INTEGRACAO_ROUTE_POLICIES.every((policy) => policy.responses.outOfScope === 404));
});

test("resolve parâmetros e mantém o escopo da organização ativa", () => {
  const policy = requirePolicy("PATCH", "/client/123/integration");

  assert.equal(policy?.resource, "client");
  assert.equal(policy?.action, "update");
  assert.equal(
    evaluateIntegracaoAction(policy, {
      userId: "user-1",
      level: 2,
      organizationId: "org-1",
      resourceOrganizationId: "org-2",
      isOwner: false,
    }),
    "not_found",
  );
  assert.equal(
    evaluateIntegracaoAction(policy, {
      userId: "user-1",
      level: 0,
      organizationId: "org-1",
      resourceOrganizationId: "org-1",
      isOwner: false,
      requestedFields: ["status"],
    }),
    "forbidden",
  );
});

test("níveis 0 e 1 só alteram tarefa própria nos campos permitidos", () => {
  const policy = requirePolicy("PUT", "/task");

  assert.equal(
    evaluateIntegracaoAction(policy, {
      userId: "user-1",
      level: 0,
      organizationId: "org-1",
      resourceOrganizationId: "org-1",
      responsibleId: "user-1",
      isOwner: false,
      requestedFields: ["status", "observations"],
    }),
    "allow",
  );
  assert.equal(
    evaluateIntegracaoAction(policy, {
      userId: "user-1",
      level: 1,
      organizationId: "org-1",
      resourceOrganizationId: "org-1",
      responsible2Id: "user-1",
      isOwner: false,
      requestedFields: ["status", "observations"],
    }),
    "allow",
  );
  assert.equal(
    evaluateIntegracaoAction(policy, {
      userId: "user-1",
      level: 1,
      organizationId: "org-1",
      resourceOrganizationId: "org-1",
      responsible3Id: "user-1",
      isOwner: false,
      requestedFields: ["name"],
    }),
    "forbidden",
  );
  assert.equal(
    evaluateIntegracaoAction(policy, {
      userId: "user-1",
      level: 1,
      organizationId: "org-1",
      resourceOrganizationId: "org-1",
      responsibleId: "other-user",
      isOwner: false,
      requestedFields: ["status"],
    }),
    "not_found",
  );
});

test("a política manual de tarefa rejeita responsáveis secundários", () => {
  const policy = requirePolicy("PUT", "/task");

  for (const field of ["responsible2_id", "responsible3_id"]) {
    assert.equal(
      evaluateIntegracaoAction(policy, {
        userId: "user-1",
        level: 2,
        organizationId: "org-1",
        resourceOrganizationId: "org-1",
        isOwner: false,
        requestedFields: [field],
      }),
      "forbidden",
      field,
    );
  }
});

test("a propriedade da tarefa vale para os três responsáveis", () => {
  const readPolicy = requirePolicy("GET", "/task");
  const updatePolicy = requirePolicy("PUT", "/task");

  for (const ownershipField of ["responsibleId", "responsible2Id", "responsible3Id"] as const) {
    const ownedTask = {
      userId: "user-1",
      level: 0 as const,
      organizationId: "org-1",
      resourceOrganizationId: "org-1",
      isOwner: false,
      [ownershipField]: "user-1",
    };

    assert.equal(evaluateIntegracaoAction(readPolicy, ownedTask), "allow", ownershipField);
    assert.equal(
      evaluateIntegracaoAction(updatePolicy, {
        ...ownedTask,
        requestedFields: ["status", "observations"],
      }),
      "allow",
      ownershipField,
    );
    assert.equal(
      evaluateIntegracaoAction(readPolicy, {
        ...ownedTask,
        [ownershipField]: "other-user",
      }),
      "not_found",
      ownershipField,
    );
  }
});

test("a matriz de níveis mantém leitura, edição e administração separadas", () => {
  const cases = [
    { method: "GET", path: "/client/list", allowedLevels: [1, 2, 3] },
    { method: "GET", path: "/client/:id", allowedLevels: [1, 2, 3] },
    { method: "POST", path: "/client", allowedLevels: [2, 3] },
    { method: "PATCH", path: "/client/:id", allowedLevels: [2, 3] },
    { method: "POST", path: "/client/integration", allowedLevels: [2, 3] },
    { method: "PATCH", path: "/client/:id/integration", allowedLevels: [2, 3] },
    { method: "DELETE", path: "/client/:id", allowedLevels: [3] },
    { method: "POST", path: "/client/:id/activate", allowedLevels: [3] },
    { method: "GET", path: "/project/list", allowedLevels: [1, 2, 3] },
    { method: "GET", path: "/project", allowedLevels: [1, 2, 3] },
    { method: "GET", path: "/project/metrics", allowedLevels: [1, 2, 3] },
    { method: "POST", path: "/project/progress", allowedLevels: [2, 3] },
    { method: "POST", path: "/project", allowedLevels: [2, 3] },
    { method: "PUT", path: "/project", allowedLevels: [2, 3] },
    { method: "DELETE", path: "/project", allowedLevels: [3] },
    { method: "GET", path: "/task/list", allowedLevels: [0, 1, 2, 3] },
    { method: "GET", path: "/task", allowedLevels: [0, 1, 2, 3] },
    { method: "POST", path: "/task", allowedLevels: [2, 3] },
    {
      method: "PUT",
      path: "/task",
      allowedLevels: [0, 1, 2, 3],
      requestedFields: ["status", "observations"],
    },
    { method: "DELETE", path: "/task", allowedLevels: [3] },
    { method: "PUT", path: "/task/conclusion", allowedLevels: [0, 1] },
    {
      method: "PUT",
      path: "/task/complete-request",
      allowedLevels: [2, 3],
      hasTaskCompletionPermission: true,
    },
    { method: "GET", path: "/task/model/list", allowedLevels: [1, 2, 3] },
    { method: "GET", path: "/task/deps/list", allowedLevels: [1, 2, 3] },
    { method: "GET", path: "/task/deps/options", allowedLevels: [1, 2, 3] },
    { method: "GET", path: "/task/model", allowedLevels: [1, 2, 3] },
    { method: "POST", path: "/task/model", allowedLevels: [3] },
    { method: "PUT", path: "/task/model", allowedLevels: [3] },
    { method: "DELETE", path: "/task/model", allowedLevels: [3] },
    { method: "GET", path: "/task/model/dependent", allowedLevels: [1, 2, 3] },
    { method: "POST", path: "/task/model/dependent", allowedLevels: [3] },
    { method: "DELETE", path: "/task/model/dependent", allowedLevels: [3] },
  ] as const;

  for (const routeCase of cases) {
    const policy = requirePolicy(routeCase.method, routeCase.path);

    for (const level of [0, 1, 2, 3] as const) {
      const expected = routeCase.allowedLevels.includes(level) ? "allow" : "forbidden";
      assert.equal(
        evaluateIntegracaoAction(policy, {
          userId: "user-1",
          level,
          organizationId: "org-1",
          resourceOrganizationId: "org-1",
          responsibleId: "user-1",
          isOwner: false,
          ...(routeCase.requestedFields ? { requestedFields: routeCase.requestedFields } : {}),
          ...(routeCase.hasTaskCompletionPermission ? { hasTaskCompletionPermission: true } : {}),
        }),
        expected,
        `${routeCase.method} ${routeCase.path} nível ${level}`,
      );
    }

    assert.equal(
      evaluateIntegracaoAction(policy, {
        userId: "user-1",
        level: 0,
        organizationId: "org-1",
        resourceOrganizationId: "org-2",
        isOwner: true,
        ...(routeCase.requestedFields ? { requestedFields: routeCase.requestedFields } : {}),
      }),
      "allow",
      `${routeCase.method} ${routeCase.path} owner`,
    );
  }
});

test("nível 2 exige task_completion para aprovar conclusão", () => {
  const policy = requirePolicy("PUT", "/task/complete-request");

  const baseInput = {
    userId: "user-1",
    level: 2 as const,
    organizationId: "org-1",
    resourceOrganizationId: "org-1",
    isOwner: false,
  };

  assert.equal(evaluateIntegracaoAction(policy, baseInput), "forbidden");
  assert.equal(
    evaluateIntegracaoAction(policy, { ...baseInput, hasTaskCompletionPermission: true }),
    "allow",
  );
  assert.equal(
    evaluateIntegracaoAction(policy, {
      ...baseInput,
      level: 3,
    }),
    "allow",
  );
});

test("níveis 1 e 2 podem consultar modelos, mas não administrá-los", () => {
  const listPolicy = requirePolicy("GET", "/task/model/list");
  const dependenciesPolicy = requirePolicy("GET", "/task/deps/list");
  const optionsPolicy = requirePolicy("GET", "/task/deps/options");
  const createPolicy = requirePolicy("POST", "/task/model");
  for (const level of [1, 2] as const) {
    const input = {
      userId: "user-1",
      level,
      organizationId: "org-1",
      resourceOrganizationId: "org-1",
      isOwner: false,
    };

    assert.equal(evaluateIntegracaoAction(listPolicy, input), "allow");
    assert.equal(evaluateIntegracaoAction(dependenciesPolicy, input), "allow");
    assert.equal(evaluateIntegracaoAction(optionsPolicy, input), "allow");
    assert.equal(evaluateIntegracaoAction(createPolicy, input), "forbidden");
  }
});

test("helper traduz a decisão de política em 403 ou 404", () => {
  assert.throws(
    () =>
      requireIntegracaoRouteAccess("GET", "/client/list", {
        userId: "user-1",
        level: 0,
        organizationId: "org-1",
        isOwner: false,
      }),
    { statusCode: 403 },
  );

  assert.throws(
    () =>
      requireIntegracaoRouteAccess("GET", "/task", {
        userId: "user-1",
        level: 0,
        organizationId: "org-1",
        resourceOrganizationId: "org-1",
        responsibleId: "other-user",
        isOwner: false,
      }),
    { statusCode: 404 },
  );
});

test("owner possui bypass global e exclusões preservam conflito de dependência", () => {
  const deletePolicy = requirePolicy("DELETE", "/project");

  assert.equal(
    evaluateIntegracaoAction(deletePolicy, {
      userId: "user-1",
      level: 0,
      organizationId: "org-1",
      resourceOrganizationId: "org-2",
      isOwner: true,
    }),
    "allow",
  );
  assert.equal(deletePolicy?.responses.dependency, 409);
  assert.ok(
    INTEGRACAO_ROUTE_POLICIES.filter((policy) => policy.action === "delete").every(
      (policy) => policy.responses.dependency === 409,
    ),
  );
});

test("a extração de tarefas por IA exige nível 2+ ou owner", () => {
  const policy = requirePolicy("POST", "/task/project-wizard/extract-tasks");

  assert.equal(policy.audit, "required");
  for (const level of [0, 1] as const) {
    assert.equal(
      evaluateIntegracaoAction(policy, {
        userId: "user-1",
        level,
        organizationId: "org-1",
        resourceOrganizationId: "org-1",
        isOwner: false,
      }),
      "forbidden",
    );
  }
  for (const level of [2, 3] as const) {
    assert.equal(
      evaluateIntegracaoAction(policy, {
        userId: "user-1",
        level,
        organizationId: "org-1",
        resourceOrganizationId: "org-1",
        isOwner: false,
      }),
      "allow",
    );
  }
  assert.equal(
    evaluateIntegracaoAction(policy, {
      userId: "user-1",
      level: 0,
      organizationId: "org-1",
      resourceOrganizationId: "org-2",
      isOwner: true,
    }),
    "allow",
  );
});
