import { ServiceError } from "../http/errors.js";

export const INTEGRACAO_MODULE_KEY = "integracao" as const;

export const INTEGRACAO_PERMISSION_LEVELS = [0, 1, 2, 3] as const;
export type IntegracaoPermissionLevel = (typeof INTEGRACAO_PERMISSION_LEVELS)[number];
export const INTEGRACAO_PERMISSION_LEVEL = {
  BASIC: 0,
  VIEWER: 1,
  USER: 2,
  ADMIN: 3,
} as const satisfies Record<string, IntegracaoPermissionLevel>;

export type IntegracaoResource =
  | "client"
  | "project"
  | "projectPlan"
  | "task"
  | "taskAttachment"
  | "taskModel";
export type IntegracaoAction =
  | "read"
  | "create"
  | "update"
  | "activate"
  | "deactivate"
  | "delete"
  | "requestCompletion"
  | "approveCompletion"
  | "cancelCompletion"
  | "reopen"
  | "manage"
  | "manageDependencies";
export type IntegracaoScope = "organization" | "responsible";
export type IntegracaoHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type IntegracaoMutableFields = readonly string[] | "all";

export interface IntegracaoAccessRule {
  levels: readonly IntegracaoPermissionLevel[];
  scope: IntegracaoScope;
  mutableFields: IntegracaoMutableFields;
  requiresTaskCompletion?: boolean;
}

export interface IntegracaoRoutePolicy {
  method: IntegracaoHttpMethod;
  path: string;
  resource: IntegracaoResource;
  action: IntegracaoAction;
  access: readonly IntegracaoAccessRule[];
  organization: "active";
  responses: {
    forbidden: 403;
    outOfScope: 404;
    dependency: 409 | null;
  };
  audit: "required" | "none";
  test: string;
}

export interface IntegracaoAuthorizationInput {
  userId: string;
  level: IntegracaoPermissionLevel;
  organizationId: string;
  resourceOrganizationId?: string;
  responsibleId?: string | null;
  responsible2Id?: string | null;
  responsible3Id?: string | null;
  isOwner: boolean;
  hasTaskCompletionPermission?: boolean;
  requestedFields?: readonly string[];
}

export interface IntegracaoServiceAuthorization {
  level: IntegracaoPermissionLevel;
  isOwner: boolean;
}

export type IntegracaoAuthorizationDecision = "allow" | "forbidden" | "not_found";

const CLIENT_CREATE_FIELDS = [
  "type",
  "name",
  "company_name",
  "fantasy_name",
  "cpf_cnpj",
  "opening_date",
  "responsible",
  "cpf_responsible",
  "number",
  "email",
  "agent",
  "cpf_agent",
  "instagram",
  "indication",
  "participants_meet",
  "meet_type",
  "type_registration",
  "service_unique",
  "status",
  "prospecting_status",
  "regime",
] as const;

const CLIENT_UPDATE_FIELDS = [
  "type",
  "name",
  "company_name",
  "fantasy_name",
  "cpf_cnpj",
  "opening_date",
  "responsible",
  "cpf_responsible",
  "number",
  "email",
  "agent",
  "cpf_agent",
  "instagram",
  "indication",
  "participants_meet",
  "meet_type",
  "type_registration",
  "service_unique",
  "prospecting_status",
  "address",
  "cep",
  "neighborhood",
  "state",
  "city",
] as const;
const CLIENT_INTEGRATION_UPDATE_FIELDS = [...CLIENT_UPDATE_FIELDS, "regime"] as const;

const PROJECT_FIELDS = [
  "name",
  "client_id",
  "start_date",
  "end_date",
  "objective",
  "sponsor_id",
] as const;
const PROJECT_UPDATE_FIELDS = [...PROJECT_FIELDS, "status"] as const;
const TASK_CREATE_FIELDS = [
  "model_id",
  "project_id",
  "client_id",
  "prospecting_status",
  "observations",
  "urgency",
] as const;
const TASK_UPDATE_FIELDS = [
  ...TASK_CREATE_FIELDS,
  "name",
  "status",
  "department_id",
  "billing",
  "responsible_id",
  "prevision_date",
] as const;
const TASK_OWN_FIELDS = ["status", "observations"] as const;
const TASK_MODEL_FIELDS = [
  "name",
  "department_id",
  "responsible_id",
  "responsible2_id",
  "responsible3_id",
  "observations",
  "billing",
  "prevision",
  "type",
] as const;
const TASK_MODEL_DEPENDENCY_FIELDS = [
  "task_model_id",
  "dependent_id",
  "wait",
  "observation",
] as const;

function readRule(
  levels: readonly IntegracaoPermissionLevel[],
  scope: IntegracaoScope = "organization",
): IntegracaoAccessRule {
  return { levels, scope, mutableFields: [] as const };
}

function writeRule(
  levels: readonly IntegracaoPermissionLevel[],
  mutableFields: IntegracaoMutableFields,
  scope: IntegracaoScope = "organization",
): IntegracaoAccessRule {
  return { levels, scope, mutableFields };
}

function completionApprovalRule(
  levels: readonly IntegracaoPermissionLevel[],
  requiresTaskCompletion = false,
): IntegracaoAccessRule {
  return {
    levels,
    scope: "organization" as const,
    mutableFields: [] as const,
    ...(requiresTaskCompletion ? { requiresTaskCompletion: true } : {}),
  };
}

function routePolicy(
  method: IntegracaoHttpMethod,
  path: string,
  resource: IntegracaoResource,
  action: IntegracaoAction,
  access: readonly IntegracaoAccessRule[],
  options: { dependency?: 409; audit?: "required" | "none"; test: string },
): IntegracaoRoutePolicy {
  return {
    method,
    path,
    resource,
    action,
    access,
    organization: "active",
    responses: {
      forbidden: 403,
      outOfScope: 404,
      dependency: options.dependency ?? null,
    },
    audit: options.audit ?? "none",
    test: options.test,
  };
}

const readOrganization = [
  INTEGRACAO_PERMISSION_LEVEL.VIEWER,
  INTEGRACAO_PERMISSION_LEVEL.USER,
  INTEGRACAO_PERMISSION_LEVEL.ADMIN,
] as const;
const writeUser = [INTEGRACAO_PERMISSION_LEVEL.USER, INTEGRACAO_PERMISSION_LEVEL.ADMIN] as const;
const admin = [INTEGRACAO_PERMISSION_LEVEL.ADMIN] as const;
const taskModelRead = [
  INTEGRACAO_PERMISSION_LEVEL.VIEWER,
  INTEGRACAO_PERMISSION_LEVEL.USER,
  INTEGRACAO_PERMISSION_LEVEL.ADMIN,
] as const;

export const INTEGRACAO_ROUTE_POLICIES: readonly IntegracaoRoutePolicy[] = [
  routePolicy("GET", "/client/list", "client", "read", [readRule(readOrganization)], {
    test: "client.list",
  }),
  routePolicy("GET", "/client/groups", "client", "read", [readRule(readOrganization)], {
    test: "client.groups.list",
  }),
  routePolicy("POST", "/client/groups", "client", "create", [writeRule(writeUser, ["name"])], {
    audit: "required",
    test: "client.groups.create",
  }),
  routePolicy("PATCH", "/client/groups/:id", "client", "update", [writeRule(writeUser, ["name"])], {
    audit: "required",
    test: "client.groups.update",
  }),
  routePolicy(
    "PUT",
    "/client/groups/:id/clients",
    "client",
    "update",
    [writeRule(writeUser, ["client_ids"])],
    { audit: "required", test: "client.groups.clients.replace" },
  ),
  routePolicy("GET", "/client/integration", "client", "read", [readRule(readOrganization)], {
    test: "client.integration.lookup",
  }),
  routePolicy("GET", "/client/:id", "client", "read", [readRule(readOrganization)], {
    test: "client.detail",
  }),
  routePolicy("POST", "/client", "client", "create", [writeRule(writeUser, CLIENT_CREATE_FIELDS)], {
    audit: "required",
    test: "client.create",
  }),
  routePolicy(
    "PATCH",
    "/client/:id",
    "client",
    "update",
    [writeRule(writeUser, CLIENT_UPDATE_FIELDS)],
    {
      audit: "required",
      test: "client.update",
    },
  ),
  routePolicy(
    "POST",
    "/client/integration",
    "client",
    "create",
    [writeRule(writeUser, CLIENT_CREATE_FIELDS)],
    { audit: "required", test: "client.integration.create" },
  ),
  routePolicy(
    "PATCH",
    "/client/:id/integration",
    "client",
    "update",
    [writeRule(writeUser, CLIENT_INTEGRATION_UPDATE_FIELDS)],
    { audit: "required", test: "client.integration.update" },
  ),
  routePolicy("DELETE", "/client/:id", "client", "deactivate", [writeRule(admin, [])], {
    audit: "required",
    test: "client.deactivate",
  }),
  routePolicy("POST", "/client/:id/activate", "client", "activate", [writeRule(admin, [])], {
    audit: "required",
    test: "client.activate",
  }),
  routePolicy("GET", "/project/list", "project", "read", [readRule(readOrganization)], {
    test: "project.list",
  }),
  routePolicy("GET", "/project", "project", "read", [readRule(readOrganization)], {
    test: "project.detail",
  }),
  routePolicy("GET", "/project/metrics", "project", "read", [readRule(readOrganization)], {
    test: "project.metrics",
  }),
  routePolicy(
    "POST",
    "/project/progress",
    "project",
    "update",
    [writeRule(writeUser, ["project_id"])],
    {
      audit: "required",
      test: "project.progress",
    },
  ),
  routePolicy("POST", "/project", "project", "create", [writeRule(writeUser, PROJECT_FIELDS)], {
    audit: "required",
    test: "project.create",
  }),
  routePolicy(
    "PUT",
    "/project",
    "project",
    "update",
    [writeRule(writeUser, PROJECT_UPDATE_FIELDS)],
    {
      audit: "required",
      test: "project.update",
    },
  ),
  routePolicy("DELETE", "/project", "project", "delete", [writeRule(admin, [])], {
    audit: "required",
    dependency: 409,
    test: "project.delete",
  }),
  routePolicy(
    "GET",
    "/task/list",
    "task",
    "read",
    [readRule([INTEGRACAO_PERMISSION_LEVEL.BASIC], "responsible"), readRule(readOrganization)],
    { test: "task.list" },
  ),
  routePolicy(
    "GET",
    "/task",
    "task",
    "read",
    [readRule([INTEGRACAO_PERMISSION_LEVEL.BASIC], "responsible"), readRule(readOrganization)],
    { test: "task.detail" },
  ),
  routePolicy("GET", "/task/financeiro/queue", "task", "read", [readRule(readOrganization)], {
    test: "task.financeiro.queue",
  }),
  routePolicy("GET", "/task/financeiro/collectors", "task", "manage", [readRule(admin)], {
    test: "task.financeiro.collectors.list",
  }),
  routePolicy("PUT", "/task/financeiro/collectors", "task", "manage", [writeRule(admin, [])], {
    audit: "required",
    test: "task.financeiro.collectors",
  }),
  routePolicy(
    "POST",
    "/task/financeiro/settle",
    "task",
    "update",
    [writeRule(readOrganization, [])],
    { audit: "required", test: "task.financeiro.settle" },
  ),
  routePolicy(
    "POST",
    "/task/financeiro/express",
    "task",
    "update",
    [writeRule(readOrganization, [])],
    { audit: "required", test: "task.financeiro.express" },
  ),
  routePolicy("POST", "/task", "task", "create", [writeRule(writeUser, TASK_CREATE_FIELDS)], {
    audit: "required",
    test: "task.create",
  }),
  routePolicy(
    "POST",
    "/task/project-wizard",
    "project",
    "create",
    [writeRule(writeUser, PROJECT_FIELDS)],
    { audit: "required", test: "task.projectWizard.create" },
  ),
  routePolicy("POST", "/task/project-wizard/extract-tasks", "task", "read", [readRule(writeUser)], {
    audit: "required",
    test: "task.projectWizard.extractTasks",
  }),
  routePolicy(
    "POST",
    "/task/project-wizard/preview",
    "taskModel",
    "read",
    [writeRule(writeUser, [])],
    { test: "task.projectWizard.preview" },
  ),
  routePolicy("GET", "/task/project-plan", "projectPlan", "read", [readRule(readOrganization)], {
    test: "projectPlan.detail",
  }),
  routePolicy(
    "GET",
    "/task/project-plan/list",
    "projectPlan",
    "read",
    [readRule(readOrganization)],
    {
      test: "projectPlan.list",
    },
  ),
  routePolicy(
    "GET",
    "/task/project-plan/task/list",
    "projectPlan",
    "read",
    [readRule(readOrganization)],
    { test: "projectPlan.task.list" },
  ),
  routePolicy("POST", "/task/project-plan", "projectPlan", "manage", [writeRule(admin, [])], {
    audit: "required",
    test: "projectPlan.create",
  }),
  routePolicy("PUT", "/task/project-plan", "projectPlan", "manage", [writeRule(admin, [])], {
    audit: "required",
    test: "projectPlan.update",
  }),
  routePolicy("DELETE", "/task/project-plan", "projectPlan", "delete", [writeRule(admin, [])], {
    audit: "required",
    dependency: 409,
    test: "projectPlan.delete",
  }),
  routePolicy("POST", "/task/project-plan/task", "projectPlan", "manage", [writeRule(admin, [])], {
    audit: "required",
    test: "projectPlan.task.create",
  }),
  routePolicy("PUT", "/task/project-plan/task", "projectPlan", "manage", [writeRule(admin, [])], {
    audit: "required",
    test: "projectPlan.task.reorder",
  }),
  routePolicy(
    "DELETE",
    "/task/project-plan/task",
    "projectPlan",
    "delete",
    [writeRule(admin, [])],
    { audit: "required", test: "projectPlan.task.delete" },
  ),
  routePolicy("POST", "/task/project-plan/hire", "projectPlan", "manage", [writeRule(admin, [])], {
    audit: "required",
    test: "projectPlan.hire",
  }),
  routePolicy(
    "PUT",
    "/task",
    "task",
    "update",
    [
      writeRule(
        [INTEGRACAO_PERMISSION_LEVEL.BASIC, INTEGRACAO_PERMISSION_LEVEL.VIEWER],
        TASK_OWN_FIELDS,
        "responsible",
      ),
      writeRule(
        [INTEGRACAO_PERMISSION_LEVEL.USER, INTEGRACAO_PERMISSION_LEVEL.ADMIN],
        TASK_UPDATE_FIELDS,
        "organization",
      ),
    ],
    { audit: "required", test: "task.update" },
  ),
  routePolicy(
    "POST",
    "/task/postponement",
    "task",
    "update",
    [
      writeRule(
        [INTEGRACAO_PERMISSION_LEVEL.BASIC, INTEGRACAO_PERMISSION_LEVEL.VIEWER],
        [],
        "responsible",
      ),
      writeRule([INTEGRACAO_PERMISSION_LEVEL.USER, INTEGRACAO_PERMISSION_LEVEL.ADMIN], []),
    ],
    { audit: "required", test: "task.postponement.create" },
  ),
  routePolicy(
    "GET",
    "/task/postponement/list",
    "task",
    "read",
    [
      readRule(
        [INTEGRACAO_PERMISSION_LEVEL.BASIC, INTEGRACAO_PERMISSION_LEVEL.VIEWER],
        "responsible",
      ),
      readRule([INTEGRACAO_PERMISSION_LEVEL.USER, INTEGRACAO_PERMISSION_LEVEL.ADMIN]),
    ],
    { test: "task.postponement.list" },
  ),
  routePolicy(
    "GET",
    "/task/notifications",
    "task",
    "read",
    [readRule([INTEGRACAO_PERMISSION_LEVEL.BASIC, ...readOrganization])],
    { test: "task.notifications.list" },
  ),
  routePolicy(
    "PUT",
    "/task/notifications/read",
    "task",
    "update",
    [writeRule([INTEGRACAO_PERMISSION_LEVEL.BASIC, ...readOrganization], [])],
    { test: "task.notifications.read" },
  ),
  routePolicy("DELETE", "/task", "task", "delete", [writeRule(admin, [])], {
    audit: "required",
    dependency: 409,
    test: "task.delete",
  }),
  routePolicy(
    "PUT",
    "/task/conclusion",
    "task",
    "requestCompletion",
    [
      writeRule(
        [INTEGRACAO_PERMISSION_LEVEL.BASIC, INTEGRACAO_PERMISSION_LEVEL.VIEWER],
        ["status", "observations"],
        "responsible",
      ),
    ],
    { audit: "required", test: "task.requestCompletion" },
  ),
  routePolicy(
    "POST",
    "/task/complete-request",
    "task",
    "requestCompletion",
    [
      writeRule(
        [
          INTEGRACAO_PERMISSION_LEVEL.BASIC,
          INTEGRACAO_PERMISSION_LEVEL.VIEWER,
          INTEGRACAO_PERMISSION_LEVEL.USER,
          INTEGRACAO_PERMISSION_LEVEL.ADMIN,
        ],
        [],
        "responsible",
      ),
    ],
    { audit: "required", test: "task.requestCompletion.create" },
  ),
  routePolicy(
    "PUT",
    "/task/complete-request",
    "task",
    "approveCompletion",
    [
      completionApprovalRule([INTEGRACAO_PERMISSION_LEVEL.USER], true),
      completionApprovalRule([INTEGRACAO_PERMISSION_LEVEL.ADMIN]),
    ],
    { audit: "required", test: "task.approveCompletion" },
  ),
  routePolicy(
    "DELETE",
    "/task/complete-request",
    "task",
    "cancelCompletion",
    [
      writeRule(
        [
          INTEGRACAO_PERMISSION_LEVEL.BASIC,
          INTEGRACAO_PERMISSION_LEVEL.VIEWER,
          INTEGRACAO_PERMISSION_LEVEL.USER,
          INTEGRACAO_PERMISSION_LEVEL.ADMIN,
        ],
        [],
      ),
    ],
    { audit: "required", test: "task.requestCompletion.cancel" },
  ),
  routePolicy(
    "GET",
    "/task/complete-request/list",
    "task",
    "read",
    [
      readRule(
        [INTEGRACAO_PERMISSION_LEVEL.BASIC, INTEGRACAO_PERMISSION_LEVEL.VIEWER],
        "responsible",
      ),
      readRule([INTEGRACAO_PERMISSION_LEVEL.USER, INTEGRACAO_PERMISSION_LEVEL.ADMIN]),
    ],
    { test: "task.requestCompletion.list" },
  ),
  routePolicy(
    "POST",
    "/task/attachment",
    "taskAttachment",
    "create",
    [
      writeRule(
        [INTEGRACAO_PERMISSION_LEVEL.BASIC, INTEGRACAO_PERMISSION_LEVEL.VIEWER],
        [],
        "responsible",
      ),
      writeRule([INTEGRACAO_PERMISSION_LEVEL.USER, INTEGRACAO_PERMISSION_LEVEL.ADMIN], []),
    ],
    { audit: "required", test: "task.attachment.create" },
  ),
  routePolicy(
    "GET",
    "/task/attachment/list",
    "taskAttachment",
    "read",
    [
      readRule(
        [INTEGRACAO_PERMISSION_LEVEL.BASIC, INTEGRACAO_PERMISSION_LEVEL.VIEWER],
        "responsible",
      ),
      readRule([INTEGRACAO_PERMISSION_LEVEL.USER, INTEGRACAO_PERMISSION_LEVEL.ADMIN]),
    ],
    { test: "task.attachment.list" },
  ),
  routePolicy(
    "GET",
    "/task/attachment/access",
    "taskAttachment",
    "read",
    [
      readRule(
        [INTEGRACAO_PERMISSION_LEVEL.BASIC, INTEGRACAO_PERMISSION_LEVEL.VIEWER],
        "responsible",
      ),
      readRule([INTEGRACAO_PERMISSION_LEVEL.USER, INTEGRACAO_PERMISSION_LEVEL.ADMIN]),
    ],
    { test: "task.attachment.access" },
  ),
  routePolicy("DELETE", "/task/attachment", "taskAttachment", "delete", [writeRule(admin, [])], {
    audit: "required",
    test: "task.attachment.delete",
  }),
  routePolicy("PUT", "/task/reopen", "task", "reopen", [writeRule(admin, [])], {
    audit: "required",
    test: "task.reopen",
  }),
  routePolicy("GET", "/task/model/list", "taskModel", "read", [readRule(taskModelRead)], {
    test: "taskModel.list",
  }),
  routePolicy("GET", "/task/deps/list", "taskModel", "read", [readRule(taskModelRead)], {
    test: "taskModel.dependencies.list",
  }),
  routePolicy("GET", "/task/deps/options", "taskModel", "read", [readRule(taskModelRead)], {
    test: "taskModel.options.list",
  }),
  routePolicy("GET", "/task/model", "taskModel", "read", [readRule(taskModelRead)], {
    test: "taskModel.detail",
  }),
  routePolicy("POST", "/task/model", "taskModel", "manage", [writeRule(admin, TASK_MODEL_FIELDS)], {
    audit: "required",
    test: "taskModel.create",
  }),
  routePolicy("PUT", "/task/model", "taskModel", "manage", [writeRule(admin, TASK_MODEL_FIELDS)], {
    audit: "required",
    test: "taskModel.update",
  }),
  routePolicy("DELETE", "/task/model", "taskModel", "delete", [writeRule(admin, [])], {
    audit: "required",
    dependency: 409,
    test: "taskModel.delete",
  }),
  routePolicy("POST", "/task/integration", "taskModel", "manage", [writeRule(admin, [])], {
    audit: "required",
    test: "taskIntegration.create",
  }),
  routePolicy("DELETE", "/task/integration", "taskModel", "manage", [writeRule(admin, [])], {
    audit: "required",
    test: "taskIntegration.delete",
  }),
  routePolicy("GET", "/task/integration", "taskModel", "read", [readRule(taskModelRead)], {
    test: "taskIntegration.list",
  }),
  routePolicy(
    "GET",
    "/task/model/dependent",
    "taskModel",
    "manageDependencies",
    [readRule(taskModelRead)],
    {
      test: "taskModel.dependent.list",
    },
  ),
  routePolicy(
    "POST",
    "/task/model/dependent",
    "taskModel",
    "manageDependencies",
    [writeRule(admin, TASK_MODEL_DEPENDENCY_FIELDS)],
    { audit: "required", test: "taskModel.dependent.create" },
  ),
  routePolicy("DELETE", "/task/model/dependent", "taskModel", "delete", [writeRule(admin, [])], {
    audit: "required",
    dependency: 409,
    test: "taskModel.dependent.delete",
  }),
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routePatternMatches(pattern: string, path: string): boolean {
  const expression = escapeRegExp(pattern).replace(/:[^/\\]+/g, "[^/]+");
  return new RegExp(`^${expression}$`).test(path);
}

function hasTaskOwnership(input: IntegracaoAuthorizationInput): boolean {
  const responsibleIds = [input.responsibleId, input.responsible2Id, input.responsible3Id];
  return responsibleIds.includes(input.userId);
}

export function findIntegracaoRoutePolicy(
  method: string,
  path: string,
): IntegracaoRoutePolicy | undefined {
  const normalizedMethod = method.toUpperCase();
  return INTEGRACAO_ROUTE_POLICIES.find(
    (policy) => policy.method === normalizedMethod && routePatternMatches(policy.path, path),
  );
}

export function evaluateIntegracaoAction(
  policy: IntegracaoRoutePolicy,
  input: IntegracaoAuthorizationInput,
): IntegracaoAuthorizationDecision {
  if (input.isOwner) {
    return "allow";
  }

  if (
    input.resourceOrganizationId !== undefined &&
    input.resourceOrganizationId !== input.organizationId
  ) {
    return "not_found";
  }

  const rule = policy.access.find((candidate) => candidate.levels.includes(input.level));
  if (!rule) {
    return "forbidden";
  }

  if (rule.scope === "responsible" && !hasTaskOwnership(input)) {
    return "not_found";
  }

  if (rule.requiresTaskCompletion && input.hasTaskCompletionPermission !== true) {
    return "forbidden";
  }

  if (
    input.requestedFields &&
    rule.mutableFields !== "all" &&
    input.requestedFields.some((field) => !rule.mutableFields.includes(field))
  ) {
    return "forbidden";
  }

  return "allow";
}

export function requireIntegracaoRouteAccess(
  method: string,
  path: string,
  input: IntegracaoAuthorizationInput,
): void {
  const policy = findIntegracaoRoutePolicy(method, path);
  if (!policy) {
    throw new ServiceError(500, `Política de autorização ausente para ${method} ${path}.`);
  }

  const decision = evaluateIntegracaoAction(policy, input);
  if (decision === "allow") {
    return;
  }

  if (decision === "not_found") {
    throw new ServiceError(404, "Recurso não encontrado.");
  }

  throw new ServiceError(403, "Acesso negado para esta operação.");
}
