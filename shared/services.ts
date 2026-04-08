export interface ServiceDefinition {
  name: string;
  defaultPort: number;
  envVar: string;
  defaultUrl: string;
}

export const SERVICES = {
  gateway: {
    name: "gateway",
    defaultPort: 3010,
    envVar: "GATEWAY_URL",
    defaultUrl: "http://localhost:3010",
  },
  userService: {
    name: "user-service",
    defaultPort: 3030,
    envVar: "USER_SERVICE_URL",
    defaultUrl: "http://localhost:3030",
  },
} as const satisfies Record<string, ServiceDefinition>;

export type ServiceName = keyof typeof SERVICES;

export function getServiceUrl(service: ServiceName): string {
  const def = SERVICES[service];
  return process.env[def.envVar] ?? def.defaultUrl;
}

export function getServicePort(service: ServiceName): number {
  const def = SERVICES[service];
  const portEnv = process.env[`${def.envVar.replace("_URL", "")}_PORT`];
  if (portEnv) {
    const parsed = Number.parseInt(portEnv, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return def.defaultPort;
}
