import type { GatewayEnv } from "./env.js";

const ORGANIZATION_SERVICE_PREFIXES = ["/organizations"] as const;

const RH_SERVICE_PREFIXES = ["/rh"] as const;

const USER_SERVICE_PREFIXES = ["/user"] as const;

const DEPARTMENT_SERVICE_PREFIXES = ["/department"] as const;

const TASK_SERVICE_PREFIXES = ["/task"] as const;

const PROJECT_SERVICE_PREFIXES = ["/project"] as const;

const CLIENT_SERVICE_PREFIXES = ["/client"] as const;

const FISCAL_SERVICE_PREFIXES = ["/fiscal"] as const;

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
}

export function getGatewayServiceDefinitions(env: GatewayEnv): GatewayServiceDefinition[] {
  return [
    {
      key: "organization-service",
      targetUrl: env.organizationServiceUrl,
      auditTarget: "organization-service",
      routePrefixes: [...ORGANIZATION_SERVICE_PREFIXES],
    },
    {
      key: "rh-service",
      targetUrl: env.rhServiceUrl,
      auditTarget: "rh-service",
      routePrefixes: [...RH_SERVICE_PREFIXES],
    },
    {
      key: "user-service",
      targetUrl: env.userServiceUrl,
      auditTarget: "user-service",
      routePrefixes: [...USER_SERVICE_PREFIXES],
    },
    {
      key: "department-service",
      targetUrl: env.departmentServiceUrl,
      auditTarget: "department-service",
      routePrefixes: [...DEPARTMENT_SERVICE_PREFIXES],
    },
    {
      key: "task-service",
      targetUrl: env.taskServiceUrl,
      auditTarget: "task-service",
      routePrefixes: [...TASK_SERVICE_PREFIXES],
    },
    {
      key: "project-service",
      targetUrl: env.projectServiceUrl,
      auditTarget: "project-service",
      routePrefixes: [...PROJECT_SERVICE_PREFIXES],
    },
    {
      key: "client-service",
      targetUrl: env.clientServiceUrl,
      auditTarget: "client-service",
      routePrefixes: [...CLIENT_SERVICE_PREFIXES],
    },
    {
      key: "fiscal-service",
      targetUrl: env.fiscalServiceUrl,
      auditTarget: "fiscal-service",
      routePrefixes: [...FISCAL_SERVICE_PREFIXES],
    },
  ];
}

export function resolveGatewayService(
  env: GatewayEnv,
  path: string,
): GatewayServiceDefinition | null {
  const normalizedPath = getNormalizedPath(path);

  return (
    getGatewayServiceDefinitions(env).find((service) =>
      service.routePrefixes.some((prefix) => matchesPrefix(normalizedPath, prefix)),
    ) ?? null
  );
}
