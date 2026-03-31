const SERVICE_DEFAULTS = {
  organizationServiceUrl: "http://localhost:3400",
  rhServiceUrl: "http://localhost:3339",
  clientServiceUrl: "http://localhost:3410",
} as const;

export interface ServiceUrls {
  organizationServiceUrl: string;
  rhServiceUrl: string;
  clientServiceUrl: string;
}

export function getServiceUrls(): ServiceUrls {
  return {
    organizationServiceUrl:
      process.env.ORGANIZATION_SERVICE_URL || SERVICE_DEFAULTS.organizationServiceUrl,
    rhServiceUrl: process.env.RH_SERVICE_URL || SERVICE_DEFAULTS.rhServiceUrl,
    clientServiceUrl: process.env.CLIENT_SERVICE_URL || SERVICE_DEFAULTS.clientServiceUrl,
  };
}
