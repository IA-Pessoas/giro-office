const SERVICE_DEFAULTS = {
  organizationServiceUrl: "http://localhost:3400",
  rhServiceUrl: "http://localhost:3339",
} as const;

export interface ServiceUrls {
  organizationServiceUrl: string;
  rhServiceUrl: string;
}

export function getServiceUrls(): ServiceUrls {
  return {
    organizationServiceUrl:
      process.env.ORGANIZATION_SERVICE_URL || SERVICE_DEFAULTS.organizationServiceUrl,
    rhServiceUrl: process.env.RH_SERVICE_URL || SERVICE_DEFAULTS.rhServiceUrl,
  };
}
