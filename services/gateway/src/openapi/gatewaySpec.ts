import type { OpenApiDocument } from "@workspace/shared/http";

import { buildAuditServiceOpenApiSpec } from "../../../audit-service/src/openapi/spec.js";
import { buildClientServiceOpenApiSpec } from "../../../client-service/src/openapi/spec.js";
import { buildContabilServiceOpenApiSpec } from "../../../contabil-service/src/openapi/spec.js";
import { buildDepartmentServiceOpenApiSpec } from "../../../department-service/src/openapi/spec.js";
import { buildFiscalServiceOpenApiSpec } from "../../../fiscal-service/src/openapi/spec.js";
import { buildOrganizationServiceOpenApiSpec } from "../../../organization-service/src/openapi/spec.js";
import { buildProjectServiceOpenApiSpec } from "../../../project-service/src/openapi/spec.js";
import { buildRegularizeServiceOpenApiSpec } from "../../../regularize-service/src/openapi/spec.js";
import { buildRhServiceOpenApiSpec } from "../../../rh-service/src/openapi/spec.js";
import { buildTaskServiceOpenApiSpec } from "../../../task-service/src/openapi/spec.js";
import { buildTiServiceOpenApiSpec } from "../../../ti-service/src/openapi/spec.js";
import { buildUserServiceOpenApiSpec } from "../../../user-service/src/openapi/spec.js";
import type { GatewayEnv } from "../config/env.js";

interface ServiceSpecDefinition {
  key: string;
  label: string;
  buildSpec: () => OpenApiDocument;
  includePath: (path: string) => boolean;
  isInternalPath?: (path: string) => boolean;
}

type JsonObject = Record<string, unknown>;
type OpenApiComponents = {
  schemas?: Record<string, unknown>;
  securitySchemes?: Record<string, unknown>;
};
type AggregatedOpenApiDocument = OpenApiDocument & {
  components?: OpenApiComponents;
  tags?: Array<Record<string, string>>;
  servers?: Array<{ url: string }>;
};

function cloneDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getPortFromUrl(url: string): number {
  const parsed = new URL(url);

  if (parsed.port) {
    return Number.parseInt(parsed.port, 10);
  }

  return parsed.protocol === "https:" ? 443 : 80;
}

function getMutableComponents(spec: AggregatedOpenApiDocument): OpenApiComponents {
  spec.components ??= {};
  return spec.components as OpenApiComponents;
}

function getServiceDefinitions(env: GatewayEnv): ServiceSpecDefinition[] {
  return [
    {
      key: "user-service",
      label: "User Service",
      buildSpec: () =>
        buildUserServiceOpenApiSpec({ port: getPortFromUrl(env.userServiceUrl) } as never),
      includePath: (path) => path !== "/health",
    },
    {
      key: "department-service",
      label: "Department Service",
      buildSpec: () =>
        buildDepartmentServiceOpenApiSpec({
          port: getPortFromUrl(env.departmentServiceUrl),
        } as never),
      includePath: (path) => path !== "/health",
    },
    {
      key: "task-service",
      label: "Task Service",
      buildSpec: () =>
        buildTaskServiceOpenApiSpec({ port: getPortFromUrl(env.taskServiceUrl) } as never),
      includePath: (path) => path !== "/health",
    },
    {
      key: "project-service",
      label: "Project Service",
      buildSpec: () =>
        buildProjectServiceOpenApiSpec({ port: getPortFromUrl(env.projectServiceUrl) } as never),
      includePath: (path) => path !== "/health",
    },
    {
      key: "client-service",
      label: "Client Service",
      buildSpec: () =>
        buildClientServiceOpenApiSpec({ port: getPortFromUrl(env.clientServiceUrl) } as never),
      includePath: (path) => path !== "/health" && path !== "/ready",
    },
    {
      key: "regularize-service",
      label: "Regularize Service",
      buildSpec: () =>
        buildRegularizeServiceOpenApiSpec({
          port: getPortFromUrl(env.regularizeServiceUrl),
        } as never),
      includePath: (path) => path !== "/health" && !path.startsWith("/internal/"),
      isInternalPath: (path) => path.startsWith("/internal/"),
    },
    {
      key: "organization-service",
      label: "Organization Service",
      buildSpec: () =>
        buildOrganizationServiceOpenApiSpec({
          port: getPortFromUrl(env.organizationServiceUrl),
        } as never),
      includePath: (path) => path !== "/health",
    },
    {
      key: "rh-service",
      label: "RH Service",
      buildSpec: () =>
        buildRhServiceOpenApiSpec({ port: getPortFromUrl(env.rhServiceUrl) } as never),
      includePath: (path) => path !== "/health",
    },
    {
      key: "fiscal-service",
      label: "Fiscal Service",
      buildSpec: () =>
        buildFiscalServiceOpenApiSpec({ port: getPortFromUrl(env.fiscalServiceUrl) } as never),
      includePath: (path) => path !== "/health",
    },
    {
      key: "contabil-service",
      label: "Contabil Service",
      buildSpec: () =>
        buildContabilServiceOpenApiSpec({ port: getPortFromUrl(env.contabilServiceUrl) } as never),
      includePath: (path) => path !== "/health",
    },
    {
      key: "ti-service",
      label: "TI Service",
      buildSpec: () =>
        buildTiServiceOpenApiSpec({ port: getPortFromUrl(env.tiServiceUrl) } as never),
      includePath: (path) => path !== "/health" && path !== "/ready",
    },
    {
      key: "audit-service",
      label: "Audit Service",
      buildSpec: () =>
        buildAuditServiceOpenApiSpec({
          auditServicePort: getPortFromUrl(env.auditServiceUrl),
        } as never),
      includePath: (path) => path !== "/health" && path !== "/ready",
      isInternalPath: (path) => path.startsWith("/internal/"),
    },
  ];
}

function prefixTag(serviceLabel: string, tag: string): string {
  return `${serviceLabel} / ${tag}`;
}

function transformSchemaRefs(value: unknown, schemaNameMap: Map<string, string>): unknown {
  if (typeof value === "string") {
    for (const [oldName, newName] of schemaNameMap.entries()) {
      if (value === `#/components/schemas/${oldName}`) {
        return `#/components/schemas/${newName}`;
      }
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => transformSchemaRefs(entry, schemaNameMap));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject).map(([key, entry]) => [
        key,
        transformSchemaRefs(entry, schemaNameMap),
      ]),
    );
  }

  return value;
}

function transformSecurity(
  value: unknown,
  securitySchemeNameMap: Map<string, string>,
): Array<Record<string, string[]>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(entry as Record<string, string[]>).map(([key, scopes]) => [
        securitySchemeNameMap.get(key) ?? key,
        scopes,
      ]),
    );
  });
}

function isGatewayVisibleSecurityScheme(name: string): boolean {
  return name !== "forwardedAuthUserId" && name !== "internalServiceToken";
}

function getGatewayOperationSecurity(
  path: string,
  definition: ServiceSpecDefinition,
  security: Array<Record<string, string[]>> | undefined,
): Array<Record<string, string[]>> | undefined {
  if (path === "/user/me") {
    return [{ bearerAuth: [] }];
  }

  if (definition.key === "audit-service" && !definition.isInternalPath?.(path)) {
    return [{ bearerAuth: [] }];
  }

  if (!security) {
    return undefined;
  }

  const filtered = security
    .map((entry) =>
      Object.fromEntries(
        Object.entries(entry).filter(([key]) => isGatewayVisibleSecurityScheme(key)),
      ),
    )
    .filter((entry) => Object.keys(entry).length > 0);

  return filtered.length > 0 ? filtered : undefined;
}

function mergeSecuritySchemes(
  aggregateSpec: AggregatedOpenApiDocument,
  spec: AggregatedOpenApiDocument,
  serviceKey: string,
): Map<string, string> {
  const securitySchemeNameMap = new Map<string, string>();
  const sourceSchemes = (spec.components?.securitySchemes ?? {}) as Record<string, unknown>;
  const aggregateComponents = getMutableComponents(aggregateSpec);
  if (!aggregateComponents.securitySchemes) {
    aggregateComponents.securitySchemes = {};
  }
  const targetSchemes = aggregateComponents.securitySchemes as Record<string, unknown>;

  for (const [name, definition] of Object.entries(sourceSchemes)) {
    if (!isGatewayVisibleSecurityScheme(name)) {
      continue;
    }

    const existing = targetSchemes[name];

    if (!existing) {
      targetSchemes[name] = definition;
      securitySchemeNameMap.set(name, name);
      continue;
    }

    if (JSON.stringify(existing) === JSON.stringify(definition)) {
      securitySchemeNameMap.set(name, name);
      continue;
    }

    const renamed = `${serviceKey}_${name}`;
    targetSchemes[renamed] = definition;
    securitySchemeNameMap.set(name, renamed);
  }

  return securitySchemeNameMap;
}

function mergeSchemas(
  aggregateSpec: AggregatedOpenApiDocument,
  spec: AggregatedOpenApiDocument,
  serviceKey: string,
): Map<string, string> {
  const schemaNameMap = new Map<string, string>();
  const sourceSchemas = (spec.components?.schemas ?? {}) as Record<string, unknown>;
  const aggregateComponents = getMutableComponents(aggregateSpec);
  if (!aggregateComponents.schemas) {
    aggregateComponents.schemas = {};
  }
  const targetSchemas = aggregateComponents.schemas as Record<string, unknown>;

  for (const [name, definition] of Object.entries(sourceSchemas)) {
    const existing = targetSchemas[name];

    if (!existing) {
      targetSchemas[name] = definition;
      schemaNameMap.set(name, name);
      continue;
    }

    if (JSON.stringify(existing) === JSON.stringify(definition)) {
      schemaNameMap.set(name, name);
      continue;
    }

    const renamed = `${serviceKey}_${name}`;
    targetSchemas[renamed] = transformSchemaRefs(definition, schemaNameMap);
    schemaNameMap.set(name, renamed);
  }

  return schemaNameMap;
}

function mergeTags(
  aggregateSpec: AggregatedOpenApiDocument,
  spec: AggregatedOpenApiDocument,
  serviceLabel: string,
  includePath: (path: string) => boolean,
): Map<string, string> {
  const usedTags = new Set<string>();

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!includePath(path) || !pathItem || typeof pathItem !== "object") {
      continue;
    }

    for (const operation of Object.values(pathItem as JsonObject)) {
      if (
        !operation ||
        typeof operation !== "object" ||
        !Array.isArray((operation as JsonObject).tags)
      ) {
        continue;
      }

      for (const tag of (operation as JsonObject).tags as string[]) {
        usedTags.add(tag);
      }
    }
  }

  const tagNameMap = new Map<string, string>();
  if (!aggregateSpec.tags) {
    aggregateSpec.tags = [];
  }
  const aggregateTags = aggregateSpec.tags as Array<Record<string, string>>;

  for (const tag of (spec.tags ?? []) as Array<Record<string, string>>) {
    const originalName = tag.name;
    if (!originalName || !usedTags.has(originalName)) {
      continue;
    }

    const prefixedName = prefixTag(serviceLabel, originalName);
    tagNameMap.set(originalName, prefixedName);

    if (aggregateTags.some((entry) => entry.name === prefixedName)) {
      continue;
    }

    aggregateTags.push({
      name: prefixedName,
      description: tag.description
        ? `${serviceLabel}: ${tag.description}`
        : `${serviceLabel} endpoints`,
    });
  }

  return tagNameMap;
}

function addGatewayPaths(aggregateSpec: AggregatedOpenApiDocument): void {
  aggregateSpec.paths["/health"] = {
    get: {
      tags: ["Gateway"],
      summary: "Gateway health check",
      responses: {
        "200": {
          description: "Gateway available",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SuccessEnvelope" },
            },
          },
        },
      },
    },
  };

  aggregateSpec.paths["/ready"] = {
    get: {
      tags: ["Gateway"],
      summary: "Gateway readiness check",
      responses: {
        "200": {
          description: "Gateway ready",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SuccessEnvelope" },
            },
          },
        },
      },
    },
  };
}

function mergeServicePaths(
  aggregateSpec: AggregatedOpenApiDocument,
  spec: AggregatedOpenApiDocument,
  definition: ServiceSpecDefinition,
  schemaNameMap: Map<string, string>,
  securitySchemeNameMap: Map<string, string>,
  tagNameMap: Map<string, string>,
): void {
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!definition.includePath(path) || !pathItem || typeof pathItem !== "object") {
      continue;
    }

    const transformedPathItem = transformSchemaRefs(pathItem, schemaNameMap) as JsonObject;
    const operations = Object.fromEntries(
      Object.entries(transformedPathItem).map(([method, operation]) => {
        if (!operation || typeof operation !== "object") {
          return [method, operation];
        }

        const operationRecord = { ...(operation as JsonObject) };
        const tags = Array.isArray(operationRecord.tags) ? (operationRecord.tags as string[]) : [];
        if (tags.length > 0) {
          operationRecord.tags = tags.map((tag) => tagNameMap.get(tag) ?? tag);
        }

        const transformedSecurity = transformSecurity(
          operationRecord.security,
          securitySchemeNameMap,
        );
        const gatewaySecurity = getGatewayOperationSecurity(path, definition, transformedSecurity);
        if (gatewaySecurity) {
          operationRecord.security = gatewaySecurity;
        } else {
          delete operationRecord.security;
        }

        operationRecord["x-origin-service"] = definition.key;

        if (definition.isInternalPath?.(path)) {
          operationRecord["x-internal"] = true;
          operationRecord.description = operationRecord.description
            ? `${String(operationRecord.description)}\n\nInternal endpoint.`
            : "Internal endpoint.";
        }

        return [method, operationRecord];
      }),
    );

    aggregateSpec.paths[path] = operations;
  }
}

export function buildGatewayOpenApiSpec(env: GatewayEnv): OpenApiDocument {
  const aggregateSpec: AggregatedOpenApiDocument = {
    openapi: "3.0.3",
    info: {
      title: "office-gateway",
      version: "1.0.0",
      description:
        "Gateway OpenAPI document aggregating user-service, task-service, project-service, client-service, regularize-service, organization-service, rh-service, fiscal-service, contabil-service, ti-service and audit-service. Paths marked with x-internal are intended for internal service-to-service usage.",
    },
    servers: [{ url: "http://localhost" }],
    tags: [
      {
        name: "Gateway",
        description: "Gateway operational endpoints",
      },
    ],
    components: {
      schemas: {
        SuccessEnvelope: {
          type: "object",
          description: "Resposta de sucesso padrão do workspace",
          additionalProperties: true,
        },
      },
      securitySchemes: {},
    },
    paths: {},
  };

  addGatewayPaths(aggregateSpec);

  for (const definition of getServiceDefinitions(env)) {
    const serviceSpec = cloneDocument(definition.buildSpec()) as AggregatedOpenApiDocument;
    const securitySchemeNameMap = mergeSecuritySchemes(aggregateSpec, serviceSpec, definition.key);
    const schemaNameMap = mergeSchemas(aggregateSpec, serviceSpec, definition.key);
    const tagNameMap = mergeTags(
      aggregateSpec,
      serviceSpec,
      definition.label,
      definition.includePath,
    );

    mergeServicePaths(
      aggregateSpec,
      serviceSpec,
      definition,
      schemaNameMap,
      securitySchemeNameMap,
      tagNameMap,
    );
  }

  return aggregateSpec;
}
