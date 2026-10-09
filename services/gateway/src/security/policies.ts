import type { AuthPolicy } from "@workspace/shared";

const userManagementPolicy: AuthPolicy = { special: "manageUsers" };
const authenticatedPolicy: AuthPolicy = { minPermission: 0 };
const platformOnlyPolicy: AuthPolicy = { special: "platformOnly" };
const moduleAccessPermission = 1;
const moduleEditPermission = 2;

function createModulePolicy(module: string, minPermission: number): AuthPolicy {
  return { modulePermission: { module, minPermission } };
}

const rhModulePolicy: AuthPolicy = {
  modulePermission: {
    module: "rh",
    minPermission: moduleAccessPermission,
  },
};
const rhEditPolicy = createModulePolicy("rh", moduleEditPermission);
const rhManagementPolicy = createModulePolicy("rh", 3);
const tiModulePolicy = createModulePolicy("ti", moduleAccessPermission);
const tiEditPolicy = createModulePolicy("ti", moduleEditPermission);
const integracaoEditPolicy = createModulePolicy("integracao", moduleEditPermission);
const regularizeModulePolicy = createModulePolicy("regularize", moduleAccessPermission);
const regularizeEditPolicy = createModulePolicy("regularize", moduleEditPermission);
const fiscalModulePolicy = createModulePolicy("fiscal", moduleAccessPermission);
const fiscalEditPolicy = createModulePolicy("fiscal", moduleEditPermission);
const contabilModulePolicy = createModulePolicy("contabil", moduleAccessPermission);
const contabilEditPolicy = createModulePolicy("contabil", moduleEditPermission);
const triagemModulePolicy: AuthPolicy = {
  anyModulePermission: {
    modules: ["contabil", "triagem"],
    minPermission: moduleAccessPermission,
  },
};
const triagemEditPolicy: AuthPolicy = {
  anyModulePermission: {
    modules: ["contabil", "triagem"],
    minPermission: moduleAccessPermission,
  },
};
const certificateModulePolicy = createModulePolicy("certificado", moduleAccessPermission);
const certificateEditPolicy = createModulePolicy("certificado", moduleEditPermission);
const commercialModulePolicy = createModulePolicy("comercial", moduleAccessPermission);
const commercialEditPolicy = createModulePolicy("comercial", moduleEditPermission);
const marketingModulePolicy = createModulePolicy("marketing", moduleAccessPermission);
const marketingEditPolicy = createModulePolicy("marketing", moduleEditPermission);

const operationalUsersCatalogPolicy: AuthPolicy = {
  anyModulePermission: {
    modules: ["rh", "contabil", "financeiro", "triagem"],
    minPermission: moduleAccessPermission,
  },
};

const pessoalModulePolicy: AuthPolicy = {
  modulePermission: {
    module: "pessoal",
    minPermission: moduleAccessPermission,
  },
};

const pessoalEditPolicy: AuthPolicy = {
  modulePermission: {
    module: "pessoal",
    minPermission: moduleEditPermission,
  },
};

const parcelamentoModulePolicy: AuthPolicy = {
  modulePermission: {
    module: "parcelamento",
    minPermission: moduleAccessPermission,
  },
};

const parcelamentoEditPolicy: AuthPolicy = {
  modulePermission: {
    module: "parcelamento",
    minPermission: moduleEditPermission,
  },
};

const clientRelatedModules = [
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "pessoal",
  "regularize",
] as const;

const clientDetailModules = ["comercial", "contabil", "financeiro", "fiscal"] as const;

const clientModulePolicy: AuthPolicy = {
  anyModulePermission: {
    modules: [...clientDetailModules],
    minPermission: moduleAccessPermission,
  },
};

const clientEditPolicy: AuthPolicy = {
  anyModulePermission: {
    modules: [...clientRelatedModules],
    minPermission: moduleEditPermission,
  },
};

const integracaoProjectPolicy: AuthPolicy = {
  modulePermission: {
    module: "integracao",
    minPermission: moduleAccessPermission,
  },
};
const financeiroTaskViewPolicy: AuthPolicy = {
  anyModulePermission: {
    modules: ["financeiro", "integracao"],
    minPermission: moduleAccessPermission,
  },
};
const financeiroTaskAdminPolicy: AuthPolicy = {
  anyModulePermission: {
    modules: ["financeiro", "integracao"],
    minPermission: 3,
  },
};
const integracaoNotificationPolicy: AuthPolicy = createModulePolicy("integracao", 0);
/**
 * Rotas cuja matriz do task-service admite o responsável em nível 0/1; o escopo de
 * responsável continua sendo validado no serviço.
 */
const integracaoResponsibleTaskPolicy: AuthPolicy = createModulePolicy("integracao", 0);

const integracaoClientPolicy = createModulePolicy("integracao", moduleAccessPermission);
/** Mutações do cadastro de clientes exigem edição; o client-service ainda cobra 3 para desativar. */
const integracaoClientEditPolicy = createModulePolicy("integracao", moduleEditPermission);

const clientListPolicy: AuthPolicy = {
  anyOf: [
    { minPermission: moduleAccessPermission },
    {
      anyModulePermission: {
        modules: [...clientRelatedModules, "integracao"],
        minPermission: moduleAccessPermission,
      },
    },
  ],
};

const integracaoClientPath =
  /^\/client(?:\/list|\/integration|\/[^/]+\/integration|\/[^/]+\/activate|\/groups(?:\/[^/]+(?:\/clients)?)?|\/regimes(?:\/[^/]+)?|\/segments(?:\/[^/]+)?|\/[^/]+)?\/?$/;

const exactRoutePolicies = new Map<string, AuthPolicy>([
  ["GET /dashboard/stats", authenticatedPolicy],
  ["GET /client/list", clientListPolicy],
  ["GET /client/coringa/list", clientListPolicy],
  ["GET /client/coringa/pdf", clientListPolicy],
  // Ficha e Regularize leem o catálogo; criar e renomear seguem exigindo Integração.
  ["GET /client/regimes", clientListPolicy],
  ["GET /client/segments", clientListPolicy],
  ["GET /user/me", authenticatedPolicy],
  ["GET /rh/notifications", rhModulePolicy],
  ["PUT /rh/notifications/read", rhModulePolicy],
  ["POST /rh/requests", rhModulePolicy],
  ["POST /rh/messages", rhModulePolicy],
  ["POST /user/session/refresh", authenticatedPolicy],
  ["DELETE /user/session", authenticatedPolicy],
  ["GET /user", userManagementPolicy],
  ["GET /rh/operational-users", operationalUsersCatalogPolicy],
  ["POST /user", userManagementPolicy],
  ["POST /platform/session/refresh", platformOnlyPolicy],
  ["DELETE /platform/session", platformOnlyPolicy],
  ["POST /platform/impersonation/exit", { special: "impersonationOnly" }],
  ["GET /platform/me", platformOnlyPolicy],
  ["GET /platform/super-admins", platformOnlyPolicy],
  ["GET /platform/organizations", platformOnlyPolicy],
  ["POST /platform/organizations", platformOnlyPolicy],
  ["GET /platform/audit/requests", platformOnlyPolicy],
]);

const routePolicyMatchers: Array<{
  method: string;
  path: RegExp;
  policy: AuthPolicy;
}> = [
  { method: "GET", path: integracaoClientPath, policy: integracaoClientPolicy },
  { method: "ANY", path: integracaoClientPath, policy: integracaoClientEditPolicy },
  { method: "GET", path: /^\/client(?:\/|$)/, policy: clientModulePolicy },
  { method: "ANY", path: /^\/client(?:\/|$)/, policy: clientEditPolicy },
  { method: "GET", path: /^\/project(?:\/|$)/, policy: integracaoProjectPolicy },
  { method: "ANY", path: /^\/project(?:\/|$)/, policy: integracaoEditPolicy },
  { method: "GET", path: /^\/parcelamento(?:\/|$)/, policy: parcelamentoModulePolicy },
  { method: "ANY", path: /^\/parcelamento(?:\/|$)/, policy: parcelamentoEditPolicy },
  { method: "ANY", path: /^\/reports(?:\/|$)/, policy: authenticatedPolicy },
  { method: "GET", path: /^\/marketing(?:\/|$)/, policy: marketingModulePolicy },
  { method: "ANY", path: /^\/marketing(?:\/|$)/, policy: marketingEditPolicy },
  { method: "GET", path: /^\/commercial(?:\/|$)/, policy: commercialModulePolicy },
  { method: "ANY", path: /^\/commercial(?:\/|$)/, policy: commercialEditPolicy },
  { method: "GET", path: /^\/marketing(?:\/|$)/, policy: marketingModulePolicy },
  { method: "ANY", path: /^\/marketing(?:\/|$)/, policy: marketingEditPolicy },
  { method: "GET", path: /^\/pessoal(?:\/|$)/, policy: pessoalModulePolicy },
  { method: "ANY", path: /^\/pessoal(?:\/|$)/, policy: pessoalEditPolicy },
  { method: "ANY", path: /^\/rh\/profile(?:\/|$)/, policy: rhModulePolicy },
  {
    method: "POST",
    path: /^\/rh\/point\/adjustment\/request$/,
    policy: rhModulePolicy,
  },
  {
    method: "POST",
    path: /^\/rh\/point\/adjustment\/[^/]+\/attachment$/,
    policy: rhModulePolicy,
  },
  {
    method: "POST",
    path: /^\/rh\/point\/recalculate$/,
    policy: rhManagementPolicy,
  },
  {
    method: "POST",
    path: /^\/rh\/point\/adjustment\/retroactive$/,
    policy: rhManagementPolicy,
  },
  {
    method: "PUT",
    path: /^\/rh\/timesheets\/reopen$/,
    policy: rhManagementPolicy,
  },
  {
    method: "PUT",
    path: /^\/rh\/timesheets\/rebuild$/,
    policy: rhManagementPolicy,
  },
  {
    method: "GET",
    path: /^\/rh\/timesheets\/[^/]+\/pdf$/,
    policy: rhModulePolicy,
  },
  { method: "POST", path: /^\/rh\/point\/register$/, policy: rhModulePolicy },
  { method: "PUT", path: /^\/rh\/timesheets\/sign$/, policy: rhModulePolicy },
  {
    method: "POST",
    path: /^\/rh\/point\/[^/]+\/calculate$/,
    policy: rhManagementPolicy,
  },
  { method: "POST", path: /^\/rh\/timesheets\/?$/, policy: rhManagementPolicy },
  { method: "GET", path: /^\/rh(?:\/|$)/, policy: rhModulePolicy },
  { method: "ANY", path: /^\/rh(?:\/|$)/, policy: rhEditPolicy },
  { method: "GET", path: /^\/user\/permission\/[^/]+$/, policy: userManagementPolicy },
  { method: "PUT", path: /^\/user\/permission\/[^/]+$/, policy: { special: "ownerOnly" } },
  {
    method: "POST",
    path: /^\/platform\/organizations\/[^/]+\/users\/?$/,
    policy: platformOnlyPolicy,
  },
  {
    method: "POST",
    path: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/impersonate\/?$/,
    policy: platformOnlyPolicy,
  },
  {
    method: "PATCH",
    path: /^\/platform\/super-admins\/[^/]+\/impersonation-permission\/?$/,
    policy: platformOnlyPolicy,
  },
  {
    method: "GET",
    path: /^\/user\/(?!me$|session$|start-config$|permission\/)[^/]+$/,
    policy: userManagementPolicy,
  },
  {
    method: "PUT",
    path: /^\/user\/(?!me$|session$|start-config$|permission\/)[^/]+$/,
    policy: userManagementPolicy,
  },
  {
    method: "DELETE",
    path: /^\/user\/(?!me$|session$|start-config$|permission\/)[^/]+$/,
    policy: userManagementPolicy,
  },
  { method: "GET", path: /^\/user\/[^/]+\/photo$/, policy: userManagementPolicy },
  { method: "POST", path: /^\/user\/[^/]+\/photo$/, policy: userManagementPolicy },
  { method: "POST", path: /^\/user\/[^/]+\/password-reset$/, policy: userManagementPolicy },
  { method: "DELETE", path: /^\/user\/[^/]+\/photo$/, policy: userManagementPolicy },
  { method: "GET", path: /^\/task\/financeiro\/queue$/, policy: financeiroTaskViewPolicy },
  {
    method: "GET",
    path: /^\/task\/financeiro\/collectors$/,
    policy: financeiroTaskAdminPolicy,
  },
  { method: "PUT", path: /^\/task\/financeiro$/, policy: financeiroTaskViewPolicy },
  {
    method: "PUT",
    path: /^\/task\/financeiro\/collectors$/,
    policy: financeiroTaskAdminPolicy,
  },
  {
    method: "POST",
    path: /^\/task\/financeiro\/(?:settle|express)$/,
    policy: financeiroTaskViewPolicy,
  },
  {
    method: "ANY",
    path: /^\/task\/notifications(?:\/read)?$/,
    policy: integracaoNotificationPolicy,
  },
  {
    method: "ANY",
    path: /^\/task\/(?:complete-request(?:\/list)?|postponement(?:\/list)?|attachment(?:\/list|\/access)?|conclusion)$/,
    policy: integracaoResponsibleTaskPolicy,
  },
  { method: "GET", path: /^\/task(?:\/list)?$/, policy: integracaoResponsibleTaskPolicy },
  { method: "GET", path: /^\/task(?:\/|$)/, policy: integracaoProjectPolicy },
  { method: "ANY", path: /^\/task(?:\/|$)/, policy: integracaoEditPolicy },
  { method: "GET", path: /^\/department(?:\/|$)/, policy: tiModulePolicy },
  { method: "ANY", path: /^\/department(?:\/|$)/, policy: tiEditPolicy },
  { method: "GET", path: /^\/regularize(?:\/|$)/, policy: regularizeModulePolicy },
  { method: "ANY", path: /^\/regularize(?:\/|$)/, policy: regularizeEditPolicy },
  { method: "GET", path: /^\/fiscal(?:\/|$)/, policy: fiscalModulePolicy },
  { method: "ANY", path: /^\/fiscal(?:\/|$)/, policy: fiscalEditPolicy },
  { method: "GET", path: /^\/contabil(?:\/|$)/, policy: contabilModulePolicy },
  { method: "ANY", path: /^\/contabil(?:\/|$)/, policy: contabilEditPolicy },
  { method: "GET", path: /^\/triagem(?:\/|$)/, policy: triagemModulePolicy },
  { method: "ANY", path: /^\/triagem(?:\/|$)/, policy: triagemEditPolicy },
  { method: "GET", path: /^\/ti(?:\/|$)/, policy: tiModulePolicy },
  { method: "ANY", path: /^\/ti(?:\/|$)/, policy: tiEditPolicy },
  { method: "GET", path: /^\/certificate(?:\/|$)/, policy: certificateModulePolicy },
  { method: "ANY", path: /^\/certificate(?:\/|$)/, policy: certificateEditPolicy },
  { method: "ANY", path: /^\/organizations(?:\/|$)/, policy: authenticatedPolicy },
  { method: "ANY", path: /^\/audit(?:\/|$)/, policy: authenticatedPolicy },
  {
    method: "GET",
    path: /^\/platform\/organizations\/[^/]+\/(?:users(?:\/[^/]+(?:\/permissions)?)?|departments)\/?$/,
    policy: platformOnlyPolicy,
  },
  {
    method: "PUT",
    path: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/permissions\/?$/,
    policy: platformOnlyPolicy,
  },
  {
    method: "DELETE",
    path: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/?$/,
    policy: platformOnlyPolicy,
  },
  {
    method: "PATCH",
    path: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/?$/,
    policy: platformOnlyPolicy,
  },
  {
    method: "POST",
    path: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/(?:reactivate|password-reset)\/?$/,
    policy: platformOnlyPolicy,
  },
  {
    method: "POST",
    path: /^\/platform\/organizations\/[^/]+\/ownership-transfer\/?$/,
    policy: platformOnlyPolicy,
  },
  {
    method: "GET",
    path: /^\/platform\/organizations\/[^/]+\/?$/,
    policy: platformOnlyPolicy,
  },
  {
    method: "PATCH",
    path: /^\/platform\/organizations\/[^/]+\/(?:status|subscription-plan|logo-url)\/?$/,
    policy: platformOnlyPolicy,
  },
];

export function getRoutePolicy(method: string, path: string): AuthPolicy | null {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.toLowerCase();
  const exactKey = `${normalizedMethod} ${normalizedPath}`;
  const exactPolicy = exactRoutePolicies.get(exactKey);
  if (exactPolicy) {
    return exactPolicy;
  }

  const matchedPolicy = routePolicyMatchers.find(
    (matcher) =>
      (matcher.method === "ANY" || matcher.method === normalizedMethod) &&
      matcher.path.test(normalizedPath),
  );

  return matchedPolicy?.policy ?? null;
}
