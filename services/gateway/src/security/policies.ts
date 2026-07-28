import type { AuthPolicy } from "@workspace/shared";

const userManagementPolicy: AuthPolicy = { special: "manageUsers" };
const moduleAccessPermission = 1;

const rhModulePolicy: AuthPolicy = {
  modulePermission: {
    module: "rh",
    minPermission: moduleAccessPermission,
  },
};

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

const clientRelatedModules = [
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "pessoal",
  "regularize",
] as const;

const clientModulePolicy: AuthPolicy = {
  anyModulePermission: {
    modules: [...clientRelatedModules],
    minPermission: moduleAccessPermission,
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

const integracaoClientPath =
  /^\/client(?:\/list|\/integration|\/[^/]+\/integration|\/[^/]+\/activate|\/[^/]+)?\/?$/;

const exactRoutePolicies = new Map<string, AuthPolicy>([
  ["GET /user", userManagementPolicy],
  ["GET /client/list", integracaoClientPolicy],
  ["GET /rh/operational-users", operationalUsersCatalogPolicy],
  ["POST /user", userManagementPolicy],
]);

const routePolicyMatchers: Array<{
  method: string;
  path: RegExp;
  policy: AuthPolicy;
}> = [
  { method: "ANY", path: integracaoClientPath, policy: integracaoClientPolicy },
  { method: "ANY", path: /^\/client(?:\/|$)/, policy: clientModulePolicy },
  { method: "ANY", path: /^\/project(?:\/|$)/, policy: integracaoProjectPolicy },
  { method: "ANY", path: /^\/pessoal(?:\/|$)/, policy: pessoalModulePolicy },
  { method: "ANY", path: /^\/rh(?:\/|$)/, policy: rhModulePolicy },
  { method: "GET", path: /^\/user\/permission\/[^/]+$/, policy: userManagementPolicy },
  { method: "PUT", path: /^\/user\/permission\/[^/]+$/, policy: { special: "ownerOnly" } },
  {
    method: "GET",
    path: /^\/user\/(?!me$|session$|start-config$|permission\/)[^/]+$/,
    policy: userManagementPolicy,
  },
  {
    method: "PATCH",
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
];

export function getRoutePolicy(method: string, path: string): AuthPolicy | null {
  const normalizedMethod = method.toUpperCase();
  const exactKey = `${normalizedMethod} ${path}`;
  const exactPolicy = exactRoutePolicies.get(exactKey);
  if (exactPolicy) {
    return exactPolicy;
  }

  const matchedPolicy = routePolicyMatchers.find(
    (matcher) =>
      (matcher.method === "ANY" || matcher.method === normalizedMethod) && matcher.path.test(path),
  );

  return matchedPolicy?.policy ?? null;
}
