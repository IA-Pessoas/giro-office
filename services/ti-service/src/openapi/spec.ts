type OpenApiDocument = Record<string, unknown> & {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, unknown>;
};

interface TiServiceOpenApiEnv {
  port: number;
}

type OpenApiSchema = Record<string, unknown>;
type OpenApiParameter = Record<string, unknown>;
type OpenApiResponse = Record<string, unknown>;
type OpenApiOperation = Record<string, unknown>;

const jsonEnvelopeContent = {
  "application/json": {
    schema: { $ref: "#/components/schemas/SuccessEnvelope" },
  },
};

const jsonErrorContent = {
  "application/json": {
    schema: { $ref: "#/components/schemas/ErrorEnvelope" },
  },
};

const errorDescriptions: Record<number, string> = {
  400: "Requisicao invalida",
  401: "Autenticacao obrigatoria",
  403: "Permissao insuficiente",
  404: "Recurso nao encontrado",
  409: "Conflito de dominio",
  413: "Arquivo excede o limite permitido",
  500: "Falha ao armazenar imagem",
};

function successResponse(description: string, schema?: OpenApiSchema): OpenApiResponse {
  if (!schema) {
    return {
      description,
      content: jsonEnvelopeContent,
    };
  }

  return {
    description,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function errorResponse(status: number): OpenApiResponse {
  return {
    description: errorDescriptions[status] ?? "Erro",
    content: jsonErrorContent,
  };
}

function errorResponses(statuses: number[]): Record<string, OpenApiResponse> {
  return Object.fromEntries(statuses.map((status) => [String(status), errorResponse(status)]));
}

function pathIdParameter(description: string): OpenApiParameter {
  return {
    in: "path",
    name: "id",
    description,
    schema: { type: "string", format: "uuid" },
    required: true,
  };
}

function uuidQueryParameter(name: string, description: string): OpenApiParameter {
  return {
    in: "query",
    name,
    description,
    schema: { type: "string", format: "uuid" },
    required: false,
  };
}

function stringQueryParameter(name: string, description: string): OpenApiParameter {
  return {
    in: "query",
    name,
    description,
    schema: { type: "string" },
    required: false,
  };
}

function enumQueryParameter(name: string, description: string, values: string[]): OpenApiParameter {
  return {
    in: "query",
    name,
    description,
    schema: { type: "string", enum: values },
    required: false,
  };
}

function dateTimeQueryParameter(name: string, description: string): OpenApiParameter {
  return {
    in: "query",
    name,
    description,
    schema: { type: "string", format: "date-time" },
    required: false,
  };
}

function paginationParameters(): OpenApiParameter[] {
  return [
    {
      in: "query",
      name: "page",
      description: "Pagina da listagem",
      schema: { type: "integer", minimum: 1, default: 1 },
      required: false,
    },
    {
      in: "query",
      name: "page_size",
      description: "Quantidade de itens por pagina",
      schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      required: false,
    },
  ];
}

function jsonRequestBody(schemaRef: string): Record<string, unknown> {
  return {
    required: true,
    content: {
      "application/json": {
        schema: { $ref: schemaRef },
      },
    },
  };
}

function tiMessageRequestBody(): Record<string, unknown> {
  return {
    required: true,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/TiMessageInput" },
      },
      "multipart/form-data": {
        schema: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string", minLength: 1 },
            type: {
              type: "string",
              enum: ["Message", "Solution", "Rejection", "Acceptance"],
            },
            file: {
              type: "string",
              format: "binary",
              description: "Imagem JPEG, PNG ou WebP de ate 5 MiB.",
            },
          },
          additionalProperties: false,
        },
        encoding: {
          file: {
            contentType: "image/jpeg, image/png, image/webp",
          },
        },
      },
    },
  };
}

function publicTiOperation({
  operationId,
  tags,
  summary,
  parameters,
  requestBody,
  successStatus = 200,
  successSchema,
  successDescription,
  errors,
}: {
  operationId: string;
  tags: string[];
  summary: string;
  parameters?: OpenApiParameter[];
  requestBody?: Record<string, unknown>;
  successStatus?: 200 | 201;
  successSchema?: OpenApiSchema;
  successDescription: string;
  errors: number[];
}): OpenApiOperation {
  return {
    operationId,
    tags,
    summary,
    security: [{ bearerAuth: [] }],
    ...(parameters ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses: {
      [String(successStatus)]: successResponse(successDescription, successSchema),
      ...errorResponses(errors),
    },
  };
}

const tiTermSuccessSchema: OpenApiSchema = {
  type: "object",
  required: ["success", "data"],
  properties: {
    success: { type: "boolean", enum: [true] },
    data: { $ref: "#/components/schemas/TiTerm" },
  },
  additionalProperties: true,
};

const tiTermListSuccessSchema: OpenApiSchema = {
  type: "object",
  required: ["success", "data"],
  properties: {
    success: { type: "boolean", enum: [true] },
    data: {
      type: "array",
      items: { $ref: "#/components/schemas/TiTerm" },
    },
  },
  additionalProperties: true,
};

const urgencyValues = ["Low", "Medium", "High", "Critical"];
const requestStatusValues = ["New", "In_Progress", "Waiting", "Resolved", "Closed"];

const schemas: Record<string, OpenApiSchema> = {
  SuccessEnvelope: {
    type: "object",
    description: "Resposta de sucesso padrao do workspace",
    additionalProperties: true,
  },
  ErrorEnvelope: {
    type: "object",
    description: "Resposta de erro padrao do workspace",
    required: ["success", "error", "code"],
    properties: {
      success: { type: "boolean", enum: [false] },
      error: { type: "string" },
      code: { type: "string" },
      requestId: { type: "string" },
    },
    additionalProperties: true,
  },
  ReportingGrantV1: {
    type: "object",
    additionalProperties: false,
    required: [
      "version",
      "audience",
      "operation",
      "source",
      "organization_id",
      "fields",
      "request_id",
      "issued_at",
      "expires_at",
      "body_sha256",
    ],
    properties: {
      version: { type: "integer", enum: [1] },
      audience: { type: "string", enum: ["ti-service"] },
      operation: { type: "string", enum: ["catalog", "extract"] },
      source: { type: "string" },
      organization_id: { type: "string", format: "uuid" },
      fields: { type: "array", uniqueItems: true, items: { type: "string" } },
      request_id: { type: "string" },
      issued_at: { type: "integer", minimum: 0 },
      expires_at: { type: "integer", minimum: 0 },
      body_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    },
  },
  TiInventoryInput: {
    type: "object",
    required: ["asset_code", "category_id"],
    properties: {
      asset_code: { type: "string", minLength: 1 },
      category_id: { type: "string", format: "uuid" },
      location_id: { type: "string", format: "uuid" },
      user_id: { type: "string", format: "uuid" },
      responsible_it_staff_id: { type: "string", format: "uuid" },
      notes: { type: "string" },
      delivery_date: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  },
  TiInventoryUpdateInput: {
    type: "object",
    minProperties: 1,
    properties: {
      asset_code: { type: "string", minLength: 1 },
      category_id: { type: "string", format: "uuid" },
      location_id: { type: "string", format: "uuid" },
      user_id: { type: "string", format: "uuid" },
      responsible_it_staff_id: { type: "string", format: "uuid" },
      notes: { type: "string" },
      delivery_date: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  },
  TiInventoryAssignInput: {
    type: "object",
    required: ["user_id"],
    properties: {
      user_id: { type: "string", format: "uuid" },
      delivery_date: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  },
  TiInventoryReturnInput: {
    type: "object",
    properties: {
      return_date: { type: "string", format: "date-time" },
      notes: { type: "string" },
    },
    additionalProperties: false,
  },
  TiInventoryCategoryInput: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
      tag: { type: "string" },
    },
    additionalProperties: false,
  },
  TiInventoryCategoryUpdateInput: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1 },
      tag: { type: "string" },
      active: { type: "boolean" },
    },
    additionalProperties: false,
  },
  TiInventoryLocationInput: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
  TiInventoryLocationUpdateInput: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1 },
      active: { type: "boolean" },
    },
    additionalProperties: false,
  },
  TiRequestInput: {
    type: "object",
    required: ["title", "description", "category_id"],
    properties: {
      title: { type: "string", minLength: 1 },
      description: { type: "string", minLength: 1 },
      category_id: { type: "string", format: "uuid" },
      requester_id: { type: "string", format: "uuid" },
      assigned_to_id: { type: "string", format: "uuid" },
      urgency: {
        type: "string",
        enum: urgencyValues,
        default: "Medium",
      },
      attachment: { type: "string", format: "uri" },
    },
    additionalProperties: false,
  },
  TiRequestUpdateInput: {
    type: "object",
    minProperties: 1,
    properties: {
      title: { type: "string", minLength: 1 },
      description: { type: "string", minLength: 1 },
      category_id: { type: "string", format: "uuid" },
      urgency: { type: "string", enum: urgencyValues },
      attachment: { type: "string", format: "uri" },
    },
    additionalProperties: false,
  },
  TiRequestAssignInput: {
    type: "object",
    required: ["assigned_to_id"],
    properties: {
      assigned_to_id: { type: "string", format: "uuid" },
    },
    additionalProperties: false,
  },
  TiTransferCandidate: {
    type: "object",
    required: ["id", "department_id"],
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string", nullable: true },
      full_name: { type: "string", nullable: true },
      department_id: { type: "string", format: "uuid" },
    },
    additionalProperties: false,
  },
  TiRequestStatusInput: {
    type: "object",
    required: ["status"],
    properties: {
      status: {
        type: "string",
        enum: requestStatusValues,
      },
    },
    additionalProperties: false,
  },
  TiMessageInput: {
    type: "object",
    required: ["message"],
    properties: {
      message: { type: "string", minLength: 1 },
      type: {
        type: "string",
        enum: ["Message", "Solution", "Rejection", "Acceptance"],
        default: "Message",
      },
    },
    additionalProperties: false,
  },
  TiRequestCategoryInput: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
  TiRequestCategoryUpdateInput: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1 },
      active: { type: "boolean" },
    },
    additionalProperties: false,
  },
  TiPasswordInput: {
    type: "object",
    required: ["local", "user_id", "password"],
    properties: {
      local: { type: "string", minLength: 1 },
      user_id: { type: "string", format: "uuid" },
      password: { type: "string", minLength: 1 },
      notes: { type: "string" },
    },
    additionalProperties: false,
  },
  TiPasswordUpdateInput: {
    type: "object",
    minProperties: 1,
    properties: {
      local: { type: "string", minLength: 1 },
      user_id: { type: "string", format: "uuid" },
      password: { type: "string", minLength: 1 },
      notes: { type: "string" },
    },
    additionalProperties: false,
  },
  TiPasswordDeactivateInput: {
    type: "object",
    required: ["reason"],
    properties: {
      reason: { type: "string", minLength: 1, maxLength: 500 },
    },
    additionalProperties: false,
  },
  TiExtensionInput: {
    type: "object",
    required: ["user_id", "number"],
    properties: {
      user_id: { type: "string", format: "uuid" },
      number: {
        type: "string",
        minLength: 4,
        maxLength: 4,
        pattern: "^[0-9]{4}$",
        example: "1001",
      },
    },
    additionalProperties: false,
  },
  TiExtensionUpdateInput: {
    type: "object",
    minProperties: 1,
    properties: {
      user_id: { type: "string", format: "uuid" },
      number: {
        type: "string",
        minLength: 4,
        maxLength: 4,
        pattern: "^[0-9]{4}$",
        example: "1001",
      },
    },
    additionalProperties: false,
  },
  TiTermInput: {
    type: "object",
    required: ["date", "user_id"],
    properties: {
      date: { type: "string", format: "date-time" },
      user_id: { type: "string", format: "uuid" },
      department_id: { type: "string", format: "uuid" },
      address: { type: "string" },
      reason: { type: "string" },
      equipament_list: { type: "string" },
      brand: { type: "string" },
      asset_code: { type: "string" },
      imei: { type: "string" },
    },
    additionalProperties: false,
  },
  TiTermUpdateInput: {
    type: "object",
    minProperties: 1,
    properties: {
      date: { type: "string", format: "date-time" },
      department_id: { type: "string", format: "uuid" },
      address: { type: "string" },
      reason: { type: "string" },
      equipament_list: { type: "string" },
      brand: { type: "string" },
      asset_code: { type: "string" },
      imei: { type: "string" },
    },
    additionalProperties: false,
  },
  TiTermSignInput: {
    type: "object",
    properties: {
      reason: { type: "string" },
    },
    additionalProperties: false,
  },
  TiTerm: {
    type: "object",
    required: ["id", "status", "signed_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      date: { type: "string", format: "date-time" },
      user_id: { type: "string", format: "uuid", nullable: true },
      user_name: { type: "string" },
      user_cpf: { type: "string" },
      department_id: { type: "string", format: "uuid", nullable: true },
      address: { type: "string", nullable: true },
      reason: { type: "string", nullable: true },
      signed_at: { type: "string", format: "date-time", nullable: true },
      equipament_list: { type: "string", nullable: true },
      brand: { type: "string", nullable: true },
      asset_code: { type: "string", nullable: true },
      imei: { type: "string", nullable: true },
      status: { type: "string", enum: ["pending", "signed"] },
    },
    additionalProperties: true,
  },
  TiStockItemInput: {
    type: "object",
    required: ["name", "category_id", "location_id", "quantity"],
    properties: {
      name: { type: "string", minLength: 1 },
      category_id: { type: "string", format: "uuid" },
      location_id: { type: "string", format: "uuid" },
      quantity: { type: "integer", minimum: 0 },
      description: { type: "string" },
    },
    additionalProperties: false,
  },
  TiStockItemUpdateInput: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1 },
      category_id: { type: "string", format: "uuid" },
      location_id: { type: "string", format: "uuid" },
      description: { type: "string" },
      status: { type: "boolean" },
    },
    additionalProperties: false,
  },
  TiStockEntryInput: {
    type: "object",
    required: ["quantity"],
    properties: {
      quantity: { type: "integer", minimum: 1 },
      entry_date: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  },
  TiStockExitInput: {
    type: "object",
    required: ["quantity", "requester_id"],
    properties: {
      quantity: { type: "integer", minimum: 1 },
      destination: { type: "string" },
      requester_id: { type: "string", format: "uuid" },
      approver_id: { type: "string", format: "uuid" },
      operator_id: { type: "string", format: "uuid" },
      location_destination_id: { type: "string", format: "uuid" },
      exit_date: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  },
  TiStockMovement: {
    type: "object",
    required: [
      "id",
      "type",
      "quantity",
      "created_at",
      "item_id",
      "requester_id",
      "requester_name",
      "approver_id",
      "approver_name",
      "operator_id",
      "operator_name",
      "destination",
      "location_destination_id",
      "location_destination_name",
      "balance_before",
      "balance_after",
    ],
    properties: {
      id: { type: "string", format: "uuid" },
      type: { type: "string", enum: ["entry", "exit"] },
      quantity: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      item_id: { type: "string", format: "uuid" },
      requester_id: { type: "string", format: "uuid", nullable: true },
      requester_name: { type: "string", nullable: true },
      approver_id: { type: "string", format: "uuid", nullable: true },
      approver_name: { type: "string", nullable: true },
      operator_id: { type: "string", format: "uuid", nullable: true },
      operator_name: { type: "string", nullable: true },
      destination: { type: "string", nullable: true },
      location_destination_id: { type: "string", format: "uuid", nullable: true },
      location_destination_name: { type: "string", nullable: true },
      balance_before: { type: "integer", nullable: true },
      balance_after: { type: "integer", nullable: true },
    },
    additionalProperties: false,
  },
  TiStockCategoryInput: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
  TiStockCategoryUpdateInput: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1 },
      status: { type: "boolean" },
    },
    additionalProperties: false,
  },
  TiStockLocationInput: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
      floor: { type: "integer" },
    },
    additionalProperties: false,
  },
  TiStockLocationUpdateInput: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1 },
      floor: { type: "integer", nullable: true },
      status: { type: "boolean" },
    },
    additionalProperties: false,
  },
  TiRobotInput: {
    type: "object",
    required: ["name", "type"],
    properties: {
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      type: {
        type: "string",
        enum: ["Backup", "Relatorio", "Integracao", "Manutencao", "Monitoramento"],
      },
      schedule: { type: "string" },
      status: {
        type: "string",
        enum: ["active", "inactive", "running", "failed"],
        default: "active",
      },
      active: { type: "boolean", default: true },
    },
    additionalProperties: false,
  },
  TiRobotUpdateInput: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1 },
      description: { type: "string", nullable: true },
      type: {
        type: "string",
        enum: ["Backup", "Relatorio", "Integracao", "Manutencao", "Monitoramento"],
      },
      schedule: { type: "string", nullable: true },
      status: {
        type: "string",
        enum: ["active", "inactive", "running", "failed"],
      },
      active: { type: "boolean" },
    },
    additionalProperties: false,
  },
  TiRobotRunInput: {
    type: "object",
    required: ["status"],
    properties: {
      status: {
        type: "string",
        enum: ["success", "failed", "running", "cancelled"],
      },
      finished_at: { type: "string", format: "date-time" },
      message: { type: "string" },
      metadata_json: { type: "object", additionalProperties: true },
    },
    additionalProperties: false,
  },
  TiDashboardSummary: {
    oneOf: [
      {
        type: "object",
        required: [
          "scope",
          "openRequests",
          "criticalRequests",
          "resolvedLastSevenDays",
          "closedRequests",
        ],
        properties: {
          scope: { type: "string", enum: ["self"] },
          openRequests: { type: "integer", minimum: 0 },
          criticalRequests: { type: "integer", minimum: 0 },
          resolvedLastSevenDays: { type: "integer", minimum: 0 },
          closedRequests: { type: "integer", minimum: 0 },
        },
        additionalProperties: false,
      },
      {
        type: "object",
        required: [
          "scope",
          "openRequests",
          "criticalRequests",
          "resolvedLastSevenDays",
          "closedRequests",
          "inventoryAssets",
          "assignedInventoryAssets",
          "pendingTerms",
          "lowStockItems",
          "activeRobots",
        ],
        properties: {
          scope: { type: "string", enum: ["organization"] },
          openRequests: { type: "integer", minimum: 0 },
          criticalRequests: { type: "integer", minimum: 0 },
          resolvedLastSevenDays: { type: "integer", minimum: 0 },
          closedRequests: { type: "integer", minimum: 0 },
          inventoryAssets: { type: "integer", minimum: 0 },
          assignedInventoryAssets: { type: "integer", minimum: 0 },
          pendingTerms: { type: "integer", minimum: 0 },
          lowStockItems: { type: "integer", minimum: 0 },
          activeRobots: { type: "integer", minimum: 0 },
        },
        additionalProperties: false,
      },
    ],
  },
};

export function buildTiServiceOpenApiSpec(env?: TiServiceOpenApiEnv): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "ti-service",
      version: "1.0.0",
      description: "Servico de Tecnologia da Informacao.",
    },
    servers: [{ url: `http://localhost:${env?.port ?? 3040}` }],
    tags: [
      { name: "Health", description: "Saude do servico" },
      { name: "TI Inventory", description: "Inventario de TI" },
      { name: "TI Inventory Categories", description: "Categorias de inventario de TI" },
      { name: "TI Inventory Locations", description: "Locais de inventario de TI" },
      { name: "TI Requests", description: "Chamados e mensagens de TI" },
      { name: "TI Request Categories", description: "Categorias de chamados de TI" },
      { name: "TI Passwords", description: "Senhas de TI" },
      { name: "TI Extensions", description: "Ramais de TI" },
      { name: "TI Terms", description: "Termos de responsabilidade de TI" },
      { name: "TI Stock", description: "Estoque de TI filtrado pelo departamento Tecnologia" },
      { name: "TI Robots", description: "Robos e historico de execucao de TI" },
      { name: "TI Dashboard", description: "Resumo consolidado do modulo de TI" },
      { name: "InternalReporting", description: "Fonte interna governada para relatórios" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        internalServiceToken: {
          type: "apiKey",
          in: "header",
          name: "x-internal-service-token",
        },
      },
      schemas,
    },
    paths: {
      "/health": {
        get: {
          operationId: "getTiServiceHealth",
          tags: ["Health"],
          summary: "Health check",
          responses: {
            "200": successResponse("Servico disponivel"),
          },
        },
      },
      "/ready": {
        get: {
          operationId: "getTiServiceReadiness",
          tags: ["Health"],
          summary: "Readiness",
          responses: {
            "200": successResponse("Servico pronto"),
          },
        },
      },
      "/internal/reporting/catalog": {
        get: {
          operationId: "getTiReportingCatalog",
          tags: ["InternalReporting"],
          summary: "Consultar catálogo interno de estoque de TI",
          security: [{ internalServiceToken: [] }],
          parameters: [
            {
              name: "x-internal-service-token",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
            { name: "x-request-id", in: "header", required: true, schema: { type: "string" } },
            { name: "x-reports-grant", in: "header", required: true, schema: { type: "string" } },
            {
              name: "x-reports-grant-signature",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": successResponse("Catálogo governado"),
            "403": errorResponse(403),
          },
        },
      },
      "/internal/reporting/extract": {
        post: {
          operationId: "extractTiReportingStock",
          tags: ["InternalReporting"],
          summary: "Extrair campos governados do estoque de TI",
          security: [{ internalServiceToken: [] }],
          parameters: [
            {
              name: "x-internal-service-token",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
            { name: "x-request-id", in: "header", required: true, schema: { type: "string" } },
            { name: "x-reports-grant", in: "header", required: true, schema: { type: "string" } },
            {
              name: "x-reports-grant-signature",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["source", "fields", "limit"],
                  additionalProperties: false,
                  properties: {
                    source: { type: "string", enum: ["ti.stock"] },
                    fields: {
                      type: "array",
                      minItems: 1,
                      maxItems: 25,
                      uniqueItems: true,
                      items: { type: "string" },
                    },
                    limit: { type: "integer", minimum: 1, maximum: 101 },
                  },
                },
              },
            },
          },
          responses: {
            "200": successResponse("Dados governados"),
            "400": errorResponse(400),
            "403": errorResponse(403),
          },
        },
      },
      "/ti/stock": {
        get: publicTiOperation({
          operationId: "getTiStockReport",
          tags: ["TI Stock"],
          summary: "Lista o estoque de TI para relatórios públicos autorizados",
          parameters: [
            uuidQueryParameter("category_id", "Filtra pela categoria de estoque"),
            uuidQueryParameter("location_id", "Filtra pelo local de estoque"),
            stringQueryParameter("name", "Filtra pelo nome do item"),
            enumQueryParameter("status", "Filtra pelo status", ["true", "false"]),
            ...paginationParameters(),
          ],
          successDescription: "Estoque de TI listado",
          errors: [400, 401, 403],
        }),
      },
      "/ti/dashboard": {
        get: publicTiOperation({
          operationId: "getTiDashboardSummary",
          tags: ["TI Dashboard"],
          summary: "Busca resumo consolidado do modulo de TI",
          successSchema: {
            type: "object",
            required: ["success", "data"],
            properties: {
              success: { type: "boolean", enum: [true] },
              data: { $ref: "#/components/schemas/TiDashboardSummary" },
            },
            additionalProperties: true,
          },
          successDescription: "Resumo do dashboard de TI",
          errors: [401, 403],
        }),
      },
      "/ti/inventory/list": {
        get: publicTiOperation({
          operationId: "listTiInventory",
          tags: ["TI Inventory"],
          summary: "Lista ativos de inventario de TI",
          parameters: [
            uuidQueryParameter("category_id", "Categoria do ativo"),
            uuidQueryParameter("location_id", "Local do ativo"),
            uuidQueryParameter("user_id", "Usuario vinculado ao ativo"),
            stringQueryParameter("asset_code", "Codigo patrimonial"),
            enumQueryParameter("status", "Disponibilidade do ativo", ["available", "assigned"]),
            ...paginationParameters(),
          ],
          successDescription: "Ativos listados",
          errors: [400, 401, 403],
        }),
      },
      "/ti/inventory": {
        post: publicTiOperation({
          operationId: "createTiInventory",
          tags: ["TI Inventory"],
          summary: "Cria ativo de inventario de TI",
          requestBody: jsonRequestBody("#/components/schemas/TiInventoryInput"),
          successStatus: 201,
          successDescription: "Ativo criado",
          errors: [400, 401, 403, 404, 409],
        }),
      },
      "/ti/inventory/{id}": {
        get: publicTiOperation({
          operationId: "getTiInventory",
          tags: ["TI Inventory"],
          summary: "Busca ativo de inventario de TI",
          parameters: [pathIdParameter("Ativo de inventario de TI")],
          successDescription: "Ativo encontrado",
          errors: [400, 401, 403, 404],
        }),
        patch: publicTiOperation({
          operationId: "updateTiInventory",
          tags: ["TI Inventory"],
          summary: "Atualiza ativo de inventario de TI",
          parameters: [pathIdParameter("Ativo de inventario de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiInventoryUpdateInput"),
          successDescription: "Ativo atualizado",
          errors: [400, 401, 403, 404, 409],
        }),
      },
      "/ti/inventory/{id}/assign-user": {
        patch: publicTiOperation({
          operationId: "assignTiInventoryUser",
          tags: ["TI Inventory"],
          summary: "Atribui usuario ao ativo de inventario de TI",
          parameters: [pathIdParameter("Ativo de inventario de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiInventoryAssignInput"),
          successDescription: "Ativo atribuido",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/inventory/{id}/return": {
        patch: publicTiOperation({
          operationId: "returnTiInventory",
          tags: ["TI Inventory"],
          summary: "Registra devolucao de ativo de inventario de TI",
          parameters: [pathIdParameter("Ativo de inventario de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiInventoryReturnInput"),
          successDescription: "Devolucao registrada",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/inventory-categories/list": {
        get: publicTiOperation({
          operationId: "listTiInventoryCategories",
          tags: ["TI Inventory Categories"],
          summary: "Lista categorias de inventario de TI",
          successDescription: "Categorias listadas",
          errors: [401, 403],
        }),
      },
      "/ti/inventory-categories": {
        post: publicTiOperation({
          operationId: "createTiInventoryCategory",
          tags: ["TI Inventory Categories"],
          summary: "Cria categoria de inventario de TI",
          requestBody: jsonRequestBody("#/components/schemas/TiInventoryCategoryInput"),
          successStatus: 201,
          successDescription: "Categoria criada",
          errors: [400, 401, 403, 409],
        }),
      },
      "/ti/inventory-categories/{id}": {
        patch: publicTiOperation({
          operationId: "updateTiInventoryCategory",
          tags: ["TI Inventory Categories"],
          summary: "Atualiza categoria de inventario de TI",
          parameters: [pathIdParameter("Categoria de inventario de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiInventoryCategoryUpdateInput"),
          successDescription: "Categoria atualizada",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/inventory-locations/list": {
        get: publicTiOperation({
          operationId: "listTiInventoryLocations",
          tags: ["TI Inventory Locations"],
          summary: "Lista locais de inventario de TI",
          successDescription: "Locais listados",
          errors: [401, 403],
        }),
      },
      "/ti/inventory-locations": {
        post: publicTiOperation({
          operationId: "createTiInventoryLocation",
          tags: ["TI Inventory Locations"],
          summary: "Cria local de inventario de TI",
          requestBody: jsonRequestBody("#/components/schemas/TiInventoryLocationInput"),
          successStatus: 201,
          successDescription: "Local criado",
          errors: [400, 401, 403, 409],
        }),
      },
      "/ti/inventory-locations/{id}": {
        patch: publicTiOperation({
          operationId: "updateTiInventoryLocation",
          tags: ["TI Inventory Locations"],
          summary: "Atualiza local de inventario de TI",
          parameters: [pathIdParameter("Local de inventario de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiInventoryLocationUpdateInput"),
          successDescription: "Local atualizado",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/stock/items/list": {
        get: publicTiOperation({
          operationId: "listTiStockItems",
          tags: ["TI Stock"],
          summary: "Lista itens de estoque de TI",
          parameters: [
            uuidQueryParameter("category_id", "Categoria do item"),
            uuidQueryParameter("location_id", "Local do item"),
            stringQueryParameter("name", "Nome do item"),
            enumQueryParameter("status", "Filtro de item ativo", ["true", "false"]),
            ...paginationParameters(),
          ],
          successSchema: {
            type: "object",
            required: ["success", "data"],
            properties: {
              success: { type: "boolean", enum: [true] },
              data: {
                type: "object",
                required: ["data", "total", "page", "limit", "hasMore"],
                properties: {
                  data: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                  total: { type: "integer", minimum: 0 },
                  page: { type: "integer", minimum: 1 },
                  limit: { type: "integer", minimum: 1 },
                  hasMore: { type: "boolean" },
                },
                additionalProperties: false,
              },
            },
            additionalProperties: true,
          },
          successDescription: "Itens de estoque listados",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/stock/items": {
        post: publicTiOperation({
          operationId: "createTiStockItem",
          tags: ["TI Stock"],
          summary: "Cria item de estoque de TI",
          requestBody: jsonRequestBody("#/components/schemas/TiStockItemInput"),
          successStatus: 201,
          successDescription: "Item de estoque criado",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/stock/items/{id}": {
        get: publicTiOperation({
          operationId: "getTiStockItem",
          tags: ["TI Stock"],
          summary: "Busca item de estoque de TI",
          parameters: [pathIdParameter("Item de estoque de TI")],
          successDescription: "Item de estoque encontrado",
          errors: [400, 401, 403, 404],
        }),
        patch: publicTiOperation({
          operationId: "updateTiStockItem",
          tags: ["TI Stock"],
          summary: "Atualiza item de estoque de TI",
          parameters: [pathIdParameter("Item de estoque de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiStockItemUpdateInput"),
          successDescription: "Item de estoque atualizado",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/stock/items/{id}/movements/list": {
        get: publicTiOperation({
          operationId: "listTiStockItemMovements",
          tags: ["TI Stock"],
          summary: "Lista historico consolidado de movimentacoes do item de estoque de TI",
          parameters: [pathIdParameter("Item de estoque de TI")],
          successSchema: {
            type: "object",
            required: ["success", "data"],
            properties: {
              success: { type: "boolean", enum: [true] },
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/TiStockMovement" },
              },
            },
            additionalProperties: true,
          },
          successDescription: "Movimentacoes de estoque listadas",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/stock/items/{id}/entries": {
        post: publicTiOperation({
          operationId: "createTiStockEntry",
          tags: ["TI Stock"],
          summary: "Registra entrada de estoque de TI",
          parameters: [pathIdParameter("Item de estoque de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiStockEntryInput"),
          successStatus: 201,
          successDescription: "Entrada de estoque registrada",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/stock/items/{id}/exits": {
        post: publicTiOperation({
          operationId: "createTiStockExit",
          tags: ["TI Stock"],
          summary: "Registra saida de estoque de TI",
          parameters: [pathIdParameter("Item de estoque de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiStockExitInput"),
          successStatus: 201,
          successDescription: "Saida de estoque registrada",
          errors: [400, 401, 403, 404, 409],
        }),
      },
      "/ti/stock/categories/list": {
        get: publicTiOperation({
          operationId: "listTiStockCategories",
          tags: ["TI Stock"],
          summary: "Lista categorias de estoque de TI",
          successDescription: "Categorias de estoque listadas",
          errors: [401, 403, 404],
        }),
      },
      "/ti/stock/categories": {
        post: publicTiOperation({
          operationId: "createTiStockCategory",
          tags: ["TI Stock"],
          summary: "Cria categoria de estoque de TI",
          requestBody: jsonRequestBody("#/components/schemas/TiStockCategoryInput"),
          successStatus: 201,
          successDescription: "Categoria de estoque criada",
          errors: [400, 401, 403, 404, 409],
        }),
      },
      "/ti/stock/categories/{id}": {
        patch: publicTiOperation({
          operationId: "updateTiStockCategory",
          tags: ["TI Stock"],
          summary: "Atualiza categoria de estoque de TI",
          parameters: [pathIdParameter("Categoria de estoque de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiStockCategoryUpdateInput"),
          successDescription: "Categoria de estoque atualizada",
          errors: [400, 401, 403, 404, 409],
        }),
      },
      "/ti/stock/locations/list": {
        get: publicTiOperation({
          operationId: "listTiStockLocations",
          tags: ["TI Stock"],
          summary: "Lista locais de estoque de TI",
          successDescription: "Locais de estoque listados",
          errors: [401, 403, 404],
        }),
      },
      "/ti/stock/locations": {
        post: publicTiOperation({
          operationId: "createTiStockLocation",
          tags: ["TI Stock"],
          summary: "Cria local de estoque de TI",
          requestBody: jsonRequestBody("#/components/schemas/TiStockLocationInput"),
          successStatus: 201,
          successDescription: "Local de estoque criado",
          errors: [400, 401, 403, 404, 409],
        }),
      },
      "/ti/stock/locations/{id}": {
        patch: publicTiOperation({
          operationId: "updateTiStockLocation",
          tags: ["TI Stock"],
          summary: "Atualiza local de estoque de TI",
          parameters: [pathIdParameter("Local de estoque de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiStockLocationUpdateInput"),
          successDescription: "Local de estoque atualizado",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/robots/list": {
        get: publicTiOperation({
          operationId: "listTiRobots",
          tags: ["TI Robots"],
          summary: "Lista robos de TI",
          parameters: [
            enumQueryParameter("type", "Tipo do robo", [
              "Backup",
              "Relatorio",
              "Integracao",
              "Manutencao",
              "Monitoramento",
            ]),
            enumQueryParameter("status", "Status do robo", [
              "active",
              "inactive",
              "running",
              "failed",
            ]),
            enumQueryParameter("active", "Filtro de robo ativo", ["true", "false"]),
            ...paginationParameters(),
          ],
          successDescription: "Robos listados",
          errors: [400, 401, 403],
        }),
      },
      "/ti/robots": {
        post: publicTiOperation({
          operationId: "createTiRobot",
          tags: ["TI Robots"],
          summary: "Cria robo de TI",
          requestBody: jsonRequestBody("#/components/schemas/TiRobotInput"),
          successStatus: 201,
          successDescription: "Robo criado",
          errors: [400, 401, 403],
        }),
      },
      "/ti/robots/{id}": {
        get: publicTiOperation({
          operationId: "getTiRobot",
          tags: ["TI Robots"],
          summary: "Busca robo de TI",
          parameters: [pathIdParameter("Robo de TI")],
          successDescription: "Robo encontrado",
          errors: [400, 401, 403, 404],
        }),
        patch: publicTiOperation({
          operationId: "updateTiRobot",
          tags: ["TI Robots"],
          summary: "Atualiza robo de TI",
          parameters: [pathIdParameter("Robo de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiRobotUpdateInput"),
          successDescription: "Robo atualizado",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/robots/{id}/runs": {
        post: publicTiOperation({
          operationId: "createTiRobotRun",
          tags: ["TI Robots"],
          summary: "Registra execucao de robo de TI",
          parameters: [pathIdParameter("Robo de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiRobotRunInput"),
          successStatus: 201,
          successDescription: "Execucao registrada",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/robots/{id}/runs/list": {
        get: publicTiOperation({
          operationId: "listTiRobotRuns",
          tags: ["TI Robots"],
          summary: "Lista execucoes de robo de TI",
          parameters: [
            pathIdParameter("Robo de TI"),
            enumQueryParameter("status", "Status da execucao", [
              "success",
              "failed",
              "running",
              "cancelled",
            ]),
            ...paginationParameters(),
          ],
          successDescription: "Execucoes listadas",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/requests/list": {
        get: publicTiOperation({
          operationId: "listTiRequests",
          tags: ["TI Requests"],
          summary: "Lista chamados de TI",
          parameters: [
            enumQueryParameter("status", "Status do chamado", requestStatusValues),
            enumQueryParameter("urgency", "Urgencia do chamado", urgencyValues),
            uuidQueryParameter("category_id", "Categoria do chamado"),
            uuidQueryParameter("requester_id", "Solicitante do chamado"),
            uuidQueryParameter("assigned_to_id", "Responsavel pelo chamado"),
            dateTimeQueryParameter("created_from", "Data inicial de criacao"),
            dateTimeQueryParameter("created_to", "Data final de criacao"),
            ...paginationParameters(),
          ],
          successDescription: "Chamados listados",
          errors: [400, 401, 403],
        }),
      },
      "/ti/requests": {
        post: publicTiOperation({
          operationId: "createTiRequest",
          tags: ["TI Requests"],
          summary: "Cria chamado de TI",
          requestBody: jsonRequestBody("#/components/schemas/TiRequestInput"),
          successStatus: 201,
          successDescription: "Chamado criado",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/requests/{id}": {
        get: publicTiOperation({
          operationId: "getTiRequest",
          tags: ["TI Requests"],
          summary: "Busca chamado de TI",
          parameters: [pathIdParameter("Chamado de TI")],
          successDescription: "Chamado encontrado",
          errors: [400, 401, 403, 404],
        }),
        patch: publicTiOperation({
          operationId: "updateTiRequest",
          tags: ["TI Requests"],
          summary: "Atualiza chamado de TI",
          parameters: [pathIdParameter("Chamado de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiRequestUpdateInput"),
          successDescription: "Chamado atualizado",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/requests/{id}/assign": {
        patch: publicTiOperation({
          operationId: "assignTiRequest",
          tags: ["TI Requests"],
          summary: "Atribui responsavel ao chamado de TI",
          parameters: [pathIdParameter("Chamado de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiRequestAssignInput"),
          successDescription: "Chamado atribuido",
          errors: [400, 401, 403, 404, 409],
        }),
      },
      "/ti/requests/{id}/transfer-candidates": {
        get: publicTiOperation({
          operationId: "listTiRequestTransferCandidates",
          tags: ["TI Requests"],
          summary:
            "Lista candidatos ativos do departamento Tecnologia para transferencia de um chamado",
          parameters: [pathIdParameter("Chamado de TI")],
          successSchema: {
            type: "object",
            required: ["success", "data"],
            properties: {
              success: { type: "boolean", enum: [true] },
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/TiTransferCandidate" },
              },
            },
            additionalProperties: true,
          },
          successDescription: "Candidatos permitidos para transferencia",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/requests/{id}/status": {
        patch: publicTiOperation({
          operationId: "updateTiRequestStatus",
          tags: ["TI Requests"],
          summary: "Atualiza status do chamado de TI",
          parameters: [pathIdParameter("Chamado de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiRequestStatusInput"),
          successDescription: "Status atualizado",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/requests/{id}/messages": {
        get: publicTiOperation({
          operationId: "listTiRequestMessages",
          tags: ["TI Requests"],
          summary: "Lista mensagens de um chamado de TI",
          parameters: [
            pathIdParameter("Chamado de TI"),
            dateTimeQueryParameter("created_from", "Data inicial de criacao"),
            dateTimeQueryParameter("created_to", "Data final de criacao"),
            ...paginationParameters(),
          ],
          successDescription: "Mensagens listadas",
          errors: [400, 401, 403, 404],
        }),
        post: publicTiOperation({
          operationId: "createTiRequestMessage",
          tags: ["TI Requests"],
          summary: "Cria mensagem em chamado de TI",
          parameters: [pathIdParameter("Chamado de TI")],
          requestBody: tiMessageRequestBody(),
          successStatus: 201,
          successDescription: "Mensagem criada",
          errors: [400, 401, 403, 404, 413, 500],
        }),
      },
      "/ti/request-categories/list": {
        get: publicTiOperation({
          operationId: "listTiRequestCategories",
          tags: ["TI Request Categories"],
          summary: "Lista categorias de chamados de TI",
          parameters: [
            enumQueryParameter("active", "Filtro de categoria ativa", ["true", "false"]),
          ],
          successDescription: "Categorias listadas",
          errors: [400, 401, 403],
        }),
      },
      "/ti/request-categories": {
        post: publicTiOperation({
          operationId: "createTiRequestCategory",
          tags: ["TI Request Categories"],
          summary: "Cria categoria de chamado de TI",
          requestBody: jsonRequestBody("#/components/schemas/TiRequestCategoryInput"),
          successStatus: 201,
          successDescription: "Categoria criada",
          errors: [400, 401, 403, 409],
        }),
      },
      "/ti/request-categories/{id}": {
        patch: publicTiOperation({
          operationId: "updateTiRequestCategory",
          tags: ["TI Request Categories"],
          summary: "Atualiza categoria de chamado de TI",
          parameters: [pathIdParameter("Categoria de chamado de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiRequestCategoryUpdateInput"),
          successDescription: "Categoria atualizada",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/passwords/list": {
        get: publicTiOperation({
          operationId: "listTiPasswords",
          tags: ["TI Passwords"],
          summary: "Lista senhas de TI",
          parameters: [
            uuidQueryParameter("user_id", "Usuario vinculado a senha"),
            stringQueryParameter("search", "Busca por local, usuario ou notas"),
            stringQueryParameter("local", "Filtro legado por local da senha"),
            {
              ...enumQueryParameter("status", "Filtro de status da credencial", [
                "active",
                "inactive",
                "all",
              ]),
              schema: {
                type: "string",
                enum: ["active", "inactive", "all"],
                default: "active",
              },
            },
            ...paginationParameters(),
          ],
          successDescription: "Senhas listadas",
          errors: [400, 401, 403],
        }),
      },
      "/ti/passwords": {
        post: publicTiOperation({
          operationId: "createTiPassword",
          tags: ["TI Passwords"],
          summary: "Cria senha de TI",
          requestBody: jsonRequestBody("#/components/schemas/TiPasswordInput"),
          successStatus: 201,
          successDescription: "Senha criada",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/passwords/{id}": {
        get: publicTiOperation({
          operationId: "getTiPassword",
          tags: ["TI Passwords"],
          summary: "Busca senha de TI",
          parameters: [pathIdParameter("Senha de TI")],
          successDescription: "Senha encontrada",
          errors: [400, 401, 403, 404, 409],
        }),
        patch: publicTiOperation({
          operationId: "updateTiPassword",
          tags: ["TI Passwords"],
          summary: "Atualiza senha de TI",
          parameters: [pathIdParameter("Senha de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiPasswordUpdateInput"),
          successDescription: "Senha atualizada",
          errors: [400, 401, 403, 404, 409],
        }),
      },
      "/ti/passwords/{id}/deactivate": {
        post: publicTiOperation({
          operationId: "deactivateTiPassword",
          tags: ["TI Passwords"],
          summary: "Inativa uma senha de TI",
          parameters: [pathIdParameter("Senha de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiPasswordDeactivateInput"),
          successDescription: "Senha de TI inativada",
          errors: [400, 401, 403, 404, 409],
        }),
      },
      "/ti/extensions/list": {
        get: publicTiOperation({
          operationId: "listTiExtensions",
          tags: ["TI Extensions"],
          summary: "Lista ramais de TI",
          parameters: [
            uuidQueryParameter("user_id", "Usuario vinculado ao ramal"),
            ...paginationParameters(),
          ],
          successDescription: "Ramais listados",
          errors: [400, 401, 403],
        }),
      },
      "/ti/extensions": {
        post: publicTiOperation({
          operationId: "createTiExtension",
          tags: ["TI Extensions"],
          summary: "Cria ramal de TI",
          requestBody: jsonRequestBody("#/components/schemas/TiExtensionInput"),
          successStatus: 201,
          successDescription: "Ramal criado",
          errors: [400, 401, 403, 404, 409],
        }),
      },
      "/ti/extensions/{id}": {
        get: publicTiOperation({
          operationId: "getTiExtension",
          tags: ["TI Extensions"],
          summary: "Busca ramal de TI",
          parameters: [pathIdParameter("Ramal de TI")],
          successDescription: "Ramal encontrado",
          errors: [400, 401, 403, 404],
        }),
        patch: publicTiOperation({
          operationId: "updateTiExtension",
          tags: ["TI Extensions"],
          summary: "Atualiza ramal de TI",
          parameters: [pathIdParameter("Ramal de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiExtensionUpdateInput"),
          successDescription: "Ramal atualizado",
          errors: [400, 401, 403, 404, 409],
        }),
      },
      "/ti/terms/list": {
        get: publicTiOperation({
          operationId: "listTiTerms",
          tags: ["TI Terms"],
          summary: "Lista termos de TI",
          parameters: [
            uuidQueryParameter("user_id", "Usuario vinculado ao termo"),
            enumQueryParameter("status", "Status do termo", ["pending", "signed"]),
            ...paginationParameters(),
          ],
          successSchema: tiTermListSuccessSchema,
          successDescription: "Termos listados",
          errors: [400, 401, 403],
        }),
      },
      "/ti/terms": {
        post: publicTiOperation({
          operationId: "createTiTerm",
          tags: ["TI Terms"],
          summary: "Cria termo de TI",
          requestBody: jsonRequestBody("#/components/schemas/TiTermInput"),
          successStatus: 201,
          successSchema: tiTermSuccessSchema,
          successDescription: "Termo criado",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/terms/{id}": {
        get: publicTiOperation({
          operationId: "getTiTerm",
          tags: ["TI Terms"],
          summary: "Busca termo de TI",
          parameters: [pathIdParameter("Termo de TI")],
          successSchema: tiTermSuccessSchema,
          successDescription: "Termo encontrado",
          errors: [400, 401, 403, 404],
        }),
        patch: publicTiOperation({
          operationId: "updateTiTerm",
          tags: ["TI Terms"],
          summary: "Atualiza termo de TI",
          parameters: [pathIdParameter("Termo de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiTermUpdateInput"),
          successSchema: tiTermSuccessSchema,
          successDescription: "Termo atualizado",
          errors: [400, 401, 403, 404],
        }),
      },
      "/ti/terms/{id}/sign": {
        patch: publicTiOperation({
          operationId: "signTiTerm",
          tags: ["TI Terms"],
          summary: "Assina termo de TI",
          parameters: [pathIdParameter("Termo de TI")],
          requestBody: jsonRequestBody("#/components/schemas/TiTermSignInput"),
          successSchema: tiTermSuccessSchema,
          successDescription: "Termo assinado",
          errors: [400, 401, 403, 404],
        }),
      },
    },
  };
}
