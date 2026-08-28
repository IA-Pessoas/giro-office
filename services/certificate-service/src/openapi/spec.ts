import type { OpenApiDocument } from "@workspace/shared/http";

import type { CertificateServiceEnv } from "../config/env.js";

const jsonErrorContent = {
  "application/json": {
    schema: { $ref: "#/components/schemas/ErrorEnvelope" },
  },
};

function successEnvelopeContent(dataSchema: Record<string, unknown>) {
  return {
    "application/json": {
      schema: {
        allOf: [
          { $ref: "#/components/schemas/SuccessEnvelope" },
          {
            type: "object",
            properties: {
              data: dataSchema,
            },
          },
        ],
      },
    },
  };
}

function successResponse(description: string, dataSchema: Record<string, unknown>) {
  return {
    description,
    content: successEnvelopeContent(dataSchema),
  };
}

function errorResponse(description: string) {
  return {
    description,
    content: jsonErrorContent,
  };
}

function certificatePjIdParameter() {
  return {
    in: "path",
    name: "id",
    description: "ID do certificado PJ",
    required: true,
    schema: { type: "string", format: "uuid" },
  };
}

function certificatePfIdParameter() {
  return {
    in: "path",
    name: "id",
    description: "ID do certificado PF",
    required: true,
    schema: { type: "string", format: "uuid" },
  };
}

const certificateFileUploadRequest = {
  required: true,
  content: {
    "multipart/form-data": {
      schema: {
        type: "object",
        required: ["file"],
        properties: {
          file: {
            type: "string",
            format: "binary",
            description: "Arquivo de certificado .pfx ou .p12.",
          },
        },
      },
    },
  },
};

const certificateFileDownloadResponse = {
  description: "Arquivo de certificado descriptografado.",
  headers: {
    "Cache-Control": {
      description: "Download protegido sem cache intermediario.",
      schema: { type: "string", example: "no-store" },
    },
    "Content-Disposition": {
      description: "Nome original do arquivo sanitizado para download.",
      schema: { type: "string", example: 'attachment; filename="certificado.pfx"' },
    },
  },
  content: {
    "application/octet-stream": {
      schema: { type: "string", format: "binary" },
    },
  },
};

function paginationQueryParameters() {
  return [
    {
      in: "query",
      name: "page",
      description: "Pagina da listagem, iniciando em 1",
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

function publicCertificateOperation({
  operationId,
  summary,
  tag,
  notFoundDescription,
  successStatus = 200,
  successDescription,
  successDataSchema,
  parameters,
  requestBody,
}: {
  operationId: string;
  summary: string;
  tag: "Certificate PJ" | "Certificate PF";
  notFoundDescription: string;
  successStatus?: 200 | 201;
  successDescription: string;
  successDataSchema: Record<string, unknown>;
  parameters?: Record<string, unknown>[];
  requestBody?: Record<string, unknown>;
}) {
  return {
    operationId,
    tags: [tag],
    summary,
    security: [{ bearerAuth: [] }],
    ...(parameters ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses: {
      [String(successStatus)]: successResponse(successDescription, successDataSchema),
      "400": errorResponse("Requisicao invalida"),
      "401": errorResponse("Autenticacao obrigatoria"),
      "403": errorResponse("Permissao insuficiente"),
      "404": errorResponse(notFoundDescription),
      "409": errorResponse("Conflito de dominio"),
      "500": errorResponse("Erro interno do servidor"),
    },
  };
}

function componentRef(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

function componentArrayRef(name: string) {
  return {
    type: "array",
    items: componentRef(name),
  };
}

function paginatedListSchema(name: string) {
  return {
    type: "object",
    properties: {
      items: componentArrayRef(name),
      total: { type: "integer", minimum: 0 },
      page: { type: "integer", minimum: 1 },
      page_size: { type: "integer", minimum: 1 },
      has_more: { type: "boolean" },
    },
    required: ["items", "total", "page", "page_size", "has_more"],
  };
}

function certificateFileUploadOperation({
  idParameter,
  operationIdSuffix,
  tag,
  typeLabel,
}: {
  idParameter: Record<string, unknown>;
  operationIdSuffix: "Pj" | "Pf";
  tag: "Certificate PJ" | "Certificate PF";
  typeLabel: "PJ" | "PF";
}) {
  return {
    operationId: `uploadCertificate${operationIdSuffix}File`,
    tags: [tag],
    summary: `Envia arquivo do certificado ${typeLabel}`,
    security: [{ bearerAuth: [] }],
    parameters: [idParameter],
    requestBody: certificateFileUploadRequest,
    responses: {
      "201": successResponse(
        `Arquivo do certificado ${typeLabel} enviado`,
        componentRef("CertificateFileMetadata"),
      ),
      "400": errorResponse("Arquivo de certificado invalido"),
      "401": errorResponse("Autenticacao obrigatoria"),
      "403": errorResponse("Permissao insuficiente"),
      "404": errorResponse(`Certificado ${typeLabel} nao encontrado`),
      "500": errorResponse("Erro interno"),
    },
  };
}

function certificateFileDownloadOperation({
  idParameter,
  operationIdSuffix,
  tag,
  typeLabel,
}: {
  idParameter: Record<string, unknown>;
  operationIdSuffix: "Pj" | "Pf";
  tag: "Certificate PJ" | "Certificate PF";
  typeLabel: "PJ" | "PF";
}) {
  return {
    operationId: `downloadCertificate${operationIdSuffix}File`,
    tags: [tag],
    summary: `Baixa arquivo do certificado ${typeLabel}`,
    security: [{ bearerAuth: [] }],
    parameters: [idParameter],
    responses: {
      "200": certificateFileDownloadResponse,
      "400": errorResponse("Requisicao invalida"),
      "401": errorResponse("Autenticacao obrigatoria"),
      "403": errorResponse("Permissao insuficiente"),
      "404": errorResponse(`Arquivo do certificado ${typeLabel} nao encontrado`),
      "500": errorResponse("Erro interno"),
    },
  };
}

function certificateFileDeleteOperation({
  idParameter,
  operationIdSuffix,
  tag,
  typeLabel,
}: {
  idParameter: Record<string, unknown>;
  operationIdSuffix: "Pj" | "Pf";
  tag: "Certificate PJ" | "Certificate PF";
  typeLabel: "PJ" | "PF";
}) {
  return {
    operationId: `deleteCertificate${operationIdSuffix}File`,
    tags: [tag],
    summary: `Remove arquivo do certificado ${typeLabel}`,
    security: [{ bearerAuth: [] }],
    parameters: [idParameter],
    responses: {
      "200": successResponse(
        `Arquivo do certificado ${typeLabel} removido`,
        componentRef("CertificateFileDeleteResult"),
      ),
      "400": errorResponse("Requisicao invalida"),
      "401": errorResponse("Autenticacao obrigatoria"),
      "403": errorResponse("Permissao insuficiente"),
      "404": errorResponse(`Arquivo do certificado ${typeLabel} nao encontrado`),
      "500": errorResponse("Erro interno"),
    },
  };
}

function certificateDeleteOperation({
  idParameter,
  operationIdSuffix,
  tag,
  typeLabel,
}: {
  idParameter: Record<string, unknown>;
  operationIdSuffix: "Pj" | "Pf";
  tag: "Certificate PJ" | "Certificate PF";
  typeLabel: "PJ" | "PF";
}) {
  return {
    operationId: `deleteCertificate${operationIdSuffix}`,
    tags: [tag],
    summary: `Exclui certificado ${typeLabel}`,
    security: [{ bearerAuth: [] }],
    parameters: [idParameter],
    responses: {
      "200": successResponse(
        `Certificado ${typeLabel} excluido`,
        componentRef("CertificateFileDeleteResult"),
      ),
      "400": errorResponse("Requisicao invalida"),
      "401": errorResponse("Autenticacao obrigatoria"),
      "403": errorResponse("Permissao insuficiente"),
      "404": errorResponse(`Certificado ${typeLabel} nao encontrado`),
      "500": errorResponse("Erro interno"),
    },
  };
}

function certificateNotificationListOperation() {
  return {
    operationId: "listCertificateNotifications",
    tags: ["Certificate Notification"],
    summary: "Lista notificacoes de certificados da organizacao autenticada",
    security: [{ bearerAuth: [] }],
    parameters: paginationQueryParameters(),
    responses: {
      "200": successResponse(
        "Notificacoes de certificados listadas",
        paginatedListSchema("CertificateNotification"),
      ),
      "400": errorResponse("Requisicao invalida"),
      "401": errorResponse("Autenticacao obrigatoria"),
      "403": errorResponse("Permissao insuficiente"),
    },
  };
}

function internalCertificateNotificationRunOperation() {
  return {
    operationId: "runCertificateNotificationReconciliation",
    tags: ["Internal"],
    summary: "Executa reconciliacao interna de notificacoes de certificados",
    "x-internal": true,
    security: [{ internalToken: [] }],
    requestBody: {
      required: false,
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: false,
          },
        },
      },
    },
    responses: {
      "200": successResponse(
        "Reconciliacao de notificacoes executada",
        componentRef("CertificateNotificationRunResult"),
      ),
      "400": errorResponse("Requisicao invalida"),
      "401": errorResponse("Autenticacao obrigatoria"),
    },
  };
}

function internalCertificateReportingParameters() {
  return [
    {
      in: "header",
      name: "x-request-id",
      required: true,
      schema: { type: "string", minLength: 1 },
    },
    {
      in: "header",
      name: "x-reports-grant",
      required: true,
      schema: { type: "string", minLength: 1 },
    },
    {
      in: "header",
      name: "x-reports-grant-signature",
      required: true,
      schema: { type: "string", pattern: "^[a-f0-9]{64}$" },
    },
  ];
}

function internalCertificateReportingCatalogOperation() {
  return {
    operationId: "getCertificateReportingCatalog",
    tags: ["Internal"],
    summary: "Publica os catálogos internos de Certificados PF e PJ para relatórios",
    "x-internal": true,
    security: [{ internalToken: [] }],
    parameters: internalCertificateReportingParameters(),
    responses: {
      "200": successResponse("Catálogos internos de Certificados PF e PJ", {
        type: "object",
        additionalProperties: true,
      }),
      "403": errorResponse("Acesso interno ou grant inválido"),
    },
  };
}

function internalCertificateReportingExtractOperation() {
  return {
    operationId: "extractCertificateReportingData",
    tags: ["Internal"],
    summary: "Extrai campos publicados de Certificados PF e PJ para relatórios",
    "x-internal": true,
    security: [{ internalToken: [] }],
    parameters: internalCertificateReportingParameters(),
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["source", "fields", "limit"],
            properties: {
              source: { type: "string", enum: ["certificado.pf", "certificado.pj"] },
              fields: { type: "array", minItems: 1, maxItems: 25, items: { type: "string" } },
              limit: { type: "integer", minimum: 1, maximum: 101 },
            },
          },
        },
      },
    },
    responses: {
      "200": successResponse("Dados internos de Certificados PF ou PJ", {
        type: "object",
        required: ["rows", "reachedLimit"],
        properties: {
          rows: { type: "array", items: { type: "object", additionalProperties: true } },
          reachedLimit: { type: "boolean" },
        },
      }),
      "400": errorResponse("Requisição inválida"),
      "403": errorResponse("Acesso interno, grant ou campo inválido"),
    },
  };
}

function certificatePjRequestBody(required = true) {
  return {
    required,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/CertificatePjInput" },
      },
    },
  };
}

function certificatePfRequestBody(required = true) {
  return {
    required,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/CertificatePfInput" },
      },
    },
  };
}

export function buildCertificateServiceOpenApiSpec(env: CertificateServiceEnv): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "certificate-service",
      version: "1.0.0",
      description: "API do microservico de certificados.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    paths: {
      "/health": {
        get: {
          operationId: "getCertificateServiceHealth",
          tags: ["Infra"],
          summary: "Health check do certificate-service",
          responses: {
            "200": {
              description: "Servico disponivel",
            },
          },
        },
      },
      "/ready": {
        get: {
          operationId: "getCertificateServiceReadiness",
          tags: ["Infra"],
          summary: "Readiness check do certificate-service",
          responses: {
            "200": {
              description: "Servico pronto",
            },
          },
        },
      },
      "/certificate/pj/list": {
        get: publicCertificateOperation({
          operationId: "listCertificatePj",
          tag: "Certificate PJ",
          summary: "Lista certificados PJ da organizacao autenticada",
          successDescription: "Certificados PJ listados",
          successDataSchema: paginatedListSchema("CertificatePj"),
          notFoundDescription: "Certificado PJ nao encontrado",
          parameters: [
            ...paginationQueryParameters(),
            {
              in: "query",
              name: "name",
              schema: { type: "string" },
              required: false,
            },
            {
              in: "query",
              name: "cnpj",
              schema: { type: "string" },
              required: false,
            },
            {
              in: "query",
              name: "has_certificate",
              schema: { type: "boolean" },
              required: false,
            },
            {
              in: "query",
              name: "was_paid",
              schema: { type: "boolean" },
              required: false,
            },
          ],
        }),
      },
      "/certificate/pj": {
        post: publicCertificateOperation({
          operationId: "createCertificatePj",
          tag: "Certificate PJ",
          summary: "Cria certificado PJ",
          successStatus: 201,
          successDescription: "Certificado PJ criado",
          successDataSchema: componentRef("CertificatePj"),
          notFoundDescription: "Certificado PJ nao encontrado",
          requestBody: certificatePjRequestBody(),
        }),
      },
      "/certificate/pj/{id}": {
        get: publicCertificateOperation({
          operationId: "getCertificatePj",
          tag: "Certificate PJ",
          summary: "Busca certificado PJ por ID",
          successDescription: "Certificado PJ encontrado",
          successDataSchema: componentRef("CertificatePj"),
          notFoundDescription: "Certificado PJ nao encontrado",
          parameters: [certificatePjIdParameter()],
        }),
        patch: publicCertificateOperation({
          operationId: "updateCertificatePj",
          tag: "Certificate PJ",
          summary: "Atualiza certificado PJ",
          successDescription: "Certificado PJ atualizado",
          successDataSchema: componentRef("CertificatePj"),
          notFoundDescription: "Certificado PJ nao encontrado",
          parameters: [certificatePjIdParameter()],
          requestBody: certificatePjRequestBody(false),
        }),
        delete: certificateDeleteOperation({
          idParameter: certificatePjIdParameter(),
          operationIdSuffix: "Pj",
          tag: "Certificate PJ",
          typeLabel: "PJ",
        }),
      },
      "/certificate/pj/{id}/file": {
        post: certificateFileUploadOperation({
          idParameter: certificatePjIdParameter(),
          operationIdSuffix: "Pj",
          tag: "Certificate PJ",
          typeLabel: "PJ",
        }),
        get: certificateFileDownloadOperation({
          idParameter: certificatePjIdParameter(),
          operationIdSuffix: "Pj",
          tag: "Certificate PJ",
          typeLabel: "PJ",
        }),
        delete: certificateFileDeleteOperation({
          idParameter: certificatePjIdParameter(),
          operationIdSuffix: "Pj",
          tag: "Certificate PJ",
          typeLabel: "PJ",
        }),
      },
      "/certificate/notifications": {
        get: certificateNotificationListOperation(),
      },
      "/certificate/pf/list": {
        get: publicCertificateOperation({
          operationId: "listCertificatePf",
          tag: "Certificate PF",
          summary: "Lista certificados PF da organizacao autenticada",
          successDescription: "Certificados PF listados",
          successDataSchema: paginatedListSchema("CertificatePf"),
          notFoundDescription: "Certificado PF nao encontrado",
          parameters: [
            ...paginationQueryParameters(),
            {
              in: "query",
              name: "search",
              schema: { type: "string" },
              required: false,
            },
            {
              in: "query",
              name: "cpf",
              schema: { type: "string" },
              required: false,
            },
            {
              in: "query",
              name: "enterprise",
              schema: { type: "string" },
              required: false,
            },
            {
              in: "query",
              name: "cnpj",
              schema: { type: "string" },
              required: false,
            },
            {
              in: "query",
              name: "has_certificate",
              schema: { type: "boolean" },
              required: false,
            },
            {
              in: "query",
              name: "was_paid",
              schema: { type: "boolean" },
              required: false,
            },
          ],
        }),
      },
      "/certificate/pf": {
        post: publicCertificateOperation({
          operationId: "createCertificatePf",
          tag: "Certificate PF",
          summary: "Cria certificado PF",
          successStatus: 201,
          successDescription: "Certificado PF criado",
          successDataSchema: componentRef("CertificatePf"),
          notFoundDescription: "Certificado PF nao encontrado",
          requestBody: certificatePfRequestBody(),
        }),
      },
      "/certificate/pf/{id}": {
        get: publicCertificateOperation({
          operationId: "getCertificatePf",
          tag: "Certificate PF",
          summary: "Busca certificado PF por ID",
          successDescription: "Certificado PF encontrado",
          successDataSchema: componentRef("CertificatePf"),
          notFoundDescription: "Certificado PF nao encontrado",
          parameters: [certificatePfIdParameter()],
        }),
        patch: publicCertificateOperation({
          operationId: "updateCertificatePf",
          tag: "Certificate PF",
          summary: "Atualiza certificado PF",
          successDescription: "Certificado PF atualizado",
          successDataSchema: componentRef("CertificatePf"),
          notFoundDescription: "Certificado PF nao encontrado",
          parameters: [certificatePfIdParameter()],
          requestBody: certificatePfRequestBody(false),
        }),
        delete: certificateDeleteOperation({
          idParameter: certificatePfIdParameter(),
          operationIdSuffix: "Pf",
          tag: "Certificate PF",
          typeLabel: "PF",
        }),
      },
      "/certificate/pf/{id}/file": {
        post: certificateFileUploadOperation({
          idParameter: certificatePfIdParameter(),
          operationIdSuffix: "Pf",
          tag: "Certificate PF",
          typeLabel: "PF",
        }),
        get: certificateFileDownloadOperation({
          idParameter: certificatePfIdParameter(),
          operationIdSuffix: "Pf",
          tag: "Certificate PF",
          typeLabel: "PF",
        }),
        delete: certificateFileDeleteOperation({
          idParameter: certificatePfIdParameter(),
          operationIdSuffix: "Pf",
          tag: "Certificate PF",
          typeLabel: "PF",
        }),
      },
      "/internal/notifications/run": {
        post: internalCertificateNotificationRunOperation(),
      },
      "/internal/reporting/catalog": {
        get: internalCertificateReportingCatalogOperation(),
      },
      "/internal/reporting/extract": {
        post: internalCertificateReportingExtractOperation(),
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        internalToken: {
          type: "apiKey",
          in: "header",
          name: "x-internal-service-token",
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          properties: {
            success: { type: "boolean", enum: [true] },
            data: {},
          },
          required: ["success", "data"],
        },
        ErrorEnvelope: {
          type: "object",
          properties: {
            success: { type: "boolean", enum: [false] },
            error: { type: "string" },
            code: { type: "string" },
            requestId: { type: "string" },
          },
          required: ["success", "error", "code"],
        },
        CertificatePj: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            client_castelo_status: { type: "boolean" },
            client_focus_status: { type: "boolean" },
            name: { type: "string" },
            cnpj: { type: "string" },
            responsible: { type: "string" },
            model: { type: "string" },
            legal_nature: { type: "string" },
            password: { type: "string", nullable: true },
            expiration_date: { type: "string", format: "date-time" },
            notes: { type: "string", nullable: true },
            was_paid: { type: "boolean" },
            payment_date: { type: "string", format: "date-time", nullable: true },
            payment_amount: { type: "number", nullable: true },
            contact_info: { type: "string", nullable: true },
            has_certificate: { type: "boolean" },
            organization_id: { type: "string", format: "uuid" },
          },
          required: [
            "id",
            "client_castelo_status",
            "client_focus_status",
            "name",
            "cnpj",
            "responsible",
            "model",
            "legal_nature",
            "expiration_date",
            "was_paid",
            "has_certificate",
            "organization_id",
          ],
        },
        CertificatePjInput: {
          type: "object",
          properties: {
            client_castelo_status: { type: "boolean" },
            client_focus_status: { type: "boolean" },
            name: { type: "string" },
            cnpj: { type: "string" },
            responsible: { type: "string" },
            model: { type: "string" },
            legal_nature: { type: "string" },
            password: { type: "string" },
            expiration_date: { type: "string", format: "date-time" },
            notes: { type: "string", nullable: true },
            was_paid: { type: "boolean" },
            payment_date: { type: "string", format: "date-time", nullable: true },
            payment_amount: { type: "number", nullable: true },
            contact_info: { type: "string", nullable: true },
          },
        },
        CertificatePf: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            client_castelo_status: { type: "boolean" },
            client_focus_status: { type: "boolean" },
            name: { type: "string" },
            cpf: { type: "string" },
            model: { type: "string" },
            password: { type: "string", nullable: true },
            expiration_date: { type: "string", format: "date-time" },
            notes: { type: "string", nullable: true },
            enterprise: { type: "string", nullable: true },
            cnpj: { type: "string", nullable: true },
            was_paid: { type: "boolean" },
            payment_date: { type: "string", format: "date-time", nullable: true },
            payment_amount: { type: "number", nullable: true },
            contact_info: { type: "string", nullable: true },
            has_certificate: { type: "boolean" },
            organization_id: { type: "string", format: "uuid" },
          },
          required: [
            "id",
            "client_castelo_status",
            "client_focus_status",
            "name",
            "cpf",
            "model",
            "expiration_date",
            "was_paid",
            "has_certificate",
            "organization_id",
          ],
        },
        CertificatePfInput: {
          type: "object",
          properties: {
            client_castelo_status: { type: "boolean" },
            client_focus_status: { type: "boolean" },
            name: { type: "string" },
            cpf: { type: "string" },
            model: { type: "string" },
            password: { type: "string" },
            expiration_date: { type: "string", format: "date-time" },
            notes: { type: "string", nullable: true },
            enterprise: { type: "string", nullable: true },
            cnpj: { type: "string", nullable: true },
            was_paid: { type: "boolean" },
            payment_date: { type: "string", format: "date-time", nullable: true },
            payment_amount: { type: "number", nullable: true },
            contact_info: { type: "string", nullable: true },
          },
        },
        CertificateFileMetadata: {
          type: "object",
          properties: {
            file_original_name: { type: "string" },
            file_mime_type: { type: "string" },
            file_size_bytes: { type: "integer", minimum: 1 },
            file_uploaded_at: { type: "string", format: "date-time" },
            file_uploaded_by_user_id: { type: "string", format: "uuid" },
            has_certificate: { type: "boolean", enum: [true] },
          },
          required: [
            "file_original_name",
            "file_mime_type",
            "file_size_bytes",
            "file_uploaded_at",
            "file_uploaded_by_user_id",
            "has_certificate",
          ],
        },
        CertificateFileDeleteResult: {
          type: "object",
          properties: {
            ok: { type: "boolean", enum: [true] },
          },
          required: ["ok"],
        },
        CertificateNotification: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            certificate_id: { type: "string", format: "uuid" },
            client_name: { type: "string" },
            type: { type: "string", enum: ["PJ", "PF"] },
            date: { type: "string", format: "date-time" },
            organization_id: { type: "string", format: "uuid" },
          },
          required: ["id", "certificate_id", "client_name", "type", "date", "organization_id"],
        },
        CertificateNotificationRunResult: {
          type: "object",
          properties: {
            evaluated: { type: "integer", minimum: 0 },
            created: { type: "integer", minimum: 0 },
            updated: { type: "integer", minimum: 0 },
          },
          required: ["evaluated", "created", "updated"],
        },
      },
    },
  };
}
