import { normalizeGatewayPath } from "../security/routeClassification.js";
import type { GatewayEnv } from "./env.js";

const ORGANIZATION_SERVICE_PREFIXES = ["/organizations"] as const;

const RH_SERVICE_PREFIXES = ["/rh"] as const;

const USER_SERVICE_PREFIXES = ["/user"] as const;

const DEPARTMENT_SERVICE_PREFIXES = ["/department"] as const;

const TASK_SERVICE_PREFIXES = ["/task"] as const;

const PROJECT_SERVICE_PREFIXES = ["/project"] as const;

const CLIENT_SERVICE_PREFIXES = ["/client"] as const;

const REGULARIZE_SERVICE_PREFIXES = ["/regularize"] as const;

const FISCAL_SERVICE_PREFIXES = ["/fiscal"] as const;

const CONTABIL_SERVICE_PREFIXES = ["/contabil"] as const;

const TI_SERVICE_PREFIXES = ["/ti"] as const;

const CERTIFICATE_SERVICE_PREFIXES = ["/certificate"] as const;

const PESSOAL_SERVICE_PREFIXES = ["/pessoal"] as const;

const PARCELAMENTO_SERVICE_PREFIXES = ["/parcelamento"] as const;

const REPORTS_SERVICE_PREFIXES = ["/reports"] as const;

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export interface GatewayServiceDefinition {
  key: string;
  targetUrl: string;
  auditTarget: string;
  routePrefixes: string[];
  internalServiceToken?: string;
  permissionModule?: string;
  forwardSessionBinding?: boolean;
  forwardPlatformSessionCredentials?: boolean;
  stripPathPrefix?: string;
  routeMatchers?: Array<{ methods: string[]; path: RegExp }>;
}

export function getGatewayServiceDefinitions(env: GatewayEnv): GatewayServiceDefinition[] {
  return [
    {
      key: "organization-service",
      targetUrl: env.organizationServiceUrl,
      auditTarget: "organization-service",
      routePrefixes: [...ORGANIZATION_SERVICE_PREFIXES],
      internalServiceToken: env.auditServiceToken,
      forwardPlatformSessionCredentials: true,
      routeMatchers: [
        { methods: ["GET", "POST"], path: /^\/platform\/organizations\/?$/ },
        { methods: ["GET"], path: /^\/platform\/organizations\/[^/]+\/?$/ },
        {
          methods: ["PATCH"],
          path: /^\/platform\/organizations\/[^/]+\/(?:status|subscription-plan|logo-url)\/?$/,
        },
      ],
    },
    {
      key: "rh-service",
      targetUrl: env.rhServiceUrl,
      auditTarget: "rh-service",
      routePrefixes: [...RH_SERVICE_PREFIXES],
      permissionModule: "rh",
    },
    {
      key: "user-service",
      targetUrl: env.userServiceUrl,
      auditTarget: "user-service",
      routePrefixes: [...USER_SERVICE_PREFIXES],
      internalServiceToken: env.userServiceInternalToken,
      forwardSessionBinding: true,
      forwardPlatformSessionCredentials: true,
      routeMatchers: [
        {
          methods: ["POST", "DELETE"],
          path: /^\/platform\/session\/?$/,
        },
        { methods: ["POST"], path: /^\/platform\/session\/refresh\/?$/ },
        { methods: ["GET"], path: /^\/platform\/me\/?$/ },
        {
          methods: ["GET"],
          path: /^\/platform\/organizations\/[^/]+\/(?:users\/[^/]+|departments)\/?$/,
        },
        {
          methods: ["GET"],
          path: /^\/platform\/organizations\/[^/]+\/users\/?$/,
        },
        {
          methods: ["DELETE"],
          path: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/?$/,
        },
        {
          methods: ["POST"],
          path: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/reactivate\/?$/,
        },
      ],
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
      internalServiceToken: env.clientServiceInternalToken,
    },
    {
      key: "regularize-service",
      targetUrl: env.regularizeServiceUrl,
      auditTarget: "regularize-service",
      routePrefixes: [...REGULARIZE_SERVICE_PREFIXES],
    },
    {
      key: "fiscal-service",
      targetUrl: env.fiscalServiceUrl,
      auditTarget: "fiscal-service",
      routePrefixes: [...FISCAL_SERVICE_PREFIXES],
      internalServiceToken: env.auditServiceToken,
      permissionModule: "fiscal",
    },
    {
      key: "contabil-service",
      targetUrl: env.contabilServiceUrl,
      auditTarget: "contabil-service",
      routePrefixes: [...CONTABIL_SERVICE_PREFIXES],
      internalServiceToken: env.auditServiceToken,
      permissionModule: "contabil",
    },
    {
      key: "ti-service",
      targetUrl: env.tiServiceUrl,
      auditTarget: "ti-service",
      routePrefixes: [...TI_SERVICE_PREFIXES],
      internalServiceToken: env.tiServiceInternalToken,
      permissionModule: "ti",
    },
    {
      key: "certificate-service",
      targetUrl: env.certificateServiceUrl,
      auditTarget: "certificate-service",
      routePrefixes: [...CERTIFICATE_SERVICE_PREFIXES],
      internalServiceToken: env.certificateServiceInternalToken,
      permissionModule: "certificado",
    },
    {
      key: "pessoal-service",
      targetUrl: env.pessoalServiceUrl,
      auditTarget: "pessoal-service",
      routePrefixes: [...PESSOAL_SERVICE_PREFIXES],
      permissionModule: "pessoal",
    },
    {
      key: "parcelamento-service",
      targetUrl: env.parcelamentoServiceUrl,
      auditTarget: "parcelamento-service",
      routePrefixes: [...PARCELAMENTO_SERVICE_PREFIXES],
      permissionModule: "parcelamento",
    },
    {
      key: "reports-service",
      targetUrl: env.reportsServiceUrl,
      auditTarget: "reports-service",
      routePrefixes: [...REPORTS_SERVICE_PREFIXES],
    },
    {
      key: "audit-service",
      targetUrl: env.auditServiceUrl,
      auditTarget: "audit-service",
      routePrefixes: ["/audit"],
      internalServiceToken: env.auditServiceToken,
      stripPathPrefix: "/platform",
      routeMatchers: [{ methods: ["GET"], path: /^\/platform\/audit\/requests\/?$/ }],
    },
  ];
}

export function resolveGatewayService(
  env: GatewayEnv,
  path: string,
  method?: string,
): GatewayServiceDefinition | null {
  const normalizedPath = normalizeGatewayPath(path)?.toLowerCase();
  if (!normalizedPath) {
    return null;
  }
  const normalizedMethod = method?.toUpperCase();
  const services = getGatewayServiceDefinitions(env);

  const matchedRoute = services.find((service) =>
    service.routeMatchers?.some(
      (matcher) =>
        (!normalizedMethod || matcher.methods.includes(normalizedMethod)) &&
        matcher.path.test(normalizedPath),
    ),
  );
  if (matchedRoute) {
    return matchedRoute;
  }

  return (
    services.find((service) =>
      service.routePrefixes.some((prefix) => matchesPrefix(normalizedPath, prefix)),
    ) ?? null
  );
}
