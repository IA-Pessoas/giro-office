import type { GatewayEnv } from "./env.js";

const ORGANIZATION_SERVICE_PREFIXES = ["/organizations"] as const;

const RH_SERVICE_PREFIXES = ["/rh"] as const;

const USER_SERVICE_PREFIXES = ["/user"] as const;

const DEPARTMENT_SERVICE_PREFIXES = ["/department"] as const;

const TASK_SERVICE_PREFIXES = ["/task"] as const;

const PROJECT_SERVICE_PREFIXES = ["/project"] as const;

const CLIENT_SERVICE_PREFIXES = ["/client"] as const;

const REGULARIZE_SERVICE_PREFIXES = ["/regularize"] as const;

const FISCAL_SERVICE_PREFIXES = ["/fiscal"] as const;

const CONTABIL_SERVICE_PREFIXES = ["/contabil"] as const;

const TI_SERVICE_PREFIXES = ["/ti"] as const;

const CERTIFICATE_SERVICE_PREFIXES = ["/certificate"] as const;

const PESSOAL_SERVICE_PREFIXES = ["/pessoal"] as const;

function getNormalizedPath(path: string): string {
  try {
    return new URL(path, "http://localhost").pathname;
  } catch {
    return path;
  }
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export interface GatewayServiceDefinition {
  key: string;
  targetUrl: string;
  auditTarget: string;
  routePrefixes: string[];
  internalServiceToken?: string;
  permissionModule?: string;
}

function buildOrganizationServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "organization-service",
    targetUrl: env.organizationServiceUrl,
    auditTarget: "organization-service",
    routePrefixes: [...ORGANIZATION_SERVICE_PREFIXES],
  };
}

function buildRhServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "rh-service",
    targetUrl: env.rhServiceUrl,
    auditTarget: "rh-service",
    routePrefixes: [...RH_SERVICE_PREFIXES],
  };
}

function buildUserServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "user-service",
    targetUrl: env.userServiceUrl,
    auditTarget: "user-service",
    routePrefixes: [...USER_SERVICE_PREFIXES],
  };
}

function buildDepartmentServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "department-service",
    targetUrl: env.departmentServiceUrl,
    auditTarget: "department-service",
    routePrefixes: [...DEPARTMENT_SERVICE_PREFIXES],
  };
}

function buildTaskServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "task-service",
    targetUrl: env.taskServiceUrl,
    auditTarget: "task-service",
    routePrefixes: [...TASK_SERVICE_PREFIXES],
  };
}

function buildProjectServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "project-service",
    targetUrl: env.projectServiceUrl,
    auditTarget: "project-service",
    routePrefixes: [...PROJECT_SERVICE_PREFIXES],
  };
}

function buildClientServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "client-service",
    targetUrl: env.clientServiceUrl,
    auditTarget: "client-service",
    routePrefixes: [...CLIENT_SERVICE_PREFIXES],
  };
}

function buildRegularizeServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "regularize-service",
    targetUrl: env.regularizeServiceUrl,
    auditTarget: "regularize-service",
    routePrefixes: [...REGULARIZE_SERVICE_PREFIXES],
  };
}

function buildFiscalServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "fiscal-service",
    targetUrl: env.fiscalServiceUrl,
    auditTarget: "fiscal-service",
    routePrefixes: [...FISCAL_SERVICE_PREFIXES],
  };
}

function buildContabilServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "contabil-service",
    targetUrl: env.contabilServiceUrl,
    auditTarget: "contabil-service",
    routePrefixes: [...CONTABIL_SERVICE_PREFIXES],
  };
}

function buildTiServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "ti-service",
    targetUrl: env.tiServiceUrl,
    auditTarget: "ti-service",
    routePrefixes: [...TI_SERVICE_PREFIXES],
    internalServiceToken: env.tiServiceInternalToken,
    permissionModule: "ti",
  };
}

function buildCertificateServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "certificate-service",
    targetUrl: env.certificateServiceUrl,
    auditTarget: "certificate-service",
    routePrefixes: [...CERTIFICATE_SERVICE_PREFIXES],
    internalServiceToken: env.certificateServiceInternalToken,
    permissionModule: "certificado",
  };
}

function buildPessoalServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "pessoal-service",
    targetUrl: env.pessoalServiceUrl,
    auditTarget: "pessoal-service",
    routePrefixes: [...PESSOAL_SERVICE_PREFIXES],
    permissionModule: "pessoal",
  };
}

function buildAuditServiceDefinition(env: GatewayEnv): GatewayServiceDefinition {
  return {
    key: "audit-service",
    targetUrl: env.auditServiceUrl,
    auditTarget: "audit-service",
    routePrefixes: ["/audit"],
    internalServiceToken: env.auditServiceToken,
  };
}

export function getGatewayServiceDefinitions(env: GatewayEnv): GatewayServiceDefinition[] {
  return [
    buildOrganizationServiceDefinition(env),
    buildRhServiceDefinition(env),
    buildUserServiceDefinition(env),
    buildDepartmentServiceDefinition(env),
    buildTaskServiceDefinition(env),
    buildProjectServiceDefinition(env),
    buildClientServiceDefinition(env),
    buildRegularizeServiceDefinition(env),
    buildFiscalServiceDefinition(env),
    buildContabilServiceDefinition(env),
    buildTiServiceDefinition(env),
    buildCertificateServiceDefinition(env),
    buildPessoalServiceDefinition(env),
  ];
}

function resolvePlatformService(
  env: GatewayEnv,
  normalizedPath: string,
): GatewayServiceDefinition | null {
  if (normalizedPath === "/platform/session") {
    return buildUserServiceDefinition(env);
  }

  if (normalizedPath === "/platform/me") {
    return buildUserServiceDefinition(env);
  }

  if (normalizedPath.startsWith("/platform/support-sessions")) {
    return buildUserServiceDefinition(env);
  }

  if (/^\/platform\/organizations\/[^/]+\/users(?:\/|$)/.test(normalizedPath)) {
    return buildUserServiceDefinition(env);
  }

  if (
    normalizedPath === "/platform/organizations" ||
    normalizedPath.startsWith("/platform/organizations/")
  ) {
    return buildOrganizationServiceDefinition(env);
  }

  if (
    env.auditEnabled &&
    (normalizedPath === "/platform/audit" || normalizedPath.startsWith("/platform/audit/"))
  ) {
    return buildAuditServiceDefinition(env);
  }

  return null;
}

export function resolveGatewayService(
  env: GatewayEnv,
  path: string,
): GatewayServiceDefinition | null {
  const normalizedPath = getNormalizedPath(path);
  const platformService = resolvePlatformService(env, normalizedPath);

  if (platformService) {
    return platformService;
  }

  return (
    getGatewayServiceDefinitions(env).find((service) =>
      service.routePrefixes.some((prefix) => matchesPrefix(normalizedPath, prefix)),
    ) ?? null
  );
}
