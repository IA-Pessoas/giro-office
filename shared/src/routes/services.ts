/** Defaults aligned with gateway `GatewayEnv` (organization, client, rh URLs). */
const SERVICE_DEFAULTS = {
  organizationServiceUrl: "http://localhost:3400",
  rhServiceUrl: "http://localhost:3339",
  clientServiceUrl: "http://localhost:3410",
  regularizeServiceUrl: "http://localhost:3411",
} as const;

export interface ServiceUrls {
  organizationServiceUrl: string;
  rhServiceUrl: string;
  clientServiceUrl: string;
  regularizeServiceUrl: string;
}

export function getServiceUrls(): ServiceUrls {
  return {
    organizationServiceUrl:
      process.env.ORGANIZATION_SERVICE_URL || SERVICE_DEFAULTS.organizationServiceUrl,
    rhServiceUrl: process.env.RH_SERVICE_URL || SERVICE_DEFAULTS.rhServiceUrl,
    clientServiceUrl: process.env.CLIENT_SERVICE_URL || SERVICE_DEFAULTS.clientServiceUrl,
    regularizeServiceUrl:
      process.env.REGULARIZE_SERVICE_URL || SERVICE_DEFAULTS.regularizeServiceUrl,
  };
}
