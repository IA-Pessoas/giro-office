import type { GatewayEnv } from "./env.js";
import {
  isProjectServiceRoute,
  isTaskServiceRoute,
  isUserServiceRoute,
} from "../utils/routeUtils.js";

export interface GatewayServiceDefinition {
  key: string;
  targetUrl: string;
  auditTarget: string;
  mountPrefix?: string;
  matches: (path: string) => boolean;
}

function getNormalizedPath(path: string): string {
  try {
    return new URL(path, "http://localhost").pathname;
  } catch {
    return path;
  }
}

export function getGatewayServiceDefinitions(env: GatewayEnv): GatewayServiceDefinition[] {
  return [
    {
      key: "organization-service",
      targetUrl: env.organizationServiceUrl,
      auditTarget: "organization-service",
      mountPrefix: "/organizations",
      matches: (path) => path === "/organizations" || path.startsWith("/organizations/"),
    },
    {
      key: "rh-service",
      targetUrl: env.rhServiceUrl,
      auditTarget: "rh-service",
      mountPrefix: "/rh",
      matches: (path) => path === "/rh" || path.startsWith("/rh/"),
    },
    {
      key: "user-service",
      targetUrl: env.userServiceUrl,
      auditTarget: "user-service",
      matches: isUserServiceRoute,
    },
    {
      key: "task-service",
      targetUrl: env.taskServiceUrl,
      auditTarget: "task-service",
      matches: isTaskServiceRoute,
    },
    {
      key: "project-service",
      targetUrl: env.projectServiceUrl,
      auditTarget: "project-service",
      matches: isProjectServiceRoute,
    },
  ];
}

export function resolveGatewayService(
  env: GatewayEnv,
  path: string,
): GatewayServiceDefinition | null {
  const normalizedPath = getNormalizedPath(path);
  return (
    getGatewayServiceDefinitions(env).find((service) => service.matches(normalizedPath)) ?? null
  );
}
