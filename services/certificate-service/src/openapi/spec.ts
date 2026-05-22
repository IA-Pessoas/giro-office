import type { OpenApiDocument } from "@workspace/shared/http";

import type { CertificateServiceEnv } from "../config/env.js";

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

function successResponse(description: string) {
  return {
    description,
    content: jsonEnvelopeContent,
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

function publicCertificateOperation({
  operationId,
  summary,
  tag = "Certificate PJ",
  notFoundDescription = "Certificado PJ nao encontrado",
  successStatus = 200,
  successDescription,
  parameters,
  requestBody,
}: {
  operationId: string;
  summary: string;
  tag?: "Certificate PJ" | "Certificate PF";
  notFoundDescription?: string;
  successStatus?: 200 | 201;
  successDescription: string;
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
      [String(successStatus)]: successResponse(successDescription),
      "400": errorResponse("Requisicao invalida"),
      "401": errorResponse("Autenticacao obrigatoria"),
      "403": errorResponse("Permissao insuficiente"),
      "404": errorResponse(notFoundDescription),
      "409": errorResponse("Conflito de dominio"),
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
          summary: "Lista certificados PJ da organizacao autenticada",
          successDescription: "Certificados PJ listados",
          parameters: [
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
          summary: "Cria certificado PJ",
          successStatus: 201,
          successDescription: "Certificado PJ criado",
          requestBody: certificatePjRequestBody(),
        }),
      },
      "/certificate/pj/{id}": {
        get: publicCertificateOperation({
          operationId: "getCertificatePj",
          summary: "Busca certificado PJ por ID",
          successDescription: "Certificado PJ encontrado",
          parameters: [certificatePjIdParameter()],
        }),
        patch: publicCertificateOperation({
          operationId: "updateCertificatePj",
          summary: "Atualiza certificado PJ",
          successDescription: "Certificado PJ atualizado",
          parameters: [certificatePjIdParameter()],
          requestBody: certificatePjRequestBody(false),
        }),
      },
      "/certificate/pf/list": {
        get: publicCertificateOperation({
          operationId: "listCertificatePf",
          tag: "Certificate PF",
          summary: "Lista certificados PF da organizacao autenticada",
          successDescription: "Certificados PF listados",
          notFoundDescription: "Certificado PF nao encontrado",
          parameters: [
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
          notFoundDescription: "Certificado PF nao encontrado",
          parameters: [certificatePfIdParameter()],
        }),
        patch: publicCertificateOperation({
          operationId: "updateCertificatePf",
          tag: "Certificate PF",
          summary: "Atualiza certificado PF",
          successDescription: "Certificado PF atualizado",
          notFoundDescription: "Certificado PF nao encontrado",
          parameters: [certificatePfIdParameter()],
          requestBody: certificatePfRequestBody(false),
        }),
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
      },
    },
  };
}
