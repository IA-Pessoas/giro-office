import type { GatewayEnv } from "./env.js";

const USER_SERVICE_PREFIXES = [
  "/session",
  "/start-config",
  "/me",
  "/users",
  "/permission",
  "/permission-specific",
  "/permission-integracao",
] as const;

const TASK_SERVICE_PREFIXES = [
  "/integracao-tasksModel",
  "/integracao-taskModel",
  "/integracao-tasksModel-dependent",
  "/integracao-taskModel-dependent",
  "/integracao-tasksIntegration",
  "/integracao-tasks",
  "/integracao-tasks-conclusion",
  "/integracao-tasks-completeRequest",
  "/integracao-task",
  "/comercial-tasks",
  "/financeiro-tasks",
] as const;

const PROJECT_SERVICE_PREFIXES = [
  "/integracao-projects",
  "/integracao-project",
  "/integracao-project-progress",
] as const;

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
      routePrefixes: ["/organizations"],
    },
    {
      key: "rh-service",
      targetUrl: env.rhServiceUrl,
      auditTarget: "rh-service",
      routePrefixes: ["/rh"],
    },
    {
      key: "user-service",
      targetUrl: env.userServiceUrl,
      auditTarget: "user-service",
      routePrefixes: [...USER_SERVICE_PREFIXES],
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
