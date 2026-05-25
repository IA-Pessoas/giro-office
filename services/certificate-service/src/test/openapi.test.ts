import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import { getCertificateServiceEnv } from "../config/env.js";
import { buildCertificateServiceOpenApiSpec } from "../openapi/spec.js";

const env = getCertificateServiceEnv();

function getSuccessDataSchemaRef(
  spec: ReturnType<typeof buildCertificateServiceOpenApiSpec>,
  path: string,
  method: "get" | "post" | "patch",
  status = "200",
) {
  const operation = spec.paths[path]?.[method] as
    | {
        responses?: Record<
          string,
          {
            content?: {
              "application/json"?: {
                schema?: {
                  allOf?: Array<{
                    properties?: {
                      data?: {
                        $ref?: string;
                        items?: { $ref?: string };
                      };
                    };
                  }>;
                };
              };
            };
          }
        >;
      }
    | undefined;

  return operation?.responses?.[status]?.content?.["application/json"]?.schema?.allOf?.find(
    (entry) => entry.properties?.data,
  )?.properties?.data;
}

describe("certificate-service OpenAPI", () => {
  it("documents the public certificate and notification paths", () => {
    const spec = buildCertificateServiceOpenApiSpec(env);

    expect(spec.paths).toHaveProperty("/certificate/pj/list");
    expect(spec.paths).toHaveProperty("/certificate/pj/{id}");
    expect(spec.paths).toHaveProperty("/certificate/pf/list");
    expect(spec.paths).toHaveProperty("/certificate/pf/{id}");
    expect(spec.paths).toHaveProperty("/certificate/notifications");

    expect(spec.paths["/certificate/pj/list"].get?.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths["/certificate/pj/{id}"].get?.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths["/certificate/pf/list"].get?.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths["/certificate/pf/{id}"].get?.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths["/certificate/notifications"].get?.security).toEqual([{ bearerAuth: [] }]);
  });

  it("documents the internal notification run endpoint as internal-only", () => {
    const spec = buildCertificateServiceOpenApiSpec(env);
    const operation = spec.paths["/internal/notifications/run"].post;

    expect(operation?.["x-internal"]).toBe(true);
    expect(operation?.security).toEqual([{ internalToken: [] }]);
    expect(operation?.requestBody).toMatchObject({
      required: false,
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: false,
          },
        },
      },
    });
  });

  it("exposes domain schemas and typed success envelopes", () => {
    const spec = buildCertificateServiceOpenApiSpec(env);

    expect(spec.components?.schemas).toEqual(
      expect.objectContaining({
        SuccessEnvelope: expect.any(Object),
        ErrorEnvelope: expect.any(Object),
        CertificatePj: expect.any(Object),
        CertificatePf: expect.any(Object),
        CertificatePjInput: expect.any(Object),
        CertificatePfInput: expect.any(Object),
        CertificateNotification: expect.any(Object),
        CertificateNotificationRunResult: expect.any(Object),
      }),
    );

    expect(getSuccessDataSchemaRef(spec, "/certificate/pj/list", "get")).toMatchObject({
      type: "array",
      items: { $ref: "#/components/schemas/CertificatePj" },
    });
    expect(getSuccessDataSchemaRef(spec, "/certificate/pj/{id}", "get")).toEqual({
      $ref: "#/components/schemas/CertificatePj",
    });
    expect(getSuccessDataSchemaRef(spec, "/certificate/pf/list", "get")).toMatchObject({
      type: "array",
      items: { $ref: "#/components/schemas/CertificatePf" },
    });
    expect(getSuccessDataSchemaRef(spec, "/certificate/pf/{id}", "get")).toEqual({
      $ref: "#/components/schemas/CertificatePf",
    });
    expect(getSuccessDataSchemaRef(spec, "/certificate/notifications", "get")).toMatchObject({
      type: "array",
      items: { $ref: "#/components/schemas/CertificateNotification" },
    });
    expect(getSuccessDataSchemaRef(spec, "/internal/notifications/run", "post")).toEqual({
      $ref: "#/components/schemas/CertificateNotificationRunResult",
    });
  });
});
