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
const tiModulePolicy = createModulePolicy("ti", moduleAccessPermission);
const tiEditPolicy = createModulePolicy("ti", moduleEditPermission);
const integracaoEditPolicy = createModulePolicy("integracao", moduleEditPermission);
const regularizeModulePolicy = createModulePolicy("regularize", moduleAccessPermission);
const regularizeEditPolicy = createModulePolicy("regularize", moduleEditPermission);
const fiscalModulePolicy = createModulePolicy("fiscal", moduleAccessPermission);
const fiscalEditPolicy = createModulePolicy("fiscal", moduleEditPermission);
const contabilModulePolicy = createModulePolicy("contabil", moduleAccessPermission);
const contabilEditPolicy = createModulePolicy("contabil", moduleEditPermission);
const certificateModulePolicy = createModulePolicy("certificado", moduleAccessPermission);
const certificateEditPolicy = createModulePolicy("certificado", moduleEditPermission);

const operationalUsersCatalogPolicy: AuthPolicy = {
  anyModulePermission: {
    modules: ["rh", "contabil"],
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

const integracaoClientPolicy: AuthPolicy = {
  modulePermission: {
    module: "integracao",
    minPermission: moduleAccessPermission,
  },
};

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
  /^\/client(?:\/list|\/integration|\/[^/]+\/integration|\/[^/]+\/activate|\/[^/]+)?\/?$/;

const exactRoutePolicies = new Map<string, AuthPolicy>([
  ["GET /dashboard/stats", authenticatedPolicy],
  ["GET /client/list", clientListPolicy],
  ["GET /user/me", authenticatedPolicy],
  ["POST /user/session/refresh", authenticatedPolicy],
  ["DELETE /user/session", authenticatedPolicy],
  ["GET /user", userManagementPolicy],
  ["GET /rh/operational-users", operationalUsersCatalogPolicy],
  ["POST /user", userManagementPolicy],
  ["POST /platform/session/refresh", platformOnlyPolicy],
  ["DELETE /platform/session", platformOnlyPolicy],
  ["GET /platform/me", platformOnlyPolicy],
  ["GET /platform/organizations", platformOnlyPolicy],
  ["POST /platform/organizations", platformOnlyPolicy],
  ["GET /platform/audit/requests", platformOnlyPolicy],
]);

const routePolicyMatchers: Array<{
  method: string;
  path: RegExp;
  policy: AuthPolicy;
}> = [
  { method: "ANY", path: integracaoClientPath, policy: integracaoClientPolicy },
  { method: "GET", path: /^\/client(?:\/|$)/, policy: clientModulePolicy },
  { method: "ANY", path: /^\/client(?:\/|$)/, policy: clientEditPolicy },
  { method: "GET", path: /^\/project(?:\/|$)/, policy: integracaoProjectPolicy },
  { method: "ANY", path: /^\/project(?:\/|$)/, policy: integracaoEditPolicy },
  { method: "GET", path: /^\/parcelamento(?:\/|$)/, policy: parcelamentoModulePolicy },
  { method: "ANY", path: /^\/parcelamento(?:\/|$)/, policy: parcelamentoEditPolicy },
  { method: "ANY", path: /^\/reports(?:\/|$)/, policy: authenticatedPolicy },
  { method: "GET", path: /^\/pessoal(?:\/|$)/, policy: pessoalModulePolicy },
  { method: "ANY", path: /^\/pessoal(?:\/|$)/, policy: pessoalEditPolicy },
  { method: "GET", path: /^\/rh(?:\/|$)/, policy: rhModulePolicy },
  { method: "ANY", path: /^\/rh(?:\/|$)/, policy: rhEditPolicy },
  { method: "GET", path: /^\/user\/permission\/[^/]+$/, policy: userManagementPolicy },
  { method: "PUT", path: /^\/user\/permission\/[^/]+$/, policy: { special: "ownerOnly" } },
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
  { method: "DELETE", path: /^\/user\/[^/]+\/photo$/, policy: userManagementPolicy },
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
  { method: "GET", path: /^\/ti(?:\/|$)/, policy: tiModulePolicy },
  { method: "ANY", path: /^\/ti(?:\/|$)/, policy: tiEditPolicy },
  { method: "GET", path: /^\/certificate(?:\/|$)/, policy: certificateModulePolicy },
  { method: "ANY", path: /^\/certificate(?:\/|$)/, policy: certificateEditPolicy },
  { method: "ANY", path: /^\/organizations(?:\/|$)/, policy: authenticatedPolicy },
  { method: "ANY", path: /^\/audit(?:\/|$)/, policy: authenticatedPolicy },
  {
    method: "GET",
    path: /^\/platform\/organizations\/[^/]+\/(?:users(?:\/[^/]+)?|departments)\/?$/,
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
