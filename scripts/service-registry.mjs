// Central service metadata for smoke, security audit, and codegen harnesses.
// Keep this file deterministic; use scripts/generate-service-harness.mjs for new services.

export const serviceRegistry = [
  {
    name: "gateway",
    packagePath: "services/gateway",
    defaultUrl: "http://localhost:3010",
    urlEnvKey: "GATEWAY_URL",
    openapiSpecPath: null,
    authModes: ["public", "bearer"],
    internalTokenEnvKey: null,
    prismaOutputPath: null,
  },
  {
    name: "audit-service",
    packagePath: "services/audit-service",
    defaultUrl: "http://localhost:3020",
    urlEnvKey: "AUDIT_SERVICE_URL",
    openapiSpecPath: "services/audit-service/src/openapi/spec.ts",
    authModes: ["public", "bearer", "internal-token"],
    internalTokenEnvKey: "AUDIT_SERVICE_TOKEN",
    prismaOutputPath: "services/audit-service/generated/prisma",
  },
  {
    name: "client-service",
    packagePath: "services/client-service",
    defaultUrl: "http://localhost:3035",
    urlEnvKey: "CLIENT_SERVICE_URL",
    openapiSpecPath: "services/client-service/src/openapi/spec.ts",
    authModes: ["public", "bearer", "admin-bearer", "internal-token"],
    internalTokenEnvKey: "CLIENT_SERVICE_INTERNAL_TOKEN",
    prismaOutputPath: "services/client-service/src/generated/prisma",
  },
  {
    name: "certificate-service",
    packagePath: "services/certificate-service",
    defaultUrl: "http://localhost:3041",
    urlEnvKey: "CERTIFICATE_SERVICE_URL",
    openapiSpecPath: "services/certificate-service/src/openapi/spec.ts",
    authModes: ["public", "bearer", "admin-bearer", "internal-token"],
    internalTokenEnvKey: "CERTIFICATE_SERVICE_INTERNAL_TOKEN",
    prismaOutputPath: "services/certificate-service/src/generated/prisma",
  },
  {
    name: "contabil-service",
    packagePath: "services/contabil-service",
    defaultUrl: "http://localhost:3038",
    urlEnvKey: "CONTABIL_SERVICE_URL",
    openapiSpecPath: "services/contabil-service/src/openapi/spec.ts",
    authModes: ["public", "bearer"],
    internalTokenEnvKey: null,
    prismaOutputPath: "services/contabil-service/src/generated/prisma",
  },
  {
    name: "department-service",
    packagePath: "services/department-service",
    defaultUrl: "http://localhost:3036",
    urlEnvKey: "DEPARTMENT_SERVICE_URL",
    openapiSpecPath: "services/department-service/src/openapi/spec.ts",
    authModes: ["public", "bearer"],
    internalTokenEnvKey: null,
    prismaOutputPath: "services/department-service/src/generated/prisma",
  },
  {
    name: "fiscal-service",
    packagePath: "services/fiscal-service",
    defaultUrl: "http://localhost:3037",
    urlEnvKey: "FISCAL_SERVICE_URL",
    openapiSpecPath: "services/fiscal-service/src/openapi/spec.ts",
    authModes: ["public", "bearer"],
    internalTokenEnvKey: null,
    prismaOutputPath: "services/fiscal-service/src/generated/prisma",
  },
  {
    name: "organization-service",
    packagePath: "services/organization-service",
    defaultUrl: "http://localhost:3031",
    urlEnvKey: "ORGANIZATION_SERVICE_URL",
    openapiSpecPath: "services/organization-service/src/openapi/spec.ts",
    authModes: ["public", "bearer"],
    internalTokenEnvKey: null,
    prismaOutputPath: "services/organization-service/src/generated/prisma",
  },
  {
    name: "project-service",
    packagePath: "services/project-service",
    defaultUrl: "http://localhost:3033",
    urlEnvKey: "PROJECT_SERVICE_URL",
    openapiSpecPath: "services/project-service/src/openapi/spec.ts",
    authModes: ["public", "bearer", "admin-bearer"],
    internalTokenEnvKey: null,
    prismaOutputPath: "services/project-service/src/generated/prisma",
  },
  {
    name: "regularize-service",
    packagePath: "services/regularize-service",
    defaultUrl: "http://localhost:3039",
    urlEnvKey: "REGULARIZE_SERVICE_URL",
    openapiSpecPath: "services/regularize-service/src/openapi/spec.ts",
    authModes: ["public", "bearer", "internal-token"],
    internalTokenEnvKey: "INTERNAL_SERVICE_TOKEN",
    prismaOutputPath: "services/regularize-service/src/generated/prisma",
  },
  {
    name: "rh-service",
    packagePath: "services/rh-service",
    defaultUrl: "http://localhost:3034",
    urlEnvKey: "RH_SERVICE_URL",
    openapiSpecPath: "services/rh-service/src/openapi/spec.ts",
    authModes: ["public", "bearer", "admin-bearer"],
    internalTokenEnvKey: null,
    prismaOutputPath: "services/rh-service/src/generated/prisma",
  },
  {
    name: "task-service",
    packagePath: "services/task-service",
    defaultUrl: "http://localhost:3032",
    urlEnvKey: "TASK_SERVICE_URL",
    openapiSpecPath: "services/task-service/src/openapi/spec.ts",
    authModes: ["public", "bearer", "admin-bearer"],
    internalTokenEnvKey: null,
    prismaOutputPath: "services/task-service/src/generated/prisma",
  },
  {
    name: "ti-service",
    packagePath: "services/ti-service",
    defaultUrl: "http://localhost:3040",
    urlEnvKey: "TI_SERVICE_URL",
    openapiSpecPath: "services/ti-service/src/openapi/spec.ts",
    authModes: ["public", "bearer", "admin-bearer", "internal-token"],
    internalTokenEnvKey: "TI_SERVICE_INTERNAL_TOKEN",
    prismaOutputPath: "services/ti-service/src/generated/prisma",
  },
  {
    name: "user-service",
    packagePath: "services/user-service",
    defaultUrl: "http://localhost:3030",
    urlEnvKey: "USER_SERVICE_URL",
    openapiSpecPath: "services/user-service/src/openapi/spec.ts",
    authModes: ["public", "bearer", "admin-bearer"],
    internalTokenEnvKey: null,
    prismaOutputPath: "services/user-service/src/generated/prisma",
  },
];

export function getServiceRegistryEntry(serviceName, registry = serviceRegistry) {
  return registry.find((service) => service.name === serviceName) ?? null;
}

export function getServiceUrlEnvKeys(registry = serviceRegistry) {
  return Object.fromEntries(
    registry
      .filter((service) => service.urlEnvKey)
      .map((service) => [service.name, service.urlEnvKey]),
  );
}

export function getServiceUrlDefaults(registry = serviceRegistry) {
  return Object.fromEntries(
    registry
      .filter((service) => service.defaultUrl)
      .map((service) => [service.name, service.defaultUrl]),
  );
}

export function getInternalServiceTokenEnvKeys(registry = serviceRegistry) {
  return Object.fromEntries(
    registry
      .filter((service) => service.internalTokenEnvKey)
      .map((service) => [service.name, service.internalTokenEnvKey]),
  );
}

export function getSmokeSpecFiles(registry = serviceRegistry) {
  return Object.fromEntries(
    registry
      .filter((service) => service.openapiSpecPath)
      .map((service) => [service.name, service.openapiSpecPath]),
  );
}

export function getPrismaOutputPaths(registry = serviceRegistry) {
  return registry
    .map((service) => service.prismaOutputPath)
    .filter((outputPath) => typeof outputPath === "string" && outputPath.length > 0);
}
