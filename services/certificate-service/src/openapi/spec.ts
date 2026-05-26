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
        componentArrayRef("CertificateNotification"),
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
          successDataSchema: componentArrayRef("CertificatePj"),
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
          successDataSchema: componentArrayRef("CertificatePf"),
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
      },
      "/internal/notifications/run": {
        post: internalCertificateNotificationRunOperation(),
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
            file_path: { type: "string", nullable: true },
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
            file_path: { type: "string", nullable: true },
            has_certificate: { type: "boolean" },
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
            file_path: { type: "string", nullable: true },
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
            file_path: { type: "string", nullable: true },
            has_certificate: { type: "boolean" },
          },
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
