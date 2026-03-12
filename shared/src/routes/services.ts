const SERVICE_DEFAULTS = {
  organizationServiceUrl: "http://localhost:3400",
} as const;

export interface ServiceUrls {
  organizationServiceUrl: string;
}

export function getServiceUrls(): ServiceUrls {
  return {
    organizationServiceUrl:
      process.env.ORGANIZATION_SERVICE_URL || SERVICE_DEFAULTS.organizationServiceUrl,
  };
}
