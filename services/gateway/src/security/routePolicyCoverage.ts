import type { GatewayEnv } from "../config/env.js";
import { buildGatewayOpenApiSpec } from "../openapi/gatewaySpec.js";
import { getRoutePolicy } from "./policies.js";
import { isPublicRoute } from "./publicRoutes.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export interface GatewayOperation {
  method: string;
  path: string;
}

function materializeOpenApiPath(path: string): string {
  return path.replace(/\{[^{}]+\}/g, "route-policy-parameter");
}

export function getGatewayOperationInventory(env: GatewayEnv): GatewayOperation[] {
  const spec = buildGatewayOpenApiSpec(env);
  const operations: GatewayOperation[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const pathOperations = pathItem as Record<string, unknown>;

    for (const method of HTTP_METHODS) {
      if (pathOperations[method]) {
        operations.push({ method: method.toUpperCase(), path });
      }
    }
  }

  return operations;
}

export function getUnclassifiedGatewayOperations(env: GatewayEnv): GatewayOperation[] {
  return getGatewayOperationInventory(env).filter(({ method, path }) => {
    const materializedPath = materializeOpenApiPath(path);
    return !isPublicRoute(method, materializedPath) && !getRoutePolicy(method, materializedPath);
  });
}
