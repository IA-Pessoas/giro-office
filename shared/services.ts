export interface ServiceDefinition {
  name: string;
  defaultPort: number;
  envVar: string;
  defaultUrl: string;
}

export const SERVICES = {
  gateway: {
    name: "gateway",
    defaultPort: 3334,
    envVar: "GATEWAY_URL",
    defaultUrl: "http://localhost:3334",
  },
  legacyApi: {
    name: "legacy-api",
    defaultPort: 3333,
    envVar: "LEGACY_API_URL",
    defaultUrl: "http://localhost:3333",
  },
  userService: {
    name: "user-service",
    defaultPort: 3335,
    envVar: "USER_SERVICE_URL",
    defaultUrl: "http://localhost:3335",
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
