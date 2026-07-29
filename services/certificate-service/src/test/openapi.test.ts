import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import { getCertificateServiceEnv } from "../config/env.js";
import { buildCertificateServiceOpenApiSpec } from "../openapi/spec.js";

const env = getCertificateServiceEnv();

function getSuccessDataSchemaRef(
  spec: ReturnType<typeof buildCertificateServiceOpenApiSpec>,
  path: string,
  method: "delete" | "get" | "post" | "patch",
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

function getQueryParameterNames(
  spec: ReturnType<typeof buildCertificateServiceOpenApiSpec>,
  path: string,
): string[] {
  return (
    spec.paths[path]?.get?.parameters
      ?.filter((parameter) => parameter.in === "query")
      .map((parameter) => parameter.name) ?? []
  );
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
    expect(spec.paths["/certificate/pj/{id}"].delete).toBeDefined();
    expect(spec.paths["/certificate/pf/list"].get?.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths["/certificate/pf/{id}"].get?.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths["/certificate/pf/{id}"].delete).toBeDefined();
    expect(spec.paths["/certificate/notifications"].get?.security).toEqual([{ bearerAuth: [] }]);
  });

  it("documents pagination query parameters on list endpoints", () => {
    const spec = buildCertificateServiceOpenApiSpec(env);

    expect(getQueryParameterNames(spec, "/certificate/pj/list")).toEqual(
      expect.arrayContaining(["page", "page_size"]),
    );
    expect(getQueryParameterNames(spec, "/certificate/pf/list")).toEqual(
      expect.arrayContaining(["page", "page_size"]),
    );
    expect(getQueryParameterNames(spec, "/certificate/notifications")).toEqual(
      expect.arrayContaining(["page", "page_size"]),
    );
    expect(spec.paths["/certificate/notifications"].get?.responses).toHaveProperty("400");
  });

  it("documents certificate file upload, download and delete routes", () => {
    const spec = buildCertificateServiceOpenApiSpec(env);

    expect(spec.paths["/certificate/pj/{id}/file"]?.post).toBeDefined();
    expect(spec.paths["/certificate/pj/{id}/file"]?.get).toBeDefined();
    expect(spec.paths["/certificate/pj/{id}/file"]?.delete).toBeDefined();
    expect(spec.paths["/certificate/pf/{id}/file"]?.post).toBeDefined();
    expect(spec.paths["/certificate/pf/{id}/file"]?.get).toBeDefined();
    expect(spec.paths["/certificate/pf/{id}/file"]?.delete).toBeDefined();
    expect(spec.paths["/certificate/pj/{id}"]?.delete?.responses["500"]).toBeDefined();
    expect(spec.paths["/certificate/pf/{id}"]?.delete?.responses["500"]).toBeDefined();

    expect(spec.paths["/certificate/pj/{id}/file"]?.post?.requestBody?.content).toHaveProperty(
      "multipart/form-data",
    );
    expect(spec.paths["/certificate/pf/{id}/file"]?.post?.requestBody?.content).toHaveProperty(
      "multipart/form-data",
    );
    expect(spec.paths["/certificate/pj/{id}/file"]?.get?.responses["200"].content).toHaveProperty(
      "application/octet-stream",
    );
    expect(spec.paths["/certificate/pf/{id}/file"]?.get?.responses["200"].content).toHaveProperty(
      "application/octet-stream",
    );
    expect(spec.paths["/certificate/pj/{id}/file"]?.get?.responses["200"]).toHaveProperty(
      "headers.Cache-Control",
    );
    expect(spec.paths["/certificate/pf/{id}/file"]?.get?.responses["200"]).toHaveProperty(
      "headers.Cache-Control",
    );
    expect(getSuccessDataSchemaRef(spec, "/certificate/pj/{id}/file", "post", "201")).toEqual({
      $ref: "#/components/schemas/CertificateFileMetadata",
    });
    expect(getSuccessDataSchemaRef(spec, "/certificate/pf/{id}/file", "post", "201")).toEqual({
      $ref: "#/components/schemas/CertificateFileMetadata",
    });
    expect(getSuccessDataSchemaRef(spec, "/certificate/pj/{id}/file", "delete")).toEqual({
      $ref: "#/components/schemas/CertificateFileDeleteResult",
    });
    expect(getSuccessDataSchemaRef(spec, "/certificate/pf/{id}/file", "delete")).toEqual({
      $ref: "#/components/schemas/CertificateFileDeleteResult",
    });
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
    const certificatePjInput = spec.components?.schemas?.CertificatePjInput as
      | { properties?: Record<string, unknown> }
      | undefined;
    const certificatePfInput = spec.components?.schemas?.CertificatePfInput as
      | { properties?: Record<string, unknown> }
      | undefined;
    const certificateFileMetadata = spec.components?.schemas?.CertificateFileMetadata as
      | { properties?: Record<string, unknown> }
      | undefined;

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
    expect(certificatePjInput?.properties).not.toHaveProperty("file_path");
    expect(certificatePjInput?.properties).not.toHaveProperty("has_certificate");
    expect(certificatePfInput?.properties).not.toHaveProperty("file_path");
    expect(certificatePfInput?.properties).not.toHaveProperty("has_certificate");
    expect(certificateFileMetadata?.properties).not.toHaveProperty("file_path");
    expect(certificateFileMetadata?.properties).not.toHaveProperty("file_sha256");
    expect(certificateFileMetadata?.properties).not.toHaveProperty("file_storage_provider");
    expect(certificateFileMetadata?.properties).not.toHaveProperty("file_storage_bucket");

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
