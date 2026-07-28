import assert from "node:assert/strict";
import test from "node:test";
import type { IntegracaoRoutePolicy } from "../src/auth/integracao.js";
import {
  evaluateIntegracaoAction,
  findIntegracaoRoutePolicy,
  INTEGRACAO_ROUTE_POLICIES,
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
  "PUT /task",
  "DELETE /task",
  "PUT /task/conclusion",
  "PUT /task/complete-request",
  "GET /task/model/list",
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
    "not_found",
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
