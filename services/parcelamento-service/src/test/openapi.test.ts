import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import type { ParcelamentoServiceEnv } from "../config/env.js";
import { buildParcelamentoServiceOpenApiSpec } from "../openapi/spec.js";

function createEnv(): ParcelamentoServiceEnv {
  return {
    port: 3043,
    nodeEnv: "test",
    databaseUrl: "postgresql://user:pass@localhost:5432/db",
    jwtSecret: "test-jwt-secret",
    auditEnabled: true,
    auditServiceUrl: "http://localhost:3020",
    auditServiceToken: "test-audit-token",
    logLevel: "silent",
    logPretty: false,
    allowedOrigins: ["*"],
    enableApiDocs: true,
  };
}

describe("parcelamento-service OpenAPI", () => {
  const protectedPaths = [
    "/parcelamento/installments",
    "/parcelamento/installments/{id}",
    "/parcelamento/installments/{installmentId}/competencies",
    "/parcelamento/installment-competencies/{id}",
    "/parcelamento/panoramas",
    "/parcelamento/panoramas/{id}",
    "/parcelamento/panoramas/competences/{competence}/generate",
  ];

  it("declara schemas referenciados por health e readiness", () => {
    const spec = buildParcelamentoServiceOpenApiSpec(createEnv());
    const schemaRefs = ["/health", "/ready"].map((path) => {
      const response = spec.paths[path]?.get?.responses["200"];

      return response && "content" in response
        ? response.content?.["application/json"]?.schema
        : undefined;
    });

    expect(schemaRefs).toEqual([
      { $ref: "#/components/schemas/SuccessEnvelope" },
      { $ref: "#/components/schemas/SuccessEnvelope" },
    ]);
    for (const schema of schemaRefs) {
      if (schema && "$ref" in schema && typeof schema.$ref === "string") {
        const schemaName = schema.$ref.replace("#/components/schemas/", "");
        expect(spec.components?.schemas).toHaveProperty(schemaName);
      }
    }
  });

  it("documenta todos os paths publicos do dominio", () => {
    const spec = buildParcelamentoServiceOpenApiSpec(createEnv());

    for (const path of protectedPaths) {
      expect(spec.paths).toHaveProperty(path);
    }
  });

  it("documenta paginacao nas listagens", () => {
    const spec = buildParcelamentoServiceOpenApiSpec(createEnv());
    const listOperations = [
      spec.paths["/parcelamento/installments"]?.get,
      spec.paths["/parcelamento/installments/{installmentId}/competencies"]?.get,
      spec.paths["/parcelamento/panoramas"]?.get,
    ];

    for (const operation of listOperations) {
      expect(operation?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "page", in: "query" }),
          expect.objectContaining({ name: "page_size", in: "query" }),
        ]),
      );
    }
  });

  it("protege operacoes de dominio com bearer auth", () => {
    const spec = buildParcelamentoServiceOpenApiSpec(createEnv());

    for (const path of protectedPaths) {
      const pathItem = spec.paths[path];
      for (const operation of Object.values(pathItem ?? {})) {
        expect(operation).toMatchObject({ security: [{ bearerAuth: [] }] });
      }
    }
  });

  it("declara schemas principais do contrato de dominio", () => {
    const spec = buildParcelamentoServiceOpenApiSpec(createEnv());

    expect(spec.components?.schemas).toEqual(
      expect.objectContaining({
        ParcelamentoInstallment: expect.any(Object),
        ParcelamentoInstallmentCreateRequest: expect.any(Object),
        ParcelamentoInstallmentPatchRequest: expect.any(Object),
        ParcelamentoInstallmentCompetency: expect.any(Object),
        ParcelamentoInstallmentCompetencyCreateRequest: expect.any(Object),
        ParcelamentoInstallmentCompetencyPatchRequest: expect.any(Object),
        ParcelamentoPanorama: expect.any(Object),
        ParcelamentoPanoramaCreateRequest: expect.any(Object),
        ParcelamentoPanoramaPatchRequest: expect.any(Object),
        ParcelamentoPage: expect.any(Object),
      }),
    );
  });

  it("referencia schemas de dominio nas respostas", () => {
    const spec = buildParcelamentoServiceOpenApiSpec(createEnv());
    const installmentListResponse = spec.paths["/parcelamento/installments"]?.get?.responses["200"];
    const installmentCreateResponse =
      spec.paths["/parcelamento/installments"]?.post?.responses["201"];
    const panoramaGenerateResponse =
      spec.paths["/parcelamento/panoramas/competences/{competence}/generate"]?.post?.responses[
        "200"
      ];

    expect(installmentListResponse).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: {
                allOf: [
                  { $ref: "#/components/schemas/ParcelamentoPage" },
                  {
                    properties: {
                      items: {
                        items: { $ref: "#/components/schemas/ParcelamentoInstallment" },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    });
    expect(installmentCreateResponse).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: { $ref: "#/components/schemas/ParcelamentoInstallment" },
            },
          },
        },
      },
    });
    expect(panoramaGenerateResponse).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: { $ref: "#/components/schemas/ParcelamentoPanoramaGenerateResult" },
            },
          },
        },
      },
    });
  });

  it("documenta campos retornados pelo installment dto", () => {
    const spec = buildParcelamentoServiceOpenApiSpec(createEnv());

    expect(spec.components?.schemas?.ParcelamentoInstallment).toMatchObject({
      properties: {
        down_payment_installments_count: expect.objectContaining({
          type: "integer",
        }),
      },
    });
  });
});
